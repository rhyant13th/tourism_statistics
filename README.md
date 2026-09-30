# Tourism Statistics Data Banking System (modular version)

Open `index.html` (or upload the whole folder to your hosting). **Keep the folder structure.**

## Where to edit what

| I want to change...                                   | Edit this file              |
|-------------------------------------------------------|-----------------------------|
| Admin email(s), database/collection names, Firebase keys | `js/config.js`           |
| Colors / fonts (Tailwind theme)                        | `js/tailwind-config.js`     |
| Custom CSS, print header style                         | `css/styles.css`            |
| Page layout, buttons, tables, forms, report headings   | `index.html`                |
| Logos / seals                                          | `assets/` (replace the PNG, same file name) |
| Login, admin vs view-only                              | `js/auth.js`                |
| Dashboard cards, filters, charts                       | `js/dashboard.js`           |
| Tourist Arrivals (AEs): table, form, bulk upload       | `js/aes.js`                 |
| Same-Day Visitors (TAss): table, form, bulk upload     | `js/tass.js`                |
| Annual and Monthly summary reports                     | `js/reports-summary.js`     |
| Top 10 AEs, Top 10 Attractions, Top Municipalities     | `js/reports-top-lists.js`   |
| Country of Origin (Form A)                             | `js/country-origin.js`      |
| Backup, restore, export by period, reset               | `js/backup.js`              |
| Firebase save/load/sync                                | `js/cloud-sync.js`          |
| Browser (IndexedDB) storage                            | `js/local-db.js`            |
| Shared Excel import / export helpers                   | `js/import-helpers.js`, `js/export-helpers.js` |
| Modals, toasts, tab switching                          | `js/ui.js`                  |
| What runs when the page opens                          | `js/main.js`                |

## Rules to remember
- The scripts share one global scope, so a function in one file can call a function in another. No imports needed.
- Script order in `index.html` matters: `config.js` loads in the `<head>`, `main.js` must stay last.
- If you add a new JS file, add a `<script src="js/yourfile.js"></script>` line above `main.js`.
- Each report view in `index.html` has its own print heading with the seal and office name (search for `print-report-header`).
