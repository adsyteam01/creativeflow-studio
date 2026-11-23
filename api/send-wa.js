
function sanitizeWaParam(val) {
  const cleaned = String(val ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  return cleaned || "-";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    return res.status(500).json({
      error: "WHATSAPP_TOKEN atau WHATSAPP_PHONE_NUMBER_ID belum diatur di Vercel.",
    });
  }

  try {
    const { to, templateName, languageCode = "id", variables = [] } = req.body || {};

    const cleanPhone = String(to || "")
      .replace(/\D/g, "")
      .replace(/^0/, "62");

    if (!cleanPhone || !templateName) {
      return res.status(400).json({
        error: "Nomor tujuan (to) dan nama template (templateName) wajib diisi.",
      });
    }

    const payload = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type: "template",
      template: {
        name: templateName,
        language: { code: languageCode },
        ...(Array.isArray(variables) && variables.length > 0
          ? {
              components: [
                {
                  type: "body",
                  parameters: variables.map((val) => ({
                    type: "text",
                    text: sanitizeWaParam(val),
                  })),
                },
              ],
            }
          : {}),
      },
    };

    const metaRes = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    const data = await metaRes.json();

    if (!metaRes.ok) {
      const baseMsg = data?.error?.message || "Gagal mengirim pesan ke Meta WhatsApp API";
      const errDetailMsg = data?.error?.error_data?.details ? ` (${data.error.error_data.details})` : "";
      return res.status(metaRes.status).json({
        error: `${baseMsg}${errDetailMsg}`,
        details: data?.error || null,
      });
    }

    return res.status(200).json({
      ok: true,
      messageId: data?.messages?.[0]?.id || null,
      data,
    });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || "Terjadi kesalahan internal saat menghubungi WhatsApp API",
    });
  }
}
