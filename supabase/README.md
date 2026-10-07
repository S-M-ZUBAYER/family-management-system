# PostgreSQL setup

This project uses Supabase as a hosted PostgreSQL database through its HTTPS Data API. The application never exposes the server secret to browser code.

1. Create a Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local` for local development.
4. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
5. For the hosted Site, add the same values as runtime environment variables and keep `SUPABASE_SECRET_KEY` marked as a secret.

The schema enables Row Level Security on every application table. Browser roles receive no direct table policies; all privileged membership operations go through authenticated server routes and the reviewed PostgreSQL function.

Before live onboarding, create the first `families` row plus its owner `family_memberships` row using the authenticated owner's stable ChatGPT user ID.

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

