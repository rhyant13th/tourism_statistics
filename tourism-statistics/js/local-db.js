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
