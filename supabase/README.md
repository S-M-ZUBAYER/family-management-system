# PostgreSQL setup

This project uses Supabase as a hosted PostgreSQL database through its HTTPS Data API. The application never exposes the server secret to browser code.

1. Create a Supabase project.
2. Open the SQL editor and run `supabase/schema.sql`.
3. Copy `.env.example` to `.env.local` for local development.
4. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
5. For the hosted Site, add the same values as runtime environment variables and keep `SUPABASE_SECRET_KEY` marked as a secret.

The schema enables Row Level Security on every application table. Browser roles receive no direct table policies; all privileged membership operations go through authenticated server routes and the reviewed PostgreSQL function.

Before live onboarding, create the first `families` row plus its owner `family_memberships` row using the authenticated owner's stable ChatGPT user ID.

