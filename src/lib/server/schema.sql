create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'reviewer')) default 'reviewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists sessions_token_hash_idx on sessions(token_hash);
create index if not exists sessions_expires_at_idx on sessions(expires_at);

create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null check (role in ('admin', 'reviewer')) default 'reviewer',
  token_hash text not null unique,
  invited_by uuid references users(id) on delete set null,
  accepted_by uuid references users(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists invitations_token_hash_idx on invitations(token_hash);
create index if not exists invitations_email_idx on invitations(lower(email));

create table if not exists app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  luma_event_id text not null unique,
  api_id text,
  name text not null,
  url text,
  cover_url text,
  start_at timestamptz,
  end_at timestamptz,
  timezone text,
  status text,
  guest_count integer not null default 0,
  pending_count integer not null default 0,
  approved_count integer not null default 0,
  waitlist_count integer not null default 0,
  last_synced_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_start_at_idx on events(start_at desc nulls last);

create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  luma_guest_id text not null,
  luma_user_id text,
  name text,
  email text not null,
  approval_status text,
  checked_in_at timestamptz,
  registered_at timestamptz,
  ticket_name text,
  status_internal text not null check (
    status_internal in (
      'needs_review',
      'approve_candidate',
      'reject_candidate',
      'pool',
      'approved',
      'rejected'
    )
  ) default 'needs_review',
  score integer not null default 0,
  score_reason jsonb not null default '{}'::jsonb,
  score_locked boolean not null default false,
  notes text not null default '',
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, luma_guest_id)
);

create index if not exists guests_event_status_idx on guests(event_id, status_internal);
create index if not exists guests_event_score_idx on guests(event_id, score desc);
create index if not exists guests_email_idx on guests(lower(email));
create index if not exists guests_luma_user_id_idx on guests(luma_user_id);

create table if not exists registration_answers (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests(id) on delete cascade,
  question_key text,
  question text not null,
  answer text,
  raw_json jsonb not null default '{}'::jsonb,
  unique(guest_id, question)
);

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null unique references guests(id) on delete cascade,
  linkedin_url text,
  github_username text,
  website_url text,
  avatar_url text,
  current_title text,
  current_company text,
  current_company_domain text,
  location text,
  bio text,
  confidence numeric(4, 3) not null default 0,
  source text,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists work_history (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  company text,
  title text,
  company_domain text,
  start_date text,
  end_date text,
  source text,
  raw_json jsonb not null default '{}'::jsonb
);

create table if not exists github_profiles (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null unique references guests(id) on delete cascade,
  username text not null,
  profile_url text,
  avatar_url text,
  contribution_total integer not null default 0,
  followers integer not null default 0,
  public_repos integer not null default 0,
  current_streak integer not null default 0,
  weeks jsonb not null default '[]'::jsonb,
  raw_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index if not exists github_profiles_username_idx on github_profiles(lower(username));

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  name text,
  favicon_url text,
  logo_url text,
  updated_at timestamptz not null default now()
);

create table if not exists decisions (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests(id) on delete cascade,
  reviewer_user_id uuid references users(id) on delete set null,
  from_status text,
  to_status text not null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists enrichment_jobs (
  id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references guests(id) on delete cascade,
  type text not null check (type in ('github', 'brightdata_linkedin', 'score')),
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')) default 'queued',
  attempts integer not null default 0,
  error text,
  run_after timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique(guest_id, type)
);

create index if not exists enrichment_jobs_queue_idx on enrichment_jobs(status, run_after, created_at);

create table if not exists luma_sync_runs (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('events', 'guests')),
  event_id uuid references events(id) on delete cascade,
  status text not null check (status in ('running', 'succeeded', 'failed')) default 'running',
  records_seen integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists luma_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_id text not null unique,
  event_type text,
  luma_event_id text,
  luma_guest_id text,
  signature_valid boolean not null default false,
  status text not null check (status in ('received', 'processed', 'ignored', 'failed')) default 'received',
  error text,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists luma_webhook_deliveries_event_idx
  on luma_webhook_deliveries(luma_event_id, received_at desc);

create index if not exists luma_webhook_deliveries_received_idx
  on luma_webhook_deliveries(received_at desc);
