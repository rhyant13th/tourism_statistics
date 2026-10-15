/**
 * REPORTS - ANNUAL & MONTHLY SUMMARY: on-screen reports and their Excel exports.
 */

/**
 * SECTION 5: ANNUAL SUMMARY REPORT GENERATION
 */
function renderAnnualReport() {
    const yr = document.getElementById('rptAnnualYear').value || 2026;
    const mo = document.getElementById('rptAnnualMonth') ? document.getElementById('rptAnnualMonth').value : 'ALL';
    const moOk = r => mo === 'ALL' || Number(r.month) === Number(mo);
    document.getElementById('rptAnnualYearLbl').innerText = yr;
    document.getElementById('rptAnnualMonthLbl').innerText = mo === 'ALL' ? 'All Months' : MONTH_NAMES[Number(mo) - 1];
    document.getElementById('rptAnnualTitle').innerText = mo === 'ALL' ? 'Annual Tourism Performance Summary' : 'Monthly Tourism Statistics Summary';

    // Collect all unique municipalities
    const munis = new Set();
    aeRecords.forEach(r => { if (r.year == yr && moOk(r)) munis.add(r.municipality); });
    tassRecords.forEach(r => { if (r.year == yr && moOk(r)) munis.add(r.municipality); });

    const sortedMunis = Array.from(munis).sort();
    const tbody = document.getElementById('rptAnnualBody');
    tbody.innerHTML = '';

    let gLocal=0, gForeign=0, gOverseas=0, gAEsTotal=0;
    let gTM=0, gOM=0, gFCR=0, gTAssTotal=0;

    sortedMunis.forEach(m => {
        let local=0, foreign=0, overseas=0;
        aeRecords.filter(r => r.year == yr && moOk(r) && r.municipality === m).forEach(r => {
            local += Number(r.local_tourist||0);
            foreign += Number(r.foreign_tourist||0);
            overseas += Number(r.overseas_filipino||0);
        });
        const totalAEs = local + foreign + overseas;

        let tm=0, om=0, fcr=0;
        tassRecords.filter(r => r.year == yr && moOk(r) && r.municipality === m).forEach(r => {
            tm += Number(r.tm_sum||0);
            om += Number(r.om_sum||0);
            fcr += Number(r.fcr_sum||0);
        });
        const totalTAss = tm + om + fcr;
        const combined = totalAEs + totalTAss;

        gLocal+=local; gForeign+=foreign; gOverseas+=overseas; gAEsTotal+=totalAEs;
        gTM+=tm; gOM+=om; gFCR+=fcr; gTAssTotal+=totalTAss;

        tbody.innerHTML += `<tr class="hover:bg-slate-50 border-b">
                    <td class="p-2 font-bold border-r text-slate-800">${m}</td>
                    <td class="p-2 text-right">${local.toLocaleString()}</td>
                    <td class="p-2 text-right">${foreign.toLocaleString()}</td>
                    <td class="p-2 text-right">${overseas.toLocaleString()}</td>
                    <td class="p-2 text-right font-bold bg-blue-50/50 border-r text-blue-900">${totalAEs.toLocaleString()}</td>
                    <td class="p-2 text-right">${tm.toLocaleString()}</td>
                    <td class="p-2 text-right">${om.toLocaleString()}</td>
                    <td class="p-2 text-right">${fcr.toLocaleString()}</td>
                    <td class="p-2 text-right font-bold bg-teal-50/50 border-r text-teal-900">${totalTAss.toLocaleString()}</td>
                    <td class="p-2 text-right font-bold bg-amber-50 text-amber-900">${combined.toLocaleString()}</td>
                </tr>`;
    });

    document.getElementById('rptAnnualFoot').innerHTML = `<tr>
                <td class="p-2 border-r">PROVINCIAL TOTAL</td>
                <td class="p-2 text-right">${gLocal.toLocaleString()}</td>
                <td class="p-2 text-right">${gForeign.toLocaleString()}</td>
                <td class="p-2 text-right">${gOverseas.toLocaleString()}</td>
                <td class="p-2 text-right border-r text-blue-200">${gAEsTotal.toLocaleString()}</td>
                <td class="p-2 text-right">${gTM.toLocaleString()}</td>
                <td class="p-2 text-right">${gOM.toLocaleString()}</td>
                <td class="p-2 text-right">${gFCR.toLocaleString()}</td>
                <td class="p-2 text-right border-r text-teal-200">${gTAssTotal.toLocaleString()}</td>
                <td class="p-2 text-right text-amber-300 font-extrabold">${(gAEsTotal + gTAssTotal).toLocaleString()}</td>
            </tr>`;
}

/**
 * SECTION 6: MONTHLY SUMMARY REPORT GENERATION
 */
