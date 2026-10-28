-- Synthetic approved metadata is inserted only inside this rollback transaction.
-- This compact fixture covers representative static, current-name, vacancy, and
-- stale-answer cases. Full actual geography coverage is in the read-only batch
-- verifier; selector behavior is covered separately by the application tests.
begin;
set local statement_timeout = '45s';
update game_private.learning_content_versions
   set status='retired', reviewed_at=coalesce(reviewed_at,clock_timestamp())
 where status='approved';
insert into game_private.learning_content_versions(content_version,status,reviewed_at,review_summary)
values('verify-practice-metadata','draft',null,'transaction-local RPC fixture');

do $$
declare r record; v_strategy jsonb; v_answer_groups jsonb; v_ref text[];
begin
  for r in
    select * from (
      select '2008'::text as edition, q.question_number, q.answers, q.temporal_class, q.geographic_scope, q.question_text, q.source_urls
        from (select distinct on (question_number) * from public.civics_questions_2008
              order by question_number, case when geography='US' then 1 when geographic_scope='state_or_territory' then 2 else 3 end) q
      union all
      select '2025'::text, q.question_number, q.answers, q.temporal_class, q.geographic_scope, q.question_text, q.source_urls
        from (select distinct on (question_number) * from public.civics_questions_2025
              order by question_number, case when geography='US' then 1 when geographic_scope='state_or_territory' then 2 else 3 end) q
    ) editions
  loop
    if r.temporal_class = 'current_officeholder' then
      v_strategy := jsonb_build_object('answer_groups','current_answer','current_aliases','person_name','distractors',case when r.geographic_scope='national' then 'curated' else 'other_geographies' end);
      v_answer_groups := '[]'::jsonb; v_ref := array[]::text[];
    elsif r.temporal_class = 'current_party_landscape' then
      v_strategy := jsonb_build_object('answer_groups','current_answer','current_aliases','political_party','distractors','curated');
      v_answer_groups := '[]'::jsonb; v_ref := array[]::text[];
    elsif r.geographic_scope <> 'national' then
      v_strategy := jsonb_build_object('answer_groups','current_answer','current_aliases','official_variants_only','distractors',case when r.question_text ilike '%capital of your state%' then 'other_geographies' else 'curated' end);
      v_answer_groups := '[]'::jsonb; v_ref := array[]::text[];
    else
      v_strategy := jsonb_build_object('answer_groups','catalog','current_aliases','catalog','distractors','curated');
      v_answer_groups := jsonb_build_array(jsonb_build_object('key','fixture-'||r.question_number,'display','Fixture valid answer '||r.question_number,'aliases',jsonb_build_array('Fixture valid answer '||r.question_number)));
      v_ref := r.answers;
    end if;
    insert into game_private.practice_question_metadata(
      content_version,edition,question_number,required_count,reference_answers,answer_groups,distractor_sets,
      strategy,rationale,source_urls,review_status
    ) values (
      'verify-practice-metadata',r.edition,r.question_number,1,v_ref,v_answer_groups,
      jsonb_build_array(
        jsonb_build_array('Synthetic wrong option A '||r.question_number),
        jsonb_build_array('Synthetic wrong option B '||r.question_number),
        jsonb_build_array('Synthetic wrong option C '||r.question_number),
        jsonb_build_array('Synthetic wrong option D '||r.question_number)
      ),v_strategy,'Rollback-only fixture to verify response contracts.',r.source_urls,'approved'
    );
  end loop;
end $$;
update game_private.learning_content_versions
   set status='approved', reviewed_at=clock_timestamp()
 where content_version='verify-practice-metadata';

do $$
declare r record; item jsonb; original_answers text[]; v_current text;
begin
  -- Small rollback-only examples cover catalog freshness, dynamic live aliases,
  -- and vacancy handling. Full geography coverage runs in the read-only batch
  -- verifier, which avoids repeated resolution of the same 128-question bank.
  item:=game_private.practice_metadata_item('2008','US',1);
  if jsonb_array_length(item->'answer_groups')<1 or jsonb_array_length(item->'distractor_sets')<3 then
    raise exception 'static catalog sample projection incomplete'; end if;

  select q.question_number,q.geography,q.answers into r
    from public.civics_questions_2008 q
   where q.temporal_class='current_officeholder' and q.geographic_scope<>'national'
   order by q.question_number,q.geography limit 1;
  item:=game_private.practice_metadata_item('2008',r.geography,r.question_number);
  for v_current in select unnest(r.answers) loop
    if not exists(select 1 from jsonb_array_elements(item->'answer_groups') g(item)
        cross join lateral jsonb_array_elements_text(g.item->'aliases') a(value)
        where game_private.normalize_learning_answer(a.value)=game_private.normalize_learning_answer(v_current)) then
      raise exception 'current accepted variant missing from dynamic groups';
    end if;
  end loop;

  select q.question_number,q.geography,q.previous_officeholder into r
    from public.civics_questions_2008 q where q.answer_status='vacant'
   order by q.question_number,q.geography limit 1;
  item:=game_private.practice_metadata_item('2008',r.geography,r.question_number);
  if exists(select 1 from jsonb_array_elements(item->'answer_groups') g(item)
      cross join lateral jsonb_array_elements_text(g.item->'aliases') a(value)
      where game_private.normalize_learning_answer(a.value)=game_private.normalize_learning_answer(r.previous_officeholder)) then
    raise exception 'vacancy predecessor leaked into current accepted aliases';
  end if;

  -- A temporary canonical fact change must make its static catalog unavailable;
  -- restore the row immediately and let rollback erase all fixture writes.
  select q.answers into original_answers from public.civics_questions_2008 q where q.question_number=1 and q.geography='US';
  update public.civics_questions_2008 set answers=array['temporary test-only answer'] where question_number=1 and geography='US';
  begin
    perform game_private.practice_metadata_item('2008','US',1);
    raise exception using errcode='P0001',message='stale accepted-answer metadata was served';
  exception when sqlstate '55000' then null;
  end;
  update public.civics_questions_2008 set answers=original_answers where question_number=1 and geography='US';
  perform game_private.practice_metadata_item('2008','US',1);
end $$;
rollback;
