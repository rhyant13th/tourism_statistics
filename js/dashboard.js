/**
 * DASHBOARD VIEW: KPI cards, filters, demographic bars, and dashboard charts.
 */

function refreshDashboard() {
    const yr = document.getElementById('dashYear').value;
    const mo = document.getElementById('dashMonth').value;
    const mu = document.getElementById('dashMuni').value;

    // Filter AEs
    const filteredAE = aeRecords.filter(r => {
        if (yr !== 'ALL' && r.year != yr) return false;
        if (mo !== 'ALL' && r.month != mo) return false;
        if (mu !== 'ALL' && r.municipality !== mu) return false;
        return true;
    });

    // Filter TAss
    const filteredTAss = tassRecords.filter(r => {
        if (yr !== 'ALL' && r.year != yr) return false;
        if (mo !== 'ALL' && r.month != mo) return false;
        if (mu !== 'ALL' && r.municipality !== mu) return false;
        return true;
    });

    // Sum AEs
    let totalLocal = 0, totalForeign = 0, totalOverseas = 0, totalAEMale = 0, totalAEFemale = 0;
    const aeEsts = new Set();
    filteredAE.forEach(r => {
        totalLocal += Number(r.local_tourist || 0);
        totalForeign += Number(r.foreign_tourist || 0);
        totalOverseas += Number(r.overseas_filipino || 0);
        totalAEMale += Number(r.total_male || 0);
        totalAEFemale += Number(r.total_female || 0);
        if (r.establishment) aeEsts.add(r.establishment);
    });
    const totalAEsArrivals = totalLocal + totalForeign + totalOverseas;

    // Sum TAss
    let totalTM = 0, totalOM = 0, totalFCR = 0, totalTAssMale = 0, totalTAssFemale = 0;
    const tassAtts = new Set();
    filteredTAss.forEach(r => {
        totalTM += Number(r.tm_sum || 0);
        totalOM += Number(r.om_sum || 0);
        totalFCR += Number(r.fcr_sum || 0);
        totalTAssMale += Number(r.total_male || 0);
        totalTAssFemale += Number(r.total_female || 0);
        if (r.attraction) tassAtts.add(r.attraction);
    });
    const totalTAssVisitors = totalTM + totalOM + totalFCR;

    const grandCombined = totalAEsArrivals + totalTAssVisitors;
    const grandMale = totalAEMale + totalTAssMale;
    const grandFemale = totalAEFemale + totalTAssFemale;

    // Update UI Cards
    document.getElementById('cardTotalAEs').innerText = totalAEsArrivals.toLocaleString();
    document.getElementById('cardAECount').innerText = aeEsts.size;

    document.getElementById('cardTotalTAss').innerText = totalTAssVisitors.toLocaleString();
    document.getElementById('cardTAssCount').innerText = tassAtts.size;

    document.getElementById('cardCombinedVisitors').innerText = grandCombined.toLocaleString();

    const foreignShare = totalAEsArrivals > 0 ? (((totalForeign + totalOverseas) / totalAEsArrivals) * 100).toFixed(1) : 0;
    document.getElementById('cardForeignOverseas').innerText = (totalForeign + totalOverseas).toLocaleString();
    document.getElementById('cardForeignPercent').innerText = `${foreignShare}%`;

    document.getElementById('cardLocalTourists').innerText = totalLocal.toLocaleString();
    document.getElementById('cardForeignTourists').innerText = totalForeign.toLocaleString();
    document.getElementById('cardOverseasFilipinos').innerText = totalOverseas.toLocaleString();
    document.getElementById('cardLocalPct').innerText = `(${totalAEsArrivals > 0 ? ((totalLocal / totalAEsArrivals) * 100).toFixed(1) : 0}%)`;
    document.getElementById('cardForeignPct').innerText = `(${totalAEsArrivals > 0 ? ((totalForeign / totalAEsArrivals) * 100).toFixed(1) : 0}%)`;
    document.getElementById('cardOverseasPct').innerText = `(${totalAEsArrivals > 0 ? ((totalOverseas / totalAEsArrivals) * 100).toFixed(1) : 0}%)`;

    document.getElementById('cardTM').innerText = totalTM.toLocaleString();
    document.getElementById('cardOM').innerText = totalOM.toLocaleString();
    document.getElementById('cardFCR').innerText = totalFCR.toLocaleString();
    document.getElementById('cardTMPct').innerText = `(${totalTAssVisitors > 0 ? ((totalTM / totalTAssVisitors) * 100).toFixed(1) : 0}%)`;
    document.getElementById('cardOMPct').innerText = `(${totalTAssVisitors > 0 ? ((totalOM / totalTAssVisitors) * 100).toFixed(1) : 0}%)`;
    document.getElementById('cardFCRPct').innerText = `(${totalTAssVisitors > 0 ? ((totalFCR / totalTAssVisitors) * 100).toFixed(1) : 0}%)`;

    document.getElementById('cardTotalMale').innerText = grandMale.toLocaleString();
    document.getElementById('cardTotalFemale').innerText = grandFemale.toLocaleString();

    const totalGender = grandMale + grandFemale;
    const malePct = totalGender > 0 ? ((grandMale / totalGender) * 100).toFixed(1) : 50;
    const femalePct = totalGender > 0 ? ((grandFemale / totalGender) * 100).toFixed(1) : 50;
    document.getElementById('barMale').style.width = `${malePct}%`;
    document.getElementById('barFemale').style.width = `${femalePct}%`;

    renderDashboardCharts(filteredAE, filteredTAss);
    renderAllYearsDashboardCharts();
}

