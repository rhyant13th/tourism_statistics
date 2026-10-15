/**
 * REPORTS - TOP 10 LISTS: top accommodation establishments, top tourist attractions,
 * top municipalities, and their Excel exports.
 */

/**
 * SECTION 7: TOP 10 ACCOMMODATION ESTABLISHMENTS RANKINGS
 */
function renderTopAEReport() {
    const yr = document.getElementById('topAEYear').value || 2026;
    const mo = document.getElementById('topAEMonth').value;
    const mu = document.getElementById('topAEMuni').value;

    // Group by Establishment
    const estMap = {};
    aeRecords.forEach(r => {
        if (r.year != yr) return;
        if (mo !== 'ALL' && r.month != mo) return;
        if (mu !== 'ALL' && r.municipality !== mu) return;

        const key = `${r.establishment}||${r.municipality}`;
        if (!estMap[key]) {
            estMap[key] = { establishment: r.establishment, municipality: r.municipality, type: r.type_class || 'N/A', count: 0 };
        }
        estMap[key].count += Number(r.total_lf || 0);
    });

    const sorted = Object.values(estMap).sort((a,b) => b.count - a.count).slice(0, 10);
    const tbody = document.getElementById('topAEBody');
    tbody.innerHTML = '';

    if (!sorted.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">No data found for selected period.</td></tr>`;
    } else {
        sorted.forEach((item, idx) => {
            const badgeClass = idx === 0 ? 'bg-amber-100 text-amber-800 font-bold' : (idx === 1 ? 'bg-slate-200 text-slate-700' : (idx === 2 ? 'bg-amber-700/20 text-amber-900' : 'bg-slate-100 text-slate-600'));
            tbody.innerHTML += `<tr class="hover:bg-slate-50 border-b">
                        <td class="p-3 text-center"><span class="px-2 py-1 rounded-full text-xs ${badgeClass}">#${idx+1}</span></td>
                        <td class="p-3 font-bold text-slate-800">${item.establishment}</td>
                        <td class="p-3">${item.municipality}</td>
                        <td class="p-3 text-slate-500">${item.type}</td>
                        <td class="p-3 text-right font-extrabold text-teal-700 text-sm">${item.count.toLocaleString()}</td>
                    </tr>`;
        });
    }

    // Top AE Doughnut Chart
    const ctx = document.getElementById('chartTopAE').getContext('2d');
    if (chartTopAEObj) chartTopAEObj.destroy();
    chartTopAEObj = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: sorted.map(x => x.establishment),
            datasets: [{
                data: sorted.map(x => x.count),
                backgroundColor: ['#0f766e', '#14b8a6', '#2dd4bf', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa', '#c084fc', '#f472b6', '#fb7185']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

/**
 * SECTION 8: TOP 10 TOURIST ATTRACTIONS RANKINGS
 */
function renderTopTAssReport() {
    const yr = document.getElementById('topTAssYear').value || 2026;
    const mo = document.getElementById('topTAssMonth').value;
    const mu = document.getElementById('topTAssMuni').value;

    const attrMap = {};
    tassRecords.forEach(r => {
        if (r.year != yr) return;
        if (mo !== 'ALL' && r.month != mo) return;
        if (mu !== 'ALL' && r.municipality !== mu) return;

        const key = `${r.attraction}||${r.municipality}`;
        if (!attrMap[key]) {
            attrMap[key] = { attraction: r.attraction, municipality: r.municipality, count: 0 };
        }
        attrMap[key].count += Number(r.grand_total || 0);
    });

    const sorted = Object.values(attrMap).sort((a,b) => b.count - a.count).slice(0, 10);
    const tbody = document.getElementById('topTAssBody');
    tbody.innerHTML = '';

    if (!sorted.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400">No attraction data found for selected period.</td></tr>`;
    } else {
        sorted.forEach((item, idx) => {
            const badgeClass = idx === 0 ? 'bg-amber-100 text-amber-800 font-bold' : (idx === 1 ? 'bg-slate-200 text-slate-700' : (idx === 2 ? 'bg-amber-700/20 text-amber-900' : 'bg-slate-100 text-slate-600'));
            tbody.innerHTML += `<tr class="hover:bg-slate-50 border-b">
                        <td class="p-3 text-center"><span class="px-2 py-1 rounded-full text-xs ${badgeClass}">#${idx+1}</span></td>
                        <td class="p-3 font-bold text-slate-800">${item.attraction}</td>
                        <td class="p-3">${item.municipality}</td>
                        <td class="p-3 text-right font-extrabold text-teal-700 text-sm">${item.count.toLocaleString()}</td>
                    </tr>`;
        });
    }

    // Top TAss Pie Chart
    const ctx = document.getElementById('chartTopTAss').getContext('2d');
    if (chartTopTAssObj) chartTopTAssObj.destroy();
    chartTopTAssObj = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: sorted.map(x => x.attraction),
            datasets: [{
                data: sorted.map(x => x.count),
                backgroundColor: ['#0d9488', '#06b6d4', '#0284c7', '#2563eb', '#4f46e5', '#7c3aed', '#9333ea', '#c026d3', '#db2777', '#e11d48']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

/**
 * SECTION 8B: TOP MUNICIPALITIES REPORT (per-year + overall all-years ranking)
 */
const TOP_MUNI_METRIC_LABELS = {
    combined: 'combined AEs + TAss visitor volume',
    ae: 'Tourist Arrivals (AEs)',
    tass: 'Same-Day Visitors (TAss)'
};

function getMuniCombinedMap(yr, metric = 'combined') {
    // yr === null means aggregate across every saved year (overall/all-years ranking)
    const map = {};
    aeRecords.forEach(r => {
        if (yr !== null && r.year != yr) return;
        const m = r.municipality || 'Unspecified';
        if (!map[m]) map[m] = { municipality: m, ae: 0, tass: 0 };
        map[m].ae += Number(r.total_lf || 0);
    });
    tassRecords.forEach(r => {
        if (yr !== null && r.year != yr) return;
        const m = r.municipality || 'Unspecified';
        if (!map[m]) map[m] = { municipality: m, ae: 0, tass: 0 };
        map[m].tass += Number(r.grand_total || 0);
    });
    return Object.values(map)
        .map(x => ({ ...x, combined: x.ae + x.tass }))
        .sort((a, b) => b[metric] - a[metric]);
}

function renderTopMunicipalitiesReport() {
    const yr = document.getElementById('topMuniYear').value || 2026;
    const metric = document.getElementById('topMuniMetric').value || 'combined';
    const yearFilter = (yr === 'ALL') ? null : yr;
    document.getElementById('topMuniYearLbl').innerText = (yr === 'ALL') ? 'All Years' : yr;
    document.getElementById('topMuniMetricLbl').innerText = TOP_MUNI_METRIC_LABELS[metric];
    document.getElementById('topMuniMetricLblOverall').innerText = TOP_MUNI_METRIC_LABELS[metric];

    // Highlight whichever column is the active ranking metric
    const colAE = document.getElementById('topMuniColAE');
    const colTAss = document.getElementById('topMuniColTAss');
    const colCombined = document.getElementById('topMuniColCombined');
    [colAE, colTAss, colCombined].forEach(el => el.classList.remove('bg-amber-600/40'));
    (metric === 'ae' ? colAE : metric === 'tass' ? colTAss : colCombined).classList.add('bg-amber-600/40');
    const activeTdClass = { ae: 'p-3 text-right font-extrabold text-teal-700 text-sm', tass: 'p-3 text-right font-extrabold text-teal-700 text-sm', combined: 'p-3 text-right font-extrabold text-teal-700 text-sm' };

    // --- Table 1: selected year (or All Years) ranking ---
    const yearRanked = getMuniCombinedMap(yearFilter, metric);
    const yearBody = document.getElementById('topMuniYearBody');
    yearBody.innerHTML = '';
    if (!yearRanked.length) {
        yearBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">No data found for ${(yr === 'ALL') ? 'any year' : yr}.</td></tr>`;
    } else {
        yearRanked.forEach((item, idx) => {
            const badgeClass = idx === 0 ? 'bg-amber-100 text-amber-800 font-bold' : (idx === 1 ? 'bg-slate-200 text-slate-700' : (idx === 2 ? 'bg-amber-700/20 text-amber-900' : 'bg-slate-100 text-slate-600'));
            yearBody.innerHTML += `<tr class="hover:bg-slate-50 border-b">
                        <td class="p-3 text-center"><span class="px-2 py-1 rounded-full text-xs ${badgeClass}">#${idx + 1}</span></td>
                        <td class="p-3 font-bold text-slate-800">${item.municipality}</td>
                        <td class="${metric === 'ae' ? activeTdClass.ae : 'p-3 text-right'}">${item.ae.toLocaleString()}</td>
                        <td class="${metric === 'tass' ? activeTdClass.tass : 'p-3 text-right'}">${item.tass.toLocaleString()}</td>
                        <td class="${metric === 'combined' ? activeTdClass.combined : 'p-3 text-right font-bold text-amber-800'}">${item.combined.toLocaleString()}</td>
                    </tr>`;
        });
    }

    // Chart for the selected year (reflects the active metric), labeled per municipality
    const ctx = document.getElementById('chartTopMuniYear').getContext('2d');
    if (chartTopMuniYearObj) chartTopMuniYearObj.destroy();
    const top10 = yearRanked.slice(0, 10);
    const muniColors = ['#0f766e', '#14b8a6', '#2dd4bf', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa', '#c084fc', '#f472b6', '#fb7185'];
    const hasDataLabels = (typeof ChartDataLabels !== 'undefined');
    // Denominators for percentage-of-all-municipalities (not just the Top 10 shown), for the currently selected year/All-Years filter
    const allMuniMetricTotal = yearRanked.reduce((sum, x) => sum + x[metric], 0);
    const allMuniAETotal = yearRanked.reduce((sum, x) => sum + x.ae, 0);
    const allMuniTAssTotal = yearRanked.reduce((sum, x) => sum + x.tass, 0);
    chartTopMuniYearObj = new Chart(ctx, {
        type: 'doughnut',
        plugins: hasDataLabels ? [ChartDataLabels] : [],
        data: {
            labels: top10.map(x => x.municipality),
            datasets: [{
                data: top10.map(x => x[metric]),
                backgroundColor: muniColors
            }]
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
                            const pct = allMuniMetricTotal > 0 ? ((val / allMuniMetricTotal) * 100).toFixed(1) : 0;
                            return `${ctxItem.label}: ${val.toLocaleString()} (${pct}% of all municipalities)`;
                        }
                    }
                },
                datalabels: hasDataLabels ? {
                    color: '#fff',
                    font: { weight: 'bold', size: 9 },
                    textStrokeColor: 'rgba(0,0,0,0.35)',
                    textStrokeWidth: 2,
                    formatter: (value) => {
                        const pct = allMuniMetricTotal > 0 ? (value / allMuniMetricTotal) * 100 : 0;
                        return pct.toFixed(1) + '%';
                    }
                } : undefined
            }
        }
    });

    // Two independently-ranked horizontal bar charts: Top 10 by AEs, and Top 10 by TAss (each its own ranking, for the selected year)
    const top10ByAE = [...yearRanked].sort((a, b) => b.ae - a.ae).slice(0, 11);
    const top10ByTAss = [...yearRanked].sort((a, b) => b.tass - a.tass).slice(0, 11);

    const ctxBarAE = document.getElementById('chartTopMuniBarAE').getContext('2d');
    if (chartTopMuniBarAEObj) chartTopMuniBarAEObj.destroy();
    chartTopMuniBarAEObj = new Chart(ctxBarAE, {
        type: 'bar',
        plugins: hasDataLabels ? [ChartDataLabels] : [],
        data: {
            labels: top10ByAE.map(x => x.municipality),
            datasets: [{ label: 'Tourist Arrivals (AEs)', data: top10ByAE.map(x => x.ae), backgroundColor: '#3b82f6' }]
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
                            const pct = allMuniAETotal > 0 ? ((val / allMuniAETotal) * 100).toFixed(1) : 0;
                            return `AEs: ${val.toLocaleString()} (${pct}% of all municipalities)`;
                        }
                    }
                },
                datalabels: hasDataLabels ? {
                    color: '#1e3a8a',
                    anchor: 'end',
                    align: 'end',
                    font: { weight: 'bold', size: 9 },
                    formatter: (value) => {
                        const pct = allMuniAETotal > 0 ? (value / allMuniAETotal) * 100 : 0;
                        return pct.toFixed(1) + '%';
                    }
                } : undefined
            }
        }
    });

    const ctxBarTAss = document.getElementById('chartTopMuniBarTAss').getContext('2d');
    if (chartTopMuniBarTAssObj) chartTopMuniBarTAssObj.destroy();
    chartTopMuniBarTAssObj = new Chart(ctxBarTAss, {
        type: 'bar',
        plugins: hasDataLabels ? [ChartDataLabels] : [],
        data: {
            labels: top10ByTAss.map(x => x.municipality),
            datasets: [{ label: 'Same-Day Visitors (TAss)', data: top10ByTAss.map(x => x.tass), backgroundColor: '#14b8a6' }]
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
                            const pct = allMuniTAssTotal > 0 ? ((val / allMuniTAssTotal) * 100).toFixed(1) : 0;
                            return `TAss: ${val.toLocaleString()} (${pct}% of all municipalities)`;
                        }
                    }
                },
                datalabels: hasDataLabels ? {
                    color: '#0f766e',
                    anchor: 'end',
                    align: 'end',
                    font: { weight: 'bold', size: 9 },
                    formatter: (value) => {
                        const pct = allMuniTAssTotal > 0 ? (value / allMuniTAssTotal) * 100 : 0;
                        return pct.toFixed(1) + '%';
                    }
                } : undefined
            }
        }
    });

    // --- Table 2: overall ranking across all saved years ---
    const overallRanked = getMuniCombinedMap(null, metric);
    const overallBody = document.getElementById('topMuniOverallBody');
    overallBody.innerHTML = '';
    if (!overallRanked.length) {
        overallBody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">No data saved yet.</td></tr>`;
    } else {
        overallRanked.forEach((item, idx) => {
            const badgeClass = idx === 0 ? 'bg-amber-100 text-amber-800 font-bold' : (idx === 1 ? 'bg-slate-200 text-slate-700' : (idx === 2 ? 'bg-amber-700/20 text-amber-900' : 'bg-slate-100 text-slate-600'));
            overallBody.innerHTML += `<tr class="hover:bg-slate-50 border-b">
                        <td class="p-3 text-center"><span class="px-2 py-1 rounded-full text-xs ${badgeClass}">#${idx + 1}</span></td>
                        <td class="p-3 font-bold text-slate-800">${item.municipality}</td>
                        <td class="p-3 text-right">${item.ae.toLocaleString()}</td>
                        <td class="p-3 text-right">${item.tass.toLocaleString()}</td>
                        <td class="p-3 text-right font-extrabold text-amber-700 text-sm">${item.combined.toLocaleString()}</td>
                    </tr>`;
        });
    }
}

