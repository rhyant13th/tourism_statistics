/**
 * TREND COMPARISON: compare two years (e.g. 2025 vs 2026) by month or by year,
 * for Tourist Arrivals (AEs), Same-Day Visitors (TAss), or both.
 * Shows summary cards (increasing / declining), a data table, graphs, and Excel export.
 */

const CMP_SHORT = { ae: 'AEs', tass: 'TAss', combined: 'Combined' };
const CMP_LABELS = { ae: 'Tourist Arrivals (AEs)', tass: 'Same-Day Visitors (TAss)', combined: 'Combined Visitors' };
const CMP_COLOR_A = '#f59e0b';
const CMP_COLOR_B = '#0f766e';
const cmpCharts = {};
let cmpExportData = null;

function cmpEl(id) { return document.getElementById(id); }
function cmpEsc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function cmpSigned(n) { return (n > 0 ? '+' : '') + n.toLocaleString(); }

/** Fill the Year A / Year B / Municipality dropdowns from the saved data. */
function populateCompareControls() {
    const yA = cmpEl('cmpYearA'), yB = cmpEl('cmpYearB'), mu = cmpEl('cmpMuni');
    if (!yA || !yB || !mu) return;
    const years = new Set(), munis = new Set();
    aeRecords.concat(tassRecords).forEach(r => {
        if (r.year) years.add(Number(r.year));
        if (r.municipality) munis.add(r.municipality);
    });
    const sy = Array.from(years).sort((a, b) => b - a);
    const html = sy.length ? sy.map(y => `<option value="${y}">${y}</option>`).join('') : '<option value="">No data</option>';
    const prevA = yA.value, prevB = yB.value, prevM = mu.value;
    yA.innerHTML = html;
    yB.innerHTML = html;
    // Default: latest year (B) compared against the year before it (A)
    yB.value = (prevB && sy.includes(Number(prevB))) ? prevB : String(sy[0] || '');
    yA.value = (prevA && sy.includes(Number(prevA))) ? prevA : String(sy[1] || sy[0] || '');
    const sortedMunis = Array.from(munis).sort();
    mu.innerHTML = '<option value="ALL">All Municipalities</option>' +
        sortedMunis.map(m => `<option value="${cmpEsc(m)}">${cmpEsc(m)}</option>`).join('');
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

/** Two table cells (change + % change) with colour/arrow. */
function cmpChangeCells(a, b, ok) {
    if (!ok) return '<td class="p-2 text-right text-slate-300">—</td><td class="p-2 text-right text-slate-300">—</td>';
    const d = b - a;
    const cls = d > 0 ? 'text-emerald-700' : (d < 0 ? 'text-rose-600' : 'text-slate-500');
    const arrow = d > 0 ? '▲' : (d < 0 ? '▼' : '●');
    const pctTxt = a > 0 ? (d > 0 ? '+' : '') + ((d / a) * 100).toFixed(1) + '%' : (b > 0 ? 'new' : '—');
    return `<td class="p-2 text-right font-semibold ${cls}">${cmpSigned(d)}</td><td class="p-2 text-right font-semibold ${cls}">${arrow} ${pctTxt}</td>`;
}
function cmpChangeExport(a, b, ok) {
    if (!ok) return ['', ''];
    const d = b - a;
    return [d, a > 0 ? Number(((d / a) * 100).toFixed(1)) : ''];
}

function cmpDestroy(id) { if (cmpCharts[id]) { cmpCharts[id].destroy(); delete cmpCharts[id]; } }

function cmpDrawLine(canvasId, title, labelA, labelB, dataA, dataB) {
    cmpDestroy(canvasId);
    cmpCharts[canvasId] = new Chart(cmpEl(canvasId).getContext('2d'), {
        type: 'line',
        data: {
            labels: MONTH_NAMES.map(m => m.substring(0, 3)),
            datasets: [
                { label: labelA, data: dataA, borderColor: CMP_COLOR_A, backgroundColor: CMP_COLOR_A, tension: 0.3, spanGaps: false, pointRadius: 4 },
                { label: labelB, data: dataB, borderColor: CMP_COLOR_B, backgroundColor: CMP_COLOR_B, tension: 0.3, spanGaps: false, pointRadius: 4 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { position: 'bottom' },
                datalabels: { display: false },
                tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.parsed.y === null ? 'no data' : c.parsed.y.toLocaleString()}` } }
            },
            scales: { y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString() } } }
        }
    });
}

function cmpDrawBar(canvasId, labels, labelA, labelB, dataA, dataB) {
    cmpDestroy(canvasId);
    const hasDL = (typeof ChartDataLabels !== 'undefined');
    cmpCharts[canvasId] = new Chart(cmpEl(canvasId).getContext('2d'), {
        type: 'bar',
        plugins: hasDL ? [ChartDataLabels] : [],
        data: {
            labels,
            datasets: [
                { label: labelA, data: dataA, backgroundColor: CMP_COLOR_A, borderRadius: 4 },
                { label: labelB, data: dataB, backgroundColor: CMP_COLOR_B, borderRadius: 4 }
            ]
        },
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

function cmpEmpty(msg) {
    cmpEl('cmpSummary').innerHTML = '';
    cmpEl('cmpNotice').innerHTML = '';
    cmpEl('cmpHead').innerHTML = '';
    cmpEl('cmpTableBody').innerHTML = `<tr><td class="p-6 text-center text-slate-400">${msg}</td></tr>`;
    cmpEl('cmpFoot').innerHTML = '';
    cmpDestroy('chartCmp1'); cmpDestroy('chartCmp2');
    cmpEl('cmpChartBox2').classList.add('hidden');
    cmpExportData = null;
    cmpClearBreakdown();
}

function renderComparison() {
    if (!cmpEl('view-comparison')) return;
    if (!cmpEl('cmpYearA').options.length || !cmpEl('cmpYearA').value) populateCompareControls();

    const dataset = cmpEl('cmpDataset').value;      // ae | tass | both
    const mode = cmpEl('cmpMode').value;             // monthly | yearly
    const yA = Number(cmpEl('cmpYearA').value), yB = Number(cmpEl('cmpYearB').value);
    const muni = cmpEl('cmpMuni').value || 'ALL';
    const same = cmpEl('cmpSameMonths').checked;

    if (!yA || !yB) { cmpEmpty('No saved data yet. Upload or encode records first.'); return; }

    const A = cmpAggregate(yA, muni), B = cmpAggregate(yB, muni);
    const base = dataset === 'both' ? ['ae', 'tass'] : [dataset];
    const keys = dataset === 'both' ? ['ae', 'tass', 'combined'] : [dataset];
    const scope = muni === 'ALL' ? 'All Municipalities' : muni;
    const dsLabel = dataset === 'both' ? 'AEs + TAss (Both)' : CMP_LABELS[dataset];

    cmpEl('cmpTitleLbl').textContent = `${mode === 'monthly' ? 'Monthly' : 'Yearly'} Comparison: ${yA} vs ${yB}`;
    cmpEl('cmpScopeLbl').textContent = `${dsLabel} | ${scope}`;

    // Months that have data in BOTH years for the selected dataset(s)
    const mask = A.map((_, i) => !same || base.every(k => cmpHas(A[i], k) && cmpHas(B[i], k)));
    const monthsA = A.filter(x => base.every(k => cmpHas(x, k))).length;
    const monthsB = B.filter(x => base.every(k => cmpHas(x, k))).length;
    const used = mask.filter(Boolean).length;
    const usedNames = MONTH_NAMES.filter((_, i) => mask[i]).map(m => m.substring(0, 3)).join(', ');

    let notice = `<i class="fa-solid fa-circle-info mr-1"></i> Months with data: <strong>${yA}</strong> = ${monthsA}, <strong>${yB}</strong> = ${monthsB}. `;
    if (same) {
        notice += used
            ? `Totals use only the ${used} month(s) present in both years (${usedNames}) so the comparison is fair.`
            : 'The two years have no month in common, so there is nothing to total.';
    } else if (monthsA !== monthsB) {
        notice += '<strong class="text-amber-700">The years do not cover the same number of months, so totals may mislead. Tick "same months only" for a fair comparison.</strong>';
    }
    if (yA === yB) notice += ' <strong class="text-amber-700">Year A and Year B are the same year.</strong>';
    cmpEl('cmpNotice').innerHTML = notice;

    const sum = (arr, fn) => arr.reduce((s, x, i) => s + (mask[i] ? fn(x) : 0), 0);

    // ---- Summary cards (totals over the compared months) ----
    const totals = {};
    keys.forEach(k => { totals[k] = { a: sum(A, x => cmpValue(x, k)), b: sum(B, x => cmpValue(x, k)) }; });

    cmpEl('cmpSummary').innerHTML = keys.map(k => {
        const t = totals[k], tr = cmpTrend(t.a, t.b), d = t.b - t.a;
        const pctTxt = tr.pct === null ? (t.b > 0 && t.a === 0 ? 'new' : '—') : (tr.pct > 0 ? '+' : '') + tr.pct.toFixed(1) + '%';
        let extra = '';
        if (mode === 'monthly') {
            let up = 0, down = 0, n = 0;
            for (let i = 0; i < 12; i++) {
                if (!(cmpHas(A[i], k) && cmpHas(B[i], k) && mask[i])) continue;
                n++;
                const va = cmpValue(A[i], k), vb = cmpValue(B[i], k);
                if (vb > va) up++; else if (vb < va) down++;
            }
            extra = `<p class="text-[11px] text-slate-500 mt-2">${yB} was higher in <strong>${up}</strong> and lower in <strong>${down}</strong> of ${n} comparable month(s).</p>`;
        }
        return `<div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <div class="flex items-start justify-between gap-2">
                <p class="text-xs font-bold text-slate-500 uppercase">${CMP_LABELS[k]}</p>
                <span class="px-2 py-1 rounded-full text-[11px] font-bold ${tr.badge}"><i class="fa-solid ${tr.icon} mr-1"></i>${tr.label}</span>
            </div>
            <p class="text-2xl font-extrabold text-slate-800 mt-2">${pctTxt}</p>
            <p class="text-xs text-slate-500 mt-1">${cmpSigned(d)} visitors from ${yA} to ${yB}</p>
            <div class="grid grid-cols-2 gap-2 mt-3 text-xs">
                <div class="bg-amber-50 rounded-lg p-2"><span class="text-slate-500">${yA}</span><br><strong class="text-amber-800 text-sm">${t.a.toLocaleString()}</strong></div>
                <div class="bg-teal-50 rounded-lg p-2"><span class="text-slate-500">${yB}</span><br><strong class="text-teal-800 text-sm">${t.b.toLocaleString()}</strong></div>
            </div>
            ${extra}
        </div>`;
    }).join('');

    const exportHead = [], exportRows = [];
    let numericCols = [];

    if (mode === 'monthly') {
        // ---- Monthly table ----
        let head1 = '<tr class="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-300"><th class="p-2 border" rowspan="2">Month</th>';
        let head2 = '<tr class="bg-slate-50 text-slate-600 font-bold border-b border-slate-300">';
        exportHead.push('Month');
        keys.forEach(k => {
            head1 += `<th class="p-2 border text-center" colspan="4">${CMP_LABELS[k]}</th>`;
            head2 += `<th class="p-2 border text-right">${yA}</th><th class="p-2 border text-right">${yB}</th><th class="p-2 border text-right">Change</th><th class="p-2 border text-right">% Change</th>`;
            exportHead.push(`${CMP_SHORT[k]} ${yA}`, `${CMP_SHORT[k]} ${yB}`, `${CMP_SHORT[k]} Change`, `${CMP_SHORT[k]} % Change`);
        });
        cmpEl('cmpHead').innerHTML = head1 + '</tr>' + head2 + '</tr>';

        let body = '';
        for (let i = 0; i < 12; i++) {
            const dim = (same && !mask[i]) ? ' opacity-50' : '';
            let tr = `<tr class="hover:bg-slate-50 border-b${dim}"><td class="p-2 font-bold text-slate-800">${MONTH_NAMES[i]}</td>`;
            const exRow = [MONTH_NAMES[i]];
            keys.forEach(k => {
                const hA = cmpHas(A[i], k), hB = cmpHas(B[i], k);
                const a = cmpValue(A[i], k), b = cmpValue(B[i], k);
                tr += `<td class="p-2 text-right bg-amber-50/40">${hA ? a.toLocaleString() : '<span class="text-slate-300">—</span>'}</td>`;
                tr += `<td class="p-2 text-right bg-teal-50/40">${hB ? b.toLocaleString() : '<span class="text-slate-300">—</span>'}</td>`;
                tr += cmpChangeCells(a, b, hA && hB);
                exRow.push(hA ? a : '', hB ? b : '', ...cmpChangeExport(a, b, hA && hB));
            });
            body += tr + '</tr>';
            exportRows.push(exRow);
        }
        cmpEl('cmpTableBody').innerHTML = body;

        let foot = `<tr><td class="p-2">TOTAL${same ? ' (same months)' : ''}</td>`;
        const exFoot = ['TOTAL'];
        keys.forEach(k => {
            const t = totals[k];
            foot += `<td class="p-2 text-right">${t.a.toLocaleString()}</td><td class="p-2 text-right">${t.b.toLocaleString()}</td>`;
            foot += cmpChangeCells(t.a, t.b, true).replace(/text-emerald-700/g, 'text-emerald-300').replace(/text-rose-600/g, 'text-rose-300').replace(/text-slate-500/g, 'text-slate-300');
            exFoot.push(t.a, t.b, ...cmpChangeExport(t.a, t.b, true));
        });
        cmpEl('cmpFoot').innerHTML = foot + '</tr>';
        exportRows.push(exFoot);
        numericCols = exportHead.map((_, c) => c).filter(c => c > 0 && ((c - 1) % 4) < 3);

        // ---- Monthly charts (one line chart per dataset) ----
        const chartKeys = dataset === 'both' ? ['ae', 'tass'] : [dataset];
        chartKeys.forEach((k, idx) => {
            const n = idx + 1;
            cmpEl('cmpChartTitle' + n).textContent = `${CMP_LABELS[k]} — month by month`;
            cmpDrawLine('chartCmp' + n, CMP_LABELS[k], String(yA), String(yB),
                A.map(x => cmpHas(x, k) ? cmpValue(x, k) : null),
                B.map(x => cmpHas(x, k) ? cmpValue(x, k) : null));
        });
        cmpEl('cmpChartBox2').classList.toggle('hidden', chartKeys.length < 2);
        if (chartKeys.length < 2) cmpDestroy('chartCmp2');
    } else {
        // ---- Yearly table (totals + breakdown) ----
        const rows = [];
        const addAE = () => {
            rows.push(['Local Tourist', sum(A, x => x.local), sum(B, x => x.local), false]);
            rows.push(['Foreign Tourist', sum(A, x => x.foreign), sum(B, x => x.foreign), false]);
            rows.push(['Overseas Filipino', sum(A, x => x.overseas), sum(B, x => x.overseas), false]);
            rows.push(['TOTAL TOURIST ARRIVALS (AEs)', totals.ae.a, totals.ae.b, true]);
        };
        const addTA = () => {
            rows.push(['Same-Day (TM)', sum(A, x => x.tm), sum(B, x => x.tm), false]);
            rows.push(['Same-Day (OM)', sum(A, x => x.om), sum(B, x => x.om), false]);
            rows.push(['Same-Day (FCR)', sum(A, x => x.fcr), sum(B, x => x.fcr), false]);
            rows.push(['TOTAL SAME-DAY VISITORS (TAss)', totals.tass.a, totals.tass.b, true]);
        };
        if (dataset !== 'tass') addAE();
        if (dataset !== 'ae') addTA();
        if (dataset === 'both') rows.push(['COMBINED VISITORS', totals.combined.a, totals.combined.b, true]);

        cmpEl('cmpHead').innerHTML = `<tr class="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-300">
            <th class="p-2 border">Category</th><th class="p-2 border text-right">${yA}</th><th class="p-2 border text-right">${yB}</th>
            <th class="p-2 border text-right">Change</th><th class="p-2 border text-right">% Change</th></tr>`;
        exportHead.push('Category', String(yA), String(yB), 'Change', '% Change');
        cmpEl('cmpTableBody').innerHTML = rows.map(([label, a, b, isTotal]) =>
            `<tr class="border-b ${isTotal ? 'bg-slate-100 font-bold' : 'hover:bg-slate-50'}"><td class="p-2 ${isTotal ? 'text-slate-900' : 'text-slate-700'}">${label}</td>
             <td class="p-2 text-right">${a.toLocaleString()}</td><td class="p-2 text-right">${b.toLocaleString()}</td>${cmpChangeCells(a, b, true)}</tr>`).join('');
        rows.forEach(([label, a, b]) => exportRows.push([label, a, b, ...cmpChangeExport(a, b, true)]));
        cmpEl('cmpFoot').innerHTML = '';
        numericCols = [1, 2, 3];

        // ---- Yearly chart ----
        const chartRows = dataset === 'both' ? rows.filter(r => r[3]) : rows;
        cmpEl('cmpChartTitle1').textContent = `${yA} vs ${yB} — ${dsLabel}`;
        cmpDrawBar('chartCmp1', chartRows.map(r => r[0].replace('TOTAL ', 'Total ').replace('COMBINED VISITORS', 'Combined')),
            String(yA), String(yB), chartRows.map(r => r[1]), chartRows.map(r => r[2]));
        cmpEl('cmpChartBox2').classList.add('hidden');
        cmpDestroy('chartCmp2');
    }

    cmpExportData = {
        title: `${mode === 'monthly' ? 'MONTHLY' : 'YEARLY'} TOURISM TREND COMPARISON`,
        sub: `${yA} vs ${yB} | ${dsLabel} | ${scope}${same ? ' | Same months only' : ''}`,
        head: exportHead, rows: exportRows, numericCols,
        file: `Tourism_Comparison_${mode}_${yA}_vs_${yB}.xlsx`
    };
    cmpRenderBreakdown();
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
 * Uses the same Data, Year A, Year B and "same months only" choices as the main comparison.
 */
let cmpBreakExport = null;

function cmpClearBreakdown() {
    if (!cmpEl('cmpBreakBody')) return;
    cmpEl('cmpBreakSummary').innerHTML = '';
    cmpEl('cmpBreakHead').innerHTML = '';
    cmpEl('cmpBreakBody').innerHTML = '';
    cmpDestroy('chartCmpBreak');
    cmpBreakExport = null;
}

function cmpRenderBreakdown() {
    if (!cmpEl('cmpBreakBody')) return;
    const dataset = cmpEl('cmpDataset').value;
    const yA = Number(cmpEl('cmpYearA').value), yB = Number(cmpEl('cmpYearB').value);
    const muniFilter = cmpEl('cmpMuni').value || 'ALL';
    const same = cmpEl('cmpSameMonths').checked;
    const by = cmpEl('cmpBreakBy').value;        // muni | entity
    const sortBy = cmpEl('cmpBreakSort').value;  // decline | increase | volume | name
    if (!yA || !yB) { cmpClearBreakdown(); return; }

    // Months that have data in both years (whole province, so every row is judged on the same months)
    const A0 = cmpAggregate(yA, 'ALL'), B0 = cmpAggregate(yB, 'ALL');
    const base = dataset === 'both' ? ['ae', 'tass'] : [dataset];
    const mask = A0.map((_, i) => !same || base.every(k => cmpHas(A0[i], k) && cmpHas(B0[i], k)));

    const items = new Map();
    const add = (list, kind) => {
        list.forEach(r => {
            const y = Number(r.year);
            if (y !== yA && y !== yB) return;
            if (!(r.month >= 1 && r.month <= 12) || !mask[r.month - 1]) return;
            if (by === 'entity' && muniFilter !== 'ALL' && r.municipality !== muniFilter) return;
            const v = kind === 'ae'
                ? Number(r.local_tourist || 0) + Number(r.foreign_tourist || 0) + Number(r.overseas_filipino || 0)
                : Number(r.tm_sum || 0) + Number(r.om_sum || 0) + Number(r.fcr_sum || 0);
            const muni = r.municipality || 'Unspecified';
            const name = by === 'muni' ? muni : ((kind === 'ae' ? r.establishment : r.attraction) || 'Unspecified');
            const key = by === 'muni' ? name : `${kind}||${muni}||${name}`;
            if (!items.has(key)) items.set(key, { name, muni, kind, a: 0, b: 0 });
            const it = items.get(key);
            if (y === yA) it.a += v; else it.b += v;
        });
    };
    if (dataset !== 'tass') add(aeRecords, 'ae');
    if (dataset !== 'ae') add(tassRecords, 'tass');

    const list = Array.from(items.values()).map(x => ({ ...x, diff: x.b - x.a, pct: x.a > 0 ? ((x.b - x.a) / x.a) * 100 : null }));
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
        ? `<strong>${list.length.toLocaleString()}</strong> ${what} compared (${yA} → ${yB}${same ? ', same months only' : ''}): ` +
          `<span class="font-bold text-emerald-700">${up} increasing</span>, <span class="font-bold text-rose-600">${down} declining</span>, ${flat} unchanged.`
        : `No ${what} found for this selection.`;

    // ---- Table ----
    const showEntityCols = by === 'entity';
    const thLabel = by === 'muni' ? 'Municipality' : (dataset === 'both' ? 'Establishment / Attraction' : (dataset === 'ae' ? 'Establishment' : 'Attraction'));
    cmpEl('cmpBreakHead').innerHTML = `<tr class="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-300">
        <th class="p-2 border text-center">#</th><th class="p-2 border">${thLabel}</th>
        ${showEntityCols ? '<th class="p-2 border">Municipality</th>' + (dataset === 'both' ? '<th class="p-2 border">Type</th>' : '') : ''}
        <th class="p-2 border text-right">${yA}</th><th class="p-2 border text-right">${yB}</th>
        <th class="p-2 border text-right">Change</th><th class="p-2 border text-right">% Change</th><th class="p-2 border text-center">Trend</th></tr>`;

    cmpEl('cmpBreakBody').innerHTML = list.map((x, i) => {
        const tr = cmpTrend(x.a, x.b);
        const typeTxt = x.kind === 'ae' ? 'AE' : 'TAss';
        return `<tr class="hover:bg-slate-50 border-b">
            <td class="p-2 text-center text-slate-400">${i + 1}</td>
            <td class="p-2 font-bold text-slate-800">${cmpEsc(x.name)}</td>
            ${showEntityCols ? `<td class="p-2 text-slate-600">${cmpEsc(x.muni)}</td>` + (dataset === 'both' ? `<td class="p-2 text-slate-600">${typeTxt}</td>` : '') : ''}
            <td class="p-2 text-right bg-amber-50/40">${x.a.toLocaleString()}</td>
            <td class="p-2 text-right bg-teal-50/40">${x.b.toLocaleString()}</td>
            ${cmpChangeCells(x.a, x.b, true)}
            <td class="p-2 text-center"><span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${tr.badge}">${tr.label}</span></td>
        </tr>`;
    }).join('') || `<tr><td colspan="9" class="p-6 text-center text-slate-400">No data for this selection.</td></tr>`;

    // ---- Chart: biggest movers (up to 10 increases + 10 declines), as change in visitors ----
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
                datasets: [{ label: `Change (${yA} → ${yB})`, data: chartItems.map(x => x.diff), backgroundColor: chartItems.map(x => x.diff >= 0 ? '#059669' : '#e11d48'), borderRadius: 4 }]
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
    head.push(String(yA), String(yB), 'Change', '% Change');
    const rows = list.map((x, i) => {
        const r = [i + 1, x.name];
        if (showEntityCols) { r.push(x.muni); if (dataset === 'both') r.push(x.kind === 'ae' ? 'AE' : 'TAss'); }
        r.push(x.a, x.b, x.diff, x.pct === null ? '' : Number(x.pct.toFixed(1)));
        return r;
    });
    const firstNum = head.length - 4;
    cmpBreakExport = {
        title: by === 'muni' ? 'TOURISM TREND BY MUNICIPALITY' : 'TOURISM TREND BY ESTABLISHMENT / ATTRACTION',
        sub: `${yA} vs ${yB} | ${dataset === 'both' ? 'AEs + TAss' : CMP_LABELS[dataset]}${by === 'entity' && muniFilter !== 'ALL' ? ' | ' + muniFilter : ''}${same ? ' | Same months only' : ''}`,
        head, rows, numericCols: [firstNum, firstNum + 1, firstNum + 2],
        file: `Tourism_Trend_${by === 'muni' ? 'Municipality' : 'Entity'}_${yA}_vs_${yB}.xlsx`
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
