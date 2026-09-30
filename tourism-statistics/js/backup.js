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
