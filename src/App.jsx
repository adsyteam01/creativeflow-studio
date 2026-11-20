import React, { useState, useEffect, useMemo } from "react";
import { Plus, Search, Clock, AlertCircle, Play, Pause, Volume2, VolumeX, Download, Bell, Film, LogOut, X, Smartphone, ChevronRight, Database, CheckCircle2, RotateCcw, Send, Wrench, Eye, EyeOff } from "lucide-react";
import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, setDoc, addDoc, updateDoc, onSnapshot, query, orderBy, serverTimestamp, getDoc } from "firebase/firestore";

const BRAND_LOGO_URL = "/Logo_3.jpeg";
const ROLES = ["Brand Manager", "Video Editor"];
const PLATFORMS = ["TikTok", "Instagram Reels", "YouTube Shorts"];

const STATUS_CONFIG = {
  "Antrean": { label: "Antrean", badgeClass: "bg-sky-50 text-sky-700 border-sky-200", dotClass: "bg-sky-500" },
  "Sedang Dikerjakan": { label: "Sedang Dikerjakan", badgeClass: "bg-amber-50 text-amber-700 border-amber-200", dotClass: "bg-amber-500" },
  "Review": { label: "Review", badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200", dotClass: "bg-indigo-500" },
  "Revisi": { label: "Revisi", badgeClass: "bg-rose-50 text-rose-700 border-rose-200", dotClass: "bg-rose-500" },
  "Selesai": { label: "Selesai", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200", dotClass: "bg-emerald-500" },
};

function normalizeWhatsApp(raw) {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
}

function BrandLogo({ sizeClass = "w-11 h-11" }) {
  const [imgError, setImgError] = useState(false);
  return (
    <div className={sizeClass + " rounded-full overflow-hidden border-2 border-amber-400 bg-gradient-to-br from-sky-50 to-amber-50 shadow-sm flex items-center justify-center shrink-0"}>
      {!imgError ? (
        <img src={BRAND_LOGO_URL} alt="CreativeFlow Studio Logo" onError={() => setImgError(true)} className="w-full h-full object-cover rounded-full" />
      ) : (
        <span className="font-bold text-xs text-sky-700">CF</span>
      )}
    </div>
  );
}

function extractGoogleDriveId(url) {
  if (!url) return "";
  const matchFile = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFile && matchFile[1]) return matchFile[1];
  const matchId = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId && matchId[1]) return matchId[1];
  return "";
}

