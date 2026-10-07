# Local acceptance continuation — 2026-10-07

## Qurbani

- Existing local server at `http://localhost:5174/qurbani` loaded the production-backed QA campaign for 2027: one animal, seven target shares, zero participants and zero ledger entries. No campaign or financial rows were changed in this pass.
- Clicked the complete XLSX control and observed the closeable success modal. The browser download event did not return a file path, so the generated workbook was **not** independently opened or accepted on this evidence alone.
- Switched Bengali → English through a confirmation modal, observed a closeable success modal and English Qurbani labels, then switched back to Bengali through confirmation and observed the saved-preference result. The original dark-mode preference was left unchanged.
- Source inspection identified empty current-campaign XLSX sheets using a one-cell “No records yet” placeholder instead of their real columns. Added stable bilingual headers for all eight current-campaign sheet types. The focused test parses an actual empty XLSX worksheet and verifies the header row exists with no invented data row.
- Existing Qurbani policy, validation, money, distribution, payment reconciliation and action-copy tests passed. New export-header test, nonincremental TypeScript, lint, tenant-security, translation and cancellation audits, and production build passed.
- All-years export previously emitted raw database keys on populated sheets and a one-cell placeholder on empty sheets. It now projects explicit, bilingual columns in both cases, retains year/campaign context on record sheets, formats numeric cells as numbers, and excludes unknown database fields. Focused tests exercise all nine empty-sheet headers and an example populated participant row in both languages. TypeScript, lint, tenant-security, translation and cancellation audits, and production build passed again. This is code/workbook-unit verification, not an inspection of a browser-downloaded all-years file.

`/qurbani` remains **Partial**. Actual downloaded workbook contents, safe CRUD/delete/finalization paths, real member/admin role isolation, cross-family access, concurrent payment and over-allocation checks, and hosted Site deployment/QA remain open.
