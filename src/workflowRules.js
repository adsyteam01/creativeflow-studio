export const WORKFLOW_ROLES = {
  PRODUCTION: "production",
  EDITOR: "editor",
  BRAND_MANAGER: "brand_manager",
  SOCIAL_MEDIA_MANAGER: "social_media_manager",
};

export const ROLE_LABELS = {
  [WORKFLOW_ROLES.PRODUCTION]: "Team Produksi",
  [WORKFLOW_ROLES.EDITOR]: "Editor",
  [WORKFLOW_ROLES.BRAND_MANAGER]: "Brand Manager",
  [WORKFLOW_ROLES.SOCIAL_MEDIA_MANAGER]: "Sosial Media Manager",
};

export const ORDER_STATUSES = {
  QUEUE: "Antrean",
  IN_PROGRESS: "Sedang Dikerjakan",
  BM_CURATION: "Kurasi BM",
  REVISION: "Revisi",
  READY_TO_POST: "Siap Posting",
  POSTED: "Sudah Diposting",
};

const ROLE_ALIASES = {
  production: WORKFLOW_ROLES.PRODUCTION,
  prod: WORKFLOW_ROLES.PRODUCTION,
  produksi: WORKFLOW_ROLES.PRODUCTION,
  "team produksi": WORKFLOW_ROLES.PRODUCTION,
  tim_produksi: WORKFLOW_ROLES.PRODUCTION,
  "tim produksi": WORKFLOW_ROLES.PRODUCTION,
  editor: WORKFLOW_ROLES.EDITOR,
  video_editor: WORKFLOW_ROLES.EDITOR,
  "video editor": WORKFLOW_ROLES.EDITOR,
  brand_manager: WORKFLOW_ROLES.BRAND_MANAGER,
  "brand manager": WORKFLOW_ROLES.BRAND_MANAGER,
  bm: WORKFLOW_ROLES.BRAND_MANAGER,
  social_media_manager: WORKFLOW_ROLES.SOCIAL_MEDIA_MANAGER,
  "social media manager": WORKFLOW_ROLES.SOCIAL_MEDIA_MANAGER,
  "sosial media manager": WORKFLOW_ROLES.SOCIAL_MEDIA_MANAGER,
  smm: WORKFLOW_ROLES.SOCIAL_MEDIA_MANAGER,
  sosmed: WORKFLOW_ROLES.SOCIAL_MEDIA_MANAGER,
};

export function normalizeWorkflowRole(rawRole) {
  const key = String(rawRole || "").trim().toLowerCase();
  return ROLE_ALIASES[key] || WORKFLOW_ROLES.PRODUCTION;
}

export function getRoleLabel(rawRole) {
  return ROLE_LABELS[normalizeWorkflowRole(rawRole)] || "Team Produksi";
}

export function canViewAllTiktokAccounts(rawRole) {
  const role = normalizeWorkflowRole(rawRole);
  return role === WORKFLOW_ROLES.BRAND_MANAGER || role === WORKFLOW_ROLES.PRODUCTION;
}

export function canCreateTiktokAccount(rawRole) {
  return normalizeWorkflowRole(rawRole) === WORKFLOW_ROLES.BRAND_MANAGER;
}

export function canCreateOrder(rawRole) {
  const role = normalizeWorkflowRole(rawRole);
  return role === WORKFLOW_ROLES.PRODUCTION || role === WORKFLOW_ROLES.BRAND_MANAGER;
}

export function canAssignOrder(rawRole) {
  const role = normalizeWorkflowRole(rawRole);
  return (
    role === WORKFLOW_ROLES.PRODUCTION ||
    role === WORKFLOW_ROLES.EDITOR ||
    role === WORKFLOW_ROLES.BRAND_MANAGER
  );
}

export function canWorkOrSubmitVideo(rawRole) {
  return normalizeWorkflowRole(rawRole) === WORKFLOW_ROLES.EDITOR;
}

export function canCurateOrder(rawRole) {
  return normalizeWorkflowRole(rawRole) === WORKFLOW_ROLES.BRAND_MANAGER;
}

export function canMarkPosted(rawRole) {
  const role = normalizeWorkflowRole(rawRole);
  return role === WORKFLOW_ROLES.SOCIAL_MEDIA_MANAGER || role === WORKFLOW_ROLES.BRAND_MANAGER;
}

const ALLOWED_TRANSITIONS = {
  [ORDER_STATUSES.QUEUE]: [ORDER_STATUSES.IN_PROGRESS],
  [ORDER_STATUSES.IN_PROGRESS]: [ORDER_STATUSES.BM_CURATION],
  [ORDER_STATUSES.BM_CURATION]: [ORDER_STATUSES.REVISION, ORDER_STATUSES.READY_TO_POST],
  [ORDER_STATUSES.REVISION]: [ORDER_STATUSES.IN_PROGRESS, ORDER_STATUSES.BM_CURATION],
  [ORDER_STATUSES.READY_TO_POST]: [ORDER_STATUSES.POSTED],
  [ORDER_STATUSES.POSTED]: [],
};

export function validateOrderTransition({ actorRole, currentStatus, nextStatus, payload = {} }) {
  const role = normalizeWorkflowRole(actorRole);
  const from = String(currentStatus || ORDER_STATUSES.QUEUE).trim();
  const to = String(nextStatus || "").trim();
  if (!to) return { ok: false, reason: "Status tujuan belum ditentukan." };
  if (!(ALLOWED_TRANSITIONS[from] || []).includes(to)) {
    return { ok: false, reason: `Transisi status dari "${from}" ke "${to}" tidak diizinkan.` };
  }
  if (to === ORDER_STATUSES.IN_PROGRESS && !canAssignOrder(role) && !canWorkOrSubmitVideo(role)) {
    return { ok: false, reason: "Hanya Team Produksi, Editor, atau Brand Manager yang dapat memulai job." };
  }
  if (to === ORDER_STATUSES.BM_CURATION) {
    if (!canWorkOrSubmitVideo(role)) {
      return { ok: false, reason: "Hanya Editor yang dapat men-submit hasil video ke Kurasi BM." };
    }
    if (!String(payload.videoUrl || "").trim()) {
      return { ok: false, reason: "Link/file hasil video wajib diisi sebelum submit ke Kurasi BM." };
    }
  }
  if (to === ORDER_STATUSES.REVISION) {
    if (!canCurateOrder(role)) {
      return { ok: false, reason: "Hanya Brand Manager yang dapat meminta revisi hasil video." };
    }
    if (!String(payload.revisionNote || "").trim()) {
      return { ok: false, reason: "Catatan revisi dari Brand Manager wajib diisi." };
    }
  }
  if (to === ORDER_STATUSES.READY_TO_POST && !canCurateOrder(role)) {
    return { ok: false, reason: "Hanya Brand Manager yang dapat menetapkan status Siap Posting." };
  }
  if (to === ORDER_STATUSES.POSTED && !canMarkPosted(role)) {
    return { ok: false, reason: "Hanya Sosial Media Manager atau Brand Manager yang dapat menandai order sebagai Sudah Diposting." };
  }
  return { ok: true, role, from, to };
}