function VideoPreviewPlayer({ previewUrl, title, platform }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = React.useRef(null);

  const driveId = useMemo(() => extractGoogleDriveId(previewUrl), [previewUrl]);
  const drivePreviewUrl = driveId ? "https://drive.google.com/file/d/" + driveId + "/preview" : "";
  const driveDownloadUrl = driveId ? "https://drive.google.com/uc?export=download&id=" + driveId : previewUrl;

  useEffect(() => {
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [previewUrl]);

  const togglePlay = () => {
    if (!videoRef.current || !previewUrl) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleDownload = async () => {
    if (!previewUrl) return;
    if (driveId) {
      window.open(driveDownloadUrl, "_blank", "noopener,noreferrer");
      return;
    }
    try {
      const response = await fetch(previewUrl);
      if (!response.ok) throw new Error("fetch failed");
      const blob = await response.blob();
      if (!blob || blob.size === 0) throw new Error("empty blob");
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const safeName = (title || "video-9x16").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      a.download = safeName + ".mp4";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(previewUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="w-full max-w-[270px] mx-auto flex flex-col gap-2">
      <div className="flex items-center justify-between gap-1.5">
        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-800 border border-sky-200 truncate">
          9:16 • {platform}
        </span>
        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
          {driveId ? "Drive" : "MP4"}
        </span>
      </div>

      <div className="w-full aspect-[9/16] rounded-2xl overflow-hidden bg-slate-900 border-2 border-sky-200 shadow-sm flex items-center justify-center">
        {previewUrl ? (
          driveId ? (
            <iframe
              src={drivePreviewUrl}
              title={title || "Preview Video Google Drive"}
              allow="autoplay; encrypted-media"
              allowFullScreen
              className="w-[112%] h-[106%] -ml-[4%] -mt-[3%] border-0 block"
            />
          ) : (
            <video
              ref={videoRef}
              src={previewUrl}
              muted={isMuted}
              loop
              playsInline
              onClick={togglePlay}
              className="w-full h-full object-cover cursor-pointer block"
            />
          )
        ) : (
          <div className="p-4 text-center text-slate-300 flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-sky-500/20 border border-sky-400/40 flex items-center justify-center text-sky-300">
              <Film className="w-5 h-5" />
            </div>
            <p className="text-xs font-semibold text-white">Frame Vertikal 9:16</p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Belum ada link preview untuk <span className="text-amber-300">{title}</span>.
            </p>
          </div>
        )}
      </div>

      {previewUrl && !driveId && (
        <div className="w-full grid grid-cols-2 gap-1.5 bg-slate-100 border border-slate-200 p-1.5 rounded-xl">
          <button
            type="button"
            onClick={togglePlay}
            className="w-full h-8 inline-flex items-center justify-center gap-1 px-2 rounded-lg bg-white hover:bg-sky-50 text-white border border-slate-200 text-xs font-semibold transition cursor-pointer"
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 text-sky-700" /> : <Play className="w-3.5 h-3.5 text-sky-700" />}
            {isPlaying ? "Jeda" : "Putar"}
          </button>

          <button
            type="button"
            onClick={toggleMute}
            className="w-full h-8 inline-flex items-center justify-center gap-1 px-2 rounded-lg bg-white hover:bg-amber-50 text-slate-700 border border-slate-200 text-xs font-semibold transition cursor-pointer"
            title={isMuted ? "Nyalakan Suara" : "Bisukan"}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-amber-600" /> : <Volume2 className="w-3.5 h-3.5 text-sky-700" />}
            <span>{isMuted ? "Mute" : "Audio"}</span>
          </button>
        </div>
      )}

      {previewUrl && driveId && (
        <a
          href={previewUrl}
          target="_blank"
          rel="noreferrer"
          className="w-full h-9 inline-flex items-center justify-center gap-1.5 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-semibold transition"
        >
          Buka di Google Drive
        </a>
      )}

      {previewUrl && (
        <button
          type="button"
          onClick={handleDownload}
          className="w-full h-9 inline-flex items-center justify-center gap-1.5 px-3 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          Unduh Video
        </button>
      )}
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [teamUsers, setTeamUsers] = useState([]);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regRole, setRegRole] = useState("Social Media Specialist");
  const [regWhatsapp, setRegWhatsapp] = useState("");
  const [authError, setAuthError] = useState("");
  const [submittingAuth, setSubmittingAuth] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [resetError, setResetError] = useState("");
  const [sendingReset, setSendingReset] = useState(false);

  const [orders, setOrders] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Semua");
  const [platformFilter, setPlatformFilter] = useState("Semua");

  const [isNewOrderOpen, setIsNewOrderOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [isWaModalOpen, setIsWaModalOpen] = useState(false);

  // State khusus alur submit editor & catatan revisi BM/SMS
  const [showEditorSubmitTab, setShowEditorSubmitTab] = useState(false);
  const [editorVideoUrl, setEditorVideoUrl] = useState("");
  const [showRevisionInput, setShowRevisionInput] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [newPlatform, setNewPlatform] = useState("TikTok");
  const TIKTOK_CONTENT_TYPES = [
  "Gudang",
  "Motion Graphic",
  "Trend",
  "QnA /Talking head Pemasaran",
  "One Person Conversation",
  "No Face",
  "Story Talling Gudang"
];

const sanitizeContentTypes = (list) =>
  (Array.isArray(list) ? list : []).filter(
    (item) => typeof item === "string" && !item.toLowerCase().includes("soft selling")
  );
const [newContentType, setNewContentType] = useState("");
  const [tiktokAccounts, setTiktokAccounts] = useState(() => {
  const [isTiktokDropdownOpen, setIsTiktokDropdownOpen] = useState(false);
    try {
      const saved = JSON.parse(localStorage.getItem("cf_tiktok_accounts") || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [isAddTiktokModalOpen, setIsAddTiktokModalOpen] = useState(false);
  const [ttBrandName, setTtBrandName] = useState("");
  const [ttAccountName, setTtAccountName] = useState("");
  const [ttSelectedTypes, setTtSelectedTypes] = useState([]);

  const toggleTtContentType = (typeName) => {
    setTtSelectedTypes((prev) =>
      prev.includes(typeName) ? prev.filter((item) => item !== typeName) : [...prev, typeName]
    );
  };

  const handleSaveTiktokAccount = (e) => {
    e.preventDefault();
    const cleanBrand = ttBrandName.trim();
    let cleanAccount = ttAccountName.trim();
    if (!cleanBrand || !cleanAccount || ttSelectedTypes.length === 0) return;
    if (!cleanAccount.startsWith("@")) cleanAccount = "@" + cleanAccount;

    const newItem = {
      id: "tt_" + Date.now(),
      brandName: cleanBrand,
      accountName: cleanAccount,
      contentTypes: ttSelectedTypes
    };

    setTiktokAccounts((prev) => {
      const filtered = prev.filter(
        (item) => item.accountName.toLowerCase() !== cleanAccount.toLowerCase()
      );
      const updated = [newItem, ...filtered];
      try {
        localStorage.setItem("cf_tiktok_accounts", JSON.stringify(updated));
      } catch {}
      return updated;
    });

    setNewBrand(cleanAccount);
    setNewContentType(ttSelectedTypes[0] || "");
    setTtBrandName("");
    setTtAccountName("");
    setTtSelectedTypes([]);
    setIsAddTiktokModalOpen(false);
  };

  const matchedTiktokAccount = tiktokAccounts.find(
    (item) =>
      item.accountName.toLowerCase() === (newBrand || "").trim().toLowerCase() ||
      item.brandName.toLowerCase() === (newBrand || "").trim().toLowerCase()
  );
  const availableContentTypes = sanitizeContentTypes(
    matchedTiktokAccount && Array.isArray(matchedTiktokAccount.contentTypes) && matchedTiktokAccount.contentTypes.length > 0
      ? matchedTiktokAccount.contentTypes
      : TIKTOK_CONTENT_TYPES
  );
  const [newDeadline, setNewDeadline] = useState("2026-11-25");
  const [newPriority, setNewPriority] = useState("Normal");
  const [newBrief, setNewBrief] = useState("");
  const [newReferenceUrl, setNewReferenceUrl] = useState("");
  const [newRawFootageUrl, setNewRawFootageUrl] = useState("");
  const [newAssignedEditor, setNewAssignedEditor] = useState("");

  const [waWebhookUrl, setWaWebhookUrl] = useState(() => localStorage.getItem("cf_wa_webhook") || "");
  const [waLogs, setWaLogs] = useState([]);
  const [readWaLogIds, setReadWaLogIds] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("cf_read_wa_logs") || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const handleMarkAllWaAsRead = () => {
    const allIds = Array.from(new Set([...readWaLogIds, ...waLogs.map((l) => l.id).filter(Boolean)]));
    setReadWaLogIds(allIds);
    try {
      localStorage.setItem("cf_read_wa_logs", JSON.stringify(allIds));
    } catch {}
  };
  const [editWaNumber, setEditWaNumber] = useState("");

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const userSnap = await getDoc(doc(db, "teamUsers", fbUser.uid));
          if (userSnap.exists()) {
            const profile = { id: fbUser.uid, ...userSnap.data() };
            setCurrentUser(profile);
            setEditWaNumber(profile.whatsapp || "");
          } else {
            const fallbackProfile = {
              id: fbUser.uid,
              name: fbUser.email.split("@")[0],
              email: fbUser.email,
              role: "Social Media Specialist",
              whatsapp: "",
            };
            await setDoc(doc(db, "teamUsers", fbUser.uid), fallbackProfile);
            setCurrentUser(fallbackProfile);
          }
        } catch (err) {
          console.error("Gagal memuat profil Firestore:", err);
        }
      } else {
        setCurrentUser(null);
      }
      setAuthLoading(false);
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const unsubUsers = onSnapshot(collection(db, "teamUsers"), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTeamUsers(list);
      const firstEditor = list.find((u) => u.role === "Video Editor");
      if (firstEditor && !newAssignedEditor) {
        setNewAssignedEditor(firstEditor.name);
      }
    });

    const ordersQuery = query(collection(db, "orders"), orderBy("createdAtMs", "desc"));
    const unsubOrders = onSnapshot(ordersQuery, (snap) => {
      const list = snap.docs.map((d) => ({ docId: d.id, ...d.data() }));
      setOrders(list);
    });

    const logsQuery = query(collection(db, "waLogs"), orderBy("createdAtMs", "desc"));
    const unsubLogs = onSnapshot(logsQuery, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setWaLogs(list);
    });

    return () => {
      unsubUsers();
      unsubOrders();
      unsubLogs();
    };
  }, [currentUser]);

  const editors = useMemo(() => teamUsers.filter((u) => u.role === "Video Editor"), [teamUsers]);
  const selectedOrder = useMemo(() => orders.find((o) => o.docId === selectedOrderId) || null, [orders, selectedOrderId]);

  const openOrderDetail = (order) => {
    setSelectedOrderId(order.docId);
    setShowEditorSubmitTab(false);
    setEditorVideoUrl(order.previewUrl || "");
    setShowRevisionInput(false);
    setRevisionNote(order.revisionNote || "");
  };

  const triggerAutoWhatsApp = async ({ eventLabel, recipients, messageText }) => {
    const validRecipients = recipients.filter((r) => normalizeWhatsApp(r.whatsapp));
    if (validRecipients.length === 0) return;

    const nowText = new Date().toLocaleString("id-ID", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    const nowMs = Date.now();

    for (const rec of validRecipients) {
      await addDoc(collection(db, "waLogs"), {
        time: nowText,
        createdAtMs: nowMs,
        event: eventLabel,
        targetName: rec.name,
        targetRole: rec.role,
        phone: normalizeWhatsApp(rec.whatsapp),
        message: messageText,
      });
    }

    const endpointUrl = (typeof waWebhookUrl === "string" ? waWebhookUrl.trim() : "") || "/api/send-wa";
    try {
      await fetch(endpointUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "CreativeFlow Studio",
          event: eventLabel,
          message: messageText,
          recipients: validRecipients.map((r) => ({
            name: r.name,
            role: r.role,
            phone: normalizeWhatsApp(r.whatsapp),
          })),
        }),
      });
    } catch (err) {
      console.error("Gagal mengirim notifikasi WA:", err);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError("");
    setSubmittingAuth(true);
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
    } catch {
      setAuthError("Email atau kata sandi salah, atau akun belum terdaftar di Firebase.");
    } finally {
      setSubmittingAuth(false);
    }
  };

  const handleSendPasswordReset = async (e) => {
    e.preventDefault();
    setResetError("");
    setResetMessage("");
    const targetEmail = (resetEmail || loginEmail).trim();
    if (!targetEmail) {
      setResetError("Masukkan alamat email akun yang terdaftar terlebih dahulu.");
      return;
    }
    setSendingReset(true);
    try {
      await sendPasswordResetEmail(auth, targetEmail);
      setResetMessage("Tautan reset kata sandi telah dikirim ke " + targetEmail + ". Cek inbox atau folder Spam.");
    } catch {
      setResetError("Gagal mengirim email reset. Pastikan alamat email sudah terdaftar.");
    } finally {
      setSendingReset(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError("");
    const cleanPhone = normalizeWhatsApp(regWhatsapp);
    if (!regName.trim() || !regEmail.trim() || regPassword.length < 6) {
      setAuthError("Nama, email, dan kata sandi (minimal 6 karakter) wajib diisi.");
      return;
    }
    if (!cleanPhone || cleanPhone.length < 10) {
      setAuthError("Masukkan nomor WhatsApp aktif yang valid (contoh: 081234567890).");
      return;
    }
    setSubmittingAuth(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, regEmail.trim(), regPassword);
      const profile = {
        name: regName.trim(),
        email: regEmail.trim(),
        role: regRole,
        whatsapp: cleanPhone,
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(db, "teamUsers", cred.user.uid), profile);
      setCurrentUser({ id: cred.user.uid, ...profile });
      setEditWaNumber(cleanPhone);
      setRegName(""); setRegEmail(""); setRegPassword(""); setRegWhatsapp("");
    } catch (err) {
      setAuthError(err.message || "Gagal mendaftar akun tim.");
    } finally {
      setSubmittingAuth(false);
    }
  };

  // 1. Order baru dibuat -> otomatis status "Antrean" + WA otomatis ke Editor
  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newBrand.trim() || !currentUser) return;

    const orderCode = "ORD-" + String((orders?.length ?? 0) + 1).padStart(3, "0");
    const assigned = newAssignedEditor || (editors[0] ? editors[0].name : "Belum Ditentukan");
    const nowText = new Date().toLocaleString("id-ID", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

    const newOrderData = {
      id: orderCode,
      title: newTitle.trim(),
      brand: newBrand.trim(),
        contentType: (newContentType || "").trim(),
      platform: "TikTok",
      platform: "TikTok",
      aspectRatio: "9:16",
      deadline: newDeadline,
      priority: newPriority,
      status: "Antrean",
      brief: newBrief.trim() || "Brief video vertikal 9:16 siap dikerjakan.",
      referenceUrl: newReferenceUrl.trim(),
        rawFootageUrl: newRawFootageUrl.trim(),
      previewUrl: "",
      revisionNote: "",
      requestedBy: currentUser.name,
      requestedByRole: currentUser.role,
      assignedEditor: assigned,
      createdAt: nowText,
      createdAtMs: Date.now(),
    };

    await addDoc(collection(db, "orders"), newOrderData);
    setIsNewOrderOpen(false);
    setNewTitle(""); setNewBrand(""); setNewBrief(""); setNewReferenceUrl("");
      setNewRawFootageUrl("");

    const targetEditors = teamUsers.filter((u) => u.role === "Video Editor" && (!assigned || u.name === assigned));
    await triggerAutoWhatsApp({
      eventLabel: "Order Baru Masuk (Antrean)",
      recipients: targetEditors.length > 0 ? targetEditors : editors,
      messageText: "[CreativeFlow Studio] Order baru " + orderCode + " (" + newOrderData.brand + " - " + newOrderData.platform + " 9:16): \"" + newOrderData.title + "\" dari " + currentUser.name + " (" + currentUser.role + "). Deadline: " + newOrderData.deadline,
    });
  };

  // 2. Editor klik "Sedang Dikerjakan" -> status jadi "Sedang Dikerjakan" + WA otomatis ke BM/SMS pemesan
  const handleEditorStartWork = async () => {
    if (!selectedOrder) return;
    await updateDoc(doc(db, "orders", selectedOrder.docId), {
      status: "Sedang Dikerjakan",
    });

    const stakeholders = teamUsers.filter((u) => u.name === selectedOrder.requestedBy || u.role === "Brand Manager");
    await triggerAutoWhatsApp({
      eventLabel: "Order Sedang Dikerjakan Editor",
      recipients: stakeholders,
      messageText: "[CreativeFlow Studio] Order " + selectedOrder.id + " (" + selectedOrder.brand + ") \"" + selectedOrder.title + "\" mulai dikerjakan oleh " + currentUser.name + ".",
    });
  };

  // 3. Editor isi link video lalu klik "Kirim" -> status jadi "Review" + WA otomatis ke BM & SMS
  const handleEditorSubmitVideo = async (e) => {
    e.preventDefault();
    if (!selectedOrder || !editorVideoUrl.trim()) return;

    await updateDoc(doc(db, "orders", selectedOrder.docId), {
      previewUrl: editorVideoUrl.trim(),
      status: "Review",
    });
    setShowEditorSubmitTab(false);

    const stakeholders = teamUsers.filter(
      (u) => u.name === selectedOrder.requestedBy || u.role === "Brand Manager" || u.role === "Social Media Specialist"
    );
    await triggerAutoWhatsApp({
      eventLabel: "Hasil Edit Dikirim (Review)",
      recipients: stakeholders,
      messageText: "[CreativeFlow Studio] Hasil edit order " + selectedOrder.id + " (" + selectedOrder.brand + ") \"" + selectedOrder.title + "\" telah dikirim oleh " + currentUser.name + " dan siap di-review.",
    });
  };

  // 4. BM / SMS klik "Revisi" -> status jadi "Revisi" + WA otomatis ke Editor
  const handleRequestRevision = async (e) => {
    e.preventDefault();
    if (!selectedOrder) return;

    await updateDoc(doc(db, "orders", selectedOrder.docId), {
      status: "Revisi",
      revisionNote: revisionNote.trim(),
    });
    setShowRevisionInput(false);

    const targetEditors = teamUsers.filter(
      (u) => u.role === "Video Editor" && (!selectedOrder.assignedEditor || u.name === selectedOrder.assignedEditor)
    );
    await triggerAutoWhatsApp({
      eventLabel: "Permintaan Revisi Order",
      recipients: targetEditors.length > 0 ? targetEditors : editors,
      messageText: "[CreativeFlow Studio] Order " + selectedOrder.id + " (" + selectedOrder.brand + ") \"" + selectedOrder.title + "\" perlu REVISI dari " + currentUser.name + (revisionNote.trim() ? ". Catatan: " + revisionNote.trim() : "."),
    });
  };

  // 5. BM / SMS klik "Selesai" -> status jadi "Selesai" & TANPA kirim WA
  const handleApproveComplete = async () => {
    if (!selectedOrder) return;
    await updateDoc(doc(db, "orders", selectedOrder.docId), {
      status: "Selesai",
    });
  };

  const handleSaveMyWhatsApp = async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    const cleanPhone = normalizeWhatsApp(editWaNumber);
    if (!cleanPhone || cleanPhone.length < 10) return;
    await updateDoc(doc(db, "teamUsers", currentUser.id), { whatsapp: cleanPhone });
    setCurrentUser((prev) => ({ ...prev, whatsapp: cleanPhone }));
  };

  const handleWebhookChange = (val) => {
    setWaWebhookUrl(val);
    localStorage.setItem("cf_wa_webhook", val);
  };

  const filteredOrders = useMemo(() => orders.filter((order) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch = (order.title || "").toLowerCase().includes(q) || (order.brand || "").toLowerCase().includes(q) || (order.id || "").toLowerCase().includes(q);
    return matchesSearch && (statusFilter === "Semua" || order.status === statusFilter) && (platformFilter === "Semua" || order.platform === platformFilter);
  }), [orders, searchQuery, statusFilter, platformFilter]);

  const stats = useMemo(() => ({
    total: (orders?.length ?? 0),
    queue: orders.filter((o) => o.status === "Antrean").length,
    inProgress: orders.filter((o) => o.status === "Sedang Dikerjakan" || o.status === "Revisi").length,
    reviewDone: orders.filter((o) => o.status === "Review" || o.status === "Selesai").length,
  }), [orders]);

  if (authLoading) {
    return (
      <div className="min-h-screen text-slate-900" style={{ backgroundImage: "linear-gradient(135deg, rgba(186, 230, 253, 0.45) 0%, rgba(240, 249, 255, 0.75) 50%, rgba(253, 230, 138, 0.42) 100%)" }}>
        Menghubungkan ke CreativeFlow Studio Cloud...
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-amber-50 text-slate-800 flex items-center justify-center p-4" style={{ backgroundImage: "linear-gradient(135deg, rgba(186, 230, 253, 0.45) 0%, rgba(240, 249, 255, 0.75) 50%, rgba(253, 230, 138, 0.42) 100%)" }}>
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 bg-white rounded-3xl border border-sky-100 shadow-xl overflow-hidden">
          <div className="lg:col-span-6 p-8 md:p-10 bg-gradient-to-b from-sky-600 to-sky-700 text-white flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3.5">
                <BrandLogo sizeClass="w-14 h-14" />
                <div className="text-left">
                  <h1 className="text-[28px] sm:text-[31px] font-bold tracking-tight leading-none">CreativeFlow Studio</h1>
                  <p className="text-amber-300 text-xs font-medium leading-snug mt-1">Portal Order & Antrean Edit Video Sosial Media Tim</p>
                </div>
              </div>

            </div>
            <div className="mt-8 pt-4 border-t border-white/15 text-xs text-sky-100">
              Role: <span className="text-amber-300 font-semibold">Brand Manager</span> • <span className="text-amber-300 font-semibold">Video Editor</span>
            </div>
          </div>

          <div className="lg:col-span-6 p-8 md:p-10 flex flex-col justify-center">
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl w-fit mb-6">
              <button type="button" onClick={() => { setAuthMode("login"); setAuthError(""); }} className={"px-4 py-2 rounded-lg text-sm font-semibold transition " + (authMode === "login" ? "bg-white text-sky-700 shadow-xs" : "text-slate-600")}>Masuk</button>
              <button type="button" onClick={() => { setAuthMode("register"); setAuthError(""); }} className={"px-4 py-2 rounded-lg text-sm font-semibold transition " + (authMode === "register" ? "bg-white text-sky-700 shadow-xs" : "text-slate-600")}>Daftar Akun Tim</button>
            </div>

            {authError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />{authError}
              </div>
            )}

            {authMode === "login" ? (
              <>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Tim</label>
                  <input type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="nama@creativeflow.id" className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Kata Sandi</label>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="••••••••" className="w-full pl-3.5 pr-10 py-2.5 rounded-xl border border-slate-200 text-sm" />
                    <button type="button" onClick={() => setShowPassword((prev) => !prev)} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer" title={showPassword ? "Sembunyikan kata sandi" : "Intip kata sandi"}>
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowResetForm((prev) => !prev);
                      setResetEmail(loginEmail);
                      setResetError("");
                      setResetMessage("");
                    }}
                    className="text-xs font-semibold text-sky-700 hover:text-sky-900 underline cursor-pointer"
                  >
                    Lupa kata sandi?
                  </button>
                </div>

                <button type="submit" disabled={submittingAuth} className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-60 text-white font-semibold text-sm transition cursor-pointer">
                  {submittingAuth ? "Memproses..." : "Masuk ke CreativeFlow Studio"}
                </button>
              </form>

              {showResetForm && (
                <form onSubmit={handleSendPasswordReset} className="mt-4 p-4 rounded-2xl bg-sky-50/80 border border-sky-200 space-y-3">
                  <div className="text-xs font-bold text-slate-800">Reset Kata Sandi via Email</div>
                  <p className="text-[11px] text-slate-600">Masukkan email akun tim kamu. Kami akan mengirimkan tautan untuk mengatur ulang kata sandi.</p>
                  <input
                    type="email"
                    required
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder="nama@creativeflow.id"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs"
                  />
                  {resetError && (
                    <div className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 px-3 py-2 rounded-xl">
                      {resetError}
                    </div>
                  )}
                  {resetMessage && (
                    <div className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
                      {resetMessage}
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowResetForm(false)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 cursor-pointer"
                    >
                      Tutup
                    </button>
                    <button
                      type="submit"
                      disabled={sendingReset}
                      className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-slate-950 text-xs font-semibold transition cursor-pointer"
                    >
                      {sendingReset ? "Mengirim..." : "Kirim Link Reset"}
                    </button>
                  </div>
                </form>
              )}
              </>
            ) : (
              <form onSubmit={handleRegister} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Lengkap</label>
                  <input type="text" required value={regName} onChange={(e) => setRegName(e.target.value)} placeholder="Contoh: Sinta Maharani" className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Email</label>
                    <input type="email" required value={regEmail} onChange={(e) => setRegEmail(e.target.value)} placeholder="sinta@creativeflow.id" className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor WhatsApp Aktif</label>
                    <input type="tel" required value={regWhatsapp} onChange={(e) => setRegWhatsapp(e.target.value)} placeholder="081234567890" className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Role Tim</label>
                    <select value={regRole} onChange={(e) => setRegRole(e.target.value)} className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm bg-white">
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Kata Sandi</label>
                    <div className="relative">
                      <input type={showPassword ? "text" : "password"} required value={regPassword} onChange={(e) => setRegPassword(e.target.value)} placeholder="Minimal 6 karakter" className="w-full pl-3.5 pr-10 py-2 rounded-xl border border-slate-200 text-sm" />
                      <button type="button" onClick={() => setShowPassword((prev) => !prev)} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 cursor-pointer" title={showPassword ? "Sembunyikan kata sandi" : "Intip kata sandi"}>
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
                <button type="submit" disabled={submittingAuth} className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-slate-950 font-semibold text-sm transition cursor-pointer">
                  {submittingAuth ? "Memproses..." : "Daftar"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800" style={{ backgroundImage: "linear-gradient(135deg, rgba(186, 230, 253, 0.45) 0%, rgba(240, 249, 255, 0.75) 50%, rgba(253, 230, 138, 0.42) 100%)" }}>
      <header className="sticky top-0 z-30 bg-white/95 border-b border-sky-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo sizeClass="w-10 h-10" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-slate-900 truncate">CreativeFlow Studio</span>
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-200">9:16 Vertical</span>
              </div>
              <p className="text-[11px] text-slate-500 truncate">Portal Order & Antrean Edit Video Sosial Media Tim</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button type="button" onClick={() => setIsWaModalOpen(true)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 transition cursor-pointer">
              <Bell className="w-3.5 h-3.5 text-amber-600" />
              <span>Notif WA</span>
              <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold">{waLogs.filter((l) => !readWaLogIds.includes(l.id)).length}</span>
            </button>
            <div className="hidden md:flex flex-col items-end leading-tight">
              <span className="text-xs font-bold text-slate-800">{currentUser.name}</span>
              <span className="text-[11px] text-sky-700 font-medium">{currentUser.role} • +{currentUser.whatsapp}</span>
            </div>
            <button type="button" onClick={() => signOut(auth)} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer" title="Keluar"><LogOut className="w-4 h-4" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-sky-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Antrean Produksi Video Vertikal (9:16)</h2>
            <p className="text-xs text-slate-500 mt-0.5">Tersinkronisasi langsung dengan Firestore • Anggota tim terdaftar: {teamUsers.length} orang.</p>
          </div>
          {currentUser.role !== "Video Editor" && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
                type="button"
                onClick={() => setIsAddTiktokModalOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-bold cursor-pointer"
              >
                + Tambah Akun TikTok
              </button>
              <button type="button" onClick={() => setIsNewOrderOpen(true)} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition cursor-pointer shrink-0">
              <Plus className="w-4 h-4" />Buat Order Video
            </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80"><div className="text-xs font-medium text-slate-500">Total Order</div><div className="text-2xl font-bold text-slate-900 mt-1">{stats.total}</div></div>
          <div className="bg-white p-4 rounded-2xl border border-sky-200"><div className="text-xs font-medium text-sky-700">Dalam Antrean</div><div className="text-2xl font-bold text-sky-800 mt-1">{stats.queue}</div></div>
          <div className="bg-white p-4 rounded-2xl border border-amber-200"><div className="text-xs font-medium text-amber-700">Dikerjakan / Revisi</div><div className="text-2xl font-bold text-amber-800 mt-1">{stats.inProgress}</div></div>
          <div className="bg-white p-4 rounded-2xl border border-emerald-200"><div className="text-xs font-medium text-emerald-700">Review / Selesai</div><div className="text-2xl font-bold text-emerald-800 mt-1">{stats.reviewDone}</div></div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Cari ID order, judul konten, atau brand..." className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 text-sm" />
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-700">
              <option value="Semua">Semua Status</option>
              {Object.keys(STATUS_CONFIG).map((st) => <option key={st} value={st}>{st}</option>)}
            </select>
            <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-700">
              <option value="Semua">Semua Platform</option>
              {PLATFORMS.map((pl) => <option key={pl} value={pl}>{pl}</option>)}
            </select>
          </div>
        </div>

        {(filteredOrders?.length ?? 0) === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-sky-200 p-10 text-center space-y-2" style={{ backgroundImage: "linear-gradient(145deg, rgba(255, 255, 255, 0.92) 0%, rgba(240, 249, 255, 0.35) 58%, rgba(254, 243, 199, 0.38) 100%)" }}>
            <p className="text-sm font-bold text-slate-800">Belum ada order video di antrean</p>
            <p className="text-xs text-slate-500">Klik tombol "Buat Order Video" untuk menambahkan order pertama.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map((order) => {
              const st = STATUS_CONFIG[order.status] || STATUS_CONFIG["Antrean"];
              return (
                <div key={order.docId} onClick={() => openOrderDetail(order)} className="bg-white rounded-2xl border border-slate-200/90 hover:border-sky-400 p-5 hover:shadow-md transition flex flex-col justify-between gap-4 cursor-pointer">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-lg border border-sky-100">{order.id} • {order.brand}</span>
                      <span className={"inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border " + st.badgeClass}>
                        <span className={"w-1.5 h-1.5 rounded-full " + st.dotClass} />{st.label}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-base leading-snug">{order.title}</h3>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{order.brief}</p>
                    </div>
                  </div>
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200 font-semibold">{order.platform} (9:16)</span>
                      <span className="flex items-center gap-1 text-slate-500"><Clock className="w-3.5 h-3.5" />{order.deadline}</span>
                    </div>
                    <span className="inline-flex items-center gap-1 font-semibold text-sky-700">Detail <ChevronRight className="w-3.5 h-3.5" /></span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {isNewOrderOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-sky-100 max-w-lg w-full p-6 shadow-xl space-y-4" style={{ backgroundImage: "linear-gradient(145deg, rgba(255, 255, 255, 0.92) 0%, rgba(240, 249, 255, 0.35) 58%, rgba(254, 243, 199, 0.38) 100%)" }}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">Buat Order Video Vertikal (9:16)</h3>
              <button type="button" onClick={() => setIsNewOrderOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleCreateOrder} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="relative">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Akun Tiktok</label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={newBrand}
                      onFocus={() => setIsTiktokDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsTiktokDropdownOpen(false), 160)}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewBrand(val);
                        setIsTiktokDropdownOpen(true);
                        const found = tiktokAccounts.find(
                          (acc) =>
                            acc.accountName.toLowerCase() === val.trim().toLowerCase() ||
                            acc.brandName.toLowerCase() === val.trim().toLowerCase()
                        );
                        if (found) {
                          const cleanTypes = sanitizeContentTypes(found.contentTypes);
                          if (cleanTypes.length > 0) {
                            setNewContentType(cleanTypes[0]);
                          }
                        }
                      }}
                      placeholder="Pilih atau ketik @akun / brand..."
                      autoComplete="off"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 transition text-sm bg-white"
                    />
                  </div>
                  {isTiktokDropdownOpen && (
                    <div className="absolute left-0 right-0 mt-1.5 z-30 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1 transition-all duration-150">
                      {tiktokAccounts
                        .filter((acc) => {
                          const q = (newBrand || "").trim().toLowerCase();
                          if (!q) return true;
                          return (
                            acc.brandName.toLowerCase().includes(q) ||
                            acc.accountName.toLowerCase().includes(q)
                          );
                        })
                        .map((acc) => {
                          const cleanTypes = sanitizeContentTypes(acc.contentTypes);
                          return (
                            <button
                              key={acc.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setNewBrand(acc.accountName);
                                setNewContentType(cleanTypes[0] || "");
                                setIsTiktokDropdownOpen(false);
                              }}
                              className="w-full text-left px-3.5 py-2 hover:bg-sky-50/80 transition flex flex-col cursor-pointer border-b border-slate-50 last:border-b-0"
                            >
                              <span className="text-xs font-bold text-slate-900 leading-tight">
                                {acc.brandName}
                              </span>
                              <span className="text-[11px] font-medium text-sky-700 leading-tight mt-0.5">
                                {acc.accountName}
                              </span>
                            </button>
                          );
                        })}
                      {(tiktokAccounts?.length ?? 0) === 0 && (
                        <div className="px-3.5 py-2.5 text-xs text-slate-500">
                          Belum ada akun TikTok. Klik "+ Tambah Akun TikTok".
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Platform</label>
                  <select value="TikTok" onChange={() => setNewPlatform("TikTok")} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50 text-slate-800">
                    <option value="TikTok">TikTok</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis konten</label>
                  <select
                    required
                    value={availableContentTypes.includes(newContentType) ? newContentType : (availableContentTypes[0] || "")}
                    onChange={(e) => setNewContentType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 transition text-sm bg-white text-slate-800"
                  >
                    {availableContentTypes.map((ct) => (
                      <option key={ct} value={ct}>
                        {ct}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Konten</label>
                <input type="text" required value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Contoh: Hook 3 Detik Promo Spesial" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Link Referensi (Opsional)</label>
                <input type="url" value={newReferenceUrl} onChange={(e) => setNewReferenceUrl(e.target.value)} placeholder="https://..." className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Brief & Catatan Visual</label>
                <textarea required rows={3} value={newBrief} onChange={(e) => setNewBrief(e.target.value)} placeholder="Tulis hook, pacing, caption, atau referensi gaya edit..." className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Link RAW Footage <span className="text-rose-600">*</span></label>
                <input type="url" required value={newRawFootageUrl} onChange={(e) => setNewRawFootageUrl(e.target.value)} placeholder="https://drive.google.com/..." className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>

              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Deadline</label>
                  <input type="date" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Prioritas</label>
                  <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
                    <option value="Normal">Normal</option>
                    <option value="Tinggi">Tinggi</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Video Editor</label>
                  <select value={newAssignedEditor} onChange={(e) => setNewAssignedEditor(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white">
                    {editors.length === 0 ? <option value="">Semua Editor</option> : editors.map((ed) => <option key={ed.id} value={ed.name}>{ed.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setIsNewOrderOpen(false)} className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 cursor-pointer">Batal</button>
                <button type="submit" className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer">Kirim Order (Otomatis Antrean + WA)</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedOrder && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-sky-100 max-w-3xl w-full p-6 shadow-xl my-8" style={{ backgroundImage: "linear-gradient(145deg, rgba(255, 255, 255, 0.92) 0%, rgba(240, 249, 255, 0.35) 58%, rgba(254, 243, 199, 0.38) 100%)" }}>
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2.5 py-1 rounded-lg">{selectedOrder.id}</span>
                  <span className="text-xs font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">{selectedOrder.brand} • {selectedOrder.platform} (9:16)</span>
                  {(() => {
                    const st = STATUS_CONFIG[selectedOrder.status] || STATUS_CONFIG["Antrean"];
                    return (
                      <span className={"inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border " + st.badgeClass}>
                        <span className={"w-1.5 h-1.5 rounded-full " + st.dotClass} />
                        Status: {st.label}
                      </span>
                    );
                  })()}
                </div>
                <h3 className="text-lg font-bold text-slate-900 mt-2">{selectedOrder.title}</h3>
              </div>
              <button type="button" onClick={() => setSelectedOrderId(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-5">
              <div className="md:col-span-5">
                <VideoPreviewPlayer previewUrl={selectedOrder.previewUrl} title={selectedOrder.title} platform={selectedOrder.platform} />
              </div>

              <div className="md:col-span-7 space-y-4">
                <div className="text-xs text-slate-600 space-y-1.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200/70">
                  <div><span className="font-semibold text-slate-800">Pemesan:</span> {selectedOrder.requestedBy} ({selectedOrder.requestedByRole})</div>
                  <div><span className="font-semibold text-slate-800">Editor:</span> {selectedOrder.assignedEditor}</div>
                  <div><span className="font-semibold text-slate-800">Deadline:</span> {selectedOrder.deadline} • <span className="font-semibold">Prioritas:</span> {selectedOrder.priority}</div>
                  <div className="pt-1"><span className="font-semibold text-slate-800">Brief:</span> {selectedOrder.brief}</div>
                  {selectedOrder.referenceUrl && (
                    <div className="pt-1">
                      <span className="font-semibold text-slate-800">Referensi:</span>{" "}
                      <a href={selectedOrder.referenceUrl} target="_blank" rel="noreferrer" className="text-sky-700 underline break-all">{selectedOrder.referenceUrl}</a>
                    </div>
                  )}
                  {selectedOrder.revisionNote && (
                    <div className="mt-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">
                      <span className="font-bold">Catatan Revisi:</span> {selectedOrder.revisionNote}
                    </div>
                  )}
                </div>

                {/* PANEL AKSI BERDASARKAN ROLE */}
                {currentUser.role === "Video Editor" ? (
                  <div className="p-4 rounded-2xl bg-sky-50/70 border border-sky-200/80 space-y-3">
                    <div className="text-xs font-bold text-slate-800">Kontrol Pengerjaan Editor</div>

                    {(selectedOrder.status === "Antrean" || selectedOrder.status === "Revisi") && (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-600">
                          {selectedOrder.status === "Antrean"
                            ? "Order otomatis masuk antrean. Klik tombol di bawah saat kamu mulai mengerjakan."
                            : "Ada permintaan revisi. Klik tombol di bawah untuk mulai mengerjakan revisi."}
                        </p>
                        <button
                          type="button"
                          onClick={handleEditorStartWork}
                          className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs transition cursor-pointer"
                        >
                          <Wrench className="w-4 h-4" />
                          Sedang Dikerjakan
                        </button>
                      </div>
                    )}

                    {selectedOrder.status === "Sedang Dikerjakan" && (
                      <div className="space-y-3">
                        {!showEditorSubmitTab ? (
                          <button
                            type="button"
                            onClick={() => setShowEditorSubmitTab(true)}
                            className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            Selesai
                          </button>
                        ) : (
                          <form onSubmit={handleEditorSubmitVideo} className="p-3.5 rounded-xl bg-white border border-sky-200 space-y-3">
                            <div className="text-xs font-bold text-sky-900">Kirim Link Hasil Edit Video (9:16)</div>
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Link Video Hasil Edit (MP4)</label>
                              <input
                                type="url"
                                required
                                value={editorVideoUrl}
                                onChange={(e) => setEditorVideoUrl(e.target.value)}
                                placeholder="https://.../hasil-video-9x16.mp4"
                                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => setShowEditorSubmitTab(false)}
                                className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 cursor-pointer"
                              >
                                Batal
                              </button>
                              <button
                                type="submit"
                                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs transition cursor-pointer"
                              >
                                <Send className="w-3.5 h-3.5" />
                                Kirim (Status jadi Review + Notif WA)
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    )}

                    {selectedOrder.status === "Review" && (
                      <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-800 font-medium">
                        Video sudah dikirim dan berstatus <span className="font-bold">Review</span>. Menunggu keputusan Brand Manager atau Social Media Specialist (Revisi / Selesai).
                      </div>
                    )}

                    {selectedOrder.status === "Selesai" && (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
                        Order ini telah dinyatakan <span className="font-bold">Selesai</span>.
                      </div>
                    )}
                  </div>
                ) : (
                  /* PANEL UNTUK BRAND MANAGER & SOCIAL MEDIA SPECIALIST */
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Keputusan Review Order</span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        {selectedOrder.status === "Antrean" && "Keterangan: Masih dalam antrean editor"}
                        {selectedOrder.status === "Sedang Dikerjakan" && "Keterangan: Sedang dikerjakan oleh editor"}
                        {selectedOrder.status === "Revisi" && "Keterangan: Sedang direvisi oleh editor"}
                        {selectedOrder.status === "Review" && "Keterangan: Editor sudah kirim hasil, siap review"}
                        {selectedOrder.status === "Selesai" && "Keterangan: Order sudah selesai"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        disabled={selectedOrder.status !== "Review"}
                        onClick={() => setShowRevisionInput(true)}
                        className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold text-xs transition cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Revisi
                      </button>

                      <button
                        type="button"
                        disabled={selectedOrder.status !== "Review"}
                        onClick={handleApproveComplete}
                        className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold text-xs transition cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Selesai
                      </button>
                    </div>

                    {selectedOrder.status !== "Review" && (
                      <p className="text-[11px] text-slate-500">
                        Tombol <span className="font-semibold">Revisi</span> dan <span className="font-semibold">Selesai</span> hanya aktif setelah editor mengirim hasil video (status <span className="font-semibold text-indigo-700">Review</span>).
                      </p>
                    )}

                    {showRevisionInput && selectedOrder.status === "Review" && (
                      <form onSubmit={handleRequestRevision} className="p-3 rounded-xl bg-white border border-rose-200 space-y-2.5">
                        <label className="block text-[11px] font-bold text-rose-800">Catatan Revisi untuk Editor (Opsional)</label>
                        <textarea
                          rows={2}
                          value={revisionNote}
                          onChange={(e) => setRevisionNote(e.target.value)}
                          placeholder="Tulis bagian yang perlu diperbaiki..."
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                        />
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setShowRevisionInput(false)} className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 cursor-pointer">Batal</button>
                          <button type="submit" className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer">Kirim Revisi + Notif WA Editor</button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {isWaModalOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-sky-100 max-w-2xl w-full p-6 shadow-xl my-8 space-y-5" style={{ backgroundImage: "linear-gradient(145deg, rgba(255, 255, 255, 0.92) 0%, rgba(240, 249, 255, 0.35) 58%, rgba(254, 243, 199, 0.38) 100%)" }}>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2"><Bell className="w-5 h-5 text-amber-500" /><h3 className="font-bold text-base text-slate-900">Pengaturan & Log Notifikasi WhatsApp Otomatis</h3></div>
              <button type="button" onClick={() => setIsWaModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSaveMyWhatsApp} className="flex flex-col sm:flex-row gap-2.5">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nomor WA Terdaftar Akun Kamu ({currentUser.name})</label>
                <input type="tel" value={editWaNumber} onChange={(e) => setEditWaNumber(e.target.value)} placeholder="6281234567890" className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm" />
              </div>
              <button type="submit" className="sm:self-end px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold cursor-pointer">Ganti Nomor WA</button>
            </form>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-bold text-slate-700">Riwayat Notifikasi WA (Tersimpan di Firestore)</div>
                <button type="button" onClick={handleMarkAllWaAsRead} className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold cursor-pointer">Tandai Semua Dibaca</button>
              </div>
              {waLogs.length === 0 ? (
                <p className="text-xs text-slate-400">Belum ada log notifikasi WA.</p>
              ) : waLogs.map((log) => {
                const isRead = readWaLogIds.includes(log.id);
                return (
                  <div key={log.id} className={`p-3 rounded-xl border border-slate-200/80 text-xs space-y-1 ${isRead ? "bg-slate-100/70 opacity-65" : "bg-slate-50"}`}>
                    <div className="flex items-center justify-between font-semibold text-slate-800">
                      <span>{log.event} → {log.targetName} (+{log.phone})</span>
                      <span className="text-[11px] text-slate-400">{log.time}</span>
                    </div>
                    <p className="text-slate-600">{log.message}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {isAddTiktokModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">Tambah Akun TikTok</h3>
              <button
                type="button"
                onClick={() => setIsAddTiktokModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveTiktokAccount} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Brand <span className="text-rose-600">*</span></label>
                <input
                  type="text"
                  required
                  value={ttBrandName}
                  onChange={(e) => setTtBrandName(e.target.value)}
                  placeholder="Contoh: PrimaGold"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Akun TikTok <span className="text-rose-600">*</span></label>
                <input
                  type="text"
                  required
                  value={ttAccountName}
                  onChange={(e) => setTtAccountName(e.target.value)}
                  placeholder="Contoh: @primagold.id"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Pilihan Jenis Konten (Bisa pilih lebih dari 1) <span className="text-rose-600">*</span>
                </label>
                <div className="space-y-1.5 max-h-52 overflow-y-auto p-2.5 rounded-xl border border-slate-200 bg-slate-50/70">
                  {TIKTOK_CONTENT_TYPES.map((ct) => {
                    const checked = ttSelectedTypes.includes(ct);
                    return (
                      <label key={ct} className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer py-0.5">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTtContentType(ct)}
                          className="rounded border-slate-300"
                        />
                        <span>{ct}</span>
                      </label>
                    );
                  })}
                </div>
                {ttSelectedTypes.length === 0 && (
                  <p className="text-[11px] text-rose-600 mt-1">Pilih minimal 1 jenis konten.</p>
                )}
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddTiktokModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={ttSelectedTypes.length === 0}
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
                >
                  Simpan Akun TikTok
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
