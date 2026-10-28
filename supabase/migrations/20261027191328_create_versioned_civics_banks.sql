-- Two private, geographically resolved civics banks. Client access stays closed until app access design.
-- Narrow automatic-RLS trigger execution without changing its DDL-trigger behavior.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

create table public.civics_questions_2008 (
  question_number smallint not null check (question_number between 1 and 100),
  source_question_id text not null,
  question_text text not null check (btrim(question_text) <> ''),
  section text not null,
  subsection text not null,
  language text not null default 'en' check (language = 'en'),
  special_consideration_65_20 boolean not null default false,
  geographic_scope text not null check (geographic_scope in ('national', 'state_or_territory', 'congressional_district')),
  geography text not null,
  state_code text check (state_code is null or state_code in ('AK', 'AL', 'AR', 'AS', 'AZ', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA', 'GU', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MP', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'PR', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VI', 'VT', 'WA', 'WI', 'WV', 'WY')),
  district_code text check (district_code is null or district_code ~ '^[A-Z]{2}[0-9]{2}$'),
  answers text[] not null check (cardinality(answers) > 0 and array_position(answers, null) is null),
  answer_display text not null check (btrim(answer_display) <> ''),
  answer_status text not null,
  previous_officeholder text,
  temporal_class text not null,
  is_geography_dependent boolean generated always as (geographic_scope <> 'national') stored,
  is_time_dependent boolean not null default false,
  answer_updated_on date not null,
  next_update_on date generated always as ((answer_updated_on + interval '1 month')::date) stored,
  regular_transition_on date,
  source_urls text[] not null check (cardinality(source_urls) > 0),
  source_details jsonb not null check (jsonb_typeof(source_details) = 'array'),
  notes text,
  imported_at timestamptz not null default now(),
  primary key (question_number, geography),
  constraint civics_questions_2008_source_id check (source_question_id = 'uscis-2008-' || lpad(question_number::text, 3, '0')),
  constraint civics_questions_2008_geography check (
    (geographic_scope = 'national' and geography = 'US' and state_code is null and district_code is null)
    or (geographic_scope = 'state_or_territory' and state_code is not null and district_code is null and geography = 'US-' || state_code)
    or (geographic_scope = 'congressional_district' and state_code is not null and district_code is not null and left(district_code, 2) = state_code and geography = 'US-' || state_code || '-' || right(district_code, 2))
  ),
  constraint civics_questions_2008_vacancy check (
    (answer_status = 'vacant' and previous_officeholder is not null and btrim(previous_officeholder) <> '' and answers = array['Vacant']::text[] and answer_display = 'Vacant (previously: ' || previous_officeholder || ')')
    or (answer_status <> 'vacant' and previous_officeholder is null)
  )
);
create index civics_questions_2008_geography_question_idx on public.civics_questions_2008 (geography, question_number);
alter table public.civics_questions_2008 enable row level security;
revoke all on table public.civics_questions_2008 from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.civics_questions_2008 to service_role;
create policy client_access_disabled on public.civics_questions_2008
  as restrictive for all to anon, authenticated using (false) with check (false);
comment on table public.civics_questions_2008 is 'N-400 filed before 2025-10-20: 2008 bank. One row per question/geography. Private until app access is explicitly configured.';
comment on column public.civics_questions_2008.geography is 'US for national; US-CA for state/territory; US-CA-12 for congressional district. Do not substitute interview-office location for applicable jurisdiction.';
comment on column public.civics_questions_2008.answer_updated_on is 'Date the dataset response was reviewed/updated from cited sources; not the import time. Use for the future freshness notice.';
comment on column public.civics_questions_2008.next_update_on is 'One calendar month after answer_updated_on. Maintenance suggestion, not answer expiration; no automatic job is scheduled.';
comment on column public.civics_questions_2008.previous_officeholder is 'Vacancy display context only; never a current officeholder or canonical answer.';
comment on column public.civics_questions_2008.answer_display is 'Display text; a vacancy is Vacant (previously: NAME). Canonical answers remain separate for gameplay.';
comment on column public.civics_questions_2008.is_time_dependent is 'Editorial current-officeholder/composition/calendar review flag; false is not a guarantee of permanent truth.';

create table public.civics_questions_2025 (
  question_number smallint not null check (question_number between 1 and 128),
  source_question_id text not null,
  question_text text not null check (btrim(question_text) <> ''),
  section text not null,
  subsection text not null,
  language text not null default 'en' check (language = 'en'),
  special_consideration_65_20 boolean not null default false,
  geographic_scope text not null check (geographic_scope in ('national', 'state_or_territory', 'congressional_district')),
  geography text not null,
  state_code text check (state_code is null or state_code in ('AK', 'AL', 'AR', 'AS', 'AZ', 'CA', 'CO', 'CT', 'DC', 'DE', 'FL', 'GA', 'GU', 'HI', 'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME', 'MI', 'MN', 'MO', 'MP', 'MS', 'MT', 'NC', 'ND', 'NE', 'NH', 'NJ', 'NM', 'NV', 'NY', 'OH', 'OK', 'OR', 'PA', 'PR', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA', 'VI', 'VT', 'WA', 'WI', 'WV', 'WY')),
  district_code text check (district_code is null or district_code ~ '^[A-Z]{2}[0-9]{2}$'),
  answers text[] not null check (cardinality(answers) > 0 and array_position(answers, null) is null),
  answer_display text not null check (btrim(answer_display) <> ''),
  answer_status text not null,
  previous_officeholder text,
  temporal_class text not null,
  is_geography_dependent boolean generated always as (geographic_scope <> 'national') stored,
  is_time_dependent boolean not null default false,
  answer_updated_on date not null,
  next_update_on date generated always as ((answer_updated_on + interval '1 month')::date) stored,
  regular_transition_on date,
  source_urls text[] not null check (cardinality(source_urls) > 0),
  source_details jsonb not null check (jsonb_typeof(source_details) = 'array'),
  notes text,
  imported_at timestamptz not null default now(),
  primary key (question_number, geography),
  constraint civics_questions_2025_source_id check (source_question_id = 'uscis-2025-' || lpad(question_number::text, 3, '0')),
  constraint civics_questions_2025_geography check (
    (geographic_scope = 'national' and geography = 'US' and state_code is null and district_code is null)
    or (geographic_scope = 'state_or_territory' and state_code is not null and district_code is null and geography = 'US-' || state_code)
    or (geographic_scope = 'congressional_district' and state_code is not null and district_code is not null and left(district_code, 2) = state_code and geography = 'US-' || state_code || '-' || right(district_code, 2))
  ),
  constraint civics_questions_2025_vacancy check (
    (answer_status = 'vacant' and previous_officeholder is not null and btrim(previous_officeholder) <> '' and answers = array['Vacant']::text[] and answer_display = 'Vacant (previously: ' || previous_officeholder || ')')
    or (answer_status <> 'vacant' and previous_officeholder is null)
  )
);
create index civics_questions_2025_geography_question_idx on public.civics_questions_2025 (geography, question_number);
alter table public.civics_questions_2025 enable row level security;
revoke all on table public.civics_questions_2025 from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.civics_questions_2025 to service_role;
create policy client_access_disabled on public.civics_questions_2025
  as restrictive for all to anon, authenticated using (false) with check (false);
comment on table public.civics_questions_2025 is 'N-400 filed on or after 2025-10-20: 2025 bank. One row per question/geography. Private until app access is explicitly configured.';
comment on column public.civics_questions_2025.geography is 'US for national; US-CA for state/territory; US-CA-12 for congressional district. Do not substitute interview-office location for applicable jurisdiction.';
comment on column public.civics_questions_2025.answer_updated_on is 'Date the dataset response was reviewed/updated from cited sources; not the import time. Use for the future freshness notice.';
comment on column public.civics_questions_2025.next_update_on is 'One calendar month after answer_updated_on. Maintenance suggestion, not answer expiration; no automatic job is scheduled.';
comment on column public.civics_questions_2025.previous_officeholder is 'Vacancy display context only; never a current officeholder or canonical answer.';
comment on column public.civics_questions_2025.answer_display is 'Display text; a vacancy is Vacant (previously: NAME). Canonical answers remain separate for gameplay.';
comment on column public.civics_questions_2025.is_time_dependent is 'Editorial current-officeholder/composition/calendar review flag; false is not a guarantee of permanent truth.';
