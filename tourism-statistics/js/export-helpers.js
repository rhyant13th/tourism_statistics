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
