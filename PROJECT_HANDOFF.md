# Family Management System — Project Handoff

Last updated: 2026-10-03 (Asia/Dhaka)

This file is the authoritative handoff for continuing the project from another Codex account. Read it completely before changing or deploying anything.

This is a **source-code handoff, not a claim that the whole product is finished**. "Implemented locally" means code exists in this checkout; "applied" means a database change was previously checked; "live" means the deployed Site was independently checked. Those states must not be treated as interchangeable. The verification statements below are dated snapshots, so the next account must recheck them.

## Immediate continuation status

- **2026-10-03 Qurbani local acceptance follow-up:** `QA_ACCEPTANCE_2026-10-03.md` now records QA animal creation/edit/purchased-status persistence and cancellation, plus a synthetic miscellaneous collection create/edit/delete whose removal restored the ledger to zero. The `QA-COW-2027-01` animal remains in Nojir Poramanik Family's 2027 QA campaign for later schedule/distribution testing. Browser testing found generic/mixed-language Qurbani confirmation and result copy; the local source now provides record-specific bilingual create/edit/delete wording and an explicit permanent-delete warning. The updated Bengali animal edit result and cancelled-delete warning were browser-verified. The new action-copy test, TypeScript, lint, security/cancellation/i18n audits, all 20 `test:*` scripts, diff check and production build pass; the first sandboxed build hit `spawn EPERM`, while the approved unrestricted rerun passed. Animal hard deletion, actual expenses/refunds, exports and the remaining submodules are not accepted; no deployment was performed.

- **2026-10-03 local browser acceptance addendum:** See `QA_ACCEPTANCE_2026-10-03.md` for the exact per-module actions observed and the untested matrix. Notices/events, finance, magazine, Household shopping, Health medication, Archive collections, Welfare contribution/refund, and Qurbani vendor now have local UI CRUD or status-flow evidence. Notice/Event timezone edit drift, duplicated Health/Notification success dialogs, and SOS cancellation behavior were corrected. Lint, nonincremental TypeScript, build, security/cancellation/i18n audits, and all 19 configured `test:*` scripts passed after the edits. **The full product is not accepted or deployed**: multi-user permissions, many submodules, actual XLSX contents, file flows, external delivery, and live smoke tests remain open.

- **2026-10-03 production-data reset and local acceptance progress (latest; supersedes older data/migration-status notes below):** The owner explicitly confirmed permanent removal of all existing rows from the 75 `public` application tables in production Supabase project `olqwsnttottqitookfck`. The SQL Editor completed one guarded `TRUNCATE ... RESTART IDENTITY` transaction without `CASCADE`; a follow-up query confirmed 75 tables remained and representative application tables had zero rows. This was irreversible: no project backup was available. Auth users, storage objects, schema, functions, and Site R2 files were **not** deleted. `supabase/dev_fixture_two_families.sql` was then run once and verified: Sheikh Monsuf Family and Nojir Poramanik Family each have 22 synthetic profiles, 36 parent/spouse relationships, and one `local_seedy` owner membership. That account is a local mock login, not an authenticated deployed user. Do not rerun the fixture without another deliberate reset; it intentionally aborts if families already exist. The user's original local 'failed/no data' condition was caused by not signing in, not by the prior rows. Open `http://localhost:5173/signin-with-chatgpt?return_to=/` after starting `npm.cmd run dev` for local testing.
- **2026-10-03 UI/bug fixes and tests (local only):** Added bilingual, searchable `/help` instructions and `/contact` support cards for `smzubayer9004@gmail.com` (mailto) and WhatsApp `+8801304979278`; the in-app support-ticket form defaults preferred contact to the signed-in email. The ticket does not automatically send an email; mailto opens the visitor's email app. Dark is now the first-visit default while a saved light preference still applies. Fixed Supabase REST handling of successful empty-body responses, which previously produced a false failure after actually inserting a member. Fixed dashboard generation counting to use maximum parent depth rather than a first-visited breadth-first depth. Reduced duplicated action-result dialogs. Browser-verified the two-family switch, dark/light toggles, BN/EN toggles, Help route/search, Contact links and email autofill, Directory member create/edit, and Qurbani campaign/share create/edit/delete. Nojir currently has 24 profiles because two QA profiles were left for further tests; Nojir also has one QA 2027 Qurbani campaign, while its QA participant was created, edited, then deleted. TypeScript, ESLint, tenant-security audit, cancellation audit (76 client fetch handlers), i18n audit (2896 pairs), all 19 configured `test:*` scripts, diff check, and production build passed after these edits. This does **not** mean every route and role was tested. Especially open: actual two-user authorization/isolation, membership approvals, file uploads, XLSX contents, all module CRUD flows, and production hosted smoke test. Directory currently supports profile create/edit and relationship delete, but no member-profile hard delete action; do not claim complete profile CRUD. External WhatsApp delivery was not tested, and support email is mailto only. The existing Site still returns `Sites project not found` to this account, so these source changes are **not deployed**. Its external account owner must deploy this checkout or grant appropriate access; do not create a duplicate Site without the owner's choice.
- **2026-10-03 verified update (supersedes older migration/test-status notes below):** Created a separate free Supabase staging project, loaded the fresh schema, reproduced the production `review_member_request` function, applied `20261002_member_reapproval_guard.sql`, and passed its rollback-only membership test. The rollback-only Qurbani finalization, Welfare atomic-outflow, and Welfare document-retention tests also passed in staging; zero synthetic test families remained afterward. Staging verification found the membership guard executable by the service role but not browser roles. Applied only that reviewed membership function/permission migration to the existing production Supabase project in a transaction. The production read-only SQL audit now reports **34/34 OK**; the guard is live in the database. No older migrations were rerun and no member records were modified. Two-session concurrency and authenticated application tests remain open. Local full lint, TypeScript, security/i18n/cancellation audits, all 19 test scripts, and the production build passed. This account's Sites connector still returns `Sites project not found` for the existing project, so the large local code batch is **not deployed**. Free-plan project backups are unavailable; do not run this migration again.
- The new isolated staging Supabase project is `irqomyhxdpxrmfqiyxld` (`https://supabase.com/dashboard/project/irqomyhxdpxrmfqiyxld`). It has the fresh schema and no real family/member data. Use its authenticated SQL Editor for future database tests; do not place its database password or any API secret in this file or chat.