function exportTopMunicipalitiesExcel() { if (!requireAdmin('download data')) return;
    const yr = document.getElementById('topMuniYear').value || 2026;
    const metric = document.getElementById('topMuniMetric').value || 'combined';
    const metricLabel = TOP_MUNI_METRIC_LABELS[metric];
    const yearFilter = (yr === 'ALL') ? null : yr;
    const yrLabel = (yr === 'ALL') ? 'All Years' : yr;
    const yearRanked = getMuniCombinedMap(yearFilter, metric).map((x, i) => [i + 1, x.municipality, x.ae, x.tass, x.combined]);
    const overallRanked = getMuniCombinedMap(null, metric).map((x, i) => [i + 1, x.municipality, x.ae, x.tass, x.combined]);

    const wb = XLSX.utils.book_new();

    const wsYear = XLSX.utils.aoa_to_sheet([
        ["PROVINCIAL GOVERNMENT OF OCCIDENTAL MINDORO"],
        ["TOP MUNICIPALITIES BY VISITOR ARRIVALS"],
        [`Reporting Year: ${yrLabel} | Ranked by: ${metricLabel}`],
        ["Rank", "Municipality", "Tourist Arrivals (AEs)", "Same-Day Visitors (TAss)", "Combined Total"],
        ...yearRanked
    ]);
    wsYear['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }, { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } }];
    wsYear['A1'].s = excelTitleStyle(); wsYear['A2'].s = excelTitleStyle(); wsYear['A3'].s = EXCEL_SUBTITLE_FONT;
    styleHeaderRow(wsYear, 3); styleDataNumbers(wsYear, [0, 2, 3, 4], 4);
    wsYear['!freeze'] = { xSplit: 0, ySplit: 4 }; autoWidth(wsYear, 12, 32);
    XLSX.utils.book_append_sheet(wb, wsYear, `Top Municipalities ${yrLabel}`.substring(0, 31));

    const wsAll = XLSX.utils.aoa_to_sheet([
        ["PROVINCIAL GOVERNMENT OF OCCIDENTAL MINDORO"],
        ["OVERALL RANKING BY TOTAL VISITOR VOLUME (ALL YEARS)"],
        [`Ranked by: ${metricLabel} | Generated: ${new Date().toLocaleDateString()}`],
        ["Rank", "Municipality", "Total Tourist Arrivals (AEs)", "Total Same-Day Visitors (TAss)", "Grand Total (All Years)"],
        ...overallRanked
    ]);
    wsAll['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } }, { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } }];
    wsAll['A1'].s = excelTitleStyle(); wsAll['A2'].s = excelTitleStyle(); wsAll['A3'].s = EXCEL_SUBTITLE_FONT;
    styleHeaderRow(wsAll, 3); styleDataNumbers(wsAll, [0, 2, 3, 4], 4);
    wsAll['!freeze'] = { xSplit: 0, ySplit: 4 }; autoWidth(wsAll, 12, 32);
    XLSX.utils.book_append_sheet(wb, wsAll, "Overall All-Years Ranking");

    saveWorkbook(wb, `Top_Municipalities_${yr}_and_Overall.xlsx`);
}

function getTopAERows() {
    const yr=document.getElementById('topAEYear').value||2026,mo=document.getElementById('topAEMonth').value,mu=document.getElementById('topAEMuni').value;
    const estMap={};
    aeRecords.forEach(r=>{
        if(r.year!=yr)return;if(mo!=='ALL'&&r.month!=mo)return;if(mu!=='ALL'&&r.municipality!==mu)return;
        const key=`${r.establishment}||${r.municipality}`;
        if(!estMap[key])estMap[key]={establishment:r.establishment,municipality:r.municipality,type:r.type_class||'N/A',count:0};
        estMap[key].count+=Number(r.total_lf||0);
    });
    return Object.values(estMap).sort((a,b)=>b.count-a.count).slice(0,10);
}

function exportTopAEExcel() { if (!requireAdmin('download data')) return;
    const yr=document.getElementById('topAEYear').value||2026,mo=document.getElementById('topAEMonth').value,mu=document.getElementById('topAEMuni').value;
    const wb=XLSX.utils.book_new();
    const rows=getTopAERows().map((x,i)=>[i+1,x.establishment,x.municipality,x.type,x.count]);
    const ws=XLSX.utils.aoa_to_sheet([["PROVINCIAL GOVERNMENT OF OCCIDENTAL MINDORO"],["TOP 10 ACCOMMODATION ESTABLISHMENTS"],[`Year: ${yr} | Month: ${mo==='ALL'?'Entire Year':MONTH_NAMES[mo-1]} | Scope: ${mu==='ALL'?'All Municipalities':mu}`],["Rank","Accommodation Establishment","Municipality","Type / Class","Tourist Arrivals"],...rows]);
    ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:4}},{s:{r:1,c:0},e:{r:1,c:4}},{s:{r:2,c:0},e:{r:2,c:4}}];ws['A1'].s=excelTitleStyle();ws['A2'].s=excelTitleStyle();ws['A3'].s=EXCEL_SUBTITLE_FONT;styleHeaderRow(ws,3);styleDataNumbers(ws,[0,4],4);ws['!freeze']={xSplit:0,ySplit:4};autoWidth(ws,12,35);XLSX.utils.book_append_sheet(wb,ws,"Top 10 AEs");saveWorkbook(wb,`Top10_Accommodation_Establishments_${yr}.xlsx`);
}

