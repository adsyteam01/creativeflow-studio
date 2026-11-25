import { ORDER_STATUSES, WORKFLOW_ROLES, normalizeWorkflowRole } from "./workflowRules.js";

const sentNotificationKeys = new Set();

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

export function formatWorkflowWaMessage({
  eventType,
  recipientName,
  order = {},
  actorName = "-",
  videoUrl = "",
  note = "",
  postUrl = "",
}) {
  const orderCode = order.orderCode || order.code || order.id || "-";
  const orderTitle = order.title || order.judul || "Order Video";
  const brandName = order.brandName || order.brand || "-";
  const deadline = order.deadline || "-";
  const briefNote = String(note || order.briefNote || order.brief || "-").trim() || "-";
  const cleanVideoUrl = String(videoUrl || order.videoUrl || order.resultUrl || "-").trim() || "-";
  const cleanPostUrl = String(postUrl || order.postUrl || order.publishedUrl || "-").trim() || "-";

  if (eventType === "job_assigned" || eventType === "order_created") {
    const statusLabel = order.status || ORDER_STATUSES.QUEUE;
    return (
      buildHeader(recipientName, "[CreativeFlow] Job Baru untuk Editor") +
      `• *Order:* ${orderCode} — ${orderTitle}\n` +
      `• *Brand/Produk:* ${brandName}\n` +
      `• *Status:* ${statusLabel}\n` +
      `• *Dibuat oleh:* ${actorName}\n` +
      `• *Deadline:* ${deadline}\n` +
      `• *Catatan Brief:* ${briefNote}\n\n` +
      `Silakan cek detail order di aplikasi dan mulai proses editing.`
    );
  }

  if (eventType === "submitted_for_curation") {
    return (
      buildHeader(recipientName, "[CreativeFlow] Video Siap Dikurasi BM") +
      `• *Order:* ${orderCode} — ${orderTitle}\n` +
      `• *Brand/Produk:* ${brandName}\n` +
      `• *Status:* ${ORDER_STATUSES.BM_CURATION}\n` +
      `• *Editor:* ${actorName}\n` +
      `• *Link Video:* ${cleanVideoUrl}\n` +
      `• *Catatan Editor:* ${briefNote}\n\n` +
      `Mohon dilakukan kurasi video (Approve ke *Siap Posting* atau kembalikan ke *Revisi*).`
    );
  }

  if (eventType === "revision_requested") {
    return (
      buildHeader(recipientName, "[CreativeFlow] Permintaan Revisi Video") +
      `• *Order:* ${orderCode} — ${orderTitle}\n` +
      `• *Brand/Produk:* ${brandName}\n` +
      `• *Status:* ${ORDER_STATUSES.REVISION}\n` +
      `• *Dikurasi oleh (BM):* ${actorName}\n` +
      `• *Catatan Revisi:*\n${briefNote}\n\n` +
      `Silakan perbaiki sesuai catatan lalu submit ulang untuk kurasi BM.`
    );
  }

  if (eventType === "ready_to_post") {
    return (
      buildHeader(recipientName, "[CreativeFlow] Konten Siap Posting (SMM)") +
      `• *Order:* ${orderCode} — ${orderTitle}\n` +
      `• *Brand/Produk:* ${brandName}\n` +
      `• *Status:* ${ORDER_STATUSES.READY_TO_POST}\n` +
      `• *Disetujui oleh (BM):* ${actorName}\n` +
      `• *Link Video Final:* ${cleanVideoUrl}\n` +
      `• *Catatan Publikasi:* ${briefNote}\n\n` +
      `Konten sudah lolos kurasi dan siap dijadwalkan/diposting oleh SMM.`
    );
  }

  if (eventType === "posted_completed") {
    return (
      buildHeader(recipientName, "[CreativeFlow] Video Sudah Diposting") +
      `• *Order:* ${orderCode} — ${orderTitle}\n` +
      `• *Brand/Produk:* ${brandName}\n` +
      `• *Status:* ${ORDER_STATUSES.POSTED}\n` +
      `• *Diposting oleh (SMM):* ${actorName}\n` +
      `• *Waktu/Link Tayang:* ${cleanPostUrl}\n\n` +
      `Proses produksi hingga publikasi untuk order ini telah selesai.`
    );
  }

  return (
    buildHeader(recipientName, "[CreativeFlow] Update Status Order") +
    `• *Order:* ${orderCode} — ${orderTitle}\n` +
    `• *Brand/Produk:* ${brandName}\n` +
    `• *Status:* ${order.status || "-"}\n` +
    `• *Diperbarui oleh:* ${actorName}\n` +
    `• *Catatan:* ${briefNote}`
  );
}