- Site-wide cancelled-mutation follow-up (2026-10-03, local only): a source audit found 35 further client mutation fetches without a declined-confirmation guard. Contact, Notifications, Privacy, Admin, Notices, Events/RSVP/media, Archives, Household, Governance, Health, Magazine, Chat, Dashboard, Directory, and family switching now stop on the confirmation layer's intentional HTTP 499 instead of reporting a false save/delete error or clearing a draft. Shared action helpers propagate cancellation to their callers. The automatic chat read receipt remains intentionally exempt from confirmation. A new `npm.cmd run cancellation:audit` checks all 76 confirmation-gated client fetch handlers currently found by its TypeScript source scan; it passes, as do feedback tests (4), TypeScript, full lint, tenant/translation audits, and production build. Magazine's two-step article/cover flow now keeps the saved article in edit mode if the separate cover upload is declined, preventing a duplicate on retry; the global cancellation copy no longer claims that previously confirmed steps were undone. This audit is static, not a browser/integration test, and does not prove all indirect actions are covered. No SQL migration is needed. The existing Site again returned `Sites project not found` to this account, so this batch is not deployed.
- Cancelled-action result follow-up (2026-10-03, local only): the global confirmation dialog returns an intentional HTTP 499 when the user chooses No. Qurbani, Welfare, and Personal Finance mutation handlers now stop on that response instead of treating it as a failed mutation and opening a second, misleading error modal. Welfare's shared `postAction` returns an explicit cancellation result so status changes and new records also stop without a reload or success message; cancelled forms stay open. Existing feedback tests (4), Qurbani money tests (2), TypeScript, full lint, tenant/translation audits, diff check, and production build pass locally. No SQL migration is needed. Authenticated browser cancellation checks remain open, as does an audit of the other modules' cancellation handling. The existing Site returned `Sites project not found` again, so this is not deployed.
- Qurbani monetary-summary follow-up (2026-10-03, local only): dashboard totals, selected-year and all-years XLSX summary totals, participant/vendor outstanding amounts, and two on-screen subtotals now add validated money in integer cents before converting to numeric display/XLSX values. This avoids floating-point artifacts such as `0.10 + 0.20` in financial summaries. A new `test:qurbani-money-total` covers cents, refunds/balance, nonnegative outstanding, invalid precision, and XLSX-safe total range. The focused test (2), existing numeric/date validation tests (5), TypeScript, full lint, tenant/translation audits, and production build pass. The sandboxed build hit Windows `spawn EPERM`; the approved unsandboxed rerun passed. No database schema change is needed for this slice. Authenticated browser/XLSX checks and deployment remain open. The existing Sites project still returned `Sites project not found` to this account, so do not claim this change is live.
- Membership reapproval guard (2026-10-02, local only): an old pending join request could reactivate an existing `suspended`/`left` membership because `review_member_request` used an upsert that set `status='active'`. The approval API now returns 409 when the requester already has any membership row in that family. The fresh-project schema and new `20261002_member_reapproval_guard.sql` remove the reactivation path and make a concurrent insert conflict fail rather than reactivate access. `supabase/member_reapproval_guard_test.sql` is a staging-only rollback test for fresh approval, existing active/suspended membership, and rejection; it has **not run on PostgreSQL**. The read-only existing-project audit now includes guard/permission checks, which should show the guard as missing until this migration is applied; that revised audit has not been run. The migration is **not applied** to the existing Supabase project. Local family-selection/privacy tests, TypeScript, full lint, tenant/translation audits, source-to-migration function comparison, and production build pass. Do not rely on database-level protection or deploy this change until the existing function is reviewed, the migration is applied in the proper order, and the rollback/concurrency tests pass in staging.
- Event-media access/deletion follow-up (2026-10-02, local only): direct `/api/event-media/:id` downloads now recheck the media's parent event in the same family; regular members cannot download media after that event becomes a draft, while event managers retain draft access. The download response is `private, no-store` and sets `nosniff`. A focused access-policy test covers missing/draft/published/closed/completed/cancelled events. Single-media and whole-event deletion now remove database access before deleting R2 objects, so a database failure cannot leave a still-visible record with a missing file. Failed R2 cleanup returns HTTP 202 (informational result modal) and records pending keys in audit metadata; whole-event deletion pages the media-key inventory and refuses more than 20,000 media rows before doing any deletion. Focused event-media, pagination, and feedback tests, TypeScript, full lint, tenant/translation audits, diff check, and production build pass. No SQL migration is needed. Authenticated role-revocation, direct-ID, deletion-failure, large-media, and browser-modal checks plus deployment remain open.
- Action-result and currency-display follow-up (2026-10-02, local only): the shared confirmation/result layer now treats HTTP 202 (document access removed but private-storage cleanup still pending) as an informational, closeable result instead of a falsely completed success. The feedback test covers accepted, completed, and failed responses. All 12 BDT currency formatters across dashboard, Qurbani, Personal Finance, Welfare, Household, Events, and Archives now retain up to two fractional taka digits instead of rounding valid cent values to whole taka on screen. These are display changes only; they do not change persisted amounts or prove aggregate/export arithmetic. Feedback tests (4), TypeScript, full lint, tenant/translation audits, diff check, and production build pass. No SQL migration is needed. Authenticated pending-cleanup and fractional-money browser checks, plus deployment, remain open.
- Qurbani reload/privacy follow-up (2026-10-02, local only): failed or setup-required Qurbani reloads now clear previously loaded campaigns, child records, permissions, and open editing dialogs before showing a closeable result and an explicit retry/access state. The campaign selector, exports, and create action are unavailable while a reload is in progress; late results from an older overlapping request cannot replace newer data. A mutation no longer overwrites a failed refresh message with an unconditional success message. The API now uses the shared bounded-pagination helper and returns a specific HTTP 413/code for more than 20,000 rows in any Qurbani collection; the UI explains that no partial view/XLSX was shown. Pagination tests (4), TypeScript, lint, tenant/translation audits, diff check, and production build pass. No SQL migration is needed. Authenticated role-revocation, overlapping-load, large-history, and export tests plus deployment remain open.
- Qurbani date/time integrity (2026-10-02, local only): campaign registration deadlines and slaughter dates, animal purchase dates, transaction dates, slaughter schedules, task deadlines, and meat-collection times now reject malformed/impossible dates on create and edit. Timestamp inputs to the API must carry an explicit timezone offset and are normalized to UTC. The Qurbani browser forms convert `datetime-local` values to UTC for saving and convert stored timestamps back to the browser's local clock when editing, avoiding the previous UTC clock-time shift. `npm.cmd run test:qurbani-validation` (5), Qurbani policy tests (3), TypeScript, lint, tenant-security/translation audits, diff check, and production build pass. No SQL migration is needed. Authenticated create/edit, timezone-specific browser checks, XLSX review, and deployment remain open.
- Qurbani numeric integrity (2026-10-02, local only): campaign create/edit and all Qurbani record create/edit endpoints now validate money against `numeric(14,2)`, shares against `numeric(10,2)`, and weights against `numeric(12,2)` before writing. Fractional cents, extra weight/share decimals, exponential/hex notation, out-of-range values, fractional years, and fractional/overflowing sequence or package counts are rejected rather than rounded by JavaScript or PostgreSQL. Auto-calculated participant amount due uses exact hundredths with one explicit cent-rounding step and rejects overflow. The Qurbani form now offers 0.01 steps for monetary inputs and target shares. `npm.cmd run test:qurbani-validation` (3), existing Qurbani policy tests (3), TypeScript, lint, security/i18n audits, and production build pass. No SQL migration is needed. Authenticated create/edit, XLSX totals, and browser form/error-modal acceptance tests are still open; this is not deployed.
- Suspended-family access hardening (2026-10-02, local only): the shared membership lookup now requires both an active membership and an active family, so a suspended/archived family cannot be opened merely because its membership row remains active. A stale selected-family cookie now fails closed instead of silently switching an in-flight action to a different family. `/setup` lists only the signed-in user's other active families for explicit recovery through the existing confirmation/result-modal-controlled family switch. Explicit create/join onboarding still detects any active family independently of the stale cookie, preserving additional-family creation idempotency. `npm.cmd run test:family-selection` (6), TypeScript, lint, tenant/translation audits, and production build pass. A read-only Supabase Data API probe returned HTTP 200 for both selected and fallback inner-join query shapes; it did not exercise real suspended rows. No migration is needed. Authenticated suspension/revocation, stale-cookie recovery, two-family action isolation, and deployment are still open.
- Health emergency-directory privacy (2026-10-02, local only): `/api/health` now reads the current family's explicit `allow_emergency_access=false` choices and omits those members from the family emergency/blood-donor directory, even when a health profile is set to family/emergency visibility or donor-available. The directory still returns a member's own full health data only through the separate owner-scoped profile. The server strips the user ID used for the consent match from directory results; a consent read failure does not return a partially filtered directory. `npm.cmd run test:health-directory` (3), TypeScript, lint, security/i18n audits, and the production build pass. No SQL migration is needed. Authenticated two-user opt-out, opt-in, XLSX, and direct-API tests plus deployment remain open. This does not change voluntarily posted SOS alerts or activate external emergency notifications.
- Additional family creation (2026-10-02, local only): an account with an active family can now explicitly create another family from `/setup`, becoming that new family's Owner without changing existing memberships. The form sends a stable per-attempt UUID creation key; the server derives a unique slug from it and looks up only families created by the signed-in user, so a retry of the same attempt resumes the same family instead of making a duplicate. The new family is selected with the existing HTTP-only active-family cookie. Revoked/inactive owner access and a previously completed family cannot be silently reinstated; those checks now run before profile insertion. `npm.cmd run test:family-selection` (5), TypeScript, lint, security/i18n audits, and the production build pass. No SQL migration is needed. This is not deployed or authenticated-browser tested; two-family creation, retry-after-interruption, cross-tab selection, and Site access remain open.
- Multi-family membership workflow (2026-10-02, local only): `/setup` lets an already active member request to join another family using that family's join code; the request remains pending until that family's Owner/Family Admin approves it. It rejects an existing active or inactive membership in the target family instead of silently granting/reactivating access. After approval, `/api/workspace` lists only the signed-in user's active-family choices, and the sidebar offers a family switcher when there are multiple. `/api/workspace/select` verifies the exact target membership and active family before setting an HTTP-only, same-site selected-family cookie. Every existing module resolves its active family through the shared membership helper, which rechecks the cookie against that user's active membership and the family's active status on each request. A stale selection now requires an explicit recovery switch on `/setup`; only a user without a selected-family cookie falls back to their first eligible membership. A switch reloads the current route and signals other open tabs to reload to prevent mixed-family client data; the dashboard/workspace loader also rejects a cross-request family mismatch. The global mutation confirmation and result modals cover the switch action, with a success message after reload. No SQL migration is needed. Authenticated two-family approval/switch/tenant-isolation and cross-tab browser tests, plus deployment, remain open.
- Personal Finance monetary precision (2026-10-02, local only): create/edit records and debt/goal progress updates now reject fractional cents, exponential/hex input, out-of-range `numeric(14,2)` amounts, and non-integer budget alert percentages before a database write. The API no longer silently rounds alert thresholds, and a missing progress amount no longer becomes zero. Money inputs now use 0.01 increments and alert percentages use whole-number increments. `npm.cmd run test:finance-validation` covers these cases; no SQL migration is needed. Authenticated form/API and result-modal testing remains open.
- Personal Finance input validation (2026-10-02, local only): account transactions now require an explicit real ISO calendar date rather than silently falling back to the server's UTC day. Budgets reject impossible months; debt, bill, and goal dates reject malformed/impossible values before PostgreSQL writes on both create and update. Blank optional debt/goal dates remain allowed. `npm.cmd run test:finance-validation` covers leap days, invalid months/dates, and optional blanks. No SQL migration is needed; authenticated form/API and result-modal checks remain open.
- Live Supabase SQL Editor audit (2026-10-02): the dashboard project ref matches local `SUPABASE_URL`. `supabase/verify_existing_project_readonly.sql` ran successfully on the existing project and returned 30 rows, all `OK`; its extended 31st check for non-trigger functions executable by `anon` or `authenticated` also passed (a focused `result <> 'OK'` rerun returned 0 rows). Five trigger-only functions retain default execute grants, but they are not callable as ordinary RPCs; no callable public-schema function is exposed to those browser roles. The audit verifies the named chat uniqueness indexes/default-channel trigger, Qurbani finalization functions and triggers, Welfare atomic-outflow RPC and execute permissions, Welfare document-retention guards, duplicate/orphan aggregate checks, and RLS enabled on all public tables. It does **not** prove trigger/RPC behavior under transactions or the full body of every function. No production migration or data mutation was performed. Manual SQL Editor runs are not represented in the Supabase migration-history page, which still showed no recorded migrations.
- Current-account Sites access was checked again on 2026-10-02 with the existing `project_id` from `.openai/hosting.json`; Sites returned `project_not_found` (404). The site may still exist under the original owning account, but this account cannot publish or verify its live version. Do not create a duplicate Site or change the audience to work around this.

