-- Flashcard RPC security, validation, idempotency, expiry, isolation, and
-- cascading cleanup. Run only after the flashcard migration. Synthetic session
-- codes and rows are transaction-local and this script always rolls back.
begin;
create temporary table flashcard_test_codes(code_a text, code_b text, code_expired text, before_retry timestamptz) on commit drop;
insert into flashcard_test_codes(code_a, code_b, code_expired) values (
  translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_'),
  translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_'),
  translate(rtrim(encode(extensions.gen_random_bytes(32), 'base64'), '='), '+/', '-_')
);
grant select on flashcard_test_codes to anon;

set local role anon;
do $$
declare
  a text; b text; expired_code text;
  result jsonb; progress jsonb; rid uuid := '7d8cc560-420b-4d52-8c7f-3f8eea282bd9';
begin
  select code_a, code_b, code_expired into a, b, expired_code from flashcard_test_codes;
  perform public.create_game_session(a, '2025', 'UT', 'UT03');
  perform public.create_game_session(b, '2008', 'AS', null);
  perform public.create_game_session(expired_code, '2025', 'UT', 'UT03');

  progress := public.get_flashcard_progress(a);
  if progress <> '[]'::jsonb then raise exception 'new session progress was not empty'; end if;
  result := public.record_flashcard_round(a, rid, '[{"question_number":1,"outcome":"correct"},{"question_number":2,"outcome":"skipped"}]');
  if result->'round' <> '{"answered":2,"correct":1,"incorrect":0,"skipped":1}'::jsonb then raise exception 'initial round totals incorrect'; end if;
  result := public.record_flashcard_round(a, rid, '[{"question_number":1,"outcome":"correct"},{"question_number":2,"outcome":"skipped"}]');
  if result->'progress'->0->>'correct_count' <> '1' or result->'progress'->1->>'skipped_count' <> '1' then raise exception 'identical retry double counted'; end if;
  result := public.record_flashcard_round(a, rid, '[{"question_number":1,"outcome":"correct"},{"question_number":2,"outcome":"skipped"},{"question_number":3,"outcome":"incorrect"}]');
  if result->'round' <> '{"answered":3,"correct":1,"incorrect":1,"skipped":1}'::jsonb then raise exception 'suffix append totals incorrect'; end if;
  progress := public.get_flashcard_progress(a);
  if jsonb_array_length(progress) <> 3 or progress->2->>'incorrect_count' <> '1' or progress->2->>'last_outcome' <> 'incorrect'
     or (select count(*) from jsonb_object_keys(progress->0)) <> 5
     or progress->0 ? 'session_id' or progress->0 ? 'code_verifier' then
    raise exception 'progress projection incorrect';
  end if;
  if public.get_flashcard_progress(b) <> '[]'::jsonb then raise exception 'session isolation failed'; end if;

  -- Rejections must cover malformed keys/types, bounds, duplicates, changed or
  -- shortened prefixes, and invalid/NULL round identifiers.
  begin perform public.record_flashcard_round(a, rid, '[{"question_number":4,"outcome":"correct","answer":"secret"}]'); raise exception using errcode = 'P0001', message = 'extra key accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_flashcard_round(a, rid, '[{"question_number":"4","outcome":"correct"}]'); raise exception using errcode = 'P0001', message = 'string question accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_flashcard_round(a, rid, '[{"question_number":4.5,"outcome":"correct"}]'); raise exception using errcode = 'P0001', message = 'fractional question accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_flashcard_round(a, rid, '[{"question_number":4,"outcome":"maybe"}]'); raise exception using errcode = 'P0001', message = 'unknown outcome accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_flashcard_round(a, rid, 'null'::jsonb); raise exception using errcode = 'P0001', message = 'JSON null payload accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_flashcard_round(a, rid, '[]'::jsonb); raise exception using errcode = 'P0001', message = 'empty prefix accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_flashcard_round(a, rid, '{"question_number":4,"outcome":"correct"}'::jsonb); raise exception using errcode = 'P0001', message = 'object payload accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_flashcard_round(a, rid, '[null]'::jsonb); raise exception using errcode = 'P0001', message = 'null result item accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_flashcard_round(a, rid, '[{"question_number":null,"outcome":"correct"}]'); raise exception using errcode = 'P0001', message = 'null question number accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_flashcard_round(a, rid, '[{"question_number":4,"outcome":null}]'); raise exception using errcode = 'P0001', message = 'null outcome accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_flashcard_round(a, rid, '[{"question_number":4,"outcome":"correct"},{"question_number":4,"outcome":"skipped"}]'); raise exception using errcode = 'P0001', message = 'duplicate question accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_flashcard_round(a, rid, '[{"question_number":129,"outcome":"correct"}]'); raise exception using errcode = 'P0001', message = 'out-of-edition question accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_flashcard_round(a, rid, '[{"question_number":1,"outcome":"incorrect"}]'); raise exception using errcode = 'P0001', message = 'changed prefix accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_flashcard_round(a, rid, '[{"question_number":1,"outcome":"correct"}]'); raise exception using errcode = 'P0001', message = 'shrunk prefix accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_flashcard_round(a, null, '[{"question_number":4,"outcome":"correct"}]'); raise exception using errcode = 'P0001', message = 'NULL round id accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.get_flashcard_progress(repeat('Z',43)); raise exception using errcode = 'P0001', message = 'unknown code progress returned'; exception when sqlstate 'P0002' then null; end;

  begin perform count(*) from game_private.flashcard_progress; raise exception using errcode = 'P0001', message = 'direct progress access accepted'; exception when insufficient_privilege then null; end;
  begin perform count(*) from game_private.flashcard_round_receipts; raise exception using errcode = 'P0001', message = 'direct receipt access accepted'; exception when insufficient_privilege then null; end;
  if not has_function_privilege('anon', 'public.get_flashcard_progress(text)', 'execute') or
     not has_function_privilege('anon', 'public.record_flashcard_round(text,uuid,jsonb)', 'execute') or
     has_function_privilege('authenticated', 'public.record_flashcard_round(text,uuid,jsonb)', 'execute') then
    raise exception 'flashcard wrapper grants are incorrect';
  end if;
  if not has_function_privilege('anon', 'game_private.record_flashcard_round(text,uuid,jsonb)', 'execute') or
     has_function_privilege('anon', 'game_private.validate_recovery_code(text)', 'execute') or
     has_table_privilege('anon', 'game_private.flashcard_progress', 'select') or
     has_table_privilege('anon', 'game_private.flashcard_round_receipts', 'select') or
     to_regclass('public.flashcard_progress') is not null or
     to_regclass('public.flashcard_round_receipts') is not null then
    raise exception 'private helper or table exposure is incorrect';
  end if;
  begin perform game_private.validate_recovery_code(repeat('A',43)); raise exception using errcode = 'P0001', message = 'unguarded helper callable directly'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Save activity time and mark only the generated expiry probe as expired.
