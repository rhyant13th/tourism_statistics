/**
 * TOURISM STATISTICS DATA BANKING SYSTEM - app.js (all application code in one file)
 * Sections, in load order: Settings, Shared State, Login & Roles, Local DB, Cloud Sync,
 * Import Helpers, Export Helpers, UI, Dashboard, AEs, TAss, Annual/Monthly Reports,
 * Top Lists, Country of Origin, Trend Comparison, Backup & Restore, Report Date, Startup.
 * Search for "##### SECTION:" to jump between sections.
 */

// ##############################################################################
// ##### SECTION: CONFIG
// ##############################################################################

/**
 * SETTINGS: admin emails, database names, cloud collection names, month names, Firebase keys.
 * Edit this file first when you need to change who is admin or which database/collections are used.
 */

/**
 * FIREBASE PROJECT KEYS
 * Read by the small module script in index.html (<head>). Firebase web keys are
 * meant to be public; real protection comes from your Firestore security rules.
 */
window.APP_CONFIG = {
  firebase: {
    apiKey: "AIzaSyAzEmPXSJs2i1OZqTkwE1cSOR7GQ0gUDFo",
    authDomain: "tourism-statistics-c06b9.firebaseapp.com",
    projectId: "tourism-statistics-c06b9",
    storageBucket: "tourism-statistics-c06b9.firebasestorage.app",
    messagingSenderId: "268830989351",
    appId: "1:268830989351:web:2750b8b727b8ada1cf8202",
    measurementId: "G-0KPS0T2FLY"
  }
};

/**
 * GLOBAL APPLICATION CONSTANTS & MONTH NAMES
 */
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Current calendar year - used wherever a default year is needed (so 2027, 2028... work automatically).
const CURRENT_YEAR = new Date().getFullYear();

// Only this email can edit. Everyone else is view-only.
const ADMIN_EMAILS = ["rhyant13th@gmail.com"];

// IndexedDB Configuration
const DB_NAME = "TourismDataBankDB";

const DB_VERSION = 4;

/**
 * CLOUD SYNC QUEUE
 * Tracks which local records still need to be pushed to Firestore
 * (new/edited records whose immediate cloud write hasn't happened or
 * failed) and which deleted records still need to be removed from
 * Firestore. This lets "Save to Cloud" push ONLY what changed instead
 * of re-uploading the entire database every time. Persisted to
 * localStorage so nothing is lost if the tab closes before syncing.
 */
const PENDING_SYNC_KEY = "tourismPendingSync_v1";

/**
 * FIRESTORE CLOUD STORAGE
 * Firestore is the shared master copy. IndexedDB remains a local cache
 * so the application remains responsive and can recover from temporary
 * network interruptions.
 */
const CLOUD_AE = "tourism_ae_records";

const CLOUD_TASS = "tourism_tass_records";
const CLOUD_COLLECTIONS = { aes: CLOUD_AE, tass: CLOUD_TASS };
const CLOUD_COUNTRY_COLLECTION = "tourism_country_records";

/**
 * COUNTRY OF ORIGIN (FORM A) — self-contained store/sync, separate from
 * the aes/tass pipeline above. Import-only (no manual per-record edits),
 * so it doesn't need the dirty-tracking sync queue those two types use.
 *
 * A localStorage mirror backs up every successful save. If IndexedDB
 * ever comes back empty/unavailable on load (e.g. the "countries"
 * store wasn't ready yet), this mirror is what keeps an import from
 * silently disappearing on refresh.
 */
const COUNTRY_LS_KEY = "tourismCountryRecords_v1";

// ##############################################################################
// ##### SECTION: STATE
// ##############################################################################

/**
 * SHARED STATE: in-memory record lists, login state, pending bulk-upload queues, chart handles.
 * Every other file reads/writes these variables.
 */

window.isAdmin = false;
window.currentUser = null;
let appInitialized = false;
let db = null;

// In-Memory Data Collections
let aeRecords = [];

let tassRecords = [];
let countryRecords = [];

// Temporary parsed bulk upload queues
let pendingBulkAE = [];

let pendingBulkTAss = [];
let pendingSync = { aes: new Set(), tass: new Set() };
let pendingDeletes = { aes: [], tass: [] };

// Chart instances

let chartTopAEObj = null;
let chartTopTAssObj = null;
let chartYearlyTotalsObj = null;
let chartTopMuniYearObj = null;
let chartTopMuniBarAEObj = null;
let chartTopMuniBarTAssObj = null;
let chartCountryPieObj = null;
let chartCountryBarObj = null;

// ##############################################################################
// ##### SECTION: AUTH
// ##############################################################################

/**
 * LOGIN & ROLES: sign-in form, admin vs view-only mode, logout.
 */

function applyRoleUI() {
    document.querySelectorAll('.admin-only').forEach(el => {
        el.style.display = window.isAdmin ? '' : 'none';
    });
    const badge = document.getElementById('userRoleBadge');
    if (badge && window.currentUser) {
        badge.classList.remove('hidden');
        if (window.isAdmin) {
            badge.className = 'hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-teal-800 text-teal-100';
            badge.innerHTML = '<i class="fa-solid fa-shield-halved mr-1"></i> Admin · ' + window.currentUser.email;
        } else {
            badge.className = 'hidden sm:inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-700 text-slate-200';
            badge.innerHTML = '<i class="fa-solid fa-eye mr-1"></i> Viewer · ' + window.currentUser.email;
        }
    }
    // Re-render tables so action buttons respect the current role
    if (typeof renderAETable === 'function') try { renderAETable(); } catch(e) {}
    if (typeof renderTAssTable === 'function') try { renderTAssTable(); } catch(e) {}
}

function requireAdmin(actionName) {
    if (!window.isAdmin) {
        showToast('View-only mode: only the admin can ' + (actionName || 'make changes') + '.', 'warning');
        return false;
    }
    return true;
}

async function handleLogout() {
    try {
        if (window.firebaseAuthFns && window.firebaseAuth) {
            await window.firebaseAuthFns.signOut(window.firebaseAuth);
        }
    } catch (err) {
        console.error(err);
    }
}

function setupAuth() {
    return new Promise((resolve) => {
        const waitForAuth = () => {
            if (!window.firebaseAuth || !window.firebaseAuthFns) {
                setTimeout(waitForAuth, 50);
                return;
            }
            const { onAuthStateChanged, signInWithEmailAndPassword } = window.firebaseAuthFns;

            // Login form
            const form = document.getElementById('loginForm');
            if (form) {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const email = document.getElementById('loginEmail').value.trim();
                    const password = document.getElementById('loginPassword').value;
                    const errBox = document.getElementById('loginError');
                    const btn = document.getElementById('loginSubmitBtn');
                    errBox.classList.add('hidden');
                    btn.disabled = true;
                    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing in…';
                    try {
                        await signInWithEmailAndPassword(window.firebaseAuth, email, password);
                    } catch (err) {
                        errBox.textContent = err.message || 'Login failed';
                        errBox.classList.remove('hidden');
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign in';
                    }
                });
            }

            onAuthStateChanged(window.firebaseAuth, (user) => {
                window.currentUser = user;
                window.isAdmin = !!(user && ADMIN_EMAILS.includes(user.email));
                const overlay = document.getElementById('loginOverlay');
                const shell = document.getElementById('appShell');
                if (user) {
                    if (overlay) overlay.classList.add('hidden');
                    if (shell) {
                        shell.classList.remove('hidden');
                        shell.classList.add('flex');
                    }
                    applyRoleUI();
                    resolve(user);
                } else {
                    if (overlay) overlay.classList.remove('hidden');
                    if (shell) {
                        shell.classList.add('hidden');
                        shell.classList.remove('flex');
                    }
                    window.isAdmin = false;
                }
            });
        };
        waitForAuth();
    });
}

// ##############################################################################
// ##### SECTION: LOCAL-DB
// ##############################################################################

/**
 * LOCAL DATABASE (IndexedDB in the browser): open the DB, read/write/clear records.
 */

function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = function(e) {
            db = e.target.result;
            // Store 1: Tourist Arrivals - Accommodation Establishments
            if (!db.objectStoreNames.contains("aes")) {
                const aeStore = db.createObjectStore("aes", { keyPath: "id", autoIncrement: true });
                aeStore.createIndex("uniqueKey", ["province", "municipality", "year", "month", "establishment"], { unique: true });
            }
            // Store 2: Same-Day Visitors - Tourist Attractions
            if (!db.objectStoreNames.contains("tass")) {
                const tassStore = db.createObjectStore("tass", { keyPath: "id", autoIncrement: true });
                tassStore.createIndex("uniqueKey", ["province", "municipality", "year", "month", "attraction"], { unique: true });
            }
            // Store 3: Country of Origin - Form A guest arrivals by country (imported files, no manual CRUD)
            if (!db.objectStoreNames.contains("countries")) {
                db.createObjectStore("countries", { keyPath: "id", autoIncrement: true });
            }
            // Schema cleanup: drop any object store from an older DB version that
            // is no longer part of the schema (only "aes", "tass" and "countries" remain).
            Array.from(db.objectStoreNames).forEach(name => {
                if (name !== "aes" && name !== "tass" && name !== "countries") db.deleteObjectStore(name);
            });
        };

        request.onsuccess = function(e) {
            db = e.target.result;
            document.getElementById('dbStatusBadge').innerHTML = `<span class="w-2 h-2 mr-1.5 bg-emerald-400 rounded-full animate-pulse"></span> IndexedDB Active`;
            resolve(db);
        };

        request.onerror = function(e) {
            reject(e);
        };
    });
}

/**
 * DB CRUD HELPERS
 */
async function loadAllRecords() {
    if (!db) return;
    aeRecords = await getAllFromStore("aes");
    tassRecords = await getAllFromStore("tass");
}

function getAllFromStore(storeName) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readonly");
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
    });
}

function putRecordToStore(storeName, record) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.put(record);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

function deleteRecordFromStore(storeName, id) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.delete(id);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}

function clearStore(storeName) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.clear();
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Bulk write helpers. A single IndexedDB transaction can hold thousands
 * of puts, so batching every record into ONE transaction (instead of
 * awaiting a separate transaction per record in a loop) turns an O(n)
 * series of round trips into a single fast commit. This is what makes
 * loading/restoring large datasets smooth instead of hanging.
 */
function putRecordsBulk(storeName, records) {
    return new Promise((resolve, reject) => {
        if (!records || !records.length) return resolve([]);
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        const ids = [];
        records.forEach(r => {
            const req = store.put(r);
            req.onsuccess = () => ids.push(req.result);
        });
        tx.oncomplete = () => resolve(ids);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Bulk write aborted."));
    });
}

function clearAndBulkPut(storeName, records) {
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, "readwrite");
        const store = tx.objectStore(storeName);
        store.clear();
        (records || []).forEach(r => store.put(r));
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("Bulk replace aborted."));
    });
}

// ##############################################################################
// ##### SECTION: CLOUD-SYNC
// ##############################################################################

/**
 * CLOUD DATABASE (Firebase Firestore): load, save, delete, and the offline "pending changes" queue.
 */

function loadPendingSync() {
    try {
        const raw = localStorage.getItem(PENDING_SYNC_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        pendingSync.aes = new Set(parsed.aes || []);
        pendingSync.tass = new Set(parsed.tass || []);
        pendingDeletes.aes = parsed.deletesAes || [];
        pendingDeletes.tass = parsed.deletesTass || [];
    } catch (_) { /* corrupt/unavailable storage - start clean */ }
}

function persistPendingSync() {
    try {
        localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify({
            aes: Array.from(pendingSync.aes),
            tass: Array.from(pendingSync.tass),
            deletesAes: pendingDeletes.aes,
            deletesTass: pendingDeletes.tass
        }));
    } catch (_) { /* storage unavailable - sync queue just won't survive reload */ }
}

function markDirty(type, id) {
    if (id === undefined || id === null) return;
    pendingSync[type].add(id);
    persistPendingSync();
}

function clearDirty(type, ids) {
    ids.forEach(id => pendingSync[type].delete(id));
    persistPendingSync();
}

function markPendingDelete(type, record) {
    pendingDeletes[type].push(cleanCloudRecord(record));
    persistPendingSync();
}

function pendingSyncCount() {
    return pendingSync.aes.size + pendingSync.tass.size + pendingDeletes.aes.length + pendingDeletes.tass.length;
}

function cloudDocId(type, r) {
    const parts = [r.province, r.municipality, r.year, r.month, type === "aes" ? r.establishment : r.attraction];
    return parts.map(v => String(v ?? "").trim().toLowerCase())
        .join("__").replace(/[^a-z0-9_-]+/g, "_").slice(0, 500);
}

function updateCloudStatus(label, good = false) {
    const badge = document.getElementById("dbStatusBadge");
    if (!badge) return;
    badge.className = `inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${good ? "bg-emerald-900 text-emerald-200" : "bg-amber-900 text-amber-200"}`;
    badge.innerHTML = `<span class="w-2 h-2 mr-1.5 ${good ? "bg-emerald-400" : "bg-amber-400"} rounded-full"></span> ${label}`;
}

function cleanCloudRecord(r) {
    const copy = { ...r };
    delete copy.id;
    delete copy.localId;
    delete copy.cloudUpdatedAt;
    return copy;
}

async function waitForCloud() {
    if (window.cloudReadyPromise) await window.cloudReadyPromise;
    if (!window.cloudDB || !window.cloudFns) throw new Error("Firestore is not available.");
}

async function getCloudRecords(type) {
    await waitForCloud();
    const { collection, getDocs } = window.cloudFns;
    const snap = await getDocs(collection(window.cloudDB, CLOUD_COLLECTIONS[type]));
    return snap.docs.map(d => cleanCloudRecord(d.data()));
}

async function loadAllFromCloud() {
    try {
        await waitForCloud();
        const [cloudAEs, cloudTAss] = await Promise.all([
            getCloudRecords("aes"),
            getCloudRecords("tass")
        ]);

        if (cloudAEs.length || cloudTAss.length) {
            await Promise.all([
                clearAndBulkPut("aes", cloudAEs),
                clearAndBulkPut("tass", cloudTAss)
            ]);
            await loadAllRecords();
            updateCloudStatus(`Cloud Synced (${(cloudAEs.length + cloudTAss.length).toLocaleString()})`, true);
            return { connected: true, hasData: true };
        }

        updateCloudStatus("Cloud Connected — Empty", true);
        return { connected: true, hasData: false };
    } catch (err) {
        console.error("Firestore load failed:", err);
        updateCloudStatus("Cloud Error — Local Cache");
        return { connected: false, hasData: false, error: err };
    }
}

async function saveRecordsToCloud(type, records) {
    await waitForCloud();
    const { collection, doc, writeBatch } = window.cloudFns;
    const name = CLOUD_COLLECTIONS[type];
    const clean = dedupePendingRecords(type, records).map(cleanCloudRecord);
    // Firestore batches are limited to 500 writes. Chunk the upload.
    for (let i = 0; i < clean.length; i += 450) {
        const batch = writeBatch(window.cloudDB);
        const chunk = clean.slice(i, i + 450);
        chunk.forEach(r => {
            batch.set(doc(collection(window.cloudDB, name), cloudDocId(type, r)), {
                ...r,
                cloudUpdatedAt: new Date().toISOString()
            });
        });
        await batch.commit();
    }
}

async function flushPendingDeletes(type) {
    const list = pendingDeletes[type];
    if (!list.length) return;
    const remaining = [];
    for (const rec of list) {
        try { await deleteRecordFromCloud(type, rec); }
        catch (_) { remaining.push(rec); }
    }
    pendingDeletes[type] = remaining;
    persistPendingSync();
}

// showMessage: whether to toast the result. forceAll: push every record
// regardless of sync state (used for migrations/restores where the
// whole dataset genuinely needs to land in the cloud). The default
// (forceAll = false) only pushes records that are actually new,
// edited, or previously failed to sync — not the whole database.
async function saveAllToCloud(showMessage = true, forceAll = false) {
    if (!window.isAdmin) {
        if (showMessage) showToast('View-only mode: only the admin can save to the cloud.', 'warning');
        return false;
    }
    try {
        await Promise.all([flushPendingDeletes("aes"), flushPendingDeletes("tass")]);

        const aeToSync = forceAll ? aeRecords : aeRecords.filter(r => pendingSync.aes.has(r.id));
        const tassToSync = forceAll ? tassRecords : tassRecords.filter(r => pendingSync.tass.has(r.id));
        const total = aeToSync.length + tassToSync.length;

        if (total === 0) {
            updateCloudStatus(`Cloud Synced (${(aeRecords.length + tassRecords.length).toLocaleString()})`, true);
            if (showMessage) showToast("Everything is already up to date in the cloud.", "info");
            return true;
        }

        updateCloudStatus("Saving to Cloud...");
        await Promise.all([
            aeToSync.length ? saveRecordsToCloud("aes", aeToSync) : Promise.resolve(),
            tassToSync.length ? saveRecordsToCloud("tass", tassToSync) : Promise.resolve()
        ]);

        if (forceAll) {
            pendingSync.aes.clear();
            pendingSync.tass.clear();
            persistPendingSync();
        } else {
            clearDirty("aes", aeToSync.map(r => r.id));
            clearDirty("tass", tassToSync.map(r => r.id));
        }

        updateCloudStatus(`Cloud Saved (${(aeRecords.length + tassRecords.length).toLocaleString()})`, true);
        if (showMessage) showToast(`Cloud save complete: ${total.toLocaleString()} new/updated record(s) synced.`, "success");
        return true;
    } catch (err) {
        console.error("Firestore save failed:", err);
        updateCloudStatus("Cloud Save Failed");
        showToast("Cloud save failed: " + err.message, "danger");
        return false;
    }
}

async function deleteRecordFromCloud(type, record) {
    await waitForCloud();
    const { collection, doc, deleteDoc } = window.cloudFns;
    await deleteDoc(doc(collection(window.cloudDB, CLOUD_COLLECTIONS[type]), cloudDocId(type, record)));
}

async function setRecordToCloud(type, record) {
    await waitForCloud();
    const { collection, doc, setDoc } = window.cloudFns;
    await setDoc(doc(collection(window.cloudDB, CLOUD_COLLECTIONS[type]), cloudDocId(type, record)), {
        ...cleanCloudRecord(record),
        cloudUpdatedAt: new Date().toISOString()
    });
}

async function replacePeriodInCloud(type, records, periods) {
    await waitForCloud();
    const { collection, query, where, getDocs, doc, writeBatch } = window.cloudFns;
    const name = CLOUD_COLLECTIONS[type];
    const periodRecords = dedupePendingRecords(type, records);

    // Delete only the uploaded reporting period(s), not the whole database.
    for (const period of periods) {
        const q = query(
            collection(window.cloudDB, name),
            where("year", "==", Number(period.year)),
            where("month", "==", Number(period.month))
        );
        const snap = await getDocs(q);
        const deletes = snap.docs.map(d => d.ref);
        for (let i = 0; i < deletes.length; i += 450) {
            const batch = writeBatch(window.cloudDB);
            deletes.slice(i, i + 450).forEach(ref => batch.delete(ref));
            await batch.commit();
        }
    }

    // Add the replacement records in chunks.
    for (let i = 0; i < periodRecords.length; i += 450) {
        const batch = writeBatch(window.cloudDB);
        periodRecords.slice(i, i + 450).forEach(r => {
            const { collection, doc } = window.cloudFns;
            batch.set(doc(collection(window.cloudDB, name), cloudDocId(type, r)), {
                ...cleanCloudRecord(r),
                cloudUpdatedAt: new Date().toISOString()
            });
        });
        await batch.commit();
    }
}

// ##############################################################################
// ##### SECTION: IMPORT-HELPERS
// ##############################################################################

/**
 * EXCEL IMPORT HELPERS: read an Excel file, match column headers, parse month/year cells,
 * and replace-by-reporting-period logic used by the bulk uploads.
 */

// Replace the uploaded Year + Month snapshot only.
function getReportingPeriods(records) {
    const map = new Map();
    for (const r of records) { const key=`${Number(r.year)}-${Number(r.month)}`; if(!map.has(key)) map.set(key,{year:Number(r.year),month:Number(r.month)}); }
    return Array.from(map.values()).sort((a,b)=>a.year-b.year||a.month-b.month);
}

function formatReportingPeriods(periods){return periods.map(p=>`${MONTH_NAMES[p.month-1]} ${p.year}`).join(', ');}
function countRecordsForPeriods(records,periods){const keys=new Set(periods.map(p=>`${p.year}-${p.month}`));return records.filter(r=>keys.has(`${Number(r.year)}-${Number(r.month)}`)).length;}
function recordUniqueKey(storeName,r){const subject=storeName==='aes'?r.establishment:r.attraction;return [r.province,r.municipality,r.year,r.month,subject].map(v=>String(v??'').trim().toLowerCase()).join('||');}
function dedupePendingRecords(storeName,records){const map=new Map();records.forEach(r=>map.set(recordUniqueKey(storeName,r),r));return Array.from(map.values());}

function replacePeriodsInStore(storeName,records,periods){
    return new Promise((resolve,reject)=>{
        if(!db)return reject(new Error('Database is not initialized.'));
        const periodKeys=new Set(periods.map(p=>`${p.year}-${p.month}`)); const recordsToSave=dedupePendingRecords(storeName,records);
        const tx=db.transaction(storeName,'readwrite'); const store=tx.objectStore(storeName); const cursorReq=store.openCursor(); const savedRecords=[]; let transactionError=null;
        cursorReq.onerror=()=>{transactionError=cursorReq.error||new Error('Unable to read existing records.');try{tx.abort();}catch(_){};};
        cursorReq.onsuccess=e=>{const cursor=e.target.result;if(cursor){const v=cursor.value;if(periodKeys.has(`${Number(v.year)}-${Number(v.month)}`))cursor.delete();cursor.continue();}else{for(const source of recordsToSave){const rec={...source};delete rec.id;const req=store.add(rec);req.onsuccess=()=>{rec.id=req.result;savedRecords.push(rec);};req.onerror=()=>{transactionError=req.error||new Error('A duplicate record prevented the replacement.');try{tx.abort();}catch(_){};};}}};
        tx.oncomplete=()=>resolve(savedRecords);tx.onerror=()=>reject(transactionError||tx.error||new Error('Failed to replace reporting period.'));tx.onabort=()=>reject(transactionError||tx.error||new Error('Reporting period replacement was aborted.'));
    });
}

async function replaceBulkByReportingPeriod(storeName,inMemoryRecords,pendingItems,label){
    let newRecords=dedupePendingRecords(storeName,pendingItems.map(item=>item.record)); const periods=getReportingPeriods(newRecords);
    if(!periods.length)throw new Error('No valid reporting period found in the upload.');
    // Multiple Year + Month periods in one file are allowed: only the periods found in the file are replaced.
    const existingCount=countRecordsForPeriods(inMemoryRecords,periods), periodText=formatReportingPeriods(periods)+(periods.length>1?` (${periods.length} months)`:'');
    const message=existingCount>0?`Existing ${label} data was found for ${periodText}.\n\nThis will REPLACE ALL existing ${label} records for ${periodText}.\n\nOld records: ${existingCount.toLocaleString()}\nNew records: ${newRecords.length.toLocaleString()}\n\nOther months and years will remain unchanged.\n\nContinue?`:`This will save ${newRecords.length.toLocaleString()} ${label} records for ${periodText}.\n\nOther months and years will remain unchanged.\n\nContinue?`;
    if(!confirm(message))return false;
    // Cloud is the shared master copy. Only after the cloud replacement
    // succeeds do we update this browser's IndexedDB cache.
    await replacePeriodInCloud(storeName, newRecords, periods);
    const savedRecords=await replacePeriodsInStore(storeName,newRecords,periods); const periodKeys=new Set(periods.map(p=>`${p.year}-${p.month}`)); const retained=inMemoryRecords.filter(r=>!periodKeys.has(`${Number(r.year)}-${Number(r.month)}`)); inMemoryRecords.splice(0,inMemoryRecords.length,...retained,...savedRecords); updateCloudStatus("Cloud Saved", true); return true;
}

// ##############################################################################
// ##### SECTION: UPLOAD-GUARD
// ##############################################################################

/**
 * UPLOAD GUARD (bulk upload of AEs and TAss):
 *  1. Upload Mode  -> "Single Month" (one Year + Month) or "Bulk" (one Year, many months)
 *  2. Period check -> the file must match the mode/year/month chosen in the upload window
 *  3. Name check   -> warns about exact duplicates and SIMILAR names
 *                     (e.g. "Seasons Hotel" / "Seasons Hotels" / "Season Inn")
 * `prefix` is 'AE' or 'TAss' and matches the element ids in the two upload windows.
 */
const bulkQuality = { AE: null, TAss: null };
const BULK_CFG = {
    AE:   { store: 'aes',  subject: 'establishment', subjectLabel: 'establishment', useTypeWords: true },
    TAss: { store: 'tass', subject: 'attraction',    subjectLabel: 'attraction',    useTypeWords: false }
};

// Words that only describe the TYPE of accommodation (compared after removing a trailing "s").
// "Seasons Hotel" and "Season Inn" both reduce to "season", so they are flagged for review.
const NAME_TYPE_WORDS = new Set([
    'hotel', 'inn', 'resort', 'lodge', 'lodging', 'house', 'hostel', 'pension', 'pensionne', 'apartelle',
    'homestay', 'home', 'stay', 'guesthouse', 'guest', 'inc', 'restaurant', 'and', 'the', 'of', 'beach',
    'cafe', 'suite', 'transient', 'room', 'tourist'
]);
const NAME_SYNONYMS = { mt: 'mount', st: 'saint', brgy: 'barangay' };

/** Lower-case words of a name: punctuation removed, "&" -> "and", plural "s" removed. */
function nameTokens(name) {
    const base = String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/['’`]s\b/g, 's').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
    return base.split(' ').filter(Boolean)
        .map(t => NAME_SYNONYMS[t] || t)
        .map(t => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) ? t.slice(0, -1) : t);
}

function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[b.length];
}

/** Returns a short reason when two DIFFERENT names look like the same place, otherwise null. */
function compareNames(a, b, useTypeWords) {
    const ta = nameTokens(a), tb = nameTokens(b);
    if (!ta.length || !tb.length) return null;
    // "Hotel 1" vs "Hotel 2": different numbers always means different places
    const numsA = ta.filter(t => /\d/.test(t)).join(','), numsB = tb.filter(t => /\d/.test(t)).join(',');
    if (numsA !== numsB) return null;
    if ([...ta].sort().join(' ') === [...tb].sort().join(' ')) return 'same words (spelling, plural or word order differs)';
    const sa = ta.join(''), sb = tb.join('');
    const dist = levenshtein(sa, sb), longest = Math.max(sa.length, sb.length);
    if (Math.min(sa.length, sb.length) >= 6 && (dist <= 2 || dist / longest <= 0.12)) return 'very similar spelling';
    if (useTypeWords) {
        const ca = ta.filter(t => !NAME_TYPE_WORDS.has(t)), cb = tb.filter(t => !NAME_TYPE_WORDS.has(t));
        if (ca.length && cb.length && ca.join(' ') === cb.join(' ')) return 'same name with a different type word (Hotel / Inn / Resort)';
    }
    return null;
}

