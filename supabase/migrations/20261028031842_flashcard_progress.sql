-- Private, minimal flashcard outcomes and bounded idempotency receipts.
-- A receipt stores only a digest and aggregate counts, never submitted outcomes.

create table game_private.flashcard_progress (
  session_id uuid not null references game_private.sessions(session_id) on delete cascade,
  question_number integer not null check (question_number between 1 and 128),
  correct_count integer not null default 0 check (correct_count between 0 and 100000),
  incorrect_count integer not null default 0 check (incorrect_count between 0 and 100000),
  skipped_count integer not null default 0 check (skipped_count between 0 and 100000),
  last_outcome text not null check (last_outcome in ('correct', 'incorrect', 'skipped')),
  primary key (session_id, question_number)
);
alter table game_private.flashcard_progress enable row level security;
revoke all on game_private.flashcard_progress from public, anon, authenticated;
create policy flashcard_progress_deny_direct_client_access
  on game_private.flashcard_progress for all to anon, authenticated
  using (false) with check (false);

create table game_private.flashcard_round_receipts (
  session_id uuid not null references game_private.sessions(session_id) on delete cascade,
  round_id uuid not null,
  prefix_length integer not null check (prefix_length between 1 and 128),
  prefix_hash bytea not null check (octet_length(prefix_hash) = 32),
  correct_count integer not null check (correct_count between 0 and 128),
  incorrect_count integer not null check (incorrect_count between 0 and 128),
  skipped_count integer not null check (skipped_count between 0 and 128),
  primary key (session_id, round_id),
  check (prefix_length = correct_count + incorrect_count + skipped_count)
);
alter table game_private.flashcard_round_receipts enable row level security;
revoke all on game_private.flashcard_round_receipts from public, anon, authenticated;
create policy flashcard_round_receipts_deny_direct_client_access
  on game_private.flashcard_round_receipts for all to anon, authenticated
  using (false) with check (false);

-- Return only aggregate question outcomes; the session code is a bearer secret
-- and is never returned or stored in the progress projection.
create or replace function game_private.get_flashcard_progress(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_session game_private.sessions;
  v_verifier bytea;
  v_progress jsonb;
begin
  v_verifier := game_private.validate_recovery_code(p_code);
  select s.* into v_session
    from game_private.sessions s
   where s.code_verifier = v_verifier
     and s.last_active_at > clock_timestamp() - interval '168 hours';
  if not found then
    raise exception using errcode = 'P0002', message = 'session unavailable';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'question_number', p.question_number,
      'correct_count', p.correct_count,
      'incorrect_count', p.incorrect_count,
      'skipped_count', p.skipped_count,
      'last_outcome', p.last_outcome
    ) order by p.question_number), '[]'::jsonb)
    into v_progress
    from game_private.flashcard_progress p
   where p.session_id = v_session.session_id;
  return v_progress;
end
$$;

