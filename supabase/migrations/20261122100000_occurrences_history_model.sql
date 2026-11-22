begin;

create table public.occurrences (
  id uuid primary key default gen_random_uuid(),
  number bigint generated always as identity unique,
  condominium_id uuid not null references public.condominiums(id) on delete restrict on update restrict,
  tracking_code text not null default encode(extensions.gen_random_bytes(32), 'hex') unique check (tracking_code ~ '^[0-9a-f]{64}$'),
  origin text not null check (origin in ('public_form', 'manager_panel')),
  channel text not null check (channel in ('web', 'whatsapp', 'phone', 'in_person', 'other')),
  description text not null check (description ~ '[^[:space:]]'),
  status text not null default 'new' check (status in ('new', 'in_progress', 'delegated', 'completed')),
  suggested_priority text check (suggested_priority in ('low', 'normal', 'urgent')),
  suggestion_source text check (suggestion_source in ('ai', 'rules')),
  suggestion_at timestamptz,
  final_priority text check (final_priority in ('low', 'normal', 'urgent')),
  priority_decided_at timestamptz,
  decided_suggested_priority text check (decided_suggested_priority in ('low', 'normal', 'urgent')),
  decided_priority text check (decided_priority in ('low', 'normal', 'urgent')),
  registered_at timestamptz not null default clock_timestamp(),
  created_by_profile_id uuid references public.profiles(id) on delete set null on update restrict,
  responsible_profile_id uuid references public.profiles(id) on delete set null on update restrict,
  due_at timestamptz,
  completed_at timestamptz,
  reporter_name text check (reporter_name ~ '[^[:space:]]'),
  reporter_phone text check (reporter_phone ~ '[^[:space:]]'),
  reporter_unit_or_role text check (reporter_unit_or_role ~ '[^[:space:]]'),
  location text check (location ~ '[^[:space:]]'),
  suggestion_reason text check (suggestion_reason ~ '[^[:space:]]'),
  category text check (category ~ '[^[:space:]]'),
  priority_change_reason text check (priority_change_reason ~ '[^[:space:]]'),
  ai_failure_reason text check (ai_failure_reason ~ '[^[:space:]]'),
  decision text check (decision ~ '[^[:space:]]'),
  responsible_name text check (responsible_name ~ '[^[:space:]]'),
  responsible_phone text check (responsible_phone ~ '[^[:space:]]'),
  responsible_role text check (responsible_role ~ '[^[:space:]]'),
  internal_note text check (internal_note ~ '[^[:space:]]'),
  constraint occurrence_suggestion_complete check (
    (suggested_priority is null and suggestion_source is null and suggestion_at is null and suggestion_reason is null)
    or (suggested_priority is not null and suggestion_source is not null and suggestion_at is not null and suggestion_reason is not null)
  ),
  constraint occurrence_decision_complete check (
    (priority_decided_at is null and decided_priority is null and decided_suggested_priority is null)
    or (priority_decided_at is not null and decided_priority is not null)
  ),
  constraint occurrence_completion check ((status = 'completed') = (completed_at is not null)),
  constraint occurrence_completion_time check (completed_at >= registered_at)
);

create table public.occurrence_events (
  id bigint generated always as identity primary key,
  occurrence_id uuid not null references public.occurrences(id) on delete restrict on update restrict,
  event_type text not null check (event_type in ('registered', 'responsible_changed', 'deadline_changed', 'manager_update', 'employee_message', 'completed')),
  occurred_at timestamptz not null default clock_timestamp(),
  author_type text not null check (author_type in ('reporter', 'manager', 'employee', 'system')),
  author_profile_id uuid references public.profiles(id) on delete set null on update restrict,
  internal_description text not null check (internal_description ~ '[^[:space:]]'),
  visible_to_resident boolean not null default false,
  priority_snapshot text check (priority_snapshot in ('low', 'normal', 'urgent')),
  is_human_action boolean not null default false,
  previous_due_at timestamptz,
  due_at timestamptz,
  delegation_started_at timestamptz,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  author_name text check (author_name ~ '[^[:space:]]'),
  author_phone text check (author_phone ~ '[^[:space:]]'),
  author_role text check (author_role ~ '[^[:space:]]'),
  public_text text check (public_text ~ '[^[:space:]]'),
  previous_responsible_name text check (previous_responsible_name ~ '[^[:space:]]'),
  responsible_name text check (responsible_name ~ '[^[:space:]]'),
  responsible_phone text check (responsible_phone ~ '[^[:space:]]'),
  responsible_role text check (responsible_role ~ '[^[:space:]]'),
  unique (occurrence_id, id),
  check (not visible_to_resident or public_text is not null),
  check (not is_human_action or (author_type in ('manager', 'employee') and event_type <> 'registered')),
  check (author_type = 'system' or author_name is not null),
  check (author_type <> 'system' or (author_profile_id is null and not is_human_action)),
  check (event_type <> 'completed' or delegation_started_at is null or delegation_started_at <= occurred_at)
);

create table public.occurrence_attachments (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null,
  event_id bigint not null,
  storage_bucket text not null check (storage_bucket ~ '^[a-zA-Z0-9_-]+$'),
  storage_path text not null check (storage_path ~ '[^[:space:]]' and storage_path !~ '^[a-zA-Z]+://'),
  file_name text not null check (file_name ~ '[^[:space:]]'),
  content_type text not null check (content_type ~ '^[a-zA-Z0-9.+-]+/[a-zA-Z0-9.+-]+$'),
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (occurrence_id, event_id) references public.occurrence_events(occurrence_id, id) on delete restrict on update restrict,
  unique (storage_bucket, storage_path)
);

create index occurrences_condominium_registered_idx on public.occurrences (condominium_id, registered_at desc, id);
create index occurrences_queue_idx on public.occurrences (condominium_id, status, final_priority, registered_at);
create index occurrences_created_by_idx on public.occurrences (created_by_profile_id);
create index occurrences_responsible_idx on public.occurrences (responsible_profile_id);
create index occurrence_events_timeline_idx on public.occurrence_events (occurrence_id, occurred_at, id);
create index occurrence_events_author_idx on public.occurrence_events (author_profile_id);
create index occurrence_attachments_event_idx on public.occurrence_attachments (occurrence_id, event_id);

alter table public.occurrences enable row level security;
alter table public.occurrences force row level security;
revoke all on public.occurrences from public, anon, authenticated, service_role;

alter table public.occurrence_events enable row level security;
alter table public.occurrence_events force row level security;
revoke all on public.occurrence_events from public, anon, authenticated, service_role;

alter table public.occurrence_attachments enable row level security;
alter table public.occurrence_attachments force row level security;
revoke all on public.occurrence_attachments from public, anon, authenticated, service_role;

revoke all on sequence public.occurrences_number_seq, public.occurrence_events_id_seq from public, anon, authenticated, service_role;

commit;