/** Finds exact duplicates and similar names. Marks rows with item.flag ('dup' | 'similar'). */
function analyzeUploadNames(prefix, items, existingRecords, periods) {
    const cfg = BULK_CFG[prefix], key = cfg.subject;
    const issues = { duplicates: [], similar: [], vsExisting: [] };
    items.forEach(it => { it.flag = null; });

    // 1) Exact duplicates inside the file (same municipality + month + name)
    const seen = new Map();
    items.forEach(it => {
        const k = recordUniqueKey(cfg.store, it.record);
        if (!seen.has(k)) seen.set(k, []);
        seen.get(k).push(it);
    });
    seen.forEach(list => {
        if (list.length < 2) return;
        list.forEach(it => { it.flag = 'dup'; });
        const r = list[0].record;
        issues.duplicates.push({ muni: r.municipality, name: r[key], period: `${MONTH_NAMES[r.month - 1]} ${r.year}`, rows: list.map(x => x.row) });
    });

    // 2) Similar names inside the file (compared within the same municipality)
    const byMuni = new Map();
    items.forEach(it => {
        const r = it.record, mk = String(r.municipality).trim().toLowerCase(), nk = String(r[key]).trim().toLowerCase();
        if (!byMuni.has(mk)) byMuni.set(mk, { muni: r.municipality, names: new Map() });
        const names = byMuni.get(mk).names;
        if (!names.has(nk)) names.set(nk, { name: String(r[key]).trim(), items: [] });
        names.get(nk).items.push(it);
    });
    byMuni.forEach(({ muni, names }) => {
        const list = [...names.values()];
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const why = compareNames(list[i].name, list[j].name, cfg.useTypeWords);
                if (!why) continue;
                list[i].items.concat(list[j].items).forEach(it => { if (!it.flag) it.flag = 'similar'; });
                issues.similar.push({ muni, a: list[i].name, b: list[j].name, why, aCount: list[i].items.length, bCount: list[j].items.length });
            }
        }
    });

    // 3) Names in the file that look like names ALREADY SAVED for other months/years
    //    (periods being replaced by this upload are ignored, because they will be overwritten)
    const periodKeys = new Set(periods.map(p => `${p.year}-${p.month}`));
    const existingByMuni = new Map();
    existingRecords.forEach(r => {
        if (periodKeys.has(`${Number(r.year)}-${Number(r.month)}`)) return;
        const nk = String(r[key] || '').trim().toLowerCase();
        if (!nk) return;
        const mk = String(r.municipality).trim().toLowerCase();
        if (!existingByMuni.has(mk)) existingByMuni.set(mk, new Map());
        const m = existingByMuni.get(mk);
        if (!m.has(nk)) m.set(nk, { name: String(r[key]).trim(), years: new Set() });
        m.get(nk).years.add(Number(r.year));
    });
    byMuni.forEach(({ muni, names }, mk) => {
        const ex = existingByMuni.get(mk);
        if (!ex) return;
        names.forEach((entry, nk) => {
            if (ex.has(nk)) return;   // identical name already saved = same place, expected
            for (const e of ex.values()) {
                const why = compareNames(entry.name, e.name, cfg.useTypeWords);
                if (!why) continue;
                entry.items.forEach(it => { if (!it.flag) it.flag = 'similar'; });
                issues.vsExisting.push({ muni, name: entry.name, existing: e.name, years: [...e.years].sort().join(', '), why });
                break;
            }
        });
    });
    return issues;
}

function renderUploadQuality(prefix, issues, scopeText) {
    const el = document.getElementById(`bulk${prefix}QualityLog`);
    if (!el) return;
    const label = BULK_CFG[prefix].subjectLabel;
    const total = issues.duplicates.length + issues.similar.length + issues.vsExisting.length;
    const list = (arr, fn) => `<ul class="list-disc ml-5 space-y-0.5">${arr.slice(0, 20).map(fn).join('')}${arr.length > 20 ? `<li class="italic">…and ${arr.length - 20} more</li>` : ''}</ul>`;
    const q = s => `&ldquo;${tEsc(s)}&rdquo;`;

    let html = `<p class="font-bold text-blue-800 mb-1"><i class="fa-solid fa-circle-check mr-1"></i> ${tEsc(scopeText)}</p>`;
    if (!total) {
        html += `<p class="text-emerald-700 font-semibold"><i class="fa-solid fa-check mr-1"></i> No duplicate or similar ${label} names found.</p>`;
    } else {
        html += `<p class="font-bold text-amber-800"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Duplicate / similar-name check: ${total} item(s) need your review before saving.</p>`;
        if (issues.duplicates.length) {
            html += `<p class="font-semibold mt-2 text-rose-700">Exact duplicates (${issues.duplicates.length}) &ndash; the same ${label} appears more than once in the same month. Only the LAST row of each will be saved:</p>` +
                list(issues.duplicates, d => `<li><b>${tEsc(d.muni)}</b>: ${q(d.name)} &ndash; ${tEsc(d.period)}, Excel rows ${d.rows.join(', ')}</li>`);
        }
        if (issues.similar.length) {
            html += `<p class="font-semibold mt-2">Similar names in this file (${issues.similar.length}) &ndash; may be the same ${label} typed differently:</p>` +
                list(issues.similar, s => `<li><b>${tEsc(s.muni)}</b>: ${q(s.a)} (${s.aCount} row${s.aCount > 1 ? 's' : ''}) &harr; ${q(s.b)} (${s.bCount} row${s.bCount > 1 ? 's' : ''}) &ndash; <i>${s.why}</i></li>`);
        }
        if (issues.vsExisting.length) {
            html += `<p class="font-semibold mt-2">Similar to names already saved (${issues.vsExisting.length}) &ndash; saving may create a second entry for the same ${label}:</p>` +
                list(issues.vsExisting, s => `<li><b>${tEsc(s.muni)}</b>: ${q(s.name)} in this file &harr; ${q(s.existing)} already saved (${tEsc(s.years)}) &ndash; <i>${s.why}</i></li>`);
        }
        html += `<p class="mt-2">If they are the same ${label}, correct the spelling in Excel and click <b>1. Process Excel</b> again. If they are really different, you can still save.</p>`;
    }
    el.className = total
        ? 'p-3 bg-amber-50 border border-amber-300 text-amber-900 rounded text-[11px] max-h-60 overflow-y-auto'
        : 'p-3 bg-emerald-50 border border-emerald-200 text-slate-700 rounded text-[11px]';
    el.innerHTML = html;
}

/** Upload window controls */
function getBulkScope(prefix) {
    const picked = document.querySelector(`input[name="bulk${prefix}Mode"]:checked`);
    return {
        mode: picked ? picked.value : 'single',
        year: parseInt(document.getElementById(`bulk${prefix}Year`).value, 10) || 0,
        month: parseInt(document.getElementById(`bulk${prefix}Month`).value, 10) || 0
    };
}

function resetBulkPending(prefix) {
    if (prefix === 'AE') pendingBulkAE = []; else pendingBulkTAss = [];
    bulkQuality[prefix] = null;
    ['Summary', 'PreviewContainer', 'ErrorLog', 'QualityLog'].forEach(s => {
        const el = document.getElementById(`bulk${prefix}${s}`);
        if (el) el.classList.add('hidden');
    });
    ['btnSaveBulk', 'btnConfirmBulk'].forEach(b => {
        const el = document.getElementById(`${b}${prefix}`);
        if (el) el.disabled = true;
    });
}

function onBulkModeChange(prefix) {
    const sc = getBulkScope(prefix);
    const wrap = document.getElementById(`bulk${prefix}MonthWrap`);
    if (wrap) wrap.classList.toggle('hidden', sc.mode !== 'single');
    const hint = document.getElementById(`bulk${prefix}ScopeHint`);
    if (hint) hint.textContent = sc.mode === 'single'
        ? 'The file must contain only this one Year + Month.'
        : 'The file may contain several months, but only this Year.';
    resetBulkPending(prefix);   // settings changed: the old preview is no longer valid
}

/** Short period text: 1-3 periods are listed, more are shown as a range. */
function compactPeriods(periods) {
    if (periods.length <= 3) return formatReportingPeriods(periods);
    const f = periods[0], l = periods[periods.length - 1];
    return `${periods.length} months, ${MONTH_NAMES[f.month - 1]} ${f.year} to ${MONTH_NAMES[l.month - 1]} ${l.year}`;
}

/** Checks the file's Year/Month values against the chosen mode. */
function checkBulkScope(prefix, records) {
    const sc = getBulkScope(prefix);
    const periods = getReportingPeriods(records);
    if (!sc.year) return { ok: false, message: 'Please enter the Year for this upload.' };
    if (sc.mode === 'single') {
        if (!sc.month) return { ok: false, message: 'Please select the Month for a Single Month upload.' };
        const wanted = `${MONTH_NAMES[sc.month - 1]} ${sc.year}`;
        if (periods.some(p => p.year !== sc.year || p.month !== sc.month)) {
            return { ok: false, message: `Single Month mode accepts only ${wanted}, but the file contains ${compactPeriods(periods)}. ${periods.length > 1 ? 'Switch to Bulk (Multiple Months) mode, or correct the file.' : 'Correct the Year/Month selection or the file.'}` };
        }
        return { ok: true, periods, text: `Single Month upload: ${wanted}` };
    }
    const other = periods.filter(p => p.year !== sc.year);
    if (other.length) {
        return { ok: false, message: `Bulk mode accepts one Year at a time (${sc.year}), but the file also contains: ${compactPeriods(other)}. Use one file per year.` };
    }
    const text = `Bulk upload: ${compactPeriods(periods)}` +
        (periods.length === 1 ? ' - only one month found; use Single Month mode if that is intended' : '');
    return { ok: true, periods, text };
}

function showBulkScopeError(prefix, message) {
    resetBulkPending(prefix);
    const box = document.getElementById(`bulk${prefix}ErrorLog`);
    if (box) { box.classList.remove('hidden'); box.innerHTML = `<strong>Upload not accepted:</strong> ${tEsc(message)}`; }
    showToast(message, 'danger');
}

function bulkPreviewItems(pending) {
    return [...pending].sort((a, b) => (b.flag ? 1 : 0) - (a.flag ? 1 : 0)).slice(0, 50);   // flagged rows first
}
function bulkStatusCell(item) {
    if (item.flag === 'dup') return '<td class="p-2 font-bold text-rose-600">Duplicate row</td>';
    if (item.flag === 'similar') return '<td class="p-2 font-bold text-amber-600">Check name</td>';
    return '<td class="p-2 text-slate-400">Valid</td>';
}

/** Runs just before saving: re-checks the period and asks the user to confirm any name warnings. */
function confirmBulkBeforeSave(prefix, pending) {
    const chk = checkBulkScope(prefix, pending.map(i => i.record));
    if (!chk.ok) { showToast(chk.message, 'danger'); return false; }
    const q = bulkQuality[prefix];
    if (!q) return true;
    const n = q.duplicates.length + q.similar.length + q.vsExisting.length;
    if (!n) return true;
    const label = BULK_CFG[prefix].subjectLabel;
    return confirm(`WARNING: possible duplicate or similar ${label} names were found.\n\n` +
        `• Exact duplicates: ${q.duplicates.length} (only the last row of each will be saved)\n` +
        `• Similar names inside the file: ${q.similar.length}\n` +
        `• Similar to names already saved: ${q.vsExisting.length}\n\n` +
        `Please review the yellow warning box in the upload window.\n\nSave anyway?`);
}

/**
 * SECTION 4: BULK EXCEL UPLOAD IMPLEMENTATION WITH OVERWRITE RULE
 * Excel (.xlsx/.xls) is the standard import format.
 */
function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        if (typeof XLSX === "undefined") {
            reject(new Error("Excel library did not load. Please check your internet connection and reload the page."));
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const workbook = XLSX.read(e.target.result, { type: 'array', cellDates: false });
                if (!workbook.SheetNames.length) throw new Error("Excel workbook has no worksheets.");
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
                resolve(rows);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error("Unable to read the Excel file."));
        reader.readAsArrayBuffer(file);
    });
}

function normalizeExcelHeader(h) {
    return String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function rowValue(row, headers, aliases, fallbackIndex = -1) {
    for (const alias of aliases) {
        const idx = headers.indexOf(normalizeExcelHeader(alias));
        if (idx !== -1) return row[idx];
    }
    return fallbackIndex >= 0 ? row[fallbackIndex] : "";
}

// Returns a value only if one of the given headers is actually present
// in the sheet (unlike rowValue, never falls back to a bare column
// position) - used for optional cross-check columns like SUM/Total
// fields that may or may not be present in the uploaded file.
function rowValueIfPresent(row, headers, aliases) {
    for (const alias of aliases) {
        const idx = headers.indexOf(normalizeExcelHeader(alias));
        if (idx !== -1) return { present: true, value: row[idx] };
    }
    return { present: false, value: undefined };
}

/**
 * MONTH PARSING
 * Accepts numeric months 1-12 directly (no manual conversion needed),
 * and also accepts month names ("January", "Jan", etc.) which are
 * converted to their numeric equivalent. The value stored in the
 * database is always the plain number 1-12.
 */
function parseMonthCell(value) {
    if (value === null || value === undefined || value === "") return 0;
    const numeric = Number(value);
    if (!isNaN(numeric) && Number.isFinite(numeric)) {
        const m = Math.trunc(numeric);
        return (m >= 1 && m <= 12) ? m : 0;
    }
    const text = String(value).trim().toLowerCase();
    let idx = MONTH_NAMES.findIndex(m => m.toLowerCase() === text);
    if (idx === -1) idx = MONTH_NAMES.findIndex(m => m.toLowerCase().startsWith(text));
    return idx !== -1 ? idx + 1 : 0;
}

/**
 * YEAR PARSING
 * Stored as a plain four-digit number (e.g. 2026) - never converted
 * into a date/serial value.
 */
function parseYearCell(value) {
    const yr = Math.trunc(Number(value));
    return (Number.isFinite(yr) && yr >= 2000 && yr <= 2099) ? yr : 0;
}

function monthToNumber(month) {
    if (typeof month === 'number') return month;
    const value = String(month || '').trim();
    const n = parseInt(value);
    if (!isNaN(n)) return n;
    const idx = MONTH_NAMES.findIndex(m => m.toLowerCase() === value.toLowerCase());
    return idx >= 0 ? idx + 1 : 0;
}

// ##############################################################################
// ##### SECTION: EXPORT-HELPERS
// ##############################################################################

/**
 * EXCEL EXPORT HELPERS: shared header/number styles and sheet builders used by every Excel download.
 */

/**
 * SECTION 9: EXCEL IMPORT/EXPORT AND AGENCY-READY REPORTS
 */
const EXCEL_HEADER_FILL = "0F172A";

const EXCEL_HEADER_FONT = { bold: true, color: { rgb: "FFFFFF" } };
const EXCEL_TITLE_FONT = { bold: true, color: { rgb: "0F172A" }, sz: 14 };
const EXCEL_SUBTITLE_FONT = { italic: true, color: { rgb: "475569" } };

function excelHeaderStyle() {
    return {
        font: EXCEL_HEADER_FONT,
        fill: { fgColor: { rgb: EXCEL_HEADER_FILL } },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        border: { bottom: { style: "thin", color: { rgb: "CBD5E1" } } }
    };
}

function excelTitleStyle() {
    return { font: EXCEL_TITLE_FONT, alignment: { horizontal: "center", vertical: "center" } };
}

function excelNumberStyle() {
    return { numFmt: '#,##0', alignment: { horizontal: "right" } };
}

function autoWidth(ws, min = 10, max = 32) {
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
    const widths = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
        let maxLen = min;
        for (let r = range.s.r; r <= range.e.r; r++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (cell && cell.v != null) maxLen = Math.max(maxLen, String(cell.v).length + 2);
        }
        widths.push({ wch: Math.min(Math.max(maxLen, min), max) });
    }
    ws['!cols'] = widths;
}

function styleHeaderRow(ws, rowNumber = 0) {
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r: rowNumber, c })];
        if (cell) cell.s = excelHeaderStyle();
    }
}

function styleDataNumbers(ws, numericColumns, startRow = 1) {
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = startRow; r <= range.e.r; r++) {
        numericColumns.forEach(c => {
            const cell = ws[XLSX.utils.encode_cell({ r, c })];
            if (cell && typeof cell.v === 'number') cell.s = excelNumberStyle();
        });
    }
}

function makeDataSheet(headers, rows, numericColumns = []) {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    styleHeaderRow(ws, 0);
    styleDataNumbers(ws, numericColumns, 1);
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };
    ws['!autofilter'] = { ref: ws['!ref'] };
    autoWidth(ws);
    return ws;
}

function saveWorkbook(workbook, fileName) {
    XLSX.writeFile(workbook, fileName, { bookType: 'xlsx', compression: true });
}

function makeInfoSheet(title, subtitle) {
    const ws = XLSX.utils.aoa_to_sheet([
        [title],
        [subtitle],
        [`Generated: ${new Date().toLocaleString()}`],
        ["This workbook is in Excel format for data management, review, and agency submission."]
    ]);
    ws['A1'].s = excelTitleStyle();
    ws['A2'].s = EXCEL_SUBTITLE_FONT;
    ws['!merges'] = [{ s: { r:0,c:0 }, e: { r:0,c:4 } }, { s: { r:1,c:0 }, e: { r:1,c:4 } }, { s: { r:3,c:0 }, e: { r:3,c:4 } }];
    ws['!cols'] = [{ wch: 80 }];
    return ws;
}

// ##############################################################################
// ##### SECTION: UI
// ##############################################################################

/**
 * SHARED UI: modals, toast messages, tab switching, filter dropdowns, refreshing all views.
 */

/**
 * NAVIGATION & TAB SWITCHING LOGIC
 */
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('bg-teal-600', 'text-white');
        el.classList.add('hover:bg-slate-800', 'hover:text-white');
    });

    const targetView = document.getElementById(`view-${tabId}`);
    if (targetView) targetView.classList.remove('hidden');

    const targetNav = document.getElementById(`nav-${tabId}`);
    if (targetNav) {
        targetNav.classList.add('bg-teal-600', 'text-white');
        targetNav.classList.remove('hover:bg-slate-800', 'hover:text-white');
    }

    // Refresh specific components based on tab context
    if (tabId === 'dashboard') refreshDashboard();
    if (tabId === 'aes') renderAETable();
    if (tabId === 'tass') renderTAssTable();
    if (tabId === 'annual-summary') renderAnnualReport();
    if (tabId === 'monthly-summary') renderMonthlyReport();
    if (tabId === 'top-aes') renderTopAEReport();
    if (tabId === 'top-tass') renderTopTAssReport();
    if (tabId === 'top-municipalities') renderTopMunicipalitiesReport();
    if (tabId === 'country-origin') renderCountryReport();
    if (tabId === 'comparison') renderComparison();
}

function updateSavedDataStatus(){
    const ae=document.getElementById('aeSavedCount'), ta=document.getElementById('tassSavedCount'); if(ae)ae.textContent=aeRecords.length.toLocaleString(); if(ta)ta.textContent=tassRecords.length.toLocaleString();
    const latest=records=>{if(!records.length)return 'None';const r=[...records].sort((a,b)=>Number(b.year)-Number(a.year)||Number(b.month)-Number(a.month))[0];return `${MONTH_NAMES[Number(r.month)-1]} ${r.year}`;};
    const ap=document.getElementById('aeSavedPeriod'),tp=document.getElementById('tassSavedPeriod');if(ap)ap.textContent=latest(aeRecords);if(tp)tp.textContent=latest(tassRecords);
}

function refreshAllViews() {
    updateSavedDataStatus();
    populateFilterOptions();
    refreshDashboard();
    renderAETable();
    renderTAssTable();
}

/**
 * POPULATE FILTER DROPDOWNS DYNAMICALLY
 */
function populateFilterOptions() {
    const years = new Set([CURRENT_YEAR]);
    const munis = new Set();
    const aeTypes = new Set();

    aeRecords.forEach(r => {
        if (r.year) years.add(r.year);
        if (r.municipality) munis.add(r.municipality);
        if (r.type_class) aeTypes.add(r.type_class);
    });

    tassRecords.forEach(r => {
        if (r.year) years.add(r.year);
        if (r.municipality) munis.add(r.municipality);
    });

    const sortedYears = Array.from(years).sort((a,b) => b - a);
    const sortedMunis = Array.from(munis).sort();
    const sortedTypes = Array.from(aeTypes).sort();

    // Populate Year Selects
    ['dashYear', 'filterAEYear', 'filterTAssYear', 'rptAnnualYear', 'rptMonthlyYear', 'topAEYear', 'topTAssYear', 'topMuniYear'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const currVal = select.value;
        let html = (id === 'rptAnnualYear' || id === 'rptMonthlyYear' || (id.startsWith('top') && id !== 'topMuniYear')) ? '' : '<option value="ALL">All Years</option>';
        sortedYears.forEach(y => { html += `<option value="${y}">${y}</option>`; });
        select.innerHTML = html;
        if (currVal && select.querySelector(`option[value="${currVal}"]`)) select.value = currVal;
    });

    // Populate Municipality Selects
    ['dashMuni', 'filterAEMuni', 'filterTAssMuni', 'rptMonthlyMuni', 'topAEMuni', 'topTAssMuni'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const currVal = select.value;
        let html = '<option value="ALL">All Municipalities</option>';
        sortedMunis.forEach(m => { html += `<option value="${m}">${m}</option>`; });
        select.innerHTML = html;
        if (currVal) select.value = currVal;
    });

    // AE Types
    const typeSelect = document.getElementById('filterAEType');
    if (typeSelect) {
        let html = '<option value="ALL">All Types/Classes</option>';
        sortedTypes.forEach(t => { html += `<option value="${t}">${t}</option>`; });
        typeSelect.innerHTML = html;
    }
    populateCountryYearSelect();
    if (typeof populateCompareControls === 'function') populateCompareControls();
}

/**
 * UTILITY DIALOG & TOAST UI HELPERS
 */
function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
}

function closeModal(modalId) { const el=document.getElementById(modalId); if(!el)return; el.classList.add('hidden'); el.classList.remove('flex'); }