- Notification direct-ID state hardening (2026-10-02, local only): read/unread/archive/restore now reuses the same recipient, scheduled-time, expiry, and saved-category visibility policy as notification GET before accepting a notification ID. Hidden/future/expired items return 404 instead of allowing their existence to be inferred by a state mutation. The preferences read is shared between GET and PATCH. `npm.cmd run test:notifications`, TypeScript, lint, tenant audit, diff check, and production build pass; authenticated direct-ID and role-change checks remain open. No SQL migration is needed.
- In-app scheduled-notification refresh (2026-10-02, local only): Notification Center now re-reads eligible notifications every minute and when a backgrounded tab becomes visible, so an already scheduled alert appears without requiring a page reload. Stale responses cannot overwrite a newer read; failed background reads clear stale results and show one closeable error rather than filling the modal queue each minute. An open notification-preferences dialog keeps its unsaved draft during background refresh. This is not external email/SMS/push delivery or a scheduler for generating reminders. No SQL migration is needed. TypeScript, lint, translation/security audits, diff check, and production build pass; authenticated scheduled-delivery and role-change browser tests plus deployment remain open.
- Time-based UI follow-up (2026-10-02, local only): Notices/ticker, Events, Health appointments, and Archive expiry summaries now use a shared clock that starts only after hydration and refreshes every minute or when the tab becomes visible. This removes their server/client first-render clock difference and keeps deadline-based views current without a page reload. The dashboard notice ticker also re-fetches every minute so a notice scheduled for future publication can appear after the server begins exposing it; failed/revoked reads clear stale ticker items. Personal Finance's selected month is initialized after hydration to avoid a month-boundary mismatch. No SQL migration is needed. TypeScript, lint, translation/security audits, diff check, and production build pass; authenticated date-boundary and ticker polling browser tests plus deployment remain open.
- Locale hydration fix (2026-10-02, local only): the shared locale provider now renders Bangla on both the server and the browser's first pass, then restores a saved English browser preference after hydration. It does not overwrite that saved preference during startup and tolerates blocked browser storage. This addresses the reported `Family workspace` / `পারিবারিক ওয়ার্কস্পেস` mismatch in the common sidebar, which appeared on every route. TypeScript, lint, translation/security audits, and production build pass. A fresh unauthenticated local-browser load showed no console hydration error; an authenticated saved-English reload and deployed-site check remain outstanding.
- Local Magazine and Family Tree relationship updates are implemented and committed.
- A shared BN/EN locale provider, database-persisted per-user language preference, bilingual theme controls, and bilingual global confirmation/result modals are implemented locally. The bilingual pass covers the core modules and localized XLSX exports. A read-only Supabase REST probe on 2026-09-30 returned HTTP `200` for `family_memberships.preferred_locale`, confirming that `20260929_user_locale_preference.sql` is applied.
- `npm.cmd run i18n:audit`, `npm.cmd run lint`, `npm.cmd run security:audit`, and `npm.cmd run build` were run again successfully after the latest continuation request.
- A read-only Supabase Data API audit of the project configured in local `.env.local` on 2026-10-02 returned HTTP `200` for all **75/75** tables in `supabase/schema.sql`; the Supabase OpenAPI catalog also exposed **939/939** expected table columns. Contact, Notification, Privacy, and other table/column additions therefore appear present. The `settle_welfare_outflow` RPC is exposed. This account cannot confirm that the inaccessible live Site uses this exact Supabase project. The REST audit does **not** verify trigger installation/enabled state, the Welfare unique index, RLS, RPC permissions/body, or migration execution order.
- A further read-only REST integrity audit on 2026-10-02 found **0 duplicate linked Welfare expense groups among 0 linked expenses**, **0 orphan Welfare documents among 0 documents**, and **0 orphan Household documents among 0 documents**. `scripts/audit-supabase-integrity-readonly.mjs` can repeat it without printing records or secrets. The later SQL Editor audit confirmed the same aggregate integrity checks, but neither check proves transactional guard behavior.
- Contact & Support read-integrity follow-up (2026-10-02, local only): tenant/user-scoped tickets now load in stable 500-row pages, reject more than 20,000 rows with HTTP 413 instead of silently truncating the list/XLSX, clear stale client data on load failure, and distinguish missing schema from other Supabase errors. The row-limit modal is bilingual and classified as an error. No SQL migration is needed. Authenticated large-history/export testing and Site deployment remain open.
- Notices and Events read-integrity follow-up (2026-10-02, local only): Notices and all four Event collections now load in stable 500-row pages and explicitly reject a section above 20,000 rows instead of returning an incomplete list or XLSX source. Their APIs distinguish missing schema from other Supabase failures; their clients clear stale records/permissions on failed or setup-required reloads and show bilingual row-limit errors. Notice XLSX now shows a success/error result modal. No SQL migration is needed. Authenticated large-history, permission, and export tests plus deployment remain open.
- Family Directory and member-approval read-integrity follow-up (2026-10-02, local only): member profiles, relationship links, privacy-consent rows, profile-photo memories/files, pending join requests, and monthly approved-request counts now load in stable 500-row pages. This is especially important for consent visibility and pending approval queues previously vulnerable to Supabase's default page cutoff. Reads above 20,000 rows per group return 413 rather than a partial directory/approval list or XLSX. Directory and approval clients clear stale records and privileges after errors; Directory XLSX now shows a result modal. No SQL migration is needed. Authenticated large-family, privacy, approval, photo, and export tests plus deployment remain open.
- Privacy, Governance, and Magazine read-integrity follow-up (2026-10-02, local only): privacy requests and all Governance/Magazine collections now load in stable 500-row pages. A section above 20,000 rows returns 413 instead of silently truncating counts or XLSX source data. Only recognized missing-schema errors show the migration-required state; transient backend failures surface as errors. Failed/setup-required reloads clear prior records and privileges, with a retry state. Governance decisions linked to admin-only polls are omitted from ordinary member responses; `npm.cmd run test:governance-visibility` checks this policy. No SQL migration is needed. Authenticated large-history, permission, and export tests remain open.
- Admin Control read-integrity follow-up (2026-10-02, local only): memberships, member-profile summaries, and the audit history now load in stable 500-row pages instead of silently cutting off at the Supabase default or the old 500-audit-entry limit. Above 20,000 rows in any group, the API returns 413 rather than presenting an incomplete role list or “Full XLSX.” The full XLSX now includes all loaded audit rows regardless of the current on-screen search filter, shows success/error result modals, and failed reloads clear old data/role drafts before offering retry. Membership update errors now show feedback instead of becoming unhandled client rejections. No SQL migration is needed. Authenticated large-family/audit/export testing and deployment are still open.
- Admin audit privacy follow-up (2026-10-02, local only): the Admin API now excludes another person's explicitly private audit events, including personal-finance and private health activity, before returning data for the on-screen audit log or XLSX. Older finance events without a private marker are also excluded by action/entity type. An admin can still see their own private activity; family-wide SOS and administration events remain visible. The database retains all audit events. `npm.cmd run test:admin-audit` covers the visibility policy. No SQL migration is needed; authenticated two-user API/export checks remain open.
- Dashboard read-integrity follow-up (2026-10-02, local only): family/member/tree/approval/event/Qurbani/chat summary sources and selected campaign/event detail counts now page in stable 500-row batches. Unread-message totals use all accessible-channel message metadata within the 20,000-row safety cap instead of the prior latest-2,000-message slice; inaccessible channel messages no longer consume that allowance. Any section above the cap returns 413 rather than an inaccurate dashboard total/XLSX. Failed/setup-required reloads clear old dashboard/workspace data, and a failed dashboard shows a retry state instead of displaying zero as a real count. This still needs authenticated performance/large-history checks; a scalable aggregate unread-count query is needed for families above the cap. No SQL migration is needed.
- Family Chat read/export follow-up (2026-10-02, local only): channel-list unread badges now use exact server-side HEAD counts scoped to the authenticated member's accessible channels, excluding that member's own messages and using per-channel read timestamps; they no longer rely on the latest 1,000 family messages. A read-only probe against the configured Supabase Data API returned HTTP 206 with a numeric exact-count header. Chat roster/channel/receipt reads now page in stable 500-row batches and fail above 20,000 rows instead of showing a partial list. The selected-channel XLSX now fetches complete channel message, attachment, and reaction history within that safety cap rather than exporting only the visible latest 150 messages. Failed/setup-required reloads clear stale chat state; a failed read-state update no longer falsely sets the unread badge to zero. `npm.cmd run test:chat-unread` covers count-query scope and old cutoff regression. No SQL migration is needed. Authenticated mixed-channel, >1,000-message, export, and performance checks remain open, as does a scalable export above 20,000 rows.
- Family Chat live-feed follow-up (2026-10-02, local only): the stream now uses a validated `(created_at,id)` cursor, deterministic ordering, SSE event IDs for reconnect resume, and 200-message catch-up batches. The initial timestamp boundary overlaps safely. The client no longer restarts its EventSource for each new message, rejects late responses from a previous channel, merges snapshot and stream messages in stable order, and refreshes reaction/attachment state for the snapshot messages without dropping newer streamed messages. Read-receipt failures can retry. `npm.cmd run test:chat-cursor` covers cursor validation and query shape. No SQL migration is needed. Authenticated two-client burst, disconnect/reconnect, channel-switch, reaction-removal, and long-session tests remain open; SSE is not guaranteed instant delivery or end-to-end encrypted.
- Family Chat access-revocation follow-up (2026-10-02, local only): an open SSE stream now rechecks the user's current active family membership and channel permission before each polling batch and ends with an access-revoked event if permission is lost. The client closes that stream, clears the old chat immediately, and refreshes available channels. The snapshot poll handles 401/403/404/409 the same way, including non-JSON auth failures. No SQL migration is needed. Authenticated tests with concurrent membership removal, admin-role demotion, invite-only removal, and channel archival remain required; this does not replace server-side checks on every other chat endpoint.
- Chat admin-visibility security fix (2026-10-02, local only): an explicit channel-member row can no longer bypass the `admins` role requirement after demotion. The shared chat-access policy now governs direct-ID authorization, the channel list/unread badges, and dashboard unread totals. Invite-only channels still require an active explicit membership and family channels remain visible to active family members. `npm.cmd run test:chat-access` covers the stale-row regression. No SQL migration is needed; live role-change and direct-file access tests are pending.
- Member-approval direct-ID hardening (2026-10-02, local only): the approval/rejection endpoint now validates the request ID and decision, requires a rejection reason of 3–500 characters, and checks that the pending request belongs to the admin's currently active family before invoking the atomic database review RPC. Missing/cross-family IDs return 404 and already-reviewed requests return 409. The RPC still performs its own current reviewer-role and pending-state checks. No SQL migration is needed. Authenticated two-family direct-ID and simultaneous-review tests remain open.
- Personal Finance reporting follow-up (2026-10-02, local only): the full and per-section XLSX actions now show closeable success/error result feedback, including download-generation errors. Monthly budget usage no longer hides overspending by reporting every value above 100% as exactly 100%; the progress bar alone remains visually capped. The actual percentage flows through the summary/XLSX. No SQL migration is needed. Authenticated browser export, spreadsheet-open, and over-budget display checks remain open.
- Family Tree read-state follow-up (2026-10-02, local only): loading and failed/setup-required reloads no longer leave a previously authorized member tree or open member detail visible. The tree now recognizes the Directory's 20,000-row limit response, refuses a partial tree/XLSX, presents a localized closeable error result and a retry state, and resets relationship selectors if their members are no longer visible. No SQL migration is needed. Authenticated access-change, row-limit, retry, and export checks remain open.
- Action modal follow-up (2026-10-02, local only): concurrent API mutations now queue their confirmation dialogs instead of replacing an earlier unresolved confirmation; result/feedback dialogs also queue so each outcome can be closed individually. Changing locale no longer cancels an in-flight confirmation, and unmount resolves queued confirmations as cancelled. TypeScript, lint, feedback tests, and production build pass locally. Authenticated browser interaction testing and deployment remain open.
- The current Codex/ChatGPT account still cannot access the existing Sites project ID (`Sites project not found`). The original owning account must either deploy the update or add this account as an editor/collaborator; do not create a duplicate Site.
- Deployment is still blocked by missing access to the existing Sites project and release acceptance checks. The named database guards, permissions, and integrity checks passed the 2026-10-02 read-only SQL audit; do not rerun migrations based on older handoff text. Transactional guard tests, authenticated browser workflows, and a deploy/smoke-test are still outstanding.
- The last owner-side handoff reported production version 30 at `https://family-management-system.hitht.chatgpt.site`; this account cannot independently verify its current deployment.
- A local privacy-hardening batch now blocks admin-only/hidden profiles for regular directory viewers, masks contacts for unlinked profiles, fails closed when consent lookup fails, and prevents profile photos from bypassing directory visibility through the Archive API or direct file URL. No new SQL migration is needed for this batch.
- Notification Center now applies each member's saved in-app category preferences to the server response, while urgent/system alerts remain visible. Future scheduled items no longer crowd out current items; notification action links are restricted to safe same-site paths. No new SQL migration is needed for this follow-up.
- Dashboard follow-up: pending applicant names/counts are now returned only to that family's owner/admin; regular members do not see approval shortcuts. The dashboard's remaining visible BN/EN labels and its XLSX headings were localized, and dashboard approval rows now open the review page. Member-request and family-tree XLSX headings/sheet names follow the selected language. No new SQL migration is needed.
- Welfare Fund follow-up: approval/rejection/disbursement details now use an in-page dialog instead of browser prompts; the existing global confirmation/result modals still guard mutations. Welfare fallback messages and XLSX status/category values follow the selected language. The API rejects invalid status transitions and edit/delete attempts on reviewed or finalized welfare records. No new SQL migration is needed.
- Welfare integrity follow-up: only active funds accept new entries, a fund's opening balance is fixed after creation, and a disbursement retry can reconcile an already-linked paid expense. The unique index from `20260930_welfare_disbursement_guard.sql` is present and valid in the live SQL audit; concurrent behavior still needs integration testing.
- Household follow-up (2026-10-01): browser `window.prompt` flows for shopping purchase cost, utility-bill payment details, and maintenance status details have been replaced by bilingual in-app dialogs with input validation. The existing global confirmation/result modals still guard the subsequent API mutation. Result classification now recognizes common English success/failure messages, cancellation, and invalid values; `npm.cmd run test:feedback` covers those cases. No SQL migration is needed. TypeScript, lint, i18n audit, tenant-scope audit, and production build pass. These changes are local and not deployed.
- Welfare atomic-outflow follow-up (2026-10-01): paying an approved expense, disbursing an approved request, and refunding an approved contribution now use one Supabase RPC that locks the fund row, checks its latest balance, makes the ledger/status change, and writes the audit entry in one database transaction. A further review aligned the lock order across all three paths (fund before record) and rechecks the fund ID after locking the record to reduce deadlock risk. The named RPC and intended execute permissions are present in the live SQL audit. Its body and transactional behavior still need staging/concurrency tests before real cash use; no production mutation was run by this account.
- Qurbani export follow-up (2026-10-01, local only): a new all-years XLSX includes a per-campaign financial summary and complete raw campaign, participant, animal, ledger, vendor, schedule, task, and distribution sheets. The existing selected-year workbook remains. Qurbani reads now paginate in 500-row batches with stable ordering and fail instead of silently truncating above 20,000 rows per table. Export success and error states use the global result modal. The API now treats only missing-table/column errors as migration-required; other Supabase errors surface as request failures. No SQL migration is needed. Authenticated live export and large-data tests remain open.
- Qurbani finalization follow-up (2026-10-01, local only): settled and closed campaigns are read-only in the UI and protected by checks in the campaign, record, and status API routes. A settled campaign may only move to closed; closed cannot be reopened through these routes. Only an empty planning campaign may be deleted, and new campaigns cannot begin finalized. Pure policy tests (`npm.cmd run test:qurbani`) cover the rules. The named finalization functions and enabled triggers are present in the live SQL audit. `supabase/qurbani_finalization_guard_test.sql` is a rollback-only staging test not yet run; live concurrency behavior remains unverified. Ordinary family hard deletion will be blocked while it has Qurbani records; a separate authorized purge workflow would be required.
- Personal Finance read-integrity follow-up (2026-10-01, local only): all six private record collections now load in 500-row pages with stable ID tie-breakers, retain both family/user filters, and reject data above 20,000 rows per collection instead of silently exporting partial data. Only recognized missing-table/column errors show the migration-required state; other backend errors surface as failures. Failed/setup-required reloads clear old finance data in the client. `npm.cmd run test:pagination` covers pagination boundaries. This is not a live authenticated or large-dataset test; a scalable paged export is still needed above the safety cap.
- Notification read-integrity follow-up (2026-10-01, local only): the Notification Center API now pages family alert history and the current user's read/archive states in 500-row batches with stable ordering. It returns an explicit 413 above 20,000 rows rather than showing or exporting partial history; the UI clears stale results and shows a localized result modal. Existing family/user and recipient/visibility checks remain. This needs authenticated and large-history smoke tests after deployment; a scalable paged export remains a future need above the cap.
- Welfare read/privacy follow-up (2026-10-01, local only): six Welfare collections now use stable 500-row pagination and fail explicitly above 20,000 records per collection; backend errors are no longer all mislabeled as missing migrations. A regular member no longer receives approved contributions, paid expenses, or family-visible requests linked to an admin-only fund unless the record is their own where appropriate. Welfare documents now require parent-record visibility in both the list and direct download route, closing a family-visible document bypass for hidden funds/private requests. Failed reloads clear stale client data. `npm.cmd run test:welfare-visibility` covers core policy cases. No new SQL migration; authenticated direct-ID and large-data tests remain open.
- Welfare document retention follow-up (2026-10-01, local only): normal hard deletion is now limited to documents linked to active/paused funds, pending contributions/expenses, or submitted requests. The API checks status, the UI hides unavailable delete actions, and draft parent records cannot be deleted while documents remain. The document database row is removed before R2 deletion so a database rejection cannot leave a broken downloadable record; if R2 cleanup fails, the API reports pending cleanup and records the key in the private audit log. `test:welfare-documents` covers the policy. The prepared, unapplied `20261001_welfare_document_retention_guard.sql` uses triggers to enforce parent links, finalized-document retention, and attached-document parent deletion against concurrent writes; its rollback-only staging test has not run. Existing orphan documents and a formal authorized purge/cleanup process still need review.
- Health/SOS read and medical-file follow-up (2026-10-02, local only): private health records, the emergency directory, and SOS alerts/responses now use stable 500-row pagination and reject a section above 20,000 rows instead of silently returning partial history. Only recognized missing-schema errors are reported as migration-required; other backend failures surface as errors, and the client clears stale health data on failed/setup-required reloads. Medical document deletion now confirms the scoped database row was deleted before removing the private R2 object; storage failures report cleanup pending and record the storage key in the private audit log for reconciliation. No new SQL migration. Authenticated large-history, direct-file, and storage-failure tests remain pending. The existing Site again returned `Sites project not found` on 2026-10-02, so none of this is deployed.
- Archive/Vault follow-up (2026-10-02, local only): all seven archive record groups now load with stable 500-row pagination and reject a group above 20,000 rows instead of silently truncating its XLSX export. Only missing-schema errors show the migration-required state; failed/setup-required reloads clear stale archive data. Archive file deletion now checks the scoped parent and attached-file count, refuses profile photos and multi-file parents, removes database records before R2 bytes, and reports/audits storage cleanup pending if R2 fails. This is still a best-effort multi-step operation, not an atomic database/storage transaction; authenticated concurrent-delete, orphan-reconciliation, and storage-failure tests remain open. No new SQL migration. Lint, TypeScript, tenant security audit, i18n audit, pagination tests, diff check, and production build passed locally. The existing Site remains inaccessible to this account and this batch is not deployed.
- Archive private-mutation follow-up (2026-10-02, local only): a manager can no longer use a direct ID to edit, change status, or delete another member's private archive collection/memory; private vault-file deletion now checks the file, parent record, and memory collection visibility before removing database rows or storage bytes. New archive audit entries record visibility, and the Admin response/XLSX excludes other members' marked-private archive entries. Family/admin-visible records retain the existing manager workflow. `npm.cmd run test:archive-access` and `npm.cmd run test:admin-audit` check the policies. No SQL migration is needed. Authenticated two-user direct-ID/audit/export and storage-failure tests plus deployment remain open; older archive audit entries without a visibility marker cannot be classified by this rule.
- Shared Household follow-up (2026-10-02, local only): eight record groups now use stable 500-row pagination and reject a group above 20,000 rows rather than returning an incomplete XLSX source; unexpected backend failures are no longer mislabeled as missing migrations. Failed/setup-required reloads clear stale client data. Household receipts require the scoped parent shopping list, bill, or maintenance request on direct download; orphaned receipt metadata is hidden from the list. Normal parent deletion is blocked while documents remain. Document deletion removes the scoped database row before R2 bytes; failed storage cleanup returns 202 and records a private audit cleanup key. No new SQL migration. App-level parent/document checks are not an atomic concurrent-delete guard, and authenticated direct-ID, large-history, R2-failure, and concurrency tests remain open. Lint, TypeScript, tenant security audit, i18n audit, pagination tests, diff check, and production build passed locally; not deployed.
- The next account must run `git status --short` and `git log -1 --oneline` first; preserve any uncommitted work. The Household/dialog, Welfare atomic-outflow, multi-family onboarding, admin-only profile-creation, and Qurbani export/pagination/finalization changes are currently uncommitted.

