# Family Management System — Project Handoff

Last updated: 2026-09-30 (Asia/Dhaka)

This file is the authoritative handoff for continuing the project from another Codex account. Read it completely before changing or deploying anything.

## Immediate continuation status

- Local Magazine and Family Tree relationship updates are implemented and committed.
- A shared BN/EN locale provider, database-persisted per-user language preference, bilingual theme controls, and bilingual global confirmation/result modals are implemented locally. The bilingual pass now covers onboarding, member approvals, the primary member-directory view, family-tree controls and relationship-to-me labels, notice ticker/primary notice views, Magazine, Events, core Qurbani, Personal Finance, Family Chat, the primary Health/SOS workflow, primary Welfare Fund dashboard/contributions, and the primary Household, Archives, Governance, and Admin surfaces. Qurbani, Finance, Chat, and Health XLSX headings/sheet names follow the selected language. This work depends on `supabase/migrations/20260929_user_locale_preference.sql`, which must be applied before deployment.
- `npm.cmd run lint`, `npm.cmd run security:audit`, and `npm.cmd run build` were run again successfully after the latest continuation request.
- The user applied all SQL files in `supabase/migrations` on 2026-09-29. A direct Supabase REST check for `public.family_magazine_articles` then returned HTTP `200`, confirming that the Magazine migration is ready.
- The Codex/ChatGPT account used on 2026-09-29 could not access the existing Sites project ID (`Sites project not found`). The original owning account must either deploy the update or add the new account as an editor/collaborator; do not create a duplicate Site.
- After the expanded bilingual implementation, `npm.cmd run lint`, `npm.cmd run security:audit`, and `npm.cmd run build` all passed. The first sandboxed build attempt hit a Windows `spawn EPERM`; the unrestricted verification build then completed successfully. Deployment is blocked by the new locale migration and Sites project access.
- The stable production site remains version 30 at `https://family-management-system.hitht.chatgpt.site`.
- The next account must run `git status --short` and `git log -1 --oneline` first; the working tree should be clean at handoff.

## Copy-paste prompt for the next Codex account