function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showToast(message, type = "info") {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    const bgClass = type === 'success' ? 'bg-emerald-800 border-emerald-600' : (type === 'danger' ? 'bg-rose-800 border-rose-600' : (type === 'warning' ? 'bg-amber-800 border-amber-600' : 'bg-navy-800 border-teal-600'));
    
    toast.className = `${bgClass} text-white text-xs px-4 py-3 rounded-lg shadow-xl border flex items-center justify-between space-x-3 pointer-events-auto transition-all transform translate-y-2 opacity-0`;
    toast.innerHTML = `<span>${message}</span><button onclick="this.parentElement.remove()" class="text-slate-300 hover:text-white">&times;</button>`;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ##############################################################################
// ##### SECTION: DASHBOARD
// ##############################################################################

/**
 * DASHBOARD VIEW: KPI cards, filters, demographic bars, and dashboard charts.
 */

function refreshDashboard() {
    const yr = document.getElementById('dashYear').value;
    const mo = document.getElementById('dashMonth').value;
    const mu = document.getElementById('dashMuni').value;

    // Filter AEs
    const filteredAE = aeRecords.filter(r => {
        if (yr !== 'ALL' && r.year != yr) return false;
        if (mo !== 'ALL' && r.month != mo) return false;
        if (mu !== 'ALL' && r.municipality !== mu) return false;
        return true;
    });

    // Filter TAss
    const filteredTAss = tassRecords.filter(r => {
        if (yr !== 'ALL' && r.year != yr) return false;
        if (mo !== 'ALL' && r.month != mo) return false;
        if (mu !== 'ALL' && r.municipality !== mu) return false;
        return true;
    });

    // Sum AEs
    let totalLocal = 0, totalForeign = 0, totalOverseas = 0, totalAEMale = 0, totalAEFemale = 0;
    const aeEsts = new Set();
    filteredAE.forEach(r => {
        totalLocal += Number(r.local_tourist || 0);
        totalForeign += Number(r.foreign_tourist || 0);
        totalOverseas += Number(r.overseas_filipino || 0);
        totalAEMale += Number(r.total_male || 0);
        totalAEFemale += Number(r.total_female || 0);
        if (r.establishment) aeEsts.add(r.establishment);
    });
    const totalAEsArrivals = totalLocal + totalForeign + totalOverseas;

    // Sum TAss
    let totalTM = 0, totalOM = 0, totalFCR = 0, totalTAssMale = 0, totalTAssFemale = 0;
    const tassAtts = new Set();
    filteredTAss.forEach(r => {
        totalTM += Number(r.tm_sum || 0);
        totalOM += Number(r.om_sum || 0);
        totalFCR += Number(r.fcr_sum || 0);
        totalTAssMale += Number(r.total_male || 0);
        totalTAssFemale += Number(r.total_female || 0);
        if (r.attraction) tassAtts.add(r.attraction);
    });
    const totalTAssVisitors = totalTM + totalOM + totalFCR;

    const grandCombined = totalAEsArrivals + totalTAssVisitors;
    const grandMale = totalAEMale + totalTAssMale;
    const grandFemale = totalAEFemale + totalTAssFemale;

    // Update UI Cards
    document.getElementById('cardTotalAEs').innerText = totalAEsArrivals.toLocaleString();
    document.getElementById('cardAECount').innerText = aeEsts.size;

    document.getElementById('cardTotalTAss').innerText = totalTAssVisitors.toLocaleString();
    document.getElementById('cardTAssCount').innerText = tassAtts.size;

    document.getElementById('cardCombinedVisitors').innerText = grandCombined.toLocaleString();

    const foreignShare = totalAEsArrivals > 0 ? (((totalForeign + totalOverseas) / totalAEsArrivals) * 100).toFixed(1) : 0;
    document.getElementById('cardForeignOverseas').innerText = (totalForeign + totalOverseas).toLocaleString();
    document.getElementById('cardForeignPercent').innerText = `${foreignShare}%`;

    document.getElementById('cardLocalTourists').innerText = totalLocal.toLocaleString();
    document.getElementById('cardForeignTourists').innerText = totalForeign.toLocaleString();
    document.getElementById('cardOverseasFilipinos').innerText = totalOverseas.toLocaleString();
    document.getElementById('cardLocalPct').innerText = `(${totalAEsArrivals > 0 ? ((totalLocal / totalAEsArrivals) * 100).toFixed(1) : 0}%)`;
    document.getElementById('cardForeignPct').innerText = `(${totalAEsArrivals > 0 ? ((totalForeign / totalAEsArrivals) * 100).toFixed(1) : 0}%)`;
    document.getElementById('cardOverseasPct').innerText = `(${totalAEsArrivals > 0 ? ((totalOverseas / totalAEsArrivals) * 100).toFixed(1) : 0}%)`;

    document.getElementById('cardTM').innerText = totalTM.toLocaleString();
    document.getElementById('cardOM').innerText = totalOM.toLocaleString();
    document.getElementById('cardFCR').innerText = totalFCR.toLocaleString();
    document.getElementById('cardTMPct').innerText = `(${totalTAssVisitors > 0 ? ((totalTM / totalTAssVisitors) * 100).toFixed(1) : 0}%)`;
    document.getElementById('cardOMPct').innerText = `(${totalTAssVisitors > 0 ? ((totalOM / totalTAssVisitors) * 100).toFixed(1) : 0}%)`;
    document.getElementById('cardFCRPct').innerText = `(${totalTAssVisitors > 0 ? ((totalFCR / totalTAssVisitors) * 100).toFixed(1) : 0}%)`;

    document.getElementById('cardTotalMale').innerText = grandMale.toLocaleString();
    document.getElementById('cardTotalFemale').innerText = grandFemale.toLocaleString();

    const totalGender = grandMale + grandFemale;
    const malePct = totalGender > 0 ? ((grandMale / totalGender) * 100).toFixed(1) : 50;
    const femalePct = totalGender > 0 ? ((grandFemale / totalGender) * 100).toFixed(1) : 50;
    document.getElementById('barMale').style.width = `${malePct}%`;
    document.getElementById('barFemale').style.width = `${femalePct}%`;

    renderAllYearsDashboardCharts();
    try { renderDashboardHighlights(yr, mu, filteredAE, filteredTAss); } catch (e) { console.error('Dashboard highlights error:', e); }
}

function resetDashFilters() {
    document.getElementById('dashYear').value = 'ALL';
    document.getElementById('dashMonth').value = 'ALL';
    document.getElementById('dashMuni').value = 'ALL';
    refreshDashboard();
}

/**
 * ALL-YEARS COMPARISON CHARTS (always reflect every saved year, ignore the dashboard filters above)
 */
function renderAllYearsDashboardCharts() {
    const elTotals = document.getElementById('chartYearlyTotals');
    if (!elTotals) return;

    const years = new Set();
    aeRecords.forEach(r => { if (r.year) years.add(Number(r.year)); });
    tassRecords.forEach(r => { if (r.year) years.add(Number(r.year)); });
    const sortedYears = Array.from(years).sort((a, b) => a - b);

    // Combined Visitors by Year (one bar per year)
    const yearlyTotals = sortedYears.map(y => {
        let total = 0;
        aeRecords.forEach(r => { if (Number(r.year) === y) total += Number(r.total_lf || 0); });
        tassRecords.forEach(r => { if (Number(r.year) === y) total += Number(r.grand_total || 0); });
        return total;
    });

    if (chartYearlyTotalsObj) chartYearlyTotalsObj.destroy();
    chartYearlyTotalsObj = new Chart(elTotals.getContext('2d'), {
        type: 'bar',
        data: {
            labels: sortedYears.map(String),
            datasets: [{ label: 'Combined Visitors', data: yearlyTotals, backgroundColor: '#0f766e', borderRadius: 6 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

// ##############################################################################
// ##### SECTION: TREND ANALYSIS
// ##############################################################################

/**
 * TREND ANALYSIS: Jan-Dec series, increase/decrease details and trend charts.
 * Shared by the Dashboard ("Key Highlights") and the Monthly Summary (graph + details).
 */
let chartMonthlyTrendObj = null;
let chartDashTrendObj = null;

const MONTH_SHORT = MONTH_NAMES.map(n => n.slice(0, 3));
const tNum = n => Number(n || 0).toLocaleString();
const tSigned = n => (n > 0 ? '+' : n < 0 ? '-' : '') + Math.abs(Math.round(n)).toLocaleString();
const tPct = p => (p === null || p === undefined || !isFinite(p)) ? '—' : (p > 0 ? '+' : p < 0 ? '-' : '') + Math.abs(p).toFixed(1) + '%';
const tPctChange = (cur, prev) => prev > 0 ? ((cur - prev) / prev) * 100 : null;
const tEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Colors / icons / wording for each kind of change
const T_TONE = {
    up:   { text: 'text-emerald-700', bg: 'bg-emerald-100', icon: 'fa-arrow-trend-up',   word: 'increasing', arrow: 'fa-arrow-up',   label: 'Increase' },
    down: { text: 'text-rose-700',    bg: 'bg-rose-100',    icon: 'fa-arrow-trend-down', word: 'decreasing', arrow: 'fa-arrow-down', label: 'Decrease' },
    flat: { text: 'text-slate-600',   bg: 'bg-slate-100',   icon: 'fa-minus',            word: 'stable',     arrow: 'fa-minus',      label: 'No change' },
    info: { text: 'text-sky-700',     bg: 'bg-sky-100',     icon: 'fa-circle-info',      word: '',           arrow: 'fa-minus',      label: '' }
};

/**
 * Builds the January-December series for one year (+ optional municipality).
 * A month is "reported" (hasData) only when at least one record exists for it.
 * Each reported month also gets `mom` = change versus the month right before it.
 */
function getMonthlySeries(yr, mu) {
    const inScope = r => r.year == yr && (mu === 'ALL' || r.municipality === mu);
    const series = [];
    for (let m = 1; m <= 12; m++) {
        const ae = aeRecords.filter(r => inScope(r) && r.month == m);
        const ta = tassRecords.filter(r => inScope(r) && r.month == m);
        let aeTotal = 0, tassTotal = 0;
        ae.forEach(r => { aeTotal += Number(r.local_tourist || 0) + Number(r.foreign_tourist || 0) + Number(r.overseas_filipino || 0); });
        ta.forEach(r => { tassTotal += Number(r.tm_sum || 0) + Number(r.om_sum || 0) + Number(r.fcr_sum || 0); });
        series.push({
            m, name: MONTH_NAMES[m - 1], short: MONTH_SHORT[m - 1],
            hasData: (ae.length + ta.length) > 0,
            ae: aeTotal, tass: tassTotal, combined: aeTotal + tassTotal, mom: null
        });
    }
    for (let i = 1; i < 12; i++) {
        const cur = series[i], prev = series[i - 1];
        if (cur.hasData && prev.hasData) {
            const delta = cur.combined - prev.combined;
            cur.mom = {
                delta, pct: tPctChange(cur.combined, prev.combined),
                dir: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
                aePct: tPctChange(cur.ae, prev.ae), tassPct: tPctChange(cur.tass, prev.tass),
                prevName: prev.name
            };
        }
    }
    return series;
}

/** Overall direction using a best-fit (least squares) line across the reported months. */
function getTrendDirection(series) {
    const rep = series.filter(s => s.hasData);
    if (rep.length < 2) return null;
    const n = rep.length;
    const mx = rep.reduce((a, s) => a + s.m, 0) / n;
    const my = rep.reduce((a, s) => a + s.combined, 0) / n;
    let num = 0, den = 0;
    rep.forEach(s => { num += (s.m - mx) * (s.combined - my); den += (s.m - mx) ** 2; });
    const slope = den ? num / den : 0;
    const rel = my > 0 ? slope / my : 0;   // average change per month, relative to the monthly average
    return { dir: rel > 0.02 ? 'up' : rel < -0.02 ? 'down' : 'flat', slope, rel };
}

/** Plain-language details on what increased / decreased. Returns [{tone, text(html)}]. */
function trendInsights(series, yr) {
    const rep = series.filter(s => s.hasData);
    if (!rep.length) return [{ tone: 'flat', text: `No records encoded for ${yr} yet.` }];
    const first = rep[0], last = rep[rep.length - 1];
    if (rep.length === 1) {
        return [{ tone: 'flat', text: `Only <b>${first.name}</b> has records so far (${tNum(first.combined)} combined visitors), so a trend can't be shown yet.` }];
    }
    const out = [];
    const toneOf = d => d > 0 ? 'up' : d < 0 ? 'down' : 'flat';

    const dAll = last.combined - first.combined;
    const pAll = tPctChange(last.combined, first.combined);
    out.push({
        tone: toneOf(dAll),
        text: `<b>Overall:</b> combined visitors ${dAll > 0 ? 'increased' : dAll < 0 ? 'decreased' : 'did not change'}` +
              `${dAll ? ` by ${tNum(Math.abs(dAll))}${pAll !== null ? ` (${Math.abs(pAll).toFixed(1)}%)` : ''}` : ''}` +
              ` from ${first.name} (${tNum(first.combined)}) to ${last.name} (${tNum(last.combined)}).`
    });

    const dir = getTrendDirection(series);
    if (dir) out.push({ tone: dir.dir, text: `<b>Direction:</b> the best-fit line across ${rep.length} reported months is <b>${T_TONE[dir.dir].word}</b>.` });

    const peak = rep.reduce((a, s) => s.combined > a.combined ? s : a);
    const low = rep.reduce((a, s) => s.combined < a.combined ? s : a);
    out.push({ tone: 'info', text: `<b>Peak:</b> ${peak.name} (${tNum(peak.combined)}). <b>Lowest:</b> ${low.name} (${tNum(low.combined)}).` });

    const moms = rep.filter(s => s.mom);
    if (moms.length) {
        const ups = moms.filter(s => s.mom.dir === 'up').length;
        const downs = moms.filter(s => s.mom.dir === 'down').length;
        const same = moms.length - ups - downs;
        out.push({ tone: 'info', text: `<b>Month-to-month:</b> rose in ${ups} of ${moms.length} comparisons and fell in ${downs}${same ? `, unchanged in ${same}` : ''}.` });
        const bigUp = moms.reduce((a, s) => s.mom.delta > a.mom.delta ? s : a);
        const bigDown = moms.reduce((a, s) => s.mom.delta < a.mom.delta ? s : a);
        if (bigUp.mom.delta > 0) out.push({ tone: 'up', text: `<b>Biggest rise:</b> ${bigUp.mom.prevName} → ${bigUp.name}, ${tSigned(bigUp.mom.delta)} (${tPct(bigUp.mom.pct)}).` });
        if (bigDown.mom.delta < 0) out.push({ tone: 'down', text: `<b>Biggest drop:</b> ${bigDown.mom.prevName} → ${bigDown.name}, ${tSigned(bigDown.mom.delta)} (${tPct(bigDown.mom.pct)}).` });
    }
    if (last.mom) {
        out.push({
            tone: last.mom.dir,
            text: `<b>Latest (${last.name}):</b> ${last.mom.dir === 'up' ? 'higher' : last.mom.dir === 'down' ? 'lower' : 'unchanged'} than ${last.mom.prevName}` +
                  `${last.mom.delta ? ` by ${tNum(Math.abs(last.mom.delta))} (${tPct(last.mom.pct)})` : ''}.`
        });
    }

    const seg = (label, p, a, b) => p === null ? null : `${label} ${p > 0 ? 'rose' : p < 0 ? 'fell' : 'held steady'} ${Math.abs(p).toFixed(1)}% (${tNum(a)} → ${tNum(b)})`;
    const segs = [
        seg('Tourist Arrivals (AEs)', tPctChange(last.ae, first.ae), first.ae, last.ae),
        seg('Same-Day Visitors (TAss)', tPctChange(last.tass, first.tass), first.tass, last.tass)
    ].filter(Boolean);
    if (segs.length) out.push({ tone: 'info', text: `<b>By segment (${first.short} → ${last.short}):</b> ${segs.join('; ')}.` });

    const gaps = series.filter(s => !s.hasData && s.m > first.m && s.m < last.m).map(s => s.short);
    if (gaps.length) out.push({ tone: 'flat', text: `<b>Note:</b> no records for ${gaps.join(', ')}; changes next to ${gaps.length > 1 ? 'those months' : 'that month'} can't be computed.` });

    return out;
}

function renderTrendInsights(elId, items) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = items.map(i => {
        const t = T_TONE[i.tone] || T_TONE.flat;
        return `<li class="flex items-start gap-2"><i class="fa-solid ${t.icon} ${t.text} mt-0.5 w-4 text-center"></i><span>${i.text}</span></li>`;
    }).join('');
}

function setTrendBadge(elId, dirInfo) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!dirInfo) {
        el.className = 'text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-500';
        el.innerHTML = 'Trend: not enough data';
        return;
    }
    const t = T_TONE[dirInfo.dir];
    el.className = `text-xs font-semibold px-2.5 py-1 rounded-full ${t.bg} ${t.text}`;
    el.innerHTML = `<i class="fa-solid ${t.icon} mr-1"></i> Overall trend: ${t.word.charAt(0).toUpperCase() + t.word.slice(1)}`;
}

// Point color on the "Combined" line: green = higher than previous month, red = lower
function trendPointColor(series) {
    return ctx => {
        const s = series[ctx.dataIndex];
        if (!s || !s.mom) return '#0f766e';
        return s.mom.dir === 'up' ? '#059669' : s.mom.dir === 'down' ? '#e11d48' : '#64748b';
    };
}
function trendTooltipFooter(series) {
    return items => {
        const s = items.length ? series[items[0].dataIndex] : null;
        if (!s || !s.mom) return '';
        return `Combined vs ${s.mom.prevName}: ${tSigned(s.mom.delta)} (${tPct(s.mom.pct)})`;
    };
}

/** MONTHLY SUMMARY: line graph (Combined, AEs, TAss) + details table */
function renderMonthlyTrend(yr, mu) {
    const series = getMonthlySeries(yr, mu);
    const el = document.getElementById('chartMonthlyTrend');
    if (el) {
        const dataOf = k => series.map(s => s.hasData ? s[k] : null);
        const hasDL = (typeof ChartDataLabels !== 'undefined');
        if (chartMonthlyTrendObj) chartMonthlyTrendObj.destroy();
        chartMonthlyTrendObj = new Chart(el.getContext('2d'), {
            type: 'line',
            plugins: hasDL ? [ChartDataLabels] : [],
            data: {
                labels: series.map(s => s.short),
                datasets: [
                    {
                        label: 'Combined Visitors', data: dataOf('combined'),
                        borderColor: '#0f766e', backgroundColor: 'rgba(15,118,110,0.10)', fill: true,
                        borderWidth: 3, tension: 0.25, spanGaps: false,
                        pointRadius: 5, pointHoverRadius: 7, pointBorderColor: '#fff', pointBorderWidth: 2,
                        pointBackgroundColor: trendPointColor(series),
                        datalabels: hasDL ? {
                            display: ctx => ctx.dataset.data[ctx.dataIndex] !== null,
                            align: 'top', anchor: 'end', offset: 2, color: '#0f172a',
                            font: { size: 9, weight: 'bold' }, formatter: v => Number(v).toLocaleString()
                        } : undefined
                    },
                    {
                        label: 'Tourist Arrivals (AEs)', data: dataOf('ae'),
                        borderColor: '#2563eb', backgroundColor: '#2563eb', borderWidth: 2, tension: 0.25,
                        pointRadius: 3, spanGaps: false, fill: false,
                        datalabels: { display: false }
                    },
                    {
                        label: 'Same-Day Visitors (TAss)', data: dataOf('tass'),
                        borderColor: '#d97706', backgroundColor: '#d97706', borderWidth: 2, tension: 0.25,
                        pointRadius: 3, spanGaps: false, fill: false,
                        datalabels: { display: false }
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false, animation: false,
                interaction: { mode: 'index', intersect: false },
                layout: { padding: { top: 22, right: 12 } },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => Number(v).toLocaleString() } },
                    x: { grid: { display: false } }
                },
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.dataset.label}: ${Number(ctx.parsed.y).toLocaleString()}`,
                            footer: trendTooltipFooter(series)
                        }
                    }
                }
            }
        });
    }

    setTrendBadge('rptTrendBadge', getTrendDirection(series));
    renderTrendInsights('rptTrendInsights', trendInsights(series, yr));

    // Month-by-month details table
    const tbody = document.getElementById('rptTrendBody');
    if (tbody) {
        const pctCell = p => {
            if (p === null || p === undefined || !isFinite(p)) return '<span class="text-slate-300">—</span>';
            const cls = p > 0 ? 'text-emerald-700' : p < 0 ? 'text-rose-700' : 'text-slate-500';
            return `<span class="${cls} font-semibold">${tPct(p)}</span>`;
        };
        tbody.innerHTML = series.map(s => {
            if (!s.hasData) {
                return `<tr class="border-b text-slate-300"><td class="p-2 font-bold">${s.name}</td><td class="p-2 text-right">—</td><td class="p-2 text-right">—</td><td class="p-2 text-right">—</td><td class="p-2 text-center italic">No data</td><td class="p-2 text-right">—</td><td class="p-2 text-right">—</td></tr>`;
            }
            if (!s.mom) {
                return `<tr class="border-b"><td class="p-2 font-bold text-slate-800">${s.name}</td><td class="p-2 text-right font-bold text-amber-900">${tNum(s.combined)}</td><td class="p-2 text-right text-slate-300">—</td><td class="p-2 text-right text-slate-300">—</td><td class="p-2 text-center text-slate-400 italic">No previous month</td><td class="p-2 text-right text-slate-300">—</td><td class="p-2 text-right text-slate-300">—</td></tr>`;
            }
            const t = T_TONE[s.mom.dir];
            return `<tr class="border-b hover:bg-slate-50">
                <td class="p-2 font-bold text-slate-800">${s.name}</td>
                <td class="p-2 text-right font-bold text-amber-900">${tNum(s.combined)}</td>
                <td class="p-2 text-right ${t.text} font-semibold">${tSigned(s.mom.delta)}</td>
                <td class="p-2 text-right">${pctCell(s.mom.pct)}</td>
                <td class="p-2 text-center"><span class="${t.text} font-bold"><i class="fa-solid ${t.arrow}"></i> ${t.label}</span></td>
                <td class="p-2 text-right">${pctCell(s.mom.aePct)}</td>
                <td class="p-2 text-right">${pctCell(s.mom.tassPct)}</td>
            </tr>`;
        }).join('');
    }
}

/** DASHBOARD: key highlights, trend chart and top performers */
function getDashTrendYear(yr) {
    if (yr !== 'ALL') return Number(yr);
    let max = 0;
    aeRecords.forEach(r => { if (Number(r.year) > max) max = Number(r.year); });
    tassRecords.forEach(r => { if (Number(r.year) > max) max = Number(r.year); });
    return max || CURRENT_YEAR;
}

function renderRankList(elId, entries, emptyMsg) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (!entries.length) { el.innerHTML = `<li class="text-xs text-slate-400">${emptyMsg}</li>`; return; }
    const max = entries[0][1] || 1;
    el.innerHTML = entries.map(([name, val], i) => `<li>
        <div class="flex justify-between text-xs"><span class="text-slate-700 truncate pr-2"><span class="text-slate-400 font-bold mr-1">${i + 1}.</span>${tEsc(name)}</span><span class="font-bold text-slate-800 whitespace-nowrap">${tNum(val)}</span></div>
        <div class="w-full bg-slate-100 rounded-full h-1.5 mt-1"><div class="bg-teal-500 h-1.5 rounded-full" style="width:${Math.max(3, (val / max) * 100)}%"></div></div>
    </li>`).join('');
}

function topEntries(map, n) {
    return [...map.entries()].filter(e => e[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, n);
}

function renderDashboardHighlights(yr, mu, filteredAE, filteredTAss) {
    const ty = getDashTrendYear(yr);
    const series = getMonthlySeries(ty, mu);
    const prevSeries = getMonthlySeries(ty - 1, mu);
    const rep = series.filter(s => s.hasData);
    const setHTML = (id, html, cls) => { const el = document.getElementById(id); if (el) { el.innerHTML = html; if (cls !== undefined) el.className = cls; } };

    setHTML('dashHighlightScope', `${ty}${yr === 'ALL' ? ' (latest year with data)' : ''} · ${mu === 'ALL' ? 'All Municipalities' : tEsc(mu)} · trend ignores the Month filter`);

    if (rep.length) {
        const last = rep[rep.length - 1];
        const peak = rep.reduce((a, s) => s.combined > a.combined ? s : a);
        const low = rep.reduce((a, s) => s.combined < a.combined ? s : a);

        // Latest month
        setHTML('dashLatestValue', tNum(last.combined));
        setHTML('dashLatestLabel', `${last.name} ${ty} · combined visitors`);
        if (last.mom) {
            const t = T_TONE[last.mom.dir];
            setHTML('dashLatestChange', `<i class="fa-solid ${t.arrow}"></i> ${tSigned(last.mom.delta)} (${tPct(last.mom.pct)}) vs ${last.mom.prevName}`, `text-xs font-semibold mt-1 ${t.text}`);
        } else {
            setHTML('dashLatestChange', 'No previous month to compare', 'text-xs font-semibold mt-1 text-slate-400');
        }

        // Year-over-year (only months reported in BOTH years, so the comparison is fair)
        const common = rep.filter(s => prevSeries[s.m - 1].hasData);
        if (common.length) {
            const cur = common.reduce((a, s) => a + s.combined, 0);
            const prev = common.reduce((a, s) => a + prevSeries[s.m - 1].combined, 0);
            const p = tPctChange(cur, prev);
            const dir = cur > prev ? 'up' : cur < prev ? 'down' : 'flat';
            const t = T_TONE[dir];
            setHTML('dashYoYValue', `<i class="fa-solid ${t.arrow} text-lg"></i> ${tPct(p)}`, `text-2xl font-bold mt-1 ${t.text}`);
            setHTML('dashYoYLabel', `${ty} vs ${ty - 1} · ${common.length} matching month${common.length > 1 ? 's' : ''}`);
            setHTML('dashYoYSub', `${tNum(cur)} vs ${tNum(prev)} (${tSigned(cur - prev)})`, `text-xs font-semibold mt-1 ${t.text}`);
        } else {
            setHTML('dashYoYValue', '—', 'text-2xl font-bold mt-1 text-slate-400');
            setHTML('dashYoYLabel', `No ${ty - 1} data to compare`);
            setHTML('dashYoYSub', '', 'text-xs font-semibold mt-1');
        }

        setHTML('dashPeakValue', peak.name);
        setHTML('dashPeakLabel', `${tNum(peak.combined)} combined visitors`);
        setHTML('dashLowValue', low.name);
        setHTML('dashLowLabel', `${tNum(low.combined)} combined visitors${rep.length < 12 ? ' (among reported months)' : ''}`);
    } else {
        ['dashLatestValue', 'dashPeakValue', 'dashLowValue'].forEach(id => setHTML(id, '—'));
        setHTML('dashLatestLabel', `No records for ${ty}`);
        setHTML('dashLatestChange', '', 'text-xs font-semibold mt-1');
        setHTML('dashYoYValue', '—', 'text-2xl font-bold mt-1 text-slate-400');
        setHTML('dashYoYLabel', `No records for ${ty}`);
        setHTML('dashYoYSub', '', 'text-xs font-semibold mt-1');
        setHTML('dashPeakLabel', '');
        setHTML('dashLowLabel', '');
    }

    // Trend chart: this year (solid) vs previous year (dashed)
    const el = document.getElementById('chartDashTrend');
    if (el) {
        if (chartDashTrendObj) chartDashTrendObj.destroy();
        const datasets = [{
            label: String(ty), data: series.map(s => s.hasData ? s.combined : null),
            borderColor: '#0f766e', backgroundColor: 'rgba(15,118,110,0.12)', fill: true,
            borderWidth: 3, tension: 0.25, spanGaps: false,
            pointRadius: 5, pointHoverRadius: 7, pointBorderColor: '#fff', pointBorderWidth: 2,
            pointBackgroundColor: trendPointColor(series)
        }];
        if (prevSeries.some(s => s.hasData)) {
            datasets.push({
                label: String(ty - 1), data: prevSeries.map(s => s.hasData ? s.combined : null),
                borderColor: '#94a3b8', backgroundColor: '#94a3b8', borderDash: [6, 4], borderWidth: 2,
                tension: 0.25, pointRadius: 2, spanGaps: false, fill: false
            });
        }
        chartDashTrendObj = new Chart(el.getContext('2d'), {
            type: 'line',
            data: { labels: series.map(s => s.short), datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: { y: { beginAtZero: true, ticks: { callback: v => Number(v).toLocaleString() } }, x: { grid: { display: false } } },
                plugins: {
                    datalabels: { display: false },
                    legend: { position: 'bottom' },
                    tooltip: {
                        callbacks: {
                            label: ctx => ` ${ctx.dataset.label}: ${Number(ctx.parsed.y).toLocaleString()}`,
                            footer: trendTooltipFooter(series)
                        }
                    }
                }
            }
        });
    }
    setTrendBadge('dashTrendBadge', getTrendDirection(series));
    renderTrendInsights('dashTrendInsights', trendInsights(series, ty).slice(0, 5));

    // Top performers (follow ALL dashboard filters, same as the KPI cards)
    const muniMap = new Map(), aeMap = new Map(), taMap = new Map();
    const add = (map, key, val) => { if (key) map.set(key, (map.get(key) || 0) + val); };
    filteredAE.forEach(r => {
        const v = Number(r.local_tourist || 0) + Number(r.foreign_tourist || 0) + Number(r.overseas_filipino || 0);
        add(muniMap, r.municipality, v); add(aeMap, r.establishment, v);
    });
    filteredTAss.forEach(r => {
        const v = Number(r.tm_sum || 0) + Number(r.om_sum || 0) + Number(r.fcr_sum || 0);
        add(muniMap, r.municipality, v); add(taMap, r.attraction, v);
    });
    renderRankList('dashTopMuni', topEntries(muniMap, 3), 'No data for these filters');
    renderRankList('dashTopAE', topEntries(aeMap, 3), 'No data for these filters');
    renderRankList('dashTopTAss', topEntries(taMap, 3), 'No data for these filters');
}

// ##############################################################################
// ##### SECTION: AES
// ##############################################################################

/**
 * TOURIST ARRIVALS (AEs): table, add/edit/delete form, bulk Excel upload, template and Excel download.
 */

/**
 * SECTION 2: TOURIST ARRIVALS (AEs) TABLE & CRUD
 */
function renderAETable() {
    const search = document.getElementById('filterAESearch').value.toLowerCase();
    const muni = document.getElementById('filterAEMuni').value;
    const year = document.getElementById('filterAEYear').value;
    const month = document.getElementById('filterAEMonth').value;
    const type = document.getElementById('filterAEType').value;

    const filtered = aeRecords.filter(r => {
        if (muni !== 'ALL' && r.municipality !== muni) return false;
        if (year !== 'ALL' && r.year != year) return false;
        if (month !== 'ALL' && r.month != month) return false;
        if (type !== 'ALL' && r.type_class !== type) return false;
        if (search) {
            const matchStr = `${r.establishment} ${r.municipality} ${r.province} ${r.type_class}`.toLowerCase();
            if (!matchStr.includes(search)) return false;
        }
        return true;
    });

    document.getElementById('aeRecordCount').innerText = filtered.length;
    const tbody = document.getElementById('aeTableBody');

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="p-6 text-center text-slate-400">No Accommodation Establishment records found.</td></tr>`;
        return;
    }

    let html = '';
    filtered.forEach(r => {
        const totalLF = Number(r.local_tourist||0) + Number(r.foreign_tourist||0) + Number(r.overseas_filipino||0);
        const totalMF = Number(r.total_male||0) + Number(r.total_female||0);

        html += `<tr class="hover:bg-slate-50 border-b">
                    <td class="p-3"><div class="font-bold text-slate-800">${r.municipality}</div><div class="text-[10px] text-slate-400">${r.province}</div></td>
                    <td class="p-3"><div>${MONTH_NAMES[r.month - 1] || r.month}</div><div class="text-[10px] text-slate-400">${r.year}</div></td>
                    <td class="p-3"><div class="font-bold text-slate-800">${r.establishment}</div><div class="text-[10px] text-teal-600">${r.type_class || 'N/A'}</div></td>
                    <td class="p-3 text-right">${Number(r.local_tourist||0).toLocaleString()}</td>
                    <td class="p-3 text-right">${Number(r.foreign_tourist||0).toLocaleString()}</td>
                    <td class="p-3 text-right">${Number(r.overseas_filipino||0).toLocaleString()}</td>
                    <td class="p-3 text-right font-bold bg-slate-50 text-slate-900">${totalLF.toLocaleString()}</td>
                    <td class="p-3 text-right">${Number(r.total_male||0).toLocaleString()}</td>
                    <td class="p-3 text-right">${Number(r.total_female||0).toLocaleString()}</td>
                    <td class="p-3 text-right font-bold bg-slate-50 text-slate-900">${totalMF.toLocaleString()}</td>
                    <td class="p-3 text-center space-x-1">
                        ${window.isAdmin ? `
                        <button onclick="editAERecord(${r.id})" class="text-blue-600 hover:text-blue-800 p-1"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button onclick="deleteAERecord(${r.id})" class="text-rose-600 hover:text-rose-800 p-1"><i class="fa-solid fa-trash"></i></button>
                        ` : `<span class="text-[10px] text-slate-400">View only</span>`}
                    </td>
                </tr>`;
    });

    tbody.innerHTML = html;
}

function calcAETotals() {
    const l = Math.max(0, Number(document.getElementById('ae_local').value || 0));
    const f = Math.max(0, Number(document.getElementById('ae_foreign').value || 0));
    const o = Math.max(0, Number(document.getElementById('ae_overseas').value || 0));
    const m = Math.max(0, Number(document.getElementById('ae_male').value || 0));
    const fem = Math.max(0, Number(document.getElementById('ae_female').value || 0));

    document.getElementById('ae_calc_lf').innerText = (l + f + o).toLocaleString();
    document.getElementById('ae_calc_mf').innerText = (m + fem).toLocaleString();
}

async function saveAERecord(e) {
    e.preventDefault();
    if (!requireAdmin('save records')) return;
    const id = document.getElementById('ae_id').value;
    const prov = document.getElementById('ae_province').value.trim();
    const muni = document.getElementById('ae_municipality').value.trim();
    const est = document.getElementById('ae_establishment').value.trim();
    const year = Number(document.getElementById('ae_year').value);
    const month = Number(document.getElementById('ae_month').value);

    const local = Math.max(0, Number(document.getElementById('ae_local').value || 0));
    const foreign = Math.max(0, Number(document.getElementById('ae_foreign').value || 0));
    const overseas = Math.max(0, Number(document.getElementById('ae_overseas').value || 0));
    const male = Math.max(0, Number(document.getElementById('ae_male').value || 0));
    const female = Math.max(0, Number(document.getElementById('ae_female').value || 0));

    const total_lf = local + foreign + overseas;
    const total_mf = male + female;

    const record = {
        province: prov,
        municipality: muni,
        establishment: est,
        type_class: document.getElementById('ae_type_class').value.trim(),
        year: year,
        month: month,
        local_tourist: local,
        foreign_tourist: foreign,
        overseas_filipino: overseas,
        total_lf: total_lf,
        total_male: male,
        total_female: female,
        total_mf: total_mf
    };

    // Unique key check logic (Province + Municipality + Year + Month + Establishment)
    const existing = aeRecords.find(r => 
        r.province.toLowerCase() === prov.toLowerCase() &&
        r.municipality.toLowerCase() === muni.toLowerCase() &&
        r.year == year &&
        r.month == month &&
        r.establishment.toLowerCase() === est.toLowerCase() &&
        (!id || r.id != id)
    );

    if (existing) {
        if (id) {
            record.id = Number(id);
        } else {
            // Auto-overwrite existing matching key record
            record.id = existing.id;
            showToast(`Updated existing record for ${est} (${MONTH_NAMES[month-1]} ${year})`, "info");
        }
    } else if (id) {
        record.id = Number(id);
    }

    const savedId = await putRecordToStore("aes", record);
    record.id = record.id || savedId;
    markDirty("aes", record.id);
    try {
        await setRecordToCloud("aes", record);
        clearDirty("aes", [record.id]);
        updateCloudStatus("Cloud Saved", true);
    }
    catch (cloudErr) { console.error(cloudErr); showToast("Local record saved, but cloud save failed: " + cloudErr.message, "warning"); }
    await loadAllRecords();
    closeModal('modalAE');
    refreshAllViews();
    showToast("Accommodation Establishment record saved successfully.", "success");
}

function editAERecord(id) {
    if (!requireAdmin('edit records')) return;
    const r = aeRecords.find(x => x.id === id);
    if (!r) return;
    document.getElementById('ae_id').value = r.id;
    document.getElementById('ae_province').value = r.province;
    document.getElementById('ae_municipality').value = r.municipality;
    document.getElementById('ae_establishment').value = r.establishment;
    document.getElementById('ae_type_class').value = r.type_class || '';
    document.getElementById('ae_year').value = r.year;
    document.getElementById('ae_month').value = r.month;
    document.getElementById('ae_local').value = r.local_tourist;
    document.getElementById('ae_foreign').value = r.foreign_tourist;
    document.getElementById('ae_overseas').value = r.overseas_filipino;
    document.getElementById('ae_male').value = r.total_male;
    document.getElementById('ae_female').value = r.total_female;

    calcAETotals();
    document.getElementById('modalAETitle').innerText = "Edit Accommodation Establishment Record";
    openModal('modalAE');
}

async function deleteAERecord(id) {
    if (!requireAdmin('delete records')) return;
    if (confirm("Are you sure you want to delete this AE record?")) {
        const record = aeRecords.find(x => x.id === id);
        await deleteRecordFromStore("aes", id);
        clearDirty("aes", [id]);
        if (record) {
            try { await deleteRecordFromCloud("aes", record); }
            catch (cloudErr) { console.error(cloudErr); markPendingDelete("aes", record); showToast("Local deletion completed, but cloud deletion failed: " + cloudErr.message, "warning"); }
        }
        await loadAllRecords();
        refreshAllViews();
        showToast("AE Record deleted.", "info");
    }
}

// Process AE Bulk Excel
//
// TOURIST ARRIVALS EXCEL UPLOAD FORMAT - exact expected columns:
// Province/HUC/ICC | Municipality/City | Year | Month | Accommodation
// Establishment | Type-Class | Local Tourist | Foreign Tourist |
// Overseas Filipino | Total (L+F) | Total Male | Total Female |
// Total (M+F)
// Month accepts numeric 1-12 or a month name (auto-converted to
// numeric). Year is stored as a plain 4-digit number. The Total
// columns are recalculated by the system from the component columns
// to guarantee they're always internally consistent; if the upload
// includes its own totals, they're cross-checked and any mismatch is
// reported as a warning rather than silently overwritten.
async function processAEBulkExcel() {
    const fileInput = document.getElementById('bulkAEFile');
    if (!fileInput.files.length) { showToast("Please select an Excel file.", "warning"); return; }

    try {
        const rows = await readExcelFile(fileInput.files[0]);
        if (rows.length < 2) { showToast("Excel file is empty or missing data rows.", "warning"); return; }

        const headers = rows[0].map(normalizeExcelHeader);
        pendingBulkAE = [];
        document.getElementById('btnSaveBulkAE').disabled = true;
        document.getElementById('btnConfirmBulkAE').disabled = true;
        let newCount = 0, updateCount = 0, skippedCount = 0;
        const errors = [];

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every(v => String(v ?? '').trim() === '')) continue;

            const prov = rowValue(row, headers, ['Province/HUC/ICC', 'Province'], 0) || 'Occidental Mindoro';
            const muni = rowValue(row, headers, ['Municipality/City', 'Municipality'], 1);
            const yr = parseYearCell(rowValue(row, headers, ['Year'], 2));
            const mo = parseMonthCell(rowValue(row, headers, ['Month'], 3));
            const est = rowValue(row, headers, ['Accommodation Establishment', 'Establishment'], 4);
            const type = rowValue(row, headers, ['Type-Class', 'Type Class', 'Type/Class'], 5) || 'General';
            const local = parseInt(rowValue(row, headers, ['Local Tourist', 'Local'], 6)) || 0;
            const foreign = parseInt(rowValue(row, headers, ['Foreign Tourist', 'Foreign'], 7)) || 0;
            const overseas = parseInt(rowValue(row, headers, ['Overseas Filipino', 'Overseas'], 8)) || 0;
            const male = parseInt(rowValue(row, headers, ['Total Male', 'Male'], 10)) || 0;
            const female = parseInt(rowValue(row, headers, ['Total Female', 'Female'], 11)) || 0;

            if (!muni || !yr || !mo || !est) {
                errors.push(`Row ${i+1}: Missing/invalid Municipality/City, Year (must be a 4-digit year), Month (1-12 or a month name), or Accommodation Establishment.`);
                skippedCount++;
                continue;
            }

            const total_lf = local + foreign + overseas;
            const total_mf = male + female;

            // Optional cross-check: if the sheet already provides its
            // own totals, flag any mismatch instead of silently
            // discarding it - the stored value is still the
            // recalculated one, kept guaranteed self-consistent.
            const uploadedLF = rowValueIfPresent(row, headers, ['Total (L+F)', 'Total(L+F)', 'Total L+F']);
            if (uploadedLF.present && Number(uploadedLF.value) !== total_lf) {
                errors.push(`Row ${i+1}: Uploaded "Total (L+F)" (${uploadedLF.value}) does not match Local+Foreign+Overseas (${total_lf}). Recalculated value was used.`);
            }
            const uploadedMF = rowValueIfPresent(row, headers, ['Total (M+F)', 'Total(M+F)', 'Total M+F']);
            if (uploadedMF.present && Number(uploadedMF.value) !== total_mf) {
                errors.push(`Row ${i+1}: Uploaded "Total (M+F)" (${uploadedMF.value}) does not match Male+Female (${total_mf}). Recalculated value was used.`);
            }

            const record = {
                province: String(prov).trim(),
                municipality: String(muni).trim(),
                year: yr,
                month: mo,
                establishment: String(est).trim(),
                type_class: String(type).trim(),
                local_tourist: local,
                foreign_tourist: foreign,
                overseas_filipino: overseas,
                total_lf: total_lf,
                total_male: male,
                total_female: female,
                total_mf: total_mf
            };

            const existing = aeRecords.find(r =>
                r.province === record.province &&
                r.municipality === record.municipality &&
                r.year == record.year &&
                r.month == record.month &&
                r.establishment === record.establishment
            );

            if (existing) {
                pendingBulkAE.push({ record, isUpdate: true, existingId: existing.id, row: i + 1 });
                updateCount++;
            } else {
                pendingBulkAE.push({ record, isUpdate: false, row: i + 1 });
                newCount++;
            }
        }

        // Upload Mode check (Single Month / Bulk) + duplicate / similar-name check
        const scopeCheck = checkBulkScope('AE', pendingBulkAE.map(i => i.record));
        if (!scopeCheck.ok) { showBulkScopeError('AE', scopeCheck.message); return; }
        bulkQuality.AE = analyzeUploadNames('AE', pendingBulkAE, aeRecords, scopeCheck.periods);
        renderUploadQuality('AE', bulkQuality.AE, scopeCheck.text);

        document.getElementById('bulkAENewCount').innerText = newCount;
        document.getElementById('bulkAEUpdateCount').innerText = updateCount;
        document.getElementById('bulkAESkippedCount').innerText = skippedCount;
        document.getElementById('bulkAESummary').classList.remove('hidden');

        const previewBody = document.getElementById('bulkAEPreviewBody');
        previewBody.innerHTML = '';
        bulkPreviewItems(pendingBulkAE).forEach(item => {
            const r = item.record;
            previewBody.innerHTML += `<tr class="border-b">
                        <td class="p-2 font-bold ${item.isUpdate ? 'text-amber-600' : 'text-emerald-600'}">${item.isUpdate ? 'UPDATE' : 'NEW'}</td>
                        <td class="p-2">${r.municipality}</td>
                        <td class="p-2 font-semibold">${r.establishment}</td>
                        <td class="p-2">${r.year} / ${MONTH_NAMES[r.month-1]}</td>
                        <td class="p-2">${r.local_tourist}</td>
                        <td class="p-2">${r.foreign_tourist}</td>
                        <td class="p-2 font-bold">${r.total_lf}</td>
                        ${bulkStatusCell(item)}
                    </tr>`;
        });
        document.getElementById('bulkAEPreviewContainer').classList.remove('hidden');

        if (errors.length) {
            const errBox = document.getElementById('bulkAEErrorLog');
            errBox.classList.remove('hidden');
            errBox.innerHTML = `<strong>Import Warning Log (${errors.length}):</strong><br>` + errors.join('<br>');
        } else {
            document.getElementById('bulkAEErrorLog').classList.add('hidden');
        }
        document.getElementById('btnConfirmBulkAE').disabled = false;
        document.getElementById('btnSaveBulkAE').disabled = false;
    } catch (err) {
        console.error(err);
        showToast("Failed to read Excel file: " + err.message, "danger");
    }
}

async function commitAEBulkImport() {
    if (!requireAdmin('bulk import')) return;
    if (!pendingBulkAE.length) {
        showToast("No valid AE records are ready for import. Click Process Excel first and check the preview/errors.", "warning");
        return;
    }
    try {
        if (!confirmBulkBeforeSave('AE', pendingBulkAE)) return;
        const importCount = pendingBulkAE.length;
        const replaced = await replaceBulkByReportingPeriod("aes", aeRecords, pendingBulkAE, "Tourist Arrival");
        if (!replaced) return;
        pendingBulkAE = [];
        document.getElementById('btnSaveBulkAE').disabled = true;
        document.getElementById('btnConfirmBulkAE').disabled = true;
        closeModal('modalBulkAE');
        refreshAllViews();
        showToast(`Tourist Arrival import complete. ${importCount.toLocaleString()} records saved. Only the uploaded Year/Month period(s) were replaced.`, "success");
    } catch (err) {
        console.error(err);
        showToast("Unable to save Tourist Arrival data: " + err.message, "danger");
    }
}

function exportAEsExcel(year=null,month='ALL'){if(!requireAdmin('download data'))return;const source=year==null?aeRecords:aeRecords.filter(r=>Number(r.year)===Number(year)&&(month==='ALL'||Number(r.month)===Number(month)));if(!source.length){showToast('No Tourist Arrival records match the selected period.','warning');return;}const headers=["Province","Municipality","Year","Month","Accommodation Establishment","Type Class","Local Tourist","Foreign Tourist","Overseas Filipino","Total (L+F+Overseas)","Total Male","Total Female","Total (M+F)"];const rows=source.map(r=>[r.province,r.municipality,r.year,MONTH_NAMES[r.month-1],r.establishment,r.type_class||'',Number(r.local_tourist||0),Number(r.foreign_tourist||0),Number(r.overseas_filipino||0),Number(r.local_tourist||0)+Number(r.foreign_tourist||0)+Number(r.overseas_filipino||0),Number(r.total_male||0),Number(r.total_female||0),Number(r.total_mf||0)]);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,makeDataSheet(headers,rows,[2,6,7,8,9,10,11,12]),'AEs Data');XLSX.utils.book_append_sheet(wb,makeInfoSheet('Tourist Arrivals – Accommodation Establishments (AEs)',`Export period: ${year==null?'All Saved Data':`${year} - ${month==='ALL'?'All Months':MONTH_NAMES[month-1]}`}`),'Info');saveWorkbook(wb,`Tourist_Arrivals_AEs_${year==null?'All_Data':`${year}_${month==='ALL'?'All_Months':MONTH_NAMES[month-1]}`}.xlsx`);}

function downloadAETemplate() { if (!requireAdmin('download data')) return;
    const headers = ["Province/HUC/ICC","Municipality/City","Year","Month","Accommodation Establishment","Type-Class","Local Tourist","Foreign Tourist","Overseas Filipino","Total (L+F)","Total Male","Total Female","Total (M+F)"];
    const sample = ["Occidental Mindoro","Mamburao",CURRENT_YEAR,1,"Sample Establishment","Hotel",0,0,0,0,0,0,0];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, makeDataSheet(headers,[sample],[2,6,7,8,9,10,11,12]),"AEs Data");
    XLSX.utils.book_append_sheet(wb, makeInfoSheet("AEs Excel Upload Template","Enter one record per row. Month must be numeric (January=1 ... December=12); month names are also accepted. Year must be a 4-digit number. Total (L+F) and Total (M+F) are recalculated by the system - you may leave them blank or fill them in for reference, but do not enter formulas."),"Instructions");
    saveWorkbook(wb, "Tourism_AEs_Excel_Upload_Template.xlsx");
}

// ##############################################################################
// ##### SECTION: TASS
// ##############################################################################

/**
 * SAME-DAY VISITORS (TAss): table, add/edit/delete form, bulk Excel upload, template and Excel download.
 */

/**
 * SECTION 3: SAME-DAY VISITORS (TAss) TABLE & CRUD
 */
function renderTAssTable() {
    const search = document.getElementById('filterTAssSearch').value.toLowerCase();
    const muni = document.getElementById('filterTAssMuni').value;
    const year = document.getElementById('filterTAssYear').value;
    const month = document.getElementById('filterTAssMonth').value;

    const filtered = tassRecords.filter(r => {
        if (muni !== 'ALL' && r.municipality !== muni) return false;
        if (year !== 'ALL' && r.year != year) return false;
        if (month !== 'ALL' && r.month != month) return false;
        if (search) {
            const matchStr = `${r.attraction} ${r.municipality} ${r.province}`.toLowerCase();
            if (!matchStr.includes(search)) return false;
        }
        return true;
    });

    document.getElementById('tassRecordCount').innerText = filtered.length;
    const tbody = document.getElementById('tassTableBody');

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-slate-400">No Same-Day Visitor records found.</td></tr>`;
        return;
    }

    let html = '';
    filtered.forEach(r => {
        html += `<tr class="hover:bg-slate-50 border-b">
                    <td class="p-3"><div class="font-bold text-slate-800">${r.municipality}</div><div class="text-[10px] text-slate-400">${r.province}</div></td>
                    <td class="p-3"><div>${MONTH_NAMES[r.month - 1] || r.month}</div><div class="text-[10px] text-slate-400">${r.year}</div></td>
                    <td class="p-3 font-bold text-slate-800">${r.attraction}</td>
                    <td class="p-3 text-right">${Number(r.tm_sum||0).toLocaleString()}</td>
                    <td class="p-3 text-right">${Number(r.om_sum||0).toLocaleString()}</td>
                    <td class="p-3 text-right">${Number(r.fcr_sum||0).toLocaleString()}</td>
                    <td class="p-3 text-right">${Number(r.total_male||0).toLocaleString()}</td>
                    <td class="p-3 text-right">${Number(r.total_female||0).toLocaleString()}</td>
                    <td class="p-3 text-right font-bold bg-slate-50 text-teal-700">${Number(r.grand_total||0).toLocaleString()}</td>
                    <td class="p-3 text-center space-x-1">
                        ${window.isAdmin ? `
                        <button onclick="editTAssRecord(${r.id})" class="text-blue-600 hover:text-blue-800 p-1"><i class="fa-solid fa-pen-to-square"></i></button>
                        <button onclick="deleteTAssRecord(${r.id})" class="text-rose-600 hover:text-rose-800 p-1"><i class="fa-solid fa-trash"></i></button>
                        ` : `<span class="text-[10px] text-slate-400">View only</span>`}
                    </td>
                </tr>`;
    });

    tbody.innerHTML = html;
}

