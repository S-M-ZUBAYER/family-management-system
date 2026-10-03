# Family Management System — route-by-route acceptance matrix

Updated: 2026-10-03 (Asia/Dhaka). This tracks **observed behavior**, not whether source code exists. A route is not accepted merely because it builds, loads, or has unit tests. The detailed evidence is in `QA_ACCEPTANCE_2026-10-03.md`; `PROJECT_HANDOFF.md` distinguishes local source, database migrations, and the deployed Site.

Legend: **Partial** = at least one local workflow observed; **Open** = no sufficient interactive acceptance; **N/A** = the route has no such operation by design. None of these routes has complete production-hosted, two-real-user, every-role acceptance yet.

| Page | Related application APIs | Observed local coverage | Still needed |
| --- | --- | --- | --- |
| `/` dashboard | `/api/dashboard` | Partial: data/card read | Export contents, empty/error states, role visibility |
| `/directory` | `/api/members`, `/api/members/photo` | Partial: profile create/edit, family switch | Photo upload/access, relationship changes, privacy roles; profile hard-delete is not exposed |
| `/family-tree` | `/api/members` | Partial: seeded tree/view | Relationship editing, large tree, XLSX contents, privacy roles |
| `/members` | `/api/member-requests`, `/api/member-requests/[id]` | Open | Separate-account request → approve/reject/suspend, modal and tenant isolation |
| `/notices` | `/api/notices`, `/api/notices/[id]` | Partial: create/read/edit/delete | Role denial, XLSX contents, date/locale variants |
| `/events` | `/api/events`, `/api/events/[id]`, `/api/events/[id]/rsvp`, `/api/events/[id]/comments`, `/api/events/[id]/media`, `/api/event-media/[id]` | Partial: event CRUD, RSVP, comment | Media upload/download/delete, alternate roles, XLSX contents |
| `/magazine` | `/api/magazine`, `/api/magazine/records`, `/api/magazine/upload`, `/api/magazine-media/[id]` | Partial: article CRUD, publish, like, comment | Upload/download/delete, privacy/role visibility, XLSX contents |
| `/qurbani` | `/api/qurbani`, `/api/qurbani/campaigns`, `/api/qurbani/records`, `/api/qurbani/status` | Partial: campaign, participants, linked payment/refund, animal edit/status, vendor, schedule, task, distribution | Animal hard-delete, finalization with safe test campaign, concurrent DB sessions, over-allocation, XLSX contents, roles |
| `/finance` | `/api/finance`, `/api/finance/records`, `/api/finance/status` | Partial: wallet and expense CRUD | Budgets, debt/lending, other statuses, XLSX contents, per-user privacy |
| `/chat` | `/api/chat`, `/api/chat/stream`, `/api/chat/upload`, `/api/chat-file/[id]` | Partial: message and group create/read | Two-user real-time, upload/file access, edits/deletes where supported, role isolation |
| `/health` | `/api/health`, `/api/health/records`, `/api/health/upload`, `/api/health-document/[id]` | Partial: private profile and medication CRUD | Appointments, measurements, SOS response/resolve/delivery, files, role isolation, XLSX contents |
| `/welfare` | `/api/welfare`, `/api/welfare/records`, `/api/welfare/upload`, `/api/welfare-document/[id]` | Partial: fund and contribution/refund | Assistance/expenses/pledges, approval/disbursement, files, balance concurrency, XLSX contents |
| `/household` | `/api/household`, `/api/household/records`, `/api/household/upload`, `/api/household-document/[id]` | Partial: home, shopping list/item CRUD; bill create/edit/skip and cancellation; task create/edit/start/complete and local-time persistence; EN/Bn copy spot-check | Bill payment and delete, task delete/reopen, maintenance, service contacts, receipts/files, XLSX contents and role isolation. The QA bill and completed QA task remain by owner choice/testing. |
| `/archives` | `/api/archives`, `/api/archives/records`, `/api/archives/upload`, `/api/archive-file/[id]` | Partial: collection CRUD | Memories/stories, vault/files, assets, capsules, privacy, XLSX contents |
| `/governance` | `/api/governance`, `/api/governance/records` | Partial: poll/vote/close | Formal decisions, approval, role isolation, XLSX contents |
| `/notifications` | `/api/notifications` | Partial: publish/read/archive/restore/preferences | Recipient visibility, reminders/push, role isolation, XLSX contents |
| `/privacy` | `/api/privacy` | Partial: consent and data-rights request/rejection | Policy lifecycle, actual export/fulfillment/deletion, privacy roles |
| `/contact` | `/api/contact` | Partial: ticket create/read/resolve, mailto/WhatsApp links | Delivery, role isolation, status variants, XLSX contents |
| `/help` | N/A | Partial: search/read | BN/EN and mobile navigation, outdated-instruction audit |
| `/setup` | `/api/setup/family`, `/api/workspace`, `/api/workspace/select` | Partial: family switch | New real-account creation/join/approval, settings persistence, roles |
| `/admin` | `/api/admin` | Partial: owner read/audit | Role edits with real second user, role denial, audit export/content |

## Cross-cutting acceptance gates

- Every **supported** create/edit/delete/status action: verify confirmation, cancel-with-no-write, closeable success/error modal, persisted read-after-reload, and scoped audit entry where intended. Do not invent delete actions for immutable/history records.
- Every XLSX button: download and inspect sheet names, headers, row counts, BN/EN text, monetary/date precision, tenant/user scope and >20,000-row failure behavior. Button presence alone is not a pass.
- Every page: first-load/empty/error/retry, dark/light, BN/EN, responsive mobile/desktop, keyboard focus/accessibility. All four admin-selectable palettes must be checked.
- Security: real owner, family admin, ordinary member, pending member and a second family; direct-ID API/file access and private finance/health/vault isolation. A local mock owner does not establish this.
- External services: storage failure/recovery, notification delivery, real-time chat, email/WhatsApp and SOS must be tested only after providers/configuration are explicitly ready; do not report mailto links as email delivery.
- Deployment: repeat representative smoke tests on the **existing** Site after its owning account deploys this checkout. Source and production Supabase migrations being current do not mean the hosted Site is current.

QA records in production-backed local testing must be uniquely labeled. Do not broadly reset the database. Obtain specific confirmation immediately before permanently deleting test rows; preserve existing user/fixture data.
