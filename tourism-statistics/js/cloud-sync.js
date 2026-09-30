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
