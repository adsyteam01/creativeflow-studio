export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed. Use POST." });
  }

  const token = process.env.FONNTE_TOKEN;
  if (!token) {
    return res.status(500).json({ ok: false, error: "FONNTE_TOKEN belum diatur di Environment Variables Vercel." });
  }

  const { event, message, recipients } = req.body || {};
  if (!message || !Array.isArray(recipients) || recipients.length === 0) {
    return res.status(400).json({ ok: false, error: "Payload harus menyertakan message dan recipients (array)." });
  }

  // Normalisasi nomor WA ke format internasional tanpa '+' (contoh: 6281234567890)
  const normalizedTargets = recipients
    .map((num) => String(num || "").replace(/[^\d]/g, ""))
    .map((digits) => {
      if (digits.startsWith("0")) return "62" + digits.slice(1);
      if (digits.startsWith("8")) return "62" + digits;
      return digits;
    })
    .filter((digits) => digits.length >= 9);

  if (normalizedTargets.length === 0) {
    return res.status(400).json({ ok: false, error: "Tidak ada nomor WhatsApp penerima yang valid." });
  }

  try {
    const results = await Promise.all(
      normalizedTargets.map(async (target) => {
        const formData = new URLSearchParams();
        formData.append("target", target);
        formData.append("message", message);
        formData.append("countryCode", "62");

        const response = await fetch("https://api.fonnte.com/send", {
          method: "POST",
          headers: {
            Authorization: token,
          },
          body: formData,
        });

        const data = await response.json().catch(() => ({}));
        return {
          target,
          status: response.ok ? "sent" : "failed",
          gatewayResponse: data,
        };
      })
    );

    const hasSuccess = results.some((r) => r.status === "sent");
    return res.status(hasSuccess ? 200 : 502).json({
      ok: hasSuccess,
      event: event || "notification",
      results,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: "Gagal menghubungi gateway WhatsApp.",
      detail: err?.message || String(err),
    });
  }
}