-- p_results is a cumulative submitted prefix. Its prior prefix must remain
-- byte-for-byte equivalent as jsonb; only a validated new suffix is counted.
create or replace function game_private.record_flashcard_round(
  p_code text, p_round_id uuid, p_results jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog
as $$
declare
  v_session game_private.sessions;
  v_verifier bytea;
  v_max_questions integer;
  v_length integer;
  v_old_length integer;
  v_hash bytea;
  v_old_hash bytea;
  v_correct integer;
  v_incorrect integer;
  v_skipped integer;
  v_old_correct integer;
  v_old_incorrect integer;
  v_old_skipped integer;
  v_question integer;
  v_outcome text;
  v_count integer;
  v_progress jsonb;
  v_prefix jsonb;
begin
  v_verifier := game_private.validate_recovery_code(p_code);
  if p_round_id is null or p_results is null then
    raise exception using errcode = '22023', message = 'invalid flashcard round';
  end if;
  if jsonb_typeof(p_results) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid flashcard round';
  end if;
  if jsonb_array_length(p_results) < 1 then
    raise exception using errcode = '22023', message = 'invalid flashcard round';
  end if;

  -- Lock the parent capability row to serialize retries/appends for this
  -- session and ensure expiry is checked at the start of each operation.
  select s.* into v_session
    from game_private.sessions s
   where s.code_verifier = v_verifier
     and s.last_active_at > clock_timestamp() - interval '168 hours'
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'session unavailable';
  end if;
  -- The lock may have waited behind another request. Recheck wall-clock expiry
  -- after acquiring it so a request cannot cross the 168-hour boundary.
  if v_session.last_active_at <= clock_timestamp() - interval '168 hours' then
    raise exception using errcode = 'P0002', message = 'session unavailable';
  end if;
  v_max_questions := case v_session.edition when '2008' then 100 else 128 end;
  v_length := jsonb_array_length(p_results);
  if v_length > v_max_questions then
    raise exception using errcode = '22023', message = 'round exceeds edition question limit';
  end if;

  -- Validate every item and all unique official question numbers before any
  -- activity timestamp or progress is changed.
  if exists (
    select 1
      from jsonb_array_elements(p_results) with ordinality as e(item, ordinal)
     where jsonb_typeof(e.item) <> 'object'
  ) then
    raise exception using errcode = '22023', message = 'invalid flashcard result';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_results) with ordinality as e(item, ordinal)
     where (select count(*) from jsonb_object_keys(e.item)) <> 2
        or not (e.item ? 'question_number')
        or not (e.item ? 'outcome')
        or jsonb_typeof(e.item->'question_number') <> 'number'
        or (e.item->>'question_number') !~ '^[0-9]{1,3}$'
        or jsonb_typeof(e.item->'outcome') <> 'string'
        or e.item->>'outcome' not in ('correct', 'incorrect', 'skipped')
  ) then
    raise exception using errcode = '22023', message = 'invalid flashcard result';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_results) as e(item)
     where (e.item->>'question_number')::integer < 1
        or (e.item->>'question_number')::integer > v_max_questions
  ) then
    raise exception using errcode = '22023', message = 'invalid flashcard question number';
  end if;
  if (select count(distinct (e.item->>'question_number')::integer)
        from jsonb_array_elements(p_results) as e(item)) <> v_length then
    raise exception using errcode = '22023', message = 'duplicate flashcard question';
  end if;

  select count(*) filter (where e.item->>'outcome' = 'correct'),
         count(*) filter (where e.item->>'outcome' = 'incorrect'),
         count(*) filter (where e.item->>'outcome' = 'skipped')
    into v_correct, v_incorrect, v_skipped
    from jsonb_array_elements(p_results) as e(item);
  v_hash := extensions.digest(convert_to(p_results::text, 'UTF8'), 'sha256');

  select r.prefix_length, r.prefix_hash, r.correct_count, r.incorrect_count, r.skipped_count
    into v_old_length, v_old_hash, v_old_correct, v_old_incorrect, v_old_skipped
    from game_private.flashcard_round_receipts r
   where r.session_id = v_session.session_id and r.round_id = p_round_id;
  if found then
    if v_length < v_old_length then
      raise exception using errcode = '22023', message = 'flashcard round prefix cannot shrink';
    end if;
    if v_length = v_old_length then
      if v_hash <> v_old_hash then
        raise exception using errcode = '22023', message = 'flashcard round prefix changed';
      end if;
      -- A duplicate delivery has no side effects, including activity time.
      select coalesce(jsonb_agg(jsonb_build_object(
          'question_number', p.question_number,
          'correct_count', p.correct_count,
          'incorrect_count', p.incorrect_count,
          'skipped_count', p.skipped_count,
          'last_outcome', p.last_outcome
        ) order by p.question_number), '[]'::jsonb)
        into v_progress
        from game_private.flashcard_progress p where p.session_id = v_session.session_id;
      return jsonb_build_object('progress', v_progress, 'round', jsonb_build_object(
        'answered', v_length, 'correct', v_correct, 'incorrect', v_incorrect, 'skipped', v_skipped));
    end if;
    select jsonb_agg(e.item order by e.ordinality)
      into v_prefix
      from jsonb_array_elements(p_results) with ordinality as e(item, ordinality)
     where e.ordinality <= v_old_length;
    if extensions.digest(convert_to(v_prefix::text, 'UTF8'), 'sha256') <> v_old_hash then
      raise exception using errcode = '22023', message = 'flashcard round prefix changed';
    end if;
  else
    if (select count(*) from game_private.flashcard_round_receipts r
         where r.session_id = v_session.session_id) >= 1024 then
      raise exception using errcode = '54000', message = 'flashcard round limit reached';
    end if;
    v_old_length := 0;
    v_old_correct := 0;
    v_old_incorrect := 0;
    v_old_skipped := 0;
  end if;

  -- Check suffix counter limits up front so overflow rejects atomically.
  if exists (
    select 1
      from jsonb_array_elements(p_results) with ordinality as e(item, ordinality)
      left join game_private.flashcard_progress p
        on p.session_id = v_session.session_id
       and p.question_number = (e.item->>'question_number')::integer
     where e.ordinality > v_old_length
       and case e.item->>'outcome'
         when 'correct' then coalesce(p.correct_count, 0) >= 100000
         when 'incorrect' then coalesce(p.incorrect_count, 0) >= 100000
         else coalesce(p.skipped_count, 0) >= 100000
       end
  ) then
    raise exception using errcode = '54000', message = 'flashcard outcome limit reached';
  end if;
  if (select coalesce(sum(p.correct_count + p.incorrect_count + p.skipped_count), 0)
        from game_private.flashcard_progress p
       where p.session_id = v_session.session_id) + (v_length - v_old_length) > 100000 then
    raise exception using errcode = '54000', message = 'session flashcard outcome limit reached';
  end if;

  for v_question, v_outcome in
    select (e.item->>'question_number')::integer, e.item->>'outcome'
      from jsonb_array_elements(p_results) with ordinality as e(item, ordinality)
     where e.ordinality > v_old_length
     order by e.ordinality
  loop
    insert into game_private.flashcard_progress as p (
      session_id, question_number, correct_count, incorrect_count, skipped_count, last_outcome
    ) values (
      v_session.session_id, v_question,
      case when v_outcome = 'correct' then 1 else 0 end,
      case when v_outcome = 'incorrect' then 1 else 0 end,
      case when v_outcome = 'skipped' then 1 else 0 end,
      v_outcome
    ) on conflict (session_id, question_number) do update set
      correct_count = p.correct_count + case when v_outcome = 'correct' then 1 else 0 end,
      incorrect_count = p.incorrect_count + case when v_outcome = 'incorrect' then 1 else 0 end,
      skipped_count = p.skipped_count + case when v_outcome = 'skipped' then 1 else 0 end,
      last_outcome = excluded.last_outcome;
  end loop;

  if v_old_length = 0 then
    insert into game_private.flashcard_round_receipts(
      session_id, round_id, prefix_length, prefix_hash, correct_count, incorrect_count, skipped_count
    ) values (
      v_session.session_id, p_round_id, v_length, v_hash, v_correct, v_incorrect, v_skipped
    );
  else
    update game_private.flashcard_round_receipts set
      prefix_length = v_length,
      prefix_hash = v_hash,
      correct_count = v_correct,
      incorrect_count = v_incorrect,
      skipped_count = v_skipped
     where session_id = v_session.session_id and round_id = p_round_id;
  end if;
  update game_private.sessions set last_active_at = clock_timestamp()
   where session_id = v_session.session_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'question_number', p.question_number,
      'correct_count', p.correct_count,
      'incorrect_count', p.incorrect_count,
      'skipped_count', p.skipped_count,
      'last_outcome', p.last_outcome
    ) order by p.question_number), '[]'::jsonb)
    into v_progress
    from game_private.flashcard_progress p where p.session_id = v_session.session_id;
  return jsonb_build_object('progress', v_progress, 'round', jsonb_build_object(
    'answered', v_length, 'correct', v_correct, 'incorrect', v_incorrect, 'skipped', v_skipped));
