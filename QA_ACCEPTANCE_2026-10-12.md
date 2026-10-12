# Family Management System acceptance — 2026-10-12

## Notices: safe reload, explicit Retry and parsing deadline

Source checkpoint: `08a0deb` (`Guard notice reloads against stale responses and parsing timeouts`). This completes the bounded deterministic Notices loader slice left open on October 11, not full route/product acceptance.

- Reload immediately clears the previous family, notice rows, management permission and selected detail. The early accessible loading view hides ticker, metrics, editor/detail portals and ordinary controls instead of presenting stale data. A failed read stays on an unavailable page with explicit Reload; it does not become a successful empty authorized board.
- The shared generation gate applies to fetch, deferred JSON, loaded/error/finally callbacks, locale-effect replacement and unmount. A 25-second Promise race now settles both hung fetch and hung JSON even if they ignore AbortSignal. It aborts the request, removes its listener/timer and shows a coded BN/EN Error through the existing close-X result modal. Late completion cannot publish notices or overwrite another load. Only explicit callers retry GET; no automatic retry or mutation resubmission was added.
- Strict snapshots reject missing/coerced/duplicate/oversize/invalid rows and migration-required snapshots containing notice rows. Plain-text 401/403/413 and malformed/upstream errors map to safe localized read codes without reflecting arbitrary backend messages. A different family from the previously confirmed snapshot fails closed and requires reopening the correct workspace; the first snapshot still relies on server membership scoping, not an independent workspace identity comparison.
- Unknown-write verification remains locked after failed, obsolete, timed-out, setup or migration reload. Only a successful current, valid, non-migration explicit reload unlocks it. Reload does not repair audit logs or replay an action. Existing component-memory protection is not durable idempotency.
- Local unsent form state survives transient read failures. Valid reload closes an edit when its record disappeared, its updated-at version changed, management permission was lost or schema is unavailable. It does not silently save/rebase the old form. Export captures a generation checkpoint before asynchronously importing the workbook library; an intervening reload, mutation or unmount prevents writing a previous snapshot and produces informational feedback. Client-expected-version write concurrency and actual browser form/export-race acceptance remain separate work.
- Ten new pure/simulated tests passed: immediate data/permission clearing and explicit recovery; stale success/error/finally suppression; deferred JSON; unmount despite ignored abort; fetch and JSON deadlines including late completion; malformed/scoped/family snapshots; setup/auth/row-limit/non-JSON/upstream mapping; verification lock; edit eligibility/export checkpoint; bilingual copy and UI wiring. Controlled helper failures and source assertions are **not fault injection or visual browser acceptance**.
- New reusable `scripts/qa-notices-read-local.mjs` passed **55 actual read-only loopback checks** using the existing production-backed mock owner: two-family valid loads/public fields, real unsigned 401 mapped to sign-in error, explicit recovery, same-owner other-family response rejected by the client's expected-family check, current page HTTP 200, and before/after snapshots equal. Nojir remained 0 notices and Sheikh remained 1 historical notice. This is not a real separate-account/role permission test.
- All **61 configured regression suites**, nonincremental TypeScript, full lint (including a final pass after the read-only harness was added), tenant-security, translation (**2,899 literal BN/EN pairs**), cancellation (**70 direct client fetch handlers**), whitespace and production build passed. Framework optimization/static route-classification warnings are not browser or deployment acceptance.
- No application records, files, audit history or database schema were changed. No synthetic fixture, cleanup, SQL, upload, payment, real announcement/SOS or external delivery was needed. Preserve all historical QA records, including the user-retained bill/relationship/finalized campaign, and never rerun completed October 11 cleanup.
- Starting a preview discovered an already-running FMS server at **http://localhost:5173**, **PID 19720**, in the correct checkout. The attempted new wrapper exited without starting another server. Existing listener identity was verified, reused for reads and **left running**; it is not owned by this turn and must not be stopped. No new browser automation or physical XLSX/download/theme/language/hydration acceptance was attempted; the older blocked internal-browser surface was not bypassed.
- The preserved existing private Sites project lookup returned not found. Its identity, access, authentication and secrets were not changed and no duplicate Site was created. Source delivery to GitHub is not hosted deployment.

## Next / still partial

Next safe source slice: **Events ordinary record/audit write outcomes and uncertain-response handling**, with strict input/acknowledgement checks and a fresh scoped synthetic plan where actual CRUD is needed. Do not alter the retained published event, RSVP/comment or retained notice to manufacture acceptance.

Notices still needs fresh actual browser lifecycle/confirmation-X/cancel/pending/unknown/Retry/form recovery and export-race tests; physical populated BN/EN XLSX and large/mobile/keyboard/hydration checks; real separate-user admin/member denial and scheduled/ticker visibility; actual backend/audit/transport fault reconciliation and two-session concurrency/durable idempotency; owning-account hosted acceptance. The whole project remains partial.

## Repeatable read-only check

Use the verified FMS origin reported by its dev server; do not point at another project. This command cannot create or delete fixtures:

```powershell
$env:FMS_QA_ORIGIN = 'http://localhost:5173'
node scripts/qa-notices-read-local.mjs
```
