# Finance local acceptance — 2026-10-08

Status: **Partial**, not production acceptance. This is the newest continuation log.

## Environment

- Checkout: `C:\Personal project\family-management-system`; current FMS dev server: `http://localhost:5173`. The server wrapper identified this checkout and its API returned the Nojir family. October 7's 5174 address is historical; always check the current terminal output.
- Production-backed local QA, Nojir family `20000000-0000-4000-8000-000000000002`, mock owner `local_seedy`. Cross-family checks selected Sheikh `10000000-0000-4000-8000-000000000001` using that same owner. This does **not** prove separate-user privacy or real authentication/role enforcement.
- No schema changes or migrations applied. Read-only checks found all six Finance tables, and the API returned 200 without migration-required. An earlier transient upstream failure did not establish a missing migration.
- Synthetic prefix: `QA Finance 20261008023512`. These are bookkeeping records only; no real payments, funds or bank accounts were created/transferred.

## Corrections

- Load failures show Retry instead of misleading zero balances. Export and transaction-add are disabled during loading/failure; stale load responses are ignored. Failed refresh does not generate another route-level success message.
- Seven workbook sections have explicit BN/EN headers, including empty sections without invented rows. Date columns use numeric Excel cells with `yyyy-mm-dd`; money stays numeric; unknown row fields are excluded.
- Balance, income, expense, budget and outstanding amounts use exact cent totals. `0.10 + 0.20` spends exactly `0.30`, leaving `0.00` at a `0.30` budget limit.
- Record/action-specific confirmation and success copy is shared by the route and modal provider. Progress replaces the previous total; status/progress dialogs explicitly say no money is transferred.
- Archived wallets have Reactivate. Goal progress labels the target correctly and permits above-target savings rather than showing a misleading maximum.
- Duplicate month/category budgets return actionable localized 409 conflict, not generic 502. Debt overpayment is localized; prototype entity names return 400.
- Zero-wallet workspaces retain tabs when any records remain. The first-wallet empty screen is shown only when all six sections are empty.
- `allowImportingTsExtensions` with existing `noEmit` allows source helpers to be shared by Node tests and the app.

## API evidence

`scripts/qa-finance-local.mjs --allow-local-qa-writes` passed **67 assertions**:

- All six kinds created/edited/read: account, transaction, budget, debt, bill, goal.
- Opening `123.45`, income `10.10`, expenses `0.10`/`0.20`: active balance `133.25`.
- Duplicate budget rejection; lending/borrowing and debt partial/settled/open progress; over-principal rejection.
- Bill paid/skipped/pending, goal active/completed and above-target savings, negative progress rejection.
- Archive, archived-wallet transaction denial, reactivation, linked-wallet delete denial.
- Fractional cents/impossible dates rejected; unsigned read/create rejected; prototype entity rejected.
- All six kinds reject direct-ID edits/deletes in the other family; all four status entities reject cross-family IDs. These are same-owner tests, not separate-user tests.
- Read-only inspection at that checkpoint found **29 audit events**, all private, with actor `local_seedy` and the correct Nojir family.

## Browser evidence

- BN → EN → BN confirmed language preferences and close-X results; dark → light → dark round trip. Final workspace is Bengali/dark.
- Wallet archive cancel, confirmed archive and the new Reactivate control succeeded; archived status was re-read from the API.
- Budget edit entered `9.99`, then declined confirmation. API proved limit stayed `0.30` and `updated_at` was unchanged.
- Debt `100.31` against principal `100.30` produced a closeable error. Corrected Bengali copy was observed on retest, then a valid `0.10` update produced a single success modal.
- An additional `1.25` bill remained visible/editable in Bills with zero wallets. Its skipped status was confirmed in Bengali and persisted in the API.
- Cleanup reload showed the genuine empty Finance state. Browser error log was empty; no hydration error was observed in that reload. This is not all-route hydration acceptance.
- A later final reload reproduced the intermittent Finance load failure. The new closeable error modal classified it as an error; dismissing it revealed Retry with export/add disabled and no zero-balance metrics. Clicking Retry recovered the genuine empty workspace and re-enabled export. This confirms the observed recovery path, not the root cause or exhaustive fault injection.
- Local screenshot `finance-qa-2026-10-08.jpg` in the task workspace captures the debt success modal; it is not a product asset or committed to Git.

## Downloaded workbook

Opened and asserted `C:\Users\S M Zubayer\Downloads\nojir-poramanik-family-private-finance-2026-10-complete.xlsx`:

- English sheets Summary, Accounts, Transactions, Budgets, Debts, Bills, Goals, with data-row counts 1/1/3/1/2/1/1.
- Balance `133.25`, income `10.10`, expense `0.30`, budget spent `0.30` and remaining `0`, lent outstanding `100.20`, borrowed outstanding `20.20`, pending bill `30.40`.
- Transactions, Debts, Bills and Goals have numeric Excel dates, format `yyyy-mm-dd`, decoded as October 8, 2026.
- BN Complete XLSX was clicked and success shown, but no separate Bengali file was located/inspected. **Physical BN workbook acceptance remains open.** Unit round trips covered both languages' headers and native dates.
- Summary follows the selected month; other sections export the full loaded private sets, including all budget months. More month/single-section/large-export acceptance remains.

## Cleanup

- Exact-prefix cleanup passed **17 assertions**, deleting only 9 synthetic records: account 1, transactions 3, budget 1, debts 2, bill 1, goal 1. Unrelated Finance arrays were unchanged.
- After the zero-wallet bill test, its persisted skipped status was verified, then a second cleanup passed **9 assertions**, deleting only bill `64375444-5c90-4afb-8bfd-f64140be7069`. All six Finance sections are empty again. Do not rerun cleanup for these completed tests.
- Audit history remains. Retained Qurbani lifecycle, Directory relationship, Household bill and other user fixtures were not changed. No SQL/table reset was performed.

## Quality gates and open work

- Finance action-copy/export/validation: **13 tests passed**. Feedback 6, private admin-audit visibility 3, pagination 4 tests passed.
- TypeScript, full lint, tenant-scope, cancellation (75 handlers) and translation audits (2,949 literal pairs) passed. TypeScript, focused lint and production build passed again after the final empty-state edit.
- Open: real separate-user/member/admin/pending privacy and login, remaining browser create/edit/delete/cancel for every kind, goal progress and duplicate-budget UI, other validation translations, physical BN/single-section/large XLSX, month scope, other account/payment/recurrence types and blank dates.
- The observed transient load failure → Retry path passed. Root cause, deterministic fault injection, mutation-refresh failure, overlapping requests/family changes and concurrent writes remain open.
- Complete mobile/keyboard/screen-reader/four-palette matrix and existing hosted Site deployment/smoke tests remain. Local/GitHub updates are not evidence of deployment.
- Next: another Partial route in `QA_ROUTE_MATRIX.md`, e.g. Health appointments/measurements/files/SOS. Do not claim the full product is complete.