do $$
declare c text; e text; h bytea; eh bytea; sid uuid; sid_expired uuid;
begin
  select code_a, code_expired into c, e from flashcard_test_codes;
  h := extensions.digest(convert_to(c, 'UTF8'), 'sha256');
  eh := extensions.digest(convert_to(e, 'UTF8'), 'sha256');
  select session_id into sid from game_private.sessions where code_verifier = h;
  select session_id into sid_expired from game_private.sessions where code_verifier = eh;
  if not exists(select 1 from game_private.flashcard_progress where session_id = sid) or
     not exists(select 1 from game_private.flashcard_round_receipts where session_id = sid) then
    raise exception 'expected private progress and receipt missing';
  end if;
  update flashcard_test_codes set before_retry = (select last_active_at from game_private.sessions where session_id = sid);
  update game_private.sessions set last_active_at = clock_timestamp() - interval '168 hours' where session_id = sid_expired;
  insert into game_private.flashcard_progress(session_id, question_number, correct_count, incorrect_count, skipped_count, last_outcome)
  values (sid, 4, 100000, 0, 0, 'correct');
  insert into game_private.flashcard_round_receipts(
    session_id, round_id, prefix_length, prefix_hash, correct_count, incorrect_count, skipped_count
  ) select (select session_id from game_private.sessions where code_verifier = extensions.digest(convert_to((select code_b from flashcard_test_codes),'UTF8'),'sha256')),
           gen_random_uuid(), 1, extensions.digest(convert_to('test-receipt','UTF8'),'sha256'), 1, 0, 0
      from generate_series(1, 1024);
