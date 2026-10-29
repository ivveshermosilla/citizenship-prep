-- Match & Learn outcomes share the private, bounded receipt and aggregate
-- progress structures. Receipts retain only a digest and totals.

alter table game_private.flashcard_round_receipts
  drop constraint if exists flashcard_round_receipts_mode_check;
alter table game_private.flashcard_round_receipts
  add constraint flashcard_round_receipts_mode_check
  check (mode in ('multiple_choice', 'written', 'matching'));

alter table game_private.learning_mode_progress
  drop constraint if exists learning_mode_progress_mode_check;
alter table game_private.learning_mode_progress
  add constraint learning_mode_progress_mode_check
  check (mode in ('multiple_choice', 'written', 'matching'));

create or replace function game_private.learning_projection(p_session_id uuid)
returns jsonb language sql stable security invoker set search_path = pg_catalog, game_private
as $$
  select jsonb_build_object(
    'progress', game_private.progress_array(p_session_id),
    'multiple_choice', game_private.mode_progress_array(p_session_id, 'multiple_choice'),
    'written', game_private.mode_progress_array(p_session_id, 'written'),
    'matching', game_private.mode_progress_array(p_session_id, 'matching')
  )
$$;
revoke all on function game_private.learning_projection(uuid) from public, anon, authenticated;

create or replace function game_private.apply_learning_outcome(
  p_session_id uuid, p_mode text, p_question_number integer, p_outcome text
)
returns void language plpgsql volatile security invoker set search_path = pg_catalog, game_private
as $$
declare v_aggregate_total bigint; v_mode_count integer;
begin
  if p_mode not in ('multiple_choice', 'written', 'matching') or p_outcome not in ('correct', 'incorrect', 'skipped')
     or p_question_number < 1 or p_question_number > 128 then
    raise exception using errcode = '22023', message = 'invalid learning outcome';
  end if;
  select coalesce(sum(correct_count::bigint + incorrect_count::bigint + skipped_count::bigint), 0)
    into v_aggregate_total from game_private.flashcard_progress where session_id = p_session_id;
  if v_aggregate_total >= 100000 then
    raise exception using errcode = '54000', message = 'session learning outcome limit reached';
  end if;
  select case p_outcome when 'correct' then correct_count when 'incorrect' then incorrect_count else skipped_count end
    into v_mode_count from game_private.learning_mode_progress
   where session_id = p_session_id and mode = p_mode and question_number = p_question_number;
  if coalesce(v_mode_count, 0) >= 100000 then
    raise exception using errcode = '54000', message = 'question learning outcome limit reached';
  end if;

  insert into game_private.flashcard_progress as a(
    session_id, question_number, correct_count, incorrect_count, skipped_count, last_outcome
  ) values (
    p_session_id, p_question_number,
    case when p_outcome = 'correct' then 1 else 0 end,
    case when p_outcome = 'incorrect' then 1 else 0 end,
    case when p_outcome = 'skipped' then 1 else 0 end,
    p_outcome
  ) on conflict (session_id, question_number) do update set
    correct_count = a.correct_count + case when p_outcome = 'correct' then 1 else 0 end,
    incorrect_count = a.incorrect_count + case when p_outcome = 'incorrect' then 1 else 0 end,
    skipped_count = a.skipped_count + case when p_outcome = 'skipped' then 1 else 0 end,
    last_outcome = excluded.last_outcome;

  insert into game_private.learning_mode_progress as m(
    session_id, mode, question_number, correct_count, incorrect_count, skipped_count, last_outcome
  ) values (
    p_session_id, p_mode, p_question_number,
    case when p_outcome = 'correct' then 1 else 0 end,
    case when p_outcome = 'incorrect' then 1 else 0 end,
    case when p_outcome = 'skipped' then 1 else 0 end,
    p_outcome
  ) on conflict (session_id, mode, question_number) do update set
    correct_count = m.correct_count + case when p_outcome = 'correct' then 1 else 0 end,
    incorrect_count = m.incorrect_count + case when p_outcome = 'incorrect' then 1 else 0 end,
    skipped_count = m.skipped_count + case when p_outcome = 'skipped' then 1 else 0 end,
    last_outcome = excluded.last_outcome;
end
$$;
revoke all on function game_private.apply_learning_outcome(uuid, text, integer, text) from public, anon, authenticated;

create or replace function game_private.record_matching_round(p_code text, p_round_id uuid, p_results jsonb)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_session game_private.sessions;
  v_verifier bytea;
  v_max_questions integer;
  v_length integer;
  v_hash bytea;
  v_old_hash bytea;
  v_old_length integer;
  v_mode text;
  v_correct integer;
  v_incorrect integer;
  v_skipped integer;
  v_question integer;
  v_outcome text;