function calcTAssTotals() {
    const tm_m = Math.max(0, Number(document.getElementById('tass_tm_m').value || 0));
    const tm_f = Math.max(0, Number(document.getElementById('tass_tm_f').value || 0));
    const om_m = Math.max(0, Number(document.getElementById('tass_om_m').value || 0));
    const om_f = Math.max(0, Number(document.getElementById('tass_om_f').value || 0));
    const fcr_m = Math.max(0, Number(document.getElementById('tass_fcr_m').value || 0));
    const fcr_f = Math.max(0, Number(document.getElementById('tass_fcr_f').value || 0));

    const tm_sum = tm_m + tm_f;
    const om_sum = om_m + om_f;
    const fcr_sum = fcr_m + fcr_f;

    const total_male = tm_m + om_m + fcr_m;
    const total_female = tm_f + om_f + fcr_f;
    const grand_total = total_male + total_female;

    document.getElementById('calc_tm_sum').innerText = tm_sum.toLocaleString();
    document.getElementById('calc_om_sum').innerText = om_sum.toLocaleString();
    document.getElementById('calc_fcr_sum').innerText = fcr_sum.toLocaleString();

    document.getElementById('calc_tass_male').innerText = total_male.toLocaleString();
    document.getElementById('calc_tass_female').innerText = total_female.toLocaleString();
    document.getElementById('calc_tass_grand').innerText = grand_total.toLocaleString();
}

async function saveTAssRecord(e) {
    if (!requireAdmin('save records')) return;
    e.preventDefault();
    const id = document.getElementById('tass_id').value;
    const prov = document.getElementById('tass_province').value.trim();
    const muni = document.getElementById('tass_municipality').value.trim();
    const attr = document.getElementById('tass_attraction').value.trim();
    const year = Number(document.getElementById('tass_year').value);
    const month = Number(document.getElementById('tass_month').value);

    const tm_m = Math.max(0, Number(document.getElementById('tass_tm_m').value || 0));
    const tm_f = Math.max(0, Number(document.getElementById('tass_tm_f').value || 0));
    const om_m = Math.max(0, Number(document.getElementById('tass_om_m').value || 0));
    const om_f = Math.max(0, Number(document.getElementById('tass_om_f').value || 0));
    const fcr_m = Math.max(0, Number(document.getElementById('tass_fcr_m').value || 0));
    const fcr_f = Math.max(0, Number(document.getElementById('tass_fcr_f').value || 0));

    const tm_sum = tm_m + tm_f;
    const om_sum = om_m + om_f;
    const fcr_sum = fcr_m + fcr_f;

    const total_male = tm_m + om_m + fcr_m;
    const total_female = tm_f + om_f + fcr_f;
    const grand_total = total_male + total_female;

    const record = {
        province: prov,
        municipality: muni,
        attraction: attr,
        year: year,
        month: month,
        tm_m: tm_m, tm_f: tm_f, tm_sum: tm_sum,
        om_m: om_m, om_f: om_f, om_sum: om_sum,
        fcr_m: fcr_m, fcr_f: fcr_f, fcr_sum: fcr_sum,
        total_male: total_male,
        total_female: total_female,
        grand_total: grand_total
    };

    // Unique key check (Province + Municipality + Year + Month + Attraction)
    const existing = tassRecords.find(r => 
        r.province.toLowerCase() === prov.toLowerCase() &&
        r.municipality.toLowerCase() === muni.toLowerCase() &&
        r.year == year &&
        r.month == month &&
        r.attraction.toLowerCase() === attr.toLowerCase() &&
        (!id || r.id != id)
    );

    if (existing) {
        if (id) {
            record.id = Number(id);
        } else {
            record.id = existing.id;
            showToast(`Updated existing record for ${attr} (${MONTH_NAMES[month-1]} ${year})`, "info");
        }
    } else if (id) {
        record.id = Number(id);
    }

    const savedId = await putRecordToStore("tass", record);
    record.id = record.id || savedId;
    markDirty("tass", record.id);
    try {
        await setRecordToCloud("tass", record);
        clearDirty("tass", [record.id]);
        updateCloudStatus("Cloud Saved", true);
    }
    catch (cloudErr) { console.error(cloudErr); showToast("Local record saved, but cloud save failed: " + cloudErr.message, "warning"); }
    await loadAllRecords();
    closeModal('modalTAss');
    refreshAllViews();
    showToast("Same-Day Visitor record saved successfully.", "success");
}

function editTAssRecord(id) {
    if (!requireAdmin('edit records')) return;
    const r = tassRecords.find(x => x.id === id);
    if (!r) return;
    document.getElementById('tass_id').value = r.id;
    document.getElementById('tass_province').value = r.province;
    document.getElementById('tass_municipality').value = r.municipality;
    document.getElementById('tass_attraction').value = r.attraction;
    document.getElementById('tass_year').value = r.year;
    document.getElementById('tass_month').value = r.month;

    document.getElementById('tass_tm_m').value = r.tm_m;
    document.getElementById('tass_tm_f').value = r.tm_f;
    document.getElementById('tass_om_m').value = r.om_m;
    document.getElementById('tass_om_f').value = r.om_f;
    document.getElementById('tass_fcr_m').value = r.fcr_m;
    document.getElementById('tass_fcr_f').value = r.fcr_f;

    calcTAssTotals();
    document.getElementById('modalTAssTitle').innerText = "Edit Same-Day Visitor Record";
    openModal('modalTAss');
}

async function deleteTAssRecord(id) {
    if (!requireAdmin('delete records')) return;
    if (confirm("Are you sure you want to delete this TAss record?")) {
        const record = tassRecords.find(x => x.id === id);
        await deleteRecordFromStore("tass", id);
        clearDirty("tass", [id]);
        if (record) {
            try { await deleteRecordFromCloud("tass", record); }
            catch (cloudErr) { console.error(cloudErr); markPendingDelete("tass", record); showToast("Local deletion completed, but cloud deletion failed: " + cloudErr.message, "warning"); }
        }
        await loadAllRecords();
        refreshAllViews();
        showToast("TAss Record deleted.", "info");
    }
}

// Process TAss Bulk Excel
//
// ATTRACTION / SAME-DAY VISITOR EXCEL UPLOAD FORMAT - exact expected
// columns: Province/HUC/ICC | Municipality/City | Year | Month |
// Tourist Attraction | TM(M) | TM(F) | TM(SUM) | OM(M) | OM(F) |
// OM(SUM) | FCR(M) | FCR(F) | FCR(SUM) | Total Male | Total Female |
// Grand Total
// Month/Year follow the same rules as the Tourist Arrivals upload.
// TM(SUM)/OM(SUM)/FCR(SUM)/Total Male/Total Female/Grand Total are
// recalculated by the system from the M/F component columns so they
// stay internally consistent; if present in the upload they're
// cross-checked and any mismatch is reported as a warning.
async function processTAssBulkExcel() {
    const fileInput = document.getElementById('bulkTAssFile');
    if (!fileInput.files.length) { showToast("Please select an Excel file.", "warning"); return; }

    try {
        const rows = await readExcelFile(fileInput.files[0]);
        if (rows.length < 2) { showToast("Excel file is empty or missing data rows.", "warning"); return; }

        const headers = rows[0].map(normalizeExcelHeader);
        pendingBulkTAss = [];
        document.getElementById('btnSaveBulkTAss').disabled = true;
        document.getElementById('btnConfirmBulkTAss').disabled = true;
        let newCount = 0, updateCount = 0, skippedCount = 0;
        const errors = [];

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every(v => String(v ?? '').trim() === '')) continue;

            const prov = rowValue(row, headers, ['Province/HUC/ICC', 'Province'], 0) || 'Occidental Mindoro';
            const muni = rowValue(row, headers, ['Municipality/City', 'Municipality'], 1);
            const yr = parseYearCell(rowValue(row, headers, ['Year'], 2));
            const mo = parseMonthCell(rowValue(row, headers, ['Month'], 3));
            const attr = rowValue(row, headers, ['Tourist Attraction', 'Attraction'], 4);

            const tm_m = parseInt(rowValue(row, headers, ['TM(M)', 'TM Male'], 5)) || 0;
            const tm_f = parseInt(rowValue(row, headers, ['TM(F)', 'TM Female'], 6)) || 0;
            const om_m = parseInt(rowValue(row, headers, ['OM(M)', 'OM Male'], 8)) || 0;
            const om_f = parseInt(rowValue(row, headers, ['OM(F)', 'OM Female'], 9)) || 0;
            const fcr_m = parseInt(rowValue(row, headers, ['FCR(M)', 'FCR Male'], 11)) || 0;
            const fcr_f = parseInt(rowValue(row, headers, ['FCR(F)', 'FCR Female'], 12)) || 0;

            if (!muni || !yr || !mo || !attr) {
                errors.push(`Row ${i+1}: Missing/invalid Municipality/City, Year (must be a 4-digit year), Month (1-12 or a month name), or Tourist Attraction.`);
                skippedCount++;
                continue;
            }

            const tm_sum = tm_m + tm_f, om_sum = om_m + om_f, fcr_sum = fcr_m + fcr_f;
            const total_male = tm_m + om_m + fcr_m, total_female = tm_f + om_f + fcr_f;
            const grand_total = total_male + total_female;

            // Optional cross-checks against any totals already present
            // in the uploaded sheet - the recalculated value is what's
            // stored, but a mismatch is surfaced as a warning.
            const checks = [
                [['TM(SUM)', 'TM Sum'], tm_sum, 'TM(SUM)'],
                [['OM(SUM)', 'OM Sum'], om_sum, 'OM(SUM)'],
                [['FCR(SUM)', 'FCR Sum'], fcr_sum, 'FCR(SUM)'],
                [['Total Male'], total_male, 'Total Male'],
                [['Total Female'], total_female, 'Total Female'],
                [['Grand Total'], grand_total, 'Grand Total']
            ];
            checks.forEach(([aliases, computed, label]) => {
                const found = rowValueIfPresent(row, headers, aliases);
                if (found.present && Number(found.value) !== computed) {
                    errors.push(`Row ${i+1}: Uploaded "${label}" (${found.value}) does not match the computed value (${computed}). Recalculated value was used.`);
                }
            });

            const record = {
                province: String(prov).trim(),
                municipality: String(muni).trim(),
                year: yr,
                month: mo,
                attraction: String(attr).trim(),
                tm_m, tm_f, tm_sum,
                om_m, om_f, om_sum,
                fcr_m, fcr_f, fcr_sum,
                total_male,
                total_female,
                grand_total
            };

            const existing = tassRecords.find(r =>
                r.province === record.province &&
                r.municipality === record.municipality &&
                r.year == record.year &&
                r.month == record.month &&
                r.attraction === record.attraction
            );

            if (existing) {
                pendingBulkTAss.push({ record, isUpdate: true, existingId: existing.id, row: i + 1 });
                updateCount++;
            } else {
                pendingBulkTAss.push({ record, isUpdate: false, row: i + 1 });
                newCount++;
            }
        }

        // Upload Mode check (Single Month / Bulk) + duplicate / similar-name check
        const scopeCheck = checkBulkScope('TAss', pendingBulkTAss.map(i => i.record));
        if (!scopeCheck.ok) { showBulkScopeError('TAss', scopeCheck.message); return; }
        bulkQuality.TAss = analyzeUploadNames('TAss', pendingBulkTAss, tassRecords, scopeCheck.periods);
        renderUploadQuality('TAss', bulkQuality.TAss, scopeCheck.text);

        document.getElementById('bulkTAssNewCount').innerText = newCount;
        document.getElementById('bulkTAssUpdateCount').innerText = updateCount;
        document.getElementById('bulkTAssSkippedCount').innerText = skippedCount;
        document.getElementById('bulkTAssSummary').classList.remove('hidden');

        const previewBody = document.getElementById('bulkTAssPreviewBody');
        previewBody.innerHTML = '';
        bulkPreviewItems(pendingBulkTAss).forEach(item => {
            const r = item.record;
            previewBody.innerHTML += `<tr class="border-b">
                        <td class="p-2 font-bold ${item.isUpdate ? 'text-amber-600' : 'text-emerald-600'}">${item.isUpdate ? 'UPDATE' : 'NEW'}</td>
                        <td class="p-2">${r.municipality}</td>
                        <td class="p-2 font-semibold">${r.attraction}</td>
                        <td class="p-2">${r.year} / ${MONTH_NAMES[r.month-1]}</td>
                        <td class="p-2">${r.tm_sum}</td>
                        <td class="p-2">${r.om_sum}</td>
                        <td class="p-2">${r.fcr_sum}</td>
                        <td class="p-2 font-bold">${r.grand_total}</td>
                        ${bulkStatusCell(item)}
                    </tr>`;
        });
        document.getElementById('bulkTAssPreviewContainer').classList.remove('hidden');

        if (errors.length) {
            const errBox = document.getElementById('bulkTAssErrorLog');
            errBox.classList.remove('hidden');
            errBox.innerHTML = `<strong>Import Warning Log (${errors.length}):</strong><br>` + errors.join('<br>');
        } else {
            document.getElementById('bulkTAssErrorLog').classList.add('hidden');
        }
        document.getElementById('btnConfirmBulkTAss').disabled = false;
        document.getElementById('btnSaveBulkTAss').disabled = false;
    } catch (err) {
        console.error(err);
        showToast("Failed to read Excel file: " + err.message, "danger");
    }
}

