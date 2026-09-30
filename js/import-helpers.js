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
    if(periods.length>1)throw new Error(`The upload contains ${periods.length} reporting periods (${formatReportingPeriods(periods)}). Please upload one Year + Month per file.`);
    const existingCount=countRecordsForPeriods(inMemoryRecords,periods), periodText=formatReportingPeriods(periods);
    const message=existingCount>0?`Existing ${label} data was found for ${periodText}.\n\nThis will REPLACE ALL existing ${label} records for ${periodText}.\n\nOld records: ${existingCount.toLocaleString()}\nNew records: ${newRecords.length.toLocaleString()}\n\nOther months and years will remain unchanged.\n\nContinue?`:`This will save ${newRecords.length.toLocaleString()} ${label} records for ${periodText}.\n\nOther months and years will remain unchanged.\n\nContinue?`;
    if(!confirm(message))return false;
    // Cloud is the shared master copy. Only after the cloud replacement
    // succeeds do we update this browser's IndexedDB cache.
    await replacePeriodInCloud(storeName, newRecords, periods);
    const savedRecords=await replacePeriodsInStore(storeName,newRecords,periods); const periodKeys=new Set(periods.map(p=>`${p.year}-${p.month}`)); const retained=inMemoryRecords.filter(r=>!periodKeys.has(`${Number(r.year)}-${Number(r.month)}`)); inMemoryRecords.splice(0,inMemoryRecords.length,...retained,...savedRecords); updateCloudStatus("Cloud Saved", true); return true;
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
