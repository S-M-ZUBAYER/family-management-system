# Local acceptance log — 2026-10-03

This is a scoped browser-test record, **not** a declaration that the product or live Site is complete. The UI was exercised at `http://localhost:5173` as the local mock owner `local_seedy`, mostly in Nojir Poramanik Family. The production Supabase project contains only the owner's explicitly requested synthetic fixture plus clearly named QA records. No second authenticated user, external message provider, private object-storage failure, or deployed Site was used in this session.

## Verified through the local UI

| Area | Actions actually observed |
| --- | --- |
| Families, locale, theme | Earlier in the same acceptance batch: switched between two synthetic families; switched Bengali/English and dark/light. Dark is the first-visit default. |
| Directory/tree | Earlier: 2 families each seeded with 22 profiles and 36 parent/spouse relationships; created and edited 2 additional Nojir QA profiles. Member-profile hard delete is not exposed. |
| Qurbani | Earlier: campaign created and participant/share created, read, edited, deleted; vendor created, read, edited, deleted. Created QA animal `QA-COW-2027-01`, edited its health/price and confirmed its purchased status persisted after reload. Cancelled an animal edit and a permanent-delete confirmation; the record remained. Created QA miscellaneous collection `QA-COLL-2027-01` for ৳1,000.25, edited it to ৳1,200.50, then permanently deleted it; the ledger returned to zero. Created a synthetic schedule for that animal at 09:30, verified it after reload, edited it to 10:15 and a new location, then permanently deleted it with a record-specific confirmation and one success result. Empty schedule time now shows a client-side error dialog instead of sending an invalid mutation. Created a synthetic volunteer task, confirmed it persisted after reload, changed status to completed and saw pending count drop 1 → 0, edited its title/assignee without shifting the deadline, then permanently deleted it and saw total task count return to 0. The QA animal remains for later distribution tests. Animal hard deletion and expense/refund entries were not tested. |
| Notices | Published a QA notice, read after reload, edited, then deleted. The edit-time UTC/local shift was fixed and the unchanged time retested. |
| Events | Created a QA event, read, edited, RSVP'd, commented, and deleted it with its linked QA data. The edit-time UTC/local shift was fixed and the unchanged time retested. |
| Personal finance | Created/edited/deleted a private QA wallet; created/edited/deleted an expense and checked balance 1000 → 900 → 880 → 1000. |
| Magazine | Created/published, liked, commented, deleted comment, edited, archived, and deleted a QA article. |
| Chat | Sent a group message and created a QA group; both persisted. Edit/delete for messages/channels are not exposed and two-user real-time delivery was not tested. |
| Notifications | Published QA notification, marked read, archived, restored; toggled a preference off/on. Restore showed one closeable success dialog after a duplicate local message was removed. Notification hard delete is not exposed. |
| Governance | Created a poll, voted, observed results/quorum, and closed it. The closed voted QA poll remains as history. Formal decisions, approval and role-specific visibility were not UI-tested. |
| Welfare | Created and edited a QA fund. Recorded a 500 BDT owner contribution, saw balance 500, refunded it, and saw balance return to 0. Refund history and zero-balance fund remain. Fund hard delete is not exposed. |
| Household | Created a QA home; created a shopping list and item; edited then deleted the item; deleted the list. The QA home remains; bill/task/maintenance/service/receipt submodules were not exercised. |
| Health | Created private profile; created, read, edited, deleted a QA medication. Duplicate success dialogs on health mutations were removed. SOS confirmation was cancelled; the SOS form and draft remained open and no alert was sent. No real SOS delivery was tested. |
| Archives | Created, read, edited, deleted a QA collection. File upload/download and vault/capsule security were not UI-tested. |
| Help/contact | Help search and contact links/email prefill checked. Created a QA support ticket, read it, set status to resolved with an admin response, and observed confirmation/success dialogs. The resolved QA ticket remains. Sending mail/WhatsApp and ticket response delivery were not verified. |
| Privacy | Saved a consent preference, reopened to verify persistence, then restored its original value. Submitted a QA data-rights export request and rejected it as a QA-only request. Duplicate local success feedback was removed and the retest showed one result dialog. The rejected request remains as history. |
| Admin | Owner-only roles/access page loaded and showed one owner account plus audit entries. Role-change actions were disabled for that sole owner, so member role changes were not UI-tested. |

All tested mutations used a confirmation dialog and a closeable result dialog, except any UI action explicitly noted as not exposed. This does not prove every button across the product has been tested.

## Code changes from this acceptance batch

