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
                pendingBulkAE.push({ record, isUpdate: true, existingId: existing.id });
                updateCount++;
            } else {
                pendingBulkAE.push({ record, isUpdate: false });
                newCount++;
            }
        }

        document.getElementById('bulkAENewCount').innerText = newCount;
        document.getElementById('bulkAEUpdateCount').innerText = updateCount;
        document.getElementById('bulkAESkippedCount').innerText = skippedCount;
        document.getElementById('bulkAESummary').classList.remove('hidden');

        const previewBody = document.getElementById('bulkAEPreviewBody');
        previewBody.innerHTML = '';
        pendingBulkAE.slice(0, 50).forEach(item => {
            const r = item.record;
            previewBody.innerHTML += `<tr class="border-b">
                        <td class="p-2 font-bold ${item.isUpdate ? 'text-amber-600' : 'text-emerald-600'}">${item.isUpdate ? 'UPDATE' : 'NEW'}</td>
                        <td class="p-2">${r.municipality}</td>
                        <td class="p-2 font-semibold">${r.establishment}</td>
                        <td class="p-2">${r.year} / ${MONTH_NAMES[r.month-1]}</td>
                        <td class="p-2">${r.local_tourist}</td>
                        <td class="p-2">${r.foreign_tourist}</td>
                        <td class="p-2 font-bold">${r.total_lf}</td>
                        <td class="p-2 text-slate-400">Valid</td>
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
        const importCount = pendingBulkAE.length;
        const replaced = await replaceBulkByReportingPeriod("aes", aeRecords, pendingBulkAE, "Tourist Arrival");
        if (!replaced) return;
        pendingBulkAE = [];
        document.getElementById('btnSaveBulkAE').disabled = true;
        document.getElementById('btnConfirmBulkAE').disabled = true;
        closeModal('modalBulkAE');
        refreshAllViews();
        showToast(`Tourist Arrival import complete. ${importCount.toLocaleString()} records saved. Only the uploaded Year/Month period was replaced.`, "success");
    } catch (err) {
        console.error(err);
        showToast("Unable to save Tourist Arrival data: " + err.message, "danger");
    }
}

function exportAEsExcel(year=null,month='ALL'){if(!requireAdmin('download data'))return;const source=year==null?aeRecords:aeRecords.filter(r=>Number(r.year)===Number(year)&&(month==='ALL'||Number(r.month)===Number(month)));if(!source.length){showToast('No Tourist Arrival records match the selected period.','warning');return;}const headers=["Province","Municipality","Year","Month","Accommodation Establishment","Type Class","Local Tourist","Foreign Tourist","Overseas Filipino","Total (L+F+Overseas)","Total Male","Total Female","Total (M+F)"];const rows=source.map(r=>[r.province,r.municipality,r.year,MONTH_NAMES[r.month-1],r.establishment,r.type_class||'',Number(r.local_tourist||0),Number(r.foreign_tourist||0),Number(r.overseas_filipino||0),Number(r.local_tourist||0)+Number(r.foreign_tourist||0)+Number(r.overseas_filipino||0),Number(r.total_male||0),Number(r.total_female||0),Number(r.total_mf||0)]);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,makeDataSheet(headers,rows,[2,6,7,8,9,10,11,12]),'AEs Data');XLSX.utils.book_append_sheet(wb,makeInfoSheet('Tourist Arrivals – Accommodation Establishments (AEs)',`Export period: ${year==null?'All Saved Data':`${year} - ${month==='ALL'?'All Months':MONTH_NAMES[month-1]}`}`),'Info');saveWorkbook(wb,`Tourist_Arrivals_AEs_${year==null?'All_Data':`${year}_${month==='ALL'?'All_Months':MONTH_NAMES[month-1]}`}.xlsx`);}

function downloadAETemplate() { if (!requireAdmin('download data')) return;
    const headers = ["Province/HUC/ICC","Municipality/City","Year","Month","Accommodation Establishment","Type-Class","Local Tourist","Foreign Tourist","Overseas Filipino","Total (L+F)","Total Male","Total Female","Total (M+F)"];
    const sample = ["Occidental Mindoro","Mamburao",2026,1,"Sample Establishment","Hotel",0,0,0,0,0,0,0];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, makeDataSheet(headers,[sample],[2,6,7,8,9,10,11,12]),"AEs Data");
    XLSX.utils.book_append_sheet(wb, makeInfoSheet("AEs Excel Upload Template","Enter one record per row. Month must be numeric (January=1 ... December=12); month names are also accepted. Year must be a 4-digit number. Total (L+F) and Total (M+F) are recalculated by the system - you may leave them blank or fill them in for reference, but do not enter formulas."),"Instructions");
    saveWorkbook(wb, "Tourism_AEs_Excel_Upload_Template.xlsx");
}
