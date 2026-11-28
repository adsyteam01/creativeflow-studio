import React, { useMemo, useState, useEffect } from "react";
import { Calendar as CalendarIcon, Clock, AlertTriangle, CheckCircle2, Edit3, Save, X, ChevronLeft, ChevronRight } from "lucide-react";

const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const DAY_NAMES_ID = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

export function formatDateToDDMMYYYY(isoDateStr = "") {
  const clean = String(isoDateStr || "").trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (isoMatch) {
    return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
  }
  const dmyMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(clean);
  if (dmyMatch) {
    const dd = String(dmyMatch[1]).padStart(2, "0");
    const mm = String(dmyMatch[2]).padStart(2, "0");
    return `${dd}/${mm}/${dmyMatch[3]}`;
  }
  return clean;
}

export function parseDDMMYYYYToISO(inputStr = "") {
  const clean = String(inputStr || "").trim();
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (isoMatch) return clean;
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(clean);
  if (!match) return "";
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const dt = new Date(year, month - 1, day);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    return "";
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeTime24h(timeStr = "") {
  const raw = String(timeStr || "").trim();
  if (!raw) return "";
  const ampmMatch = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i.exec(raw);
  if (ampmMatch) {
    let hh = Number(ampmMatch[1]);
    const mm = Number(ampmMatch[2]);
    const period = ampmMatch[3].toUpperCase();
    if (hh < 1 || hh > 12 || mm < 0 || mm > 59) return "";
    if (period === "PM" && hh !== 12) hh += 12;
    if (period === "AM" && hh === 12) hh = 0;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  const h24Match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(raw);
  if (h24Match) {
    const hh = Number(h24Match[1]);
    const mm = Number(h24Match[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return "";
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  return "";
}

export function getLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isOrderPostedStatus(order = {}) {
  const st = String(order?.status || "").trim().toLowerCase();
  return Boolean(order?.isPosted) || Boolean(order?.postedAt) || st === "sudah diposting";
}

export function isOrderReadyToPostStatus(order = {}) {
  const st = String(order?.status || "").trim().toLowerCase();
  return !isOrderPostedStatus(order) && (st === "siap posting" || st === "selesai");
}

function getOrderBrandLabel(order = {}) {
  return (
    String(
      order?.brand ||
      order?.brandName ||
      order?.accountName ||
      order?.account ||
      order?.tiktokAccount ||
      "Brand"
    ).trim() || "Brand"
  );
}

function toValidDate(val) {
  if (!val) return null;
  if (val instanceof Date) {
    return Number.isNaN(val.getTime()) ? null : val;
  }
  if (typeof val === "object" && typeof val.toDate === "function") {
    const dt = val.toDate();
    return dt && !Number.isNaN(dt.getTime()) ? dt : null;
  }
  if (typeof val === "object" && typeof val.seconds === "number") {
    const dt = new Date(val.seconds * 1000);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(val);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function getPostedFallbackDateObj(order = {}) {
  if (!isOrderPostedStatus(order)) return null;
  const candidates = [
    order?.postedAt,
    order?.publishedAt,
    order?.updatedAt,
    order?.createdAt,
  ];
  for (const cand of candidates) {
    const dt = toValidDate(cand);
    if (dt) return dt;
  }
  return null;
}

function getScheduleDateStr(order = {}) {
  const direct = String(order?.scheduledDate || "").trim();
  const parsedDirect =
    parseDDMMYYYYToISO(direct) ||
    (/^\d{4}-\d{2}-\d{2}$/.test(direct) ? direct : "");
  if (parsedDirect) return parsedDirect;

  const dtRaw = order?.scheduledAt;
  if (dtRaw) {
    const parsed = toValidDate(dtRaw);
    if (parsed) return getLocalDateStr(parsed);
  }

  const postedFallback = getPostedFallbackDateObj(order);
  if (postedFallback) {
    return getLocalDateStr(postedFallback);
  }

  return "";
}

function getScheduleTimeStr(order = {}) {
  const raw = String(order?.scheduledTime || "").trim();
  const normalizedRaw = normalizeTime24h(raw);
  if (normalizedRaw) return normalizedRaw;

  const dtRaw = order?.scheduledAt;
  if (dtRaw) {
    const parsed = toValidDate(dtRaw);
    if (parsed) {
      const hh = String(parsed.getHours()).padStart(2, "0");
      const mm = String(parsed.getMinutes()).padStart(2, "0");
      return `${hh}:${mm}`;
    }
  }

  const postedFallback = getPostedFallbackDateObj(order);
  if (postedFallback) {
    const hh = String(postedFallback.getHours()).padStart(2, "0");
    const mm = String(postedFallback.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  }

  return "";
}
function getReminderInfo(order, now = new Date()) {
  const posted = isOrderPostedStatus(order);
  const timeStr = getScheduleTimeStr(order);
  const dateStr = getScheduleDateStr(order);
  if (posted) {
    return {
      isOverdue: false,
      isApproaching: false,
      urgent: false,
      badgeText: "Sudah Diposting",
      message: timeStr ? `Terposting • Jadwal ${timeStr} WIB` : "Sudah dipublikasikan",
    };
  }

  const todayStr = getLocalDateStr(now);
  if (dateStr && timeStr) {
    const scheduledDateObj = new Date(`${dateStr}T${timeStr}:00`);
    if (!Number.isNaN(scheduledDateObj.getTime())) {
      const diffMinutes = Math.floor((scheduledDateObj.getTime() - now.getTime()) / 60000);
      if (diffMinutes <= 0) {
        return {
          isOverdue: true,
          isApproaching: false,
          urgent: true,
          badgeText: "Belum Diposting • Lewat/Tiba Jam Tayang",
          message: `URGENT: Harus segera diposting! Jadwal tayang jam ${timeStr} WIB.`,
        };
      }
      if (diffMinutes <= 30) {
        return {
          isOverdue: false,
          isApproaching: true,
          urgent: true,
          badgeText: `Belum Diposting • ${diffMinutes} Menit Lagi`,
          message: `Segera siapkan postingan! Tersisa ${diffMinutes} menit menuju jam tayang ${timeStr} WIB.`,
        };
      }
      return {
        isOverdue: false,
        isApproaching: false,
        urgent: true,
        badgeText: "Belum Diposting",
        message: `Pengingat: Konten harus diposting pada jam ${timeStr} WIB.`,
      };
    }
  }

  if (timeStr) {
    return {
      isOverdue: false,
      isApproaching: false,
      urgent: true,
      badgeText: "Belum Diposting",
      message: `Pengingat: Konten harus diposting pada jam ${timeStr} WIB.`,
    };
  }

  const isPastDate = Boolean(dateStr && dateStr < todayStr);
  return {
    isOverdue: isPastDate,
    isApproaching: false,
    urgent: true,
    badgeText: "Belum Diposting",
    message: isPastDate
      ? "URGENT: Tanggal jadwal posting sudah lewat dan konten belum diposting."
      : "Pengingat: Konten belum diposting, segera cek jam tayang.",
  };
}

const QUICK_HOURS_24 = ["00:00","00:30","01:00","01:30","02:00","02:30","03:00","03:30","04:00","04:30","05:00","05:30","06:00","06:30","07:00","07:30","08:00","08:30","09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30","20:00","20:30","21:00","21:30","22:00","22:30","23:00","23:30"];

function HybridDateTimeInputs({
  dateVal,
  timeVal,
  onChangeDate,
  onChangeTime,
  compact = false,
}) {
  const [openPicker, setOpenPicker] = useState(null); // "date" | "time" | null
  const currentIso = parseDDMMYYYYToISO(dateVal) || getLocalDateStr(new Date());
  const initialDateObj = useMemo(() => {
    const [y, m, d] = currentIso.split("-").map(Number);
    return new Date(y || 2026, (m || 1) - 1, d || 1);
  }, [currentIso]);

  const [calMonth, setCalMonth] = useState(
    () => new Date(initialDateObj.getFullYear(), initialDateObj.getMonth(), 1)
  );

  useEffect(() => {
    setCalMonth(new Date(initialDateObj.getFullYear(), initialDateObj.getMonth(), 1));
  }, [initialDateObj.getFullYear(), initialDateObj.getMonth()]);

  const miniCalCells = useMemo(() => {
    const year = calMonth.getFullYear();
    const month = calMonth.getMonth();
    const firstIdx = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstIdx; i += 1) cells.push({ empty: true, key: `e-${i}` });
    for (let day = 1; day <= totalDays; day += 1) {
      const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ empty: false, key: iso, day, iso });
    }
    return cells;
  }, [calMonth]);

  const normCurrentTime = normalizeTime24h(timeVal) || timeVal;

  return (
    <div className={compact ? "grid grid-cols-2 gap-2 relative" : "grid grid-cols-2 gap-3 relative"}>
      <div className="relative">
        <label className={compact ? "block text-[10px] font-bold uppercase text-slate-600 mb-1" : "block text-xs font-bold text-slate-700 mb-1"}>
          Tanggal {compact ? "Posting" : "Upload"} <span className="text-rose-600">*</span>
        </label>
        <div className="relative flex items-center">
          <input
            type="text"
            inputMode="numeric"
            required
            placeholder="DD/MM/YYYY"
            value={dateVal}
            onChange={(e) => onChangeDate(e.target.value)}
            onDoubleClick={() => setOpenPicker((prev) => (prev === "date" ? null : "date"))}
            className={`w-full rounded-xl border text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
              compact ? "px-2.5 py-1.5 pr-8 text-xs font-semibold bg-white border-emerald-300" : "px-3 py-2 pr-9 text-xs font-medium border-slate-300"
            }`}
          />
          <button
            type="button"
            onClick={() => setOpenPicker((prev) => (prev === "date" ? null : "date"))}
            aria-label="Pilih tanggal"
            className="absolute right-2 p-1 rounded-md text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition cursor-pointer"
          >
            <CalendarIcon className="w-3.5 h-3.5" />
          </button>
        </div>

        {openPicker === "date" && (
          <div className="absolute left-0 top-full mt-1 z-[100] w-60 rounded-2xl bg-white border border-slate-200 shadow-2xl p-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                {MONTH_NAMES_ID[calMonth.getMonth()]} {calMonth.getFullYear()}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {DAY_NAMES_ID.map((d) => (
                <span key={d} className="text-[10px] font-bold text-slate-400">{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {miniCalCells.map((cell) => {
                if (cell.empty) return <div key={cell.key} className="h-7" />;
                const isPicked = cell.iso === currentIso;
                return (
                  <button
                    key={cell.key}
                    type="button"
                    onClick={() => {
                      onChangeDate(formatDateToDDMMYYYY(cell.iso));
                      setOpenPicker(null);
                    }}
                    className={`h-6 rounded-md text-[11px] font-semibold transition cursor-pointer ${
                      isPicked
                        ? "bg-emerald-600 text-white font-bold"
                        : "hover:bg-emerald-50 text-slate-700"
                    }`}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="relative">
        <label className={compact ? "block text-[10px] font-bold uppercase text-slate-600 mb-1" : "block text-xs font-bold text-slate-700 mb-1"}>
          Jam {compact ? "Posting" : "Upload"} <span className="text-rose-600">*</span>
        </label>
        <div className="relative flex items-center">
          <input
            type="text"
            inputMode="numeric"
            required
            placeholder="HH:mm (24 jam)"
            value={timeVal}
            onChange={(e) => onChangeTime(e.target.value)}
            onDoubleClick={() => setOpenPicker((prev) => (prev === "time" ? null : "time"))}
            onBlur={(e) => {
              const norm = normalizeTime24h(e.target.value);
              if (norm) onChangeTime(norm);
            }}
            className={`w-full rounded-xl border text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
              compact ? "px-2.5 py-1.5 pr-8 text-xs font-semibold bg-white border-emerald-300" : "px-3 py-2 pr-9 text-xs font-medium border-slate-300"
            }`}
          />
          <button
            type="button"
            onClick={() => setOpenPicker((prev) => (prev === "time" ? null : "time"))}
            aria-label="Pilih jam 24 jam"
            className="absolute right-2 p-1 rounded-md text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
          </button>
        </div>

        {openPicker === "time" && (
          <div className="absolute right-0 top-full mt-1 z-[100] w-44 max-h-40 overflow-y-auto rounded-2xl bg-white border border-slate-200 shadow-2xl p-1.5 grid grid-cols-2 gap-1">
            {QUICK_HOURS_24.map((slot) => {
              const active = normCurrentTime === slot;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => {
                    onChangeTime(slot);
                    setOpenPicker(null);
                  }}
                  className={`px-2 py-1.5 rounded-lg text-[11px] font-bold text-center transition cursor-pointer ${
                    active
                      ? "bg-emerald-600 text-white"
                      : "hover:bg-emerald-50 text-slate-700"
                  }`}
                >
                  {slot}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function ScheduleFormModal({
  isOpen,
  mode = "create",
  order = null,
  isSaving = false,
  onClose,
  onSubmitSchedule,
}) {
  const [dateVal, setDateVal] = useState("");
  const [timeVal, setTimeVal] = useState("10:00");
  const [captionVal, setCaptionVal] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    const existingDate = formatDateToDDMMYYYY(getScheduleDateStr(order) || getLocalDateStr(new Date()));
    const existingTime = normalizeTime24h(getScheduleTimeStr(order) || "10:00") || "10:00";
    const existingCaption =
      order?.scheduledCaption ?? order?.postCaption ?? order?.caption ?? "";
    setDateVal(existingDate);
    setTimeVal(existingTime);
    setCaptionVal(String(existingCaption || ""));
    setErrorMsg("");
  }, [isOpen, order, mode]);

  if (!isOpen || !order) return null;

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const parsedISO = parseDDMMYYYYToISO(dateVal);
    const parsedTime = normalizeTime24h(timeVal);
    if (!parsedISO) {
      setErrorMsg("Tanggal wajib diisi dengan format DD/MM/YYYY (contoh: 28/11/2026).");
      return;
    }
    if (!parsedTime) {
      setErrorMsg("Jam wajib diisi dalam format 24 jam HH:mm (contoh: 14:30).");
      return;
    }
    setErrorMsg("");
    await onSubmitSchedule({
      scheduledDate: parsedISO,
      scheduledTime: parsedTime,
      scheduledCaption: captionVal.trim(),
    });
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-visible">
        <div className="px-5 py-4 bg-emerald-600 text-white flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-100">
              {mode === "edit" ? "Update Jadwal & Caption" : "Konfirmasi Siap Posting"}
            </p>
            <h3 className="text-sm font-bold truncate max-w-[290px]">
              {order.title || order.id || "Order Video"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="p-1.5 rounded-lg hover:bg-emerald-700/70 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleFormSubmit} className="p-5 space-y-4">
          <HybridDateTimeInputs
            dateVal={dateVal}
            timeVal={timeVal}
            onChangeDate={setDateVal}
            onChangeTime={setTimeVal}
          />

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Caption Video <span className="text-slate-400 font-normal">(opsional)</span>
            </label>
            <textarea
              rows={3}
              value={captionVal}
              onChange={(e) => setCaptionVal(e.target.value)}
              placeholder="Tulis caption atau hashtag untuk video..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-bold transition cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              {isSaving
                ? "Menyimpan..."
                : mode === "edit"
                ? "Simpan Perubahan"
                : "Tetapkan Siap Posting"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function OrderScheduleInfoCard({ order, canEditSchedule = false, onSaveScheduleInline }) {
  const existingDate = getScheduleDateStr(order);
  const existingTime = getScheduleTimeStr(order);
  const existingCaption = String(
    order?.scheduledCaption ?? order?.postCaption ?? order?.caption ?? ""
  );

  const [isEditing, setIsEditing] = useState(
    () => Boolean(canEditSchedule) && !existingDate && !existingTime && !isOrderPostedStatus(order)
  );
  const [dateVal, setDateVal] = useState(formatDateToDDMMYYYY(existingDate || getLocalDateStr(new Date())));
  const [timeVal, setTimeVal] = useState(normalizeTime24h(existingTime || "10:00") || "10:00");
  const [captionVal, setCaptionVal] = useState(existingCaption);
  const [isSavingInline, setIsSavingInline] = useState(false);
  const [savedNotice, setSavedNotice] = useState("");

  useEffect(() => {
    const d = getScheduleDateStr(order);
    const t = getScheduleTimeStr(order);
    const c = String(order?.scheduledCaption ?? order?.postCaption ?? order?.caption ?? "");
    setDateVal(formatDateToDDMMYYYY(d || getLocalDateStr(new Date())));
    setTimeVal(normalizeTime24h(t || "10:00") || "10:00");
    setCaptionVal(c);
    setSavedNotice("");
    if (canEditSchedule && !d && !t && !isOrderPostedStatus(order)) {
      setIsEditing(true);
    } else {
      setIsEditing(false);
    }
  }, [order?.docId, order?.id, order?.scheduledDate, order?.scheduledTime, order?.scheduledCaption, order?.status]);

  if (!order) return null;

  const posted = isOrderPostedStatus(order);
  const displayDate = getScheduleDateStr(order);
  const displayTime = getScheduleTimeStr(order);
  const displayCaption = String(
    order?.scheduledCaption ?? order?.postCaption ?? order?.caption ?? ""
  ).trim();

  const handleSaveInline = async (e) => {
    e.preventDefault();
    const parsedISO = parseDDMMYYYYToISO(dateVal);
    const parsedTime = normalizeTime24h(timeVal);
    if (!parsedISO || !parsedTime || typeof onSaveScheduleInline !== "function") {
      setSavedNotice("Gunakan tanggal DD/MM/YYYY dan jam 24 jam HH:mm.");
      return;
    }
    setIsSavingInline(true);
    setSavedNotice("");
    try {
      await onSaveScheduleInline(order, {
        scheduledDate: parsedISO,
        scheduledTime: parsedTime,
        scheduledCaption: captionVal.trim(),
      });
      setIsEditing(false);
      setSavedNotice("Jadwal & caption tersimpan.");
    } catch (err) {
      console.error("Gagal menyimpan jadwal inline:", err);
      setSavedNotice(err?.message || "Gagal menyimpan jadwal.");
    } finally {
      setIsSavingInline(false);
    }
  };

  return (
    <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-emerald-950">
          <CalendarIcon className="w-3.5 h-3.5 text-emerald-700" />
          Jadwal Posting & Caption
        </span>

        {Boolean(canEditSchedule) && !posted && !isEditing && (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-300 text-[11px] font-bold text-emerald-800 transition cursor-pointer"
          >
            <Edit3 className="w-3 h-3" />
            {displayDate || displayTime ? "Edit Jadwal" : "Tambah Jadwal"}
          </button>
        )}
      </div>

      {Boolean(canEditSchedule) && isEditing && !posted ? (
        <form onSubmit={handleSaveInline} className="space-y-2.5 pt-0.5">
          <HybridDateTimeInputs
              compact
              dateVal={dateVal}
              timeVal={timeVal}
              onChangeDate={setDateVal}
              onChangeTime={setTimeVal}
            />

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
              Caption Video <span className="font-normal text-slate-400">(opsional)</span>
            </label>
            <textarea
              rows={2}
              value={captionVal}
              onChange={(e) => setCaptionVal(e.target.value)}
              placeholder="Tulis caption video (opsional)..."
              className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-emerald-300 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex items-center justify-end gap-2">
            {(displayDate || displayTime) && (
              <button
                type="button"
                disabled={isSavingInline}
                onClick={() => {
                  setDateVal(displayDate || getLocalDateStr(new Date()));
                  setTimeVal(displayTime || "10:00");
                  setCaptionVal(displayCaption);
                  setIsEditing(false);
                }}
                className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Batal
              </button>
            )}
            <button
              type="submit"
              disabled={isSavingInline}
              className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-[11px] font-bold transition cursor-pointer"
            >
              <Save className="w-3 h-3" />
              {isSavingInline ? "Menyimpan..." : "Simpan Jadwal"}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
            <div className="bg-white/95 px-2.5 py-1.5 rounded-xl border border-emerald-100">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block">Tanggal</span>
              <span className="font-bold text-slate-800">{displayDate ? formatDateToDDMMYYYY(displayDate) : "Belum diatur"}</span>
            </div>
            <div className="bg-white/95 px-2.5 py-1.5 rounded-xl border border-emerald-100">
              <span className="text-[10px] uppercase font-semibold text-slate-400 block">Jam Upload</span>
              <span className="font-bold text-slate-800">
                {displayTime ? `${normalizeTime24h(displayTime) || displayTime} WIB` : "Belum diatur"}
              </span>
            </div>
          </div>

          <div className="bg-white/95 px-2.5 py-2 rounded-xl border border-emerald-100 text-xs">
            <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-0.5">
              Caption Video (Opsional)
            </span>
            <p className="text-slate-700 whitespace-pre-line break-words">
              {displayCaption || <span className="italic text-slate-400">Tidak ada caption</span>}
            </p>
          </div>
        </div>
      )}

      {savedNotice && (
        <p className="text-[11px] font-bold text-emerald-800">{savedNotice}</p>
      )}
    </div>
  );
}

export default function PostingSchedulePanel({
  orders = [],
  canEditSchedule = false,
  onSelectOrder,
  onOpenEditSchedule,
}) {
  const now = new Date();
  const todayStr = getLocalDateStr(now);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [viewMonth, setViewMonth] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1));

  const scheduledOrders = useMemo(() => {
    const list = Array.isArray(orders) ? orders : [];
    return list.filter((ord) => {
      const hasSchedule = Boolean(getScheduleDateStr(ord) || getScheduleTimeStr(ord));
      const isReadyOrPosted = isOrderReadyToPostStatus(ord) || isOrderPostedStatus(ord);
      return hasSchedule || isReadyOrPosted;
    });
  }, [orders]);

  const countsByDate = useMemo(() => {
    const map = {};
    for (const ord of scheduledOrders) {
      const d = getScheduleDateStr(ord);
      if (!d) continue;
      if (!map[d]) map[d] = { total: 0, unposted: 0, posted: 0 };
      map[d].total += 1;
      if (isOrderPostedStatus(ord)) map[d].posted += 1;
      else map[d].unposted += 1;
    }
    return map;
  }, [scheduledOrders]);

  const dayOrders = useMemo(() => {
    return scheduledOrders
      .filter((ord) => getScheduleDateStr(ord) === selectedDate)
      .sort((a, b) => {
        const aPosted = isOrderPostedStatus(a) ? 1 : 0;
        const bPosted = isOrderPostedStatus(b) ? 1 : 0;
        if (aPosted !== bPosted) return aPosted - bPosted;
        return getScheduleTimeStr(a).localeCompare(getScheduleTimeStr(b));
      });
  }, [scheduledOrders, selectedDate]);

  const unpostedDayOrders = useMemo(
    () => dayOrders.filter((ord) => !isOrderPostedStatus(ord)),
    [dayOrders]
  );

  const calendarCells = useMemo(() => {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < firstDayIndex; i += 1) {
      cells.push({ type: "empty", key: `empty-${i}` });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({
        type: "day",
        day,
        dateStr,
        stats: countsByDate[dateStr] || null,
      });
    }
    return cells;
  }, [viewMonth, countsByDate]);

  const changeMonth = (delta) => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  return (
    <aside className="w-full rounded-2xl bg-white border border-slate-200 shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-slate-900">
            <CalendarIcon className="w-4 h-4 text-emerald-600" />
            Kalender & Jadwal Posting
          </span>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Catatan konten terjadwal per tanggal & status tayang
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setSelectedDate(todayStr);
            setViewMonth(new Date(now.getFullYear(), now.getMonth(), 1));
          }}
          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-700 transition cursor-pointer"
        >
          Hari Ini
        </button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-800">
            {MONTH_NAMES_ID[viewMonth.getMonth()]} {viewMonth.getFullYear()}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
              aria-label="Bulan sebelumnya"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 cursor-pointer"
              aria-label="Bulan berikutnya"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center mb-1">
          {DAY_NAMES_ID.map((d) => (
            <span key={d} className="text-[10px] font-bold text-slate-400">
              {d}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((cell) => {
            if (cell.type === "empty") {
              return <div key={cell.key} className="h-8" />;
            }
            const isSelected = cell.dateStr === selectedDate;
            const isToday = cell.dateStr === todayStr;
            const hasUnposted = Boolean(cell.stats && cell.stats.unposted > 0);
            const hasAny = Boolean(cell.stats && cell.stats.total > 0);

            return (
              <button
                key={cell.dateStr}
                type="button"
                onClick={() => setSelectedDate(cell.dateStr)}
                className={`h-8 rounded-lg flex flex-col items-center justify-center text-[11px] font-semibold transition relative cursor-pointer ${
                  isSelected
                    ? "bg-emerald-600 text-white font-bold shadow-sm"
                    : hasUnposted
                    ? "bg-rose-50 text-rose-800 border border-rose-300 font-bold hover:bg-rose-100"
                    : isToday
                    ? "bg-sky-50 text-sky-800 border border-sky-200 font-bold"
                    : "hover:bg-slate-100 text-slate-700"
                }`}
              >
                <span>{cell.day}</span>
                {hasAny && (
                  <span
                    className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                      isSelected
                        ? "bg-white"
                        : hasUnposted
                        ? "bg-rose-600"
                        : "bg-emerald-500"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold text-slate-900">
            Catatan {selectedDate === todayStr ? "Hari Ini" : formatDateToDDMMYYYY(selectedDate)}
          </span>
          <span className="text-[11px] font-semibold text-slate-500">
            {dayOrders.length} konten
          </span>
        </div>

        {unpostedDayOrders.length > 0 && (
          <div className="p-2.5 rounded-xl bg-rose-600 text-white shadow-sm space-y-1">
            <div className="flex items-center gap-1.5 text-xs font-extrabold">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                Pengingat: {unpostedDayOrders.length} konten belum diposting!
              </span>
            </div>
            <p className="text-[11px] text-rose-50 leading-snug">
              Segera posting sesuai jam tayang yang sudah ditentukan agar tidak terlewat.
            </p>
          </div>
        )}

        {dayOrders.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-500">
            Belum ada konten terjadwal pada tanggal <span className="font-semibold">{formatDateToDDMMYYYY(selectedDate)}</span>.
          </div>
        ) : (
          <div className="space-y-2 max-h-[640px] overflow-y-auto pr-0.5">
            {dayOrders.map((ord) => {
              const posted = isOrderPostedStatus(ord);
              const reminder = getReminderInfo(ord, now);
              const brandLabel = getOrderBrandLabel(ord);
              const timeStr = getScheduleTimeStr(ord);
              const captionText = String(
                ord?.scheduledCaption ?? ord?.postCaption ?? ord?.caption ?? ""
              ).trim();

              return (
                <div
                  key={ord.docId || ord.id || ord.title}
                  className={`p-3 rounded-xl border-2 transition space-y-1.5 ${
                    posted
                      ? "bg-emerald-50/60 border-emerald-200 text-slate-800"
                      : reminder.isOverdue
    ? "bg-rose-50/75 border-rose-300 shadow-xs"
    : reminder.isApproaching
    ? "bg-amber-50/75 border-amber-300 shadow-xs"
    : "bg-emerald-50/75 border-emerald-300 shadow-xs"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded-md bg-slate-900 text-white text-[10px] font-bold">
                          {brandLabel}
                        </span>
                        {timeStr && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/90 border border-slate-200 text-[10px] font-bold text-slate-800">
                            <Clock className="w-3 h-3" />
                            {timeStr} WIB
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-extrabold text-slate-900 mt-1 truncate">
                        {ord.title || ord.id || "Konten Video"}
                      </p>
                    </div>

                    <span
                      className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        posted
                          ? "bg-emerald-600 text-white"
                          : "bg-rose-600 text-white animate-pulse"
                      }`}
                    >
                      {posted ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" />
                          Sudah Diposting
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-3 h-3" />
                          Belum Diposting
                        </>
                      )}
                    </span>
                  </div>

                  {!posted && (
                    <div
                      className={`p-2 rounded-lg text-[11px] font-bold leading-snug ${
                        reminder.isOverdue
    ? "bg-rose-100/90 border border-rose-300/90 text-rose-900 px-3 py-2 rounded-xl"
    : reminder.isApproaching
    ? "bg-amber-100/90 border border-amber-300/90 text-amber-950 px-3 py-2 rounded-xl"
    : "bg-emerald-100/90 border border-emerald-300/90 text-emerald-950 px-3 py-2 rounded-xl"
                      }`}
                    >
                      {reminder.message}
                    </div>
                  )}

                  {captionText && (
                    <p className="text-[11px] text-slate-600 line-clamp-2 bg-white/70 px-2 py-1 rounded-lg border border-slate-200/70">
                      Caption: {captionText}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1">
                    
                    {typeof onSelectOrder === "function" && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelectOrder(ord);
                        }}
                        className="relative z-20 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-900 text-[10px] font-bold text-white cursor-pointer"
                      >
                        Detail
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