function resetDashFilters() {
    document.getElementById('dashYear').value = 'ALL';
    document.getElementById('dashMonth').value = 'ALL';
    document.getElementById('dashMuni').value = 'ALL';
    refreshDashboard();
}

function renderDashboardCharts(aeList, tassList) {
    // Chart 1: Monthly Trend
    const monthlyAE = new Array(12).fill(0);
    const monthlyTAss = new Array(12).fill(0);

    aeList.forEach(r => { if (r.month >= 1 && r.month <= 12) monthlyAE[r.month - 1] += Number(r.total_lf || 0); });
    tassList.forEach(r => { if (r.month >= 1 && r.month <= 12) monthlyTAss[r.month - 1] += Number(r.grand_total || 0); });

    const ctx1 = document.getElementById('chartMonthlyTrend').getContext('2d');
    if (chartMonthlyTrendObj) chartMonthlyTrendObj.destroy();
    chartMonthlyTrendObj = new Chart(ctx1, {
        type: 'line',
        data: {
            labels: MONTH_NAMES.map(m => m.substring(0, 3)),
            datasets: [
                { label: 'Tourist Arrivals (AEs)', data: monthlyAE, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true, tension: 0.3 },
                { label: 'Same-Day Visitors (TAss)', data: monthlyTAss, borderColor: '#14b8a6', backgroundColor: 'rgba(20, 184, 166, 0.1)', fill: true, tension: 0.3 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });

    // Chart 2: By Municipality
    const muniMap = {};
    aeList.forEach(r => {
        const m = r.municipality || 'Unspecified';
        muniMap[m] = (muniMap[m] || 0) + Number(r.total_lf || 0);
    });
    tassList.forEach(r => {
        const m = r.municipality || 'Unspecified';
        muniMap[m] = (muniMap[m] || 0) + Number(r.grand_total || 0);
    });

    const sortedMunis = Object.keys(muniMap).sort((a,b) => muniMap[b] - muniMap[a]).slice(0, 7);
    const muniData = sortedMunis.map(m => muniMap[m]);

    const ctx2 = document.getElementById('chartMunicipality').getContext('2d');
    if (chartMunicipalityObj) chartMunicipalityObj.destroy();
    chartMunicipalityObj = new Chart(ctx2, {
        type: 'bar',
        data: {
            labels: sortedMunis,
            datasets: [{ label: 'Combined Visitors', data: muniData, backgroundColor: '#0f766e', borderRadius: 6 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

/**
 * ALL-YEARS COMPARISON CHARTS (always reflect every saved year, ignore the dashboard filters above)
 */
function renderAllYearsDashboardCharts() {
    const elTotals = document.getElementById('chartYearlyTotals');
    const elSeason = document.getElementById('chartYearlySeasonality');
    if (!elTotals || !elSeason) return;

    const years = new Set();
    aeRecords.forEach(r => { if (r.year) years.add(Number(r.year)); });
    tassRecords.forEach(r => { if (r.year) years.add(Number(r.year)); });
    const sortedYears = Array.from(years).sort((a, b) => a - b);

    // Chart: Combined Visitors by Year (one bar per year)
    const yearlyTotals = sortedYears.map(y => {
        let total = 0;
        aeRecords.forEach(r => { if (Number(r.year) === y) total += Number(r.total_lf || 0); });
        tassRecords.forEach(r => { if (Number(r.year) === y) total += Number(r.grand_total || 0); });
        return total;
    });

    const ctxTotals = elTotals.getContext('2d');
    if (chartYearlyTotalsObj) chartYearlyTotalsObj.destroy();
    chartYearlyTotalsObj = new Chart(ctxTotals, {
        type: 'bar',
        data: {
            labels: sortedYears.map(String),
            datasets: [{ label: 'Combined Visitors', data: yearlyTotals, backgroundColor: '#0f766e', borderRadius: 6 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // Chart: Monthly Trend Across Years (AEs and TAss separated, one color pair per year)
    const seasonPalette = ['#0f766e', '#3b82f6', '#f59e0b', '#db2777', '#7c3aed', '#059669', '#dc2626', '#0284c7', '#65a30d', '#9333ea'];
    const seasonalityDatasets = [];
    sortedYears.forEach((y, idx) => {
        const monthlyAE = new Array(12).fill(0);
        const monthlyTAss = new Array(12).fill(0);
        aeRecords.forEach(r => { if (Number(r.year) === y && r.month >= 1 && r.month <= 12) monthlyAE[r.month - 1] += Number(r.total_lf || 0); });
        tassRecords.forEach(r => { if (Number(r.year) === y && r.month >= 1 && r.month <= 12) monthlyTAss[r.month - 1] += Number(r.grand_total || 0); });
        const color = seasonPalette[idx % seasonPalette.length];
        seasonalityDatasets.push({ label: `${y} - AEs`, data: monthlyAE, borderColor: color, backgroundColor: color, borderDash: [], fill: false, tension: 0.3 });
        seasonalityDatasets.push({ label: `${y} - TAss`, data: monthlyTAss, borderColor: color, backgroundColor: color, borderDash: [6, 4], fill: false, tension: 0.3 });
    });

    const ctxSeason = elSeason.getContext('2d');
    if (chartYearlySeasonalityObj) chartYearlySeasonalityObj.destroy();
    chartYearlySeasonalityObj = new Chart(ctxSeason, {
        type: 'line',
        data: { labels: MONTH_NAMES.map(m => m.substring(0, 3)), datasets: seasonalityDatasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 14, font: { size: 10 } } } } }
    });
}