function renderMonthlyReport() {
    const yr = document.getElementById('rptMonthlyYear').value || 2026;
    const mu = document.getElementById('rptMonthlyMuni').value;

    document.getElementById('rptMonthlyYearLbl').innerText = yr;
    document.getElementById('rptMonthlyMuniLbl').innerText = mu === 'ALL' ? 'All Municipalities' : mu;

    const tbody = document.getElementById('rptMonthlyBody');
    tbody.innerHTML = '';

    let gLocal=0, gForeign=0, gOverseas=0, gAEsTotal=0;
    let gTM=0, gOM=0, gFCR=0, gTAssTotal=0;

    for (let m = 1; m <= 12; m++) {
        let local=0, foreign=0, overseas=0;
        aeRecords.filter(r => r.year == yr && r.month == m && (mu === 'ALL' || r.municipality === mu)).forEach(r => {
            local += Number(r.local_tourist||0);
            foreign += Number(r.foreign_tourist||0);
            overseas += Number(r.overseas_filipino||0);
        });
        const totalAEs = local + foreign + overseas;

        let tm=0, om=0, fcr=0;
        tassRecords.filter(r => r.year == yr && r.month == m && (mu === 'ALL' || r.municipality === mu)).forEach(r => {
            tm += Number(r.tm_sum||0);
            om += Number(r.om_sum||0);
            fcr += Number(r.fcr_sum||0);
        });
        const totalTAss = tm + om + fcr;
        const combined = totalAEs + totalTAss;

        gLocal+=local; gForeign+=foreign; gOverseas+=overseas; gAEsTotal+=totalAEs;
        gTM+=tm; gOM+=om; gFCR+=fcr; gTAssTotal+=totalTAss;

        tbody.innerHTML += `<tr class="hover:bg-slate-50 border-b">
                    <td class="p-2 font-bold text-slate-800">${MONTH_NAMES[m-1]}</td>
                    <td class="p-2 text-right">${local.toLocaleString()}</td>
                    <td class="p-2 text-right">${foreign.toLocaleString()}</td>
                    <td class="p-2 text-right">${overseas.toLocaleString()}</td>
                    <td class="p-2 text-right font-bold bg-blue-50/50 text-blue-900">${totalAEs.toLocaleString()}</td>
                    <td class="p-2 text-right">${tm.toLocaleString()}</td>
                    <td class="p-2 text-right">${om.toLocaleString()}</td>
                    <td class="p-2 text-right">${fcr.toLocaleString()}</td>
                    <td class="p-2 text-right font-bold bg-teal-50/50 text-teal-900">${totalTAss.toLocaleString()}</td>
                    <td class="p-2 text-right font-bold bg-amber-50 text-amber-900">${combined.toLocaleString()}</td>
                </tr>`;
    }

    document.getElementById('rptMonthlyFoot').innerHTML = `<tr>
                <td class="p-2">YEAR TOTAL (${yr})</td>
                <td class="p-2 text-right">${gLocal.toLocaleString()}</td>
                <td class="p-2 text-right">${gForeign.toLocaleString()}</td>
                <td class="p-2 text-right">${gOverseas.toLocaleString()}</td>
                <td class="p-2 text-right text-blue-200">${gAEsTotal.toLocaleString()}</td>
                <td class="p-2 text-right">${gTM.toLocaleString()}</td>
                <td class="p-2 text-right">${gOM.toLocaleString()}</td>
                <td class="p-2 text-right">${gFCR.toLocaleString()}</td>
                <td class="p-2 text-right text-teal-200">${gTAssTotal.toLocaleString()}</td>
                <td class="p-2 text-right text-amber-300 font-extrabold">${(gAEsTotal + gTAssTotal).toLocaleString()}</td>
            </tr>`;
}

function getAnnualReportRows(yr, mo) {
    mo = mo || 'ALL';
    const moOk = r => mo === 'ALL' || Number(r.month) === Number(mo);
    const munis = new Set();
    aeRecords.forEach(r => { if (r.year == yr && moOk(r)) munis.add(r.municipality); });
    tassRecords.forEach(r => { if (r.year == yr && moOk(r)) munis.add(r.municipality); });
    const sortedMunis = Array.from(munis).sort();
    const rows = [];
    let gLocal=0,gForeign=0,gOverseas=0,gAEsTotal=0,gTM=0,gOM=0,gFCR=0,gTAssTotal=0;
    sortedMunis.forEach(m => {
        let local=0,foreign=0,overseas=0;
        aeRecords.filter(r=>r.year==yr&&moOk(r)&&r.municipality===m).forEach(r=>{local+=Number(r.local_tourist||0);foreign+=Number(r.foreign_tourist||0);overseas+=Number(r.overseas_filipino||0);});
        const totalAEs=local+foreign+overseas;
        let tm=0,om=0,fcr=0;
        tassRecords.filter(r=>r.year==yr&&moOk(r)&&r.municipality===m).forEach(r=>{tm+=Number(r.tm_sum||0);om+=Number(r.om_sum||0);fcr+=Number(r.fcr_sum||0);});
        const totalTAss=tm+om+fcr, combined=totalAEs+totalTAss;
        gLocal+=local;gForeign+=foreign;gOverseas+=overseas;gAEsTotal+=totalAEs;gTM+=tm;gOM+=om;gFCR+=fcr;gTAssTotal+=totalTAss;
        rows.push([m,local,foreign,overseas,totalAEs,tm,om,fcr,totalTAss,combined]);
    });
    rows.push(["PROVINCIAL TOTAL",gLocal,gForeign,gOverseas,gAEsTotal,gTM,gOM,gFCR,gTAssTotal,gAEsTotal+gTAssTotal]);
    return rows;
}