async function commitTAssBulkImport() {
    if (!requireAdmin('bulk import')) return;
    if (!pendingBulkTAss.length) {
        showToast("No valid TAss records are ready for import. Click Process Excel first and check the preview/errors.", "warning");
        return;
    }
    try {
        if (!confirmBulkBeforeSave('TAss', pendingBulkTAss)) return;
        const importCount = pendingBulkTAss.length;
        const replaced = await replaceBulkByReportingPeriod("tass", tassRecords, pendingBulkTAss, "Same-Day Visitor");
        if (!replaced) return;
        pendingBulkTAss = [];
        document.getElementById('btnSaveBulkTAss').disabled = true;
        document.getElementById('btnConfirmBulkTAss').disabled = true;
        closeModal('modalBulkTAss');
        refreshAllViews();
        showToast(`Same-Day Visitor import complete. ${importCount.toLocaleString()} records saved. Only the uploaded Year/Month period(s) were replaced.`, "success");
    } catch (err) {
        console.error(err);
        showToast("Unable to save Same-Day Visitor data: " + err.message, "danger");
    }
}

function exportTAssExcel(year=null,month='ALL'){if(!requireAdmin('download data'))return;const source=year==null?tassRecords:tassRecords.filter(r=>Number(r.year)===Number(year)&&(month==='ALL'||Number(r.month)===Number(month)));if(!source.length){showToast('No Same-Day Visitor records match the selected period.','warning');return;}const headers=["Province","Municipality","Year","Month","Tourist Attraction","TM(M)","TM(F)","TM(SUM)","OM(M)","OM(F)","OM(SUM)","FCR(M)","FCR(F)","FCR(SUM)","Total Male","Total Female","Grand Total"];const rows=source.map(r=>[r.province,r.municipality,r.year,MONTH_NAMES[r.month-1],r.attraction,Number(r.tm_m||0),Number(r.tm_f||0),Number(r.tm_sum||0),Number(r.om_m||0),Number(r.om_f||0),Number(r.om_sum||0),Number(r.fcr_m||0),Number(r.fcr_f||0),Number(r.fcr_sum||0),Number(r.total_male||0),Number(r.total_female||0),Number(r.grand_total||0)]);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,makeDataSheet(headers,rows,[2,5,6,7,8,9,10,11,12,13,14,15,16]),'TAss Data');XLSX.utils.book_append_sheet(wb,makeInfoSheet('Same-Day Visitors – Tourist Attraction Arrivals (TAss)',`Export period: ${year==null?'All Saved Data':`${year} - ${month==='ALL'?'All Months':MONTH_NAMES[month-1]}`}`),'Info');saveWorkbook(wb,`SameDay_Visitors_TAss_${year==null?'All_Data':`${year}_${month==='ALL'?'All_Months':MONTH_NAMES[month-1]}`}.xlsx`);}

function downloadTAssTemplate() { if (!requireAdmin('download data')) return;
    const headers = ["Province/HUC/ICC","Municipality/City","Year","Month","Tourist Attraction","TM(M)","TM(F)","TM(SUM)","OM(M)","OM(F)","OM(SUM)","FCR(M)","FCR(F)","FCR(SUM)","Total Male","Total Female","Grand Total"];
    const sample = ["Occidental Mindoro","Mamburao",CURRENT_YEAR,1,"Sample Attraction",0,0,0,0,0,0,0,0,0,0,0,0];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, makeDataSheet(headers,[sample],[2,5,6,7,8,9,10,11,12,13,14,15,16]),"TAss Data");
    XLSX.utils.book_append_sheet(wb, makeInfoSheet("TAss Excel Upload Template","Enter one record per row. Month must be numeric (January=1 ... December=12); month names are also accepted. Year must be a 4-digit number. SUM/Total/Grand Total columns are recalculated by the system - you may leave them blank or fill them in for reference, but do not enter formulas."),"Instructions");
    saveWorkbook(wb, "Tourism_TAss_Excel_Upload_Template.xlsx");
}

// ##############################################################################
// ##### SECTION: REPORTS-SUMMARY
// ##############################################################################

/**
 * REPORTS - ANNUAL & MONTHLY SUMMARY: on-screen reports and their Excel exports.
 */

/**
 * SECTION 5: ANNUAL SUMMARY REPORT GENERATION
 */
function renderAnnualReport() {
    const yr = document.getElementById('rptAnnualYear').value || CURRENT_YEAR;
    const mo = document.getElementById('rptAnnualMonth') ? document.getElementById('rptAnnualMonth').value : 'ALL';
    const moOk = r => mo === 'ALL' || Number(r.month) === Number(mo);
    document.getElementById('rptAnnualYearLbl').innerText = yr;
    document.getElementById('rptAnnualMonthLbl').innerText = mo === 'ALL' ? 'All Months' : MONTH_NAMES[Number(mo) - 1];
    document.getElementById('rptAnnualTitle').innerText = mo === 'ALL' ? 'Annual Tourism Performance Summary' : 'Monthly Tourism Statistics Summary';

    // Collect all unique municipalities
    const munis = new Set();
    aeRecords.forEach(r => { if (r.year == yr && moOk(r)) munis.add(r.municipality); });
    tassRecords.forEach(r => { if (r.year == yr && moOk(r)) munis.add(r.municipality); });

    const sortedMunis = Array.from(munis).sort();
    const tbody = document.getElementById('rptAnnualBody');
    tbody.innerHTML = '';

    let gLocal=0, gForeign=0, gOverseas=0, gAEsTotal=0;
    let gTM=0, gOM=0, gFCR=0, gTAssTotal=0;

    sortedMunis.forEach(m => {
        let local=0, foreign=0, overseas=0;
        aeRecords.filter(r => r.year == yr && moOk(r) && r.municipality === m).forEach(r => {
            local += Number(r.local_tourist||0);
            foreign += Number(r.foreign_tourist||0);
            overseas += Number(r.overseas_filipino||0);
        });
        const totalAEs = local + foreign + overseas;

        let tm=0, om=0, fcr=0;
        tassRecords.filter(r => r.year == yr && moOk(r) && r.municipality === m).forEach(r => {
            tm += Number(r.tm_sum||0);
            om += Number(r.om_sum||0);
            fcr += Number(r.fcr_sum||0);
        });
        const totalTAss = tm + om + fcr;
        const combined = totalAEs + totalTAss;

        gLocal+=local; gForeign+=foreign; gOverseas+=overseas; gAEsTotal+=totalAEs;
        gTM+=tm; gOM+=om; gFCR+=fcr; gTAssTotal+=totalTAss;

        tbody.innerHTML += `<tr class="hover:bg-slate-50 border-b">
                    <td class="p-2 font-bold border-r text-slate-800">${m}</td>
                    <td class="p-2 text-right">${local.toLocaleString()}</td>
                    <td class="p-2 text-right">${foreign.toLocaleString()}</td>
                    <td class="p-2 text-right">${overseas.toLocaleString()}</td>
                    <td class="p-2 text-right font-bold bg-blue-50/50 border-r text-blue-900">${totalAEs.toLocaleString()}</td>
                    <td class="p-2 text-right">${tm.toLocaleString()}</td>
                    <td class="p-2 text-right">${om.toLocaleString()}</td>
                    <td class="p-2 text-right">${fcr.toLocaleString()}</td>
                    <td class="p-2 text-right font-bold bg-teal-50/50 border-r text-teal-900">${totalTAss.toLocaleString()}</td>
                    <td class="p-2 text-right font-bold bg-amber-50 text-amber-900">${combined.toLocaleString()}</td>
                </tr>`;
    });

    document.getElementById('rptAnnualFoot').innerHTML = `<tr>
                <td class="p-2 border-r">PROVINCIAL TOTAL</td>
                <td class="p-2 text-right">${gLocal.toLocaleString()}</td>
                <td class="p-2 text-right">${gForeign.toLocaleString()}</td>
                <td class="p-2 text-right">${gOverseas.toLocaleString()}</td>
                <td class="p-2 text-right border-r text-blue-200">${gAEsTotal.toLocaleString()}</td>
                <td class="p-2 text-right">${gTM.toLocaleString()}</td>
                <td class="p-2 text-right">${gOM.toLocaleString()}</td>
                <td class="p-2 text-right">${gFCR.toLocaleString()}</td>
                <td class="p-2 text-right border-r text-teal-200">${gTAssTotal.toLocaleString()}</td>
                <td class="p-2 text-right text-amber-300 font-extrabold">${(gAEsTotal + gTAssTotal).toLocaleString()}</td>
            </tr>`;
}

/**
 * SECTION 6: MONTHLY SUMMARY REPORT GENERATION
 */
function renderMonthlyReport() {
    const yr = document.getElementById('rptMonthlyYear').value || CURRENT_YEAR;
    const mu = document.getElementById('rptMonthlyMuni').value;

    document.getElementById('rptMonthlyYearLbl').innerText = yr;
    document.getElementById('rptMonthlyMuniLbl').innerText = mu === 'ALL' ? 'All Municipalities' : mu;

    const tbody = document.getElementById('rptMonthlyBody');
    tbody.innerHTML = '';

    let gLocal=0, gForeign=0, gOverseas=0, gAEsTotal=0;
    let gTM=0, gOM=0, gFCR=0, gTAssTotal=0;

    for (let m = 1; m <= 12; m++) {
        let local=0, foreign=0, overseas=0;
        aeRecords.filter(r => r.year == yr && r.month == m && (mu === 'ALL' || r.municipality === mu)).forEach(r => {
            local += Number(r.local_tourist||0);
            foreign += Number(r.foreign_tourist||0);
            overseas += Number(r.overseas_filipino||0);
        });
        const totalAEs = local + foreign + overseas;

        let tm=0, om=0, fcr=0;
        tassRecords.filter(r => r.year == yr && r.month == m && (mu === 'ALL' || r.municipality === mu)).forEach(r => {
            tm += Number(r.tm_sum||0);
            om += Number(r.om_sum||0);
            fcr += Number(r.fcr_sum||0);
        });
        const totalTAss = tm + om + fcr;
        const combined = totalAEs + totalTAss;

        gLocal+=local; gForeign+=foreign; gOverseas+=overseas; gAEsTotal+=totalAEs;
        gTM+=tm; gOM+=om; gFCR+=fcr; gTAssTotal+=totalTAss;

        tbody.innerHTML += `<tr class="hover:bg-slate-50 border-b">
                    <td class="p-2 font-bold text-slate-800">${MONTH_NAMES[m-1]}</td>
                    <td class="p-2 text-right">${local.toLocaleString()}</td>
                    <td class="p-2 text-right">${foreign.toLocaleString()}</td>
                    <td class="p-2 text-right">${overseas.toLocaleString()}</td>
                    <td class="p-2 text-right font-bold bg-blue-50/50 text-blue-900">${totalAEs.toLocaleString()}</td>
                    <td class="p-2 text-right">${tm.toLocaleString()}</td>
                    <td class="p-2 text-right">${om.toLocaleString()}</td>
                    <td class="p-2 text-right">${fcr.toLocaleString()}</td>
                    <td class="p-2 text-right font-bold bg-teal-50/50 text-teal-900">${totalTAss.toLocaleString()}</td>
                    <td class="p-2 text-right font-bold bg-amber-50 text-amber-900">${combined.toLocaleString()}</td>
                </tr>`;
    }

    document.getElementById('rptMonthlyFoot').innerHTML = `<tr>
                <td class="p-2">YEAR TOTAL (${yr})</td>
                <td class="p-2 text-right">${gLocal.toLocaleString()}</td>
                <td class="p-2 text-right">${gForeign.toLocaleString()}</td>
                <td class="p-2 text-right">${gOverseas.toLocaleString()}</td>
                <td class="p-2 text-right text-blue-200">${gAEsTotal.toLocaleString()}</td>
                <td class="p-2 text-right">${gTM.toLocaleString()}</td>
                <td class="p-2 text-right">${gOM.toLocaleString()}</td>
                <td class="p-2 text-right">${gFCR.toLocaleString()}</td>
                <td class="p-2 text-right text-teal-200">${gTAssTotal.toLocaleString()}</td>
                <td class="p-2 text-right text-amber-300 font-extrabold">${(gAEsTotal + gTAssTotal).toLocaleString()}</td>
            </tr>`;

    try { renderMonthlyTrend(yr, mu); } catch (e) { console.error('Monthly trend error:', e); }
}

function getAnnualReportRows(yr, mo) {
    mo = mo || 'ALL';
    const moOk = r => mo === 'ALL' || Number(r.month) === Number(mo);
    const munis = new Set();
    aeRecords.forEach(r => { if (r.year == yr && moOk(r)) munis.add(r.municipality); });
    tassRecords.forEach(r => { if (r.year == yr && moOk(r)) munis.add(r.municipality); });
    const sortedMunis = Array.from(munis).sort();
    const rows = [];
    let gLocal=0,gForeign=0,gOverseas=0,gAEsTotal=0,gTM=0,gOM=0,gFCR=0,gTAssTotal=0;
    sortedMunis.forEach(m => {
        let local=0,foreign=0,overseas=0;
        aeRecords.filter(r=>r.year==yr&&moOk(r)&&r.municipality===m).forEach(r=>{local+=Number(r.local_tourist||0);foreign+=Number(r.foreign_tourist||0);overseas+=Number(r.overseas_filipino||0);});
        const totalAEs=local+foreign+overseas;
        let tm=0,om=0,fcr=0;
        tassRecords.filter(r=>r.year==yr&&moOk(r)&&r.municipality===m).forEach(r=>{tm+=Number(r.tm_sum||0);om+=Number(r.om_sum||0);fcr+=Number(r.fcr_sum||0);});
        const totalTAss=tm+om+fcr, combined=totalAEs+totalTAss;
        gLocal+=local;gForeign+=foreign;gOverseas+=overseas;gAEsTotal+=totalAEs;gTM+=tm;gOM+=om;gFCR+=fcr;gTAssTotal+=totalTAss;
        rows.push([m,local,foreign,overseas,totalAEs,tm,om,fcr,totalTAss,combined]);
    });
    rows.push(["PROVINCIAL TOTAL",gLocal,gForeign,gOverseas,gAEsTotal,gTM,gOM,gFCR,gTAssTotal,gAEsTotal+gTAssTotal]);
    return rows;
}

function exportAnnualReportExcel() { if (!requireAdmin('download data')) return;
    const yr = document.getElementById('rptAnnualYear').value || CURRENT_YEAR;
    const mo = document.getElementById('rptAnnualMonth') ? document.getElementById('rptAnnualMonth').value : 'ALL';
    const moLbl = mo === 'ALL' ? 'All Months' : MONTH_NAMES[Number(mo) - 1];
    const rows = getAnnualReportRows(yr, mo);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
        ["PROVINCIAL GOVERNMENT OF OCCIDENTAL MINDORO"],
        ["ANNUAL TOURISM PERFORMANCE SUMMARY"],
        [`Reporting Year: ${yr} | Month: ${moLbl}`],
        ["Municipality","Local","Foreign","Overseas","Total AEs","TM","OM","FCR","Total TAss","Combined Visitors"],
        ...rows
    ]);
    ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:9}},{s:{r:1,c:0},e:{r:1,c:9}},{s:{r:2,c:0},e:{r:2,c:9}}];
    ws['A1'].s=excelTitleStyle(); ws['A2'].s=excelTitleStyle(); ws['A3'].s=EXCEL_SUBTITLE_FONT;
    styleHeaderRow(ws,3); styleDataNumbers(ws,[1,2,3,4,5,6,7,8,9],4);
    ws['!freeze']={xSplit:0,ySplit:4}; autoWidth(ws,12,30);
    XLSX.utils.book_append_sheet(wb,ws,"Annual Summary");
    saveWorkbook(wb,`Annual_Tourism_Summary_${yr}${mo === 'ALL' ? '' : '_' + moLbl}.xlsx`);
}

function getMonthlyReportRows(yr, mu) {
    const rows=[];
    let gLocal=0,gForeign=0,gOverseas=0,gAEsTotal=0,gTM=0,gOM=0,gFCR=0,gTAssTotal=0;
    for(let m=1;m<=12;m++){
        let local=0,foreign=0,overseas=0;
        aeRecords.filter(r=>r.year==yr&&r.month==m&&(mu==='ALL'||r.municipality===mu)).forEach(r=>{local+=Number(r.local_tourist||0);foreign+=Number(r.foreign_tourist||0);overseas+=Number(r.overseas_filipino||0);});
        const totalAEs=local+foreign+overseas;
        let tm=0,om=0,fcr=0;
        tassRecords.filter(r=>r.year==yr&&r.month==m&&(mu==='ALL'||r.municipality===mu)).forEach(r=>{tm+=Number(r.tm_sum||0);om+=Number(r.om_sum||0);fcr+=Number(r.fcr_sum||0);});
        const totalTAss=tm+om+fcr,combined=totalAEs+totalTAss;
        gLocal+=local;gForeign+=foreign;gOverseas+=overseas;gAEsTotal+=totalAEs;gTM+=tm;gOM+=om;gFCR+=fcr;gTAssTotal+=totalTAss;
        rows.push([MONTH_NAMES[m-1],local,foreign,overseas,totalAEs,tm,om,fcr,totalTAss,combined]);
    }
    rows.push([`YEAR TOTAL (${yr})`,gLocal,gForeign,gOverseas,gAEsTotal,gTM,gOM,gFCR,gTAssTotal,gAEsTotal+gTAssTotal]);
    return rows;
}

function exportMonthlyReportExcel() { if (!requireAdmin('download data')) return;
    const yr=document.getElementById('rptMonthlyYear').value|| CURRENT_YEAR;
    const mu=document.getElementById('rptMonthlyMuni').value;
    const scope=mu==='ALL'?'All Municipalities':mu;
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet([
        ["PROVINCIAL GOVERNMENT OF OCCIDENTAL MINDORO"],
        ["MONTHLY VISITOR BREAKDOWN REPORT"],
        [`Year: ${yr} | Scope: ${scope}`],
        ["Month","Local Tourist","Foreign Tourist","Overseas Fil","Total Tourist Arrivals","Same-Day (TM)","Same-Day (OM)","Same-Day (FCR)","Total Same-Day","Combined Visitors"],
        ...getMonthlyReportRows(yr,mu)
    ]);
    ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:9}},{s:{r:1,c:0},e:{r:1,c:9}},{s:{r:2,c:0},e:{r:2,c:9}}];
    ws['A1'].s=excelTitleStyle();ws['A2'].s=excelTitleStyle();ws['A3'].s=EXCEL_SUBTITLE_FONT;
    styleHeaderRow(ws,3);styleDataNumbers(ws,[1,2,3,4,5,6,7,8,9],4);ws['!freeze']={xSplit:0,ySplit:4};autoWidth(ws,12,30);
    XLSX.utils.book_append_sheet(wb,ws,"Monthly Summary");
    saveWorkbook(wb,`Monthly_Tourism_Summary_${yr}_${scope.replace(/[^A-Za-z0-9]+/g,'_')}.xlsx`);
}

// ##############################################################################
// ##### SECTION: REPORTS-TOP-LISTS
// ##############################################################################

/**
 * REPORTS - TOP 10 LISTS: top accommodation establishments, top tourist attractions,
 * top municipalities, and their Excel exports.
 */

/**
 * SECTION 7: TOP 10 ACCOMMODATION ESTABLISHMENTS RANKINGS
 */
