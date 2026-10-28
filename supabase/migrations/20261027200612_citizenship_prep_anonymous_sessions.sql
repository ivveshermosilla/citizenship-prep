-- Minimal anonymous practice persistence. Recovery codes are never stored: the
-- server retains only a one-way SHA-256 verifier for the 256-bit bearer code.
create schema if not exists game_private;
revoke all on schema game_private from public, anon, authenticated;
grant usage on schema game_private to anon;

create table game_private.sessions (
  session_id uuid primary key default extensions.uuid_generate_v4(),
  code_verifier bytea not null unique check (octet_length(code_verifier) = 32),
  edition text not null check (edition in ('2008', '2025')),
  state_code text not null check (state_code ~ '^[A-Z]{2}$'),
  district_code text check (district_code is null or district_code ~ '^[A-Z]{2}[0-9]{2}$'),
  created_at timestamptz not null default clock_timestamp(),
  last_active_at timestamptz not null default clock_timestamp(),
  quiz_attempts integer not null default 0 check (quiz_attempts between 0 and 100000),
  quiz_correct integer not null default 0 check (quiz_correct between 0 and quiz_attempts),
  cards_reviewed integer not null default 0 check (cards_reviewed between 0 and 100000),
  check (district_code is null or left(district_code, 2) = state_code)
);
create index sessions_expiry_idx on game_private.sessions (last_active_at);
alter table game_private.sessions enable row level security;
revoke all on game_private.sessions from public, anon, authenticated;

create or replace function game_private.session_result(p_session game_private.sessions)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, game_private
as $$
  select jsonb_build_object(
    'edition', p_session.edition,
    'state_code', p_session.state_code,
    'district_code', p_session.district_code,
    'created_at', p_session.created_at,
    'last_active_at', p_session.last_active_at,
    'quiz_attempts', p_session.quiz_attempts,
    'quiz_correct', p_session.quiz_correct,
    'cards_reviewed', p_session.cards_reviewed
  )
$$;

create or replace function game_private.validate_recovery_code(p_code text)
returns bytea
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
begin
  if p_code is null or p_code !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception using errcode = '22023', message = 'invalid recovery code';
  end if;
  return extensions.digest(convert_to(p_code, 'UTF8'), 'sha256');
end
$$;

-- Resolve and validate the House district once for both session creation and
-- public question reads. Single-entry jurisdictions are automatically chosen.
create or replace function game_private.resolve_district(p_edition text, p_state_code text, p_district_code text)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_count integer;
  v_district text;
begin
  if p_edition is null or p_edition not in ('2008', '2025')
     or p_state_code is null or p_state_code !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'invalid practice selection';
  end if;
  if p_edition = '2008' then
    select count(distinct district_code), min(district_code) into v_count, v_district
      from public.civics_questions_2008 where state_code = p_state_code and geographic_scope = 'congressional_district';
  else
    select count(distinct district_code), min(district_code) into v_count, v_district
      from public.civics_questions_2025 where state_code = p_state_code and geographic_scope = 'congressional_district';
  end if;
  if not exists (
    select 1 from public.civics_questions_2025 where geography = 'US-' || p_state_code
    union all select 1 from public.civics_questions_2008 where geography = 'US-' || p_state_code
  ) then raise exception using errcode = '22023', message = 'unsupported jurisdiction'; end if;
  if v_count > 1 and p_district_code is null then
    raise exception using errcode = '22023', message = 'district required';
  end if;
  if p_district_code is not null then
    if p_district_code !~ '^[A-Z]{2}[0-9]{2}$' or left(p_district_code, 2) <> p_state_code then
      raise exception using errcode = '22023', message = 'invalid congressional district';
    end if;
    if p_edition = '2008' then
      if not exists (select 1 from public.civics_questions_2008 where state_code = p_state_code and district_code = p_district_code and geographic_scope = 'congressional_district') then
        raise exception using errcode = '22023', message = 'unsupported congressional district';
      end if;
    else
      if not exists (select 1 from public.civics_questions_2025 where state_code = p_state_code and district_code = p_district_code and geographic_scope = 'congressional_district') then
        raise exception using errcode = '22023', message = 'unsupported congressional district';
      end if;
    end if;
    return p_district_code;
  end if;
  if v_count = 1 then return v_district; end if;
  raise exception using errcode = '22023', message = 'district required';
end
$$;

