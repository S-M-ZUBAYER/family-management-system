# Family Management System

A bilingual (বাংলা/English), multi-family web application for family records and day-to-day coordination. The first family is Sheikh Monsuf Family, but the application is designed so each registered family has its own workspace and approval process.

> **Project status:** This is an active, partially tested project—not a finished or newly deployed release. Code in this checkout, database migrations applied to Supabase, and the version currently hosted on Sites may differ. Start with [NEXT_ACCOUNT_HANDOFF.md](NEXT_ACCOUNT_HANDOFF.md), then [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) and [the latest local QA log](QA_ACCEPTANCE_2026-10-08.md) before continuing or deploying.

## What is in the application

- Member profiles, family directory, multi-generation tree and per-family membership approval.
- Notices, events/tours, a family magazine, group chat and in-app notifications.
- Extensive year-by-year Qurbani planning: participants/shares, animals, financial records, vendors, schedules, tasks and meat distribution.
- Private personal finance, health records and SOS, welfare funds, shared household management, family archives and governance/polls.
- Privacy/data-rights, admin/audit, Contact & Support and a step-by-step Help Center.
- Bengali/English UI, dark/light mode, selectable color palettes and XLSX exports in major modules.

Features have different acceptance levels. In particular, external SMS/email/WhatsApp delivery, billing/custom domains, complete two-user access testing, every XLSX's contents, and the latest deployment have **not** been verified. The Contact page's email link opens the visitor's email app; submitting an in-app support ticket does not itself send email.

## Technology

| Layer | Current implementation |
| --- | --- |
| Web app | React 19, TypeScript, Vinext (Next-compatible app routing), Vite and Tailwind CSS |
| API | Server-side route handlers under `app/api/` |
| Data | Supabase-hosted PostgreSQL, accessed by server-only HTTPS Data API code |
| Identity | Host-provided sign-in in production; loopback-only mock identity in portable local development |
| Files | Private Sites R2 binding named `BUCKET` for supported media/documents |
| Hosting | Existing hosted project with deployment configuration kept in the repository |

The `SUPABASE_SECRET_KEY` is server-only. Never put it in client code, a `NEXT_PUBLIC_` variable, a screenshot, a commit or a chat message.

## Local setup (Windows PowerShell)

Requirements: Node.js 22.13 or later, npm and Git. Commands below run from the repository root.

1. Install locked dependencies:

   ```powershell
   npm.cmd ci
   ```

2. For a **new, empty** Supabase project, run `supabase/schema.sql` once in its SQL Editor. For an **existing** database, do **not** rerun the full schema or every migration. Read [supabase/README.md](supabase/README.md), inspect the timestamped files in `supabase/migrations/`, and run `supabase/verify_existing_project_readonly.sql` before deciding whether any particular migration is missing. Some migrations change financial or membership guards.

3. Copy `.env.example` to `.env.local`, then set your own project's values locally:

   ```dotenv
   SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SECRET
   ```

   `.env.local` is Git-ignored. Do not reuse the example placeholder. Never paste the real key into GitHub or chat.

4. Start the app:

   ```powershell
   npm.cmd run dev
   ```

   In portable local development, use the app's local sign-in route after starting the server. This signs in a **mock** `local_seedy` user; it does not prove hosted authentication or cross-user permissions. The default port is 5173 unless the dev server prints another one. The exact route is documented in `PROJECT_HANDOFF.md`.

The R2 file flows require a configured private `BUCKET` binding. Database-only pages can be tested without claiming file upload/download has passed.