### Exact local checkout snapshot on 2026-10-01

- Branch: `main`; HEAD: `3cceaa8 Guard welfare opening balances and duplicate disbursements`.
- Modified: `PROJECT_HANDOFF.md`, `app/api/finance/route.ts`, `app/api/members/route.ts`, `app/api/notifications/route.ts`, `app/api/qurbani/campaigns/route.ts`, `app/api/qurbani/records/route.ts`, `app/api/qurbani/route.ts`, `app/api/qurbani/status/route.ts`, `app/api/setup/family/route.ts`, `app/api/welfare-document/[id]/route.ts`, `app/api/welfare/records/route.ts`, `app/api/welfare/route.ts`, `app/household-center.tsx`, `app/member-directory.tsx`, `app/notification-center.tsx`, `app/personal-finance-center.tsx`, `app/qurbani-suite.tsx`, `app/setup/family-setup.tsx`, `app/welfare-center.tsx`, `components/action-modal-provider.tsx`, `lib/welfare-types.ts`, `package.json`, and `supabase/schema.sql`.
- Untracked: `lib/action-feedback.ts`, `lib/paginated-rows.ts`, `lib/qurbani-access.ts`, `lib/qurbani-policy.ts`, `lib/welfare-document-policy.ts`, `lib/welfare-visibility.ts`, `scripts/test-action-feedback.mjs`, `scripts/test-paginated-rows.mjs`, `scripts/test-qurbani-policy.mjs`, `scripts/test-welfare-document-policy.mjs`, `scripts/test-welfare-visibility.mjs`, `supabase/migrations/20261001_qurbani_finalization_guard.sql`, `supabase/migrations/20261001_welfare_atomic_outflows.sql`, `supabase/migrations/20261001_welfare_document_retention_guard.sql`, `supabase/qurbani_finalization_guard_test.sql`, `supabase/welfare_atomic_outflows_test.sql`, and `supabase/welfare_document_retention_guard_test.sql`.
- These files are **not committed or deployed** at this snapshot. They contain intentional ongoing work; do not discard or overwrite them. Recheck status because it may change after this handoff.
- The SQL for the atomic Welfare RPC has not been parsed or exercised against a PostgreSQL instance by this account. Static checks and the app build do not prove that the SQL migration succeeds or that real concurrent payments are safe.
- On the subsequent continuation, the migration and `supabase/schema.sql` function bodies were checked to match. `supabase/welfare_atomic_outflows_test.sql` now provides a rollback-only synthetic test for authorization, payment, disbursement, refund, insufficient balance, retry, and audit; it has **not yet been executed** because no local PostgreSQL instance or verified production SQL access is available. A read-only `get_site` call still returned `Sites project not found`, so this account still cannot deploy the existing Site.
- After that SQL review, `test:feedback` (3), `test:privacy` (4), `test:notifications` (3), `security:audit`, `i18n:audit`, ESLint, TypeScript, and the production build passed locally. The sandboxed build initially hit Windows `spawn EPERM`; the permitted unsandboxed rerun completed successfully. These checks do not validate the unrun SQL test or live deployment.
- Multi-tenant onboarding follow-up (local only): family creation no longer stops when some other family already exists. A new account without an active membership may create its own family with a unique slug and join code, or request to join an existing family. The form no longer pre-fills another family's name. The first family is suggested as a creation flow; later visitors are suggested the join flow but can choose either. A previously inactive owner membership cannot be silently restored via setup. Directory profile creation is now restricted to that family's owner/family_admin; managers retain existing profile/relationship editing rights. These changes require no new SQL migration, but still need authenticated live tests. The later multi-family workflow above adds joining and switching for accounts with an active family.
- After the Qurbani export follow-up, `npm.cmd run lint`, `npm.cmd run security:audit`, `npm.cmd run i18n:audit`, `npm.cmd run test:privacy`, `npm.cmd run test:notifications`, `npm.cmd run test:feedback`, `npx.cmd tsc --noEmit --incremental false`, `git diff --check`, and `npm.cmd run build` passed locally. The sandboxed build hit Windows `spawn EPERM`; the approved unsandboxed rerun passed. No authenticated Qurbani export was tested against live Supabase, and this account still cannot deploy the Site.
- After the Qurbani finalization follow-up, `npm.cmd run test:qurbani` (3 policy tests), TypeScript, full lint, tenant-scope audit, i18n audit, and the production build passed locally. The sandboxed build hit Windows `spawn EPERM`; the approved unsandboxed rerun passed. The existing Site again returned `Sites project not found` for this account. These checks do not prove live API behavior or a database-level concurrency guarantee.
- The database-guard follow-up kept `supabase/schema.sql` and the new Qurbani migration function/trigger bodies in sync. TypeScript, lint, tenant-scope audit, `test:qurbani`, `git diff --check`, and the production build passed locally. There is no local PostgreSQL executable, so the rollback-only Qurbani SQL test has not run. Validate it in staging before applying the migration to production, and then test two concurrent sessions; a local build does not validate PL/pgSQL.
- The Personal Finance pagination follow-up passed `test:pagination` (4 tests), TypeScript, lint, tenant-scope audit, i18n audit, diff check, and the production build locally. The sandboxed build hit Windows `spawn EPERM`; the approved unsandboxed rerun passed. It introduced no new SQL migration. Authenticated finance and large-dataset smoke tests remain pending.
- The Notification pagination follow-up passed `test:pagination` (4), `test:notifications` (3), TypeScript, lint, tenant-scope audit, i18n audit, and the production build locally. It introduced no new SQL migration. Authenticated read/archive-state and large-history tests remain pending.
- The Welfare read/privacy follow-up passed `test:welfare-visibility` (4), `test:pagination` (4), TypeScript, lint, tenant-scope audit, i18n audit, and the production build locally. It introduced no new SQL migration. Authenticated direct-document, hidden-fund, and large-data tests remain pending.
- The Welfare document retention follow-up passed `test:welfare-documents` (3), TypeScript, lint, tenant-scope audit, i18n audit, and the production build locally. The migration and `supabase/schema.sql` function/trigger bodies were checked to match. The rollback-only SQL test and two-session concurrency test have not run because there is no verified PostgreSQL staging access on this account; do not treat the retention guard as live yet.

