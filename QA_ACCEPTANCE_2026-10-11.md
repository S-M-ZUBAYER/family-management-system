# Magazine lifecycle/input acceptance — 2026-10-11

This records local source, pure regression and production-backed loopback mock-owner API evidence, not full product, real second-user, browser or hosted acceptance.

Source checkpoint: `b9ac811` (`Validate magazine inputs and guard lifecycle mutations`). Documentation is committed separately; inspect Git for the newest checkpoint. GitHub delivery is not hosted deployment.

## Scope and corrections

- Checkout `C:\Personal project\family-management-system`, starting clean checkpoint `6bb748c`. Configured database hostname rechecked without printing credentials: `olqwsnttottqitookfck.supabase.co`. No SQL/migration/reset or existing family record changes.
- Strict object/JSON, action/kind/UUID, text/category/visibility/tags and boolean validation added. Invalid supplied status no longer defaults to pending/hidden; omitted required status rejects. Titles/content/summary/comments/tags no longer silently truncate. Exact legacy compose strings `true`/`false` remain supported alongside JSON booleans; other coercions reject. Draft+publish together rejects; direct publish/admin-only visibility/featured require admin in pure policy checks.
- Every unpublished status now clears featured; archived edits retain status. Published hard-delete still rejects with 409. Comment moderation reads the family-scoped record first: nonexistent/wrong-family IDs return 404 with no phantom success/audit.
- Article edit/status/delete and comment moderation/delete use family/id plus server-read status/updated_at conditional queries and exact returned-ID/count validation. This guards an intervening write between server read and mutation, not stale-client edits, cross-table transaction safety or tested two-session races.
- POST dispatch awaits async handlers inside the error mapper so validation/backend rejections reach the intended response rather than escaping the catch. New BN/EN coded errors are wired to the page and shared close-X result modal. Pure/source wiring is not actual browser modal/cancel acceptance.
- Ordinary writes and audits remain separate. Like toggles remain read-then-insert/delete; reaction races/idempotency, article/comment/media transaction races, audit/transport recovery and storage deletion failures are not solved by this slice. GET still carries author account identifiers; safe projection review remains open.

## Actual API acceptance

- Port 5173 was initially not running (connection refused). Started a temporary owned local dev server; `/magazine` returned HTTP 200. Preview opening was queued, not an observed browser interaction. Server stopped using its retained session after tests; next user/agent can run `npm.cmd run dev` from the same checkout. No unrelated process stopped.
- `scripts/qa-magazine-local.mjs` requires explicit `--allow-local-qa-writes`, loopback origin, both known mock-owner family/manage/migration guards, exact labeled no-media cleanup and unrelated array preservation.
- **159 checks passed**: unsigned GET/POST/PATCH/DELETE, malformed body/JSON/action/kind/nested data and text/enum/tag/boolean limits, absent-comment moderation 404 with no audit, draft create/deduplicated tags, title/category/admin-visibility edit/readback, invalid edit/status, draft like/comment denial, family-visibility edit, publish/featured/time persistence, published-delete 409, like/unlike counts, comment create/hide/show/delete and missing-after-delete denial, same-owner other-family article/comment ID rejection, pending/draft/archive clearing featured, archived edit, ten article/comment audit actions and both families' unrelated article/comment/media arrays unchanged.
- New prefix **`QA Magazine Lifecycle 20261011035625`**, article **`038cd54c-42ca-4347-b8e0-24fdcca6973c`**, comment **`3585805b-be60-485e-88fe-61b5255a1994`**. No cover/file/provider message/real announcement submitted.
- Exact cleanup passed **24 checks**: permanently removed only this run's archived, exact-title, no-media article; repeat delete and edit returned 404, delete audit retained, unrelated article/comment/media arrays in both families unchanged. QA comment was already removed in the lifecycle run and its repeat delete/moderation returned 404; like was removed by unlike. There is no product undo. **Do not rerun completed cleanup.** Historical fixtures from other routes were not targeted.

## Quality

- Seven focused validation/policy/wiring cases passed, including malformed input, no silent truncation, tags, exact legacy booleans, admin-only options, featured transitions and conditional/async/error integration. These pure admin checks do not prove real nonowner API access.
- All **53 configured suites**, nonincremental TypeScript, tenant-security, i18n (**2,919 literal BN/EN pairs**), cancellation (**75 handlers**), whitespace and production build passed. Lint initially found one QA-loop expression warning; simplified to a braced loop, then full lint rerun passed without warnings. Final harness change did not change application source/build inputs.
- Development logs included existing framework dependency-optimization/compile-timing diagnostics; no application crash, hydration test or cause/fix of those framework diagnostics claimed.
- Sites skill required preserving the existing Site. Native `get_site` for the tracked project ID returned **Sites project not found** under this account on October 11. No source credential, duplicate Site, audience change or deploy attempted. Local/GitHub changes are not verified hosted changes.

## Still partial / next

- Fresh browser edit/review/featured/moderation/delete confirmations, cancel-with-no-write, close-X success/error, saved BN/EN, dark/light/palettes, mobile/keyboard and hydration acceptance remain open. No fresh screenshot or physical XLSX download in this slice.
- Next bounded slice: Magazine safe allowed-field/native-date XLSX, English/nonempty comment workbook acceptance; then file validation/partial save-upload recovery and safe identity-free GET projection review. Current Magazine XLSX timestamps are ISO text, unchanged here.
- Real separate owner/admin/member/pending identities, tenant/user/private visibility, fault/Retry/stale response handling, lost response/audit repair/durable idempotency, reaction and publication/file races, >20,000-row behavior and owning-account hosted deployment remain open. Full product is **not complete**.
