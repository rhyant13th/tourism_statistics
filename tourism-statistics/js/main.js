/**
 * STARTUP: runs when the page loads (login -> load local data -> sync cloud -> render).
 * Keep this file LAST in the <script> list in index.html.
 */

/**
 * INITIALIZATION & INDEXEDDB STORAGE SETUP
 */
window.onload = async function() {
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