## Copy-paste prompt for the next Codex account

```text
Continue the Family Management System project from:
C:\Personal project\family-management-system

First read C:\Personal project\family-management-system\PROJECT_HANDOFF.md completely. Then run git status --short and git log -1 --oneline, and inspect package.json, .env.example, .openai/hosting.json, supabase/schema.sql, and all migrations. Do not expose, print, copy, or commit .env.local or any Supabase secret. Preserve existing work and keep the deployed site owner-private/custom unless I explicitly ask to change sharing.

The handoff last reported the live site as version 30 at https://family-management-system.hitht.chatgpt.site; this account cannot independently verify the current live version. At the handoff snapshot, HEAD is 3cceaa8 and the working tree is dirty; preserve all uncommitted Household/dialog, Welfare atomic-outflow, multi-family onboarding, admin-only profile-creation, and Qurbani all-years export/pagination/finalization work. The latest local code contains Magazine, relationship mapper, expanded bilingual coverage, Contact & Support, Notification & Reminder Center, Privacy & Data Rights Center, Household dialogs, Welfare integrity/atomic-outflow guards, independent new-family creation, the profile-addition role gate, and Qurbani all-years XLSX with application-level finalization guards and a prepared database guard. The Magazine and locale migrations were previously verified as applied. A 2026-10-02 read-only REST/OpenAPI audit confirmed all 75 expected tables and 939 expected columns in the real Supabase project. Do not rerun migrations blindly: first run supabase/verify_existing_project_readonly.sql in that project's SQL Editor to check remaining database guards, index, RPC grants, and RLS. Review and apply only a confirmed-missing correction in migration order after staging/backup review. Validate the new Qurbani and Welfare migrations in staging with their rollback-only tests: supabase/qurbani_finalization_guard_test.sql, supabase/welfare_atomic_outflows_test.sql, and supabase/welfare_document_retention_guard_test.sql. None of those tests or concurrency checks have run on PostgreSQL in this account. Test Welfare balance, rollback, and duplicate disbursement before real cash use. Run npm.cmd run test:feedback, npm.cmd run test:privacy, npm.cmd run test:notifications, npm.cmd run test:qurbani, npm.cmd run test:welfare-documents, npm.cmd run i18n:audit, npm.cmd run lint, npm.cmd run security:audit, npx.cmd tsc --noEmit --incremental false, and npm.cmd run build. Once database guards, tests, and hosting access are confirmed, deploy to the existing Sites project appgprj_6ab4e57009088191814056c14e820221 while preserving owner-private/custom access. Then smoke-test /setup with two independent families and a pending join request, /directory with manager and admin accounts, /contact, /notifications, /privacy, /welfare, /qurbani including the all-years export and finalization/empty-draft rules, and all other critical routes, language persistence, XLSX exports, and confirmation/result modals. Do not report complete until live checks pass.

Newer local work also prepares `supabase/migrations/20261002_member_reapproval_guard.sql` and `supabase/member_reapproval_guard_test.sql`; the migration is not applied and the rollback-only test has not run. Review the installed membership-review function, run that test and two-session concurrency checks in staging, then apply only the reviewed migration before relying on the new approval flow or deploying it.

Do not assume that a local build proves database enforcement or that running a migration file once proves all its objects are installed correctly.

Continue the remaining roadmap one module at a time. Every mutating action must show a confirmation modal first and a success/error/info modal afterward, with a close X/button. Every major management section must support XLSX export. Every API and database operation must preserve family_id tenant isolation. New membership must remain pending until that family's owner/family_admin approves it. Personal-finance data must remain private to its user. Keep audit logging and safe-delete/finalized-record restrictions.
```

## 1. Project identity and current state

- Product name: **Family Management System**
- Initial family/brand: **Sheikh Monsuf Family (শেখ মনছুফ পরিবার)**
- Local folder: `C:\Personal project\family-management-system`
- Git branch: `main`
- Live URL: `https://family-management-system.hitht.chatgpt.site`
- Sites project ID: `appgprj_6ab4e57009088191814056c14e820221`
- Hosting config: `.openai/hosting.json`
- Last owner-side reported live release: **version 30** (not independently verified by this account)
- Reported commit used for version 30: `908fcdf6019401b195e102bfede2b379588e4798`
- Live audience: owner-private/custom. Do not make it public without explicit approval.
- Source requirements document: `C:\Users\S M Zubayer\Downloads\Sheikh_Monsuf_Family_System_Specification_BN.docx`

### Local work completed and committed after live version 30

The following work is implemented, verified, and committed locally, but is intentionally not deployed yet. Use `git log -1 --oneline` to obtain the authoritative current checkpoint hash.

1. **Digital Family Magazine**
   - Create/edit articles and move them through draft, review, published, featured, archived, and deleted states.
   - Markdown-style editor toolbar with safe rendering.
   - Private R2 cover/media upload, replacement, access, and cleanup.
   - Likes/reactions, comments, comment moderation, search/filter, and XLSX export.
   - Tenant scoping, role checks, and audit events.
2. **Family-tree relationship mapper improvement**
   - Automatically uses the signed-in member as the relationship starting point when possible.
   - Computes and displays relationships such as father, mother, son, daughter, sibling, grandparent, grandchild, uncle/aunt, cousin, spouse, and in-law.
   - Relationship details are shown on cards and in the member detail modal.
3. **Expanded bilingual operational modules**
   - Events: planning, create/edit, filters, RSVP, discussion, gallery, management actions, action results/errors, date/currency formatting, empty/access states, and XLSX sheet/column headings use the selected locale.
   - Qurbani: yearly campaign setup, status workflow, participants/shares, animals, ledger, vendors, schedule, volunteer tasks, distribution, record forms/actions, table-body value mappings, fallback feedback, and XLSX workbooks use the selected locale.
   - Personal Finance: private dashboard, accounts, transactions, budgets, debts, bills, goals, forms/actions, status/value labels, secondary cards/tables, progress controls, feedback, date/currency formatting, and localized XLSX workbooks use the selected locale. Stored user-entered categories and API-returned messages can still appear in their original language.
   - Family Chat: channel navigation/creation, group/direct conversation states, live status, notifications, message composer, privacy copy, feedback, date/time formatting, and XLSX workbooks use the selected locale.
   - Health/SOS: dashboard, reminders, metrics, profile/care/measurement views, medical document upload, medicine/appointment/measurement forms, SOS creation/response flows, emergency directory/cards, table fallbacks/action errors, document-category display, date/time/status display, feedback, and XLSX workbooks now follow the selected locale. Some API-returned messages and stored free-text values can still appear in their original language.
   - Welfare Fund: locale-aware currency/date formatting, header, metrics, navigation, contribution/expense/assistance/pledge workflows, create/edit and upload dialogs, fund/request cards, tables, empty/access states, status/actions, and XLSX sheet/column headings now follow the selected language. Some API-returned messages and stored free-text values can still appear in their original language.
   - Shared Household: main header/filter/KPIs/tabs, create/edit and document-upload dialogs, record forms, placeholders and select options, section headings, empty/access states, status/actions, shopping/task/maintenance card labels, utility table body values, service/document type labels, inline workflow prompts, currency/date formatters, fallback success/error feedback, and every XLSX sheet/column/system-owned value now follow the selected locale. User-entered free text and API-returned custom messages can still appear in their original language.
   - Admin Control Center: access/loading states, main header, KPI cards, role/audit navigation, member/audit filters, table headings, role/status options, row actions/feedback, timestamps, and XLSX sheet/column headings now follow the selected locale. Stored audit action/entity values and API-returned messages can still appear in their original language.
   - Family Archives: header/actions, metrics, collection/privacy cards, navigation tabs, memory/story/vault/asset/capsule workflows, table/card body labels, inline buttons, empty/access states, status and visibility badges, locale-aware date/currency/expiry display, forms/dialogs, feedback, and XLSX sheet/column headings now follow the selected locale. Stored free-text values and API-returned messages can still appear in their original language.
   - Member Directory: the member list, profile-photo flow, create/edit profile form, profile statuses, relationship cards/dialogs/actions, errors, locale-aware member names, and XLSX sheet/column headings now follow the selected locale. Stored free-text relationship values and API-returned messages can still appear in their original language.
   - Dashboard, member approvals, and family tree: the dashboard card labels/statuses, relative times, access state, and export headings are bilingual; pending applicant details are admin-only. Member-request and tree exports use localized headings. Stored user-entered names/relationship text remain in their original language.
   - Welfare Fund: request review amount, reason, payment method, and transaction reference use an in-page dialog rather than native browser prompts. Secondary fallback messages and status/category values in XLSX are localized. Server-side status and edit/delete guards protect reviewed and finalized ledger entries from direct API calls. Server-returned validation text may still be mixed-language.
   - Notice Center: list/ticker states, badges, filters, CRUD and status actions, create/edit dialog, schedule/priority/pinning controls, feedback, and XLSX sheet/column headings now follow the selected locale. Stored notice content and API-returned messages can still appear in their original language.
   - Family Governance: primary header/actions, metrics, navigation tabs, poll/decision forms and dialogs, section headings, rules, empty/access states, poll/proposal/history/decision card labels and actions, locale-aware dates, status badges, feedback, and XLSX sheet/column headings now follow the selected locale. Stored categories/decision types and API-returned messages can still appear in their original language.
4. **Contact & Support**
   - Family members can submit family-admin, technical, privacy, event, Qurbani, finance, health, or general support requests and track status/response.
   - Owners and Family Admins can view the family queue, assign, prioritize, respond, and move tickets through open, in-progress, waiting, resolved, and closed states.
   - The module includes search/filter, bilingual UI, localized XLSX export, tenant/user scoping, global confirmation/result modals, and audit events.
5. **Notification & Reminder Center**
   - Family managers can publish bilingual notifications immediately or for a future time, with category, severity, safe internal action link, and optional expiry.
   - Members have private read/unread and archive state, search/filter views, localized XLSX export, and per-user in-app category/digest/quiet-hours preferences.
   - The API enforces active membership, `family_id` scoping, optional recipient isolation, role checks, safe internal links, audit logging, and global confirmation/result modals.
   - Email, SMS, Web Push/FCM delivery and scheduled source-data reminder jobs are not yet connected; the persisted preference foundation is ready for those providers.
   - The server now enforces saved in-app category preferences, scheduled/expiry windows, and recipient scope. Urgent/system alerts bypass ordinary category muting; action links are validated for same-site navigation. `npm.cmd run test:notifications` covers these rules.
6. **Privacy & Data Rights Center**
   - Members control directory visibility, family email/phone visibility, emergency access, and anonymous family analytics consent.
   - Members can submit tracked access/export, correction, deletion, and processing-restriction requests; duplicate active requests of the same type are blocked.
   - Family Admins can publish bilingual privacy notices, configure retention defaults, pause new requests, assign/review requests, and use guarded status transitions.
   - Directory/member API responses enforce hidden/admin-only visibility and contact-field consent for non-admin viewers. The module includes localized XLSX export, audit logging, tenant/user scoping, and global confirmation/result modals.
   - A follow-up hardening pass closes consent-query failure and profile-photo archive/direct-link bypasses; `scripts/test-member-privacy.mjs` covers visibility decisions. Explicit emergency-access opt-out is now enforced in the Health emergency directory locally, but broader downstream emergency workflows still need review; analytics consent remains a stored preference, with no analytics pipeline yet.

