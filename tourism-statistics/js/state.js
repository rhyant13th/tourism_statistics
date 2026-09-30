/**
 * SHARED STATE: in-memory record lists, login state, pending bulk-upload queues, chart handles.
 * Every other file reads/writes these variables.
 */

window.isAdmin = false;
window.currentUser = null;
let appInitialized = false;
let db = null;

// In-Memory Data Collections
let aeRecords = [];

let tassRecords = [];
let countryRecords = [];

// Temporary parsed bulk upload queues
let pendingBulkAE = [];

let pendingBulkTAss = [];
let pendingSync = { aes: new Set(), tass: new Set() };
let pendingDeletes = { aes: [], tass: [] };

// Chart instances
let chartMonthlyTrendObj = null;

let chartMunicipalityObj = null;
let chartTopAEObj = null;
let chartTopTAssObj = null;
let chartYearlyTotalsObj = null;
let chartYearlySeasonalityObj = null;
let chartTopMuniYearObj = null;
let chartTopMuniBarAEObj = null;
let chartTopMuniBarTAssObj = null;
let chartCountryPieObj = null;
let chartCountryBarObj = null;
