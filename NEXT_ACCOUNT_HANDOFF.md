# Continue this project from another account

Snapshot: 2026-10-08 (Asia/Dhaka). This is the current entry point; older dated sections of `PROJECT_HANDOFF.md` are history and may describe work that was later completed or superseded. Recheck facts before acting.

## Open the existing checkout

- Folder: `C:\Personal project\family-management-system`
- GitHub: `https://github.com/S-M-ZUBAYER/family-management-system.git`
- Run `git status -sb` and `git log -1 --oneline` for the newest checkpoint; preserve any user edits. Do not assume a dated commit hash here is the latest checkpoint.
- `.env.local` exists locally. Never print, paste, commit, or send its Supabase secret. It is not in GitHub, so a different PC needs a separately configured local environment.
- Local development: run `npm.cmd run dev` and use the reported port. On 2026-10-08 the running FMS checkout is on **5173**, verified by the wrapper and Finance API. October 7's 5174 address is historical; recheck before any action and do not stop unrelated apps. Open `/signin-with-chatgpt?return_to=/` on the FMS origin if local sign-in is needed. A new browser may need to sign in again.

## Read before changing code

1. `README.md` for product requirements, architecture, local setup, and security expectations.
2. `PROJECT_HANDOFF.md` for the long technical history; use the newest dated entry over an older contradictory statement. Its old copy-paste prompt near the bottom is a historical snapshot, not the current starting state.
3. `QA_ROUTE_MATRIX.md` for observed versus untested route coverage.
4. `QA_ACCEPTANCE_2026-10-04.md` and `QA_ACCEPTANCE_2026-10-03.md` for actual local browser/database evidence and retained QA fixtures.
5. `QA_ACCEPTANCE_2026-10-05.md` for Magazine, `QA_ACCEPTANCE_2026-10-07.md` for Qurbani, then **`QA_ACCEPTANCE_2026-10-08.md`** for the newest Finance and Health evidence and remaining gaps.
6. `supabase/README.md` before any SQL action. Read-only audit first; never rerun all migrations or reset tables just because files exist.

## Exact current boundary