```text
Continue the Family Management System project from:
C:\Personal project\family-management-system

First read C:\Personal project\family-management-system\PROJECT_HANDOFF.md completely. Then run git status --short and git log -1 --oneline, and inspect package.json, .env.example, .openai/hosting.json, supabase/schema.sql, and all migrations. Do not expose, print, copy, or commit .env.local or any Supabase secret. Preserve existing work and keep the deployed site owner-private/custom unless I explicitly ask to change sharing.

The stable live site is currently version 30 at https://family-management-system.hitht.chatgpt.site. The latest local code contains a verified Family Magazine module, improved family-tree relationship labels, and expanded bilingual coverage through Events, Qurbani, Personal Finance, Family Chat, and primary Health/SOS. The Magazine migration is applied. Before deployment, run supabase/migrations/20260929_user_locale_preference.sql in Supabase SQL Editor. Then run npm.cmd run lint, npm.cmd run security:audit, and npm.cmd run build; deploy to the existing Sites project appgprj_6ab4e57009088191814056c14e820221 while preserving owner-private/custom access; then smoke-test /magazine, /family-tree, /events, /qurbani, /finance, /chat, /health, language switching, preference persistence, XLSX exports, and confirmation/result modals.

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
- Current stable live release: **version 30**
- Commit used for version 30: `908fcdf6019401b195e102bfede2b379588e4798`
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
   - Events: planning, create/edit, filters, RSVP, discussion, gallery, management actions, date/currency formatting, and primary empty/access states use the selected locale.
   - Qurbani: yearly campaign setup, status workflow, participants/shares, animals, ledger, vendors, schedule, volunteer tasks, distribution, record forms/actions, and localized XLSX workbooks use the selected locale.
   - Personal Finance: private dashboard, accounts, transactions, budgets, debts, bills, goals, forms/actions, date/currency formatting, and localized XLSX workbooks use the selected locale.
   - Family Chat: channel navigation/creation, group/direct conversation states, live status, notifications, message composer, privacy copy, feedback, date/time formatting, and XLSX workbooks use the selected locale.
   - Health/SOS: dashboard, reminders, metrics, profile/care/measurement views, medical document upload, medicine/appointment/measurement forms, SOS creation/response flows, emergency directory/cards, date/time/status display, feedback, and XLSX workbooks now follow the selected locale. Some API-returned messages and stored free-text values can still appear in their original language.
   - Welfare Fund: locale-aware currency/date formatting, header, metrics, navigation, contribution/expense/assistance/pledge workflows, create/edit and upload dialogs, fund/request cards, tables, empty/access states, status/actions, and XLSX sheet/column headings now follow the selected language. Some API-returned messages and stored free-text values can still appear in their original language.
   - Shared Household: main header/filter/KPIs/tabs, create/edit and document-upload dialogs, record forms and select options, section headings, empty/access states, status/actions, shopping/task/maintenance card labels, utility table headings, inline workflow prompts, currency/date formatters, and XLSX sheet/column headings now follow the selected locale. Some stored category/type values and API-returned row feedback remain mixed.
   - Admin Control Center: access/loading states, main header, KPI cards, role/audit navigation, member/audit filters, table headings, counts, locale-aware timestamps, and XLSX sheet/column headings now follow the selected locale. Role/status option labels and some row-level feedback remain mixed.
   - Family Archives: primary header/actions, metrics, navigation tabs, load/save/upload/status feedback, collection/story/asset/capsule and upload-metadata forms/dialogs, section headings, empty states, status badges, dropdown actions, and XLSX sheet/column headings now follow the selected locale. Some table/card body labels and inline buttons remain mixed.
   - Family Governance: primary header/actions, metrics, navigation tabs, poll/decision forms and dialogs, section headings, rules, empty states, status badges, dropdown actions, load/export feedback, and XLSX sheet/column headings now follow the selected locale. Some poll/decision card body labels and inline buttons remain mixed.

The user confirmed and the API check verified that `supabase/migrations/20260928_family_magazine.sql` is applied. This batch is database-ready for deployment.

### Last verification result

All of these passed after the local Magazine/tree changes:

```powershell
npm.cmd run lint
npm.cmd run security:audit
npm.cmd run build
```

The security audit confirmed membership-gated mutations, family-scoped direct-ID changes, and no Supabase secret in client/public source.

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

### Stable and live in version 30

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
| Bilingual foundation | Global shell and core flows | Shared locale context, persisted member preference, bilingual theme/global action dialogs, onboarding, member approval, primary directory view, family tree, notice ticker/primary notice views, Magazine, Events, core Qurbani, Personal Finance, Family Chat, and primary Health/SOS complete locally; new migration and deployment pending |

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

Run only migrations that have not already been applied, in filename order. The deployed database should already contain migrations through the Governance module. The next required migration is:

```text
supabase/migrations/20260928_family_magazine.sql
```

Do not rerun destructive SQL. The scripts are designed around `create table if not exists`/safe additions, but still inspect a migration before applying it to production.

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
13. `20260929_user_locale_preference.sql` — adds the per-member `preferred_locale`; must be applied before deploying the bilingual preference code

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
- Dark/light mode must work across every new module.
- Bangla and English layout must remain usable; do not put critical content only in one language.
- Responsive behavior must cover phone, tablet, and desktop.
- Destructive buttons need clear labels and danger styling.
- Empty, loading, error, and permission-denied states are mandatory.
- Use closeable, accessible dialogs for confirmations and results.
- Tables/lists need search/filter where record volume can grow.

## 11. Remaining work and honest gaps

The system is broad but not yet a final commercial SaaS. Remaining work should be tackled in this order unless the user changes priorities.

### Priority 1 — publish the verified local batch

1. Run `20260929_user_locale_preference.sql` in the connected Supabase project.
2. Obtain access to the existing Sites project from the original owning account; do not create a duplicate deployment unless the user explicitly chooses a new URL/project.
3. Deploy the next owner-private Sites version from the verified local commit.
4. Smoke-test Magazine, Family Tree relationship labels, Events, Qurbani, Personal Finance, language switching/persistence, localized XLSX exports, and bilingual confirmation/result modals.

### Priority 2 — complete bilingual support

- Shared BN/EN locale context and per-user database persistence are implemented.
- Core bilingual coverage is implemented for onboarding, member approval, the primary directory screen, family tree (including computed relationship names), the notice ticker/primary notice screen, Magazine, Events, core Qurbani, Personal Finance, Family Chat, primary Health/SOS, primary Welfare, Household, Archives, Governance, Admin, theme controls, and global confirmation/result dialogs.
- Finish remaining secondary mixed labels/server-returned messages and localized exports in Directory, Notice Center, Events, Qurbani, Finance, Health, Welfare, Household, Archives, Governance, and Admin.
- Translate remaining server-returned validation text plus module-specific exports, dates, currencies, statuses, empty states, and secondary dialogs in modules not yet covered.
- Add a missing-translation check to CI/tests.

### Priority 3 — notifications and health automation

- External email/SMS notifications for approvals, events, SOS, bills, medicine, and important notices.
- FCM/Web Push subscriptions, permissions, device management, and retry/failure logs.
- Scheduled jobs for medicine, appointment, birthday, anniversary, bill, event, and Qurbani reminders.
- Escalation chain for SOS and delivery/read acknowledgment.

### Priority 4 — privacy and security hardening

- Personal finance is currently protected by server-side authenticated user scoping, but it is not client-side/end-to-end encrypted. Add field encryption/key management if this is a firm requirement.
- Consider column/file encryption for medical, legal, property, and identity documents.
- Add 2FA/OTP and, if required, Google/phone sign-in beyond the hosting identity.
- Create privacy policy, consent controls, data export/delete requests, retention rules, and incident/restore procedures.
- Review Supabase RLS strategy for defense in depth even though server routes already enforce membership.

### Priority 5 — reports and documents

- XLSX exists broadly; add formal PDF statements, receipts, Qurbani master report, fund statements, event budget reports, and printable member directory/tree views.
- Add report templates, page numbering, localized fonts, signatures/approval blocks, and immutable report snapshots.

### Priority 6 — SaaS commercialization

- Subscription plans, feature limits, storage quotas, trial/upgrade/downgrade/cancellation, and payment billing.
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

- Automated unit tests for permissions, calculations, status transitions, and relation mapping.
- API integration tests for tenant isolation and direct-ID attack attempts.
- Playwright end-to-end tests for onboarding, approval, CRUD, modals, exports, uploads, and mobile flows.
- Accessibility checks, performance/load testing, database query/index review, error monitoring, analytics, backup/restore drills, and deployment rollback documentation.

## 12. Recommended next sequence

1. Verify the checkout is clean with `git status --short` and read the latest commit with `git log -1 --oneline`.
2. Obtain editor access to the existing Sites project or use its original owning account for deployment.
3. Publish the next private Sites version using the existing Sites project ID.
4. Smoke-test the new routes against the live deployment.
5. Continue the system-wide i18n pass through the remaining secondary Directory/Notice/Event/Qurbani/Finance/Health/Welfare/Household/Archives/Governance/Admin strings and localized exports.
6. Continue with notifications, stronger encryption/security, reports, and then SaaS billing/custom domains.

## 13. Verification checklist for every future batch

Before commit/deployment:

- [ ] `git status --short` reviewed; unrelated user changes preserved.
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

This is a Sites-hosted project. The next account should use the available `sites:sites-building` and `sites:sites-hosting` skills and read their instructions before modifying or publishing the Site.

Important hosting facts:

- Project ID is already stored in `.openai/hosting.json`.
- R2 binding name must stay `BUCKET` unless hosting configuration is deliberately migrated.
- Deployment should update the existing project, not create a duplicate site.
- Keep the current owner-private/custom audience.
- Never treat a successful local build as proof of a successful production migration or live flow; smoke-test the deployed URL.

If deployment fails, preserve the source and record the exact stage/error. Do not repeatedly create new Sites projects as a workaround.

## 15. Source-code map

- `app/family-dashboard.tsx` — main dashboard shell, navigation, lazy module route behavior, themes/language controls.
- `components/action-modal-provider.tsx` — global mutation confirmation and result dialogs.
- `lib/family-access.ts` — roles, active membership, module-management permission helpers.
- `lib/supabase-rest.ts` — server-only Supabase Data API helper.
- `app/chatgpt-auth.ts` — authenticated hosting identity.
- `app/*-center.tsx`, `app/*-suite.tsx`, `app/family-chat.tsx`, `app/member-directory.tsx`, `app/family-tree-view.tsx` — module UIs.
- `app/api/**/route.ts` — authenticated server APIs.
- `lib/*-types.ts` — module data contracts/types.
- `supabase/schema.sql` — full fresh-project schema.
- `supabase/migrations/*.sql` — ordered changes for existing projects.
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