- `app/notice-center.tsx` and `app/event-center.tsx`: convert `datetime-local` values to UTC on save and back to local clock on edit; prevent an unchanged timestamp from drifting by the timezone offset.
- `app/notification-center.tsx`: remove redundant success feedback after the global mutation-result dialog.
- `app/health-center.tsx`: remove redundant mutation success feedback; stop SOS create/respond/close processing if its confirmation is declined.
- `app/privacy-center.tsx`: remove redundant success feedback from consent, policy and data-rights request mutations.
- `app/magazine-center.tsx` and `app/governance-center.tsx`: accessible labels for action-menu buttons.
- `lib/qurbani-action-copy.ts` and `components/action-modal-provider.tsx`: make Qurbani record create/edit/delete confirmations identify the record and operation; warn explicitly when deletion is permanent; show locale-specific success messages instead of mixed-language API copy. `scripts/test-qurbani-action-copy.mjs` covers both locales and unknown kinds. The updated Bengali animal edit success and cancelled delete warning were browser-verified.
- `app/qurbani-suite.tsx`: use functional record-form updates and explicit datetime input events so the visible schedule time survives the save-confirmation render; reject an empty schedule time before API submission. `lib/action-feedback.ts` classifies Bengali invalid-date messages as errors. `components/action-modal-provider.tsx` suppresses repeated local feedback for the same mutation outcome, including delayed duplicate success. The schedule create/edit/delete flow and one-dialog edit result were browser-verified.
- `lib/qurbani-action-copy.ts`: Qurbani status confirmations now name the affected entity and target status in both languages; campaign settlement/closure warns that ordinary edits will lock. The Bengali volunteer task completion confirmation and success result were browser-verified. `scripts/test-qurbani-action-copy.mjs` covers the new status copy and unknown statuses.

## Checks passed after code changes

`npm.cmd run lint`, `npx.cmd tsc --noEmit --incremental false`, `npm.cmd run build`, `npm.cmd run security:audit`, `npm.cmd run cancellation:audit` (76 client handlers), `npm.cmd run i18n:audit` (2884 reviewed literal pairs), all 19 configured `test:*` scripts, and `git diff --check` passed on 2026-10-03. Lint, typecheck, build and audits were rerun after the final Privacy patch; the 19 scripts were run before that patch, which did not change their imported policy/utility code. The first incremental TypeScript attempt could not write `tsconfig.tsbuildinfo` under the local sandbox; the nonincremental typecheck passed. Build was run with approved write permission and passed. These are local checks, not a deployed test.

After the latest Qurbani-dialog change, the new focused action-copy test (2 cases), nonincremental TypeScript check, full lint, security/cancellation/i18n audits, all 20 configured `test:*` scripts, diff check and production build passed. The first sandboxed build hit the same Windows `spawn EPERM` restriction; the approved unrestricted rerun passed. This does not constitute deployed or two-user acceptance.

After the schedule datetime and duplicate-feedback fix, nonincremental TypeScript check, lint, security/cancellation/i18n audits, all 20 configured `test:*` scripts, and the approved unrestricted production build passed again. The feedback tests now cover delayed duplicate feedback and Bengali invalid-time classification. The first sandboxed build again hit Windows `spawn EPERM`; that was an execution-permission limitation, not a source build error.

After the Qurbani status-copy change and volunteer-task acceptance, nonincremental TypeScript check, full lint, security/cancellation/i18n audits, all 20 configured `test:*` scripts, and the approved unrestricted production build passed. These checks do not replace authenticated cross-family or deployed acceptance.

## Still required before claiming full acceptance

1. Continue Qurbani acceptance: animal creation/edit/purchased status, a miscellaneous collection create/edit/delete, schedule create/edit/delete/invalid-time, and volunteer task create/edit/status/delete are now covered, but animal hard delete, participant-linked payments, expenses/refunds, meat/package distribution, settlement/finalization, broader invalid inputs, actual XLSX contents and role restrictions are still open. Preserve the existing finalization guard.
2. UI-test member join request → pending → approval/rejection/suspension with **separate real authenticated accounts**, and repeat representative direct-ID reads/mutations across both families. The current mock owner cannot prove isolation or member privacy.
3. UI-test Household bills, tasks, maintenance, service contacts, receipts; Welfare assistance, expenses, pledges and documents; Health appointments, measurements, real SOS response/resolve; Archives vault files, stories, assets and time capsules; Governance formal decisions; Admin member-role changes, Privacy policy/data fulfillment and Contact ticket role isolation/exports.
4. Download and inspect actual XLSX contents/headers/totals from every major section, not merely confirm buttons exist. Test file upload/download/access revocation and failure recovery with a configured private storage binding.
5. Test chat with two online users and verify notifications/reminders/push/SOS/email/WhatsApp against the chosen external providers. No external delivery is proven.
6. Finish accessibility and mobile/desktop BN/EN + all four palette checks, including every success/error/cancel dialog, date and currency formatting.
7. Keep QA artifacts distinguishable, then remove only with an explicit cleanup decision that preserves audit/legal history. No blanket table reset is needed for the remaining checks.
8. Deploy the local source to the **existing** owner-private Sites project from an account with editor access, then repeat critical smoke tests on the deployed URL. This account still cannot access that Sites project; do not create a replacement as a workaround.