export function resolveWorkflowRecipients({ eventType, order = {}, teamMembers = [], actorId = "" }) {
  const members = Array.isArray(teamMembers) ? teamMembers : [];
  const byRole = (targetRole) =>
    members.filter((m) => normalizeWorkflowRole(m?.role) === targetRole);

  const actorKey = String(actorId || "").trim().toLowerCase();
  const notActor = (m) => {
    const mKeys = [m?.uid, m?.userId, m?.id, m?.docId, m?.email]
      .filter(Boolean)
      .map((v) => String(v).trim().toLowerCase());
    return !actorKey || !mKeys.includes(actorKey);
  };

  let targets = [];

  if (eventType === "job_assigned" || eventType === "order_created") {
    const assignedId = String(order.assignedEditorId || order.editorId || "").trim().toLowerCase();
    const assignedName = String(order.assignedEditor || order.editorName || "").trim().toLowerCase();
    targets = byRole(WORKFLOW_ROLES.EDITOR).filter((m) => {
      const idMatch =
        assignedId &&
        [m?.uid, m?.userId, m?.id, m?.docId]
          .filter(Boolean)
          .some((v) => String(v).trim().toLowerCase() === assignedId);
      const nameMatch =
        assignedName && String(m?.name || m?.displayName || "").trim().toLowerCase() === assignedName;
      return idMatch || nameMatch;
    });
  } else if (eventType === "submitted_for_curation") {
    targets = byRole(WORKFLOW_ROLES.BRAND_MANAGER).filter(notActor);
  } else if (eventType === "revision_requested") {
    const assignedId = String(order.assignedEditorId || order.editorId || "").trim().toLowerCase();
    const assignedName = String(order.assignedEditor || order.editorName || "").trim().toLowerCase();
    targets = byRole(WORKFLOW_ROLES.EDITOR).filter((m) => {
      const idMatch =
        assignedId &&
        [m?.uid, m?.userId, m?.id, m?.docId]
          .filter(Boolean)
          .some((v) => String(v).trim().toLowerCase() === assignedId);
      const nameMatch =
        assignedName && String(m?.name || m?.displayName || "").trim().toLowerCase() === assignedName;
      return idMatch || nameMatch;
    });
  } else if (eventType === "ready_to_post") {
    targets = byRole(WORKFLOW_ROLES.SOCIAL_MEDIA_MANAGER).filter(notActor);
  } else if (eventType === "posted_completed") {
    targets = [
      ...byRole(WORKFLOW_ROLES.BRAND_MANAGER),
      ...byRole(WORKFLOW_ROLES.PRODUCTION),
    ].filter(notActor);
  }

  const seenPhones = new Set();
  return targets
    .map((member) => {
      const phone = normalizeWaPhone(member?.phone || member?.whatsapp || member?.wa || "");
      const name = member?.name || member?.displayName || "Tim";
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
  if (typeof sendFn !== "function") {
    return { sentCount: 0, skippedCount: 0, results: [] };
  }

  const orderKey = order.id || order.orderCode || order.docId || "order";
  const dedupSignature = [
    eventType,
    orderKey,
    order.status || "",
    order.revisionCount || 0,
    String(note || videoUrl || postUrl || "").slice(0, 40),
  ].join("::");

  if (sentNotificationKeys.has(dedupSignature)) {
    return { sentCount: 0, skippedCount: 0, results: [], deduplicated: true };
  }
  sentNotificationKeys.add(dedupSignature);

  const actorId = actor?.uid || actor?.userId || actor?.id || actor?.email || "";
  const actorName = actor?.name || actor?.displayName || actor?.email || "Tim";
  const recipients = resolveWorkflowRecipients({ eventType, order, teamMembers, actorId });

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
