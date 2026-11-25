import React, { useState, useEffect, useMemo } from "react";
import { Plus, Search, Clock, AlertCircle, Play, Pause, Volume2, VolumeX, Download, Bell, Film, LogOut, X, Smartphone, ChevronRight, Database, CheckCircle2, RotateCcw, Send, Wrench, Eye, EyeOff, Trash2 } from "lucide-react";
import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, setDoc, addDoc, updateDoc, onSnapshot, query, orderBy, serverTimestamp, getDoc, deleteDoc } from "firebase/firestore";

import { WORKFLOW_ROLES, ORDER_STATUSES, normalizeWorkflowRole,
  getRoleLabel, validateOrderTransition, canViewAllTiktokAccounts, canCreateTiktokAccount, canCreateOrder, canCurateOrder, canMarkPosted } from "./workflowRules.js";
import { dispatchWorkflowWaNotifications } from "./waWorkflowNotifier.js";
const BRAND_LOGO_URL = "/Logo_3.jpeg";
function isOrderVisibleToCurrentEditor(order, editorUser) {
  if (!order || !editorUser) return false;
  const edName = String(editorUser?.name || editorUser?.fullName || "").trim().toLowerCase();
  const edEmail = String(editorUser?.email || "").trim().toLowerCase();
  const edUid = String(editorUser?.uid || editorUser?.id || "").trim();

  const assignedName = String(order?.assignedEditor || order?.editorName || "").trim().toLowerCase();
  const assignedEmail = String(order?.assignedEditorEmail || order?.editorEmail || "").trim().toLowerCase();
  const assignedUid = String(order?.assignedEditorUid || order?.editorUid || "").trim();
  const claimedBy = String(order?.claimedBy || order?.takenBy || "").trim().toLowerCase();
  const submittedBy = String(order?.submittedBy || "").trim().toLowerCase();

  const matchesCurrentEditor = (valName, valEmail, valUid) => {
    if (valUid && edUid && valUid === edUid) return true;
    if (valEmail && edEmail && valEmail === edEmail) return true;
    if (valName && edName && valName === edName) return true;
    if (valName && edEmail && valName === edEmail) return true;
    return false;
  };

  if (assignedName || assignedEmail || assignedUid) {
    return matchesCurrentEditor(assignedName, assignedEmail, assignedUid);
  }

  const st = String(order?.status || "").trim();
  if (claimedBy || submittedBy) {
    return (
      (claimedBy && ((edName && claimedBy === edName) || (edEmail && claimedBy === edEmail))) ||
      (submittedBy && ((edName && submittedBy === edName) || (edEmail && submittedBy === edEmail)))
    );
  }

  return st === "Antrean";
}

function normalizeTeamRole(rawRole, fallback = WORKFLOW_ROLES.BRAND_MANAGER) {
  return normalizeWorkflowRole(rawRole, fallback);
}

