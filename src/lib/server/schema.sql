create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  supabase_user_id uuid unique,
  email text not null unique,
  password_hash text,
  name text,
  avatar_url text,
  role text not null check (role in ('admin', 'reviewer')) default 'reviewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table users add column if not exists supabase_user_id uuid unique;
alter table users add column if not exists name text;
alter table users add column if not exists avatar_url text;
alter table users alter column password_hash drop not null;

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

create table if not exists luma_calendars (
  id uuid primary key default gen_random_uuid(),
  luma_calendar_id text unique,
  name text not null,
  slug text,
  url text,
  avatar_url text,
  timezone text,
  encrypted_api_key text not null,
  api_key_hint text,
  raw_json jsonb not null default '{}'::jsonb,
  created_by uuid references users(id) on delete set null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists calendar_memberships (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references luma_calendars(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'reviewer')) default 'reviewer',
  created_at timestamptz not null default now(),
  unique(calendar_id, user_id)
);

create index if not exists calendar_memberships_user_idx on calendar_memberships(user_id, calendar_id);

create table if not exists luma_calendar_people (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references luma_calendars(id) on delete cascade,
  email text,
  name text,
  luma_role text,
  app_role text not null check (app_role in ('admin', 'reviewer')) default 'reviewer',
  avatar_url text,
  source text,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(calendar_id, email)
);

create index if not exists luma_calendar_people_calendar_idx on luma_calendar_people(calendar_id);

create table if not exists calendar_invites (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references luma_calendars(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'reviewer')) default 'reviewer',
  token_hash text not null unique,
  invited_by uuid references users(id) on delete set null,
  accepted_by uuid references users(id) on delete set null,
  accepted_at timestamptz,
  sent_at timestamptz,
  send_status text not null check (send_status in ('pending', 'sent', 'dry_run', 'failed')) default 'pending',
  last_error text,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now(),
  unique(calendar_id, email)
);

create index if not exists calendar_invites_email_idx on calendar_invites(lower(email));
create index if not exists calendar_invites_calendar_idx on calendar_invites(calendar_id);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid references luma_calendars(id) on delete cascade,
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

alter table events add column if not exists calendar_id uuid references luma_calendars(id) on delete cascade;
create index if not exists events_start_at_idx on events(start_at desc nulls last);
create index if not exists events_calendar_start_idx on events(calendar_id, start_at desc nulls last);

create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  luma_guest_id text not null,
  luma_user_id text,
  name text,
  email text not null,
  approval_status text,
  desired_luma_status text check (desired_luma_status is null or desired_luma_status in ('approved', 'declined')),
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

alter table guests add column if not exists desired_luma_status text;
alter table guests drop constraint if exists guests_desired_luma_status_check;
alter table guests add constraint guests_desired_luma_status_check
  check (desired_luma_status is null or desired_luma_status in ('approved', 'declined'));
update guests
set desired_luma_status = case
  when status_internal in ('approve_candidate', 'approved') then 'approved'
  when status_internal in ('reject_candidate', 'rejected') then 'declined'
  else null
end
where desired_luma_status is null
  and status_internal in ('approve_candidate', 'approved', 'reject_candidate', 'rejected');

create index if not exists guests_event_status_idx on guests(event_id, status_internal);
create index if not exists guests_event_desired_luma_status_idx on guests(event_id, desired_luma_status);
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
  total_stars integer not null default 0,
  top_repositories jsonb not null default '[]'::jsonb,
  current_streak integer not null default 0,
  weeks jsonb not null default '[]'::jsonb,
  raw_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table github_profiles add column if not exists total_stars integer not null default 0;
alter table github_profiles add column if not exists top_repositories jsonb not null default '[]'::jsonb;

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

alter table enrichment_jobs drop constraint if exists enrichment_jobs_status_check;
alter table enrichment_jobs add constraint enrichment_jobs_status_check
  check (status in ('queued', 'running', 'succeeded', 'failed'));

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

do $$
declare
  legacy_calendar_id uuid;
  legacy_user_id uuid;
begin
  if exists (select 1 from events where calendar_id is null) then
    select id into legacy_user_id from users order by created_at asc limit 1;

    insert into luma_calendars (
      luma_calendar_id,
      name,
      encrypted_api_key,
      api_key_hint,
      created_by,
      raw_json
    )
    values (
      'legacy-local-calendar',
      'Imported Luma Calendar',
      'legacy-env-key',
      'env',
      legacy_user_id,
      jsonb_build_object('source', 'legacy_single_tenant_migration')
    )
    on conflict (luma_calendar_id) do update set updated_at = now()
    returning id into legacy_calendar_id;

    update events
    set calendar_id = legacy_calendar_id
    where calendar_id is null;

    if legacy_user_id is not null then
      insert into calendar_memberships (calendar_id, user_id, role)
      values (legacy_calendar_id, legacy_user_id, 'owner')
      on conflict (calendar_id, user_id) do nothing;
    end if;
  end if;
end $$;
