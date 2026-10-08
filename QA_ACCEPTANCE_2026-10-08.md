# Finance and Health local acceptance — 2026-10-08

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

## Health continuation — newest slice

Still **Partial**. Same verified `http://localhost:5173` checkout, production-backed Nojir family and mock `local_seedy` owner as above. Health GET reported no missing migration; no SQL/schema changes were applied. Mock-owner cross-family checks do not prove real authentication, separate-user privacy or hosted acceptance.

### Corrections

- Browser datetime-local appointment/measurement values convert to timezone-aware ISO before create/edit. Dhaka 09:15 persists as 03:15 UTC and returns to the edit form as 09:15, instead of drifting six hours. Date defaults use the browser's local day.
- Create/edit share validation. Invalid reminders no longer become 60 or get rounded; invalid measurement timestamps no longer become now. Invalid medication times are rejected rather than discarded. Impossible dates/end-before-start, coercible booleans/arrays and excess numeric precision are rejected before writes. Canonical UUID and own-property entity guards replace loose/prototype matches.
- Validated dates protect profile save and document upload. Existing profile was preserved: the successful new profile-save audit branch was not exercised.
- Private create/status changes now add private audit entries, like edit/delete. Action-specific BN/EN confirmation/results distinguish record keeping from treatment or external bookings. Four new validation codes have localized copy.
- Failed loads offer Retry without misleading empty data/export; stale responses are ignored. Health deterministic failure/Retry acceptance remains open.
- Eight explicit BN/EN workbook sections include SOS Responses, empty headers, native date/time cells and timezone columns. Additional profile birth date/height/weight/last donation, appointment reminder minutes and SOS linkage/response fields are included. Numeric measurements remain numeric; unknown user/storage fields are excluded. Latitude zero is not lost in exported coordinates.
- Measurement choices, dosage hint and new medication default frequency follow the selected language. Status-menu buttons have accessible labels.

### Observed API and browser evidence

- `scripts/qa-health-local.mjs --allow-local-qa-writes` passed **62 checks**. Only synthetic prefix `QA Health 20261008040119` was written: medication, appointment, blood-pressure measurement and a one-pixel PNG. No real care/booking, SOS alert, location permission or notification delivery was initiated.
- Three record kinds create/edit/read; all medication/appointment statuses; unsigned rejection; same-owner other-family PATCH/DELETE/status rejection; invalid dates, times, reminders, decimals, missing secondary blood-pressure value and prototype kinds returned 400.
- Invalid document date/MIME/empty file rejected. Synthetic PNG upload 201, authorized GET 200 with exact bytes and nosniff, unsigned GET 401, cross-family GET/DELETE 404.
- Appointment browser edit showed October 9 **09:15**; API persisted `2026-10-09T03:15:00+00:00`. Changed title, opened save confirmation, dismissed its close-X; cancellation feedback closed and API proved original title/time unchanged.
- Measurement form showed October 8 **08:15**, 121.25/80.5. Entering 121.251 produced actionable English error with close-X, retaining the draft. Corrected synthetic 121.50 saved with specific success; table/API showed 121.5/80.5 and unchanged instant `2026-10-08T02:15:00+00:00`.
- BN → EN → BN preference/results and dark → light → dark round trip passed. Final preference is Bengali/dark. EN/BN XLSX actions showed generation success. **No physical Health download was located/independently inspected**: downloaded workbook acceptance remains open, despite shared-helper BN/EN roundtrip tests.
- Admin API verified **13 private owner-scoped record audits** for the three exact IDs before cleanup. Existing profile, emergency directory and SOS alerts/responses were unchanged.
- Task-workspace screenshot `health-qa-2026-10-08.jpg` captures measurement success. It is proof, not a product asset or committed file.
- Final post-cleanup reload loaded the preserved profile and genuinely empty care/log metrics in Bengali/dark. Browser error log was empty; no hydration error observed on this reload. This is not all-route hydration acceptance.

### Cleanup and quality

- Exact-prefix cleanup passed **15 checks**, permanently removing only medication `061abe0a-ed72-4068-aea1-7e567f1169f5`, appointment `a43a90b0-4d18-4b06-a5f0-35ac92e0cb3f`, measurement `203e1958-68b4-4e71-882b-6a597a210afc` and PNG metadata/file `3d1d39cc-bfe3-4bd0-9b88-3687388b438b`. Document DELETE 200 (not pending cleanup), subsequent GET 404. Unrelated arrays/profile/directory/SOS unchanged; audit history retained. **Do not rerun completed cleanup.**
- Health validation 5, action-copy 3, export 4, directory visibility 3 tests passed; all **43 configured `test:*` suites passed** after shared-modal changes.
- Nonincremental TypeScript, full lint, tenant-security, translation (2,973 pairs), cancellation (75 handlers), whitespace check and production build passed. No migrations needed/applied.

### Health still open

