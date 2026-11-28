import { ORDER_STATUSES, WORKFLOW_ROLES, normalizeWorkflowRole } from "./workflowRules.js";

const sentNotificationKeys = new Set();

// Notifikasi WA saat order mulai dikerjakan ("work_started" / "Sedang Dikerjakan") dimatikan
export const MUTE_WA_WHILE_IN_PROGRESS = true;

// Notifikasi WA saat order sudah diposting ("posted_completed") dimatikan
export const MUTE_WA_WHEN_POSTED = true;

export const ALLOWED_WA_EVENTS = [
  "order_created",
  "ready_for_review",
  "revision_requested",
  "revision_completed",
  "ready_to_post",
  "posted_completed",
];

const ALL_EDITORS_TOKENS = new Set([
  "all",
  "semua",
  "semua editor",
  "all editor",
  "all editors",
  "all_editors",
  "all_editor",
  "semua_editor",
  "semua-editor",
  "all-editors",
  "*",
]);

function isProductionOrBmActor(actor = {}) {
  if (!actor || typeof actor !== "object") return true;
  const rawRole = String(actor.role || actor.userRole || actor.workflowRole || "")
    .trim()
    .toLowerCase();
  if (!rawRole) return true;
  if (rawRole === "dm" || rawRole.includes("director") || rawRole.includes("manager")) {
    return true;
  }
  const normalized = normalizeWorkflowRole(rawRole, "");
  return (
    normalized === WORKFLOW_ROLES.PRODUCTION ||
    normalized === WORKFLOW_ROLES.BRAND_MANAGER
  );
}

function isAllEditorsSelection(order = {}) {
  if (!order || typeof order !== "object") return false;

  const booleanFlags = [
    order.assignToAllEditors,
    order.allEditors,
    order.broadcastEditors,
    order.targetAllEditors,
    order.sendToAllEditors,
  ];
  if (booleanFlags.some((v) => v === true)) return true;

  const candidateFields = [
    order.assignedEditor,
    order.assignedEditorId,
    order.assignedEditorUid,
    order.editorName,
    order.editor,
    order.editorId,
    order.editorUid,
    order.targetEditor,
    order.targetEditors,
  ];

  for (const val of candidateFields) {
    if (Array.isArray(val)) {
      if (val.some((item) => ALL_EDITORS_TOKENS.has(String(item || "").trim().toLowerCase()))) {
        return true;
      }
      continue;
    }
    const normalizedStr = String(val || "").trim().toLowerCase();
    if (normalizedStr && ALL_EDITORS_TOKENS.has(normalizedStr)) {
      return true;
    }
  }

  return false;
}

function isInProgressWorkEvent(eventType, order = {}) {
  const statusVal = String(order?.status || "").trim().toLowerCase();
  const inProgressLabel = String(ORDER_STATUSES?.IN_PROGRESS || "Sedang Dikerjakan")
    .trim()
    .toLowerCase();
  return (
    eventType === "work_started" ||
    statusVal === "sedang dikerjakan" ||
    (inProgressLabel && statusVal === inProgressLabel)
  );
}

function isPostedCompletedEvent(eventType, order = {}) {
  const statusVal = String(order?.status || "").trim().toLowerCase();
  const postedLabel = String(ORDER_STATUSES?.POSTED || "Sudah Diposting")
    .trim()
    .toLowerCase();
  return (
    eventType === "posted_completed" ||
    statusVal === "sudah diposting" ||
    statusVal === "diposting" ||
    (postedLabel && statusVal === postedLabel)
  );
}

function isMutedEvent(eventType, order = {}) {
  if (MUTE_WA_WHILE_IN_PROGRESS && isInProgressWorkEvent(eventType, order)) {
    return "in_progress";
  }
  if (MUTE_WA_WHEN_POSTED && isPostedCompletedEvent(eventType, order)) {
    return "posted_completed";
  }
  return "";
}

