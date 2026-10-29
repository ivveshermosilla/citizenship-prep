-- Written/multiple-choice progress isolation, compatibility, UUID idempotency,
-- expiry, grants and cascade cleanup. Synthetic sessions only; transaction rolls back.
begin;
create temporary table qq_test_codes(code_a text, code_b text, code_expired text) on commit drop;
insert into qq_test_codes values (
  translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_'),
  translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_'),
  translate(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+/','-_')
);
grant select on qq_test_codes to anon;

-- Pure resolver checks: exact current-derived aliases, name components,
-- compound surnames, party suffixes, and complete multi-concept matching.
do $$
declare shape record; groups jsonb := '[{"key":"senate","display":"Senate","aliases":[]},{"key":"house","display":"House of Representatives","aliases":["House"]}]';
begin
  select * into shape from game_private.current_person_shape('John R. Curtis');
  if shape.base_key <> 'johncurtis' or shape.surname_key <> 'curtis'
     or not ('curtis' = any(game_private.learning_alias_keys('John R. Curtis','person_name')))
     or not ('johncurtis' = any(game_private.learning_alias_keys('John R. Curtis','person_name'))) then
    raise exception 'current person surname/middle-initial aliases failed';
  end if;
  select * into shape from game_private.current_person_shape('JD Vance');
  if not ('J. D. Vance' = any(shape.aliases)) then raise exception 'two-letter given-name initials alias failed'; end if;
  select * into shape from game_private.current_person_shape('District of Columbia has no U.S. senators.');
  if not ('No U.S. senators' = any(shape.aliases) and 'No senators' = any(shape.aliases)) then
    raise exception 'current senator absence aliases failed'; end if;
  select * into shape from game_private.current_person_shape('D.C. does not have a governor.');
  if not ('No governor' = any(shape.aliases)) then raise exception 'current governor absence alias failed'; end if;
  select * into shape from game_private.current_person_shape('District of Columbia has no voting representative in Congress.');
  if not ('No voting representative in Congress' = any(shape.aliases)
      and 'No voting representative' = any(shape.aliases)) then raise exception 'current representative absence aliases failed'; end if;
  if game_private.is_officeholder_name('American Samoa has no U.S. senators.')
     or game_private.is_officeholder_name('D.C. does not have a governor.')
     or game_private.is_officeholder_name('District of Columbia has no voting representative in Congress.')
     or not game_private.is_officeholder_name('Eleanor Holmes Norton') then
    raise exception 'officeholder candidate filter failed'; end if;
  if not ('Washington DC' = any(game_private.current_official_variant_aliases('Washington, D.C.')))
     or not ('Washington D.C.' = any(game_private.current_official_variant_aliases('Washington, D.C.'))) then
    raise exception 'current capital typographic aliases failed'; end if;
  select * into shape from game_private.current_person_shape('Juan de la Cruz');
  if shape.base_key <> 'juandelacruz' or shape.surname_key <> 'delacruz' then raise exception 'compound surname grouping failed'; end if;
  if not (game_private.learning_alias_keys('Republican (Party)','political_party') && game_private.learning_alias_keys('Republican','political_party')) then
    raise exception 'political-party suffix alias failed';
  end if;
  if game_private.learning_alias_keys('Vacant','person_name') && game_private.learning_alias_keys('previous officeholder','person_name') then
    raise exception 'vacancy predecessor was accepted';
  end if;
  if game_private.safe_distractor_set('["Senate","House"]', groups, 2, 'catalog') then raise exception 'complete correct option survived as distractor'; end if;
  if not game_private.safe_distractor_set('["Senate","President"]', groups, 2, 'catalog') then raise exception 'partial-valid plus wrong option was removed'; end if;
  if game_private.safe_distractor_set('["House","House of Representatives"]', groups, 2, 'catalog') then raise exception 'repeated accepted concept survived as distractor'; end if;
  if game_private.safe_distractor_set('["Senate","Senate"]', groups, 2, 'catalog') then raise exception 'duplicate distractor concepts survived'; end if;
  if game_private.safe_distractor_set('["Senate"]', groups, 1, 'catalog') then raise exception 'single correct option survived as distractor'; end if;
  if not game_private.safe_distractor_set('["President"]', groups, 1, 'catalog') then raise exception 'wrong single option removed'; end if;
  if game_private.safe_distractor_set('["J. D. Vance"]', '[{"key":"vance","display":"JD Vance","aliases":["J. D. Vance"]}]', 1, 'person_name') then
    raise exception 'dynamic two-initial alias survived as distractor';
  end if;
  if game_private.safe_distractor_set('["Vance"]', '[{"key":"vance","display":"JD Vance","aliases":["Vance"]}]', 1, 'person_name') then
    raise exception 'dynamic surname alias survived as distractor';
  end if;
  if not game_private.safe_distractor_set('["Tim Walz"]', '[{"key":"vance","display":"JD Vance","aliases":["J. D. Vance"]}]', 1, 'person_name') then
    raise exception 'unrelated name was removed by the single-answer fast path';
  end if;
end $$;

set local role anon;
do $$
declare a text; b text; expired_code text; created jsonb; mc jsonb; learning jsonb; written jsonb;
  mc_id uuid := '398d92a1-ecab-4d6b-a9b9-cb8bdbf9ddcc'; written_id uuid := 'd49c52e4-6834-44a1-8e5b-f9466d1cc0ec';
begin
  select code_a,code_b,code_expired into a,b,expired_code from qq_test_codes;
  created := public.create_game_session(a,'2025','UT','UT03');
  perform public.create_game_session(b,'2008','AS',null);
  perform public.create_game_session(expired_code,'2025','UT','UT03');
  if created ? 'session_id' or created ? 'code_verifier' or created ? 'recovery_code' then raise exception 'session credential exposed'; end if;
  learning := public.get_learning_progress(a);
  if learning <> '{"progress":[],"multiple_choice":[],"written":[],"matching":[]}'::jsonb then raise exception 'empty learning projection is wrong'; end if;

  mc := public.record_flashcard_round(a,mc_id,'[{"question_number":1,"outcome":"correct"},{"question_number":2,"outcome":"skipped"}]');
  if not (mc ? 'progress' and mc ? 'round' and mc ? 'learning') then raise exception 'legacy round response fields changed'; end if;
  if mc->'round' <> '{"answered":2,"correct":1,"incorrect":0,"skipped":1}'::jsonb then raise exception 'legacy round summary changed'; end if;
  if mc->'learning'->'progress' <> mc->'progress' or mc->'learning'->'multiple_choice' <> mc->'progress' or mc->'learning'->'written' <> '[]'::jsonb then
    raise exception 'multiple-choice outcomes were not preserved/mode separated'; end if;
  if public.get_flashcard_progress(a) <> mc->'progress' then raise exception 'legacy progress RPC no longer returns multiple-choice only'; end if;

  begin perform public.record_written_answer(a,mc_id,1,'correct'); raise exception using errcode='P0001',message='cross-mode round UUID accepted'; exception when sqlstate '22023' then null; end;
  written := public.record_written_answer(a,written_id,1,'incorrect');
  if written->'learning'->'progress'->0->>'correct_count' <> '1'
     or written->'learning'->'progress'->0->>'incorrect_count' <> '1'
     or written->'learning'->'multiple_choice'->0->>'correct_count' <> '1'
     or written->'learning'->'written'->0->>'incorrect_count' <> '1' then
    raise exception 'aggregate and per-mode outcome projections are incorrect';
  end if;
  written := public.record_written_answer(a,written_id,1,'incorrect');
  if written->'learning'->'progress'->0->>'incorrect_count' <> '1' then raise exception 'written retry counted twice'; end if;
  begin perform public.record_written_answer(a,written_id,1,'correct'); raise exception using errcode='P0001',message='changed written attempt accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_flashcard_round(a,written_id,'[{"question_number":1,"outcome":"correct"}]'); raise exception using errcode='P0001',message='written attempt reused as MC round'; exception when sqlstate '22023' then null; end;
  begin perform public.record_written_answer(a, 'c9fbb6a2-64e3-40da-b130-795e122ac3d4',1,'answer text'); raise exception using errcode='P0001',message='raw/invalid outcome accepted'; exception when sqlstate '22023' then null; end;
  begin perform public.record_written_answer(a, 'c9fbb6a2-64e3-40da-b130-795e122ac3d5',129,'correct'); raise exception using errcode='P0001',message='out-of-edition question accepted'; exception when sqlstate '22023' then null; end;
  if public.get_flashcard_progress(a) <> mc->'progress' then raise exception 'written result leaked into legacy multiple-choice view'; end if;
  if public.get_learning_progress(b) <> '{"progress":[],"multiple_choice":[],"written":[],"matching":[]}'::jsonb then raise exception 'session learning isolation failed'; end if;
  perform public.record_written_answer(b, 'f2dbf32d-0299-4a5a-9dfd-5d6e5a76fcd1',1,'skipped');
  if public.get_learning_progress(a)->'progress' <> written->'learning'->'progress' then raise exception 'second session changed first session learning'; end if;

  begin perform count(*) from game_private.learning_mode_progress; raise exception using errcode='P0001',message='direct per-mode access succeeded'; exception when insufficient_privilege then null; end;
  begin perform count(*) from game_private.practice_question_metadata; raise exception using errcode='P0001',message='direct catalog access succeeded'; exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','game_private.apply_learning_outcome(uuid,text,integer,text)','execute')
     or has_table_privilege('anon','game_private.learning_mode_progress','select')
     or has_table_privilege('anon','game_private.practice_question_metadata','select')
     or not has_function_privilege('anon','public.get_learning_progress(text)','execute')
     or not has_function_privilege('anon','public.record_written_answer(text,uuid,integer,text)','execute') then
    raise exception 'new RPC or private grants are incorrect';
  end if;
end $$;
reset role;

set local role authenticated;
do $$
begin
  begin perform public.get_learning_progress(repeat('A',43)); raise exception using errcode='P0001',message='authenticated progress RPC allowed'; exception when insufficient_privilege then null; end;
  begin perform public.record_written_answer(repeat('A',43),'a9a8f4a5-30fb-40e0-b66c-f6e532324ccb',1,'correct'); raise exception using errcode='P0001',message='authenticated write RPC allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Expiry and cascade checks are limited to the generated probe session IDs.
do $$
declare c text; h bytea; sid uuid;
begin
  select code_expired into c from qq_test_codes;
  h := extensions.digest(convert_to(c,'UTF8'),'sha256');
  select session_id into sid from game_private.sessions where code_verifier=h;
  update game_private.sessions set last_active_at=clock_timestamp()-interval '168 hours' where session_id=sid;
end $$;
set local role anon;
do $$
declare c text;
begin
  select code_expired into c from qq_test_codes;
  begin perform public.get_learning_progress(c); raise exception using errcode='P0001',message='expired learning read accepted'; exception when sqlstate 'P0002' then null; end;
  begin perform public.get_flashcard_progress(c); raise exception using errcode='P0001',message='expired legacy read accepted'; exception when sqlstate 'P0002' then null; end;
  begin perform public.record_written_answer(c, 'ccc2ddc7-96b4-4caf-8176-2ce1a4ed0373',1,'correct'); raise exception using errcode='P0001',message='expired written attempt accepted'; exception when sqlstate 'P0002' then null; end;
end $$;
reset role;

do $$
declare a text; b text; e text; ha bytea; hb bytea; he bytea; sa uuid; sb uuid; se uuid;
begin
  select code_a,code_b,code_expired into a,b,e from qq_test_codes;
  ha:=extensions.digest(convert_to(a,'UTF8'),'sha256'); hb:=extensions.digest(convert_to(b,'UTF8'),'sha256'); he:=extensions.digest(convert_to(e,'UTF8'),'sha256');
  select session_id into sa from game_private.sessions where code_verifier=ha;
  select session_id into sb from game_private.sessions where code_verifier=hb;
  select session_id into se from game_private.sessions where code_verifier=he;
  delete from game_private.sessions where session_id in (sa,sb,se);
  if exists(select 1 from game_private.learning_mode_progress where session_id in (sa,sb,se))
     or exists(select 1 from game_private.flashcard_progress where session_id in (sa,sb,se))
     or exists(select 1 from game_private.flashcard_round_receipts where session_id in (sa,sb,se)) then
    raise exception 'parent session deletion did not cascade learning rows';
  end if;
end $$;
rollback;