function renderTopAEReport() {
    const yr = document.getElementById('topAEYear').value || CURRENT_YEAR;
    const mo = document.getElementById('topAEMonth').value;
    const mu = document.getElementById('topAEMuni').value;

    // Group by Establishment
    const estMap = {};
    aeRecords.forEach(r => {
        if (r.year != yr) return;
        if (mo !== 'ALL' && r.month != mo) return;
        if (mu !== 'ALL' && r.municipality !== mu) return;

        const key = `${r.establishment}||${r.municipality}`;
        if (!estMap[key]) {
            estMap[key] = { establishment: r.establishment, municipality: r.municipality, type: r.type_class || 'N/A', count: 0 };
        }
        estMap[key].count += Number(r.total_lf || 0);
    });

    const sorted = Object.values(estMap).sort((a,b) => b.count - a.count).slice(0, 10);
    const tbody = document.getElementById('topAEBody');
    tbody.innerHTML = '';

    if (!sorted.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">No data found for selected period.</td></tr>`;
    } else {
        sorted.forEach((item, idx) => {
            const badgeClass = idx === 0 ? 'bg-amber-100 text-amber-800 font-bold' : (idx === 1 ? 'bg-slate-200 text-slate-700' : (idx === 2 ? 'bg-amber-700/20 text-amber-900' : 'bg-slate-100 text-slate-600'));
            tbody.innerHTML += `<tr class="hover:bg-slate-50 border-b">
                        <td class="p-3 text-center"><span class="px-2 py-1 rounded-full text-xs ${badgeClass}">#${idx+1}</span></td>
                        <td class="p-3 font-bold text-slate-800">${item.establishment}</td>
                        <td class="p-3">${item.municipality}</td>
                        <td class="p-3 text-slate-500">${item.type}</td>
                        <td class="p-3 text-right font-extrabold text-teal-700 text-sm">${item.count.toLocaleString()}</td>
                    </tr>`;
        });
    }

    // Top AE Doughnut Chart
    const ctx = document.getElementById('chartTopAE').getContext('2d');
    if (chartTopAEObj) chartTopAEObj.destroy();
    chartTopAEObj = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: sorted.map(x => x.establishment),
            datasets: [{
                data: sorted.map(x => x.count),
                backgroundColor: ['#0f766e', '#14b8a6', '#2dd4bf', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa', '#c084fc', '#f472b6', '#fb7185']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

/**
 * SECTION 8: TOP 10 TOURIST ATTRACTIONS RANKINGS
 */
function renderTopTAssReport() {
    const yr = document.getElementById('topTAssYear').value || CURRENT_YEAR;
    const mo = document.getElementById('topTAssMonth').value;
    const mu = document.getElementById('topTAssMuni').value;

    const attrMap = {};
    tassRecords.forEach(r => {
        if (r.year != yr) return;
        if (mo !== 'ALL' && r.month != mo) return;
        if (mu !== 'ALL' && r.municipality !== mu) return;

        const key = `${r.attraction}||${r.municipality}`;
        if (!attrMap[key]) {
            attrMap[key] = { attraction: r.attraction, municipality: r.municipality, count: 0 };
        }
        attrMap[key].count += Number(r.grand_total || 0);
    });

    const sorted = Object.values(attrMap).sort((a,b) => b.count - a.count).slice(0, 10);
    const tbody = document.getElementById('topTAssBody');
    tbody.innerHTML = '';

    if (!sorted.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400">No attraction data found for selected period.</td></tr>`;
    } else {
        sorted.forEach((item, idx) => {
            const badgeClass = idx === 0 ? 'bg-amber-100 text-amber-800 font-bold' : (idx === 1 ? 'bg-slate-200 text-slate-700' : (idx === 2 ? 'bg-amber-700/20 text-amber-900' : 'bg-slate-100 text-slate-600'));
            tbody.innerHTML += `<tr class="hover:bg-slate-50 border-b">
                        <td class="p-3 text-center"><span class="px-2 py-1 rounded-full text-xs ${badgeClass}">#${idx+1}</span></td>
                        <td class="p-3 font-bold text-slate-800">${item.attraction}</td>
                        <td class="p-3">${item.municipality}</td>
                        <td class="p-3 text-right font-extrabold text-teal-700 text-sm">${item.count.toLocaleString()}</td>
                    </tr>`;
        });
    }

    // Top TAss Pie Chart
    const ctx = document.getElementById('chartTopTAss').getContext('2d');
    if (chartTopTAssObj) chartTopTAssObj.destroy();
    chartTopTAssObj = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: sorted.map(x => x.attraction),
            datasets: [{
                data: sorted.map(x => x.count),
                backgroundColor: ['#0d9488', '#06b6d4', '#0284c7', '#2563eb', '#4f46e5', '#7c3aed', '#9333ea', '#c026d3', '#db2777', '#e11d48']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

/**
 * SECTION 8B: TOP MUNICIPALITIES REPORT (per-year + overall all-years ranking)
 */
const TOP_MUNI_METRIC_LABELS = {
    combined: 'combined AEs + TAss visitor volume',
    ae: 'Tourist Arrivals (AEs)',
    tass: 'Same-Day Visitors (TAss)'
};

function getMuniCombinedMap(yr, metric = 'combined') {
    // yr === null means aggregate across every saved year (overall/all-years ranking)
    const map = {};
    aeRecords.forEach(r => {
        if (yr !== null && r.year != yr) return;
        const m = r.municipality || 'Unspecified';
        if (!map[m]) map[m] = { municipality: m, ae: 0, tass: 0 };
        map[m].ae += Number(r.total_lf || 0);
    });
    tassRecords.forEach(r => {
        if (yr !== null && r.year != yr) return;
        const m = r.municipality || 'Unspecified';
        if (!map[m]) map[m] = { municipality: m, ae: 0, tass: 0 };
        map[m].tass += Number(r.grand_total || 0);
    });
    return Object.values(map)
        .map(x => ({ ...x, combined: x.ae + x.tass }))
        .sort((a, b) => b[metric] - a[metric]);
}

function renderTopMunicipalitiesReport() {
    const yr = document.getElementById('topMuniYear').value || CURRENT_YEAR;
    const metric = document.getElementById('topMuniMetric').value || 'combined';
    const yearFilter = (yr === 'ALL') ? null : yr;
    document.getElementById('topMuniYearLbl').innerText = (yr === 'ALL') ? 'All Years' : yr;
    document.getElementById('topMuniMetricLbl').innerText = TOP_MUNI_METRIC_LABELS[metric];
    document.getElementById('topMuniMetricLblOverall').innerText = TOP_MUNI_METRIC_LABELS[metric];

    // Highlight whichever column is the active ranking metric
    const colAE = document.getElementById('topMuniColAE');
    const colTAss = document.getElementById('topMuniColTAss');
    const colCombined = document.getElementById('topMuniColCombined');
    [colAE, colTAss, colCombined].forEach(el => el.classList.remove('bg-amber-600/40'));
    (metric === 'ae' ? colAE : metric === 'tass' ? colTAss : colCombined).classList.add('bg-amber-600/40');
    const activeTdClass = { ae: 'p-3 text-right font-extrabold text-teal-700 text-sm', tass: 'p-3 text-right font-extrabold text-teal-700 text-sm', combined: 'p-3 text-right font-extrabold text-teal-700 text-sm' };

    // --- Table 1: selected year (or All Years) ranking ---
    const yearRanked = getMuniCombinedMap(yearFilter, metric);
    const yearBody = document.getElementById('topMuniYearBody');
    yearBody.innerHTML = '';
    if (!yearRanked.length) {
        yearBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">No data found for ${(yr === 'ALL') ? 'any year' : yr}.</td></tr>`;
    } else {
        yearRanked.forEach((item, idx) => {
            const badgeClass = idx === 0 ? 'bg-amber-100 text-amber-800 font-bold' : (idx === 1 ? 'bg-slate-200 text-slate-700' : (idx === 2 ? 'bg-amber-700/20 text-amber-900' : 'bg-slate-100 text-slate-600'));
            yearBody.innerHTML += `<tr class="hover:bg-slate-50 border-b">
                        <td class="p-3 text-center"><span class="px-2 py-1 rounded-full text-xs ${badgeClass}">#${idx + 1}</span></td>
                        <td class="p-3 font-bold text-slate-800">${item.municipality}</td>
                        <td class="${metric === 'ae' ? activeTdClass.ae : 'p-3 text-right'}">${item.ae.toLocaleString()}</td>
                        <td class="${metric === 'tass' ? activeTdClass.tass : 'p-3 text-right'}">${item.tass.toLocaleString()}</td>
                        <td class="${metric === 'combined' ? activeTdClass.combined : 'p-3 text-right font-bold text-amber-800'}">${item.combined.toLocaleString()}</td>
                    </tr>`;
        });
    }

    // Chart for the selected year (reflects the active metric), labeled per municipality
    const ctx = document.getElementById('chartTopMuniYear').getContext('2d');
    if (chartTopMuniYearObj) chartTopMuniYearObj.destroy();
    const top10 = yearRanked.slice(0, 10);
    const muniColors = ['#0f766e', '#14b8a6', '#2dd4bf', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa', '#c084fc', '#f472b6', '#fb7185'];
    const hasDataLabels = (typeof ChartDataLabels !== 'undefined');
    // Denominators for percentage-of-all-municipalities (not just the Top 10 shown), for the currently selected year/All-Years filter
    const allMuniMetricTotal = yearRanked.reduce((sum, x) => sum + x[metric], 0);
    const allMuniAETotal = yearRanked.reduce((sum, x) => sum + x.ae, 0);
    const allMuniTAssTotal = yearRanked.reduce((sum, x) => sum + x.tass, 0);
    chartTopMuniYearObj = new Chart(ctx, {
        type: 'doughnut',
        plugins: hasDataLabels ? [ChartDataLabels] : [],
        data: {
            labels: top10.map(x => x.municipality),
            datasets: [{
                data: top10.map(x => x[metric]),
                backgroundColor: muniColors
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'right', labels: { boxWidth: 12, font: { size: 10 } } },
                tooltip: {
                    callbacks: {
                        label: function(ctxItem) {
                            const val = ctxItem.parsed || 0;
                            const pct = allMuniMetricTotal > 0 ? ((val / allMuniMetricTotal) * 100).toFixed(1) : 0;
                            return `${ctxItem.label}: ${val.toLocaleString()} (${pct}% of all municipalities)`;
                        }
                    }
                },
                datalabels: hasDataLabels ? {
                    color: '#fff',
                    font: { weight: 'bold', size: 9 },
                    textStrokeColor: 'rgba(0,0,0,0.35)',
                    textStrokeWidth: 2,
                    formatter: (value) => {
                        const pct = allMuniMetricTotal > 0 ? (value / allMuniMetricTotal) * 100 : 0;
                        return pct.toFixed(1) + '%';
                    }
                } : undefined
            }
        }
    });

    // Two independently-ranked horizontal bar charts: Top 10 by AEs, and Top 10 by TAss (each its own ranking, for the selected year)
    const top10ByAE = [...yearRanked].sort((a, b) => b.ae - a.ae).slice(0, 11);
    const top10ByTAss = [...yearRanked].sort((a, b) => b.tass - a.tass).slice(0, 11);

    const ctxBarAE = document.getElementById('chartTopMuniBarAE').getContext('2d');
    if (chartTopMuniBarAEObj) chartTopMuniBarAEObj.destroy();
    chartTopMuniBarAEObj = new Chart(ctxBarAE, {
        type: 'bar',
        plugins: hasDataLabels ? [ChartDataLabels] : [],
        data: {
            labels: top10ByAE.map(x => x.municipality),
            datasets: [{ label: 'Tourist Arrivals (AEs)', data: top10ByAE.map(x => x.ae), backgroundColor: '#3b82f6' }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(ctxItem) {
                            const val = ctxItem.parsed.x || 0;
                            const pct = allMuniAETotal > 0 ? ((val / allMuniAETotal) * 100).toFixed(1) : 0;
                            return `AEs: ${val.toLocaleString()} (${pct}% of all municipalities)`;
                        }
                    }
                },
                datalabels: hasDataLabels ? {
                    color: '#1e3a8a',
                    anchor: 'end',
                    align: 'end',
                    font: { weight: 'bold', size: 9 },
                    formatter: (value) => {
                        const pct = allMuniAETotal > 0 ? (value / allMuniAETotal) * 100 : 0;
                        return pct.toFixed(1) + '%';
                    }
                } : undefined
            }
        }
    });

    const ctxBarTAss = document.getElementById('chartTopMuniBarTAss').getContext('2d');
    if (chartTopMuniBarTAssObj) chartTopMuniBarTAssObj.destroy();
    chartTopMuniBarTAssObj = new Chart(ctxBarTAss, {
        type: 'bar',
        plugins: hasDataLabels ? [ChartDataLabels] : [],
        data: {
            labels: top10ByTAss.map(x => x.municipality),
            datasets: [{ label: 'Same-Day Visitors (TAss)', data: top10ByTAss.map(x => x.tass), backgroundColor: '#14b8a6' }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(ctxItem) {
                            const val = ctxItem.parsed.x || 0;
                            const pct = allMuniTAssTotal > 0 ? ((val / allMuniTAssTotal) * 100).toFixed(1) : 0;
                            return `TAss: ${val.toLocaleString()} (${pct}% of all municipalities)`;
                        }
                    }
                },
                datalabels: hasDataLabels ? {
                    color: '#0f766e',
                    anchor: 'end',
                    align: 'end',
                    font: { weight: 'bold', size: 9 },
                    formatter: (value) => {
                        const pct = allMuniTAssTotal > 0 ? (value / allMuniTAssTotal) * 100 : 0;
                        return pct.toFixed(1) + '%';
                    }
                } : undefined
            }
        }
    });

    // --- Table 2: overall ranking across all saved years ---
    const overallRanked = getMuniCombinedMap(null, metric);
    const overallBody = document.getElementById('topMuniOverallBody');
    overallBody.innerHTML = '';
    if (!overallRanked.length) {
        overallBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">No data saved yet.</td></tr>`;
    } else {
        overallRanked.forEach((item, idx) => {
            const badgeClass = idx === 0 ? 'bg-amber-100 text-amber-800 font-bold' : (idx === 1 ? 'bg-slate-200 text-slate-700' : (idx === 2 ? 'bg-amber-700/20 text-amber-900' : 'bg-slate-100 text-slate-600'));
            overallBody.innerHTML += `<tr class="hover:bg-slate-50 border-b">
                        <td class="p-3 text-center"><span class="px-2 py-1 rounded-full text-xs ${badgeClass}">#${idx + 1}</span></td>
                        <td class="p-3 font-bold text-slate-800">${item.municipality}</td>
                        <td class="p-3 text-right">${item.ae.toLocaleString()}</td>
                        <td class="p-3 text-right">${item.tass.toLocaleString()}</td>
                        <td class="p-3 text-right font-extrabold text-amber-700 text-sm">${item.combined.toLocaleString()}</td>
                    </tr>`;
        });
    }
}

function exportTopMunicipalitiesExcel() { if (!requireAdmin('download data')) return;
    const yr = document.getElementById('topMuniYear').value || CURRENT_YEAR;
    const metric = document.getElementById('topMuniMetric').value || 'combined';
    const metricLabel = TOP_MUNI_METRIC_LABELS[metric];
    const yearFilter = (yr === 'ALL') ? null : yr;
    const yrLabel = (yr === 'ALL') ? 'All Years' : yr;
    const yearRanked = getMuniCombinedMap(yearFilter, metric).map((x, i) => [i + 1, x.municipality, x.ae, x.tass, x.combined]);
    const overallRanked = getMuniCombinedMap(null, metric).map((x, i) => [i + 1, x.municipality, x.ae, x.tass, x.combined]);

    const wb = XLSX.utils.book_new();

    const wsYear = XLSX.utils.aoa_to_sheet([
        ["PROVINCIAL GOVERNMENT OF OCCIDENTAL MINDORO"],
        ["TOP MUNICIPALITIES BY VISITOR ARRIVALS"],
        [`Reporting Year: ${yrLabel} | Ranked by: ${metricLabel}`],
        ["Rank", "Municipality", "Tourist Arrivals (AEs)", "Same-Day Visitors (TAss)", "Combined Total"],
        ...yearRanked
    ]);
    wsYear['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }, { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } }];
    wsYear['A1'].s = excelTitleStyle(); wsYear['A2'].s = excelTitleStyle(); wsYear['A3'].s = EXCEL_SUBTITLE_FONT;
    styleHeaderRow(wsYear, 3); styleDataNumbers(wsYear, [0, 2, 3, 4], 4);
    wsYear['!freeze'] = { xSplit: 0, ySplit: 4 }; autoWidth(wsYear, 12, 32);
    XLSX.utils.book_append_sheet(wb, wsYear, `Top Municipalities ${yrLabel}`.substring(0, 31));

    const wsAll = XLSX.utils.aoa_to_sheet([
        ["PROVINCIAL GOVERNMENT OF OCCIDENTAL MINDORO"],
        ["OVERALL RANKING BY TOTAL VISITOR VOLUME (ALL YEARS)"],
        [`Ranked by: ${metricLabel} | Generated: ${new Date().toLocaleDateString()}`],
        ["Rank", "Municipality", "Total Tourist Arrivals (AEs)", "Total Same-Day Visitors (TAss)", "Grand Total (All Years)"],
        ...overallRanked
    ]);
    wsAll['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }, { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } }];
    wsAll['A1'].s = excelTitleStyle(); wsAll['A2'].s = excelTitleStyle(); wsAll['A3'].s = EXCEL_SUBTITLE_FONT;
    styleHeaderRow(wsAll, 3); styleDataNumbers(wsAll, [0, 2, 3, 4], 4);
    wsAll['!freeze'] = { xSplit: 0, ySplit: 4 }; autoWidth(wsAll, 12, 32);
    XLSX.utils.book_append_sheet(wb, wsAll, "Overall All-Years Ranking");

    saveWorkbook(wb, `Top_Municipalities_${yr}_and_Overall.xlsx`);
}

function getTopAERows() {
    const yr=document.getElementById('topAEYear').value|| CURRENT_YEAR,mo=document.getElementById('topAEMonth').value,mu=document.getElementById('topAEMuni').value;
    const estMap={};
    aeRecords.forEach(r=>{
        if(r.year!=yr)return;if(mo!=='ALL'&&r.month!=mo)return;if(mu!=='ALL'&&r.municipality!==mu)return;
        const key=`${r.establishment}||${r.municipality}`;
        if(!estMap[key])estMap[key]={establishment:r.establishment,municipality:r.municipality,type:r.type_class||'N/A',count:0};
        estMap[key].count+=Number(r.total_lf||0);
    });
    return Object.values(estMap).sort((a,b)=>b.count-a.count).slice(0,10);
}

function exportTopAEExcel() { if (!requireAdmin('download data')) return;
    const yr=document.getElementById('topAEYear').value|| CURRENT_YEAR,mo=document.getElementById('topAEMonth').value,mu=document.getElementById('topAEMuni').value;
    const wb=XLSX.utils.book_new();
    const rows=getTopAERows().map((x,i)=>[i+1,x.establishment,x.municipality,x.type,x.count]);
    const ws=XLSX.utils.aoa_to_sheet([["PROVINCIAL GOVERNMENT OF OCCIDENTAL MINDORO"],["TOP 10 ACCOMMODATION ESTABLISHMENTS"],[`Year: ${yr} | Month: ${mo==='ALL'?'Entire Year':MONTH_NAMES[mo-1]} | Scope: ${mu==='ALL'?'All Municipalities':mu}`],["Rank","Accommodation Establishment","Municipality","Type / Class","Tourist Arrivals"],...rows]);
    ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:4}},{s:{r:1,c:0},e:{r:1,c:4}},{s:{r:2,c:0},e:{r:2,c:4}}];ws['A1'].s=excelTitleStyle();ws['A2'].s=excelTitleStyle();ws['A3'].s=EXCEL_SUBTITLE_FONT;styleHeaderRow(ws,3);styleDataNumbers(ws,[0,4],4);ws['!freeze']={xSplit:0,ySplit:4};autoWidth(ws,12,35);XLSX.utils.book_append_sheet(wb,ws,"Top 10 AEs");saveWorkbook(wb,`Top10_Accommodation_Establishments_${yr}.xlsx`);
}

function getTopTAssRows() {
    const yr=document.getElementById('topTAssYear').value|| CURRENT_YEAR,mo=document.getElementById('topTAssMonth').value,mu=document.getElementById('topTAssMuni').value;
    const map={};
    tassRecords.forEach(r=>{
        if(r.year!=yr)return;if(mo!=='ALL'&&r.month!=mo)return;if(mu!=='ALL'&&r.municipality!==mu)return;
        const key=`${r.attraction}||${r.municipality}`;
        if(!map[key])map[key]={attraction:r.attraction,municipality:r.municipality,count:0};
        map[key].count+=Number(r.grand_total||0);
    });
    return Object.values(map).sort((a,b)=>b.count-a.count).slice(0,10);
}

function exportTopTAssExcel() { if (!requireAdmin('download data')) return;
    const yr=document.getElementById('topTAssYear').value|| CURRENT_YEAR,mo=document.getElementById('topTAssMonth').value,mu=document.getElementById('topTAssMuni').value;
    const wb=XLSX.utils.book_new();
    const rows=getTopTAssRows().map((x,i)=>[i+1,x.attraction,x.municipality,x.count]);
    const ws=XLSX.utils.aoa_to_sheet([["PROVINCIAL GOVERNMENT OF OCCIDENTAL MINDORO"],["TOP 10 TOURIST ATTRACTIONS"],[`Year: ${yr} | Month: ${mo==='ALL'?'Entire Year':MONTH_NAMES[mo-1]} | Scope: ${mu==='ALL'?'All Municipalities':mu}`],["Rank","Tourist Attraction","Municipality","Same-Day Visitors"],...rows]);
    ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:3}},{s:{r:1,c:0},e:{r:1,c:3}},{s:{r:2,c:0},e:{r:2,c:3}}];ws['A1'].s=excelTitleStyle();ws['A2'].s=excelTitleStyle();ws['A3'].s=EXCEL_SUBTITLE_FONT;styleHeaderRow(ws,3);styleDataNumbers(ws,[0,3],4);ws['!freeze']={xSplit:0,ySplit:4};autoWidth(ws,12,35);XLSX.utils.book_append_sheet(wb,ws,"Top 10 TAss");saveWorkbook(wb,`Top10_Tourist_Attractions_${yr}.xlsx`);
}

// ##############################################################################
// ##### SECTION: COUNTRY-ORIGIN
// ##############################################################################

/**
 * REPORTS - COUNTRY OF ORIGIN (Form A): import, local/cloud storage, ranked report, Excel export.
 */

function persistCountryRecordsToLocalStorage() {
    try { localStorage.setItem(COUNTRY_LS_KEY, JSON.stringify(countryRecords)); } catch (_) { /* storage unavailable */ }
}

function loadCountryRecordsFromLocalStorage() {
    try {
        const raw = localStorage.getItem(COUNTRY_LS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (_) { return []; }
}

function countryDocId(year, country) {
    return `${year}__${country}`.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").slice(0, 500);
}

async function loadCountryRecordsLocal() {
    let fromDb = [];
    if (db && db.objectStoreNames.contains("countries")) {
        try { fromDb = await getAllFromStore("countries"); } catch (err) { console.error("Country IndexedDB read failed:", err); fromDb = []; }
    }
    if (fromDb && fromDb.length) {
        countryRecords = fromDb;
        persistCountryRecordsToLocalStorage();
        return;
    }
    // IndexedDB unavailable or empty - fall back to the localStorage mirror
    countryRecords = loadCountryRecordsFromLocalStorage();
}

async function syncCountryRecordsFromCloud() {
    try {
        await loadCountryRecordsLocal();
        if (!window.cloudReadyPromise) return;
        await window.cloudReadyPromise;
        if (!window.cloudDB || !window.cloudFns) return;
        const { collection, getDocs } = window.cloudFns;
        const snap = await getDocs(collection(window.cloudDB, CLOUD_COUNTRY_COLLECTION));
        if (!snap.docs.length) return;
        const cloudRecords = snap.docs.map(d => { const c = { ...d.data() }; delete c.cloudUpdatedAt; return c; });
        if (db && db.objectStoreNames.contains("countries")) {
            await clearAndBulkPut("countries", cloudRecords);
        }
        countryRecords = cloudRecords;
        persistCountryRecordsToLocalStorage();
    } catch (err) {
        console.error("Country records cloud sync failed, using local cache:", err);
    }
}

async function saveCountryYearToCloud(year, records, fileName) {
    await waitForCloud();
    const { collection, doc, writeBatch, query, where, getDocs } = window.cloudFns;
    // Remove old cloud docs for this year and any from a prior import of the same file name
    const q1 = query(collection(window.cloudDB, CLOUD_COUNTRY_COLLECTION), where("year", "==", year));
    const snap1 = await getDocs(q1);
    const q2 = query(collection(window.cloudDB, CLOUD_COUNTRY_COLLECTION), where("sourceFile", "==", fileName));
    const snap2 = await getDocs(q2);
    const toDelete = new Map();
    [...snap1.docs, ...snap2.docs].forEach(d => toDelete.set(d.ref.path, d.ref));
    const delRefs = Array.from(toDelete.values());
    for (let i = 0; i < delRefs.length; i += 450) {
        const batch = writeBatch(window.cloudDB);
        delRefs.slice(i, i + 450).forEach(ref => batch.delete(ref));
        await batch.commit();
    }

    for (let i = 0; i < records.length; i += 450) {
        const batch = writeBatch(window.cloudDB);
        records.slice(i, i + 450).forEach(r => {
            batch.set(doc(collection(window.cloudDB, CLOUD_COUNTRY_COLLECTION), countryDocId(r.year, r.country)), {
                ...r,
                cloudUpdatedAt: new Date().toISOString()
            });
        });
        await batch.commit();
    }
}

/**
 * SECTION 8C: COUNTRY OF ORIGIN (FORM A IMPORT) — parsing, report, export
 */
const COUNTRY_MONTH_KEYS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

const COUNTRY_STOPLIST = new Set([
    'SUB-TOTAL', 'TOTAL PHILIPPINE RESIDENTS', 'TOTAL NON-PHILIPPINE RESIDENTS',
    'TOTAL OVERSEAS FILIPINO', 'TOTAL GUEST WITH UNIDENTIFIED RESIDENCE',
    'GRAND TOTAL GUEST ARRIVALS', 'FILIPINO NATIONALITY', 'FOREIGN NATIONALITY',
    'NO ENCODED COUNTRY OF RESIDENCE', 'UNSPECIFIED', 'PHILIPPINE RESIDENTS', 'NON-PHILIPPINE RESIDENTS'
]);

function populateCountryYearSelect() {
    const select = document.getElementById('countryYear');
    if (!select) return;
    const years = new Set();
    countryRecords.forEach(r => { if (r.year) years.add(Number(r.year)); });
    const sorted = Array.from(years).sort((a, b) => b - a);
    const currVal = select.value;
    let html = '<option value="ALL">All Years</option>';
    sorted.forEach(y => { html += `<option value="${y}">${y}</option>`; });
    select.innerHTML = html;
    if (currVal && select.querySelector(`option[value="${currVal}"]`)) select.value = currVal;
}

async function importCountryFile() {
    if (!requireAdmin('import Form A data')) return;
    const fileInput = document.getElementById('countryFileInput');
    const yearInput = document.getElementById('countryImportYear');
    const file = fileInput.files && fileInput.files[0];
    const year = parseInt(yearInput.value, 10);

    if (!file) { showToast('Please choose an Excel (.xlsx) file to import.', 'error'); return; }
    if (!year || year < 2000 || year > 2100) { showToast('Please enter a valid reporting year.', 'error'); return; }

    try {
        const rows = await readExcelFile(file);
        const parsed = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            const rawLabel = row[0];
            if (rawLabel === undefined || rawLabel === null || typeof rawLabel !== 'string') continue;
            const label = rawLabel.toString().trim();
            if (!label) continue;
            if (COUNTRY_STOPLIST.has(label.toUpperCase())) continue;

            const monthly = row.slice(1, 13);
            const total = row[13];
            const isBlank = v => v === '' || v === undefined || v === null;
            if (monthly.length < 12 || monthly.some(isBlank) || isBlank(total)) continue; // region/section header row

            const rec = { country: label };
            COUNTRY_MONTH_KEYS.forEach((key, idx) => { rec[key] = Number(monthly[idx]) || 0; });
            rec.total = Number(total) || COUNTRY_MONTH_KEYS.reduce((sum, k) => sum + rec[k], 0);
            parsed.push(rec);
        }

        if (!parsed.length) {
            showToast('No country rows were found in this file. Please check that it matches the Form A layout.', 'error');
            return;
        }

        const newRecords = parsed.map(p => ({
            ...p, year, sourceFile: file.name, importedAt: new Date().toISOString()
        }));

        // Overwrite rule: same year OR same source file name replaces prior data
        const kept = countryRecords.filter(r => Number(r.year) !== year && r.sourceFile !== file.name);
        const merged = [...kept, ...newRecords];

        let dbWriteOk = false;
        if (db && db.objectStoreNames.contains('countries')) {
            try {
                await clearAndBulkPut('countries', merged);
                dbWriteOk = true;
            } catch (dbErr) {
                console.error('Country IndexedDB write failed:', dbErr);
            }
        }

        if (dbWriteOk) {
            await loadCountryRecordsLocal();
        } else {
            // IndexedDB unavailable this session - the localStorage mirror still
            // guarantees the import survives a refresh instead of vanishing.
            countryRecords = merged;
            persistCountryRecordsToLocalStorage();
        }

        try {
            await saveCountryYearToCloud(year, newRecords, file.name);
        } catch (cloudErr) {
            console.error('Country cloud sync failed, saved locally only:', cloudErr);
            showToast('Imported and saved on this device, but cloud sync failed for this upload.', 'info');
        }

        fileInput.value = '';
        yearInput.value = '';
        populateCountryYearSelect();
        document.getElementById('countryYear').value = String(year);
        renderCountryReport();
        showToast(`Imported ${newRecords.length} countries for ${year}.`, 'success');
    } catch (err) {
        console.error(err);
        showToast('Failed to read that file. Please check it is a valid Form A .xlsx export.', 'error');
    }
}

function getCountryRankedList(yr) {
    const rows = (yr === 'ALL') ? countryRecords : countryRecords.filter(r => String(r.year) === String(yr));
    const map = {};
    rows.forEach(r => {
        if (!map[r.country]) map[r.country] = { country: r.country, total: 0 };
        map[r.country].total += Number(r.total || 0);
    });
    return Object.values(map).sort((a, b) => b.total - a.total);
}

function renderCountryReport() {
    const select = document.getElementById('countryYear');
    if (!select) return;
    const yr = select.value || 'ALL';
    document.getElementById('countryYearLbl').innerText = (yr === 'ALL') ? 'All Years' : yr;

    const ranked = getCountryRankedList(yr);
    const grandTotal = ranked.reduce((sum, x) => sum + x.total, 0);
    const tbody = document.getElementById('countryTableBody');
    tbody.innerHTML = '';
    if (!ranked.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400">No Form A data imported yet. Use the import panel above.</td></tr>`;
    } else {
        ranked.forEach((item, idx) => {
            const pct = grandTotal > 0 ? ((item.total / grandTotal) * 100).toFixed(1) : '0.0';
            const badgeClass = idx === 0 ? 'bg-amber-100 text-amber-800 font-bold' : (idx === 1 ? 'bg-slate-200 text-slate-700' : (idx === 2 ? 'bg-amber-700/20 text-amber-900' : 'bg-slate-100 text-slate-600'));
            tbody.innerHTML += `<tr class="hover:bg-slate-50 border-b">
                        <td class="p-3 text-center"><span class="px-2 py-1 rounded-full text-xs ${badgeClass}">#${idx + 1}</span></td>
                        <td class="p-3 font-bold text-slate-800">${item.country}</td>
                        <td class="p-3 text-right">${item.total.toLocaleString()}</td>
                        <td class="p-3 text-right font-extrabold text-amber-700 text-sm">${pct}%</td>
                    </tr>`;
        });
    }

    const top10 = ranked.slice(0, 10);
    const hasDL = (typeof ChartDataLabels !== 'undefined');
    const countryColors = ['#0f766e', '#14b8a6', '#2dd4bf', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa', '#c084fc', '#f472b6', '#fb7185'];

    const ctxPie = document.getElementById('chartCountryPie').getContext('2d');
    if (chartCountryPieObj) chartCountryPieObj.destroy();
    chartCountryPieObj = new Chart(ctxPie, {
        type: 'doughnut',
        plugins: hasDL ? [ChartDataLabels] : [],
        data: {
            labels: top10.map(x => x.country),
            datasets: [{ data: top10.map(x => x.total), backgroundColor: countryColors }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true, position: 'right', labels: { boxWidth: 12, font: { size: 10 } } },
                tooltip: {
                    callbacks: {
                        label: function(ctxItem) {
                            const val = ctxItem.parsed || 0;
                            const pct = grandTotal > 0 ? ((val / grandTotal) * 100).toFixed(1) : 0;
                            return `${ctxItem.label}: ${val.toLocaleString()} (${pct}% of all countries)`;
                        }
                    }
                },
                datalabels: hasDL ? {
                    color: '#fff',
                    font: { weight: 'bold', size: 9 },
                    textStrokeColor: 'rgba(0,0,0,0.35)',
                    textStrokeWidth: 2,
                    formatter: (value) => {
                        const pct = grandTotal > 0 ? (value / grandTotal) * 100 : 0;
                        return pct.toFixed(1) + '%';
                    }
                } : undefined
            }
        }
    });

    const ctxBar = document.getElementById('chartCountryBar').getContext('2d');
    if (chartCountryBarObj) chartCountryBarObj.destroy();
    chartCountryBarObj = new Chart(ctxBar, {
        type: 'bar',
        plugins: hasDL ? [ChartDataLabels] : [],
        data: {
            labels: top10.map(x => x.country),
            datasets: [{ label: 'Visitor Arrivals', data: top10.map(x => x.total), backgroundColor: '#0f766e' }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(ctxItem) {
                            const val = ctxItem.parsed.x || 0;
                            const pct = grandTotal > 0 ? ((val / grandTotal) * 100).toFixed(1) : 0;
                            return `${val.toLocaleString()} (${pct}% of all countries)`;
                        }
                    }
                },
                datalabels: hasDL ? {
                    color: '#1e3a8a',
                    anchor: 'end',
                    align: 'end',
                    font: { weight: 'bold', size: 9 },
                    formatter: (value) => {
                        const pct = grandTotal > 0 ? (value / grandTotal) * 100 : 0;
                        return pct.toFixed(1) + '%';
                    }
                } : undefined
            }
        }
    });
}