export function normalizeWaPhone(rawPhone) {
  const digits = String(rawPhone || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
}

export function isValidWaPhone(phone) {
  return /^62[1-9][0-9]{7,12}$/.test(String(phone || ""));
}

function buildHeader(recipientName, title) {
  const safeName = String(recipientName || "Tim").trim() || "Tim";
  return `Hai *${safeName}* 🎥,\n\n*${title}*\n`;
}

function matchUserByIdentifiers(member, identifiers = [], names = []) {
  const cleanIds = identifiers
    .map((v) => String(v || "").trim().toLowerCase())
    .filter((v) => v && !ALL_EDITORS_TOKENS.has(v));
  const cleanNames = names
    .map((v) => String(v || "").trim().toLowerCase())
    .filter((v) => v && !ALL_EDITORS_TOKENS.has(v));

  const memberIds = [
    member?.uid,
    member?.userId,
    member?.id,
    member?.docId,
    member?.email,
  ]
    .map((v) => String(v || "").trim().toLowerCase())
    .filter(Boolean);

  const memberNames = [
    member?.name,
    member?.displayName,
    member?.fullName,
  ]
    .map((v) => String(v || "").trim().toLowerCase())
    .filter(Boolean);

  const idMatch = cleanIds.length > 0 && memberIds.some((id) => cleanIds.includes(id));
  const nameMatch =
    cleanNames.length > 0 && memberNames.some((nm) => cleanNames.includes(nm));

  return idMatch || nameMatch;
}

export function formatWorkflowWaMessage({
  eventType,
  recipientName,
  order = {},
  actorName = "-",
  videoUrl = "",
  note = "",
  postUrl = "",
}) {
  if (isMutedEvent(eventType, order)) return "";
  if (!ALLOWED_WA_EVENTS.includes(eventType)) return "";

  const orderTitle = order.title || order.judul || "Order Video";
  const brandName = order.brandName || order.brand || "-";
  const deadline = order.deadline || "-";
  const briefNote = String(note || order.briefNote || order.brief || "-").trim() || "-";
  const cleanVideoUrl =
    String(videoUrl || order.videoUrl || order.previewUrl || order.resultUrl || "-").trim() || "-";
  const cleanPostUrl =
    String(postUrl || order.postUrl || order.publishedUrl || "-").trim() || "-";

  if (eventType === "order_created") {
    return (
      buildHeader(recipientName, "[CreativeFlow] Order Baru untuk Editor") +
      `• *Order:* ${orderTitle}\n` +
      `• *Brand/Produk:* ${brandName}\n` +
      `• *Status:* ${order.status || ORDER_STATUSES.QUEUE}\n` +
      `• *Dibuat oleh:* ${actorName}\n` +
      `• *Deadline:* ${deadline}\n` +
      `• *Catatan Brief:* ${briefNote}\n\n` +
      `Silakan cek detail order di aplikasi dan mulai proses editing.`
    );
  }

  if (eventType === "ready_for_review") {
    return (
      buildHeader(recipientName, "[CreativeFlow] Video Siap di-Review BM") +
      `• *Order:* ${orderTitle}\n` +
      `• *Brand/Produk:* ${brandName}\n` +
      `• *Status:* ${ORDER_STATUSES.BM_CURATION}\n` +
      `• *Editor:* ${actorName}\n` +
      `• *Link Video:* ${cleanVideoUrl}\n` +
      `• *Catatan:* ${briefNote}\n\n` +
      `Mohon lakukan review video (Approve ke *Siap Posting* atau kembalikan ke *Revisi*).`
    );
  }

  if (eventType === "revision_requested") {
    return (
      buildHeader(recipientName, "[CreativeFlow] Permintaan Revisi Video") +
      `• *Order:* ${orderTitle}\n` +
      `• *Brand/Produk:* ${brandName}\n` +
      `• *Status:* ${ORDER_STATUSES.REVISION}\n` +
      `• *BM yang Merevisi:* ${actorName}\n` +
      `• *Catatan Revisi:*\n${briefNote}\n\n` +
      `Silakan kerjakan revisi sesuai catatan lalu submit ulang untuk di-review.`
    );
  }

  if (eventType === "revision_completed") {
    return (
      buildHeader(recipientName, "[CreativeFlow] Revisi Selesai & Siap di-Review") +
      `• *Order:* ${orderTitle}\n` +
      `• *Brand/Produk:* ${brandName}\n` +
      `• *Status:* ${ORDER_STATUSES.BM_CURATION}\n` +
      `• *Editor:* ${actorName}\n` +
      `• *Link Video Revisi:* ${cleanVideoUrl}\n` +
      `• *Catatan:* ${briefNote}\n\n` +
      `Revisi sudah selesai dikerjakan dan siap untuk di-review kembali.`
    );
  }

  if (eventType === "ready_to_post") {
    return (
      buildHeader(recipientName, "[CreativeFlow] Video Siap Posting") +
      `• *Order:* ${orderTitle}\n` +
      `• *Brand/Produk:* ${brandName}\n` +
      `• *Status:* ${ORDER_STATUSES.READY_TO_POST}\n` +
      `• *Disetujui oleh:* ${actorName}\n` +
      `• *Link Video Final:* ${cleanVideoUrl}\n` +
      `• *Catatan Publikasi:* ${briefNote}\n\n` +
      `Video sudah lolos review dan siap diposting oleh Publisher.`
    );
  }

  if (eventType === "posted_completed") {
    return (
      buildHeader(recipientName, "[CreativeFlow] Video Sudah Diposting") +
      `• *Order:* ${orderTitle}\n` +
      `• *Brand/Produk:* ${brandName}\n` +
      `• *Status:* ${ORDER_STATUSES.POSTED}\n` +
      `• *Diposting oleh:* ${actorName}\n` +
      `• *Link/Waktu Tayang:* ${cleanPostUrl}\n\n` +
      `Video telah berhasil diposting.`
    );
  }

  return "";
}

export function resolveWorkflowRecipients({
  eventType,
  order = {},
  teamMembers = [],
  actorId = "",
  actor = {},
}) {
  if (isMutedEvent(eventType, order)) return [];
  if (!ALLOWED_WA_EVENTS.includes(eventType)) return [];

  const members = Array.isArray(teamMembers) ? teamMembers : [];
  const byRole = (targetRole) =>
    members.filter((m) => normalizeWorkflowRole(m?.role) === targetRole);

  const actorKey = String(actorId || "").trim().toLowerCase();
  const notActor = (m) => {
    if (!actorKey) return true;
    const mKeys = [m?.uid, m?.userId, m?.id, m?.docId, m?.email]
      .filter(Boolean)
      .map((v) => String(v).trim().toLowerCase());
    return !mKeys.includes(actorKey);
  };

  let targets = [];

  if (eventType === "order_created") {
    if (isAllEditorsSelection(order) && isProductionOrBmActor(actor)) {
      targets = byRole(WORKFLOW_ROLES.EDITOR);
    } else {
      const editorIds = [
        order.assignedEditorUid,
        order.assignedEditorId,
        order.assignedEditorEmail,
        order.editorUid,
        order.editorId,
        order.editorEmail,
      ];
      const editorNames = [
        order.assignedEditor,
        order.editorName,
        order.editor,
      ];
      targets = members.filter((m) => matchUserByIdentifiers(m, editorIds, editorNames));
    }
  } else if (eventType === "ready_for_review") {
    targets = byRole(WORKFLOW_ROLES.BRAND_MANAGER).filter(notActor);
  } else if (eventType === "revision_requested") {
    const editorIds = [
      order.assignedEditorUid,
      order.assignedEditorId,
      order.assignedEditorEmail,
      order.editorUid,
      order.editorId,
      order.editorEmail,
      order.claimedByUid,
      order.claimedById,
      order.claimedByEmail,
      order.submittedByEmail,
    ];
    const editorNames = [
      order.assignedEditor,
      order.editorName,
      order.editor,
      order.claimedBy,
      order.submittedBy,
      order.submittedByName,
    ];
    targets = members.filter((m) => matchUserByIdentifiers(m, editorIds, editorNames));
  } else if (eventType === "revision_completed") {
    const reviewerIds = [
      order.reviewedByUid,
      order.reviewedById,
      order.reviewedByEmail,
      order.revisionByUid,
      order.revisionById,
      order.curatedByUid,
      order.curatedById,
      order.lastReviewerId,
    ];
    const reviewerNames = [
      order.reviewedBy,
      order.revisionBy,
      order.bmName,
      order.curatedBy,
      order.lastReviewer,
    ];
    targets = members
      .filter((m) => matchUserByIdentifiers(m, reviewerIds, reviewerNames))
      .filter(notActor);
  } else if (eventType === "ready_to_post") {
    targets = byRole(WORKFLOW_ROLES.PUBLISHER).filter(notActor);
  } else if (eventType === "posted_completed") {
    targets = byRole(WORKFLOW_ROLES.BRAND_MANAGER).filter(notActor);
  }

  const seenPhones = new Set();
  return targets
    .map((member) => {
      const phone = normalizeWaPhone(
        member?.phone || member?.whatsapp || member?.wa || member?.whatsappNumber || ""
      );
      const name = member?.name || member?.displayName || member?.fullName || "Tim";
      return { member, name, phone, valid: isValidWaPhone(phone) };
    })
    .filter((item) => {
      if (!item.valid || !item.phone || seenPhones.has(item.phone)) return false;
      seenPhones.add(item.phone);
      return true;
    });
}

export async function dispatchWorkflowWaNotifications({
  eventType,
  order = {},
  teamMembers = [],
  actor = {},
  videoUrl = "",
  note = "",
  postUrl = "",
  sendFn,
  onLog,
}) {
  const mutedReason = isMutedEvent(eventType, order);
  if (mutedReason) {
    return { sentCount: 0, skippedCount: 0, results: [], muted: true, reason: mutedReason };
  }
  if (!ALLOWED_WA_EVENTS.includes(eventType)) {
    return { sentCount: 0, skippedCount: 0, results: [], ignored: true };
  }
  if (typeof sendFn !== "function") {
    return { sentCount: 0, skippedCount: 0, results: [] };
  }

  const actorId = actor?.uid || actor?.userId || actor?.id || actor?.email || "";
  const actorName = actor?.name || actor?.displayName || actor?.email || "Tim";
  const orderKey = order.id || order.orderCode || order.docId || order.title || "order";
  const dedupSignature = [
    eventType,
    orderKey,
    Number(order.revision || order.revisionCount || 0),
    actorId,
    String(note || videoUrl || postUrl || "").trim().slice(0, 50),
  ].join("::");

  if (sentNotificationKeys.has(dedupSignature)) {
    return { sentCount: 0, skippedCount: 0, results: [], deduplicated: true };
  }
  sentNotificationKeys.add(dedupSignature);

  const recipients = resolveWorkflowRecipients({
    eventType,
    order,
    teamMembers,
    actorId,
    actor,
  });

  const results = [];
  let sentCount = 0;
  let skippedCount = 0;

  for (const rec of recipients) {
    const message = formatWorkflowWaMessage({
      eventType,
      recipientName: rec.name,
      order,
      actorName,
      videoUrl,
      note,
      postUrl,
    });
    if (!message) continue;

    try {
      await sendFn({
        phone: rec.phone,
        message,
        recipient: rec.member,
        eventType,
        order,
      });
      sentCount += 1;
      const item = { recipientName: rec.name, phone: rec.phone, status: "sent", message };
      results.push(item);
      if (typeof onLog === "function") await onLog(item);
    } catch (err) {
      skippedCount += 1;
      const item = {
        recipientName: rec.name,
        phone: rec.phone,
        status: "failed",
        error: err?.message || "Gagal kirim WA",
        message,
      };
      results.push(item);
      if (typeof onLog === "function") await onLog(item);
    }
  }

  return { sentCount, skippedCount, results };
}
