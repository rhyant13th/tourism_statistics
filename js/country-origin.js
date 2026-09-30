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
