/**
 * REPORT DATE STAMP: fills the "Date generated" line in every report note
 * (on page load and again right before printing).
 */
(function () {
  function stampReportDate() {
    const d = new Date().toLocaleString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    document.querySelectorAll('.report-gen-date').forEach(el => { el.textContent = d; });
  }
  document.addEventListener('DOMContentLoaded', stampReportDate);
  window.addEventListener('beforeprint', stampReportDate);
})();
