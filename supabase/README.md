# PostgreSQL setup

This project uses Supabase as a hosted PostgreSQL database through its HTTPS Data API. The application never exposes the server secret to browser code.

1. Create a Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local` for local development.
4. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
5. For the hosted Site, add the same values as runtime environment variables and keep `SUPABASE_SECRET_KEY` marked as a secret.

The schema enables Row Level Security on every application table. Browser roles receive no direct table policies; all privileged membership operations go through authenticated server routes and the reviewed PostgreSQL function.

Before live onboarding, create the first `families` row plus its owner `family_memberships` row using the authenticated owner's stable ChatGPT user ID.

## Existing project: Welfare verification (not migration replay)

Run `welfare_outflow_preflight_readonly.sql` first. It reports the installed
settlement RPC, invoker/search-path settings, effective anon/authenticated/service
execute privileges, guard markers, unique linked-request index, five document
triggers and eight table counts without reading personal row contents. Marker
checks are not a complete function-definition diff or concurrency test.

Only after the required guards are installed, in **staging**, run
`welfare_atomic_outflows_test.sql` and `welfare_document_retention_guard_test.sql`.
Both create their own synthetic families inside a transaction, have bounded
statement/lock timeouts, show a PASS row only after their assertions, and end
with `ROLLBACK`. They are bookkeeping/metadata tests, not real payments or file
uploads. Always run the read-only preflight again to verify counts match the
baseline. If a test errors, do not retry a payment; issue `ROLLBACK` before the
read-only comparison and investigate the specific assertion.

In the SQL editor, replace the **whole** document (select all, paste once) and
verify its start/end before running; editing a Monaco viewport textbox may
append instead of replacing the query. No RLS setting should be changed in
response to a scanner warning on a read-only query. Do not rerun migrations
whose installation has already been verified.

October 8 staging settlement and metadata-retention assertions passed with
all eight counts zero before/after; production installation was checked
read-only. This does not accept real-user API/UI permissions, two-session
concurrency, audit/transport failures, or file storage cleanup.

## Existing project: Qurbani animal-link guard

For an existing project, `schema.sql` does not update old foreign keys. First run
`qurbani_animal_link_preflight_readonly.sql` in the SQL Editor and verify all three
named constraints are present and all orphan counts are zero. In **staging**,
apply `migrations/20261007_qurbani_animal_link_guard.sql`, then run
`qurbani_animal_link_guard_test.sql`. The test uses synthetic rows in a
transaction that ends with `ROLLBACK`. Confirm three `NO ACTION` constraints
with the preflight query again. Only then apply the migration to production
and repeat the read-only verification. If all three constraints already show
`NO ACTION` and `validated = true`, do **not** reapply the migration. Do not
rerun the entire migration folder.