The user confirmed and an API check verified that `supabase/migrations/20260928_family_magazine.sql` is applied. The 2026-10-02 REST table/column checks and SQL metadata audit found the later Contact, Notification, Privacy, and Welfare database structures present. Their real workflows still need authenticated tests.

### Last local verification result

All of these passed after the privacy-hardening follow-up:

```powershell
npm.cmd run i18n:audit
npm.cmd run lint
npm.cmd run security:audit
npm.cmd run test:privacy
npx.cmd tsc --noEmit --incremental false
npm.cmd run build
```

The security audit confirmed membership-gated mutations, family-scoped direct-ID changes, and no Supabase secret in client/public source.

After the 2026-10-01 Household and Welfare edits, the following also passed locally: `npm.cmd run test:feedback` (3 tests), `npm.cmd run test:privacy` (4 tests), `npm.cmd run test:notifications` (3 tests), `npx.cmd tsc --noEmit --incremental false`, `npm.cmd run i18n:audit`, `npm.cmd run lint`, `npm.cmd run security:audit`, and `npm.cmd run build`. These are not live integration tests and do not validate pending SQL execution.

## 2. Product requirements that must not regress

These are hard product rules:

1. The platform is multi-tenant: one family's data must never be visible or mutable by another family.
2. Every tenant-owned record must be scoped by `family_id` at the API and database-query level.
3. A new member request stays pending until that particular family's `owner` or `family_admin` approves or rejects it.
4. Qurbani is a large, per-family, year-based A-to-Z management suite, not a small expense table.
5. Every major operational section must offer a usable XLSX export of its records.
6. Every create/update/delete/status-changing action must ask for confirmation in a modal before sending the mutation.
7. Every success, failure, validation problem, or important information result must appear in a proper modal with a close X and/or close button.
8. Personal finance belongs only to the signed-in user; other family members and family admins must not see it.
9. Sensitive uploaded files must remain private and be served only after authorization checks.
10. Important mutations must produce audit-log entries.
11. Finalized, paid, adopted, closed, or otherwise legally/financially important records must have safe-delete/status-transition restrictions.
12. The UI must support Bangla and English, dark/light mode, responsive mobile layout, PWA behavior, and four selectable color palettes.
13. Accessibility and elderly-friendly usability matter: clear contrast, large targets, readable labels, and understandable confirmations.

### Requirement inventory and delivery boundary

The original Bangla specification and subsequent user requests describe the **target product**, not a statement that every feature is live. In addition to the rules above, the target includes:

| Area | Required behavior | Current boundary |
|---|---|---|
| Family identity | Multi-generation tree from Sheikh Monsuf and spouse, spouse/in-law links, photos, education, profession, blood group, addresses, relationship lookup, family-specific joining/approval | Directory/tree and an initial relationship mapper exist; richer family facts and complex/ambiguous kinship still need review |
| Communication | Notice ticker/detail, magazine/posts/media, event/tour discussion and album, group/subgroup/direct chat with media, voice, replies, reactions, read/unread | Core modules exist locally or were reported live; chat uses SSE/refresh, not guaranteed sub-second WebSocket delivery or end-to-end encryption |
| Qurbani | Annual A-to-Z campaign, shares/payment, animals/vendors/cost, tasks/schedule, meat distribution, audit, and complete downloadable workbooks | Broad local module exists; real-user workflow, totals, export accuracy, finalized-state rules, and PDF/receipt additions need live acceptance tests |
| Finance | Owner-only income/expense, categories, budgets, debt/lending, goals, analytics, and XLSX/PDF | Server-side user isolation and XLSX exist; client-side encryption and PDF statements are outstanding |
| Care and home | Blood/emergency directory, health records, medicine/appointment reminders, SOS/escalation, shared groceries, utility bills, maintenance/services | In-app records and workflows exist; reliable external SMS/Push SOS and scheduled reminders are outstanding |
| Heritage and decisions | Private archive/document vault, memories, property/asset records, time capsules, polls, proposals, votes, welfare ledger | Operational foundations exist; legal/medical document encryption, retention automation, and broader acceptance tests remain |
| Experience | Bangla/English, persisted language, dark/light, four admin-selectable color palettes, responsive/PWA, accessible dialogs, XLSX in every major management section | Broad coverage exists locally; secondary translations, true offline sync, mobile/a11y verification, and export/live tests remain |
| SaaS | Separate families, their own admins/privacy, future free/premium plans, custom branding/domain and billing | Tenant-scoped foundation exists; subscriptions, billing, custom domain automation, super-admin and plan enforcement are not complete |

Nice-to-have ideas mentioned in discussion (family map, career network, achievements, quizzes, recipes, wishlist, remittance and weather) are roadmap items, not hidden claims of completion. Avoid using the earlier conversational phrase "100% complete" as an acceptance criterion.

## 3. Architecture actually used

The original specification mentioned several possible stacks. The implemented stack is:

- Frontend/full-stack framework: Next.js 16.3.4-compatible app using Vinext/Vite and React 19 with TypeScript.
- Styling/UI: Tailwind CSS 4, reusable UI components, Lucide icons, responsive dashboard shell.
- Authentication: hosting-provided ChatGPT/Sites identity, read server-side through `app/chatgpt-auth.ts`.
- Database: Supabase Postgres accessed from server code through the Supabase REST Data API.
- Database client: `lib/supabase-rest.ts`; no secret is sent to browser code.
- File storage: private Sites R2 bucket binding named `BUCKET`.
- Real-time chat transport: streaming/SSE-style endpoint plus refresh logic; this is not end-to-end encrypted Socket.io chat.
- Spreadsheet export: SheetJS/XLSX in each operational module.
- Hosting: OpenAI Sites/Cloudflare-compatible deployment controlled by `.openai/hosting.json`.
- PWA: manifest and registration are already present.

The user initially asked whether PostgreSQL could be used free for some time. Supabase's free tier may support development and light early use, but limits/pricing can change. The next account should verify current official quotas and backup/pausing terms before promising ongoing free production operation; infrastructure, media, SMS, and email may have separate costs.

### Request/data flow

```text
Browser UI
  -> same-origin Next/Vinext API route
  -> authenticated Sites/ChatGPT user ID
  -> active family membership and role check
  -> family_id/user-scoped Supabase REST query
  -> optional private R2 file operation
  -> audit log where relevant
  -> JSON response
  -> global result modal in the UI
```

Never call Supabase with the secret from a client component. Never place `SUPABASE_SECRET_KEY` in public code, HTML, client bundles, logs, screenshots, commits, or chat.

## 4. Environment and local setup

Requirements:

- Windows PowerShell is supported.
- Node.js `>=22.13.0`.
- Run commands from `C:\Personal project\family-management-system`.
- `.env.local` must exist locally and must not be committed.

