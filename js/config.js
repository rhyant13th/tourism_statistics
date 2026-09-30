/**
 * SETTINGS: admin emails, database names, cloud collection names, month names, Firebase keys.
 * Edit this file first when you need to change who is admin or which database/collections are used.
 */

/**
 * FIREBASE PROJECT KEYS
 * Read by the small module script in index.html (<head>). Firebase web keys are
 * meant to be public; real protection comes from your Firestore security rules.
 */
window.APP_CONFIG = {
  firebase: {
    apiKey: "AIzaSyAzEmPXSJs2i1OZqTkwE1cSOR7GQ0gUDFo",
    authDomain: "tourism-statistics-c06b9.firebaseapp.com",
    projectId: "tourism-statistics-c06b9",
    storageBucket: "tourism-statistics-c06b9.firebasestorage.app",
    messagingSenderId: "268830989351",
    appId: "1:268830989351:web:2750b8b727b8ada1cf8202",
    measurementId: "G-0KPS0T2FLY"
  }
};

/**
 * GLOBAL APPLICATION CONSTANTS & MONTH NAMES
 */
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// Only this email can edit. Everyone else is view-only.
const ADMIN_EMAILS = ["rhyant13th@gmail.com"];

// IndexedDB Configuration
const DB_NAME = "TourismDataBankDB";

const DB_VERSION = 4;

/**
 * CLOUD SYNC QUEUE
 * Tracks which local records still need to be pushed to Firestore
 * (new/edited records whose immediate cloud write hasn't happened or
 * failed) and which deleted records still need to be removed from
 * Firestore. This lets "Save to Cloud" push ONLY what changed instead
 * of re-uploading the entire database every time. Persisted to
 * localStorage so nothing is lost if the tab closes before syncing.
 */
const PENDING_SYNC_KEY = "tourismPendingSync_v1";

/**
 * FIRESTORE CLOUD STORAGE
 * Firestore is the shared master copy. IndexedDB remains a local cache
 * so the application remains responsive and can recover from temporary
 * network interruptions.
 */
const CLOUD_AE = "tourism_ae_records";

const CLOUD_TASS = "tourism_tass_records";
const CLOUD_COLLECTIONS = { aes: CLOUD_AE, tass: CLOUD_TASS };
const CLOUD_COUNTRY_COLLECTION = "tourism_country_records";

/**
 * COUNTRY OF ORIGIN (FORM A) — self-contained store/sync, separate from
 * the aes/tass pipeline above. Import-only (no manual per-record edits),
 * so it doesn't need the dirty-tracking sync queue those two types use.
 *
 * A localStorage mirror backs up every successful save. If IndexedDB
 * ever comes back empty/unavailable on load (e.g. the "countries"
 * store wasn't ready yet), this mirror is what keeps an import from
 * silently disappearing on refresh.
 */
const COUNTRY_LS_KEY = "tourismCountryRecords_v1";
