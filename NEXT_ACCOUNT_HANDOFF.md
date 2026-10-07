# Continue this project from another account

Snapshot: 2026-10-07 (Asia/Dhaka). This is the current entry point; older dated sections of `PROJECT_HANDOFF.md` are history and may describe work that was later completed or superseded. Recheck facts before acting.

## Open the existing checkout

- Folder: `C:\Personal project\family-management-system`
- GitHub: `https://github.com/S-M-ZUBAYER/family-management-system.git`
- Run `git status -sb` and `git log -1 --oneline` for the newest checkpoint; preserve any user edits. Do not assume a dated commit hash here is the latest checkpoint.
- `.env.local` exists locally. Never print, paste, commit, or send its Supabase secret. It is not in GitHub, so a different PC needs a separately configured local environment.
- Local development: from this folder run `npm.cmd run dev`, then open `http://localhost:5173/signin-with-chatgpt?return_to=/` if a local sign-in is needed. A prior browser was signed in as the Nojir family owner; a new account/browser session may need to sign in again.

## Read before changing code

1. `README.md` for product requirements, architecture, local setup, and security expectations.
2. `PROJECT_HANDOFF.md` for the long technical history; use the newest dated entry over an older contradictory statement. Its old copy-paste prompt near the bottom is a historical snapshot, not the current starting state.
3. `QA_ROUTE_MATRIX.md` for observed versus untested route coverage.
4. `QA_ACCEPTANCE_2026-10-04.md` and `QA_ACCEPTANCE_2026-10-03.md` for actual local browser/database evidence and retained QA fixtures.
5. `QA_ACCEPTANCE_2026-10-05.md` for Magazine browser/export evidence, then `QA_ACCEPTANCE_2026-10-07.md` for the newest Qurbani evidence.
6. `supabase/README.md` before any SQL action. Read-only audit first; never rerun all migrations or reset tables just because files exist.

## Exact current boundary

- The newest interactively observed slice is `/qurbani`: the 2027 QA campaign loaded locally and BN/EN preference round-tripped back to Bengali. Current-campaign and all-years XLSX headers were corrected and workbook-unit-tested. Both actual Bengali downloads were then opened read-only: 8/9 sheets respectively, with expected row counts, empty headers and numeric QA amount/weight. English and nonempty multi-section exports remain open. See `QA_ACCEPTANCE_2026-10-07.md`. The earlier `/magazine` evidence is in `QA_ACCEPTANCE_2026-10-05.md`.
- The previous `/events` QA fixture remains `published` with its RSVP and comment. See `QA_ACCEPTANCE_2026-10-04.md` for exact fixture ID and incomplete branches.
- `/notices` remains **Partial**: its synthetic draft remains unpublished and unpinned; do not delete it without a target-specific decision. See `QA_ACCEPTANCE_2026-10-04.md`.
- `/members` remains **Partial**, not accepted: real separate-account request → approve/reject/suspend, nonempty XLSX, and family/role isolation remain. Its owner-browser continuation was committed as `264f0e3`. The QA browser is named `family-management-local-qa`; its `family-notices-qa` session was closed after this slice. A single owner browser or local mock identity cannot prove a second user's permissions.
- Continue next with English/nonempty Qurbani XLSX and safe remaining Qurbani branches, or another **Partial** route from `QA_ROUTE_MATRIX.md`. For `/magazine`, English/nonempty-comment XLSX, edit/featured/review branches, real roles/tenant isolation, large export and hosted Site remain. Do not call the whole product complete based on one route.
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