function exportAnnualReportExcel() { if (!requireAdmin('download data')) return;
    const yr = document.getElementById('rptAnnualYear').value || 2026;
    const mo = document.getElementById('rptAnnualMonth') ? document.getElementById('rptAnnualMonth').value : 'ALL';
    const moLbl = mo === 'ALL' ? 'All Months' : MONTH_NAMES[Number(mo) - 1];
    const rows = getAnnualReportRows(yr, mo);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
        ["PROVINCIAL GOVERNMENT OF OCCIDENTAL MINDORO"],
        ["ANNUAL TOURISM PERFORMANCE SUMMARY"],
        [`Reporting Year: ${yr} | Month: ${moLbl}`],
        ["Municipality","Local","Foreign","Overseas","Total AEs","TM","OM","FCR","Total TAss","Combined Visitors"],
        ...rows
    ]);
    ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:9}},{s:{r:1,c:0},e:{r:1,c:9}},{s:{r:2,c:0},e:{r:2,c:9}}];
    ws['A1'].s=excelTitleStyle(); ws['A2'].s=excelTitleStyle(); ws['A3'].s=EXCEL_SUBTITLE_FONT;
    styleHeaderRow(ws,3); styleDataNumbers(ws,[1,2,3,4,5,6,7,8,9],4);
    ws['!freeze']={xSplit:0,ySplit:4}; autoWidth(ws,12,30);
    XLSX.utils.book_append_sheet(wb,ws,"Annual Summary");
    saveWorkbook(wb,`Annual_Tourism_Summary_${yr}${mo === 'ALL' ? '' : '_' + moLbl}.xlsx`);
}

function getMonthlyReportRows(yr, mu) {
    const rows=[];
    let gLocal=0,gForeign=0,gOverseas=0,gAEsTotal=0,gTM=0,gOM=0,gFCR=0,gTAssTotal=0;
    for(let m=1;m<=12;m++){
        let local=0,foreign=0,overseas=0;
        aeRecords.filter(r=>r.year==yr&&r.month==m&&(mu==='ALL'||r.municipality===mu)).forEach(r=>{local+=Number(r.local_tourist||0);foreign+=Number(r.foreign_tourist||0);overseas+=Number(r.overseas_filipino||0);});
        const totalAEs=local+foreign+overseas;
        let tm=0,om=0,fcr=0;
        tassRecords.filter(r=>r.year==yr&&r.month==m&&(mu==='ALL'||r.municipality===mu)).forEach(r=>{tm+=Number(r.tm_sum||0);om+=Number(r.om_sum||0);fcr+=Number(r.fcr_sum||0);});
        const totalTAss=tm+om+fcr,combined=totalAEs+totalTAss;
        gLocal+=local;gForeign+=foreign;gOverseas+=overseas;gAEsTotal+=totalAEs;gTM+=tm;gOM+=om;gFCR+=fcr;gTAssTotal+=totalTAss;
        rows.push([MONTH_NAMES[m-1],local,foreign,overseas,totalAEs,tm,om,fcr,totalTAss,combined]);
    }
    rows.push([`YEAR TOTAL (${yr})`,gLocal,gForeign,gOverseas,gAEsTotal,gTM,gOM,gFCR,gTAssTotal,gAEsTotal+gTAssTotal]);
    return rows;
}

function exportMonthlyReportExcel() { if (!requireAdmin('download data')) return;
    const yr=document.getElementById('rptMonthlyYear').value||2026;
    const mu=document.getElementById('rptMonthlyMuni').value;
    const scope=mu==='ALL'?'All Municipalities':mu;
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.aoa_to_sheet([
        ["PROVINCIAL GOVERNMENT OF OCCIDENTAL MINDORO"],
        ["MONTHLY VISITOR BREAKDOWN REPORT"],
        [`Year: ${yr} | Scope: ${scope}`],
        ["Month","Local Tourist","Foreign Tourist","Overseas Fil","Total Tourist Arrivals","Same-Day (TM)","Same-Day (OM)","Same-Day (FCR)","Total Same-Day","Combined Visitors"],
        ...getMonthlyReportRows(yr,mu)
    ]);
    ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:9}},{s:{r:1,c:0},e:{r:1,c:9}},{s:{r:2,c:0},e:{r:2,c:9}}];
    ws['A1'].s=excelTitleStyle();ws['A2'].s=excelTitleStyle();ws['A3'].s=EXCEL_SUBTITLE_FONT;
    styleHeaderRow(ws,3);styleDataNumbers(ws,[1,2,3,4,5,6,7,8,9],4);ws['!freeze']={xSplit:0,ySplit:4};autoWidth(ws,12,30);
    XLSX.utils.book_append_sheet(wb,ws,"Monthly Summary");
    saveWorkbook(wb,`Monthly_Tourism_Summary_${yr}_${scope.replace(/[^A-Za-z0-9]+/g,'_')}.xlsx`);
}