- Newest Health SOS/reminder follow-up: closed-state 409, conditional acknowledgment/close, response/close audits, safe identity-free projections and in-app-only BN/EN warnings. Course-aware reminder planning/today's care, localized titles and mounted-page dedup implemented. Nine simulated workflow and five pure reminder tests passed; 24 rejection-only API checks preserved all application data. BN/EN publish confirmations cancelled; API showed zero alerts/responses. No valid SOS, notification/location permission, real care or migration. All 45 suites and quality/build gates passed. **Response insert/status/audit are separate REST calls, not database-atomic**. Staging transactional/concurrency and real-user/positive SOS/delivery/download/mobile/hosted acceptance remain open. Safe next route: Welfare documents/retention and bookkeeping, without real payments or changing retained approved fixtures.
- Previous `/health` CRUD/files: 62 API checks for private medications/appointments/measurements/statuses/invalid input and synthetic PNG upload/read, unsigned/same-owner other-family IDs/files. Dhaka timezone persistence, stricter shared validation, specific BN/EN action/results, private create/status audit, load Retry safety and eight-sheet native-date/timezone export were corrected. Browser appointment confirmation-X cancel/no-write, decimal error then successful measurement edit, language/theme passed; 13 private audits checked. **All four synthetic records/files were removed in 15 checks**, preserving existing profile/directory/SOS. Do not rerun completed cleanup for `QA Health 20261008040119`. No SOS alert/delivery/real care or migrations. All 43 focused suites and quality/build gates passed. Physical downloaded Health workbooks, SOS lifecycle/delivery, background reminders, real separate-user emergency consent/privacy, fault injection/storage/races/mobile/hosted tests remain open. See newest Health section of October 8 log.
- Previous `/finance`: 67 opt-in API assertions covered all six kinds and statuses/validation/cross-family IDs; populated English seven-sheet XLSX was downloaded and checked with exact-cent amounts/native dates. Browser language/theme, archive/reactivate, budget cancel/no-write, localized debt error/success, zero-wallet bill visibility/status passed. 29 private scoped audits checked. All 10 synthetic Finance records were removed in 17+9 cleanup checks; do not rerun that completed cleanup. Physical BN download was not independently inspected; real separate-user privacy, remaining browser flows, fault injection/concurrency, large/mobile/hosted checks remain open. No migrations applied. See October 8 log.
- Previous `/qurbani`: 52 API checks, actual BN/EN current/all-years XLSX, linked/unlinked delete browser flows and 13 cleanup assertions passed. Separate finalization fixture was settled/closed with 28 write-denial checks per state and 46 audits. See `QA_ACCEPTANCE_2026-10-07.md`; real roles, races/over-allocation, nonzero settlement and hosted checks remain open.
- Animal-link protection is applied in staging/live: all three FKs verified validated `NO ACTION`, rollback-only equivalent SQL test passed in staging, API independent-link rejection and owner-browser delete flows subsequently passed. **Do not reapply** `20261007_qurbani_animal_link_guard.sql`. Direct race testing remains open.
- Retain immutable Nojir QA campaign `ad42aa28-2225-4cf8-80e2-042d23974676` (`QA Lifecycle Finalization 20261007095313`, 2029, closed) and completed task `88f60377-67b1-406e-822e-1f4fb57292a8`. The separate planning CRUD campaign `260c5b99-2e18-4421-a7f5-e4a31727c799` was removed after QA; do not rerun cleanup for it.
- The previous `/events` QA fixture remains `published` with its RSVP and comment. See `QA_ACCEPTANCE_2026-10-04.md` for exact fixture ID and incomplete branches.
- `/notices` remains **Partial**: its synthetic draft remains unpublished and unpinned; do not delete it without a target-specific decision. See `QA_ACCEPTANCE_2026-10-04.md`.
- `/members` remains **Partial**, not accepted: real separate-account request → approve/reject/suspend, nonempty XLSX, and family/role isolation remain. Its owner-browser continuation was committed as `264f0e3`. The QA browser is named `family-management-local-qa`; its `family-notices-qa` session was closed after this slice. A single owner browser or local mock identity cannot prove a second user's permissions.
- Continue a bounded Health gap safely (SOS lifecycle only with an explicit synthetic plan; no real alarm/location/permission/medical-care action), or another **Partial** route such as Welfare requests/documents/payout bookkeeping. Health still needs real-user emergency consent, physical XLSX downloads, storage failures and deterministic Retry acceptance. For `/magazine`, English/nonempty-comment XLSX, edit/featured/review, real roles/tenant isolation, large export and hosted Site remain. Do not call the whole product complete.
- There are many other partially accepted routes. Continue one section at a time using `QA_ROUTE_MATRIX.md`; do not report the whole product complete merely because a build succeeds.
- The owner explicitly asked to **keep** the Nojir `QA Member` → `QA Member Two Edited` parent-child relationship and `QA Utility Bill 2026-10-03`. Other QA records/files noted in the acceptance logs also remain. Do not delete or rewrite retained fixtures, production tables, financial history, or files without a fresh, target-specific authorization.
- Production Supabase project: `olqwsnttottqitookfck`. Separate staging project: `irqomyhxdpxrmfqiyxld`. SQL files were previously run manually in Supabase SQL Editor, so Git-style migration history does not prove installation. Verify installed schema/functions with the read-only audit before any correction. Do not expose database credentials in chat.
- Existing hosted Site: `https://family-management-system.hitht.chatgpt.site`, project ID `appgprj_6ab4e57009088191814056c14e820221`. This account could not access deployment for that Site. Recent GitHub commits are **not verified deployed**. Do not create a second Site or change its owner-private/custom access. If the new account also lacks access, ask the owner to deploy from the owning account or grant appropriate access; local testing may continue.

## Working method for each next route

Inspect the route, API, permissions, relevant SQL and the existing QA row. Test read, create/edit/status/delete when supported, cancellations, success/error/info dialogs with close X, both languages, default dark and light-mode round trip, and actual XLSX contents. Use clearly labeled synthetic records and avoid real payments or destructive production cleanup. Check another real user/role and family boundary where possible; explicitly mark it untested otherwise. Fix only observed defects, run focused tests plus TypeScript, lint, tenant-security, translation and cancellation audits, and a production build. Update `QA_ROUTE_MATRIX.md` and the dated acceptance log with exact evidence and remaining gaps. Commit and push verified changes; distinguish local code, applied database changes, and hosted deployment in every report.

Useful commands from the project root:

```powershell
git status -sb
git log -1 --oneline
npx.cmd tsc --noEmit --incremental false
npm.cmd run lint
npm.cmd run security:audit
npm.cmd run i18n:audit
npm.cmd run cancellation:audit
npm.cmd run build
```

On this Windows host a sandboxed Vite build sometimes fails with `spawn EPERM`; an approved unrestricted retry has succeeded. That sandbox error alone is not evidence of broken application code.
