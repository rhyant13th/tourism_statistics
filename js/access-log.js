/**
 * ACCESS LOG: records who signs in and which pages they open (stored in Firestore),
 * and shows the admin a summary + recent activity. Admin-only view.
 *
 * Each log entry = one Firestore document in CLOUD_ACCESS_LOG:
 *   { uid, email, role: 'admin'|'viewer', type: 'login'|'view'|'logout', page, ts, tsMs, device }
 */

const ACCESS_SESSION_FLAG = "tourismAccessLoggedUid";
let accessLogRecords = [];

function accEsc(v) {
    return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function accDescribeDevice() {
    const ua = navigator.userAgent || "";
    let browser = "Browser";
    if (/Edg\//.test(ua)) browser = "Edge";
    else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
    else if (/Chrome\//.test(ua)) browser = "Chrome";
    else if (/Firefox\//.test(ua)) browser = "Firefox";
    else if (/Safari\//.test(ua)) browser = "Safari";
    let os = "Unknown OS";
    if (/Android/.test(ua)) os = "Android";
    else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
    else if (/Windows/.test(ua)) os = "Windows";
    else if (/Mac OS X/.test(ua)) os = "macOS";
    else if (/Linux/.test(ua)) os = "Linux";
    return `${browser} on ${os}`;
}

/** Writes one log entry. Never throws - logging must not break the app. */
async function logAccessEvent(type, page) {
    try {
        const user = window.currentUser;
        if (!user) return;
        await waitForCloud();
        const { collection, doc, setDoc } = window.cloudFns;
        const now = new Date();
        const id = now.getTime() + "_" + Math.random().toString(36).slice(2, 8);
        await setDoc(doc(collection(window.cloudDB, CLOUD_ACCESS_LOG), id), {
            uid: user.uid,
            email: String(user.email || "").toLowerCase(),
            role: window.isAdmin ? "admin" : "viewer",
            type: type,
            page: page || "",
            ts: now.toISOString(),
            tsMs: now.getTime(),
            device: accDescribeDevice()
        });
    } catch (err) {
        console.warn("Access log write failed:", err);
    }
}

/** Called once after a successful sign-in. Refreshing the page in the same tab is NOT counted again. */
function logSessionStart() {
    const user = window.currentUser;
    if (!user) return;
    try {
        if (sessionStorage.getItem(ACCESS_SESSION_FLAG) === user.uid) return;
        sessionStorage.setItem(ACCESS_SESSION_FLAG, user.uid);
    } catch (_) { /* sessionStorage unavailable - log anyway */ }
    logAccessEvent("login", "dashboard");
}

function logTabView(tabId) {
    if (tabId === "access-log") return; // don't log the admin looking at the log itself
    logAccessEvent("view", tabId);
}

async function logLogoutEvent() {
    await logAccessEvent("logout", "");
    try { sessionStorage.removeItem(ACCESS_SESSION_FLAG); } catch (_) {}
}

/* ---------------------------- ADMIN VIEW ---------------------------- */

async function loadAccessLogs() {
    await waitForCloud();
    const { collection, getDocs, query, orderBy, limit } = window.cloudFns;
    const q = query(collection(window.cloudDB, CLOUD_ACCESS_LOG), orderBy("tsMs", "desc"), limit(5000));
    const snap = await getDocs(q);
    accessLogRecords = snap.docs.map(d => d.data());
}

function getFilteredAccessLogs() {
    const range = document.getElementById("accessRange").value;
    const role = document.getElementById("accessRole").value;
    const search = document.getElementById("accessSearch").value.trim().toLowerCase();
    let cutoff = 0;
    if (range === "TODAY") { const d = new Date(); d.setHours(0, 0, 0, 0); cutoff = d.getTime(); }
    else if (range !== "ALL") cutoff = Date.now() - Number(range) * 86400000;

    return accessLogRecords.filter(r => {
        if (cutoff && r.tsMs < cutoff) return false;
        if (role === "NONADMIN" && r.role === "admin") return false;
        if (role === "ADMIN" && r.role !== "admin") return false;
        if (search && !String(r.email || "").includes(search)) return false;
        return true;
    });
}

function accFmt(ms) {
    return new Date(ms).toLocaleString("en-PH", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
}

async function refreshAccessLog() {
    const body = document.getElementById("accessRecentBody");
    if (body) body.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400"><i class="fa-solid fa-spinner fa-spin mr-1"></i> Loading…</td></tr>`;
    try {
        await loadAccessLogs();
    } catch (err) {
        console.error(err);
        showToast("Could not load the access log: " + err.message, "danger");
        if (body) body.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-rose-500">Failed to load. Check your Firestore rules (see setup notes).</td></tr>`;
        return;
    }
    renderAccessLog();
}

function renderAccessLog() {
    if (!window.isAdmin) return;
    if (!document.getElementById("accessRecentBody")) return;
    // First open: fetch from the cloud, then render.
    if (!accessLogRecords.length && !renderAccessLog._loaded) {
        renderAccessLog._loaded = true;
        refreshAccessLog();
        return;
    }

    const rows = getFilteredAccessLogs();
    const logins = rows.filter(r => r.type === "login");
    const views = rows.filter(r => r.type === "view");
    const users = {};
    rows.forEach(r => {
        const key = r.email || r.uid;
        if (!users[key]) users[key] = { email: key, role: r.role, sessions: 0, views: 0, first: r.tsMs, last: r.tsMs, device: r.device };
        const u = users[key];
        if (r.type === "login") u.sessions++;
        if (r.type === "view") u.views++;
        if (r.tsMs < u.first) u.first = r.tsMs;
        if (r.tsMs >= u.last) { u.last = r.tsMs; u.device = r.device; }
    });
    const userList = Object.values(users).sort((a, b) => b.last - a.last);

    document.getElementById("accessKpiSessions").textContent = logins.length.toLocaleString();
    document.getElementById("accessKpiUsers").textContent = userList.length.toLocaleString();
    document.getElementById("accessKpiViews").textContent = views.length.toLocaleString();

    const sumBody = document.getElementById("accessSummaryBody");
    sumBody.innerHTML = userList.length ? userList.map(u => `<tr class="hover:bg-slate-50 border-b">
        <td class="p-3 font-semibold text-slate-800">${accEsc(u.email)}${u.role === "admin" ? ' <span class="ml-1 px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 text-[10px]">admin</span>' : ""}</td>
        <td class="p-3 text-right font-bold text-teal-700">${u.sessions.toLocaleString()}</td>
        <td class="p-3 text-right">${u.views.toLocaleString()}</td>
        <td class="p-3 text-slate-600">${accFmt(u.first)}</td>
        <td class="p-3 text-slate-600">${accFmt(u.last)}</td>
        <td class="p-3 text-slate-500">${accEsc(u.device)}</td>
    </tr>`).join("") : `<tr><td colspan="6" class="p-6 text-center text-slate-400">No access records for this filter yet.</td></tr>`;

    const recent = rows.slice(0, 200);
    const label = { login: "Signed in", view: "Opened page", logout: "Signed out" };
    const color = { login: "bg-emerald-100 text-emerald-800", view: "bg-slate-100 text-slate-700", logout: "bg-amber-100 text-amber-800" };
    document.getElementById("accessRecentBody").innerHTML = recent.length ? recent.map(r => `<tr class="hover:bg-slate-50 border-b">
        <td class="p-3 text-slate-600 whitespace-nowrap">${accFmt(r.tsMs)}</td>
        <td class="p-3 font-medium text-slate-800">${accEsc(r.email)}</td>
        <td class="p-3"><span class="px-2 py-0.5 rounded-full text-[11px] ${color[r.type] || color.view}">${label[r.type] || accEsc(r.type)}</span></td>
        <td class="p-3 text-slate-600">${accEsc(r.page)}</td>
        <td class="p-3 text-slate-500">${accEsc(r.device)}</td>
    </tr>`).join("") : `<tr><td colspan="5" class="p-6 text-center text-slate-400">No activity for this filter yet.</td></tr>`;
    document.getElementById("accessRecentNote").textContent = rows.length > 200 ? `Showing latest 200 of ${rows.length.toLocaleString()} entries (export to Excel for all).` : "";
}

function exportAccessLogExcel() {
    if (!requireAdmin("download the access log")) return;
    const rows = getFilteredAccessLogs();
    const headers = ["Date & Time", "Email", "Role", "Event", "Page", "Device"];
    const data = rows.map(r => [accFmt(r.tsMs), r.email, r.role, r.type, r.page, r.device]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, makeDataSheet(headers, data, []), "Access Log");
    saveWorkbook(wb, `Access_Log_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
