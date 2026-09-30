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
                pendingBulkTAss.push({ record, isUpdate: true, existingId: existing.id });
                updateCount++;
            } else {
                pendingBulkTAss.push({ record, isUpdate: false });
                newCount++;
            }
        }

        document.getElementById('bulkTAssNewCount').innerText = newCount;
        document.getElementById('bulkTAssUpdateCount').innerText = updateCount;
        document.getElementById('bulkTAssSkippedCount').innerText = skippedCount;
        document.getElementById('bulkTAssSummary').classList.remove('hidden');

        const previewBody = document.getElementById('bulkTAssPreviewBody');
        previewBody.innerHTML = '';
        pendingBulkTAss.slice(0, 50).forEach(item => {
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
                        <td class="p-2 text-slate-400">Valid</td>
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
        const importCount = pendingBulkTAss.length;
        const replaced = await replaceBulkByReportingPeriod("tass", tassRecords, pendingBulkTAss, "Same-Day Visitor");
        if (!replaced) return;
        pendingBulkTAss = [];
        document.getElementById('btnSaveBulkTAss').disabled = true;
        document.getElementById('btnConfirmBulkTAss').disabled = true;
        closeModal('modalBulkTAss');
        refreshAllViews();
        showToast(`Same-Day Visitor import complete. ${importCount.toLocaleString()} records saved. Only the uploaded Year/Month period was replaced.`, "success");
    } catch (err) {
        console.error(err);
        showToast("Unable to save Same-Day Visitor data: " + err.message, "danger");
    }
}

function exportTAssExcel(year=null,month='ALL'){if(!requireAdmin('download data'))return;const source=year==null?tassRecords:tassRecords.filter(r=>Number(r.year)===Number(year)&&(month==='ALL'||Number(r.month)===Number(month)));if(!source.length){showToast('No Same-Day Visitor records match the selected period.','warning');return;}const headers=["Province","Municipality","Year","Month","Tourist Attraction","TM(M)","TM(F)","TM(SUM)","OM(M)","OM(F)","OM(SUM)","FCR(M)","FCR(F)","FCR(SUM)","Total Male","Total Female","Grand Total"];const rows=source.map(r=>[r.province,r.municipality,r.year,MONTH_NAMES[r.month-1],r.attraction,Number(r.tm_m||0),Number(r.tm_f||0),Number(r.tm_sum||0),Number(r.om_m||0),Number(r.om_f||0),Number(r.om_sum||0),Number(r.fcr_m||0),Number(r.fcr_f||0),Number(r.fcr_sum||0),Number(r.total_male||0),Number(r.total_female||0),Number(r.grand_total||0)]);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,makeDataSheet(headers,rows,[2,5,6,7,8,9,10,11,12,13,14,15,16]),'TAss Data');XLSX.utils.book_append_sheet(wb,makeInfoSheet('Same-Day Visitors – Tourist Attraction Arrivals (TAss)',`Export period: ${year==null?'All Saved Data':`${year} - ${month==='ALL'?'All Months':MONTH_NAMES[month-1]}`}`),'Info');saveWorkbook(wb,`SameDay_Visitors_TAss_${year==null?'All_Data':`${year}_${month==='ALL'?'All_Months':MONTH_NAMES[month-1]}`}.xlsx`);}

function downloadTAssTemplate() { if (!requireAdmin('download data')) return;
    const headers = ["Province/HUC/ICC","Municipality/City","Year","Month","Tourist Attraction","TM(M)","TM(F)","TM(SUM)","OM(M)","OM(F)","OM(SUM)","FCR(M)","FCR(F)","FCR(SUM)","Total Male","Total Female","Grand Total"];
    const sample = ["Occidental Mindoro","Mamburao",2026,1,"Sample Attraction",0,0,0,0,0,0,0,0,0,0,0,0];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, makeDataSheet(headers,[sample],[2,5,6,7,8,9,10,11,12,13,14,15,16]),"TAss Data");
    XLSX.utils.book_append_sheet(wb, makeInfoSheet("TAss Excel Upload Template","Enter one record per row. Month must be numeric (January=1 ... December=12); month names are also accepted. Year must be a 4-digit number. SUM/Total/Grand Total columns are recalculated by the system - you may leave them blank or fill them in for reference, but do not enter formulas."),"Instructions");
    saveWorkbook(wb, "Tourism_TAss_Excel_Upload_Template.xlsx");
}