begin
  v_verifier := game_private.validate_recovery_code(p_code);
  if p_round_id is null or p_results is null or jsonb_typeof(p_results) <> 'array'
     or jsonb_array_length(p_results) not between 1 and 5 then
    raise exception using errcode = '22023', message = 'invalid matching round';
  end if;

  if exists(select 1 from jsonb_array_elements(p_results) e(item) where jsonb_typeof(e.item) <> 'object')
     or exists(select 1 from jsonb_array_elements(p_results) e(item)
       where (select count(*) from jsonb_object_keys(e.item)) <> 2
          or not (e.item ? 'question_number') or not (e.item ? 'outcome')
          or jsonb_typeof(e.item->'question_number') <> 'number'
          or (e.item->>'question_number') !~ '^[0-9]{1,3}$'
          or jsonb_typeof(e.item->'outcome') <> 'string'
          or e.item->>'outcome' not in ('correct', 'incorrect', 'skipped')) then
    raise exception using errcode = '22023', message = 'invalid matching result';
  end if;

  select s.* into v_session from game_private.sessions s
   where s.code_verifier = v_verifier
     and s.last_active_at > clock_timestamp() - interval '168 hours'
   for update;
  if not found then raise exception using errcode = 'P0002', message = 'session unavailable'; end if;
  if v_session.last_active_at <= clock_timestamp() - interval '168 hours' then
    raise exception using errcode = 'P0002', message = 'session unavailable';
  end if;

  v_max_questions := case v_session.edition when '2008' then 100 else 128 end;
  v_length := jsonb_array_length(p_results);
  if exists(select 1 from jsonb_array_elements(p_results) e(item)
       where (e.item->>'question_number')::integer < 1 or (e.item->>'question_number')::integer > v_max_questions)
     or (select count(distinct (e.item->>'question_number')::integer)
           from jsonb_array_elements(p_results) e(item)) <> v_length then
    raise exception using errcode = '22023', message = 'invalid or duplicate matching question';
  end if;

  select count(*) filter (where item->>'outcome' = 'correct'),
         count(*) filter (where item->>'outcome' = 'incorrect'),
         count(*) filter (where item->>'outcome' = 'skipped')
    into v_correct, v_incorrect, v_skipped
    from jsonb_array_elements(p_results) e(item);
  v_hash := extensions.digest(convert_to(p_results::text, 'UTF8'), 'sha256');

  select mode, prefix_hash, prefix_length into v_mode, v_old_hash, v_old_length
    from game_private.flashcard_round_receipts
   where session_id = v_session.session_id and round_id = p_round_id;
  if found then
    if v_mode <> 'matching' then
      raise exception using errcode = '22023', message = 'attempt UUID already used in another mode';
    end if;
    if v_length <> v_old_length or v_hash <> v_old_hash then
      raise exception using errcode = '22023', message = 'matching round payload changed';
    end if;
    return jsonb_build_object(
      'learning', game_private.learning_projection(v_session.session_id),
      'round', jsonb_build_object('answered', v_length, 'correct', v_correct, 'incorrect', v_incorrect, 'skipped', v_skipped)
    );
  end if;

  if (select count(*) from game_private.flashcard_round_receipts where session_id = v_session.session_id) >= 1024 then
    raise exception using errcode = '54000', message = 'learning attempt limit reached';
  end if;
  if exists(select 1 from jsonb_array_elements(p_results) e(item)
      left join game_private.learning_mode_progress p
        on p.session_id = v_session.session_id and p.mode = 'matching'
       and p.question_number = (e.item->>'question_number')::integer
      where case e.item->>'outcome'
        when 'correct' then coalesce(p.correct_count, 0) >= 100000
        when 'incorrect' then coalesce(p.incorrect_count, 0) >= 100000
        else coalesce(p.skipped_count, 0) >= 100000 end) then
    raise exception using errcode = '54000', message = 'question learning outcome limit reached';
  end if;
  if (select coalesce(sum(correct_count::bigint + incorrect_count::bigint + skipped_count::bigint), 0)
        from game_private.flashcard_progress where session_id = v_session.session_id) + v_length > 100000 then
    raise exception using errcode = '54000', message = 'session learning outcome limit reached';
  end if;

  for v_question, v_outcome in
    select (item->>'question_number')::integer, item->>'outcome'
      from jsonb_array_elements(p_results) e(item)
     order by (item->>'question_number')::integer
  loop
    perform game_private.apply_learning_outcome(v_session.session_id, 'matching', v_question, v_outcome);
  end loop;

  insert into game_private.flashcard_round_receipts(
    session_id, round_id, prefix_length, prefix_hash, correct_count, incorrect_count, skipped_count, mode
  ) values (v_session.session_id, p_round_id, v_length, v_hash, v_correct, v_incorrect, v_skipped, 'matching');
  update game_private.sessions set last_active_at = clock_timestamp() where session_id = v_session.session_id;

  return jsonb_build_object(
    'learning', game_private.learning_projection(v_session.session_id),
    'round', jsonb_build_object('answered', v_length, 'correct', v_correct, 'incorrect', v_incorrect, 'skipped', v_skipped)
  );
end
$$;
revoke all on function game_private.record_matching_round(text, uuid, jsonb) from public, anon, authenticated;
grant execute on function game_private.record_matching_round(text, uuid, jsonb) to anon;

create or replace function public.record_matching_round(p_code text, p_round_id uuid, p_results jsonb)
returns jsonb language sql volatile security invoker set search_path = pg_catalog, game_private
as $$ select game_private.record_matching_round(p_code, p_round_id, p_results) $$;
revoke all on function public.record_matching_round(text, uuid, jsonb) from public, authenticated;
grant execute on function public.record_matching_round(text, uuid, jsonb) to anon;
