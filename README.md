Luma Guest Review Console
=========================

Private SvelteKit console for importing Luma events and guest lists, enriching applicants, scoring them, and batching approval/rejection decisions.

Stack:

- SvelteKit + Svelte 5
- Tailwind v4 + shadcn-svelte
- Bun runtime
- Postgres with raw SQL, no ORM
- Supabase Google OAuth, with legacy cookie login only when Supabase is not configured
- Calendar-scoped permissions and invite records
- GitHub GraphQL enrichment
- BrightData LinkedIn profile enrichment

Local setup:

```bash
bun install
cp .env.example .env
docker compose up -d postgres
bun run db:migrate
bun run dev
```

Tests:

```bash
bun run test
```

Tests preload `tests/setup.ts`, which blocks unstubbed external network calls and resets provider env vars to safe test values. Luma, GitHub, BrightData, Supabase, Google, and Resend behavior must be mocked in tests.

First login:

1. For local legacy mode, set `ADMIN_EMAILS`, visit `/login`, and create a password account.
2. For production, set Supabase env vars and use Google OAuth only.
3. After sign-in, visit `/onboarding` and connect a Luma calendar API key.

Google OAuth:

1. Create a Supabase project.
2. Enable Google provider in Supabase Auth.
3. Add redirect URL: `https://YOUR_DOMAIN/auth/callback`.
4. Set `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
5. Set `APP_ENCRYPTION_KEY` to a long random secret for hosted production. Local dev auto-generates `.local/app-encryption-key`.

Railway:

1. Add a Railway Postgres database.
2. Set `DATABASE_URL`, `APP_ENCRYPTION_KEY` for hosted production, Supabase env vars, and optional enrichment keys.
3. Deploy the web service with the included `railway.toml`.
4. Add a separate Railway worker service with start command `bun run worker` if you want continuous enrichment.

Calendar onboarding:

- Each user signs in with Google.
- Each connected Luma calendar stores its API key encrypted in Postgres.
- Events and guests are scoped to `calendar_memberships`.
- Existing local data is migrated into a legacy local calendar.

Invite sending:

- Calendar admins can import people from Luma calendar metadata and click `Send invites`.
- Real emails require `INVITE_EMAILS_ENABLED=true`, `RESEND_API_KEY`, and `INVITE_EMAIL_FROM`.
- With `INVITE_EMAILS_ENABLED=false`, invite rows are created as dry-runs and no emails are sent.

Luma webhook:

1. Run `bun run db:migrate` after pulling this change so the webhook delivery table exists.
2. In Luma, open the calendar, then Settings -> Developer -> Webhooks.
3. Create a webhook pointing to `https://YOUR_RAILWAY_DOMAIN/api/webhooks/luma`.
4. Subscribe to guest and event actions, especially `guest.registered`, `guest.updated`, `event.created`, and `event.updated`.
5. Copy the generated `whsec_...` secret into `LUMA_WEBHOOK_SECRET` locally and on Railway.

The webhook is for incremental updates after the initial import. It verifies Luma signatures, stores every accepted delivery, and only uses read endpoints to refresh affected events or guests.

Luma write safety:

- The app reads Luma events and guests with GET requests.
- Luma guest status changes are isolated in `src/lib/server/luma.ts`.
- Batch actions default to dry-run.
- Real Luma writes require enabling the Setup page write toggle and confirmation text `APPLY`.

Postgres persistence:

Railway Postgres persists independently of app redeploys, so no volume is required for the main product data. Volumes are only needed later if you decide to cache generated files outside the database.