const ROLES = [
  WORKFLOW_ROLES.BRAND_MANAGER,
  WORKFLOW_ROLES.PRODUCTION,
  WORKFLOW_ROLES.EDITOR,
  WORKFLOW_ROLES.SOCIAL_MEDIA_MANAGER,
];
function sanitizeContentTypes(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const cleaned = String(item || "").trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

const PLATFORMS = ["TikTok", "Instagram Reels", "YouTube Shorts"];
const TIKTOK_CONTENT_TYPES = ["UGC", "Review", "Edukasi", "Hard Selling", "Soft Selling", "Storytelling"];

const STATUS_CONFIG = {
  "Antrean": { label: "Antrean", badgeClass: "bg-sky-50 text-sky-700 border-sky-200", dotClass: "bg-sky-500" },
  "Sedang Dikerjakan": { label: "Sedang Dikerjakan", badgeClass: "bg-amber-50 text-amber-700 border-amber-200", dotClass: "bg-amber-500" },
  "Kurasi BM": { label: "Kurasi BM", badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200", dotClass: "bg-indigo-500" },
  "Review": { label: "Kurasi BM", badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200", dotClass: "bg-indigo-500" },
  "Revisi": { label: "Revisi", badgeClass: "bg-rose-50 text-rose-700 border-rose-200", dotClass: "bg-rose-500" },
  "Siap Posting": { label: "Siap Posting", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200", dotClass: "bg-emerald-500" },
  "Selesai": { label: "Siap Posting", badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200", dotClass: "bg-emerald-500" },
  "Sudah Diposting": { label: "Sudah Diposting", badgeClass: "bg-sky-50 text-sky-700 border-sky-200", dotClass: "bg-sky-500" },
};

function getAccountWaStorageKey(prefix, user) {
  const uid = String(user?.uid || user?.id || "").trim();
  const email = String(user?.email || "").trim().toLowerCase();
  const name = String(user?.name || user?.fullName || "").trim().toLowerCase();
  const accountKey = uid || email || name || "guest";
  return `${prefix}_${encodeURIComponent(accountKey)}`;
}

function readWaListForUser(prefix, user) {
  try {
    const scopedKey = getAccountWaStorageKey(prefix, user);
    const rawScoped = localStorage.getItem(scopedKey);
    if (rawScoped !== null) {
      const parsed = JSON.parse(rawScoped);
      return Array.isArray(parsed) ? parsed : [];
    }
    return [];
  } catch {
    return [];
  }
}

function writeWaListForUser(prefix, user, list) {
  try {
    const scopedKey = getAccountWaStorageKey(prefix, user);
    localStorage.setItem(scopedKey, JSON.stringify((Array.isArray(list) ? list : []).slice(0, 100)));
  } catch {}
}

function isWaLogForCurrentAccount(log, user) {
  if (!log || !user) return false;
  const norm = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
  const userIds = new Set(
    [user?.uid, user?.userId, user?.id, user?.docId]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
  );
  const email = norm(user?.email);
  const name = norm(user?.name || user?.fullName);
  const phoneDigits = String(user?.whatsapp || user?.phone || "").replace(/\D/g, "");

  const logOwnerIds = new Set(
    [log?.ownerUid, log?.ownerUserId, log?.ownerId]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
  );
  const logOwnerEmail = norm(log?.ownerEmail);
  const logTargetIds = [log?.targetUid, log?.targetUserId, log?.targetId]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const logTargetEmail = norm(log?.targetEmail);
  const logTargetName = norm(log?.targetName);
  const logPhoneDigits = String(log?.phone || "").replace(/\D/g, "");

  const hasExplicitTarget = Boolean(logTargetIds.length > 0 || logTargetEmail || logTargetName || logPhoneDigits);

  if (logTargetIds.some((id) => userIds.has(id))) return true;
  if (email && logTargetEmail && logTargetEmail === email) return true;
  if (name && logTargetName && logTargetName === name) {
    return true;
  }
  if (email && logTargetName && logTargetName === email) return true;
  if (phoneDigits && logPhoneDigits && phoneDigits === logPhoneDigits) return true;

  // Jika target sudah ditentukan secara eksplisit tapi tidak cocok dengan user ini, jangan cocokkan ke owner
  if (hasExplicitTarget) return false;

  if ([...logOwnerIds].some((id) => userIds.has(id))) return true;
  if (email && logOwnerEmail && logOwnerEmail === email) return true;

  return false;
}

function getWaAccountKey(user) {
  const uid = String(user?.uid || user?.id || "").trim();
  const email = String(user?.email || "").trim().toLowerCase();
  const name = String(user?.name || user?.fullName || "").trim().toLowerCase();
  return encodeURIComponent(uid || email || name || "guest");
}

function loadAccountWaStorage(prefix, user) {
  try {
    const key = `${prefix}_${getWaAccountKey(user)}`;
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAccountWaStorage(prefix, user, list) {
  try {
    const key = `${prefix}_${getWaAccountKey(user)}`;
    localStorage.setItem(key, JSON.stringify((Array.isArray(list) ? list : []).slice(0, 100)));
  } catch {}
}

function resolveWaCanonicalAccountKey(userOrMember, allMembers = []) {
  const uid = String(userOrMember?.uid || userOrMember?.userId || userOrMember?.id || userOrMember?.docId || "").trim();
  const email = String(userOrMember?.email || "").trim().toLowerCase();
  const name = String(userOrMember?.name || userOrMember?.fullName || "").trim().toLowerCase();

  const members = Array.isArray(allMembers) ? allMembers : [];
  const matched = members.find((m) => {
    if (!m) return false;
    const mUid = String(m?.uid || m?.userId || m?.id || m?.docId || "").trim();
    const mEmail = String(m?.email || "").trim().toLowerCase();
    const mName = String(m?.name || m?.fullName || "").trim().toLowerCase();
    if (uid && mUid && uid === mUid) return true;
    if (email && mEmail && email === mEmail) return true;
    if (name && mName && name === mName) return true;
    return false;
  });

  const cUid = String(matched?.uid || matched?.userId || matched?.id || matched?.docId || uid || "").trim();
  const cEmail = String(matched?.email || email || "").trim().toLowerCase();
  const cName = String(matched?.name || matched?.fullName || name || "").trim().toLowerCase();
  return encodeURIComponent(cUid || cEmail || cName || "guest");
}

function belongsToWaAccount(log, user) {
  if (!log || !user) return false;
  const norm = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
  const userIds = new Set(
    [user?.uid, user?.userId, user?.id, user?.docId]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
  );
  const email = norm(user?.email);
  const name = norm(user?.name || user?.fullName);

  const logTargetIds = [log?.targetUid, log?.targetUserId, log?.targetId]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  const logTargetEmail = norm(log?.targetEmail);
  const logTargetName = norm(log?.targetName);
  const logBucketKey = String(log?.recipientBucketKey || "").trim();

  if (logTargetIds.some((id) => userIds.has(id))) return true;
  if (email && logTargetEmail && logTargetEmail === email) return true;
  if (name && logTargetName && logTargetName === name) {
    return true;
  }
  if (email && logTargetName && logTargetName === email) return true;

  if (logBucketKey) {
    const rawUserBucket = resolveWaCanonicalAccountKey(user);
    const nameOnlyBucket = name ? encodeURIComponent(name) : "";
    const emailOnlyBucket = email ? encodeURIComponent(email) : "";
    if (
      logBucketKey === rawUserBucket ||
      (nameOnlyBucket && logBucketKey === nameOnlyBucket) ||
      (emailOnlyBucket && logBucketKey === emailOnlyBucket)
    ) {
      return true;
    }
  }

  return false;
}

function normalizeWhatsApp(raw) {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
}

function extractRawWhatsAppField(obj) {
  if (!obj || typeof obj !== "object") return "";
  return (
    obj.whatsapp ||
    obj.wa ||
    obj.waNumber ||
    obj.whatsappNumber ||
    obj.phone ||
    obj.noWa ||
    obj.no_hp ||
    ""
  );
}

function resolveCurrentUserWhatsApp(user, usersList = []) {
  const direct = normalizeWhatsApp(extractRawWhatsAppField(user));
  if (direct) return direct;

  if (Array.isArray(usersList) && usersList.length > 0 && user) {
    const uid = String(user.uid || user.id || "").trim().toLowerCase();
    const email = String(user.email || "").trim().toLowerCase();
    const name = String(user.name || user.fullName || "").trim().toLowerCase();

    const matched = usersList.find((u) => {
      if (!u) return false;
      const uUid = String(u.uid || u.id || "").trim().toLowerCase();
      const uEmail = String(u.email || "").trim().toLowerCase();
      const uName = String(u.name || u.fullName || "").trim().toLowerCase();
      return (
        (uid && uUid && uid === uUid) ||
        (email && uEmail && email === uEmail) ||
        (name && uName && name === uName)
      );
    });

    const fromTeam = normalizeWhatsApp(extractRawWhatsAppField(matched));
    if (fromTeam) return fromTeam;
  }

  return "";
}

function BrandLogo({ sizeClass = "w-12 h-12 sm:w-14 sm:h-14" }) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={
        sizeClass +
        " rounded-full overflow-hidden border-2 border-amber-400 bg-white shadow-sm flex items-center justify-center shrink-0"
      }
      aria-label="CreativeFlow Studio Logo"
    >
      {!imgError ? (
        <img
          src="/Logo_3.jpeg"
          alt="CreativeFlow Studio Logo"
          onError={() => setImgError(true)}
          className="w-full h-full object-cover scale-[1.06]"
        />
      ) : (
        <span className="font-bold text-xs text-sky-700">ADSY</span>
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

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Render error tertangkap AppErrorBoundary:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-slate-950 text-white p-6 flex items-center justify-center">
          <div className="max-w-xl w-full rounded-2xl border border-rose-500/40 bg-slate-900 p-5 space-y-3">
            <h2 className="text-base font-bold text-rose-400">Terjadi Error Render pada Komponen</h2>
            <pre className="text-xs bg-slate-950 p-3 rounded-xl overflow-x-auto text-rose-200 whitespace-pre-wrap">
              {String(this.state.error?.stack || this.state.error?.message || this.state.error)}
            </pre>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="px-3.5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-xs font-semibold cursor-pointer"
            >
              Coba Render Ulang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function CreativeFlowApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [newContentType, setNewContentType] = useState("");
  const [newBrand, setNewBrand] = useState("");
  const [editWaNumber, setEditWaNumber] = useState("");
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState("login");
  const [teamUsers, setTeamUsers] = useState([]);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regRole, setRegRole] = useState("Brand Manager");
  const [regWhatsapp, setRegWhatsapp] = useState("");
  const [authError, setAuthError] = useState("");
  const [waLogs, setWaLogs] = useState([]);
  const [readWaLogIds, setReadWaLogIds] = useState([]);
  const [submittingAuth, setSubmittingAuth] = useState(false);

  useEffect(() => {
    if (!currentUser) {
      setWaLogs([]);
      setReadWaLogIds([]);
      return;
    }
    const scopedLogs = loadAccountWaStorage("cf_wa_logs", currentUser).filter((item) =>
      belongsToWaAccount(item, currentUser) || isWaLogForCurrentAccount(item, currentUser)
    );
    const scopedReadIds = loadAccountWaStorage("cf_read_wa_logs", currentUser);
    setWaLogs(scopedLogs);
    setReadWaLogIds(scopedReadIds);

    if (typeof onSnapshot !== "function" || typeof collection !== "function" || !db) {
      return;
    }

    let unsubscribe = () => {};
    try {
      const logsQuery = typeof query === "function" && typeof orderBy === "function"
        ? collection(db, "waLogs")
        : collection(db, "waLogs");
      unsubscribe = onSnapshot(
        logsQuery,
        (snapshot) => {
          const remoteItems = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() || {};
            const item = { id: data.id || docSnap.id, docId: docSnap.id, ...data };
            if (data?.event === "Orderan Baru Masuk Antrean") {
              if (import.meta.env.DEV) console.debug("[CF_WA_DEBUG]", {
                docId: docSnap.id,
                itemTarget: { name: item.targetName, email: item.targetEmail, uid: item.targetUid, bucket: item.recipientBucketKey, ownerUid: item.ownerUid },
                editorUser: { uid: currentUser?.uid, id: currentUser?.id, email: currentUser?.email, name: currentUser?.name, role: currentUser?.role },
                belongs: belongsToWaAccount(item, currentUser),
                isForCurrent: isWaLogForCurrentAccount(item, currentUser),
              });
            }
            if (belongsToWaAccount(item, currentUser) || isWaLogForCurrentAccount(item, currentUser)) {
              remoteItems.push(item);
            }
          });
          remoteItems.sort((a, b) => (Number(b?.createdAtMs || b?.createdAt?.toMillis?.() || 0) - Number(a?.createdAtMs || a?.createdAt?.toMillis?.() || 0)));
          const deduped = [];
          const seen = new Set();
          for (const item of remoteItems) {
            const key = String(item?.id || item?.docId || "");
            if (key && seen.has(key)) continue;
            if (key) seen.add(key);
            deduped.push(item);
          }
          const nextLogs = deduped.slice(0, 100);
          setWaLogs(nextLogs);
          saveAccountWaStorage("cf_wa_logs", currentUser, nextLogs);
        },
        (err) => {
          console.warn("Sinkronisasi waLogs Firestore terganggu:", err?.message || err);
        }
      );
    } catch (err) {
      console.warn("Gagal memasang listener waLogs:", err?.message || err);
    }

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [currentUser?.uid, currentUser?.id, currentUser?.email, currentUser?.name, currentUser?.role, currentUser?.whatsapp]);

  useEffect(() => {
    if (!currentUser) {
      setWaLogs([]);
      setReadWaLogIds([]);
      return;
    }
    const loadedLogs = readWaListForUser("cf_wa_logs", currentUser).filter((item) =>
      isWaLogForCurrentAccount(item, currentUser)
    );
    const loadedReadIds = readWaListForUser("cf_read_wa_logs", currentUser);
    setWaLogs(loadedLogs);
    setReadWaLogIds(loadedReadIds);
  }, [currentUser?.uid, currentUser?.id, currentUser?.email, currentUser?.name, currentUser?.whatsapp]);
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
  const [newTitle, setNewTitle] = useState("");
  const [newPlatform, setNewPlatform] = useState("TikTok");
  const [newBrief, setNewBrief] = useState("");
  const [newRawFootageUrl, setNewRawFootageUrl] = useState("");
  const [newReferenceUrl, setNewReferenceUrl] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [newPriority, setNewPriority] = useState("Normal");
  const [newAssignedEditor, setNewAssignedEditor] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [showContentHistory, setShowContentHistory] = useState(false);
  const [showProductivityPanel, setShowProductivityPanel] = useState(false);
  const [productivityRange, setProductivityRange] = useState("30d");
  const [productivityRoleFilter, setProductivityRoleFilter] = useState("Semua");
  const [productivitySearch, setProductivitySearch] = useState("");
  const [summaryPopupKey, setSummaryPopupKey] = useState(null);
  const selectedOrder = useMemo(() => {
    const list = Array.isArray(orders) ? orders : [];
    const targetId = typeof selectedOrderId !== "undefined" ? selectedOrderId : null;
    if (!targetId) return null;
    return (
      list.find(
        (o) =>
          String(o?.docId || "") === String(targetId) ||
          String(o?.id || "") === String(targetId)
      ) || null
    );
  }, [orders, selectedOrderId]);
  const [isWaModalOpen, setIsWaModalOpen] = useState(false);
  const [tiktokAccounts, setTiktokAccounts] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("cf_tiktok_accounts") || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [isTiktokDropdownOpen, setIsTiktokDropdownOpen] = useState(false);
  const [activeTiktokAccountId, setActiveTiktokAccountId] = useState(null);
  const [tiktokDrawerTab, setTiktokDrawerTab] = useState("monitoring"); // "monitoring" | "edit"
  const [viewsDraftMap, setViewsDraftMap] = useState({});
  const [savingViewsOrderId, setSavingViewsOrderId] = useState(null);
  const [editTtBrandName, setEditTtBrandName] = useState("");
  const [editTtAccountName, setEditTtAccountName] = useState("");
  const [editTtSelectedTypes, setEditTtSelectedTypes] = useState([]);
  const [editTtCustomType, setEditTtCustomType] = useState("");
  const [isSavingTtEdit, setIsSavingTtEdit] = useState(false);
  const [isDeletingTtAccount, setIsDeletingTtAccount] = useState(false);
  const [postingOrderDocId, setPostingOrderDocId] = useState(null);
  const [isDeletingOrder, setIsDeletingOrder] = useState(false);
  const [pendingDeleteOrder, setPendingDeleteOrder] = useState(null);
  const [accountSearchQuery, setAccountSearchQuery] = useState("");
  const [accountStatusFilter, setAccountStatusFilter] = useState("Semua");
  const [accountPlatformFilter, setAccountPlatformFilter] = useState("Semua");
  const [tiktokContentFilter, setTiktokContentFilter] = useState("Semua"); // "Semua" | "Siap Posting" | "Sudah Diposting" | "Proses"
  const [brandManagerContentTypes, setBrandManagerContentTypes] = useState([]);
  const [ttBrandLogo, setTtBrandLogo] = useState("");
  const [editTtBrandLogo, setEditTtBrandLogo] = useState("");
  const [isAddTiktokModalOpen, setIsAddTiktokModalOpen] = useState(false);
  const [ttBrandName, setTtBrandName] = useState("");
  const [ttAccountName, setTtAccountName] = useState("");
  const [ttSelectedTypes, setTtSelectedTypes] = useState([]);

  const readImageFileAsDataUrl = (file) =>
    new Promise((resolve, reject) => {
      if (!file) return resolve("");
      if (!file.type || !file.type.startsWith("image/")) {
        return reject(new Error("File harus berupa gambar (PNG, JPG, WEBP, dll)."));
      }
      if (file.size > 900 * 1024) {
        return reject(new Error("Ukuran logo maksimal 900 KB agar penyimpanan tetap ringan."));
      }
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("Gagal membaca file logo."));
      reader.readAsDataURL(file);
    });

  const handleTtLogoFileChange = async (e, target = "add") => {
    const file = e.target?.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await readImageFileAsDataUrl(file);
      if (target === "edit") {
        setEditTtBrandLogo(dataUrl);
      } else {
        setTtBrandLogo(dataUrl);
      }
    } catch (err) {
      alert(err?.message || "Gagal memuat logo.");
    } finally {
      e.target.value = "";
    }
  };

  const toggleEditTtContentType = (typeName) => {
    const clean = String(typeName || "").trim();
    if (!clean || typeof setEditTtSelectedTypes !== "function") return;
    setEditTtSelectedTypes((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      const exists = list.some((item) => String(item || "").trim().toLowerCase() === clean.toLowerCase());
      const next = exists
        ? list.filter((item) => String(item || "").trim().toLowerCase() !== clean.toLowerCase())
        : [...list, clean];
      return typeof sanitizeContentTypes === "function" ? sanitizeContentTypes(next) : next;
    });
  };

  const handleAddEditTtCustomType = (eOrValue) => {
    if (eOrValue && typeof eOrValue.preventDefault === "function") {
      eOrValue.preventDefault();
    }
    const rawInput =
      typeof eOrValue === "string"
        ? eOrValue
        : (typeof editTtCustomType !== "undefined" ? editTtCustomType : "");
    const cleanedCandidate =
      typeof sanitizeContentTypes === "function"
        ? sanitizeContentTypes([rawInput])[0] || String(rawInput || "").trim()
        : String(rawInput || "").trim();
    if (!cleanedCandidate) return;

    if (typeof setEditTtSelectedTypes === "function") {
      setEditTtSelectedTypes((prev) => {
        const current = Array.isArray(prev) ? prev : [];
        const exists = current.some(
          (item) => String(item || "").trim().toLowerCase() === cleanedCandidate.toLowerCase()
        );
        return exists ? current : [...current, cleanedCandidate];
      });
    }
    if (typeof setEditTtCustomType === "function") {
      setEditTtCustomType("");
    }
  };

    const toggleTtContentType = (typeName) => {
    setTtSelectedTypes((prev) =>
      prev.includes(typeName) ? prev.filter((item) => item !== typeName) : [...prev, typeName]
    );
  };

  const handleSaveTiktokAccount = async (e) => {
    e.preventDefault();
    if (!canCreateTiktokAccount(currentUser?.role)) return;
    const cleanBrand = ttBrandName.trim();
    let cleanAccount = ttAccountName.trim();
    if (!cleanBrand || !cleanAccount || (Array.isArray(ttSelectedTypes) ? ttSelectedTypes.length : 0) === 0) return;
    if (!cleanAccount.startsWith("@")) cleanAccount = "@" + cleanAccount;

    const cleanTypes = Array.isArray(ttSelectedTypes) ? ttSelectedTypes : [];
    const existingAccount = (Array.isArray(tiktokAccounts) ? tiktokAccounts : []).find(
      (item) => String(item?.accountName || "").toLowerCase() === cleanAccount.toLowerCase()
    );

    setIsSavingTtEdit(true);
    const createdAtMs = existingAccount?.createdAtMs || Date.now();
    const existingDocId = String(existingAccount?.docId || "").trim();
    const existingId = String(existingAccount?.id || "").trim();
    const hasFirestoreId = Boolean(existingDocId || (existingId && !existingId.startsWith("tt_")));
    const firestoreDocId = existingDocId || (hasFirestoreId ? existingId : "");

    const cleanLogo = (ttBrandLogo || "").trim();
    const actorUid = String(currentUser?.uid || currentUser?.userId || currentUser?.id || "").trim();
    const actorName = String(currentUser?.name || currentUser?.fullName || currentUser?.email || "").trim();

    const payload = {
      brandName: cleanBrand,
      accountName: cleanAccount,
      logoUrl: cleanLogo,
      brandLogo: cleanLogo,
      contentTypes: sanitizeContentTypes(cleanTypes),
      createdAtMs,
      updatedAtMs: Date.now(),
      ...(existingAccount ? {} : { createdByUid: actorUid, createdByName: actorName }),
    };

    try {
      let resolvedId = firestoreDocId || ("tt_" + Date.now());
      let resolvedDocId = firestoreDocId || "";

      if (db && typeof addDoc === "function" && typeof setDoc === "function" && typeof doc === "function" && typeof collection === "function") {
        if (firestoreDocId) {
          await setDoc(doc(db, "tiktokAccounts", firestoreDocId), { id: firestoreDocId, ...payload }, { merge: true });
          resolvedId = firestoreDocId;
          resolvedDocId = firestoreDocId;
        } else {
          const docRef = await addDoc(collection(db, "tiktokAccounts"), payload);
          resolvedId = docRef.id;
          resolvedDocId = docRef.id;
          await setDoc(docRef, { id: docRef.id }, { merge: true });
        }
      }

      const nextItem = {
        ...(existingAccount || {}),
        id: resolvedId,
        docId: resolvedDocId || existingAccount?.docId,
        ...payload,
      };

      setTiktokAccounts((prev) => {
        const safe = Array.isArray(prev) ? prev : [];
        const normHandle = cleanAccount.toLowerCase();
        const withoutDupes = safe.filter((item) => {
          if (!item) return false;
          const itemDocId = String(item.docId || "").trim();
          const itemId = String(item.id || "").trim();
          const itemHandle = String(item.accountName || "").trim().toLowerCase();
          const sameDoc = (resolvedDocId && itemDocId === resolvedDocId) || (existingDocId && itemDocId === existingDocId);
          const sameId = (resolvedId && itemId === resolvedId) || (existingId && itemId === existingId);
          const sameHandle = normHandle && itemHandle === normHandle;
          return !(sameDoc || sameId || sameHandle);
        });
        const updated = [nextItem, ...withoutDupes];
        try {
          localStorage.setItem("cf_tiktok_accounts", JSON.stringify(updated));
        } catch {}
        return updated;
      });

      if (typeof setIsAddTiktokModalOpen === "function") setIsAddTiktokModalOpen(false);
      if (typeof setTtBrandName === "function") setTtBrandName("");
      if (typeof setTtAccountName === "function") setTtAccountName("");
      if (typeof setTtSelectedTypes === "function") setTtSelectedTypes([]);
      if (typeof setTtBrandLogo === "function") setTtBrandLogo("");
      if (typeof setTiktokDrawerTab === "function") setTiktokDrawerTab("monitoring");
    } catch (err) {
      console.error("Gagal menyimpan akun TikTok ke Firestore:", err);
    } finally {
      setIsSavingTtEdit(false);
    }
  };

  const handleDeleteTiktokAccount = async () => {
    if (!activeTiktokAccount) return;
    const confirmed = window.confirm(
      "Hapus akun TikTok " + (activeTiktokAccount.accountName || activeTiktokAccount.brandName) + "? Riwayat order yang sudah ada tetap aman."
    );
    if (!confirmed) return;

    setIsDeletingTtAccount(true);
    const targetId = activeTiktokAccount.id;
    try {
      const hasFirestoreId = Boolean(targetId && !String(targetId).startsWith("tt_"));
      if (hasFirestoreId) {
        await deleteDoc(doc(db, "tiktokAccounts", targetId));
      }
      setTiktokAccounts((prev) => {
        const safe = Array.isArray(prev) ? prev : [];
        const remaining = safe.filter((item) => item.id !== targetId);
        try {
          localStorage.setItem("cf_tiktok_accounts", JSON.stringify(remaining));
        } catch {}
        return remaining;
      });
      setActiveTiktokAccountId(null);
    } catch (err) {
      console.error("Gagal menghapus akun TikTok:", err);
    } finally {
      setIsDeletingTtAccount(false);
    }
  };

  const handleMarkOrderAsPosted = async (order) => {
    if (!order || !order.docId) return;
    if (!canMarkPosted(currentUser?.role)) return;
    setPostingOrderDocId(order.docId);
    try {
      await updateDoc(doc(db, "orders", order.docId), {
        status: ORDER_STATUSES.POSTED,
        isPosted: true,
        postedAtMs: Date.now(),
        postedAt: serverTimestamp(),
      });
      await dispatchWorkflowWaNotifications({
        eventType: "posted_completed",
        order: { ...order, status: ORDER_STATUSES.POSTED, isPosted: true },
        teamMembers: typeof teamUsers !== "undefined" ? teamUsers : [],
        actor: typeof currentUser !== "undefined" ? currentUser : {},
        videoUrl: order.videoUrl || order.resultUrl || "",
        postUrl: order.postUrl || order.publishedUrl || "",
        sendFn: async ({ phone, message }) => {
          const cleanPhone = String(phone || "").replace(/[^0-9]/g, "");
          if (cleanPhone && typeof window !== "undefined") {
            console.debug("[WA_POSTED_COMPLETED]", { phone: cleanPhone, message });
          }
        },
      });
      const postedRecipients = Array.from(
        new Set(
          [
            order.assignedEditor || order.editorName || "",
            order.creatorName || order.requestedBy || order.requestedByEmail || "",
          ]
            .map((v) => String(v || "").trim())
            .filter(Boolean)
        )
      );
      const finalPostedRecipients =
        postedRecipients.length > 0
          ? postedRecipients
          : [order.accountName || order.brand || currentUser?.name || "Tim"];

      for (const postedTarget of finalPostedRecipients) {
      }
    } catch (err) {
      console.error("Gagal menandai konten sebagai sudah diposting:", err);
    } finally {
      setPostingOrderDocId(null);
    }
  };


  const handleApproveComplete = async () => {
    if (!selectedOrder || !selectedOrder.docId) return;
    if (!canCurateOrder(currentUser?.role)) return;
    const nextStatus = ORDER_STATUSES.READY_TO_POST;
    await updateDoc(doc(db, "orders", selectedOrder.docId), {
      status: nextStatus,
      curatedAt: typeof serverTimestamp === "function" ? serverTimestamp() : new Date().toISOString(),
    });
    try {
      await dispatchWorkflowWaNotifications({
        eventType: "ready_to_post",
        order: { ...selectedOrder, status: nextStatus },
        teamMembers: typeof teamUsers !== "undefined" ? teamUsers : [],
        actor: typeof currentUser !== "undefined" ? currentUser : {},
        videoUrl: selectedOrder.videoUrl || selectedOrder.resultUrl || "",
        note: selectedOrder.brief || "",
        sendFn: async ({ phone, message }) => {
          const cleanPhone = String(phone || "").replace(/[^0-9]/g, "");
          if (cleanPhone && typeof window !== "undefined") {
            console.debug("[WA_READY_TO_POST]", { phone: cleanPhone, message });
          }
        },
      });
    } catch (waErr) {
      console.warn("Gagal mengirim notifikasi WA siap posting:", waErr);
    }
    const editorTarget = selectedOrder.assignedEditor || selectedOrder.creatorName || "Video Editor";

    const bmTarget = String(
      selectedOrder.creatorName || selectedOrder.requestedBy || selectedOrder.requestedByEmail || ""
    ).trim();
    if (bmTarget) {
    }
  };

  const handleSaveMyWhatsApp = async (e) => {
    e.preventDefault();
    if (!currentUser) return;
    const cleanPhone = normalizeWhatsApp(editWaNumber);
    if (!cleanPhone || (cleanPhone?.length ?? 0) < 10) return;
    await updateDoc(doc(db, "teamUsers", currentUser.id), { whatsapp: cleanPhone });
    setCurrentUser((prev) => ({ ...prev, whatsapp: cleanPhone }));
  };

  const handleMarkAllWaAsRead = () => {
    setReadWaLogIds(() => {
      const allIds = (Array.isArray(waLogs) ? waLogs : []).map((l) => l.id).filter(Boolean);
      saveAccountWaStorage("cf_read_wa_logs", currentUser, allIds);
      return allIds;
    });
  };



    const appendWaLogEntry = async ({ event, recipientObj, memberPool, resolvedTargetName, resolvedTargetEmail, resolvedTargetUid, resolvedPhone, message, nowTime } = {}) => {
    const recipientBucketKey = resolveWaCanonicalAccountKey(recipientObj, memberPool);
    const actorUid = String(currentUser?.uid || currentUser?.userId || currentUser?.id || currentUser?.docId || "").trim();
    const actorEmail = String(currentUser?.email || "").trim().toLowerCase();

    const entry = {
      id: "wa_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
      event: event || "Notifikasi Order",
      targetName: resolvedTargetName,
      targetEmail: resolvedTargetEmail,
      targetUid: resolvedTargetUid,
      recipientBucketKey,
      ownerUid: actorUid,
      ownerEmail: actorEmail,
      phone: resolvedPhone || "-",
      message: message || "",
      time: nowTime,
      createdAtMs: Date.now(),
    };

    const isValidTargetPhone = /^62[1-9][0-9]{7,12}$/.test(String(resolvedPhone || ""));

    const targetStorageKey = `cf_wa_logs_${recipientBucketKey}`;
    try {
      const existingRaw = localStorage.getItem(targetStorageKey);
      const existingList = existingRaw ? JSON.parse(existingRaw) : [];
      const safeList = Array.isArray(existingList) ? existingList : [];
      const nextTargetList = [entry, ...safeList].slice(0, 100);
      localStorage.setItem(targetStorageKey, JSON.stringify(nextTargetList));
    } catch {}

    if (currentUser && belongsToWaAccount(entry, currentUser)) {
      setWaLogs((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const next = [entry, ...list].filter((item) => belongsToWaAccount(item, currentUser));
        saveAccountWaStorage("cf_wa_logs", currentUser, next);
        return next;
      });
    }

    try {
      if (typeof addDoc === "function" && typeof collection === "function" && typeof db !== "undefined" && db) {
        if (import.meta.env.DEV) console.info("[CF_WA_WRITE] mengirim ke Firestore waLogs:", entry.event, entry.targetName);
        await addDoc(collection(db, "waLogs"), {
          ...entry,
          createdAt: typeof serverTimestamp === "function" ? serverTimestamp() : new Date().toISOString(),
        });
      }
        if (import.meta.env.DEV) console.info("[CF_WA_WRITE] sukses masuk waLogs:", entry.id, entry.event);
    } catch (err) {
      console.warn("Simpan log WA ke Firestore dilewati/gagal:", err?.message || err);
    }
    };


  const handleLogin = async (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    setAuthError("");
    const emailVal = String(loginEmail || "").trim();
    const passVal = String(loginPassword || "");
    if (!emailVal || !passVal) {
      setAuthError("Email dan kata sandi wajib diisi.");
      return;
    }
    setSubmittingAuth(true);
    try {
      await signInWithEmailAndPassword(auth, emailVal, passVal);
    } catch (err) {
      console.error("Login gagal:", err);
      setAuthError(err?.message || "Gagal masuk. Periksa kembali email dan kata sandi.");
    } finally {
      setSubmittingAuth(false);
    }
  };

  const handleRegister = async (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    setAuthError("");

    const nameVal = String(regName || "").trim();
    const emailVal = String(regEmail || "").trim();
    const passVal = String(regPassword || "");
    const whatsappVal = String(regWhatsapp || "").trim();
    const roleVal = String(regRole || WORKFLOW_ROLES.EDITOR).trim() || WORKFLOW_ROLES.EDITOR;

    if (!nameVal || !emailVal || !passVal) {
      setAuthError("Nama lengkap, email, dan kata sandi wajib diisi.");
      return;
    }

    if (passVal.length < 6) {
      setAuthError("Kata sandi minimal 6 karakter.");
      return;
    }

    setSubmittingAuth(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, emailVal, passVal);
      const uid = cred?.user?.uid || "";

      const newProfile = {
        uid,
        name: nameVal,
        email: emailVal,
        role: normalizeWorkflowRole(roleVal, WORKFLOW_ROLES.BRAND_MANAGER),
        whatsapp: whatsappVal,
      };

      if (uid && typeof setDoc === "function" && typeof doc === "function" && typeof db !== "undefined" && db) {
        await setDoc(
          doc(db, "teamUsers", uid),
          {
            ...newProfile,
            createdAt: typeof serverTimestamp === "function" ? serverTimestamp() : new Date().toISOString(),
            updatedAt: typeof serverTimestamp === "function" ? serverTimestamp() : new Date().toISOString(),
          },
          { merge: true }
        );
      }

      setCurrentUser((prev) => ({
        ...(prev?.uid === uid ? prev : {}),
        id: uid,
        ...newProfile,
      }));
      setRegName("");
      setRegEmail("");
      setRegPassword("");
      setRegWhatsapp("");
      setAuthMode("login");
    } catch (err) {
      console.error("Pendaftaran akun tim gagal:", err);
      setAuthError(err?.message || "Gagal mendaftarkan akun tim. Coba periksa kembali data Anda.");
    } finally {
      setSubmittingAuth(false);
    }
  };

    const openTiktokAccountManager = (accountOrId = null, tab = "monitoring") => {
    const accountsList = Array.isArray(tiktokAccounts) ? tiktokAccounts : [];
    const targetAccount =
      typeof accountOrId === "string"
        ? accountsList.find(
            (acc) => String(acc?.id || "") === accountOrId || String(acc?.docId || "") === accountOrId
          ) || null
        : accountOrId;

    const resolvedId =
      typeof accountOrId === "string"
        ? accountOrId
        : targetAccount?.id || targetAccount?.docId || null;

    if (typeof setActiveTiktokAccountId === "function") {
      setActiveTiktokAccountId(resolvedId);
    }
    if (typeof setTiktokDrawerTab === "function") {
      setTiktokDrawerTab(tab === "edit" ? "edit" : "monitoring");
    }
    if (!resolvedId && canCreateTiktokAccount(currentUser?.role) && typeof setIsAddTiktokModalOpen === "function") {
      setIsAddTiktokModalOpen(true);
      return;
    }

    if (targetAccount) {
      const brandVal = targetAccount.brandName || targetAccount.brand || "";
      const accNameVal =
        targetAccount.accountName || targetAccount.tiktokAccountName || targetAccount.handle || "";
      const rawTypes = Array.isArray(targetAccount.contentTypes)
        ? targetAccount.contentTypes
        : Array.isArray(targetAccount.selectedTypes)
        ? targetAccount.selectedTypes
        : [];
      const cleanTypes =
        typeof sanitizeContentTypes === "function"
          ? sanitizeContentTypes(rawTypes)
          : rawTypes.filter(Boolean);

      if (typeof setEditTtBrandName === "function") setEditTtBrandName(String(brandVal));
      if (typeof setEditTtAccountName === "function") setEditTtAccountName(String(accNameVal));
      if (typeof setEditTtSelectedTypes === "function") setEditTtSelectedTypes(cleanTypes);
      const logoVal = targetAccount.logoUrl || targetAccount.brandLogo || "";
      if (typeof setEditTtBrandLogo === "function") setEditTtBrandLogo(String(logoVal));
      if (typeof setEditTtCustomType === "function") setEditTtCustomType("");
    }
  };

    const handleUpdateTiktokAccountDetail = async (eOrPayload, maybeUpdates = null) => {
    if (eOrPayload && typeof eOrPayload.preventDefault === "function") {
      eOrPayload.preventDefault();
    }
    const targetAccount =
      eOrPayload && typeof eOrPayload === "object" && !eOrPayload.preventDefault
        ? eOrPayload
        : (typeof activeTiktokAccount !== "undefined" ? activeTiktokAccount : null);
    const resolvedDocId = targetAccount?.docId || targetAccount?.id;
    if (!resolvedDocId) return;

    const cleanBrand =
      typeof editTtBrandName !== "undefined"
        ? String(editTtBrandName || "").trim()
        : String(targetAccount?.brandName || targetAccount?.brand || "").trim();
    const cleanAccount =
      typeof editTtAccountName !== "undefined"
        ? String(editTtAccountName || "").trim()
        : String(targetAccount?.accountName || targetAccount?.tiktokAccountName || targetAccount?.handle || "").trim();
    const rawTypes = Array.isArray(editTtSelectedTypes)
      ? editTtSelectedTypes
      : Array.isArray(targetAccount?.contentTypes)
      ? targetAccount.contentTypes
      : [];
    const cleanTypes =
      typeof sanitizeContentTypes === "function" ? sanitizeContentTypes(rawTypes) : rawTypes;
    const cleanLogo =
      typeof editTtBrandLogo !== "undefined"
        ? String(editTtBrandLogo || "").trim()
        : String(targetAccount?.logoUrl || targetAccount?.brandLogo || "").trim();

    const updates =
      maybeUpdates && typeof maybeUpdates === "object"
        ? maybeUpdates
        : {
            brandName: cleanBrand,
            accountName: cleanAccount,
            contentTypes: cleanTypes,
            selectedTypes: cleanTypes,
            logoUrl: cleanLogo,
            brandLogo: cleanLogo,
            ...(typeof editTiktokHandle !== "undefined" ? { handle: String(editTiktokHandle || "").trim() } : {}),
            ...(typeof editTiktokPic !== "undefined" ? { picName: String(editTiktokPic || "").trim() } : {}),
            ...(typeof editTiktokNotes !== "undefined" ? { notes: String(editTiktokNotes || "").trim() } : {}),
            updatedAt: new Date().toISOString(),
          };

    try {
      const ref = doc(db, "tiktokAccounts", resolvedDocId);
      try {
        await updateDoc(ref, updates);
      } catch (updateErr) {
        if (
          String(updateErr?.code || "").includes("not-found") ||
          String(updateErr?.message || "").includes("No document to update")
        ) {
          await setDoc(ref, { id: targetAccount?.id || resolvedDocId, ...updates }, { merge: true });
        } else {
          throw updateErr;
        }
      }

      if (typeof setTiktokAccounts === "function") {
        setTiktokAccounts((prev) => {
          const safePrev = Array.isArray(prev) ? prev : [];
          const mapped = safePrev.map((acc) => {
            const accId = acc?.docId || acc?.id;
            if (accId !== resolvedDocId) return acc;
            return {
              ...acc,
              ...updates,
              logoUrl: updates.logoUrl !== undefined ? updates.logoUrl : acc.logoUrl,
              brandLogo: updates.brandLogo !== undefined ? updates.brandLogo : acc.brandLogo,
            };
          });
          try {
            localStorage.setItem("cf_tiktok_accounts", JSON.stringify(mapped));
          } catch {}
          return mapped;
        });
      }

      // Tutup popup Edit Akun setelah berhasil disimpan agar langsung kembali ke dasbor
      if (typeof setActiveTiktokAccountId === "function") {
        setActiveTiktokAccountId(null);
      }
      if (typeof setTiktokDrawerTab === "function") {
        setTiktokDrawerTab("monitoring");
      }
    } catch (err) {
      console.error("Gagal memperbarui detail akun TikTok:", err);
      alert(err?.message || "Gagal menyimpan perubahan akun TikTok.");
    }
  };

  const isOrderMatchedToTiktokAccount = (order, account) => {
    if (!order || !account) return false;

    const norm = (v) =>
      String(v || "")
        .trim()
        .toLowerCase()
        .replace(/^@+/, "");

    const accIds = [account.id, account.docId]
      .filter(Boolean)
      .map((v) => String(v).trim().toLowerCase());
    const orderAccId = String(order.tiktokAccountId || order.accountId || "")
      .trim()
      .toLowerCase();
    if (orderAccId && accIds.includes(orderAccId)) return true;

    const accKeys = new Set(
      [account.accountName, account.tiktokAccountName, account.brandName]
        .map(norm)
        .filter(Boolean)
    );
    const orderKeys = [order.accountName, order.tiktokAccountName, order.brand]
      .map(norm)
      .filter(Boolean);

    if (accKeys.size === 0 || orderKeys.length === 0) return false;
    return orderKeys.some((k) => accKeys.has(k));
  };

  const editors = useMemo(() => {
    const list = Array.isArray(teamUsers) ? teamUsers : [];
    return list.filter((u) => {
      const r = String(u?.role || "").toLowerCase();
      return r.includes("editor");
    });
  }, [teamUsers]);

    const activeTiktokAccount = useMemo(() => {
    if (!activeTiktokAccountId || !Array.isArray(tiktokAccounts)) return null;
    return tiktokAccounts.find((acc) => acc.id === activeTiktokAccountId) || null;
  }, [tiktokAccounts, activeTiktokAccountId]);

    const availableContentTypes = useMemo(() => {
    const raw =
      (typeof activeTiktokAccount !== "undefined" && Array.isArray(activeTiktokAccount?.contentTypes) && activeTiktokAccount.contentTypes.length > 0
        ? activeTiktokAccount.contentTypes
        : null) ||
      (typeof editTtSelectedTypes !== "undefined" && Array.isArray(editTtSelectedTypes) && editTtSelectedTypes.length > 0
        ? editTtSelectedTypes
        : null) ||
      (Array.isArray(tiktokAccounts) ? tiktokAccounts.flatMap((a) => a?.contentTypes || []) : []);
    const cleaned = typeof sanitizeContentTypes === "function" ? sanitizeContentTypes(raw) : raw;
    const unique = Array.from(new Set((Array.isArray(cleaned) ? cleaned : []).filter(Boolean)));
    return unique.length > 0 ? unique : ["UGC", "Review", "Edukasi", "Hard Selling"];
  }, [activeTiktokAccount, editTtSelectedTypes, tiktokAccounts]);

    const mainFilteredOrders = useMemo(() => {
    const list = Array.isArray(orders) ? orders : [];
    const q = String(typeof searchQuery !== "undefined" ? searchQuery : "").trim().toLowerCase();
    const stFilter = typeof statusFilter !== "undefined" ? statusFilter : "Semua";
    const pfFilter = typeof platformFilter !== "undefined" ? platformFilter : "Semua";

    const roleStr = String(
      (typeof currentUser !== "undefined" && currentUser?.role) ||
        (typeof activeRole !== "undefined" ? activeRole : "") ||
        ""
    )
      .trim()
      .toLowerCase();
    const bmRole =
      roleStr.includes("brand manager") ||
      roleStr.includes("brand management") ||
      roleStr === "manager" ||
      roleStr === "admin" ||
      roleStr === "owner";
    const edRole = roleStr.includes("editor");
    const smmRole = roleStr.includes("sosial media") || roleStr.includes("social media") || roleStr === "smm" || roleStr === "sosmed";

    return list.filter((order) => {
      if (!order) return false;
      const st = String(order.status || "").trim();
      const isAlreadyPosted =
        Boolean(order.isPosted) ||
        Boolean(order.postedAt) ||
        st.toLowerCase() === "sudah diposting" ||
        st.toLowerCase() === "sudah diupload" ||
        st.toLowerCase() === "sudah di-upload";

      if (bmRole) {
        const isSuperView = roleStr === "admin" || roleStr === "owner";
        if (!isSuperView) {
          const myUid = String(currentUser?.uid || currentUser?.id || "").trim().toLowerCase();
          const myEmail = String(currentUser?.email || "").trim().toLowerCase();
          const myName = String(currentUser?.name || currentUser?.fullName || "").trim().toLowerCase();
          const orderUid = String(order?.requestedByUid || order?.createdByUid || "").trim().toLowerCase();
          const orderEmail = String(order?.requestedByEmail || order?.createdByEmail || "").trim().toLowerCase();
          const orderName = String(order?.requestedBy || order?.createdBy || "").trim().toLowerCase();

          const matchesUid = Boolean(myUid && orderUid && myUid === orderUid);
          const matchesEmail = Boolean(myEmail && orderEmail && myEmail === orderEmail);
          const matchesName = Boolean(myName && orderName && myName === orderName);
          const hasAnyOwnerMeta = Boolean(orderUid || orderEmail || orderName);

          if (!hasAnyOwnerMeta || (!matchesUid && !matchesEmail && !matchesName)) {
            return false;
          }
        }
      } else if (edRole) {
        const isEditorQueueOrRevision =
          st === "Antrean" || st === "Sedang Dikerjakan" || st === "Revisi";
        if (!isEditorQueueOrRevision) return false;
      } else if (smmRole) {
        const isSmmPublishQueue =
          st === "Siap Posting" || st === "Selesai" || st === "Sudah Diposting" || isAlreadyPosted;
        if (!isSmmPublishQueue) return false;
      }

      const matchesSearch =
        !q ||
        String(order.title || "").toLowerCase().includes(q) ||
        String(order.brand || "").toLowerCase().includes(q) ||
        String(order.accountName || "").toLowerCase().includes(q) ||
        String(order.id || "").toLowerCase().includes(q);
      const matchesStatus = !stFilter || stFilter === "Semua" || st === stFilter;
      const matchesPlatform = !pfFilter || pfFilter === "Semua" || order.platform === pfFilter;
      return matchesSearch && matchesStatus && matchesPlatform;
    });
  }, [orders, searchQuery, statusFilter, platformFilter, currentUser]);

  const isOrderOwnedByCurrentAccount = (order) => {
    const roleStr = String(currentUser?.role || "").trim().toLowerCase();
    const isBm =
      roleStr.includes("brand manager") ||
      roleStr.includes("brand management") ||
      roleStr === "manager" ||
      roleStr === "admin" ||
      roleStr === "owner";
    if (!isBm) {
      if (roleStr.includes("editor") && typeof currentUser !== "undefined" && currentUser) {
        return isOrderVisibleToCurrentEditor(order, currentUser);
      }
      return true;
    }

    const myUid = String(currentUser?.uid || currentUser?.id || "").trim();
    const myEmail = String(currentUser?.email || "").trim().toLowerCase();
    const myName = String(currentUser?.name || "").trim().toLowerCase();
    const orderUid = String(order?.requestedByUid || "").trim();
    const orderEmail = String(order?.requestedByEmail || "").trim().toLowerCase();
    const orderReqBy = String(order?.requestedBy || "").trim().toLowerCase();

    if (orderUid) return Boolean(myUid && orderUid === myUid);
    if (orderEmail) return Boolean(myEmail && orderEmail === myEmail);
    if (orderReqBy) return Boolean((myName && orderReqBy === myName) || (myEmail && orderReqBy === myEmail));
    return false;
  };

    const filteredOrders = useMemo(() => (Array.isArray(orders) ? orders : []).filter((order) => {
    if (!isOrderOwnedByCurrentAccount(order)) return false;
    const q = searchQuery.toLowerCase();
    const matchesSearch = (order.title || "").toLowerCase().includes(q) || (order.brand || "").toLowerCase().includes(q) || (order.id || "").toLowerCase().includes(q);
    return matchesSearch && (statusFilter === "Semua" || order.status === statusFilter) && (platformFilter === "Semua" || order.platform === platformFilter);
  }), [orders, searchQuery, statusFilter, platformFilter, currentUser]);

  const normalizedRole = String((typeof currentUser !== "undefined" && currentUser?.role) || "").trim().toLowerCase();
  const isBrandManager =
    normalizeWorkflowRole(currentUser?.role) === WORKFLOW_ROLES.BRAND_MANAGER ||
    normalizedRole.includes("brand manager") ||
    normalizedRole === "manager" ||
    normalizedRole === "admin" ||
    normalizedRole === "owner";
  const isEditor = normalizedRole.includes("editor");

    const scopedOrdersForStats = useMemo(
    () => (Array.isArray(orders) ? orders.filter((o) => isOrderOwnedByCurrentAccount(o)) : []),
    [orders, currentUser]
  );

    const stats = useMemo(() => ({
    total: (scopedOrdersForStats?.length ?? 0),
    queue: scopedOrdersForStats.filter((o) => o.status === "Antrean").length,
    inProgress: scopedOrdersForStats.filter((o) => o.status === "Sedang Dikerjakan" || o.status === "Revisi").length,
    reviewDone: scopedOrdersForStats.filter((o) => o.status === "Review" || o.status === "Selesai").length,
  }), [scopedOrdersForStats]);

  const productivityData = useMemo(() => {
    const rawOrders = Array.isArray(orders) ? orders : [];
    const roleStr = String(currentUser?.role || "").trim().toLowerCase();
    const isAdminOrOwner = roleStr === "admin" || roleStr === "owner";
    const isBmUser =
      roleStr.includes("brand manager") ||
      roleStr.includes("brand management") ||
      roleStr === "manager";
    const isEditorUser = roleStr.includes("editor");

    const myUid = String(currentUser?.uid || currentUser?.id || "").trim().toLowerCase();
    const myEmail = String(currentUser?.email || "").trim().toLowerCase();
    const myName = String(currentUser?.name || currentUser?.fullName || "").trim().toLowerCase();

    const matchesCurrentBm = (order) => {
      const oUid = String(order?.requestedByUid || order?.createdByUid || "").trim().toLowerCase();
      const oEmail = String(order?.requestedByEmail || order?.createdByEmail || "").trim().toLowerCase();
      const oName = String(order?.requestedBy || order?.createdBy || "").trim().toLowerCase();
      return (
        Boolean(myUid && oUid && myUid === oUid) ||
        Boolean(myEmail && oEmail && myEmail === oEmail) ||
        Boolean(myName && oName && myName === oName)
      );
    };

    const matchesCurrentEditor = (order) => {
      const fields = [
        order?.assignedEditor,
        order?.editorName,
        order?.claimedBy,
        order?.submittedBy,
      ]
        .map((v) => String(v || "").trim().toLowerCase())
        .filter(Boolean);
      const assignedEmail = String(order?.assignedEditorEmail || "").trim().toLowerCase();
      const assignedUid = String(order?.assignedEditorUid || "").trim().toLowerCase();

      return (
        Boolean(myUid && assignedUid && myUid === assignedUid) ||
        Boolean(myEmail && assignedEmail && myEmail === assignedEmail) ||
        (Boolean(myName) && fields.some((f) => f === myName || f.includes(myName))) ||
        (Boolean(myEmail) && fields.some((f) => f.includes(myEmail)))
      );
    };

    const scopedOrders = isAdminOrOwner
      ? rawOrders
      : rawOrders.filter((order) => {
          if (!order) return false;
          if (isBmUser && !isEditorUser) return matchesCurrentBm(order);
          if (isEditorUser && !isBmUser) return matchesCurrentEditor(order);
          return matchesCurrentBm(order) || matchesCurrentEditor(order);
        });

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const cutoffMs =
      productivityRange === "today"
        ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
        : productivityRange === "7d"
        ? now - 7 * dayMs
        : productivityRange === "30d"
        ? now - 30 * dayMs
        : 0;

    const filteredByPeriod = scopedOrders.filter((order) => {
      if (!cutoffMs) return true;
      const rawDate =
        order?.createdAt ||
        order?.submittedAt ||
        order?.completedAt ||
        order?.updatedAt ||
        "";
      const parsed = Date.parse(rawDate);
      if (Number.isNaN(parsed)) return true;
      return parsed >= cutoffMs;
    });

    const editorMap = new Map();
    const bmMap = new Map();

    const ensureBucket = (map, key, label, roleLabel) => {
      const cleanKey = String(key || "").trim().toLowerCase();
      if (!cleanKey) return null;
      if (!map.has(cleanKey)) {
        map.set(cleanKey, {
          key: cleanKey,
          name: String(label || key).trim(),
          role: roleLabel,
          total: 0,
          queue: 0,
          inProgress: 0,
          review: 0,
          revision: 0,
          completed: 0,
        });
      }
      return map.get(cleanKey);
    };

    const applyStatusCount = (bucket, order) => {
      if (!bucket) return;
      const st = String(order?.status || "").trim();
      const posted =
        Boolean(order?.isPosted) ||
        Boolean(order?.postedAt) ||
        st.toLowerCase() === "sudah diposting" ||
        st.toLowerCase() === "sudah diupload";

      bucket.total += 1;
      if (st === "Selesai" || posted) {
        bucket.completed += 1;
      } else if (st === "Review") {
        bucket.review += 1;
      } else if (st === "Revisi") {
        bucket.revision += 1;
      } else if (st === "Sedang Dikerjakan") {
        bucket.inProgress += 1;
      } else {
        bucket.queue += 1;
      }
    };

    filteredByPeriod.forEach((order) => {
      const bmLabel = String(order?.requestedBy || order?.requestedByEmail || "").trim();
      const bmKey = String(order?.requestedByUid || order?.requestedByEmail || bmLabel).trim();
      if (bmKey && (!isEditorUser || isAdminOrOwner)) {
        const bmBucket = ensureBucket(bmMap, bmKey, bmLabel || bmKey, "Brand Management");
        applyStatusCount(bmBucket, order);
      }

      const edLabel = String(
        order?.assignedEditor || order?.submittedBy || order?.claimedBy || ""
      ).trim();
      const edKey = String(
        order?.assignedEditorUid || order?.assignedEditorEmail || edLabel
      ).trim();
      if (edKey && (!isBmUser || isAdminOrOwner)) {
        const edBucket = ensureBucket(editorMap, edKey, edLabel || edKey, "Video Editor");
        applyStatusCount(edBucket, order);
      }
    });

    const q = String(productivitySearch || "").trim().toLowerCase();
    const combined = [
      ...(productivityRoleFilter === "Brand Management" ? [] : Array.from(editorMap.values())),
      ...(productivityRoleFilter === "Video Editor" ? [] : Array.from(bmMap.values())),
    ]
      .filter((item) => (!q ? true : item.name.toLowerCase().includes(q)))
      .map((item) => {
        const rate = item.total > 0 ? Math.round((item.completed / item.total) * 100) : 0;
        return { ...item, completionRate: rate };
      })
      .sort((a, b) => b.completed - a.completed || b.total - a.total || a.name.localeCompare(b.name));

    const summary = filteredByPeriod.reduce(
      (acc, order) => {
        const st = String(order?.status || "").trim();
        const posted =
          Boolean(order?.isPosted) ||
          Boolean(order?.postedAt) ||
          st.toLowerCase() === "sudah diposting" ||
          st.toLowerCase() === "sudah diupload";
        acc.total += 1;
        if (st === "Selesai" || posted) acc.completed += 1;
        else if (st === "Review") acc.review += 1;
        else if (st === "Revisi") acc.revision += 1;
        else acc.active += 1;
        return acc;
      },
      { total: 0, completed: 0, review: 0, revision: 0, active: 0 }
    );

    return {
      isAdminOrOwner,
      rows: combined,
      summary,
      completionRate: summary.total > 0 ? Math.round((summary.completed / summary.total) * 100) : 0,
    };
  }, [orders, currentUser, productivityRange, productivityRoleFilter, productivitySearch]);

  useEffect(() => {
    let active = true;
    const fallbackTimer = setTimeout(() => {
      if (active) {
        setAuthLoading(false);
      }
    }, 4000);

    let unsubscribe = () => {};
    try {
      unsubscribe = onAuthStateChanged(
        auth,
        async (user) => {
          if (!active) return;
          try {
            if (!user) {
              setCurrentUser(null);
              return;
            }
            let profileData = {};
            try {
              const snap = await getDoc(doc(db, "teamUsers", user.uid));
              if (snap.exists()) {
                profileData = snap.data() || {};
              }
            } catch (profileErr) {
              console.warn("Gagal memuat profil teamUsers, lanjut dengan data Auth:", profileErr);
            }
            if (!active) return;
            setCurrentUser((prev) => {
              const sameUser = prev && (prev.uid === user.uid || prev.id === user.uid);
              return {
                ...(sameUser ? prev : {}),
                id: user.uid,
                uid: user.uid,
                ...profileData,
                email: user.email || profileData.email || (sameUser ? prev.email : "") || "",
                name: profileData.name || (sameUser ? prev.name : "") || user.displayName || (user.email ? user.email.split("@")[0] : "Pengguna"),
                role: normalizeTeamRole(profileData.role || (sameUser ? prev.role : ""), "Brand Manager"),
                whatsapp: profileData.whatsapp || (sameUser ? prev.whatsapp : "") || "",
              };
            });
          } catch (authErr) {
            console.error("Error saat memproses status autentikasi:", authErr);
            if (active) {
              setCurrentUser(null);
            }
          } finally {
            if (active) {
              setAuthLoading(false);
            }
          }
        },
        (listenerErr) => {
          console.error("Listener onAuthStateChanged gagal:", listenerErr);
          if (active) {
            setCurrentUser(null);
            setAuthLoading(false);
          }
        }
      );
    } catch (initErr) {
      console.error("Gagal menginisialisasi onAuthStateChanged:", initErr);
      setAuthLoading(false);
    }

    return () => {
      active = false;
      clearTimeout(fallbackTimer);
      try {
        unsubscribe();
      } catch {}
    };
  }, []);

  useEffect(() => {
    setEditWaNumber(resolveCurrentUserWhatsApp(currentUser, teamUsers));
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    let unsubOrders = null;
    let unsubTiktok = null;

    try {
      unsubOrders = onSnapshot(
        collection(db, "orders"),
        (snap) => {
          const rows = snap.docs.map((d) => {
            const data = d.data() || {};
            return {
              docId: d.id,
              id: data.id || d.id,
              ...data,
            };
          });
          const seenOrderKeys = new Set();
          const uniqueRows = rows.filter((item) => {
            const keys = [item?.docId, item?.id].map((k) => (k ? String(k) : "")).filter(Boolean);
            if (keys.some((k) => seenOrderKeys.has(k))) return false;
            keys.forEach((k) => seenOrderKeys.add(k));
            return true;
          });
          setOrders(uniqueRows);
        },
        (err) => {
          console.error("Error memuat orders:", err);
        }
      );
    } catch (err) {
      console.error("Gagal pasang listener orders:", err);
    }

    try {
      if (typeof setTiktokAccounts === "function") {
        unsubTiktok = onSnapshot(
          collection(db, "tiktokAccounts"),
          (snap) => {
            const firestoreRows = snap.docs.map((d) => {
              const data = d.data() || {};
              const rawTypes = Array.isArray(data.contentTypes)
                ? data.contentTypes
                : Array.isArray(data.selectedTypes)
                ? data.selectedTypes
                : [];
              return {
                ...data,
                docId: d.id,
                id: data.id || d.id,
                brandName: data.brandName || data.brand || data.accountName || "",
                accountName: data.accountName || data.brandName || d.id,
                logoUrl: data.logoUrl || data.brandLogo || "",
                brandLogo: data.brandLogo || data.logoUrl || "",
                contentTypes: sanitizeContentTypes(rawTypes),
              };
            });

            const byKey = new Map();
            for (const fItem of firestoreRows) {
              if (!fItem) continue;
              const key = String(fItem.docId || fItem.id || fItem.accountName || "").trim().toLowerCase();
              if (!key) continue;
              const byHandle = String(fItem.accountName || "").trim().toLowerCase();
              if (byHandle) {
                for (const [existingKey, existingVal] of byKey.entries()) {
                  if (String(existingVal?.accountName || "").trim().toLowerCase() === byHandle) {
                    byKey.delete(existingKey);
                  }
                }
              }
              byKey.set(key, fItem);
            }

            const synced = Array.from(byKey.values());
            try {
              localStorage.setItem("cf_tiktok_accounts", JSON.stringify(synced));
            } catch {}
            setTiktokAccounts(synced);
          },
          (err) => {
            console.error("Gagal memuat tiktokAccounts:", err);
          }
        );
      }

    } catch (err) {
      console.error("Gagal pasang listener tiktokAccounts:", err);
    }

    try {
      const usersUnsub = onSnapshot(
        collection(db, "teamUsers"),
        (snap) => {
          const rows = snap.docs.map((d) => ({
            id: d.id,
            docId: d.id,
            ...d.data(),
          }));
          if (typeof setTeamUsers === "function") {
            setTeamUsers(rows);
          }
        },
        (err) => {
          console.error("Listener teamUsers error:", err);
        }
      );

    } catch (err) {
      console.error("Gagal pasang listener teamUsers:", err);
    }

    return () => {
      if (typeof unsubOrders === "function") unsubOrders();
      if (typeof unsubTiktok === "function") unsubTiktok();
      if (typeof usersUnsub === "function") usersUnsub();
    };
  }, [currentUser]);


  const matchedOrderTiktokAccount = useMemo(() => {
    const q = String(typeof newBrand !== "undefined" ? newBrand : "").trim().toLowerCase();
    if (!q || !Array.isArray(tiktokAccounts)) return null;
    return (
      tiktokAccounts.find((acc) => {
        const aName = String(acc?.accountName || "").trim().toLowerCase();
        const bName = String(acc?.brandName || "").trim().toLowerCase();
        return aName === q || bName === q;
      }) || null
    );
  }, [newBrand, tiktokAccounts]);

  const orderModalContentTypes = useMemo(() => {
    if (!matchedOrderTiktokAccount) return [];
    const rawList = Array.isArray(matchedOrderTiktokAccount.contentTypes)
      ? matchedOrderTiktokAccount.contentTypes
      : [];
    const cleaned = typeof sanitizeContentTypes === "function" ? sanitizeContentTypes(rawList) : rawList;
    return Array.from(
      new Set((Array.isArray(cleaned) ? cleaned : []).map((x) => String(x || "").trim()).filter(Boolean))
    );
  }, [matchedOrderTiktokAccount]);

  const handleCreateOrder = async (e) => {
    if (import.meta.env.DEV) console.info("[CF_SUBMIT] handleCreateOrder terpanggil", { newBrand, newTitle, windowLock: typeof window !== "undefined" ? window.__cfCreatingOrder : null });
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    if (e && typeof e.stopPropagation === "function") e.stopPropagation();
    if (typeof window !== "undefined") {
      if (window.__cfCreatingOrder) return;
      window.__cfCreatingOrder = true;
    }
    const releaseOrderLock = () => {
      if (typeof window !== "undefined") window.__cfCreatingOrder = false;
    };
    const cleanBrand = String(typeof newBrand !== "undefined" ? newBrand : "").trim();
    const rawTitle = String(typeof newTitle !== "undefined" ? newTitle : "").trim();
    const cleanType = String(
      typeof newContentType !== "undefined" && newContentType
        ? newContentType
        : ((Array.isArray(orderModalContentTypes) && orderModalContentTypes[0]) || ""),
      "",
    ).trim();
    const cleanTitle = rawTitle || (cleanBrand ? cleanBrand + " - " + cleanType : "");

    if (!cleanBrand || !cleanTitle) {
      alert("Pilih akun TikTok terdaftar dan isi judul order terlebih dahulu.");
      releaseOrderLock(); return;
    }

    const rawCount = Number(typeof batchCount !== "undefined" ? batchCount : 1);
    const totalBatch = Number.isFinite(rawCount)
      ? Math.min(20, Math.max(1, Math.floor(rawCount)))
      : 1;
    const batchId = totalBatch > 1 ? "BATCH-" + Date.now() : "";
    const baseOrderId = "ORD-" + Date.now();
    const createdOrders = [];

    try {
      for (let idx = 0; idx < totalBatch; idx += 1) {
        const itemNumber = idx + 1;
        const itemTitle =
          totalBatch > 1 ? `[${itemNumber}/${totalBatch}] ${cleanTitle}` : cleanTitle;

        const itemOrder = {
          id: totalBatch > 1 ? `${baseOrderId}-${itemNumber}` : baseOrderId,
          batchId,
          batchIndex: totalBatch > 1 ? itemNumber : 1,
          batchTotal: totalBatch,
          title: itemTitle,
          baseTitle: cleanTitle,
          brand: cleanBrand,
          accountName: cleanBrand,
          platform: "TikTok",
          contentType: cleanType,
          type: cleanType,
          brief: String(typeof newBrief !== "undefined" ? newBrief : "").trim(),
          rawFootageUrl: String(typeof newRawFootageUrl !== "undefined" ? newRawFootageUrl : "").trim(),
          referenceUrl: String(typeof newReferenceUrl !== "undefined" ? newReferenceUrl : "").trim(),
          deadline: String(typeof newDeadline !== "undefined" ? newDeadline : "").trim(),
          priority: String(typeof newPriority !== "undefined" && newPriority ? newPriority : "Normal").trim(),
          assignedEditor: String(typeof newAssignedEditor !== "undefined" ? newAssignedEditor : "").trim(),
          status: "Antrean",
          isPosted: false,
          requestedByUid: currentUser?.uid || currentUser?.id || "",
          requestedByEmail: String(currentUser?.email || "").trim().toLowerCase(),
          requestedBy: currentUser?.name || currentUser?.email || "Brand Manager",
          requestedByRole: currentUser?.role || "Brand Manager",
          createdAt: new Date().toISOString(),
        };

        if (typeof db !== "undefined" && typeof addDoc === "function" && typeof collection === "function") {
          const docRef = await addDoc(collection(db, "orders"), itemOrder);
          itemOrder.docId = docRef.id;
          if (import.meta.env.DEV) console.info("[CF_ORDER_SAVED] tersimpan ke Firestore orders:", docRef.id, itemOrder.id);
        }
        createdOrders.push(itemOrder);
      }

      const newOrderItem = createdOrders[0] || null;
      if (!newOrderItem) return;

      if (typeof setNewTitle === "function") setNewTitle("");
      if (typeof setBatchCount === "function") setBatchCount(1);
      if (typeof setNewContentType === "function") setNewContentType("");
      if (typeof setNewBrief === "function") setNewBrief("");
      if (typeof setNewRawFootageUrl === "function") setNewRawFootageUrl("");
      if (typeof setNewReferenceUrl === "function") setNewReferenceUrl("");
      if (typeof setIsNewOrderOpen === "function") setIsNewOrderOpen(false);
    } catch (err) {
      console.error("[CF_ORDER_ERR] Gagal mengirim order video:", { code: err?.code, message: err?.message, err });
      alert(err?.message || "Gagal mengirim order video.");
    } finally {
      releaseOrderLock();
    }
  };



  const handleOrderStatusTransition = async (orderObj, nextStatus, extraFields = {}) => {
    if (!orderObj || !nextStatus) return;
    const normalizedNext =
      nextStatus === "Review"
        ? ORDER_STATUSES.BM_CURATION
        : nextStatus === "Selesai"
        ? ORDER_STATUSES.POSTED
        : nextStatus;
    const actorRole = typeof currentUser !== "undefined" ? currentUser?.role : "";
    const check = validateOrderTransition({
      actorRole,
      currentStatus: orderObj.status,
      nextStatus: normalizedNext,
      payload: { ...orderObj, ...extraFields },
    });
    if (!check.ok && actorRole) {
      alert(check.reason);
      return;
    }
    const targetId = orderObj.docId || orderObj.id;
    const payload = {
      ...extraFields,
      status: normalizedNext,
      updatedAt: new Date().toISOString(),
    };
    try {
      if (
        typeof db !== "undefined" &&
        typeof doc === "function" &&
        typeof updateDoc === "function" &&
        targetId
      ) {
        await updateDoc(doc(db, "orders", String(targetId)), payload);
      }
      if (typeof setOrders === "function") {
        setOrders((prev) =>
          (Array.isArray(prev) ? prev : []).map((item) => {
            const match =
              (orderObj.docId && item.docId === orderObj.docId) ||
              (orderObj.id && item.id === orderObj.id);
            return match ? { ...item, ...payload } : item;
          })
        );
      }
      const eventMap = {
        [ORDER_STATUSES.IN_PROGRESS]: "job_assigned",
        [ORDER_STATUSES.BM_CURATION]: "submitted_for_curation",
        [ORDER_STATUSES.REVISION]: "revision_requested",
        [ORDER_STATUSES.READY_TO_POST]: "ready_to_post",
        [ORDER_STATUSES.POSTED]: "posted_completed",
      };
      const waEventType = eventMap[normalizedNext];
      if (waEventType) {
        const mergedOrder = { ...orderObj, ...payload };
        const membersList = typeof teamUsers !== "undefined" ? teamUsers : [];
        const actorObj = typeof currentUser !== "undefined" ? currentUser : {};
        await dispatchWorkflowWaNotifications({
          eventType: waEventType,
          order: mergedOrder,
          teamMembers: membersList,
          actor: actorObj,
          videoUrl: payload.videoUrl || payload.previewUrl || mergedOrder.videoUrl || "",
          note: payload.revisionNote || payload.note || mergedOrder.revisionNote || mergedOrder.brief || "",
          postUrl: payload.postUrl || payload.publishedUrl || mergedOrder.postUrl || "",
          sendFn: async ({ phone, message }) => {
            const res = await fetch("/api/send-wa", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ phone, message }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
          },
        });
      }
    } catch (err) {
      console.error("Gagal memperbarui status order:", err);
      alert(err?.message || "Gagal memperbarui status order.");
    }
  };


  const handleEditorStartWork = async () => {
    const target = typeof selectedOrder !== "undefined" ? selectedOrder : null;
    if (!target) return;
    const editorLabel = String(currentUser?.name || currentUser?.email || "Video Editor").trim();
    const editorEmailVal = String(currentUser?.email || "").trim().toLowerCase();
    const editorUidVal = String(currentUser?.uid || currentUser?.id || "").trim();
    const isReworkSubmission = String(target?.status || "").trim() === "Revisi";
    const nextStatus = "Sedang Dikerjakan";
    const claimPayload = {
      editorName: editorLabel,
      assignedEditor: editorLabel,
      assignedEditorEmail: editorEmailVal,
      assignedEditorUid: editorUidVal,
      claimedBy: editorLabel,
      claimedByEmail: editorEmailVal,
      claimedByUid: editorUidVal,
    };
    if (typeof handleOrderStatusTransition === "function") {
      await handleOrderStatusTransition(target, nextStatus, claimPayload);
    }

        if (target.docId && typeof db !== "undefined" && typeof updateDoc === "function" && typeof doc === "function") {
      try {
        await updateDoc(doc(db, "orders", target.docId), {
          status: nextStatus,
          assignedEditor: editorLabel,
          assignedEditorEmail: editorEmailVal,
          assignedEditorUid: editorUidVal,
          claimedBy: editorLabel,
          claimedByEmail: editorEmailVal,
          claimedByUid: editorUidVal,
        });
      } catch (err) {
        console.error("Gagal mengunci job ke editor:", err);
      }
    }
  };

  const handleEditorSubmitVideo = async (e) => {
    if (e && typeof e.preventDefault === "function") e.preventDefault();
    const target = typeof selectedOrder !== "undefined" ? selectedOrder : null;
    if (!target) return;
    const cleanUrl = String(typeof editorVideoUrl !== "undefined" ? editorVideoUrl : "").trim();
    if (!cleanUrl) {
      alert("Masukkan link video hasil edit (MP4) terlebih dahulu.");
      return;
    }
    if (typeof handleOrderStatusTransition === "function") {
      await handleOrderStatusTransition(target, ORDER_STATUSES.BM_CURATION, {
        previewUrl: cleanUrl,
        videoUrl: cleanUrl,
        submittedBy: currentUser?.name || currentUser?.email || "Video Editor",
        submittedAt: new Date().toISOString(),
      });
    }

    if (typeof setEditorVideoUrl === "function") setEditorVideoUrl("");
    if (typeof setShowEditorSubmitTab === "function") setShowEditorSubmitTab(false);
  };

    if (authLoading) {
    return (
      <div
        className="min-h-screen text-slate-800 flex items-center justify-center p-4 sm:p-6"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(186, 230, 253, 0.48) 0%, rgba(248, 250, 252, 0.9) 50%, rgba(253, 230, 138, 0.45) 100%)",
        }}
      >
        <div className="w-full max-w-4xl rounded-3xl bg-white/90 backdrop-blur-md border border-sky-100/90 shadow-xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3.5">
              <BrandLogo sizeClass="w-12 h-12" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
                    CreativeFlow Studio
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200/80">
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping" />
                    Cloud Sync
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Menghubungkan sesi & antrean produksi video tim...
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto px-3.5 py-2 rounded-2xl bg-slate-50 border border-slate-200/70 text-xs font-medium text-slate-600">
              <span className="w-4 h-4 rounded-full border-2 border-sky-600 border-t-transparent animate-spin" />
              <span>Memuat workspace</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 animate-pulse">
            <div className="h-24 rounded-2xl bg-slate-100/90 border border-slate-200/60 p-4 flex flex-col justify-between">
              <div className="h-3 w-20 rounded bg-slate-200" />
              <div className="h-6 w-12 rounded bg-slate-200" />
            </div>
            <div className="h-24 rounded-2xl bg-slate-100/90 border border-slate-200/60 p-4 flex flex-col justify-between">
              <div className="h-3 w-24 rounded bg-slate-200" />
              <div className="h-6 w-12 rounded bg-slate-200" />
            </div>
            <div className="h-24 rounded-2xl bg-slate-100/90 border border-slate-200/60 p-4 flex flex-col justify-between">
              <div className="h-3 w-20 rounded bg-slate-200" />
              <div className="h-6 w-12 rounded bg-slate-200" />
            </div>
          </div>

          <div className="space-y-2.5 animate-pulse">
            <div className="h-12 rounded-2xl bg-slate-100/80 border border-slate-200/50" />
            <div className="h-12 rounded-2xl bg-slate-100/70 border border-slate-200/50" />
            <div className="h-12 rounded-2xl bg-slate-100/60 border border-slate-200/50" />
          </div>
        </div>
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
              Role: <span className="text-amber-300 font-semibold">Brand Manager</span> • <span className="text-amber-300 font-semibold">Team Produksi</span> • <span className="text-amber-300 font-semibold">Editor</span> • <span className="text-amber-300 font-semibold">Sosial Media Manager</span>
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
                      {ROLES.map((r) => <option key={r} value={r}>{getRoleLabel(r)}</option>)}
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

  const handleDeleteVideoOrder = (order) => {
    if (!order) return;
    if (typeof setPendingDeleteOrder === "function") {
      setPendingDeleteOrder(order);
    }
  };

  const confirmDeleteVideoOrder = async () => {
    const target = pendingDeleteOrder;
    if (!target) return;
    const targetDocId = target.docId || target.id;
    if (typeof setIsDeletingOrder === "function") setIsDeletingOrder(true);
    try {
      if (targetDocId && typeof db !== "undefined") {
        await deleteDoc(doc(db, "orders", String(targetDocId)));
      }
      if (typeof setOrders === "function") {
        setOrders((prev) =>
          (Array.isArray(prev) ? prev : []).filter(
            (item) => (item?.docId || item?.id) !== targetDocId
          )
        );
      }
      if (typeof setPendingDeleteOrder === "function") setPendingDeleteOrder(null);
      if (typeof setSelectedOrderId === "function") {
        setSelectedOrderId((curr) => (curr === targetDocId ? null : curr));
      }
    } catch (err) {
      console.error("Gagal menghapus orderan video:", err);
      alert(err?.message || "Gagal menghapus orderan video.");
    } finally {
      if (typeof setIsDeletingOrder === "function") setIsDeletingOrder(false);
    }
  };

  return (
    <>
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
              <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-bold">{Array.isArray(waLogs) ? waLogs.filter((l) => !(Array.isArray(readWaLogIds) && readWaLogIds.includes(l.id))).length : 0}</span>
            </button>
            <div className="hidden md:flex flex-col items-end leading-tight">
              <span className="text-xs font-bold text-slate-800">{currentUser.name}</span>
              <span className="text-[11px] text-sky-700 font-medium">{getRoleLabel(currentUser.role)}{resolveCurrentUserWhatsApp(currentUser, teamUsers) ? ` • +${resolveCurrentUserWhatsApp(currentUser, teamUsers)}` : " • Belum ada WA"}</span>
            </div>
            <button type="button" onClick={() => signOut(auth)} className="p-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer" title="Keluar"><LogOut className="w-4 h-4" /></button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-sky-100">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Antrean Produksi Video Vertikal (9:16)</h2>
            <p className="text-xs text-slate-500 mt-0.5">Tersinkronisasi langsung dengan Firestore • Anggota tim terdaftar: {(Array.isArray(teamUsers) ? teamUsers.length : 0)} orang.</p>
          </div>
          {(canCreateTiktokAccount(currentUser?.role) || canCreateOrder(currentUser?.role)) && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {canCreateTiktokAccount(currentUser?.role) && (
                <button
                  type="button"
                  onClick={() => setIsAddTiktokModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-500 text-slate-950 text-xs font-bold cursor-pointer"
                >
                  + Tambah Akun TikTok
                </button>
              )}
              {canCreateOrder(currentUser?.role) && (
                <button type="button" onClick={() => {
                  if (typeof setNewTitle === "function") setNewTitle("");
                  if (typeof setNewBrand === "function") setNewBrand("");
                  if (typeof setNewPlatform === "function") setNewPlatform("TikTok");
                  if (typeof setNewContentType === "function") setNewContentType("");
                  if (typeof setNewBrief === "function") setNewBrief("");
                  if (typeof setNewRawFootageUrl === "function") setNewRawFootageUrl("");
                  if (typeof setNewReferenceUrl === "function") setNewReferenceUrl("");
                  if (typeof setNewDeadline === "function") setNewDeadline("");
                  if (typeof setNewPriority === "function") setNewPriority("Normal");
                  if (typeof setIsNewOrderOpen === "function") setIsNewOrderOpen(true);
                }} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold transition cursor-pointer shrink-0">
                  <Plus className="w-4 h-4" />Buat Order Video
                </button>
              )}
            </div>
          )}
        </div>

        {(() => {
          const allOrders = (Array.isArray(orders) ? orders : []).filter((ord) => {
            if (!ord) return false;
            const rText = String(
              (typeof currentUser !== "undefined" && currentUser?.role) ||
                (typeof activeRole !== "undefined" ? activeRole : "") ||
                ""
            )
              .trim()
              .toLowerCase();
            const isBmAccount =
              rText.includes("brand manager") ||
              rText.includes("brand management") ||
              rText === "manager" ||
              rText === "admin" ||
              rText === "owner";
            if (!isBmAccount) {
              if (rText.includes("editor") && typeof currentUser !== "undefined" && currentUser) {
                return isOrderVisibleToCurrentEditor(ord, currentUser);
              }
              return true;
            }

            const myUid = String(currentUser?.uid || currentUser?.id || "").trim();
            const myEmail = String(currentUser?.email || "").trim().toLowerCase();
            const myName = String(currentUser?.name || "").trim().toLowerCase();
            const orderUid = String(ord?.requestedByUid || "").trim();
            const orderEmail = String(ord?.requestedByEmail || "").trim().toLowerCase();
            const orderReqBy = String(ord?.requestedBy || "").trim().toLowerCase();

            if (orderUid) return Boolean(myUid && orderUid === myUid);
            if (orderEmail) return Boolean(myEmail && orderEmail === myEmail);
            if (orderReqBy) return Boolean((myName && orderReqBy === myName) || (myEmail && orderReqBy === myEmail));
            return false;
          });
          const isPostedItem = (ord) => {
            const stLow = String(ord?.status || "").trim().toLowerCase();
            return (
              Boolean(ord?.isPosted) ||
              Boolean(ord?.postedAt) ||
              stLow === "sudah diposting" ||
              stLow === "sudah diupload" ||
              stLow === "sudah di-upload" ||
              stLow === "terposting"
            );
          };

          const totalOrderCount = allOrders.length;
          const queueCount = allOrders.filter(
            (ord) => !isPostedItem(ord) && String(ord?.status || "").trim() === "Antrean"
          ).length;
          const workOrRevisionCount = allOrders.filter((ord) => {
            if (isPostedItem(ord)) return false;
            const st = String(ord?.status || "").trim();
            return st === "Sedang Dikerjakan" || st === "Revisi";
          }).length;
          const reviewOrReadyCount = allOrders.filter((ord) => {
            if (isPostedItem(ord)) return false;
            const st = String(ord?.status || "").trim();
            return st === "Kurasi BM" || st === "Review" || st === "Siap Posting" || st === "Selesai";
          }).length;
          const alreadyPostedCount = allOrders.filter((ord) => isPostedItem(ord)).length;

          const summaryCardsConfig = [
            {
              key: "total",
              title: "Total Order",
              count: totalOrderCount,
              cardClass: "bg-white p-4 rounded-2xl border border-slate-200/80 hover:border-slate-400 transition text-left cursor-pointer",
              labelClass: "text-xs font-medium text-slate-500",
              valueClass: "text-2xl font-bold text-slate-900 mt-1",
            },
            {
              key: "queue",
              title: "Dalam Antrean",
              count: queueCount,
              cardClass: "bg-white p-4 rounded-2xl border border-sky-200 hover:border-sky-400 transition text-left cursor-pointer",
              labelClass: "text-xs font-medium text-sky-700",
              valueClass: "text-2xl font-bold text-sky-800 mt-1",
            },
            {
              key: "work_revision",
              title: "Dikerjakan / Revisi",
              count: workOrRevisionCount,
              cardClass: "bg-white p-4 rounded-2xl border border-amber-200 hover:border-amber-400 transition text-left cursor-pointer",
              labelClass: "text-xs font-medium text-amber-700",
              valueClass: "text-2xl font-bold text-amber-800 mt-1",
            },
            {
              key: "review_ready",
              title: "Review / Siap Posting",
              count: reviewOrReadyCount,
              cardClass: "bg-white p-4 rounded-2xl border border-emerald-200 hover:border-emerald-400 transition text-left cursor-pointer",
              labelClass: "text-xs font-medium text-emerald-700",
              valueClass: "text-2xl font-bold text-emerald-800 mt-1",
            },
            {
              key: "posted",
              title: "Sudah Posting",
              count: alreadyPostedCount,
              cardClass: "bg-white p-4 rounded-2xl border border-violet-200 hover:border-violet-400 transition text-left cursor-pointer",
              labelClass: "text-xs font-medium text-violet-700",
              valueClass: "text-2xl font-bold text-violet-800 mt-1",
            },
          ];

          const parseCardOrderMs = (item) => {
            const raw = item?.createdAt ?? item?.timestamp ?? item?.updatedAt ?? item?.postedAt ?? null;
            if (!raw) return null;
            if (typeof raw === "number") return raw;
            if (typeof raw?.toMillis === "function") return raw.toMillis();
            if (typeof raw?.seconds === "number") return raw.seconds * 1000;
            const dt = Date.parse(raw);
            return Number.isNaN(dt) ? null : dt;
          };

          const activeCardCfg = summaryCardsConfig.find((c) => c.key === summaryPopupKey) || null;
          const popupOrders = (() => {
            if (!activeCardCfg) return [];
            const filtered = allOrders
              .map((order, index) => ({ order, index }))
              .filter(({ order }) => {
                if (typeof isOrderOwnedByCurrentAccount === "function" && !isOrderOwnedByCurrentAccount(order)) {
                  return false;
                }
                if (!order) return false;
                const posted = isPostedItem(order);
                const st = String(order?.status || "").trim();
                if (activeCardCfg.key === "total") return true;
                if (activeCardCfg.key === "queue") return !posted && st === "Antrean";
                if (activeCardCfg.key === "work_revision")
                  return !posted && (st === "Sedang Dikerjakan" || st === "Revisi");
                if (activeCardCfg.key === "review_ready")
                  return !posted && (st === "Kurasi BM" || st === "Review" || st === "Siap Posting" || st === "Selesai");
                if (activeCardCfg.key === "posted") return posted;
                return false;
              })
              .sort((a, b) => {
                const msA = parseCardOrderMs(a.order);
                const msB = parseCardOrderMs(b.order);
                if (msA !== null && msB !== null && msA !== msB) return msA - msB;
                if (msA !== null && msB === null) return -1;
                if (msA === null && msB !== null) return 1;
                return a.index - b.index;
              })
              .map(({ order }) => order);

            if (activeCardCfg.key === "review_ready") {
              const rev = filtered.filter((o) => {
                const s = String(o?.status || "").trim();
                return s === "Kurasi BM" || s === "Review";
              });
              const ready = filtered.filter((o) => {
                const s = String(o?.status || "").trim();
                return s === "Siap Posting" || s === "Selesai";
              });
              return [...rev, ...ready];
            }
            return filtered;
          })();

          return (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {summaryCardsConfig.map((card) => (
                  <button
                    key={card.key}
                    type="button"
                    onClick={() => setSummaryPopupKey(card.key)}
                    className={card.cardClass}
                  >
                    <div className={card.labelClass}>{card.title}</div>
                    <div className={card.valueClass}>{card.count}</div>
                  </button>
                ))}
              </div>

              {activeCardCfg && (
                <div
                  onClick={() => setSummaryPopupKey(null)}
                  className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[1px] flex items-center justify-center p-4"
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-2xl max-h-[82vh] flex flex-col overflow-hidden"
                  >
                    <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                      <div className="flex items-baseline gap-2.5">
                        <h3 className="text-base font-bold text-slate-900">{activeCardCfg.title}</h3>
                        <span className="text-xs font-medium text-slate-500">
                          {popupOrders.length} konten
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSummaryPopupKey(null)}
                        className="px-3 py-1 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                      >
                        Tutup
                      </button>
                    </div>

                    <div className="p-5 overflow-y-auto space-y-2.5">
                      {popupOrders.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-xs text-slate-500">
                          Belum ada konten untuk kategori {activeCardCfg.title}.
                        </div>
                      ) : (
                        popupOrders.map((ord) => {
                          const isPostedItemDone = isPostedItem(ord);
                          const isReadyItem = !isPostedItemDone && String(ord?.status || "").trim() === "Selesai";
                          const badgeText = isPostedItemDone
                            ? "Terposting"
                            : isReadyItem
                            ? "Siap Posting"
                            : ord?.status || "Antrean";

                          return (
                            <div
                              key={ord.docId || ord.id}
                              onClick={() => {
                                if (typeof setShowEditorSubmitTab === "function") setShowEditorSubmitTab(false);
                                if (typeof setShowRevisionInput === "function") setShowRevisionInput(false);
                                if (typeof setSelectedOrderId === "function") setSelectedOrderId(ord.docId || ord.id);
                                setSummaryPopupKey(null);
                              }}
                              className="p-3.5 rounded-xl border border-slate-200 hover:border-sky-300 hover:bg-sky-50/40 transition flex items-center justify-between gap-3 cursor-pointer"
                            >
                              <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[11px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md">
                                    {ord.id || "ORDER"}
                                  </span>
                                  <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full">
                                    {badgeText}
                                  </span>
                                </div>
                                <div className="text-sm font-bold text-slate-900 truncate">
                                  {ord.title || "Untitled Order"}
                                </div>
                                <div className="text-xs text-slate-500 truncate">
                                  {ord.accountName || ord.brand || "-"} • {ord.platform || "TikTok"}
                                </div>
                              </div>
                              <span className="text-xs font-semibold text-sky-700 shrink-0">Detail →</span>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}


          {/* Grid Card Akun TikTok (Real-Time dari Firestore) */}
          {canViewAllTiktokAccounts(currentUser?.role) && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2.5">
                <h2 className="text-base font-bold text-slate-900">Akun TikTok</h2>
                <span className="text-xs font-medium text-slate-500">
                  {(tiktokAccounts?.length ?? 0)} akun
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-[11px] text-slate-400">
                  Sinkron real-time • Klik "Buka akun" untuk kelola jenis konten & monitoring order
                </span>
              </div>
            </div>

            {(tiktokAccounts?.length ?? 0) === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-6 text-center space-y-2">
                <p className="text-sm font-semibold text-slate-700">Belum ada akun TikTok terdaftar</p>
                <p className="text-xs text-slate-500">
                  {canCreateTiktokAccount(currentUser?.role)
                    ? 'Klik tombol "+ Tambah Akun TikTok" di atas untuk menambahkan akun pertama Anda.'
                    : "Penambahan akun TikTok baru hanya dapat dilakukan oleh Brand Manager."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {(Array.isArray(tiktokAccounts) ? tiktokAccounts : []).map((account, idx) => {
                  const accountOrders = (Array.isArray(orders) ? orders : []).filter((ord) =>
                    isOrderMatchedToTiktokAccount(ord, account)
                  );
                  const readyToPostCount = accountOrders.filter(
                    (ord) => ord.status === "Selesai" && !ord.isPosted
                  ).length;
                  const tags = sanitizeContentTypes(
                    Array.isArray(account.contentTypes) ? account.contentTypes : []
                  );

                  return (
                    <div
                      key={String(account.docId || account.id || account.accountName || idx) + "_" + idx}
                      className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition flex flex-col justify-between gap-4"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm shrink-0 overflow-hidden">
                              {(account?.logoUrl || account?.brandLogo) ? (
                                <img
                                  src={account.logoUrl || account.brandLogo}
                                  alt={account?.accountName || account?.brandName || "Logo Akun"}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                "♪"
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-sm text-slate-900 truncate">
                                {account.accountName || account.brandName}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="font-medium text-slate-600 truncate">
                            {account.brandName || "-"}
                          </span>
                          <span className="text-[11px] text-slate-400 shrink-0">
                            {readyToPostCount} video siap posting
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {tags.length > 0 ? (
                            tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[11px] font-medium"
                              >
                                {tag}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-slate-400">Belum ada jenis konten</span>
                          )}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                        <span
                          className={
                            "px-2.5 py-1 rounded-md text-xs font-semibold " +
                            (readyToPostCount > 0
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-slate-100 text-slate-600")
                          }
                        >
                          {readyToPostCount} video siap posting
                        </span>

                        <button
                          type="button"
                          onClick={() => openTiktokAccountManager(account, "monitoring")}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700 hover:text-sky-700 transition cursor-pointer"
                        >
                          <span>Buka akun</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          )}

          {/* Grid Daftar Order Video Utama */}
          {(() => {
            const parseOrderMs = (item) => {
              const raw = item?.createdAt ?? item?.timestamp ?? item?.updatedAt ?? item?.postedAt ?? null;
              if (!raw) return null;
              if (typeof raw === "number") return raw;
              if (typeof raw?.toMillis === "function") return raw.toMillis();
              if (typeof raw?.seconds === "number") return raw.seconds * 1000;
              const dt = Date.parse(raw);
              return Number.isNaN(dt) ? null : dt;
            };

            const baseSource = (Array.isArray(orders) ? orders : []).filter((ord) => {
              if (!ord) return false;
              const rText = String(
                (typeof currentUser !== "undefined" && currentUser?.role) ||
                  (typeof activeRole !== "undefined" ? activeRole : "") ||
                  ""
              )
                .trim()
                .toLowerCase();
              const isBmAccount =
                rText.includes("brand manager") ||
                rText.includes("brand management") ||
                rText === "manager" ||
                rText === "admin" ||
                rText === "owner";
              if (!isBmAccount) {
                if (rText.includes("editor") && typeof currentUser !== "undefined" && currentUser) {
                  return isOrderVisibleToCurrentEditor(ord, currentUser);
                }
                return true;
              }

              const myUid = String(currentUser?.uid || currentUser?.id || "").trim();
              const myEmail = String(currentUser?.email || "").trim().toLowerCase();
              const myName = String(currentUser?.name || "").trim().toLowerCase();
              const orderUid = String(ord?.requestedByUid || "").trim();
              const orderEmail = String(ord?.requestedByEmail || "").trim().toLowerCase();
              const orderReqBy = String(ord?.requestedBy || "").trim().toLowerCase();

              if (orderUid) return Boolean(myUid && orderUid === myUid);
              if (orderEmail) return Boolean(myEmail && orderEmail === myEmail);
              if (orderReqBy) return Boolean((myName && orderReqBy === myName) || (myEmail && orderReqBy === myEmail));
              return false;
            });
            const compareOldestFirst = (a, b) => {
              const msA = parseOrderMs(a.order);
              const msB = parseOrderMs(b.order);
              if (msA !== null && msB !== null && msA !== msB) return msA - msB;
              if (msA !== null && msB === null) return -1;
              if (msA === null && msB !== null) return 1;
              return a.index - b.index;
            };

            const isPostedOrder = (ord) => {
              const stLow = String(ord?.status || "").trim().toLowerCase();
              return (
                Boolean(ord?.isPosted) ||
                Boolean(ord?.postedAt) ||
                stLow === "sudah diposting" ||
                stLow === "sudah diupload" ||
                stLow === "sudah di-upload" ||
                stLow === "terposting"
              );
            };

            const activeRoleText = String(
              (typeof currentUser !== "undefined" && currentUser?.role) ||
                (typeof activeRole !== "undefined" ? activeRole : "") ||
                ""
            )
              .trim()
              .toLowerCase();
            const isVideoEditorRole = activeRoleText.includes("editor");

            const displayedBrandOrders = (() => {
              const isHistoryActive = typeof showContentHistory !== "undefined" && showContentHistory;

              if (isVideoEditorRole) {
                if (isHistoryActive) {
                  const readyInHistory = baseSource
                    .map((order, index) => ({ order, index }))
                    .filter(({ order }) => {
                      if (!order || isPostedOrder(order)) return false;
                      return String(order.status || "").trim() === "Selesai";
                    })
                    .sort(compareOldestFirst)
                    .map(({ order }) => order);

                  const postedInHistory = baseSource
                    .map((order, index) => ({ order, index }))
                    .filter(({ order }) => order && isPostedOrder(order))
                    .sort(compareOldestFirst)
                    .map(({ order }) => order);

                  return [...readyInHistory, ...postedInHistory];
                }

                const queueList = baseSource
                  .map((order, index) => ({ order, index }))
                  .filter(
                    ({ order }) =>
                      order &&
                      !isPostedOrder(order) &&
                      String(order.status || "").trim() === "Antrean"
                  )
                  .sort(compareOldestFirst)
                  .map(({ order }) => order);

                const workingList = baseSource
                  .map((order, index) => ({ order, index }))
                  .filter(
                    ({ order }) =>
                      order &&
                      !isPostedOrder(order) &&
                      String(order.status || "").trim() === "Sedang Dikerjakan"
                  )
                  .sort(compareOldestFirst)
                  .map(({ order }) => order);

                const revisionList = baseSource
                  .map((order, index) => ({ order, index }))
                  .filter(
                    ({ order }) =>
                      order &&
                      !isPostedOrder(order) &&
                      String(order.status || "").trim() === "Revisi"
                  )
                  .sort(compareOldestFirst)
                  .map(({ order }) => order);

                return [...queueList, ...workingList, ...revisionList];
              }

              if (isHistoryActive) {
                return baseSource
                  .map((order, index) => ({ order, index }))
                  .filter(({ order }) => order && isPostedOrder(order))
                  .sort(compareOldestFirst)
                  .map(({ order }) => order);
              }

              const reviewList = baseSource
                .map((order, index) => ({ order, index }))
                .filter(
                  ({ order }) =>
                    order &&
                    !isPostedOrder(order) &&
                    String(order.status || "").trim() === "Review"
                )
                .sort(compareOldestFirst)
                .map(({ order }) => order);

              const readyToPostList = baseSource
                .map((order, index) => ({ order, index }))
                .filter(
                  ({ order }) =>
                    order &&
                    !isPostedOrder(order) &&
                    String(order.status || "").trim() === "Selesai"
                )
                .sort(compareOldestFirst)
                .map(({ order }) => order);

              return [...reviewList, ...readyToPostList];
            })();

            return (
          <>
<section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Produktivitas Tim
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200/70">
                    {productivityData.isAdminOrOwner ? "Seluruh Tim" : "Akun Anda"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {productivityData.isAdminOrOwner
                    ? "Pantau output, proses revisi, dan tingkat penyelesaian per Brand Manager & Video Editor."
                    : "Ringkasan output dan progres order konten video"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowProductivityPanel((prev) => !prev)}
                className={
                  "px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer shrink-0 self-start sm:self-auto " +
                  (showProductivityPanel
                    ? "bg-sky-600 text-white border-sky-600"
                    : "bg-slate-50 text-slate-700 border-slate-200 hover:border-sky-300 hover:text-sky-700")
                }
              >
                {showProductivityPanel ? "Tutup Rekap" : "Lihat Produktivitas"}
              </button>
            </div>

            {showProductivityPanel && (
              <div className="space-y-4 pt-1 border-t border-slate-100">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 pt-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      { id: "today", label: "Hari Ini" },
                      { id: "7d", label: "7 Hari" },
                      { id: "30d", label: "30 Hari" },
                      { id: "all", label: "Semua" },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setProductivityRange(p.id)}
                        className={
                          "px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer " +
                          (productivityRange === p.id
                            ? "bg-slate-900 text-white border-slate-900"
                            : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50")
                        }
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {productivityData.isAdminOrOwner && (
                      <select
                        value={productivityRoleFilter}
                        onChange={(e) => setProductivityRoleFilter(e.target.value)}
                        className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 bg-white"
                      >
                        <option value="Semua">Semua Role</option>
                        <option value="Video Editor">Video Editor</option>
                        <option value="Brand Management">Brand Management</option>
                      </select>
                    )}
                    <input
                      type="text"
                      value={productivitySearch}
                      onChange={(e) => setProductivitySearch(e.target.value)}
                      placeholder="Cari nama user..."
                      className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs text-slate-700 bg-white w-full sm:w-44"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3">
                    <div className="text-[11px] font-medium text-slate-500">Total Order</div>
                    <div className="text-lg font-bold text-slate-900 mt-0.5">{productivityData.summary.total}</div>
                  </div>
                  <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/70 p-3">
                    <div className="text-[11px] font-medium text-emerald-700">Selesai</div>
                    <div className="text-lg font-bold text-emerald-800 mt-0.5">{productivityData.summary.completed}</div>
                  </div>
                  <div className="rounded-xl bg-indigo-50/70 border border-indigo-200/70 p-3">
                    <div className="text-[11px] font-medium text-indigo-700">Menunggu Review</div>
                    <div className="text-lg font-bold text-indigo-800 mt-0.5">{productivityData.summary.review}</div>
                  </div>
                  <div className="rounded-xl bg-amber-50/70 border border-amber-200/70 p-3">
                    <div className="text-[11px] font-medium text-amber-800">Rasio Selesai</div>
                    <div className="text-lg font-bold text-amber-900 mt-0.5">{productivityData.completionRate}%</div>
                  </div>
                </div>

                {productivityData.rows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-500">
                    Belum ada data produktivitas pada periode atau filter yang dipilih.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {productivityData.rows.map((row) => (
                      <div
                        key={`${row.role}-${row.key}`}
                        className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-3.5 space-y-2.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900 truncate">{row.name}</div>
                            <span className="inline-block mt-0.5 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white border border-slate-200 text-slate-600">
                              {row.role}
                            </span>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-bold text-emerald-700">{row.completionRate}% Selesai</div>
                            <div className="text-[11px] text-slate-500">{row.completed}/{row.total} order</div>
                          </div>
                        </div>

                        <div className="w-full h-2 rounded-full bg-slate-200/80 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-emerald-500 transition-all"
                            style={{ width: `${Math.min(100, Math.max(0, row.completionRate))}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600 pt-0.5 flex-wrap">
                          <span>Antrean/Proses: <b>{row.queue + row.inProgress}</b></span>
                          <span>Review: <b>{row.review}</b></span>
                          <span>Revisi: <b className="text-rose-600">{row.revision}</b></span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-baseline gap-2.5 min-w-0">
                <h2 className="text-base font-bold text-slate-900 truncate">
                  {showContentHistory ? "Riwayat Konten" : "Daftar Order Video"}
                </h2>
                <span className="text-xs font-medium text-slate-500 shrink-0">
                  {(displayedBrandOrders?.length ?? 0)} order
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowContentHistory((prev) => !prev)}
                className={
                  "px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer shrink-0 " +
                  (showContentHistory
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-slate-700 border-slate-200 hover:border-sky-300 hover:text-sky-700")
                }
              >
                Riwayat Konten
              </button>
            </div>

            {(displayedBrandOrders?.length ?? 0) === 0 ? (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center space-y-1.5">
                <p className="text-sm font-semibold text-slate-700">Belum ada order video yang tampil</p>
                <p className="text-xs text-slate-500">
                  Klik tombol "+ Buat Order Video" untuk membuat order baru atau ubah filter pencarian.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayedBrandOrders.map((ord) => {
                  const isReadyToPost = ord.status === "Selesai" && !ord.isPosted;
                  const isPostedDone = ord.status === "Selesai" && Boolean(ord.isPosted);
                  const baseStCfg = STATUS_CONFIG[ord.status] || {
                    label: ord.status || "Antrean",
                    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
                    dotClass: "bg-slate-500",
                  };
                  const stCfg = isReadyToPost
                    ? {
                        label: "Siap Posting",
                        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
                        dotClass: "bg-emerald-500",
                      }
                    : isPostedDone
                    ? {
                        label: "Terposting",
                        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
                        dotClass: "bg-slate-500",
                      }
                    : baseStCfg;
                  return (
                    <div
                      key={ord.docId || ord.id}
                      onClick={() => {
                        if (typeof setShowEditorSubmitTab === "function") setShowEditorSubmitTab(false);
                        if (typeof setShowRevisionInput === "function") setShowRevisionInput(false);
                        if (typeof setSelectedOrderId === "function") setSelectedOrderId(ord.docId || ord.id);
                      }}
                      className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-sky-300 transition flex flex-col justify-between gap-3 cursor-pointer"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded-md">
                            {ord.id || "ORDER"}
                          </span>
                          <span className={"inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border " + stCfg.badgeClass}>
                            <span className={"w-1.5 h-1.5 rounded-full " + stCfg.dotClass} />
                            {stCfg.label}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 line-clamp-2">{ord.title || "Untitled Order"}</h3>
                        <p className="text-xs text-slate-500 truncate">{ord.brand || "-"} • {ord.platform || "TikTok"}</p>
                      </div>
                      <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                        <span>{ord.contentType || ord.type || "Konten"}</span>
                        <span className="font-semibold text-sky-700">Detail →</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          </>);
          })()}
      </main>

      {isNewOrderOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-sky-100 max-w-lg w-full p-6 shadow-xl space-y-4" style={{ backgroundImage: "linear-gradient(145deg, rgba(255, 255, 255, 0.92) 0%, rgba(240, 249, 255, 0.35) 58%, rgba(254, 243, 199, 0.38) 100%)" }}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900">Buat Order Video Vertikal (9:16)</h3>
              <button type="button" onClick={() => setIsNewOrderOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={(e) => { if (typeof handleCreateOrder === "function") return handleCreateOrder(e); e.preventDefault(); }} className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="relative">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Akun Tiktok</label>
                  <div className="relative">
                    <div className="relative flex items-center">
                      <input
                        type="text"
                        required
                        value={newBrand}
                        onClick={() => setIsTiktokDropdownOpen(true)}
                        onFocus={() => setIsTiktokDropdownOpen(true)}
                        onBlur={() => setTimeout(() => setIsTiktokDropdownOpen(false), 160)}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNewBrand(val);
                          setIsTiktokDropdownOpen(true);
                          const found = (Array.isArray(tiktokAccounts) ? tiktokAccounts : []).find(
                            (acc) =>
                              String(acc?.accountName || "").toLowerCase() === val.trim().toLowerCase() ||
                              String(acc?.brandName || "").toLowerCase() === val.trim().toLowerCase()
                          );
                          if (found) {
                            const cleanTypes = sanitizeContentTypes(found.contentTypes);
                            if ((cleanTypes?.length ?? 0) > 0) {
                              setNewContentType(cleanTypes[0]);
                            }
                          }
                        }}
                        placeholder="Pilih atau ketik @akun / brand..."
                        autoComplete="off"
                        className="w-full px-3 py-2 pr-14 rounded-xl border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 transition text-sm bg-white"
                      />
                      {newBrand && (
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setNewBrand("");
                            setNewContentType("");
                            setIsTiktokDropdownOpen(true);
                          }}
                          title="Reset & tampilkan semua akun"
                          className="absolute right-2 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 hover:text-slate-800 rounded bg-slate-100 hover:bg-slate-200 transition cursor-pointer"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                  {isTiktokDropdownOpen && (
                    <div className="absolute left-0 right-0 mt-1.5 z-30 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg py-1 transition-all duration-150">
                      {(Array.isArray(tiktokAccounts) ? tiktokAccounts : [])
                        .filter((acc) => {
                          const q = (newBrand || "").trim().toLowerCase();
                          if (!q) return true;
                          const bName = String(acc?.brandName || "").toLowerCase();
                          const aName = String(acc?.accountName || "").toLowerCase();
                          const isExactSelected = bName === q || aName === q;
                          if (isExactSelected) return true;
                          return bName.includes(q) || aName.includes(q);
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
                                setNewContentType(Array.isArray(cleanTypes) && cleanTypes.length > 0 ? cleanTypes[0] : "");
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
                    value={orderModalContentTypes.includes(newContentType) ? newContentType : ""}
                    onChange={(e) => setNewContentType(e.target.value)}
                    disabled={orderModalContentTypes.length === 0}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/15 transition text-sm bg-white text-slate-800 disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    <option value="">{orderModalContentTypes.length === 0 ? "Pilih akun TikTok dulu" : "Pilih jenis konten"}</option>
                    {orderModalContentTypes.map((ct, idx) => (
                      <option key={String(ct) + "_" + idx} value={ct}>
                        {ct}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Jumlah Konten / Batch (1 - 20)</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={batchCount}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (Number.isNaN(val)) {
                      setBatchCount(1);
                    } else {
                      setBatchCount(Math.min(20, Math.max(1, val)));
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm"
                />
                <p className="text-[11px] text-slate-500 mt-1">Maksimal 20 video dalam 1 kali kirim. Setiap video akan dibuatkan item order terpisah agar Video Editor bisa submit hasilnya per video.</p>
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
                    <><option value="">Semua Editor</option>{Array.from(new Map((Array.isArray(editors) ? editors : []).filter((ed) => ed && (ed.name || ed.fullName || ed.email)).map((ed) => { const label = String(ed.name || ed.fullName || ed.email).trim(); return [label.toLowerCase(), { key: ed.id || ed.docId || label, value: label, label }]; })).values()).map((opt) => <option key={opt.key} value={opt.value}>{opt.label}</option>)}</>
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
                  <div><span className="font-semibold text-slate-800">Editor:</span> {selectedOrder.assignedEditor || "-"}</div>
                  <div><span className="font-semibold text-slate-800">Deadline:</span> {selectedOrder.deadline || "-"}</div>
                  <div><span className="font-semibold text-slate-800">Prioritas:</span> {selectedOrder.priority || "Normal"}</div>
                  <div className="pt-1">
                    <span className="font-semibold text-slate-800">Referensi:</span>{" "}
                    {selectedOrder.referenceUrl ? (
                      <a href={selectedOrder.referenceUrl} target="_blank" rel="noreferrer" className="text-sky-700 underline break-all">{selectedOrder.referenceUrl}</a>
                    ) : (
                      <span>-</span>
                    )}
                  </div>
                  <div className="pt-1"><span className="font-semibold text-slate-800">Brief:</span> {selectedOrder.brief || "-"}</div>
                  <div className="pt-1">
                    <span className="font-semibold text-slate-800">Link RAW Footage:</span>{" "}
                    {selectedOrder.rawFootageUrl ? (
                      <a href={selectedOrder.rawFootageUrl} target="_blank" rel="noreferrer" className="text-sky-700 underline break-all">{selectedOrder.rawFootageUrl}</a>
                    ) : (
                      <span>-</span>
                    )}
                  </div>
                  {selectedOrder.revisionNote && (
                    <div className="mt-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">
                      <span className="font-bold">Catatan Revisi:</span> {selectedOrder.revisionNote}
                    </div>
                  )}
                </div>

                {/* PANEL AKSI BERDASARKAN ROLE */}
                {(currentUser?.role === "Video Editor" || Boolean(isEditor)) ? (
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

                    {(selectedOrder.status === "Kurasi BM" || selectedOrder.status === "Review") && (
                      <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-800 font-medium">
                        Video sudah dikirim dan berstatus <span className="font-bold">Kurasi BM</span>. Menunggu kurasi Brand Manager (Revisi / Siap Posting).
                      </div>
                    )}

                    {(selectedOrder.status === "Siap Posting" || selectedOrder.status === "Selesai") && !selectedOrder.isPosted && (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
                        Order ini telah lolos kurasi dan berstatus <span className="font-bold">Siap Posting</span> untuk dipublikasikan oleh SMM.
                      </div>
                    )}

                    {selectedOrder.status === "Sudah Diposting" && (
                      <div className="p-3 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-800 font-medium">
                        Konten telah dipublikasikan dan berstatus <span className="font-bold">Sudah Diposting</span>.
                      </div>
                    )}
                  </div>
                ) : (
                  /* PANEL UNTUK BRAND MANAGER & Brand Manager */
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">Keputusan Review Order</span>
                      <span className="text-[11px] font-semibold text-slate-500">
                        {selectedOrder.status === "Antrean" && "Keterangan: Masih dalam antrean editor"}
                        {selectedOrder.status === "Sedang Dikerjakan" && "Keterangan: Sedang dikerjakan oleh editor"}
                        {selectedOrder.status === "Revisi" && "Keterangan: Sedang direvisi oleh editor"}
                        {(selectedOrder.status === "Kurasi BM" || selectedOrder.status === "Review") && "Keterangan: Menunggu kurasi Brand Manager"}
                        {(selectedOrder.status === "Siap Posting" || selectedOrder.status === "Selesai") && !selectedOrder.isPosted && "Keterangan: Lolos kurasi, siap diposting SMM"}
                        {selectedOrder.status === "Sudah Diposting" && "Keterangan: Sudah dipublikasikan"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        disabled={selectedOrder.status === "Selesai" && Boolean(selectedOrder.isPosted)}
                        onClick={() => {
                          if (typeof setShowEditorSubmitTab === "function") setShowEditorSubmitTab(false);
                          setShowRevisionInput((prev) => !prev);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold text-xs transition cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Revisi
                      </button>

                      <button
                        type="button"
                        disabled={!canCurateOrder(currentUser?.role) || (selectedOrder.status !== "Kurasi BM" && selectedOrder.status !== "Review")}
                        onClick={handleApproveComplete}
                        className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-semibold text-xs transition cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Selesai
                      </button>
                    </div>

                    {canMarkPosted(currentUser?.role) && (selectedOrder.status === "Siap Posting" || selectedOrder.status === "Selesai") && !selectedOrder.isPosted && (
                      <div className="pt-2">
                        <button
                          type="button"
                          disabled={postingOrderDocId === selectedOrder.docId}
                          onClick={() => handleMarkOrderAsPosted(selectedOrder)}
                          className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-bold text-xs transition cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {postingOrderDocId === selectedOrder.docId ? "Menandai Terposting..." : "Posting"}
                        </button>
                      </div>
                    )}

                    {selectedOrder.status === "Selesai" && Boolean(selectedOrder.isPosted) && (
                      <div className="pt-2">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-50 text-sky-700 border border-sky-200 text-xs font-semibold">
                          Sudah Diposting
                        </span>
                      </div>
                    )}

                    {isBrandManager && (
                      <div className="pt-4 border-t border-slate-200 flex items-center justify-end">
                        <button
                          type="button"
                          disabled={isDeletingOrder}
                          onClick={() => handleDeleteVideoOrder(selectedOrder)}
                          className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white text-xs font-bold transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          {isDeletingOrder ? "Menghapus Orderan..." : "Hapus Orderan"}
                        </button>
                      </div>
                    )}

                    {selectedOrder.status !== "Kurasi BM" && selectedOrder.status !== "Review" && (
                      <p className="text-[11px] text-slate-500">
                        Tombol <span className="font-semibold">Revisi</span> dan <span className="font-semibold">Siap Posting</span> hanya aktif saat status <span className="font-semibold text-indigo-700">Kurasi BM</span> untuk Brand Manager.
                      </p>
                    )}

                    {showRevisionInput && canCurateOrder(currentUser?.role) && (selectedOrder.status === "Kurasi BM" || selectedOrder.status === "Review") && (
                      <form onSubmit={async (e) => {
                        if (e && typeof e.preventDefault === "function") e.preventDefault();
                        const currentOrderSnapshot = selectedOrder;
                        const cleanNote = String(revisionNote || "").trim() || currentOrderSnapshot?.brief || "-";
                        try {
                          if (typeof handleRequestRevision === "function") {
                            await handleRequestRevision(e);
                          }
                          if (currentOrderSnapshot?.docId && typeof updateDoc === "function" && typeof doc === "function" && typeof db !== "undefined" && db) {
                            await updateDoc(doc(db, "orders", currentOrderSnapshot.docId), {
                              status: "Revisi",
                              revisionNote: cleanNote,
                              updatedAt: typeof serverTimestamp === "function" ? serverTimestamp() : new Date().toISOString(),
                            });
                          }
                          if (typeof setShowRevisionInput === "function") setShowRevisionInput(false);
                          if (typeof setRevisionNote === "function") setRevisionNote("");
                        } catch (err) {
                          console.error("Gagal mengirim revisi order:", err);
                        }
                      }} className="p-3 rounded-xl bg-white border border-rose-200 space-y-2.5">
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
              {(Array.isArray(waLogs) ? waLogs.length : 0) === 0 ? (
                <p className="text-xs text-slate-400">Belum ada log notifikasi WA.</p>
              ) : waLogs.map((log) => {
                const isRead = (Array.isArray(readWaLogIds) && readWaLogIds.includes(log.id));
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
      {activeTiktokAccount && (() => {
        const linkedOrders = (Array.isArray(orders) ? orders : []).filter(
          (ord) => isOrderOwnedByCurrentAccount(ord) && isOrderMatchedToTiktokAccount(ord, activeTiktokAccount)
        );
        const readyToPostList = linkedOrders.filter(
          (ord) => ord.status === "Selesai" && !ord.isPosted
        );
        const postedList = linkedOrders.filter(
          (ord) => ord.status === "Selesai" && Boolean(ord.isPosted)
        );
        const inProgressList = linkedOrders.filter((ord) => ord.status !== "Selesai");

        const q = (accountSearchQuery || "").trim().toLowerCase();
        const filteredOrders = linkedOrders.filter((ord) => {
          const matchesQuery =
            !q ||
            String(ord.id || "").toLowerCase().includes(q) ||
            String(ord.title || "").toLowerCase().includes(q) ||
            String(ord.brand || "").toLowerCase().includes(q);
          const matchesStatus =
            accountStatusFilter === "Semua" || ord.status === accountStatusFilter;
          const matchesPlatform =
            accountPlatformFilter === "Semua" || ord.platform === accountPlatformFilter;
          return matchesQuery && matchesStatus && matchesPlatform;
        });

        const allAvailableTypes = Array.from(
          new Map(
            sanitizeContentTypes([
              ...TIKTOK_CONTENT_TYPES,
              ...(Array.isArray(editTtSelectedTypes) ? editTtSelectedTypes : []),
            ]).map((t) => [String(t || "").trim().toLowerCase(), String(t || "").trim()])
          ).values()
        ).filter(Boolean);

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 bg-slate-50/70">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center font-bold text-sm shrink-0">
                    ♪
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-base text-slate-900 truncate">
                        {activeTiktokAccount.accountName || activeTiktokAccount.brandName}
                      </h3>
                      <span className="px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 text-[11px] font-semibold">
                        {activeTiktokAccount.brandName}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      Monitoring konten akun & manajemen akun TikTok
                    </p>
                  </div>
                </div>

                
                <div className="relative z-20 flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setActiveTiktokAccountId(null)}
                  className="p-2 rounded-xl hover:bg-slate-200/70 text-slate-600 cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
                </div>
              </div>

              {/* Tab & Aksi Hapus (Khusus Brand Manager) */}
              <div className="px-6 pt-3 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap bg-white">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTiktokDrawerTab("monitoring")}
                    className={
                      "px-3.5 py-2 text-xs font-semibold border-b-2 transition cursor-pointer " +
                      (tiktokDrawerTab === "monitoring"
                        ? "border-sky-600 text-sky-700"
                        : "border-transparent text-slate-500 hover:text-slate-800")
                    }
                  >
                    Daftar Konten Akun ({linkedOrders.length})
                  </button>
                  {isBrandManager && (
                    <button
                      type="button"
                      onClick={() => setTiktokDrawerTab("edit")}
                      className={
                        "px-3.5 py-2 text-xs font-semibold border-b-2 transition cursor-pointer " +
                        (tiktokDrawerTab === "edit"
                          ? "border-sky-600 text-sky-700"
                          : "border-transparent text-slate-500 hover:text-slate-800")
                      }
                    >
                      Edit Akun & Jenis Konten
                    </button>
                  )}
                </div>

                {isBrandManager && (
                  <button
                    type="button"
                    disabled={isDeletingTtAccount}
                    onClick={handleDeleteTiktokAccount}
                    className="mb-2 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    {isDeletingTtAccount ? "Menghapus..." : "Hapus Akun"}
                  </button>
                )}
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto space-y-5 flex-1 bg-slate-50/40">
                {tiktokDrawerTab === "monitoring" || !isBrandManager ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                        <div className="text-[11px] font-semibold text-slate-600 uppercase">
                          Dalam Produksi
                        </div>
                        <div className="text-2xl font-bold text-slate-900 mt-0.5">
                          {inProgressList.length}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Antrean / Proses / Review / Revisi
                        </div>
                      </div>

                      <div className="rounded-xl border border-emerald-200 bg-white p-3.5">
                        <div className="text-[11px] font-semibold text-emerald-700 uppercase">
                          Siap Posting
                        </div>
                        <div className="text-2xl font-bold text-slate-900 mt-0.5">
                          {readyToPostList.length}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Status "Selesai" & belum diposting
                        </div>
                      </div>

                      <div className="rounded-xl border border-sky-200 bg-white p-3.5">
                        <div className="text-[11px] font-semibold text-sky-700 uppercase">
                          Sudah Diposting
                        </div>
                        <div className="text-2xl font-bold text-slate-900 mt-0.5">
                          {postedList.length}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Sudah ditandai terposting di Detail Order
                        </div>
                      </div>
                    </div>

                    {/* Baris Cari ID Order, Judul Konten, atau Brand + Filter Status & Platform */}
                    <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col md:flex-row items-stretch md:items-center gap-3">
                      <input
                        type="text"
                        value={accountSearchQuery}
                        onChange={(e) => setAccountSearchQuery(e.target.value)}
                        placeholder="Cari ID order, judul konten, atau brand..."
                        className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-sky-500"
                      />
                      <select
                        value={accountStatusFilter}
                        onChange={(e) => setAccountStatusFilter(e.target.value)}
                        className="px-3.5 py-2 rounded-xl border border-slate-300 text-sm bg-white text-slate-700 focus:outline-none focus:border-sky-500"
                      >
                        <option value="Semua">Semua Status</option>
                        {Object.keys(STATUS_CONFIG || {}).map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                      <select
                        value={accountPlatformFilter}
                        onChange={(e) => setAccountPlatformFilter(e.target.value)}
                        className="px-3.5 py-2 rounded-xl border border-slate-300 text-sm bg-white text-slate-700 focus:outline-none focus:border-sky-500"
                      >
                        <option value="Semua">Semua Platform</option>
                        {(PLATFORMS || ["TikTok", "Instagram Reels", "YouTube Shorts"]).map((pf) => (
                          <option key={pf} value={pf}>
                            {pf}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Grid Kotak-Kotak (Card Grid) Daftar Konten Akun */}
                    {filteredOrders.length === 0 ? (
                      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
                        Belum ada konten order yang sesuai dengan filter pada akun ini.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredOrders.map((ord) => {
                          const stCfg = STATUS_CONFIG[ord.status] || {
                            label: ord.status || "Antrean",
                            badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
                            dotClass: "bg-slate-500",
                          };
                          const isReady = ord.status === "Selesai" && !ord.isPosted;
                          const isPosted = ord.status === "Selesai" && Boolean(ord.isPosted);

                          return (
                            <div
                              key={ord.docId || ord.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (typeof setActiveTiktokAccountId === "function") setActiveTiktokAccountId(null);
                                if (typeof setSelectedOrderId === "function") setSelectedOrderId(ord.docId || ord.id);
                              }}
                              className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs hover:border-sky-400 transition flex flex-col justify-between gap-4 cursor-pointer"
                            >
                              <div className="space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="px-2.5 py-1 rounded-lg bg-sky-50 text-sky-700 text-[11px] font-bold truncate">
                                    {ord.id} • {ord.brand || activeTiktokAccount.brandName}
                                  </span>
                                  <span
                                    className={
                                      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold shrink-0 " +
                                      (isPosted
                                        ? "bg-sky-50 text-sky-700 border-sky-200"
                                        : isReady
                                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                          : stCfg.badgeClass)
                                    }
                                  >
                                    <span
                                      className={
                                        "w-1.5 h-1.5 rounded-full " +
                                        (isPosted
                                          ? "bg-sky-500"
                                          : isReady
                                            ? "bg-emerald-500"
                                            : stCfg.dotClass || "bg-slate-500")
                                      }
                                    />
                                    {isPosted ? "Sudah Diposting" : isReady ? "Siap Posting" : stCfg.label}
                                  </span>
                                </div>

                                <div>
                                  <h4 className="font-bold text-sm text-slate-900 line-clamp-1">
                                    {ord.title}
                                  </h4>
                                  <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                                    {ord.brief || ord.contentType || "-"}
                                  </p>
                                </div>
                              </div>

                              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-200/80 text-[11px] font-semibold truncate">
                                    {ord.platform || "TikTok"} ({ord.aspectRatio || "9:16"})
                                  </span>
                                  <span className="text-[11px] text-slate-500 truncate">
                                    {ord.deadline || "-"}
                                  </span>
                                </div>

                                <span className="inline-flex items-center gap-0.5 text-xs font-bold text-sky-700 shrink-0">
                                  <span>Detail</span>
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  /* Tab Edit Akun & Jenis Konten (Khusus Brand Manager) */
                  <form
                    onSubmit={handleUpdateTiktokAccountDetail}
                    className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Nama Brand
                        </label>
                        <input
                          type="text"
                          value={editTtBrandName}
                          onChange={(e) => setEditTtBrandName(e.target.value)}
                          placeholder="Contoh: PrimaGold"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-sky-500"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Handle / Akun TikTok
                        </label>
                        <input
                          type="text"
                          value={editTtAccountName}
                          onChange={(e) => setEditTtAccountName(e.target.value)}
                          placeholder="@primagold_official"
                          className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-sky-500"
                          required
                        />
                      </div>
                    </div>

                    {/* LOGO_EDIT_SECTION */}
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-700">Logo Brand</label>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="w-12 h-12 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                          {editTtBrandLogo ? (
                            <img src={editTtBrandLogo} alt="Logo Brand" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[11px] font-bold text-slate-400">LOGO</span>
                          )}
                        </div>
                        <label className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer">
                          Pilih / Ganti Logo
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleTtLogoFileChange(e, "edit")}
                            className="hidden"
                          />
                        </label>
                        {editTtBrandLogo && (
                          <button
                            type="button"
                            onClick={() => setEditTtBrandLogo("")}
                            className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
                          >
                            Hapus Logo
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        Jenis Konten Akun (Tambah / Hapus Tag)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {allAvailableTypes.map((typeName) => {
                          const active = (Array.isArray(editTtSelectedTypes) ? editTtSelectedTypes : []).includes(
                            typeName
                          );
                          return (
                            <button
                              key={typeName}
                              type="button"
                              onClick={() => toggleEditTtContentType(typeName)}
                              className={
                                "px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer " +
                                (active
                                  ? "bg-emerald-600 text-white border-emerald-600"
                                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50")
                              }
                            >
                              {active ? "✓ " : "+ "}
                              {typeName}
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <input
                          type="text"
                          value={editTtCustomType}
                          onChange={(e) => setEditTtCustomType(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddEditTtCustomType();
                            }
                          }}
                          placeholder="Tambah jenis konten kustom baru..."
                          className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-sky-500"
                        />
                        <button
                          type="button"
                          onClick={handleAddEditTtCustomType}
                          className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold cursor-pointer"
                        >
                          Tambah Tag
                        </button>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setTiktokDrawerTab("monitoring")}
                        className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        disabled={isSavingTtEdit}
                        className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                      >
                        {isSavingTtEdit ? "Menyimpan..." : "Simpan Perubahan Akun"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {isAddTiktokModalOpen && canCreateTiktokAccount(currentUser?.role) && (
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
            {/* LOGO_ADD_SECTION */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-700">Logo Brand (Opsional)</label>
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
                  {ttBrandLogo ? (
                    <img src={ttBrandLogo} alt="Preview Logo Brand" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] font-bold text-slate-400">LOGO</span>
                  )}
                </div>
                <label className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer">
                  Upload Logo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleTtLogoFileChange(e, "add")}
                    className="hidden"
                  />
                </label>
                {ttBrandLogo && (
                  <button
                    type="button"
                    onClick={() => setTtBrandLogo("")}
                    className="text-xs font-semibold text-rose-600 hover:underline cursor-pointer"
                  >
                    Hapus
                  </button>
                )}
              </div>
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
                  {Array.from(new Set([...(Array.isArray(TIKTOK_CONTENT_TYPES) ? TIKTOK_CONTENT_TYPES : []), ...(Array.isArray(brandManagerContentTypes) ? brandManagerContentTypes : [])])).map((ct) => {
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
                {(Array.isArray(ttSelectedTypes) ? ttSelectedTypes.length : 0) === 0 && (
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
                  disabled={(Array.isArray(ttSelectedTypes) ? ttSelectedTypes.length : 0) === 0}
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
      {pendingDeleteOrder && (
        <div className="fixed inset-0 z-[70] bg-slate-900/60 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-rose-200 shadow-2xl max-w-md w-full p-6 space-y-4">
            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">
                Peringatan Penghapusan Orderan
              </div>
              <h3 className="text-lg font-bold text-slate-900">
                Hapus Orderan Video?
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Orderan video{" "}
                <span className="font-bold text-slate-900">
                  {pendingDeleteOrder.id ? `${pendingDeleteOrder.id} - ` : ""}
                  {pendingDeleteOrder.title || "tanpa judul"}
                </span>{" "}
                akan dihapus secara permanen dan tidak dapat dikembalikan. Apakah Anda yakin ingin melanjutkan?
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingOrder}
                onClick={() => setPendingDeleteOrder(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingOrder}
                onClick={confirmDeleteVideoOrder}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white text-xs font-bold transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isDeletingOrder ? "Menghapus..." : "Ya, Hapus Orderan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>

  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <CreativeFlowApp />
    </AppErrorBoundary>
  );
}
