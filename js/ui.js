/**
 * SHARED UI: modals, toast messages, tab switching, filter dropdowns, refreshing all views.
 */

/**
 * NAVIGATION & TAB SWITCHING LOGIC
 */
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('bg-teal-600', 'text-white');
        el.classList.add('hover:bg-slate-800', 'hover:text-white');
    });

    const targetView = document.getElementById(`view-${tabId}`);
    if (targetView) targetView.classList.remove('hidden');

    const targetNav = document.getElementById(`nav-${tabId}`);
    if (targetNav) {
        targetNav.classList.add('bg-teal-600', 'text-white');
        targetNav.classList.remove('hover:bg-slate-800', 'hover:text-white');
    }

    // Refresh specific components based on tab context
    if (tabId === 'dashboard') refreshDashboard();
    if (tabId === 'aes') renderAETable();
    if (tabId === 'tass') renderTAssTable();
    if (tabId === 'annual-summary') renderAnnualReport();
    if (tabId === 'monthly-summary') renderMonthlyReport();
    if (tabId === 'top-aes') renderTopAEReport();
    if (tabId === 'top-tass') renderTopTAssReport();
    if (tabId === 'top-municipalities') renderTopMunicipalitiesReport();
    if (tabId === 'country-origin') renderCountryReport();
}

function updateSavedDataStatus(){
    const ae=document.getElementById('aeSavedCount'), ta=document.getElementById('tassSavedCount'); if(ae)ae.textContent=aeRecords.length.toLocaleString(); if(ta)ta.textContent=tassRecords.length.toLocaleString();
    const latest=records=>{if(!records.length)return 'None';const r=[...records].sort((a,b)=>Number(b.year)-Number(a.year)||Number(b.month)-Number(a.month))[0];return `${MONTH_NAMES[Number(r.month)-1]} ${r.year}`;};
    const ap=document.getElementById('aeSavedPeriod'),tp=document.getElementById('tassSavedPeriod');if(ap)ap.textContent=latest(aeRecords);if(tp)tp.textContent=latest(tassRecords);
}

function refreshAllViews() {
    updateSavedDataStatus();
    populateFilterOptions();
    refreshDashboard();
    renderAETable();
    renderTAssTable();
}

/**
 * POPULATE FILTER DROPDOWNS DYNAMICALLY
 */
function populateFilterOptions() {
    const years = new Set([2026]);
    const munis = new Set();
    const aeTypes = new Set();

    aeRecords.forEach(r => {
        if (r.year) years.add(r.year);
        if (r.municipality) munis.add(r.municipality);
        if (r.type_class) aeTypes.add(r.type_class);
    });

    tassRecords.forEach(r => {
        if (r.year) years.add(r.year);
        if (r.municipality) munis.add(r.municipality);
    });

    const sortedYears = Array.from(years).sort((a,b) => b - a);
    const sortedMunis = Array.from(munis).sort();
    const sortedTypes = Array.from(aeTypes).sort();

    // Populate Year Selects
    ['dashYear', 'filterAEYear', 'filterTAssYear', 'rptAnnualYear', 'rptMonthlyYear', 'topAEYear', 'topTAssYear', 'topMuniYear'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const currVal = select.value;
        let html = (id === 'rptAnnualYear' || id === 'rptMonthlyYear' || (id.startsWith('top') && id !== 'topMuniYear')) ? '' : '<option value="ALL">All Years</option>';
        sortedYears.forEach(y => { html += `<option value="${y}">${y}</option>`; });
        select.innerHTML = html;
        if (currVal && select.querySelector(`option[value="${currVal}"]`)) select.value = currVal;
    });

    // Populate Municipality Selects
    ['dashMuni', 'filterAEMuni', 'filterTAssMuni', 'rptMonthlyMuni', 'topAEMuni', 'topTAssMuni'].forEach(id => {
        const select = document.getElementById(id);
        if (!select) return;
        const currVal = select.value;
        let html = '<option value="ALL">All Municipalities</option>';
        sortedMunis.forEach(m => { html += `<option value="${m}">${m}</option>`; });
        select.innerHTML = html;
        if (currVal) select.value = currVal;
    });

    // AE Types
    const typeSelect = document.getElementById('filterAEType');
    if (typeSelect) {
        let html = '<option value="ALL">All Types/Classes</option>';
        sortedTypes.forEach(t => { html += `<option value="${t}">${t}</option>`; });
        typeSelect.innerHTML = html;
    }
    populateCountryYearSelect();
}

/**
 * UTILITY DIALOG & TOAST UI HELPERS
 */
function openModal(modalId) {
    document.getElementById(modalId).classList.remove('hidden');
}

function closeModal(modalId) { const el=document.getElementById(modalId); if(!el)return; el.classList.add('hidden'); el.classList.remove('flex'); }

function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function showToast(message, type = "info") {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    const bgClass = type === 'success' ? 'bg-emerald-800 border-emerald-600' : (type === 'danger' ? 'bg-rose-800 border-rose-600' : (type === 'warning' ? 'bg-amber-800 border-amber-600' : 'bg-navy-800 border-teal-600'));
    
    toast.className = `${bgClass} text-white text-xs px-4 py-3 rounded-lg shadow-xl border flex items-center justify-between space-x-3 pointer-events-auto transition-all transform translate-y-2 opacity-0`;
    toast.innerHTML = `<span>${message}</span><button onclick="this.parentElement.remove()" class="text-slate-300 hover:text-white">&times;</button>`;

    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