function exportCountryExcel() { if (!requireAdmin('download data')) return;
    const yr = document.getElementById('countryYear').value || 'ALL';
    const yrLabel = (yr === 'ALL') ? 'All Years' : yr;
    const ranked = getCountryRankedList(yr);
    const grandTotal = ranked.reduce((sum, x) => sum + x.total, 0);
    const rows = ranked.map((x, i) => [i + 1, x.country, x.total, grandTotal > 0 ? Number(((x.total / grandTotal) * 100).toFixed(1)) : 0]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
        ["PROVINCIAL GOVERNMENT OF OCCIDENTAL MINDORO"],
        ["DISTRIBUTION OF TRAVELERS PER COUNTRY (FORM A)"],
        [`Reporting Period: ${yrLabel} | Generated: ${new Date().toLocaleDateString()}`],
        ["Rank", "Country", "Total Arrivals", "% Share"],
        ...rows
    ]);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } }, { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } }];
    ws['A1'].s = excelTitleStyle(); ws['A2'].s = excelTitleStyle(); ws['A3'].s = EXCEL_SUBTITLE_FONT;
    styleHeaderRow(ws, 3); styleDataNumbers(ws, [0, 2, 3], 4);
    ws['!freeze'] = { xSplit: 0, ySplit: 4 }; autoWidth(ws, 12, 34);
    XLSX.utils.book_append_sheet(wb, ws, `Countries ${yrLabel}`.substring(0, 31));
    saveWorkbook(wb, `Country_Distribution_${yrLabel}.xlsx`);
}

// ##############################################################################
// ##### SECTION: COMPARISON
// ##############################################################################

/**
 * TREND COMPARISON: compare ONE OR MORE years (e.g. 2024, 2025, 2026), by month or by year,
 * for Tourist Arrivals (AEs), Same-Day Visitors (TAss), or both - optionally limited to a
 * month range (e.g. Jan-Jun of every selected year).
 * Trend = the latest selected year compared with the year before it; with 3+ years every
 * consecutive pair (2025 vs 2024, 2026 vs 2025, ...) is shown.
 */

const CMP_SHORT = { ae: 'AEs', tass: 'TAss', combined: 'Combined' };
const CMP_LABELS = { ae: 'Tourist Arrivals (AEs)', tass: 'Same-Day Visitors (TAss)', combined: 'Combined Visitors' };
const CMP_PALETTE = ['#f59e0b', '#0f766e', '#3b82f6', '#db2777', '#7c3aed', '#dc2626', '#0284c7', '#65a30d', '#9333ea', '#059669'];
const cmpCharts = {};
let cmpExportData = null;
let cmpBreakExport = null;

function cmpEl(id) { return document.getElementById(id); }
function cmpEsc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function cmpSigned(n) { return (n > 0 ? '+' : '') + n.toLocaleString(); }
function cmpColor(years, y) { return CMP_PALETTE[years.indexOf(y) % CMP_PALETTE.length]; }
function cmpPairs(years) { const p = []; for (let i = 1; i < years.length; i++) p.push([years[i - 1], years[i]]); return p; }

/** Years ticked in the "Years" box, oldest first. */
function cmpSelectedYears() {
    return Array.from(document.querySelectorAll('.cmp-year-cb')).filter(c => c.checked).map(c => Number(c.value)).sort((a, b) => a - b);
}

/** Month range chosen (0-based indexes, always low..high). */
function cmpMonthRange() {
    const f = Number(cmpEl('cmpMonthFrom').value) || 1, t = Number(cmpEl('cmpMonthTo').value) || 12;
    const lo = Math.min(f, t) - 1, hi = Math.max(f, t) - 1;
    const idxs = []; for (let i = lo; i <= hi; i++) idxs.push(i);
    const full = lo === 0 && hi === 11;
    const label = full ? 'All months' : (lo === hi ? MONTH_NAMES[lo] : `${MONTH_NAMES[lo].substring(0, 3)}–${MONTH_NAMES[hi].substring(0, 3)}`);
    return { lo, hi, idxs, full, label };
}

/** Fill the year tick-boxes, municipality list and the stacked-graph year from the saved data. */
function populateCompareControls() {
    const box = cmpEl('cmpYearBox'), mu = cmpEl('cmpMuni');
    if (!box || !mu) return;
    const years = new Set(), munis = new Set();
    aeRecords.concat(tassRecords).forEach(r => {
        if (r.year) years.add(Number(r.year));
        if (r.municipality) munis.add(r.municipality);
    });
    const sy = Array.from(years).sort((a, b) => b - a);

    const existing = box.querySelectorAll('.cmp-year-cb');
    const hadBoxes = existing.length > 0;
    const prev = new Set(Array.from(existing).filter(c => c.checked).map(c => Number(c.value)));
    const defaults = new Set(sy.slice(0, 2)); // first time: latest two years
    box.innerHTML = sy.length
        ? sy.map(y => `<label class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer"><input type="checkbox" class="cmp-year-cb rounded border-slate-300" value="${y}" ${(hadBoxes ? prev.has(y) : defaults.has(y)) ? 'checked' : ''} onchange="renderComparison()"> ${y}</label>`).join('')
        : '<span class="text-xs text-slate-400">No data yet</span>';

    const sy2 = cmpEl('cmpStackYear');
    if (sy2) {
        const prevS = sy2.value;
        sy2.innerHTML = sy.map(y => `<option value="${y}">${y}</option>`).join('');
        const sel = cmpSelectedYears();
        if (prevS && sy.includes(Number(prevS))) sy2.value = prevS;
        else sy2.value = String(sel.length ? sel[sel.length - 1] : (sy[0] || ''));
    }

    const prevM = mu.value;
    mu.innerHTML = '<option value="ALL">All Municipalities</option>' +
        Array.from(munis).sort().map(m => `<option value="${cmpEsc(m)}">${cmpEsc(m)}</option>`).join('');
    if (prevM && munis.has(prevM)) mu.value = prevM;
}

/** Month-by-month totals for one year (optionally one municipality). */
function cmpAggregate(year, muni) {
    const months = Array.from({ length: 12 }, () => ({ hasAE: false, hasTA: false, local: 0, foreign: 0, overseas: 0, tm: 0, om: 0, fcr: 0 }));
    const ok = r => Number(r.year) === year && (muni === 'ALL' || r.municipality === muni) && r.month >= 1 && r.month <= 12;
    aeRecords.forEach(r => {
        if (!ok(r)) return;
        const x = months[r.month - 1];
        x.hasAE = true;
        x.local += Number(r.local_tourist || 0);
        x.foreign += Number(r.foreign_tourist || 0);
        x.overseas += Number(r.overseas_filipino || 0);
    });
    tassRecords.forEach(r => {
        if (!ok(r)) return;
        const x = months[r.month - 1];
        x.hasTA = true;
        x.tm += Number(r.tm_sum || 0);
        x.om += Number(r.om_sum || 0);
        x.fcr += Number(r.fcr_sum || 0);
    });
    return months;
}

function cmpValue(x, key) {
    const ae = x.local + x.foreign + x.overseas, ta = x.tm + x.om + x.fcr;
    return key === 'ae' ? ae : (key === 'tass' ? ta : ae + ta);
}
function cmpHas(x, key) {
    return key === 'ae' ? x.hasAE : (key === 'tass' ? x.hasTA : (x.hasAE && x.hasTA));
}

function cmpTrend(a, b) {
    if (a === 0 && b === 0) return { label: 'No data', icon: 'fa-minus', badge: 'bg-slate-100 text-slate-600', pct: null };
    if (a === 0) return { label: 'New', icon: 'fa-arrow-trend-up', badge: 'bg-emerald-100 text-emerald-800', pct: null };
    const pct = ((b - a) / a) * 100;
    if (pct > 0.5) return { label: 'Increasing', icon: 'fa-arrow-trend-up', badge: 'bg-emerald-100 text-emerald-800', pct };
    if (pct < -0.5) return { label: 'Declining', icon: 'fa-arrow-trend-down', badge: 'bg-rose-100 text-rose-800', pct };
    return { label: 'Stable', icon: 'fa-minus', badge: 'bg-slate-100 text-slate-700', pct };
}
function cmpPctText(a, b) {
    if (a > 0) { const p = ((b - a) / a) * 100; return (p > 0 ? '+' : '') + p.toFixed(1) + '%'; }
    return b > 0 ? 'new' : '—';
}

/** Two table cells (change + % change) with colour/arrow. */
function cmpChangeCells(a, b, ok) {
    if (!ok) return '<td class="p-2 text-right text-slate-300">—</td><td class="p-2 text-right text-slate-300">—</td>';
    const d = b - a;
    const cls = d > 0 ? 'text-emerald-700' : (d < 0 ? 'text-rose-600' : 'text-slate-500');
    const arrow = d > 0 ? '▲' : (d < 0 ? '▼' : '●');
    return `<td class="p-2 text-right font-semibold ${cls}">${cmpSigned(d)}</td><td class="p-2 text-right font-semibold ${cls}">${arrow} ${cmpPctText(a, b)}</td>`;
}
function cmpChangeExport(a, b, ok) {
    if (!ok) return ['', ''];
    const d = b - a;
    return [d, a > 0 ? Number(((d / a) * 100).toFixed(1)) : ''];
}

function cmpDestroy(id) { if (cmpCharts[id]) { cmpCharts[id].destroy(); delete cmpCharts[id]; } }