`.env.local` format:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SECRET_KEY=sb_secret_YOUR_REAL_SECRET
```

Do not copy real values into this handoff. `.env.example` contains placeholders.

Common commands:

```powershell
npm.cmd install
npm.cmd run dev
npm.cmd run lint
npm.cmd run security:audit
npm.cmd run build
npm.cmd run start
```

For local development, use the URL printed by the dev command. If package installation needs network access, request permission normally; do not replace or downgrade dependencies without a reason.

## 5. Roles and permissions

Canonical roles are in `lib/family-access.ts`:

| Role | Main permissions |
|---|---|
| `owner` | Full family administration, member approval, role management, all manager operations |
| `family_admin` | Approve/reject member requests and manage family operational modules; cannot take ownership-only actions |
| `manager` | Manage profiles and operational content/modules, but cannot approve membership or manage owner-only access |
| `member` | View permitted family data, create allowed self-service records, participate in chat/events/polls, and manage own private finance/health data |

Permission helper functions must be used rather than duplicating role logic ad hoc. Membership must be active before tenant data is returned.

## 6. Routes and implementation status

### Historically reported live in version 30 (reverify current deployment)

| Module | Page | Key capabilities | XLSX |
|---|---|---|---|
| Dashboard | `/` | Overview, metrics, notices, quick navigation, theme/language controls | Where relevant |
| Family setup | `/setup` | Create/setup a family and initial ownership | N/A |
| Member approval | `/members` | Pending join requests, approve/reject, role management | Yes where applicable |
| Directory | `/directory` | Member CRUD, photos, search/filter, profiles | Yes |
| Family tree | `/family-tree` | Visual tree, zoom/pan, member path/details | Yes |
| Notices | `/notices` | CRUD, priorities/status/expiry, home ticker | Yes |
| Events and tours | `/events` | CRUD, RSVP, comments, media, budget and itinerary data | Yes |
| Qurbani | `/qurbani` | Full annual campaign and operational suite | Yes |
| Personal finance | `/finance` | Accounts, income/expense, budgets, debts, bills, goals | Yes |
| Family chat | `/chat` | General/custom/direct channels, replies, reactions, voice/media, unread state, stream updates | Yes |
| Health and SOS | `/health` | Health profile, medicines, appointments, measurements, documents, SOS/location/response | Yes |
| Welfare fund | `/welfare` | Funds, pledges, contributions, aid requests, expenses, documents | Yes |
| Household | `/household` | Shared shopping, bills, tasks, maintenance, services, documents | Yes |
| Archive/vault | `/archives` | Collections, memories, stories, private documents, assets, time capsules, files | Yes |
| Governance | `/governance` | Polls, options, votes, comments, proposals/formal decisions | Yes |
| Administration | `/admin` | Family administration, governance/role/audit views and export | Yes |

### Implemented locally but not yet live

| Module | Page | Status |
|---|---|---|
| Digital Family Magazine | `/magazine` | Code and database migration complete; lint/audit/build passed; deployment pending |
| Relationship-to-me labels | `/family-tree` | Code complete and verified locally; deployment pending |
| Bilingual foundation | Global shell and core flows | Shared locale context, persisted member preference, bilingual theme/global action dialogs, and broad module coverage are complete locally; the locale migration was verified applied, but the newer UI is not deployed |
| Contact & Support | `/contact` | Code complete; `20260930_family_contact_support.sql` and deployment pending |
| Notification & Reminder Center | `/notifications` | Code complete; `20260930_family_notifications.sql` and deployment pending |
| Privacy & Data Rights Center | `/privacy` | Code complete; `20260930_family_privacy_center.sql` and deployment pending |
| Multi-family onboarding, switching, and admin-only profile addition | `/setup`, `/directory`, `/api/workspace/select` | An account may create additional families it owns or request membership in another existing family, subject to that family's admin approval; active-membership-validated switching and per-family profile-add gate are implemented locally. Deployment and authenticated multi-family tests remain pending. |

### Shared interaction behavior

`components/action-modal-provider.tsx` intercepts same-origin `POST`, `PUT`, `PATCH`, and `DELETE` API mutations. It shows a confirmation modal before the request and a success/error/info modal afterward. It intentionally excludes non-destructive chat read-state updates. Any new module must work with this provider or implement equivalent explicit modal behavior without duplicate confirmations.

## 7. Major API areas

- Workspace/dashboard: `app/api/workspace`, `app/api/dashboard`
- Family setup: `app/api/setup/family`
- Members and approval: `app/api/members`, `app/api/member-requests`
- Notices: `app/api/notices`
- Events: `app/api/events` plus comments, RSVP, and media subroutes
- Qurbani: `app/api/qurbani`, `campaigns`, `records`, `status`
- Finance: `app/api/finance`, `records`, `status`
- Chat: `app/api/chat`, `stream`, `upload`, plus protected file route
- Health: `app/api/health`, `records`, `upload`, plus protected document route
- Welfare: `app/api/welfare`, `records`, `upload`, plus protected document route
- Household: `app/api/household`, `records`, `upload`, plus protected document route
- Archives: `app/api/archives`, `records`, `upload`, plus protected archive-file route
- Governance: `app/api/governance`, `records`
- Admin/audit: `app/api/admin`
- Magazine: `app/api/magazine`, `records`, `upload`, plus protected magazine-media route
- Contact & Support: `app/api/contact`
- Notifications: `app/api/notifications`
- Privacy & data rights: `app/api/privacy`

When adding or editing any route:

1. Authenticate the current user.
2. Resolve the user's active membership.
3. Check the required role/ownership.
4. Include `family_id=eq.<active-family-id>` in every tenant query, including direct-ID updates/deletes.
5. For private records, also include the authenticated user ID.
6. Validate input and allowed status transitions.
7. Audit important changes.
8. Return safe error messages; never return secrets or internal credentials.

## 8. Database and migration procedure

### Fresh Supabase project

Run the complete `supabase/schema.sql` once in the Supabase SQL Editor. It includes the current schema, indexes, and module tables.

### Existing Supabase project already used by the live site

Run only migrations that are actually missing, in filename order, after backup/staging review. The 2026-10-02 REST/OpenAPI audit confirmed that all 75 schema tables and 939 expected columns are present, including the later Contact, Notification, and Privacy tables; it did not prove the database guards below. Treat these as **verification targets, not a rerun list**:

```text
supabase/migrations/20260930_family_contact_support.sql
supabase/migrations/20260930_family_notifications.sql
supabase/migrations/20260930_family_privacy_center.sql
supabase/migrations/20260930_welfare_disbursement_guard.sql
supabase/migrations/20261001_qurbani_finalization_guard.sql
supabase/migrations/20261001_welfare_atomic_outflows.sql
supabase/migrations/20261001_welfare_document_retention_guard.sql
```

The later `supabase/migrations/20261002_member_reapproval_guard.sql` was reviewed against the installed production function, passed its rollback-only staging test, and was applied to the existing production project on 2026-10-03. The post-application read-only audit returned 34/34 OK. Two-session concurrent approval/revocation and authenticated application tests remain open; do not rerun the migration.

Do not rerun destructive SQL. First run `supabase/verify_existing_project_readonly.sql` in the existing project's SQL Editor and share only its result rows (no secrets or member data). Inspect each migration before applying a confirmed-missing part to production. The Welfare unique-index migration will fail if historical duplicate expenses already share a linked request; review those records manually instead of deleting financial history blindly.

### Migration history

1. `20260926_member_directory_tree.sql`
2. `20260926_family_notices.sql`
3. `20260926_events_and_tours.sql`
4. `20260926_qurbani_a_to_z.sql`
5. `20260927_personal_finance.sql`
6. `20260927_family_chat.sql`
7. `20260927_health_sos.sql`
8. `20260927_family_welfare_fund.sql`
9. `20260927_shared_household.sql`
10. `20260927_family_archives_vault.sql`
11. `20260927_family_governance.sql`
12. `20260928_family_magazine.sql` — applied and verified on 2026-09-29
13. `20260929_user_locale_preference.sql` — applied and verified by a read-only REST probe on 2026-09-30
14. `20260930_family_contact_support.sql` — Contact & Support queue; must be applied before deploying this module
15. `20260930_family_notifications.sql` — family notifications, per-user state, and preferences; must be applied before deploying this module
16. `20260930_family_privacy_center.sql` — privacy policy, member consent controls, and data-rights request workflow; must be applied before deploying this module
17. `20260930_welfare_disbursement_guard.sql` — one linked paid expense per assistance request; must be applied before relying on the concurrent-disbursement guard
18. `20261001_qurbani_finalization_guard.sql` — campaign/child triggers for settled/closed Qurbani records. The rollback-only `supabase/qurbani_finalization_guard_test.sql` passed in staging on 2026-10-03; concurrent writes and finalization remain untested.
19. `20261001_welfare_atomic_outflows.sql` — fund-row-locked expense payment, request disbursement, and contribution refund. The rollback-only `supabase/welfare_atomic_outflows_test.sql` passed in staging on 2026-10-03; separate two-session concurrency testing and a production acceptance test remain required before real cash use.
20. `20261001_welfare_document_retention_guard.sql` — database triggers protect linked Welfare documents and block normal hard deletion after review/finalization or while a parent still has documents. The rollback-only `supabase/welfare_document_retention_guard_test.sql` passed in staging on 2026-10-03; concurrent approval/deletion and parent/document deletion remain untested. Existing orphan documents and an authorized purge policy still need review.
21. `20261002_member_reapproval_guard.sql` — prevents stale pending join requests from reactivating existing active/suspended/left memberships. Applied to the existing project on 2026-10-03 after the rollback-only staging test passed; the post-application audit returned 34/34 OK. Concurrent approval/revocation and authenticated API/browser tests remain open. Do not rerun.

### Main table groups

- Core/identity: `families`, `member_profiles`, `family_relationships`, `family_memberships`, `family_member_requests`, `audit_logs`
- Notices/events: `family_notices`, `family_events`, `event_rsvps`, `event_comments`, `event_media`
- Qurbani: `qurbani_campaigns`, `qurbani_animals`, `qurbani_participants`, `qurbani_transactions`, `qurbani_vendors`, `qurbani_schedules`, `qurbani_tasks`, `qurbani_distributions`
- Personal finance: `personal_finance_accounts`, `personal_finance_transactions`, `personal_finance_budgets`, `personal_finance_debts`, `personal_finance_bills`, `personal_finance_goals`
- Chat: `chat_channels`, `chat_channel_members`, `chat_messages`, `chat_message_reactions`, `chat_read_receipts`, `chat_attachments`
- Health: `health_profiles`, `health_medications`, `health_appointments`, `health_measurements`, `health_documents`, `health_sos_alerts`, `health_sos_responses`
- Welfare: `welfare_funds`, `welfare_requests`, `welfare_contributions`, `welfare_expenses`, `welfare_pledges`, `welfare_documents`
- Household: `households`, `household_shopping_lists`, `household_shopping_items`, `household_utility_bills`, `household_tasks`, `household_service_contacts`, `household_maintenance_requests`, `household_documents`
- Archive: `archive_collections`, `archive_memories`, `archive_stories`, `archive_vault_documents`, `family_assets`, `time_capsules`, `archive_files`
- Governance: `family_polls`, `poll_options`, `poll_votes`, `poll_comments`, `family_decisions`
- Magazine: `family_magazine_articles`, `magazine_article_comments`, `magazine_article_reactions`, `magazine_media`
- Contact & Support: `family_contact_tickets`
- Notifications: `family_notifications`, `family_notification_states`, `family_notification_preferences`
- Privacy: `family_privacy_settings`, `family_privacy_consents`, `family_data_requests`

PostgreSQL/Supabase can be used on the free tier for development and small early usage, but quotas and pricing can change. Check current official Supabase limits before production launch, especially database size, bandwidth, storage, backups, project pausing, and monthly active users.

## 9. Qurbani A-to-Z requirements

The Qurbani module is a flagship module and must remain broad. It currently covers the operational foundation through yearly campaigns and related records. Future improvements should preserve these domains:

- Annual campaign creation, planning dates, location, status, notes, and previous-year comparison.
- Animal inventory: animal number/type, purchase, transport, feed, medicine, slaughter cost, weight, supplier, status.
- Share/participant registry: family/member/contact, share count, price, paid/due, payment state, receipt/reference.
- Income/expense ledger and budget summary.
- Vendors/suppliers, quotations, contacts, payments, and evaluations.
- Purchase, care, transport, slaughter, cutting, packing, cleanup, and delivery schedules.
- Task assignment, responsibility, priority, deadline, completion status.
- Meat distribution: participant share, relatives, poor/community allocation, delivered/pending, weight and recipient.
- Search/filter, printable/exportable registers, and XLSX export of all important data.
- Role-based management, audit trail, confirmation/result modals, and restrictions once a campaign is finalized.

Potential future Qurbani additions: procurement comparison, QR labels, weighing log, volunteer roster, route planning, slaughter-slot assignment, distribution tokens, printable receipts, PDF master report, photo/file evidence, and dashboard comparisons across years.

## 10. User experience and design system

- Product label must stay **Family Management System**; a family can have its own display name/branding.
- Modern, warm, family-oriented interface with uncluttered cards and readable data tables.
- Four admin-selectable palette choices are required. Preserve existing theme behavior and avoid hard-coded colors that bypass theme variables.
- The implemented choices in `app/family-dashboard.tsx` are Heritage Navy, Emerald Gold, Royal Indigo, and Terracotta Olive; verify role permissions and persistence in a live session.
- Dark/light mode must work across every new module.
- Bangla and English layout must remain usable; do not put critical content only in one language.
- Responsive behavior must cover phone, tablet, and desktop.
- Destructive buttons need clear labels and danger styling.
- Empty, loading, error, and permission-denied states are mandatory.
- Use closeable, accessible dialogs for confirmations and results.
- Tables/lists need search/filter where record volume can grow.

## 11. Remaining work and honest gaps

The system is broad but not yet a final commercial SaaS. Remaining work should be tackled in this order unless the user changes priorities.

### Priority 1 — validate pending database changes and publish the local batch

1. The membership reapproval guard is applied and the production read-only audit returned 34/34 OK on 2026-10-03. All four rollback-only staging tests for membership, Qurbani finalization, Welfare atomic outflows, and Welfare document retention passed. Do not reapply older migrations. Two-session concurrency and authenticated application tests still need to be completed before relying on cash/finalization workflows in real use.
2. Obtain access to the existing Sites project from the original owning account; do not create a duplicate deployment unless the user explicitly chooses a new URL/project.
3. Deploy the next owner-private Sites version from the verified local commit.
4. Smoke-test Contact & Support, Notifications, Privacy/Directory consent enforcement, Magazine, Family Tree relationship labels, Events, Qurbani, Personal Finance, language switching/persistence, localized XLSX exports, and bilingual confirmation/result modals.

### Priority 2 — complete bilingual support

- Shared BN/EN locale context and per-user database persistence are implemented.
- Core bilingual coverage is implemented for onboarding, member approval, the primary directory screen, family tree (including computed relationship names), the notice ticker/primary notice screen, Magazine, Events, core Qurbani, Personal Finance, Family Chat, primary Health/SOS, primary Welfare, Household, Archives, Governance, Admin, theme controls, and global confirmation/result dialogs.
- Events, Qurbani, Health, and Shared Household secondary value/action feedback and localized-export gaps were completed in the latest verified batches. Continue remaining stored free-text/server-returned messages and secondary mixed labels in other modules where they are still visible.
- Translate remaining server-returned validation text plus module-specific exports, dates, currencies, statuses, empty states, and secondary dialogs in modules not yet covered.
- A static missing-translation regression check is implemented as `npm.cmd run i18n:audit`; it validates literal BN/EN pairs and rejects empty or newly duplicated untranslated labels outside the reviewed product-term allowlist.

### Priority 3 — external notification delivery and health automation

- The in-app Notification & Reminder Center, family publishing, per-user state, category preferences, digest choice, quiet hours, tenant isolation, audit logging, and XLSX export are implemented locally.
- Category preferences now affect the in-app list. Digest frequency and quiet hours are stored for future external delivery; they do not yet schedule or suppress an in-app digest.
- External email/SMS notifications for approvals, events, SOS, bills, medicine, and important notices.
- FCM/Web Push subscriptions, permissions, device management, and retry/failure logs.
- Scheduled jobs for medicine, appointment, birthday, anniversary, bill, event, and Qurbani reminders.
- Escalation chain for SOS and delivery/read acknowledgment.

### Priority 4 — privacy and security hardening

- Privacy policy, consent controls, member data-rights requests, guarded admin review, retention defaults, and directory/contact privacy enforcement are implemented locally.
- Directory profile/photo visibility now fails closed on missing consent data. Validate the same policy with authenticated live tests after the pending migration and deployment.
- Personal finance is currently protected by server-side authenticated user scoping, but it is not client-side/end-to-end encrypted. Add field encryption/key management if this is a firm requirement.
- Consider column/file encryption for medical, legal, property, and identity documents.
- Add 2FA/OTP and, if required, Google/phone sign-in beyond the hosting identity.
- Add automatic data-export packages, administrator-approved deletion execution, retention cleanup jobs, and documented incident/restore procedures.
- Review Supabase RLS strategy for defense in depth even though server routes already enforce membership.
- Welfare Fund's atomic-outflow RPC and permissions are present in production metadata, and its rollback-only staging test passed authorization, payment, disbursement, refund, insufficient balance, retry, and audit cases. Do not treat it as a cash-disbursement authority until two-session concurrent-request behavior, ledger totals, authenticated application flows, and an approved production acceptance test are verified.
- Welfare document hard deletion has a conservative draft-only app policy and named enabled database triggers. Its rollback-only staging SQL test passed on PostgreSQL. Authenticated API/file tests, concurrent approval/deletion tests, legacy orphan review, storage-cleanup reconciliation, and an authorized purge policy remain outstanding.
- Membership approval has a local API precheck and a production database-function guard against reactivating old access through stale pending requests. The rollback-only staging test and production metadata audit passed; authenticated API and two-session approval/revocation tests remain required before treating the full user flow as verified.
- Qurbani finalization functions and triggers are present and enabled, and their rollback-only staging SQL test passed. Concurrent writes and authenticated application behavior remain unverified. The guard intentionally blocks ordinary cascading family deletion when Qurbani records exist; define an authorized purge process before implementing hard family deletion.
- Local Qurbani acceptance now includes animal create/edit/status, miscellaneous collection create/edit/delete, synthetic schedule create/read-after-reload/edit/delete, and synthetic volunteer task create/read-after-reload/edit/status/delete. The schedule form's datetime persistence and empty-time validation were repaired, duplicate delayed result feedback was suppressed, and Qurbani status dialogs now identify the entity and target state. See `QA_ACCEPTANCE_2026-10-03.md` for exact scope and remaining untested flows. This is not live/two-user acceptance.

### Priority 5 — reports and documents

- XLSX exists broadly; add formal PDF statements, receipts, Qurbani master report, fund statements, event budget reports, and printable member directory/tree views.
- Add report templates, page numbering, localized fonts, signatures/approval blocks, and immutable report snapshots.

### Priority 6 — SaaS commercialization

- Subscription plans, feature limits, storage quotas, trial/upgrade/downgrade/cancellation, and payment billing.
- Authenticated multi-family creation, join/approval, and switching acceptance tests; the local UI/API flows exist but have not been deployed or exercised with two real signed-in accounts.
- Custom domains, automated verification, tenant routing, certificates, and branded emails.
- Super-admin tenant console, abuse handling, support tooling, plan enforcement, usage metrics, and tenant suspension/reactivation.
- Define free/premium tiers only after measuring real storage and notification costs.

### Priority 7 — requested extended features

- Global family map, city/country directory, time zones, and optional weather.
- Skill/profession/job/business directory and family networking.
- Richer member fields if still missing: education history, permanent address, anniversary, WhatsApp/social links, migration history, and emergency contacts.
- More exact relationship labels for maternal/paternal lines, half/step/adoptive relations, multiple marriages, and ambiguous tree paths.
- Birthday/anniversary/death-anniversary calendar and achievements wall.
- Recipes/heritage library, family quiz, wishlist, remittance/care tracker, and service/provider verification.
- Native mobile packaging, stronger offline support, sync conflicts, and an offline mutation queue.

### Priority 8 — engineering quality

- Family Chat's exact per-channel unread counts and bounded complete-history XLSX now need authenticated high-volume testing. A large number of accessible channels still causes one exact count request per channel; consider an authorized database aggregate if real usage requires it. The dashboard unread summary still stops with an explicit error above 20,000 accessible messages, and exports above 20,000 rows need streaming or paging.
- Automated unit tests for permissions, calculations, status transitions, and relation mapping.
- API integration tests for tenant isolation and direct-ID attack attempts.
- Playwright end-to-end tests for onboarding, approval, CRUD, modals, exports, uploads, and mobile flows.
- Accessibility checks, performance/load testing, database query/index review, error monitoring, analytics, backup/restore drills, and deployment rollback documentation.

## 12. Recommended next sequence

1. Inspect the dirty checkout with `git status --short` and read the latest commit with `git log -1 --oneline`; preserve intentional changes.
2. Do not reapply migrations that the 2026-10-03 read-only audit found present. The four rollback-only staging tests passed; review Qurbani/Welfare function bodies and run two-session concurrency checks before trusting financial/finalization workflows.
3. Re-run local tests/audits/build and complete any needed SQL/concurrency integration tests.
4. Obtain editor access to the existing Sites project or use its original owning account for deployment; confirm the current live version and privacy settings.
5. Publish the next owner-private Sites version to the existing project only after migration and hosting prerequisites pass, then smoke-test the new and critical routes.
6. Continue the system-wide i18n pass through remaining server-returned messages and secondary mixed strings; keep `npm.cmd run i18n:audit` passing.
7. Continue external notifications, stronger encryption/security, reports, and then SaaS billing/custom domains.

## 13. Verification checklist for every future batch

Before commit/deployment:

- [ ] `git status --short` reviewed; unrelated user changes preserved.
- [ ] `npm.cmd run i18n:audit` passes.
- [ ] New schema change has a timestamped migration and is also represented in `supabase/schema.sql`.
- [ ] All list/read/update/delete queries include correct family/user scope.
- [ ] Role and ownership checks are server-side.
- [ ] Direct-ID mutations cannot cross tenants.
- [ ] Confirmation modal appears before every meaningful mutation.
- [ ] Success/error/info result modal has close X/button.
- [ ] Loading, empty, validation, permission, and failure states render correctly.
- [ ] Important section exports XLSX with correct headings and data.
- [ ] Private files require authorization and are not exposed as public bucket URLs.
- [ ] Audit events exist for important actions.
- [ ] Dark/light, four palettes, mobile layout, and BN/EN UI were checked.
- [ ] `npm.cmd run lint` passes.
- [ ] `npm.cmd run security:audit` passes.
- [ ] `npm.cmd run build` passes.
- [ ] Migration was applied before code that depends on it was deployed.
- [ ] Live smoke tests pass after deployment.
- [ ] Hosting visibility remains unchanged unless the user explicitly requested a change.

## 14. Deployment workflow

This is a Sites-hosted project. If the next account has Sites building/hosting skills or publishing tools, read their instructions before modifying or publishing the Site. Those tools are not available to every account; lack of access must be reported rather than worked around by creating a new Site.

Important hosting facts:

- Project ID is already stored in `.openai/hosting.json`.
- R2 binding name must stay `BUCKET` unless hosting configuration is deliberately migrated.
- Deployment should update the existing project, not create a duplicate site.
- Keep the current owner-private/custom audience.
- Never treat a successful local build as proof of a successful production migration or live flow; smoke-test the deployed URL.

If deployment fails, preserve the source and record the exact stage/error. Do not repeatedly create new Sites projects as a workaround.

### What the human owner may need to do

- The existing Supabase project passed `supabase/verify_existing_project_readonly.sql` with 34/34 OK on 2026-10-03 after the membership guard migration. All four rollback-only guard tests passed in the separate staging project. Do not rerun migrations blindly. The Free plan shows no automatic project backups; plan a recoverable backup strategy before any further production correction. Never paste the project secret into chat.
- Use the Codex account that owns the existing Site to deploy, or grant editor/collaborator access if both accounts can share that Sites project. A separate personal account may not be eligible for cross-account access; the new account should check the actual sharing UI rather than assume it is possible.
- If the next account cannot access the existing Site, local development can continue, but deployment remains blocked. Do not create a replacement Site or alter the current visibility/URL merely to bypass access.
- Provide any missing product choices (payment provider, SMS/email provider and budget, required PDF formats, legal retention policy, and whether client-side finance encryption is mandatory) before implementing those externally dependent features.

## 15. Source-code map

- `app/family-dashboard.tsx` — main dashboard shell, navigation, lazy module route behavior, themes/language controls.
- `components/action-modal-provider.tsx` — global mutation confirmation and result dialogs.
- `lib/family-access.ts` — roles, active membership, module-management permission helpers.
- `lib/family-selection.ts` and `app/api/workspace/select/route.ts` — selected-family cookie validation and active-membership-checked switch action.
- `lib/supabase-rest.ts` — server-only Supabase Data API helper.
- `app/chatgpt-auth.ts` — authenticated hosting identity.
- `app/*-center.tsx`, `app/*-suite.tsx`, `app/family-chat.tsx`, `app/member-directory.tsx`, `app/family-tree-view.tsx` — module UIs.
- `app/contact-center.tsx`, `app/api/contact/route.ts`, and `lib/contact-types.ts` — family-scoped Contact & Support workflow.
- `app/notification-center.tsx`, `app/api/notifications/route.ts`, and `lib/notification-types.ts` — family notifications, user state, and reminder preferences.
- `app/privacy-center.tsx`, `app/api/privacy/route.ts`, and `lib/privacy-types.ts` — consent controls, privacy policy, and data-rights workflow.
- `app/api/**/route.ts` — authenticated server APIs.
- `lib/*-types.ts` — module data contracts/types.
- `supabase/schema.sql` — full fresh-project schema.
- `supabase/migrations/*.sql` — ordered changes for existing projects.
- `supabase/welfare_atomic_outflows_test.sql` — rollback-only synthetic integration checks for the Welfare RPC; passed in staging on 2026-10-03. Two-session concurrency remains untested.
- `scripts/audit-tenant-scope.mjs` — static tenant/security regression audit.
- `app/manifest.ts` and `components/pwa-registration.tsx` — PWA metadata/registration.
- `.openai/hosting.json` — existing Sites project and R2 binding.

## 16. Definition of done for the complete product

The project is truly complete only when:

- Every promised module works end-to-end with real persistent data and correct authorization.
- Cross-family data access is prevented and covered by automated tests.
- Membership approval is enforced per family.
- Personal finance and sensitive records meet the agreed encryption/privacy level.
- Every major section exports accurate XLSX; required formal reports also export/print as PDF.
- All meaningful mutations use confirmation and closeable result modals.
- BN/EN is complete across the entire product and the preference persists.
- Dark/light and all four palettes work consistently on mobile and desktop.
- Notifications/reminders/SOS delivery work through agreed external channels.
- Backup, restore, monitoring, error handling, privacy, retention, and deletion processes are documented and tested.
- Subscription/custom-domain features work if the product is being sold as SaaS.
- Lint, security audit, build, unit/integration/E2E/accessibility tests pass.
- Production migration, deployment, smoke testing, and rollback preparation are complete.

## 17. Safe working rules for the next account

- Start by reading this file and inspecting the repository; do not restart the project from scratch.
- Preserve any dirty work unless its ownership and purpose are understood.
- Use `rg`/`rg --files` for code discovery and `apply_patch` for focused edits.
- Never expose `.env.local` or secrets in chat, logs, screenshots, commits, or client code.
- Do not make broad or destructive Git/filesystem changes without explicit approval.
- Do not deploy schema-dependent code before its migration is confirmed.
- Do not make the site public or change its domain/audience without explicit approval.
- Work module by module, verify proportionally, and update this handoff whenever architecture, migrations, live version, or remaining scope changes.