- Real separate-user owner/admin/member/pending privacy, same-family private access and emergency opt-out/opt-in browser/API/export acceptance.
- SOS create/respond/acknowledge/resolve/cancel, every role, zero-coordinate map, races and external delivery. Do not send accidental real alerts. Current browser reminders require permission and the page open; background/offline/SMS delivery is not implemented or verified.
- More measurement kinds/units and scheduling/end-date behavior; remaining profile/status/create/delete browser branches; keyboard/mobile/four palettes.
- Physical populated/empty BN/EN XLSX, nonempty SOS history/responses, consent filtering, invalid legacy data and large exports: not inferred from unit roundtrips or generation success.
- Oversize/remaining MIME files, malicious-content scanning, storage failure/recovery, concurrent writes, load Retry/family-switch races; hosted Site deployment/smoke tests.
- Next: a bounded Health/SOS gap safely, or another Partial route such as Welfare request/document/payout bookkeeping. Full product remains unfinished.

## SOS and reminder safety follow-up — newest slice

Still **Partial**, not deployed. No SQL/migration, valid SOS alert/response/closure, real medical-care action, location permission or notification delivery was initiated. Existing family/health application data was not edited or deleted; language preference was briefly switched and restored to Bengali. Dark mode was retained.

### Corrections and isolated evidence

- Closed SOS now rejects ordinary response/close attempts with localized 409. Reporter or authorized health-manager closure uses a family-scoped compare-and-set on the read status, returning 409 if it changes while saving instead of overwriting terminal history.
- First acknowledgment PATCH filters `status=eq.active`: a response read before a concurrent close cannot reopen it or replace an earlier acknowledgment. Response/resolve/cancel add family-scoped audit events without medical-note content in audit metadata.
- SOS public GET/create/close projections omit reporter/acknowledger/resolver authentication IDs, retain `is_reporter`, and allow only intended public family-alert fields. Emergency-directory consent behavior is unchanged.
- Location validation rejects mismatched/out-of-range coordinates, type coercion, excess database precision, negative/orphan accuracy. Browser geolocation, if the user requests it later, rounds to schema precision before sending. Latitude zero is supported in the map conditional; no actual geolocation or map link was used in this slice.
- Specific BN/EN create/respond/close confirmations and results state the exact limitation: in-app SOS history does not send SMS/email, call emergency services or dispatch help. Page/form warnings reflect this; recorded `called_emergency` is a member's statement, not an automatic call.
- Medication reminders and today's care list respect inclusive browser-local start/end dates and paused/completed status. Planner handles a short 60-second just-due grace, valid appointment offsets, a 24-hour timer horizon and duplicate medication times. The mounted page keeps family/event keys to suppress repeat delivery across its polling/clock refreshes. Notification failures are caught; titles are localized. The page explains that reminders need the Health page open and notification permission.
- `test:health-sos` **9 isolated tests** covered location/projection, terminal guards, reporter/manager authorization, cross-family lookup, compare-and-set races, all four response types and stale acknowledgment. REST calls were simulated, not made to PostgreSQL.
- `test:health-reminders` **5 pure tests** covered course dates/Dhaka time, duplicate times, scheduling grace, appointment statuses/offsets, invalid/far-future data and today's care list. **No real OS notification was delivered**. Actual mounted-page repeat suppression, permission changes and sleep/wake behavior remain unverified.

### Observed local API/browser evidence

- `node scripts/qa-health-sos-rejections.mjs` passed **24 checks** against localhost:5173/Nojir/mock owner: unsigned read; invalid SOS type/message/location; unsupported response; invalid closing state; nonexistent alert response/close. All were rejection paths. Profile, medications, appointments, measurements, documents, directory, alerts and responses were deep-equal before/after. No valid alert was submitted.
- Browser BN SOS form: empty message disabled Send, optional location untouched, in-app-only warning visible. Entered `QA cancellation test only — not an emergency`, opened confirmation, dismissed close-X, closed cancellation feedback. Draft remained; nothing sent.
- EN form/confirmation showed equivalent warnings. Declining `No, go back` showed closeable cancellation, preserving draft. Read-only API afterward confirmed **0 SOS alerts and 0 responses**, as before. Language was restored to Bengali; no location/reminder permission was granted.
- `health-sos-confirmation-2026-10-08.jpg` in the task workspace is the captured BN confirmation proof, not a repository asset.
- All **45 configured test suites** passed. Nonincremental TypeScript, lint, tenant-security audit, cancellation audit (75 handlers), translation audit (2,980 literal pairs), whitespace check and production build passed.

### Explicit remaining boundaries

- This is **not database-atomic**: response insert, acknowledgment and audit use separate REST calls. A response racing closure can be retained after close even though it cannot reopen the alert. Audit/backend failure after a saved write may report failure after persistence. An authorized transactional RPC/guard and staging two-session rollback/concurrency testing are still needed before claiming full consistency. No migration was prepared/applied in this slice.
- Positive valid SOS creation/response/closure, real multiple users/roles, consent filtering, populated history XLSX and mounted reminder/OS delivery remain untested here. Preserve genuine history; do not delete all SOS tables or silently send a test emergency.
- Background/offline/FCM/SMS/email, provider configuration/budget, complete same-user dedup across reloads/devices, mobile/accessibility and the existing Site deployment remain open. Do not infer them from a successful build or a confirmation screenshot.
- Safe next route: Welfare's remaining document/retention and bookkeeping branches, using separately labeled QA records, without real payment or changing retained approved fixtures. Health transactional delivery/real-user acceptance remains a separate open gate.
