Luma Guest Review Console
=========================

Private SvelteKit console for importing Luma events and guest lists, enriching applicants, scoring them, and batching approval/rejection decisions.

Stack:

- SvelteKit + Svelte 5
- Tailwind v4 + shadcn-svelte
- Bun runtime
- Postgres with raw SQL, no ORM
- Cookie sessions and invite links
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

First login:

1. Set `ADMIN_EMAILS` to your email.
2. Visit `/login`.
3. Use that email and a 12+ character password to create the first admin.

Railway:

1. Add a Railway Postgres database.
2. Set `DATABASE_URL`, `ADMIN_EMAILS`, and `LUMA_API_KEY`.
3. Deploy the web service with the included `railway.toml`.
4. Add a separate Railway worker service with start command `bun run worker` if you want continuous enrichment.

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
- Real Luma writes require both `LUMA_WRITES_ENABLED=true` and confirmation text `APPLY`.

Postgres persistence:

Railway Postgres persists independently of app redeploys, so no volume is required for the main product data. Volumes are only needed later if you decide to cache generated files outside the database.
