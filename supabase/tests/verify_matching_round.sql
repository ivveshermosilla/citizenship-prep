-- Match & Learn isolation, validation, caps, idempotency and expiry. This
-- verifier uses synthetic sessions only and rolls every change back.
begin;
create temporary table matching_test_codes(code_a text, code_b text, code_expired text) on commit drop;
insert into matching_test_codes values (
  translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_'),
  translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_'),
  translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_')
);
grant select on matching_test_codes to anon;

-- Aggregate counters continue to equal the sum of all private learning-mode
-- counters, including written and matching outcomes.
do $$
begin
  if exists(
    select 1
      from game_private.flashcard_progress f
      full join (
        select session_id, question_number,
               sum(correct_count)::integer as correct_count,
               sum(incorrect_count)::integer as incorrect_count,
               sum(skipped_count)::integer as skipped_count
          from game_private.learning_mode_progress
         group by session_id, question_number
      ) m using (session_id, question_number)
     where coalesce(f.correct_count, 0) <> coalesce(m.correct_count, 0)
        or coalesce(f.incorrect_count, 0) <> coalesce(m.incorrect_count, 0)
        or coalesce(f.skipped_count, 0) <> coalesce(m.skipped_count, 0)
  ) then raise exception 'aggregate outcomes do not equal the sum of all private learning modes'; end if;
end $$;

-- A pre-existing multiple-choice result remains in the legacy projection and
-- does not appear in the new matching projection.
set local role anon;
do $$
declare a text; b text; expired text; prior jsonb; result jsonb; progress jsonb;
  mc_id uuid := '4d70b771-9271-48e3-a7e0-f3c205827da1';
  matching_id uuid := 'ff154f32-07d3-4fd5-a8b2-a13e3d9e2b77';
begin
  select code_a, code_b, code_expired into a, b, expired from matching_test_codes;
  perform public.create_game_session(a, '2025', 'UT', 'UT03');
  perform public.create_game_session(b, '2008', 'AS', null);
  perform public.create_game_session(expired, '2025', 'UT', 'UT03');
  prior := public.record_flashcard_round(a, mc_id, '[{"question_number":1,"outcome":"correct"}]');
  result := public.record_matching_round(a, matching_id,
    '[{"question_number":1,"outcome":"incorrect"},{"question_number":2,"outcome":"skipped"}]');
  if result->'round' <> '{"answered":2,"correct":0,"incorrect":1,"skipped":1}'::jsonb then
    raise exception 'matching round outcome totals incorrect'; end if;
  if result->'learning'->'matching'->0->>'incorrect_count' <> '1'
     or result->'learning'->'matching'->1->>'skipped_count' <> '1'
     or result->'learning'->'multiple_choice' <> prior->'progress'
     or result->'learning'->'written' <> '[]'::jsonb then
    raise exception 'matching outcome mode separation failed'; end if;
  if result->'learning'->'progress'->0->>'correct_count' <> '1'
     or result->'learning'->'progress'->0->>'incorrect_count' <> '1' then
    raise exception 'matching did not update aggregate history'; end if;
  if public.get_flashcard_progress(a) <> prior->'progress' then
    raise exception 'matching outcome leaked into legacy multiple-choice progress'; end if;

  -- Exact retry does not increment counts; reordered/changed payloads are not
  -- accepted as retries.
  progress := public.get_learning_progress(a);
  result := public.record_matching_round(a, matching_id,
    '[{"question_number":1,"outcome":"incorrect"},{"question_number":2,"outcome":"skipped"}]');
  if result->'learning' <> progress then raise exception 'matching retry incremented progress'; end if;
  begin perform public.record_matching_round(a, matching_id,
    '[{"question_number":2,"outcome":"skipped"},{"question_number":1,"outcome":"incorrect"}]');
    raise exception using errcode='P0001', message='reordered matching payload accepted';
  exception when sqlstate '22023' then null; end;
  begin perform public.record_matching_round(a, matching_id,
    '[{"question_number":1,"outcome":"correct"},{"question_number":2,"outcome":"skipped"}]');
    raise exception using errcode='P0001', message='changed matching payload accepted';
  exception when sqlstate '22023' then null; end;
  begin perform public.record_matching_round(a, mc_id, '[{"question_number":3,"outcome":"correct"}]');
    raise exception using errcode='P0001', message='cross-mode UUID reuse accepted';
  exception when sqlstate '22023' then null; end;

  -- Validation rejects null, wrong shape, extra keys, duplicate questions,
  -- invalid outcomes, out-of-edition numbers, and the six-item boundary.
  begin perform public.record_matching_round(a, gen_random_uuid(), null);
    raise exception using errcode='P0001', message='null payload accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_matching_round(a, gen_random_uuid(), '[null]');
    raise exception using errcode='P0001', message='null item accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_matching_round(a, gen_random_uuid(), '[{"question_number":3,"outcome":"correct","text":"secret"}]');
    raise exception using errcode='P0001', message='extra result key accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_matching_round(a, gen_random_uuid(), '[{"question_number":3,"outcome":"maybe"}]');
    raise exception using errcode='P0001', message='unknown outcome accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_matching_round(a, gen_random_uuid(), '[{"question_number":3,"outcome":"correct"},{"question_number":3,"outcome":"skipped"}]');
    raise exception using errcode='P0001', message='duplicate question accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_matching_round(b, gen_random_uuid(), '[{"question_number":101,"outcome":"correct"}]');
    raise exception using errcode='P0001', message='2008 edition accepted question 101'; exception when sqlstate '22023' then null; end;
  begin perform public.record_matching_round(a, gen_random_uuid(), '[{"question_number":3,"outcome":"correct"},{"question_number":4,"outcome":"correct"},{"question_number":5,"outcome":"correct"},{"question_number":6,"outcome":"correct"},{"question_number":7,"outcome":"correct"},{"question_number":8,"outcome":"correct"}]');
    raise exception using errcode='P0001', message='six outcomes accepted'; exception when sqlstate '22023' then null; end;

  if public.get_learning_progress(b) <> '{"progress":[],"multiple_choice":[],"written":[],"matching":[]}'::jsonb then
    raise exception 'matching progress crossed session boundary or 2008 session was not empty'; end if;
  begin perform count(*) from game_private.flashcard_round_receipts;
    raise exception using errcode='P0001',message='direct receipt access succeeded'; exception when insufficient_privilege then null; end;
  begin perform count(*) from game_private.learning_mode_progress;
    raise exception using errcode='P0001',message='direct mode-progress access succeeded'; exception when insufficient_privilege then null; end;
  if not has_function_privilege('anon','public.record_matching_round(text,uuid,jsonb)','execute')
     or has_function_privilege('authenticated','public.record_matching_round(text,uuid,jsonb)','execute')
     or has_function_privilege('anon','game_private.apply_learning_outcome(uuid,text,integer,text)','execute')
     or has_table_privilege('anon','game_private.flashcard_round_receipts','select') then
    raise exception 'matching RPC grants or private access are incorrect'; end if;