## Verification commands

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit --incremental false
npm.cmd run security:audit
npm.cmd run cancellation:audit
npm.cmd run i18n:audit
npm.cmd run build
```

The `package.json` scripts also include focused `test:*` suites for privacy, notifications, Qurbani, finance validation, pagination, chat access, welfare, archives and other policy helpers. Run the relevant suites when changing those areas. `QA_ACCEPTANCE_2026-10-03.md` distinguishes actual browser actions from static/unit checks and lists the remaining end-to-end tests.

## Manual Qurbani integration QA

`scripts/qa-qurbani-lifecycle.mjs` provides opt-in `seed`, `cleanup`, `verify`, `finalize-seed` and `finalize-verify` workflows. Use the actual loopback dev-server origin, exact QA family ID and (except seed modes) exact campaign ID. Mutating modes require `--allow-local-qa-writes`. These tests use the server's configured database, **which may be production**; they are not an isolated in-memory test. Do not run them against real family/financial records.

```powershell
node scripts/qa-qurbani-lifecycle.mjs verify --base-url http://localhost:5174 --family-id <QA-family-UUID> --campaign-id <QA-campaign-UUID>
npm.cmd run test:qurbani-workbook
```

Seed creates uniquely labeled synthetic records. Cleanup only targets that runner's planning campaign, removes refunds before collections and animals after their links, and checks unrelated records are unchanged. Finalization fixtures must be retained after settlement/closure; do not bypass immutable-history guards to clean them up. See `QA_ACCEPTANCE_2026-10-07.md` for exact observed fixtures and remaining gaps. Native Excel dates store local wall-clock values; exported timestamp sheets include the IANA timezone explicitly.

## Manual Finance integration QA

`scripts/qa-finance-local.mjs` is opt-in loopback QA for the named Nojir test family using local mock authentication. It exercises all six record kinds, validation and same-owner cross-family rejection. The server may use **production Supabase**; inspect the current environment and preserve existing records first. It does not perform real payments or prove separate-user permissions.

```powershell
$env:FMS_QA_ORIGIN = 'http://localhost:5173' # use the actual FMS origin
node scripts/qa-finance-local.mjs --allow-local-qa-writes
# After reviewing this run's exact synthetic prefix and authorizing permanent cleanup:
node scripts/qa-finance-local.mjs --allow-local-qa-writes --cleanup-prefix 'QA Finance <14-digit timestamp>'
npm.cmd run test:finance-validation
npm.cmd run test:finance-export
npm.cmd run test:finance-action-copy
```

Never use a broad table reset for QA. Cleanup targets only the exact prefix's owned Finance IDs, removes transactions before their wallet and verifies unrelated Finance arrays are unchanged. See the October 8 QA log for completed cleanup and remaining acceptance. XLSX money is numeric/exact to cents; date-only columns are native Excel dates; empty sections retain localized headers.

## Manual Health integration QA

`scripts/qa-health-local.mjs` exercises the Nojir family's private medications, appointments, measurements and a tiny synthetic PNG, with local mock authentication. It does not create SOS alerts, make external appointments or provide treatment. The loopback server may use **production Supabase**: verify its origin/environment first, preserve existing profiles and never broadly reset tables.

```powershell
$env:FMS_QA_ORIGIN = 'http://localhost:5173' # verify current FMS port
node scripts/qa-health-local.mjs --allow-local-qa-writes
# After reviewing the exact synthetic prefix and authorizing permanent cleanup:
node scripts/qa-health-local.mjs --allow-local-qa-writes --cleanup-prefix 'QA Health <14-digit timestamp>'
npm.cmd run test:health-validation
npm.cmd run test:health-action-copy
npm.cmd run test:health-export
npm.cmd run test:health-directory
npm.cmd run test:health-sos
npm.cmd run test:health-reminders
node scripts/qa-health-sos-rejections.mjs # rejection-only; no valid SOS submitted
```

Cleanup targets only that prefix's private records/file and verifies unrelated arrays/profile/SOS are unchanged. Historical completed prefixes must not be cleaned again. Datetime inputs carry an explicit offset; XLSX time cells include a timezone column. Browser reminders only run while the page is open with permission: they are not offline/SMS emergency delivery. See the latest QA log for observed coverage and remaining privacy/download/delivery tests.

SOS state guards/projections and medication-course reminder planning have isolated tests, plus local API rejection/cancel evidence. Positive multi-user SOS, actual notification delivery and transactional consistency are not accepted: response insert, acknowledgment and audit remain separate REST calls. In-app SOS does not call emergency services or dispatch help. Use staging for any positive SOS/concurrency test and preserve genuine emergency history.

## Database and security rules

- Every family-scoped read and mutation must enforce the selected family's active membership **on the server**. A client-side hidden button is not authorization.
- A new member's join request remains pending until that family's owner/family admin approves it. Existing suspended/left access must not be silently reactivated.
- Personal finance and private health/archive data must not become visible to another family or member. Check direct-ID routes and file downloads as well as list pages.
- Money, shares, dates, Qurbani finalization and welfare outflows have validation/database guards. Do not bypass them for UI convenience.
- Apply schema changes in migration order, test against staging first, and arrange a recoverable backup before changing production data. Do not run `supabase/dev_fixture_two_families.sql` against a database that already contains families; it is an intentional QA fixture.
- Keep meaningful mutations behind confirmation and show a closeable success/error/info result. Some records intentionally use status changes or retained audit history rather than hard delete.

## Project map

- `app/` — pages, module UIs and authenticated API handlers.
- `components/action-modal-provider.tsx` — shared confirmation/result dialogs.
- `components/locale-provider.tsx` — persisted language selection.
- `lib/family-access.ts`, `lib/family-selection.ts` — membership/tenant access rules.
- `lib/supabase-rest.ts` — server-only Supabase Data API adapter.
- `supabase/schema.sql` — fresh-project schema; `supabase/migrations/` — ordered existing-project changes.
- `scripts/` — audits, focused tests and local/hosting helpers.
- Deployment configuration — existing hosted project and private R2 binding details; it is **not** a deployment command.

## Deployment and contribution

This repository does not automatically update the hosted Site. Deployment must target the **existing** Sites project with its current owner-private/custom audience, using the account that owns it or has editor access. Verify migrations, runtime secrets, tests and a production backup plan first; then smoke-test critical routes on the deployed URL. Do not create a replacement Site or make the existing Site public just to work around access.

Before committing, inspect `git status`, keep `.env.local` and generated files out of Git, run the checks above, and update the handoff/QA record when a module's status changes. Prefer focused commits with clear messages. Do not rewrite existing history or discard another contributor's uncommitted work without explicit agreement.