end $$;
reset role;

-- Call exact retry and expiry failures under anon, then inspect the isolated
-- synthetic rows as the migration owner and remove just those parents.
set local role anon;
do $$
declare a text; b text; expired_code text; rid uuid := '7d8cc560-420b-4d52-8c7f-3f8eea282bd9'; result jsonb;
begin
  select code_a, code_b, code_expired into a, b, expired_code from flashcard_test_codes;
  result := public.record_flashcard_round(a, rid, '[{"question_number":1,"outcome":"correct"},{"question_number":2,"outcome":"skipped"},{"question_number":3,"outcome":"incorrect"}]');
  if result->'progress'->0->>'correct_count' <> '1' then raise exception 'repeated full prefix changed count'; end if;
  begin perform public.get_flashcard_progress(expired_code); raise exception using errcode = 'P0001', message = 'expired read accepted'; exception when sqlstate 'P0002' then null; end;
  begin perform public.record_flashcard_round(expired_code, rid, '[{"question_number":4,"outcome":"correct"}]'); raise exception using errcode = 'P0001', message = 'expired write accepted'; exception when sqlstate 'P0002' then null; end;
  begin perform public.record_flashcard_round(a, rid, '[{"question_number":1,"outcome":"correct"},{"question_number":2,"outcome":"skipped"},{"question_number":3,"outcome":"incorrect"},{"question_number":4,"outcome":"correct"}]'); raise exception using errcode = 'P0001', message = 'per-question counter limit exceeded'; exception when sqlstate '54000' then null; end;
  begin perform public.record_flashcard_round(a, '08bf7992-609e-47a0-b7bd-5587a9db5969', '[{"question_number":5,"outcome":"correct"}]'); raise exception using errcode = 'P0001', message = 'session outcome limit exceeded'; exception when sqlstate '54000' then null; end;
  begin perform public.record_flashcard_round(b, '08bf7992-609e-47a0-b7bd-5587a9db5970', '[{"question_number":1,"outcome":"correct"}]'); raise exception using errcode = 'P0001', message = 'receipt limit exceeded'; exception when sqlstate '54000' then null; end;
end $$;
reset role;

do $$
declare a text; b text; e text; ha bytea; hb bytea; he bytea; sid_a uuid; sid_b uuid; sid_e uuid;
begin
  select code_a, code_b, code_expired into a, b, e from flashcard_test_codes;
  ha := extensions.digest(convert_to(a,'UTF8'),'sha256');
  hb := extensions.digest(convert_to(b,'UTF8'),'sha256');
  he := extensions.digest(convert_to(e,'UTF8'),'sha256');
  select session_id into sid_a from game_private.sessions where code_verifier=ha;
  select session_id into sid_b from game_private.sessions where code_verifier=hb;
  select session_id into sid_e from game_private.sessions where code_verifier=he;
  if (select last_active_at from game_private.sessions where session_id=sid_a) <> (select before_retry from flashcard_test_codes) then raise exception 'identical retry refreshed activity'; end if;
  -- Simulate the parent cleanup effect for this synthetic row; FK cascade is
  -- tested without invoking global cleanup over any unrelated session.
  delete from game_private.sessions where session_id in (sid_a,sid_b,sid_e);
  if exists(select 1 from game_private.flashcard_progress where session_id in (sid_a,sid_b,sid_e)) or
     exists(select 1 from game_private.flashcard_round_receipts where session_id in (sid_a,sid_b,sid_e)) then
    raise exception 'parent deletion did not cascade';
  end if;
end $$;
rollback;