end $$;
reset role;

-- Privileged fixture updates let the test hit hard limits without creating a
-- large amount of progress through public calls.
do $$
declare a text; expired text; code_hash bytea; sid uuid;
begin
  select code_a, code_expired into a, expired from matching_test_codes;
  code_hash := extensions.digest(convert_to(a,'UTF8'),'sha256');
  select session_id into sid from game_private.sessions where code_verifier=code_hash;
  update game_private.flashcard_progress set correct_count=0, incorrect_count=0, skipped_count=0
   where session_id=sid;
  update game_private.flashcard_progress set correct_count=99999 where session_id=sid and question_number=1;
  update game_private.learning_mode_progress set correct_count=100000
   where session_id=sid and mode='matching' and question_number=1;
  begin perform game_private.apply_learning_outcome(sid,'matching',1,'correct');
    raise exception using errcode='P0001',message='per-question cap ignored'; exception when sqlstate '54000' then null; end;
  update game_private.flashcard_progress set correct_count=100000 where session_id=sid and question_number=1;
  begin perform game_private.record_matching_round(a,gen_random_uuid(),'[{"question_number":9,"outcome":"correct"}]');
    raise exception using errcode='P0001',message='aggregate cap ignored'; exception when sqlstate '54000' then null; end;
  update game_private.flashcard_progress set correct_count=1 where session_id=sid and question_number=1;
  insert into game_private.flashcard_round_receipts(session_id,round_id,prefix_length,prefix_hash,correct_count,incorrect_count,skipped_count,mode)
    select sid, gen_random_uuid(), 1, extensions.digest(convert_to(g::text,'UTF8'),'sha256'), 1, 0, 0, 'matching'
      from generate_series(1,1022) g;
  if (select count(*) from game_private.flashcard_round_receipts where session_id=sid) <> 1024 then
    raise exception 'receipt fixture did not reach cap'; end if;
  begin perform game_private.record_matching_round(a,gen_random_uuid(),'[{"question_number":9,"outcome":"correct"}]');
    raise exception using errcode='P0001',message='receipt cap ignored'; exception when sqlstate '54000' then null; end;
  select session_id into sid from game_private.sessions where code_verifier=extensions.digest(convert_to(expired,'UTF8'),'sha256');
  update game_private.sessions set last_active_at=clock_timestamp()-interval '168 hours' where session_id=sid;
end $$;
set local role anon;
do $$
declare c text;
begin
  select code_expired into c from matching_test_codes;
  begin perform public.record_matching_round(c,gen_random_uuid(),'[{"question_number":1,"outcome":"correct"}]');
    raise exception using errcode='P0001',message='expired session accepted'; exception when sqlstate 'P0002' then null; end;
end $$;
reset role;

-- Parent deletion cascades to receipts and all mode progress, including the
-- new matching mode.
do $$
declare a text; sid uuid;
begin
  select code_a into a from matching_test_codes;
  select session_id into sid from game_private.sessions where code_verifier=extensions.digest(convert_to(a,'UTF8'),'sha256');
  delete from game_private.sessions where session_id=sid;
  if exists(select 1 from game_private.flashcard_round_receipts where session_id=sid)
     or exists(select 1 from game_private.learning_mode_progress where session_id=sid)
     or exists(select 1 from game_private.flashcard_progress where session_id=sid) then
    raise exception 'session cleanup did not cascade matching data'; end if;
end $$;
rollback;