end
$$;

-- Preserve the existing safe allowlist, adding only official subsection topic.
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
      'question_number', q.question_number, 'question_text', q.question_text, 'section', q.section, 'subsection', q.subsection,
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
      'question_number', q.question_number, 'question_text', q.question_text, 'section', q.section, 'subsection', q.subsection,
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

revoke all on function game_private.get_flashcard_progress(text) from public, anon, authenticated;
revoke all on function game_private.record_flashcard_round(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function game_private.get_flashcard_progress(text) to anon;
grant execute on function game_private.record_flashcard_round(text, uuid, jsonb) to anon;
grant execute on function game_private.practice_questions(text, text, text) to anon;

create or replace function public.get_flashcard_progress(p_code text)
returns jsonb language sql volatile security invoker set search_path = pg_catalog, game_private
as $$ select game_private.get_flashcard_progress(p_code) $$;
create or replace function public.record_flashcard_round(p_code text, p_round_id uuid, p_results jsonb)
returns jsonb language sql volatile security invoker set search_path = pg_catalog, game_private
as $$ select game_private.record_flashcard_round(p_code, p_round_id, p_results) $$;
revoke all on function public.get_flashcard_progress(text) from public, authenticated;
revoke all on function public.record_flashcard_round(text, uuid, jsonb) from public, authenticated;
grant execute on function public.get_flashcard_progress(text) to anon;
grant execute on function public.record_flashcard_round(text, uuid, jsonb) to anon;
