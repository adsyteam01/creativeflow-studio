export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = String(
    process.env.FONNTE_TOKEN || process.env.WA_API_TOKEN || ""
  ).trim();
  const apiUrl = String(
    process.env.FONNTE_URL || process.env.WA_API_URL || "https://api.fonnte.com/send"
  ).trim();

  if (!token) {
    return res.status(500).json({
      ok: false,
      error: "FONNTE_TOKEN belum dikonfigurasi di environment variables",
    });
  }

  const rawPhone = String(req.body?.phone || "").replace(/[^0-9]/g, "");
  const phone = rawPhone.startsWith("0")
    ? "62" + rawPhone.slice(1)
    : rawPhone.startsWith("8")
    ? "62" + rawPhone
    : rawPhone;
  const message = String(req.body?.message || "").trim();

  if (!/^62[1-9][0-9]{7,12}$/.test(phone)) {
    return res.status(400).json({ ok: false, error: "Nomor WhatsApp tidak valid" });
  }

  if (!message) {
    return res.status(400).json({ ok: false, error: "Pesan WhatsApp tidak boleh kosong" });
  }

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: token,
      },
      body: JSON.stringify({
        target: phone,
        message,
        countryCode: "62",
      }),
    });

    const data = await response.json().catch(() => ({}));
    const isSuccess =
      response.ok &&
      data?.status !== false &&
      data?.ok !== false;

    if (!isSuccess) {
      return res.status(response.ok ? 400 : response.status).json({
        ok: false,
        error: data?.reason || data?.detail || data?.message || "Gagal mengirim pesan via Fonnte",
        providerResponse: data,
      });
    }

    return res.status(200).json({
      ok: true,
      provider: "fonnte",
      phone,
      data,
    });
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: err?.message || "Gagal menghubungi layanan Fonnte",
    });
  }
}