create or replace function game_private.create_session(
  p_code text, p_edition text, p_state_code text, p_district_code text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_verifier bytea;
  v_row game_private.sessions;
  v_resolved_district text;
  v_question_count integer;
begin
  v_verifier := game_private.validate_recovery_code(p_code);
  if p_edition is null or p_edition not in ('2008', '2025') or p_state_code is null or p_state_code !~ '^[A-Z]{2}$' then
    raise exception using errcode = '22023', message = 'invalid practice selection';
  end if;
  v_resolved_district := game_private.resolve_district(p_edition, p_state_code, p_district_code);

  if p_edition = '2008' then
    select count(distinct question_number) into v_question_count from public.civics_questions_2008
    where geography in ('US', 'US-' || p_state_code, 'US-' || p_state_code || '-' || right(v_resolved_district, 2));
    if v_question_count <> 100 then raise exception using errcode = '22023', message = 'practice bank incomplete'; end if;
  else
    select count(distinct question_number) into v_question_count from public.civics_questions_2025
    where geography in ('US', 'US-' || p_state_code, 'US-' || p_state_code || '-' || right(v_resolved_district, 2));
    if v_question_count <> 128 then raise exception using errcode = '22023', message = 'practice bank incomplete'; end if;
  end if;

  -- Bound aggregate storage without collecting identity, IP, or device data.
  perform pg_advisory_xact_lock(7212052026);
  if (select count(*) from game_private.sessions) >= 10000 then
    raise exception using errcode = '54000', message = 'session capacity reached';
  end if;
  insert into game_private.sessions(code_verifier, edition, state_code, district_code)
  values (v_verifier, p_edition, p_state_code, v_resolved_district)
  returning * into v_row;
  return game_private.session_result(v_row);
exception when unique_violation then
  raise exception using errcode = '23505', message = 'recovery code already used';
end
$$;

create or replace function game_private.resume_session(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare v_row game_private.sessions;
begin
  update game_private.sessions s
    set last_active_at = clock_timestamp()
    where s.code_verifier = game_private.validate_recovery_code(p_code)
      and s.last_active_at > clock_timestamp() - interval '168 hours'
  returning s.* into v_row;
  if not found then raise exception using errcode = 'P0002', message = 'session unavailable'; end if;
  return game_private.session_result(v_row);
end
$$;

create or replace function game_private.record_quiz_check(p_code text, p_knew_answer boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare v_row game_private.sessions;
begin
  if p_knew_answer is null then raise exception using errcode = '22023', message = 'self-check required'; end if;
  update game_private.sessions s set
    quiz_attempts = s.quiz_attempts + 1,
    quiz_correct = s.quiz_correct + case when p_knew_answer then 1 else 0 end,
    last_active_at = clock_timestamp()
    where s.code_verifier = game_private.validate_recovery_code(p_code)
      and s.last_active_at > clock_timestamp() - interval '168 hours'
      and s.quiz_attempts < 100000
  returning s.* into v_row;
  if not found then raise exception using errcode = 'P0002', message = 'session unavailable'; end if;
  return game_private.session_result(v_row);
end
$$;

create or replace function game_private.record_card_review(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare v_row game_private.sessions;
begin
  update game_private.sessions s set
    cards_reviewed = s.cards_reviewed + 1,
    last_active_at = clock_timestamp()
    where s.code_verifier = game_private.validate_recovery_code(p_code)
      and s.last_active_at > clock_timestamp() - interval '168 hours'
      and s.cards_reviewed < 100000
  returning s.* into v_row;
  if not found then raise exception using errcode = 'P0002', message = 'session unavailable'; end if;
  return game_private.session_result(v_row);
end
$$;

create or replace function game_private.practice_questions(p_edition text, p_state_code text, p_district_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare v_result jsonb; v_district_code text; v_question_count integer;
begin
  v_district_code := game_private.resolve_district(p_edition, p_state_code, p_district_code);
  if p_edition = '2008' then
    select count(distinct question_number) into v_question_count from public.civics_questions_2008 where geography in ('US', 'US-' || p_state_code, 'US-' || p_state_code || '-' || right(v_district_code, 2));
    if v_question_count <> 100 then raise exception using errcode = '22023', message = 'practice bank incomplete'; end if;
    select jsonb_agg(jsonb_build_object(
      'question_number', q.question_number, 'question_text', q.question_text, 'section', q.section,
      'answers', q.answers, 'answer_display', q.answer_display, 'answer_updated_on', q.answer_updated_on, 'next_update_on', q.next_update_on,
      'source_urls', q.source_urls, 'is_geography_dependent', q.is_geography_dependent,
      'is_time_dependent', q.is_time_dependent
    ) order by q.question_number) into v_result
    from (select distinct on (question_number) * from public.civics_questions_2008
      where geography in ('US', 'US-' || p_state_code, 'US-' || p_state_code || '-' || right(v_district_code, 2))
      order by question_number, case when geography = 'US-' || p_state_code || '-' || right(v_district_code, 2) then 1 when geography = 'US-' || p_state_code then 2 else 3 end) q;
  else
    select count(distinct question_number) into v_question_count from public.civics_questions_2025 where geography in ('US', 'US-' || p_state_code, 'US-' || p_state_code || '-' || right(v_district_code, 2));
    if v_question_count <> 128 then raise exception using errcode = '22023', message = 'practice bank incomplete'; end if;
    select jsonb_agg(jsonb_build_object(
      'question_number', q.question_number, 'question_text', q.question_text, 'section', q.section,
      'answers', q.answers, 'answer_display', q.answer_display, 'answer_updated_on', q.answer_updated_on, 'next_update_on', q.next_update_on,
      'source_urls', q.source_urls, 'is_geography_dependent', q.is_geography_dependent,
      'is_time_dependent', q.is_time_dependent
    ) order by q.question_number) into v_result
    from (select distinct on (question_number) * from public.civics_questions_2025
      where geography in ('US', 'US-' || p_state_code, 'US-' || p_state_code || '-' || right(v_district_code, 2))
      order by question_number, case when geography = 'US-' || p_state_code || '-' || right(v_district_code, 2) then 1 when geography = 'US-' || p_state_code then 2 else 3 end) q;
  end if;
  return v_result;
end
$$;

create or replace function game_private.cleanup_expired_sessions()
returns bigint
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare v_deleted bigint;
begin
  delete from game_private.sessions where last_active_at <= clock_timestamp() - interval '168 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$$;

-- Remove default PUBLIC function execution before granting only exact helpers.
revoke all on all functions in schema game_private from public, anon, authenticated;
grant execute on function game_private.create_session(text, text, text, text) to anon;
grant execute on function game_private.resume_session(text) to anon;
grant execute on function game_private.record_quiz_check(text, boolean) to anon;
grant execute on function game_private.record_card_review(text) to anon;
grant execute on function game_private.practice_questions(text, text, text) to anon;

create or replace function public.create_game_session(p_code text, p_edition text, p_state_code text, p_district_code text)
returns jsonb language sql volatile security invoker set search_path = pg_catalog, game_private
as $$ select game_private.create_session(p_code, p_edition, p_state_code, p_district_code) $$;
create or replace function public.resume_game_session(p_code text)
returns jsonb language sql volatile security invoker set search_path = pg_catalog, game_private
as $$ select game_private.resume_session(p_code) $$;
create or replace function public.record_quiz_check(p_code text, p_knew_answer boolean)
returns jsonb language sql volatile security invoker set search_path = pg_catalog, game_private
as $$ select game_private.record_quiz_check(p_code, p_knew_answer) $$;
create or replace function public.record_card_review(p_code text)
returns jsonb language sql volatile security invoker set search_path = pg_catalog, game_private
as $$ select game_private.record_card_review(p_code) $$;
create or replace function public.get_practice_questions(p_edition text, p_state_code text, p_district_code text)
returns jsonb language sql stable security invoker set search_path = pg_catalog, game_private
as $$ select game_private.practice_questions(p_edition, p_state_code, p_district_code) $$;
revoke all on function public.create_game_session(text, text, text, text) from public, authenticated;
revoke all on function public.resume_game_session(text) from public, authenticated;
revoke all on function public.record_quiz_check(text, boolean) from public, authenticated;
revoke all on function public.record_card_review(text) from public, authenticated;
revoke all on function public.get_practice_questions(text, text, text) from public, authenticated;
grant execute on function public.create_game_session(text, text, text, text) to anon;
grant execute on function public.resume_game_session(text) to anon;
grant execute on function public.record_quiz_check(text, boolean) to anon;
grant execute on function public.record_card_review(text) to anon;
grant execute on function public.get_practice_questions(text, text, text) to anon;

-- pg_cron is an available managed extension in this project. Run a small
-- deletion task hourly; access is denied immediately at 168 elapsed hours.
create extension if not exists pg_cron;
select cron.schedule('citizenship-prep-expired-sessions', '17 * * * *',
  'select game_private.cleanup_expired_sessions()');