function getTopTAssRows() {
    const yr=document.getElementById('topTAssYear').value||2026,mo=document.getElementById('topTAssMonth').value,mu=document.getElementById('topTAssMuni').value;
    const map={};
    tassRecords.forEach(r=>{
        if(r.year!=yr)return;if(mo!=='ALL'&&r.month!=mo)return;if(mu!=='ALL'&&r.municipality!==mu)return;
        const key=`${r.attraction}||${r.municipality}`;
        if(!map[key])map[key]={attraction:r.attraction,municipality:r.municipality,count:0};
        map[key].count+=Number(r.grand_total||0);
    });
    return Object.values(map).sort((a,b)=>b.count-a.count).slice(0,10);
}

function exportTopTAssExcel() { if (!requireAdmin('download data')) return;
    const yr=document.getElementById('topTAssYear').value||2026,mo=document.getElementById('topTAssMonth').value,mu=document.getElementById('topTAssMuni').value;
    const wb=XLSX.utils.book_new();
    const rows=getTopTAssRows().map((x,i)=>[i+1,x.attraction,x.municipality,x.count]);
    const ws=XLSX.utils.aoa_to_sheet([["PROVINCIAL GOVERNMENT OF OCCIDENTAL MINDORO"],["TOP 10 TOURIST ATTRACTIONS"],[`Year: ${yr} | Month: ${mo==='ALL'?'Entire Year':MONTH_NAMES[mo-1]} | Scope: ${mu==='ALL'?'All Municipalities':mu}`],["Rank","Tourist Attraction","Municipality","Same-Day Visitors"],...rows]);
    ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:3}},{s:{r:1,c:0},e:{r:1,c:3}},{s:{r:2,c:0},e:{r:2,c:3}}];ws['A1'].s=excelTitleStyle();ws['A2'].s=excelTitleStyle();ws['A3'].s=EXCEL_SUBTITLE_FONT;styleHeaderRow(ws,3);styleDataNumbers(ws,[0,3],4);ws['!freeze']={xSplit:0,ySplit:4};autoWidth(ws,12,35);XLSX.utils.book_append_sheet(wb,ws,"Top 10 TAss");saveWorkbook(wb,`Top10_Tourist_Attractions_${yr}.xlsx`);
}