/** Line chart: one line per dataset ({label, data, color, dash}). */
function cmpDrawLineMulti(canvasId, labels, datasets) {
    cmpDestroy(canvasId);
    cmpCharts[canvasId] = new Chart(cmpEl(canvasId).getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: datasets.map(d => ({ label: d.label, data: d.data, borderColor: d.color, backgroundColor: d.color, borderDash: d.dash || [], tension: 0.3, spanGaps: false, pointRadius: 3 }))
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 10 } } },
                datalabels: { display: false },
                tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y === null ? 'no data' : c.parsed.y.toLocaleString()}` } }
            },
            scales: { y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString() } } }
        }
    });
}

/** Grouped bar chart: one bar series per dataset ({label, data, color}). */
function cmpDrawBar(canvasId, labels, datasets) {
    cmpDestroy(canvasId);
    const hasDL = (typeof ChartDataLabels !== 'undefined');
    cmpCharts[canvasId] = new Chart(cmpEl(canvasId).getContext('2d'), {
        type: 'bar',
        plugins: hasDL ? [ChartDataLabels] : [],
        data: { labels, datasets: datasets.map(d => ({ label: d.label, data: d.data, backgroundColor: d.color, borderRadius: 4 })) },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                datalabels: hasDL ? { anchor: 'end', align: 'end', font: { size: 9, weight: 'bold' }, formatter: v => Number(v).toLocaleString() } : undefined
            },
            scales: { y: { beginAtZero: true, grace: '10%', ticks: { callback: v => v.toLocaleString() } } }
        }
    });
}

/** Stacked bars: AEs + TAss stacked (x = labels). */
function cmpDrawStacked(canvasId, labels, aeData, taData) {
    cmpDestroy(canvasId);
    cmpCharts[canvasId] = new Chart(cmpEl(canvasId).getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Tourist Arrivals (AEs)', data: aeData, backgroundColor: '#3b82f6' },
                { label: 'Same-Day Visitors (TAss)', data: taData, backgroundColor: '#14b8a6' }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom' },
                datalabels: { display: false },
                tooltip: {
                    callbacks: {
                        label: c => `${c.dataset.label}: ${c.parsed.y.toLocaleString()}`,
                        footer: items => 'Combined: ' + items.reduce((t, i) => t + i.parsed.y, 0).toLocaleString()
                    }
                }
            },
            scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { callback: v => v.toLocaleString() } } }
        }
    });
}

function cmpEmpty(msg) {
    cmpEl('cmpSummary').innerHTML = '';
    cmpEl('cmpNotice').innerHTML = '';
    cmpEl('cmpHead').innerHTML = '';
    cmpEl('cmpTableBody').innerHTML = `<tr><td class="p-6 text-center text-slate-400">${msg}</td></tr>`;
    cmpEl('cmpFoot').innerHTML = '';
    ['chartCmp1', 'chartCmp2', 'chartCmp3', 'chartCmp4'].forEach(cmpDestroy);
    ['cmpChartBox2', 'cmpChartBox3', 'cmpChartBox4'].forEach(id => cmpEl(id).classList.add('hidden'));
    cmpExportData = null;
    cmpClearBreakdown();
}

function renderComparison() {
    if (!cmpEl('view-comparison')) return;
    if (!document.querySelectorAll('.cmp-year-cb').length) populateCompareControls();

    const rawDataset = cmpEl('cmpDataset').value;   // ae | tass | both | both1 (both on one graph)
    const sameGraph = rawDataset === 'both1';
    const dataset = sameGraph ? 'both' : rawDataset;
    const mode = cmpEl('cmpMode').value;             // monthly | yearly
    const muni = cmpEl('cmpMuni').value || 'ALL';
    const same = cmpEl('cmpSameMonths').checked;
    const years = cmpSelectedYears();
    const range = cmpMonthRange();

    if (!document.querySelectorAll('.cmp-year-cb').length) { cmpEmpty('No saved data yet. Upload or encode records first.'); return; }
    if (years.length < 2) { cmpEmpty('Tick at least two years in the "Years" box to compare.'); return; }

    const first = years[0], prevY = years[years.length - 2], lastY = years[years.length - 1];
    const pairs = cmpPairs(years);
    const agg = {};
    years.forEach(y => { agg[y] = cmpAggregate(y, muni); });
    const base = dataset === 'both' ? ['ae', 'tass'] : [dataset];
    const keys = dataset === 'both' ? ['ae', 'tass', 'combined'] : [dataset];
    const scope = muni === 'ALL' ? 'All Municipalities' : muni;
    const dsLabel = dataset === 'both' ? 'AEs + TAss (Both)' : CMP_LABELS[dataset];
    const yearsTxt = years.join(' vs ');

    cmpEl('cmpTitleLbl').textContent = `${mode === 'monthly' ? 'Monthly' : 'Yearly'} Comparison: ${yearsTxt}`;
    cmpEl('cmpScopeLbl').textContent = `${dsLabel} | ${scope} | ${range.label}`;

    // Months that count: inside the chosen range AND (optionally) with data in EVERY selected year
    const hasAll = i => years.every(y => base.every(k => cmpHas(agg[y][i], k)));
    const mask = Array.from({ length: 12 }, (_, i) => range.idxs.includes(i) && (!same || hasAll(i)));
    const used = mask.filter(Boolean).length;
    const usedNames = MONTH_NAMES.filter((_, i) => mask[i]).map(m => m.substring(0, 3)).join(', ');
    const counts = years.map(y => range.idxs.filter(i => base.every(k => cmpHas(agg[y][i], k))).length);

    let notice = `<i class="fa-solid fa-circle-info mr-1"></i> Months with data (${range.label}): ` +
        years.map((y, n) => `<strong>${y}</strong> = ${counts[n]}`).join(', ') + '. ';
    if (same) {
        notice += used
            ? `Totals use only the ${used} month(s) present in every selected year (${usedNames}) so the comparison is fair.`
            : 'The selected years have no month in common, so there is nothing to total.';
    } else if (new Set(counts).size > 1) {
        notice += '<strong class="text-amber-700">The years do not cover the same number of months, so totals may mislead. Tick "same months only" for a fair comparison.</strong>';
    }
    if (dataset !== 'both') notice += ' <span class="text-teal-700 font-semibold">Tip: choose "Both (AEs + TAss)" in Data to see the combined AEs + TAss graphs.</span>';
    cmpEl('cmpNotice').innerHTML = notice;

    const sum = (arr, fn) => arr.reduce((s, x, i) => s + (mask[i] ? fn(x) : 0), 0);

    // ---- Totals per series per year (over the counted months) ----
    const totals = {};
    keys.forEach(k => { totals[k] = {}; years.forEach(y => { totals[k][y] = sum(agg[y], x => cmpValue(x, k)); }); });

    // ---- Summary cards: latest year vs the year before, plus every year's total ----
    cmpEl('cmpSummary').innerHTML = keys.map(k => {
        const a = totals[k][prevY], b = totals[k][lastY], tr = cmpTrend(a, b), d = b - a;
        const pctTxt = tr.pct === null ? (b > 0 && a === 0 ? 'new' : '—') : (tr.pct > 0 ? '+' : '') + tr.pct.toFixed(1) + '%';
        const rows = years.map((y, n) => {
            const chip = n === 0 ? '<span class="text-slate-300">base</span>' : (() => {
                const p = totals[k][years[n - 1]], c = totals[k][y], dd = c - p;
                const cls = dd > 0 ? 'text-emerald-700' : (dd < 0 ? 'text-rose-600' : 'text-slate-500');
                return `<span class="font-semibold ${cls}">${dd > 0 ? '▲' : (dd < 0 ? '▼' : '●')} ${cmpPctText(p, c)}</span>`;
            })();
            return `<div class="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
                <span class="flex items-center gap-1.5"><span class="inline-block w-2.5 h-2.5 rounded-full" style="background:${cmpColor(years, y)}"></span><strong>${y}</strong></span>
                <span class="text-slate-800 font-bold">${totals[k][y].toLocaleString()}</span>${chip}</div>`;
        }).join('');
        let extra = '';
        if (mode === 'monthly') {
            let up = 0, down = 0, n = 0;
            for (let i = 0; i < 12; i++) {
                if (!(mask[i] && cmpHas(agg[prevY][i], k) && cmpHas(agg[lastY][i], k))) continue;
                n++;
                const va = cmpValue(agg[prevY][i], k), vb = cmpValue(agg[lastY][i], k);
                if (vb > va) up++; else if (vb < va) down++;
            }
            extra = `<p class="text-[11px] text-slate-500 mt-2">${lastY} was higher than ${prevY} in <strong>${up}</strong> and lower in <strong>${down}</strong> of ${n} comparable month(s).</p>`;
        }
        return `<div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div class="flex items-start justify-between gap-2">
                <p class="text-xs font-bold text-slate-500 uppercase">${CMP_LABELS[k]}</p>
                <span class="px-2 py-1 rounded-full text-[11px] font-bold ${tr.badge}"><i class="fa-solid ${tr.icon} mr-1"></i>${tr.label}</span>
            </div>
            <p class="text-2xl font-extrabold text-slate-800 mt-2">${pctTxt}</p>
            <p class="text-xs text-slate-500 mt-1">${lastY} vs ${prevY}: ${cmpSigned(d)} visitors</p>
            <div class="mt-3 text-xs">${rows}</div>
            ${extra}
        </div>`;
    }).join('');

    const exportHead = [], exportRows = [];
    let numericCols = [];

    if (mode === 'monthly') {
        // ---- Monthly table (only the months in the chosen range) ----
        const span = years.length + 2 * pairs.length;
        let head1 = '<tr class="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-300"><th class="p-2 border" rowspan="2">Month</th>';
        let head2 = '<tr class="bg-slate-50 text-slate-600 font-bold border-b border-slate-300">';
        exportHead.push('Month');
        let col = 1;
        keys.forEach(k => {
            head1 += `<th class="p-2 border text-center" colspan="${span}">${CMP_LABELS[k]}</th>`;
            years.forEach((y, n) => {
                head2 += `<th class="p-2 border text-right" style="color:${cmpColor(years, y)}">${y}</th>`;
                exportHead.push(`${CMP_SHORT[k]} ${y}`); numericCols.push(col++);
            });
            pairs.forEach(([p, c]) => {
                head2 += `<th class="p-2 border text-right">Change ${c} vs ${p}</th><th class="p-2 border text-right">% ${c} vs ${p}</th>`;
                exportHead.push(`${CMP_SHORT[k]} Change ${c} vs ${p}`, `${CMP_SHORT[k]} % ${c} vs ${p}`);
                numericCols.push(col); col += 2;
            });
        });
        cmpEl('cmpHead').innerHTML = head1 + '</tr>' + head2 + '</tr>';

        let body = '';
        range.idxs.forEach(i => {
            const dim = (same && !mask[i]) ? ' opacity-50' : '';
            let tr = `<tr class="hover:bg-slate-50 border-b${dim}"><td class="p-2 font-bold text-slate-800">${MONTH_NAMES[i]}</td>`;
            const exRow = [MONTH_NAMES[i]];
            keys.forEach(k => {
                years.forEach(y => {
                    const h = cmpHas(agg[y][i], k), v = cmpValue(agg[y][i], k);
                    tr += `<td class="p-2 text-right">${h ? v.toLocaleString() : '<span class="text-slate-300">—</span>'}</td>`;
                    exRow.push(h ? v : '');
                });
                pairs.forEach(([p, c]) => {
                    const ok = cmpHas(agg[p][i], k) && cmpHas(agg[c][i], k);
                    const a = cmpValue(agg[p][i], k), b = cmpValue(agg[c][i], k);
                    tr += cmpChangeCells(a, b, ok);
                    exRow.push(...cmpChangeExport(a, b, ok));
                });
            });
            body += tr + '</tr>';
            exportRows.push(exRow);
        });
        cmpEl('cmpTableBody').innerHTML = body;

        let foot = `<tr><td class="p-2">TOTAL${same ? ' (same months)' : ''}</td>`;
        const exFoot = ['TOTAL'];
        keys.forEach(k => {
            years.forEach(y => { foot += `<td class="p-2 text-right">${totals[k][y].toLocaleString()}</td>`; exFoot.push(totals[k][y]); });
            pairs.forEach(([p, c]) => {
                const a = totals[k][p], b = totals[k][c];
                foot += cmpChangeCells(a, b, true).replace(/text-emerald-700/g, 'text-emerald-300').replace(/text-rose-600/g, 'text-rose-300').replace(/text-slate-500/g, 'text-slate-300');
                exFoot.push(...cmpChangeExport(a, b, true));
            });
        });
        cmpEl('cmpFoot').innerHTML = foot + '</tr>';
        exportRows.push(exFoot);

        // ---- Monthly charts ----
        const labels = range.idxs.map(i => MONTH_NAMES[i].substring(0, 3));
        const line = (k, y) => range.idxs.map(i => cmpHas(agg[y][i], k) ? cmpValue(agg[y][i], k) : null);
        const perYear = k => years.map(y => ({ label: String(y), data: line(k, y), color: cmpColor(years, y) }));
        if (sameGraph) {
            cmpEl('cmpChartTitle1').textContent = 'AEs and TAss together — month by month (solid = AEs, dashed = TAss)';
            cmpDrawLineMulti('chartCmp1', labels, [
                ...years.map(y => ({ label: `AEs ${y}`, data: line('ae', y), color: cmpColor(years, y) })),
                ...years.map(y => ({ label: `TAss ${y}`, data: line('tass', y), color: cmpColor(years, y), dash: [6, 4] }))
            ]);
            cmpEl('cmpChartBox2').classList.add('hidden');
            cmpDestroy('chartCmp2');
        } else {
            const chartKeys = dataset === 'both' ? ['ae', 'tass'] : [dataset];
            cmpEl('cmpChartBox2').classList.toggle('hidden', chartKeys.length < 2);
            chartKeys.forEach((k, idx) => {
                cmpEl('cmpChartTitle' + (idx + 1)).textContent = `${CMP_LABELS[k]} — month by month`;
                cmpDrawLineMulti('chartCmp' + (idx + 1), labels, perYear(k));
            });
            cmpEl('cmpChartBox2').classList.toggle('hidden', chartKeys.length < 2);
            if (chartKeys.length < 2) cmpDestroy('chartCmp2');
        }
        if (dataset === 'both') {
            cmpEl('cmpChartBox3').classList.remove('hidden');
            cmpEl('cmpChartTitle3').textContent = 'Combined visitors (AEs + TAss) — month by month';
            cmpDrawLineMulti('chartCmp3', labels, perYear('combined'));
        } else {
            cmpEl('cmpChartBox3').classList.add('hidden');
            cmpDestroy('chartCmp3');
        }
    } else {
        // ---- Yearly table (totals + breakdown) ----
        const rows = [];
        const comp = (label, fn) => { const v = {}; years.forEach(y => { v[y] = sum(agg[y], fn); }); rows.push({ label, v, total: false }); };
        const tot = (label, k) => rows.push({ label, v: totals[k], total: true });
        if (dataset !== 'tass') {
            comp('Local Tourist', x => x.local); comp('Foreign Tourist', x => x.foreign); comp('Overseas Filipino', x => x.overseas);
            tot('TOTAL TOURIST ARRIVALS (AEs)', 'ae');
        }
        if (dataset !== 'ae') {
            comp('Same-Day (TM)', x => x.tm); comp('Same-Day (OM)', x => x.om); comp('Same-Day (FCR)', x => x.fcr);
            tot('TOTAL SAME-DAY VISITORS (TAss)', 'tass');
        }
        if (dataset === 'both') tot('COMBINED VISITORS', 'combined');

        let head = '<tr class="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-300"><th class="p-2 border">Category</th>';
        exportHead.push('Category');
        let col = 1;
        years.forEach(y => { head += `<th class="p-2 border text-right" style="color:${cmpColor(years, y)}">${y}</th>`; exportHead.push(String(y)); numericCols.push(col++); });
        pairs.forEach(([p, c]) => {
            head += `<th class="p-2 border text-right">Change ${c} vs ${p}</th><th class="p-2 border text-right">% ${c} vs ${p}</th>`;
            exportHead.push(`Change ${c} vs ${p}`, `% ${c} vs ${p}`);
            numericCols.push(col); col += 2;
        });
        cmpEl('cmpHead').innerHTML = head + '</tr>';

        cmpEl('cmpTableBody').innerHTML = rows.map(r => {
            let tr = `<tr class="border-b ${r.total ? 'bg-slate-100 font-bold' : 'hover:bg-slate-50'}"><td class="p-2 ${r.total ? 'text-slate-900' : 'text-slate-700'}">${r.label}</td>`;
            const ex = [r.label];
            years.forEach(y => { tr += `<td class="p-2 text-right">${r.v[y].toLocaleString()}</td>`; ex.push(r.v[y]); });
            pairs.forEach(([p, c]) => { tr += cmpChangeCells(r.v[p], r.v[c], true); ex.push(...cmpChangeExport(r.v[p], r.v[c], true)); });
            exportRows.push(ex);
            return tr + '</tr>';
        }).join('');
        cmpEl('cmpFoot').innerHTML = '';

        // ---- Yearly charts ----
        const chartRows = dataset === 'both' ? rows.filter(r => r.total) : rows;
        cmpEl('cmpChartTitle1').textContent = `${yearsTxt} — ${dsLabel}`;
        cmpDrawBar('chartCmp1', chartRows.map(r => r.label.replace('TOTAL ', 'Total ').replace('COMBINED VISITORS', 'Combined')),
            years.map(y => ({ label: String(y), data: chartRows.map(r => r.v[y]), color: cmpColor(years, y) })));
        cmpEl('cmpChartBox2').classList.add('hidden');
        cmpDestroy('chartCmp2');
        if (dataset === 'both') {
            cmpEl('cmpChartBox3').classList.remove('hidden');
            cmpEl('cmpChartTitle3').textContent = 'Combined visitors (AEs + TAss) — each year, split by type';
            cmpDrawStacked('chartCmp3', years.map(String), years.map(y => totals.ae[y]), years.map(y => totals.tass[y]));
        } else {
            cmpEl('cmpChartBox3').classList.add('hidden');
            cmpDestroy('chartCmp3');
        }
    }

    cmpExportData = {
        title: `${mode === 'monthly' ? 'MONTHLY' : 'YEARLY'} TOURISM TREND COMPARISON`,
        sub: `${yearsTxt} | ${dsLabel} | ${scope} | ${range.label}${same ? ' | Same months only' : ''}`,
        head: exportHead, rows: exportRows, numericCols,
        file: `Tourism_Comparison_${mode}_${years.join('_')}.xlsx`
    };
    cmpRenderBreakdown();
    cmpRenderStackMonthly();
}

/** 5th graph: AEs + TAss stacked, month by month, for ONE chosen year (within the month range). */
function cmpRenderStackMonthly() {
    const box = cmpEl('cmpChartBox4');
    if (!box) return;
    const raw = cmpEl('cmpDataset').value;
    const yearSel = cmpEl('cmpStackYear');
    if (!(raw === 'both' || raw === 'both1') || !yearSel.value) {
        box.classList.add('hidden'); cmpDestroy('chartCmp4'); return;
    }
    const year = Number(yearSel.value), muni = cmpEl('cmpMuni').value || 'ALL';
    const range = cmpMonthRange();
    const M = cmpAggregate(year, muni);
    cmpEl('cmpChartTitle4').textContent = `Combined visitors (AEs + TAss) per month — stacked, ${year}${range.full ? '' : ' (' + range.label + ')'}`;
    box.classList.remove('hidden');
    cmpDrawStacked('chartCmp4', range.idxs.map(i => MONTH_NAMES[i].substring(0, 3)),
        range.idxs.map(i => M[i].local + M[i].foreign + M[i].overseas),
        range.idxs.map(i => M[i].tm + M[i].om + M[i].fcr));
}

function exportComparisonExcel() {
    if (!requireAdmin('download data')) return;
    if (!cmpExportData) { showToast('Nothing to export yet.', 'warning'); return; }
    const d = cmpExportData, lastCol = d.head.length - 1;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
        ["PROVINCIAL GOVERNMENT OF OCCIDENTAL MINDORO"],
        [d.title],
        [d.sub],
        d.head,
        ...d.rows
    ]);
    ws['!merges'] = [0, 1, 2].map(r => ({ s: { r, c: 0 }, e: { r, c: lastCol } }));
    ws['A1'].s = excelTitleStyle(); ws['A2'].s = excelTitleStyle(); ws['A3'].s = EXCEL_SUBTITLE_FONT;
    styleHeaderRow(ws, 3); styleDataNumbers(ws, d.numericCols, 4);
    ws['!freeze'] = { xSplit: 0, ySplit: 4 }; autoWidth(ws, 12, 30);
    XLSX.utils.book_append_sheet(wb, ws, "Trend Comparison");
    saveWorkbook(wb, d.file);
}

/**
 * BREAKDOWN: who is rising / declining? Per municipality, or per establishment (AEs) / attraction (TAss).
 * Shows every selected year; the change is the LATEST selected year vs the year before it.
 */
function cmpClearBreakdown() {
    if (!cmpEl('cmpBreakBody')) return;
    cmpEl('cmpBreakSummary').innerHTML = '';
    cmpEl('cmpBreakHead').innerHTML = '';
    cmpEl('cmpBreakBody').innerHTML = '';
    cmpEl('cmpBreakChartBox').classList.add('hidden');
    cmpDestroy('chartCmpBreak');
    cmpBreakExport = null;
}

function cmpRenderBreakdown() {
    if (!cmpEl('cmpBreakBody')) return;
    const dataset = cmpEl('cmpDataset').value === 'both1' ? 'both' : cmpEl('cmpDataset').value;
    const muniFilter = cmpEl('cmpMuni').value || 'ALL';
    const same = cmpEl('cmpSameMonths').checked;
    const by = cmpEl('cmpBreakBy').value;        // muni | entity
    const sortBy = cmpEl('cmpBreakSort').value;  // decline | increase | volume | name
    const years = cmpSelectedYears();
    const range = cmpMonthRange();
    if (years.length < 2) { cmpClearBreakdown(); return; }
    const prevY = years[years.length - 2], lastY = years[years.length - 1];

    // Months counted: inside the range, and (optionally) with data in every selected year (whole province)
    const agg0 = {}; years.forEach(y => { agg0[y] = cmpAggregate(y, 'ALL'); });
    const base = dataset === 'both' ? ['ae', 'tass'] : [dataset];
    const mask = Array.from({ length: 12 }, (_, i) => range.idxs.includes(i) && (!same || years.every(y => base.every(k => cmpHas(agg0[y][i], k)))));

    const items = new Map();
    const add = (list, kind) => {
        list.forEach(r => {
            const y = Number(r.year);
            if (!years.includes(y)) return;
            if (!(r.month >= 1 && r.month <= 12) || !mask[r.month - 1]) return;
            if (by === 'entity' && muniFilter !== 'ALL' && r.municipality !== muniFilter) return;
            const v = kind === 'ae'
                ? Number(r.local_tourist || 0) + Number(r.foreign_tourist || 0) + Number(r.overseas_filipino || 0)
                : Number(r.tm_sum || 0) + Number(r.om_sum || 0) + Number(r.fcr_sum || 0);
            const muni = r.municipality || 'Unspecified';
            const name = by === 'muni' ? muni : ((kind === 'ae' ? r.establishment : r.attraction) || 'Unspecified');
            const key = by === 'muni' ? name : `${kind}||${muni}||${name}`;
            if (!items.has(key)) { const v0 = {}; years.forEach(yy => { v0[yy] = 0; }); items.set(key, { name, muni, kind, v: v0 }); }
            items.get(key).v[y] += v;
        });
    };
    if (dataset !== 'tass') add(aeRecords, 'ae');
    if (dataset !== 'ae') add(tassRecords, 'tass');

    const list = Array.from(items.values()).map(x => {
        const a = x.v[prevY], b = x.v[lastY];
        return { ...x, a, b, diff: b - a, pct: a > 0 ? ((b - a) / a) * 100 : null };
    });
    const sorters = {
        decline: (p, q) => p.diff - q.diff,
        increase: (p, q) => q.diff - p.diff,
        volume: (p, q) => q.b - p.b,
        name: (p, q) => p.name.localeCompare(q.name)
    };
    list.sort(sorters[sortBy] || sorters.decline);

    const up = list.filter(x => x.diff > 0).length, down = list.filter(x => x.diff < 0).length, flat = list.length - up - down;
    const what = by === 'muni' ? 'municipalities' : 'establishments / attractions';
    cmpEl('cmpBreakSummary').innerHTML = list.length
        ? `<strong>${list.length.toLocaleString()}</strong> ${what} compared (${lastY} vs ${prevY}, ${range.label}${same ? ', same months only' : ''}): ` +
          `<span class="font-bold text-emerald-700">${up} increasing</span>, <span class="font-bold text-rose-600">${down} declining</span>, ${flat} unchanged.`
        : `No ${what} found for this selection.`;

    // ---- Table ----
    const showEntityCols = by === 'entity';
    const thLabel = by === 'muni' ? 'Municipality' : (dataset === 'both' ? 'Establishment / Attraction' : (dataset === 'ae' ? 'Establishment' : 'Attraction'));
    cmpEl('cmpBreakHead').innerHTML = `<tr class="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-300">
        <th class="p-2 border text-center">#</th><th class="p-2 border">${thLabel}</th>
        ${showEntityCols ? '<th class="p-2 border">Municipality</th>' + (dataset === 'both' ? '<th class="p-2 border">Type</th>' : '') : ''}
        ${years.map(y => `<th class="p-2 border text-right" style="color:${cmpColor(years, y)}">${y}</th>`).join('')}
        <th class="p-2 border text-right">Change ${lastY} vs ${prevY}</th><th class="p-2 border text-right">% Change</th><th class="p-2 border text-center">Trend</th></tr>`;

    cmpEl('cmpBreakBody').innerHTML = list.map((x, i) => {
        const tr = cmpTrend(x.a, x.b);
        return `<tr class="hover:bg-slate-50 border-b">
            <td class="p-2 text-center text-slate-400">${i + 1}</td>
            <td class="p-2 font-bold text-slate-800">${cmpEsc(x.name)}</td>
            ${showEntityCols ? `<td class="p-2 text-slate-600">${cmpEsc(x.muni)}</td>` + (dataset === 'both' ? `<td class="p-2 text-slate-600">${x.kind === 'ae' ? 'AE' : 'TAss'}</td>` : '') : ''}
            ${years.map(y => `<td class="p-2 text-right">${x.v[y].toLocaleString()}</td>`).join('')}
            ${cmpChangeCells(x.a, x.b, true)}
            <td class="p-2 text-center"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${tr.badge}">${tr.label}</span></td>
        </tr>`;
    }).join('') || `<tr><td colspan="12" class="p-6 text-center text-slate-400">No data for this selection.</td></tr>`;

    // ---- Chart: biggest movers (up to 10 increases + 10 declines) ----
    const movers = list.filter(x => x.diff !== 0);
    const top = movers.slice().sort((p, q) => q.diff - p.diff).slice(0, 10);
    const bottom = movers.slice().sort((p, q) => p.diff - q.diff).slice(0, 10);
    const chartItems = Array.from(new Map([...top, ...bottom].map(x => [x.kind + x.muni + x.name, x])).values()).sort((p, q) => q.diff - p.diff);
    cmpDestroy('chartCmpBreak');
    const canvas = cmpEl('chartCmpBreak');
    cmpEl('cmpBreakChartBox').classList.toggle('hidden', !chartItems.length);
    if (chartItems.length) {
        canvas.parentElement.style.height = Math.max(220, chartItems.length * 26 + 60) + 'px';
        cmpCharts['chartCmpBreak'] = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: chartItems.map(x => (by === 'entity' && dataset === 'both' ? `[${x.kind === 'ae' ? 'AE' : 'TAss'}] ` : '') + x.name),
                datasets: [{ label: `Change (${prevY} → ${lastY})`, data: chartItems.map(x => x.diff), backgroundColor: chartItems.map(x => x.diff >= 0 ? '#059669' : '#e11d48'), borderRadius: 4 }]
            },
            options: {
                indexAxis: 'y', responsive: true, maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    datalabels: { display: false },
                    tooltip: { callbacks: { label: c => `${cmpSigned(c.parsed.x)} visitors` } }
                },
                scales: { x: { ticks: { callback: v => v.toLocaleString() } } }
            }
        });
    }

    // ---- Export data ----
    const head = ['#', thLabel];
    if (showEntityCols) { head.push('Municipality'); if (dataset === 'both') head.push('Type'); }
    const firstNum = head.length;
    years.forEach(y => head.push(String(y)));
    head.push(`Change ${lastY} vs ${prevY}`, '% Change');
    const rows = list.map((x, i) => {
        const r = [i + 1, x.name];
        if (showEntityCols) { r.push(x.muni); if (dataset === 'both') r.push(x.kind === 'ae' ? 'AE' : 'TAss'); }
        years.forEach(y => r.push(x.v[y]));
        r.push(x.diff, x.pct === null ? '' : Number(x.pct.toFixed(1)));
        return r;
    });
    cmpBreakExport = {
        title: by === 'muni' ? 'TOURISM TREND BY MUNICIPALITY' : 'TOURISM TREND BY ESTABLISHMENT / ATTRACTION',
        sub: `${years.join(', ')} | ${dataset === 'both' ? 'AEs + TAss' : CMP_LABELS[dataset]} | ${range.label}${by === 'entity' && muniFilter !== 'ALL' ? ' | ' + muniFilter : ''}${same ? ' | Same months only' : ''}`,
        head, rows, numericCols: years.map((_, n) => firstNum + n).concat([firstNum + years.length]),
        file: `Tourism_Trend_${by === 'muni' ? 'Municipality' : 'Entity'}_${years.join('_')}.xlsx`
    };
}

function exportBreakdownExcel() {
    if (!requireAdmin('download data')) return;
    if (!cmpBreakExport || !cmpBreakExport.rows.length) { showToast('Nothing to export yet.', 'warning'); return; }
    const d = cmpBreakExport, lastCol = d.head.length - 1;
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
        ["PROVINCIAL GOVERNMENT OF OCCIDENTAL MINDORO"], [d.title], [d.sub], d.head, ...d.rows
    ]);
    ws['!merges'] = [0, 1, 2].map(r => ({ s: { r, c: 0 }, e: { r, c: lastCol } }));
    ws['A1'].s = excelTitleStyle(); ws['A2'].s = excelTitleStyle(); ws['A3'].s = EXCEL_SUBTITLE_FONT;
    styleHeaderRow(ws, 3); styleDataNumbers(ws, d.numericCols, 4);
    ws['!freeze'] = { xSplit: 0, ySplit: 4 }; autoWidth(ws, 10, 40);
    XLSX.utils.book_append_sheet(wb, ws, "Breakdown");
    saveWorkbook(wb, d.file);
}

// ##############################################################################
// ##### SECTION: BACKUP
// ##############################################################################

/**
 * BACKUP & RESTORE: full Excel backup, restore, export-by-period, reset to sample data.
 */

/**
 * DEMO SAMPLE DATA INITIALIZATION
 */
async function preloadSampleData() {
    const sampleAEs = [
        { province: "Occidental Mindoro", municipality: "Mamburao", year: 2026, month: 1, establishment: "Beach Haven Resort", type_class: "Resort", local_tourist: 450, foreign_tourist: 60, overseas_filipino: 15, total_lf: 525, total_male: 260, total_female: 265, total_mf: 525 },
        { province: "Occidental Mindoro", municipality: "Mamburao", year: 2026, month: 2, establishment: "Beach Haven Resort", type_class: "Resort", local_tourist: 510, foreign_tourist: 85, overseas_filipino: 20, total_lf: 615, total_male: 310, total_female: 305, total_mf: 615 },
        { province: "Occidental Mindoro", municipality: "Sablayan", year: 2026, month: 1, establishment: "Apo Reef Hotel", type_class: "Hotel", local_tourist: 680, foreign_tourist: 210, overseas_filipino: 35, total_lf: 925, total_male: 470, total_female: 455, total_mf: 925 },
        { province: "Occidental Mindoro", municipality: "San Jose", year: 2026, month: 1, establishment: "Sikatuna Suites", type_class: "Hotel", local_tourist: 820, foreign_tourist: 110, overseas_filipino: 40, total_lf: 970, total_male: 490, total_female: 480, total_mf: 970 }
    ];

    const sampleTAss = [
        { province: "Occidental Mindoro", municipality: "Mamburao", year: 2026, month: 1, attraction: "Mamburao Central Beach", tm_m: 300, tm_f: 320, tm_sum: 620, om_m: 180, om_f: 200, om_sum: 380, fcr_m: 20, fcr_f: 25, fcr_sum: 45, total_male: 500, total_female: 545, grand_total: 1045 },
        { province: "Occidental Mindoro", municipality: "Sablayan", year: 2026, month: 1, attraction: "Apo Reef Natural Park", tm_m: 150, tm_f: 140, tm_sum: 290, om_m: 520, om_f: 480, om_sum: 1000, fcr_m: 110, fcr_f: 90, fcr_sum: 200, total_male: 780, total_female: 710, grand_total: 1490 },
        { province: "Occidental Mindoro", municipality: "San Jose", year: 2026, month: 1, attraction: "Ilin Island Eco Beach", tm_m: 220, tm_f: 210, tm_sum: 430, om_m: 310, om_f: 290, om_sum: 600, fcr_m: 40, fcr_f: 35, fcr_sum: 75, total_male: 570, total_female: 535, grand_total: 1105 }
    ];

    const aeIds = await putRecordsBulk("aes", sampleAEs);
    const tassIds = await putRecordsBulk("tass", sampleTAss);
    aeIds.forEach(id => markDirty("aes", id));
    tassIds.forEach(id => markDirty("tass", id));

    await loadAllRecords();
    refreshAllViews();
    showToast("Sample tourism datasets preloaded successfully.", "info");
}

async function resetToSampleData() {
    if (!requireAdmin('reload demo data')) return;
    if (confirm("Reset current database and reload original sample data?")) {
        await clearStore("aes");
        await clearStore("tass");
        pendingSync.aes.clear();
        pendingSync.tass.clear();
        pendingDeletes.aes = [];
        pendingDeletes.tass = [];
        persistPendingSync();
        await preloadSampleData();
        await saveAllToCloud(false, true);
    }
}

function openExportPeriodModal(dataset){if(!requireAdmin('download data'))return;document.getElementById('exportDataset').value=dataset||'aes';document.getElementById('exportScope').value='MONTH';document.querySelectorAll('input[name=exportScopeRadio]').forEach(r=>r.checked=(r.value==='MONTH'));populateExportYears();updateExportPeriodControls();const el=document.getElementById('modalExportPeriod');el.classList.remove('hidden');el.classList.add('flex');}
function populateExportYears(){const data=document.getElementById('exportDataset').value==='tass'?tassRecords:aeRecords;const years=[...new Set(data.map(r=>Number(r.year)).filter(Boolean))].sort((a,b)=>b-a);const sel=document.getElementById('exportYear');const cur=sel.value;sel.innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');if(cur && years.includes(Number(cur)))sel.value=cur;else if(years.length)sel.value=String(years[0]);else sel.innerHTML='<option value="">No saved year</option>';}
function updateExportPeriodControls(){const scope=document.getElementById('exportScope').value;const year=document.getElementById('exportYear');const month=document.getElementById('exportMonth');const info=document.getElementById('exportScopeInfo');const yearDisabled=scope==='ALL_DATA';const monthDisabled=scope!=='MONTH';year.disabled=yearDisabled;month.disabled=monthDisabled;year.classList.toggle('opacity-50',yearDisabled);month.classList.toggle('opacity-50',monthDisabled);if(scope==='YEAR')month.value='1';if(scope==='ALL_DATA'){info.innerHTML='<strong>3. All Data:</strong> exports every saved year and month in the selected dataset.';}else if(scope==='YEAR'){info.innerHTML='<strong>2. Specific Year + All Months:</strong> exports January–December for the selected year.';}else{info.innerHTML='<strong>1. Specific Year + Month:</strong> exports only the selected month of the selected year.';}}
function exportSelectedPeriodExcel(){if(!requireAdmin('download data'))return;const dataset=document.getElementById('exportDataset').value,scope=document.getElementById('exportScope').value,yearValue=document.getElementById('exportYear').value,mv=document.getElementById('exportMonth').value;if(scope==='ALL_DATA'){if(dataset==='aes')exportAEsExcel(null,'ALL');else exportTAssExcel(null,'ALL');closeModal('modalExportPeriod');return;}const year=Number(yearValue);if(!year){showToast('No saved year is available to export.','warning');return;}const month=scope==='YEAR'?'ALL':Number(mv);if(dataset==='aes')exportAEsExcel(year,month);else exportTAssExcel(year,month);closeModal('modalExportPeriod');}

function exportBackupExcel() {
    if (!requireAdmin('download data')) return;
    const wb = XLSX.utils.book_new();
    const aeHeaders = ["ID","Province","Municipality","Year","Month","Accommodation Establishment","Type Class","Local Tourist","Foreign Tourist","Overseas Filipino","Total (L+F+Overseas)","Total Male","Total Female","Total (M+F)"];
    const aeRows = aeRecords.map(r => [r.id||'',r.province,r.municipality,r.year,MONTH_NAMES[r.month-1],r.establishment,r.type_class||'',Number(r.local_tourist||0),Number(r.foreign_tourist||0),Number(r.overseas_filipino||0),Number(r.total_lf||0),Number(r.total_male||0),Number(r.total_female||0),Number(r.total_mf||0)]);
    const taHeaders = ["ID","Province","Municipality","Year","Month","Tourist Attraction","TM(M)","TM(F)","TM(SUM)","OM(M)","OM(F)","OM(SUM)","FCR(M)","FCR(F)","FCR(SUM)","Total Male","Total Female","Grand Total"];
    const taRows = tassRecords.map(r => [r.id||'',r.province,r.municipality,r.year,MONTH_NAMES[r.month-1],r.attraction,Number(r.tm_m||0),Number(r.tm_f||0),Number(r.tm_sum||0),Number(r.om_m||0),Number(r.om_f||0),Number(r.om_sum||0),Number(r.fcr_m||0),Number(r.fcr_f||0),Number(r.fcr_sum||0),Number(r.total_male||0),Number(r.total_female||0),Number(r.grand_total||0)]);
    XLSX.utils.book_append_sheet(wb, makeDataSheet(aeHeaders, aeRows, [0,3,7,8,9,10,11,12,13]), "AEs");
    XLSX.utils.book_append_sheet(wb, makeDataSheet(taHeaders, taRows, [0,3,6,7,8,9,10,11,12,13,14,15,16,17]), "TAss");
    XLSX.utils.book_append_sheet(wb, makeInfoSheet("Tourism Data Banking System – Full Database Backup", "Do not edit sheet names or column headers if this workbook will be restored."), "Backup Info");
    saveWorkbook(wb, `TourismDB_Backup_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast("Excel database backup downloaded successfully.", "success");
}

async function handleRestoreExcelFile(event) {
    if (!requireAdmin('restore the database')) { event.target.value = ""; return; }
    const file = event.target.files[0];
    if (!file) return;
    if (!confirm("WARNING: Restoring will REPLACE all existing database records. Do you wish to continue?")) return;

    try {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        if (!workbook.Sheets["AEs"] || !workbook.Sheets["TAss"]) throw new Error("Invalid backup workbook. Required sheets: AEs and TAss.");

        const aeRows = XLSX.utils.sheet_to_json(workbook.Sheets["AEs"], { defval: "" });
        const taRows = XLSX.utils.sheet_to_json(workbook.Sheets["TAss"], { defval: "" });

        const aeRecs = aeRows.map(r => {
            const rec = {
                id: r.ID || undefined, province: r.Province || 'Occidental Mindoro', municipality: r.Municipality,
                year: Number(r.Year), month: monthToNumber(r.Month), establishment: r["Accommodation Establishment"],
                type_class: r["Type Class"] || 'General', local_tourist: Number(r["Local Tourist"]||0),
                foreign_tourist: Number(r["Foreign Tourist"]||0), overseas_filipino: Number(r["Overseas Filipino"]||0),
                total_lf: Number(r["Total (L+F+Overseas)"]||0), total_male: Number(r["Total Male"]||0),
                total_female: Number(r["Total Female"]||0), total_mf: Number(r["Total (M+F)"]||0)
            };
            if (rec.id === undefined || rec.id === "") delete rec.id;
            return rec;
        });

        const tassRecs = taRows.map(r => {
            const rec = {
                id: r.ID || undefined, province: r.Province || 'Occidental Mindoro', municipality: r.Municipality,
                year: Number(r.Year), month: monthToNumber(r.Month), attraction: r["Tourist Attraction"],
                tm_m: Number(r["TM(M)"]||0), tm_f: Number(r["TM(F)"]||0), tm_sum: Number(r["TM(SUM)"]||0),
                om_m: Number(r["OM(M)"]||0), om_f: Number(r["OM(F)"]||0), om_sum: Number(r["OM(SUM)"]||0),
                fcr_m: Number(r["FCR(M)"]||0), fcr_f: Number(r["FCR(F)"]||0), fcr_sum: Number(r["FCR(SUM)"]||0),
                total_male: Number(r["Total Male"]||0), total_female: Number(r["Total Female"]||0), grand_total: Number(r["Grand Total"]||0)
            };
            if (rec.id === undefined || rec.id === "") delete rec.id;
            return rec;
        });

        // Single-transaction bulk replace instead of one awaited
        // transaction per row - restores in a fraction of the time.
        await clearAndBulkPut("aes", aeRecs);
        await clearAndBulkPut("tass", tassRecs);
        pendingSync.aes.clear();
        pendingSync.tass.clear();
        pendingDeletes.aes = [];
        pendingDeletes.tass = [];
        persistPendingSync();

        await loadAllRecords();
        const cloudSaved = await saveAllToCloud(false, true);
        refreshAllViews();
        showToast(cloudSaved ? "Database restored and saved to the shared cloud." : "Database restored locally, but cloud save failed.", cloudSaved ? "success" : "warning");
    } catch (err) {
        showToast("Failed to restore database: " + err.message, "danger");
    } finally {
        event.target.value = "";
    }
}

// ##############################################################################
// ##### SECTION: REPORT-DATE
// ##############################################################################

/**
 * REPORT DATE STAMP: fills the "Date generated" line in every report note
 * (on page load and again right before printing).
 */
(function () {
  function stampReportDate() {
    const d = new Date().toLocaleString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    document.querySelectorAll('.report-gen-date').forEach(el => { el.textContent = d; });
  }
  document.addEventListener('DOMContentLoaded', stampReportDate);
  window.addEventListener('beforeprint', stampReportDate);
})();

// ##############################################################################
// ##### SECTION: MAIN
// ##############################################################################

/**
 * STARTUP: runs when the page loads (login -> load local data -> sync cloud -> render).
 * Keep this file LAST in the <script> list in index.html.
 */

/**
 * INITIALIZATION & INDEXEDDB STORAGE SETUP
 */
window.onload = async function() {
    // Default year in the Add forms follows the calendar year
    ['ae_year', 'tass_year'].forEach(id => { const el = document.getElementById(id); if (el) el.value = CURRENT_YEAR; });
    try {
        // Wait for login before loading any data
        await setupAuth();
        if (!window.currentUser) return;
        if (appInitialized) return;
        appInitialized = true;

        loadPendingSync();
        await initIndexedDB();
        await loadAllRecords();

        // Render whatever is already cached locally right away instead
        // of leaving the UI blank/frozen while we wait on the network -
        // this is what makes the app feel responsive instead of hanging.
        if (aeRecords.length || tassRecords.length) refreshAllViews();

        // Firestore is the shared source of truth. If it already contains
        // data, use it in this browser. If Firestore is empty but this
        // browser has existing IndexedDB data, migrate that data once.
        const cloud = await loadAllFromCloud();
        if (cloud.connected && cloud.hasData) {
            refreshAllViews();
        } else if (cloud.connected && !cloud.hasData && (aeRecords.length || tassRecords.length)) {
            await saveAllToCloud(false, true);
            refreshAllViews();
            showToast("Existing local records were migrated to the shared cloud database.", "success");
        } else if (!cloud.connected) {
            if (aeRecords.length === 0 && tassRecords.length === 0) {
                // Demo records are no longer auto-created; show the empty state instead.
                refreshAllViews();
            } else {
                refreshAllViews();
            }
        } else {
            // Cloud is connected but empty and there is no local data.
            // Keep the database empty rather than silently creating demo data.
            refreshAllViews();
            showToast("Cloud database is connected and currently empty. Upload or encode data to begin.", "info");
        }
        // If a previous session had edits that never made it to the
        // cloud (offline, tab closed, failed write), quietly retry them
        // now that we're connected - without re-uploading everything else.
        if (cloud.connected && pendingSyncCount() > 0) {
            saveAllToCloud(false).catch(() => {});
        }
    } catch (err) {
        console.error("Database initialization failed:", err);
        updateCloudStatus("Local Cache Only");
        if (aeRecords.length === 0 && tassRecords.length === 0) {
            // Demo records are no longer auto-created; show the empty state instead.
            try { refreshAllViews(); } catch (_) {}
        } else {
            refreshAllViews();
        }
    }

    document.getElementById('mobileMenuBtn').addEventListener('click', function() {
        const sidebar = document.getElementById('sidebar');
        sidebar.classList.toggle('hidden');
    });

    // Country of Origin (Form A) records load independently and never block main init
    syncCountryRecordsFromCloud().then(() => {
        populateCountryYearSelect();
        if (document.getElementById('view-country-origin') && !document.getElementById('view-country-origin').classList.contains('hidden')) {
            renderCountryReport();
        }
    }).catch(() => {});
};
