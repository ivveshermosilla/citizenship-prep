-- Read-only approved-catalog verifier. Set app.practice_edition to 2008/2025
-- and app.practice_offset to the next row offset before each execution. Batches
-- are bounded so actual resolver work never holds one long transaction.
begin;
set transaction read only;
set local statement_timeout = '45s';
set local app.practice_edition = '2008';
set local app.practice_offset = '0';
set local app.practice_limit = '60';

do $$
declare
  v_edition text := current_setting('app.practice_edition');
  v_offset integer := current_setting('app.practice_offset')::integer;
  v_limit integer := current_setting('app.practice_limit')::integer;
  r record;
  v_item jsonb;
  v_strategy text;
  v_answer text;
  v_expected_alias text;
  v_expected_aliases text[];
  v_checked integer := 0;
  v_total integer;
begin
  if v_edition not in ('2008','2025') or v_offset < 0 or v_limit < 1 or v_limit > 60 then
    raise exception 'invalid read-only verification batch settings';
  end if;
  if not exists(select 1 from game_private.learning_content_versions where status='approved') then
    raise exception 'no approved practice catalog is installed';
  end if;

  if v_edition='2008' then
    select count(*) into v_total from public.civics_questions_2008;
    for r in select question_number,geography,answers from public.civics_questions_2008
              order by geography,question_number offset v_offset limit v_limit loop
      v_item := game_private.practice_metadata_item(v_edition,r.geography,r.question_number);
      select strategy->>'current_aliases' into v_strategy from game_private.practice_question_metadata
       where content_version=v_item->>'content_version' and edition=v_edition and question_number=r.question_number;
      if v_strategy='person_name' then
        for v_answer in select unnest(r.answers) loop
          v_expected_aliases:=case
            when lower(v_answer) ~ 'no .*u[.]?s[.]?[[:space:]]+senators?' then array['No U.S. senators','No senators']
            when lower(v_answer) ~ 'does[[:space:]]+not[[:space:]]+have[[:space:]]+(a[[:space:]]+)?governor' then array['No governor']
            when lower(v_answer) ~ 'no[[:space:]]+voting[[:space:]]+representative' then array['No voting representative in Congress','No voting representative']
            else array[]::text[] end;
          foreach v_expected_alias in array v_expected_aliases loop
            if not exists(select 1 from jsonb_array_elements(v_item->'answer_groups') g(item)
                cross join lateral jsonb_array_elements_text(g.item->'aliases') a(value)
                where a.value=v_expected_alias) then
              raise exception 'required absence alias missing for 2008 Q% geography %',r.question_number,r.geography;
            end if;
          end loop;
        end loop;
        if exists(select 1 from jsonb_array_elements(v_item->'distractor_sets') d(item)
            cross join lateral jsonb_array_elements_text(d.item) a(value)
            where not game_private.is_officeholder_name(a.value)) then
          raise exception 'non-name status distractor survived for 2008 Q% geography %',r.question_number,r.geography;
        end if;
      elsif v_strategy='official_variants_only' and exists(select 1 from unnest(r.answers) a(value)
          where game_private.normalize_learning_answer(a.value)='washingtondc') then
        if not exists(select 1 from jsonb_array_elements(v_item->'answer_groups') g(item)
            cross join lateral jsonb_array_elements_text(g.item->'aliases') a(value) where a.value='Washington DC') then
          raise exception 'Washington DC capital alias missing for 2008 Q% geography %',r.question_number,r.geography;
        end if;
        if not exists(select 1 from jsonb_array_elements(v_item->'answer_groups') g(item)
            cross join lateral jsonb_array_elements_text(g.item->'aliases') a(value) where a.value='Washington D.C.') then
          raise exception 'Washington D.C. capital alias missing for 2008 Q% geography %',r.question_number,r.geography;
        end if;
      end if;
      if v_item ? 'question_number' is false or v_item ? 'required_count' is false
         or v_item ? 'answer_groups' is false or v_item ? 'distractor_sets' is false
         or v_item ? 'content_version' is false or (select count(*) from jsonb_object_keys(v_item))<>5
         or jsonb_array_length(v_item->'answer_groups')<1
         or jsonb_array_length(v_item->'distractor_sets')<3 then
        raise exception 'metadata contract failed for 2008 Q% geography %',r.question_number,r.geography;
      end if;
      if exists(select 1 from jsonb_array_elements(v_item->'answer_groups') g(item)
          where (select count(*) from jsonb_object_keys(g.item))<>3
             or g.item->>'key' is null or g.item->>'display' is null
             or jsonb_typeof(g.item->'aliases')<>'array')
         or exists(
           select 1 from jsonb_array_elements(v_item->'answer_groups') g(item)
           cross join lateral (select g.item->>'display' as value union all
             select a.value from jsonb_array_elements_text(g.item->'aliases') a(value)) aliases(value)
           group by game_private.normalize_learning_answer(aliases.value)
           having count(distinct (g.item->>'key'))>1
         ) then raise exception 'answer-group shape or alias ownership failed for 2008 Q% geography %',r.question_number,r.geography; end if;
      if exists(select 1 from jsonb_array_elements(v_item->'distractor_sets') d(value)
        where not game_private.safe_distractor_set(d.value,v_item->'answer_groups',(v_item->>'required_count')::integer,v_strategy)) then
        raise exception 'unsafe distractor found for 2008 Q% geography %',r.question_number,r.geography;
      end if;
      v_checked:=v_checked+1;
    end loop;
  else
    select count(*) into v_total from public.civics_questions_2025;
    for r in select question_number,geography,answers from public.civics_questions_2025
              order by geography,question_number offset v_offset limit v_limit loop
      v_item := game_private.practice_metadata_item(v_edition,r.geography,r.question_number);
      select strategy->>'current_aliases' into v_strategy from game_private.practice_question_metadata
       where content_version=v_item->>'content_version' and edition=v_edition and question_number=r.question_number;
      if v_strategy='person_name' then
        for v_answer in select unnest(r.answers) loop
          v_expected_aliases:=case
            when lower(v_answer) ~ 'no .*u[.]?s[.]?[[:space:]]+senators?' then array['No U.S. senators','No senators']
            when lower(v_answer) ~ 'does[[:space:]]+not[[:space:]]+have[[:space:]]+(a[[:space:]]+)?governor' then array['No governor']
            when lower(v_answer) ~ 'no[[:space:]]+voting[[:space:]]+representative' then array['No voting representative in Congress','No voting representative']
            else array[]::text[] end;
          foreach v_expected_alias in array v_expected_aliases loop
            if not exists(select 1 from jsonb_array_elements(v_item->'answer_groups') g(item)
                cross join lateral jsonb_array_elements_text(g.item->'aliases') a(value)
                where a.value=v_expected_alias) then
              raise exception 'required absence alias missing for 2025 Q% geography %',r.question_number,r.geography;
            end if;
          end loop;
        end loop;
        if exists(select 1 from jsonb_array_elements(v_item->'distractor_sets') d(item)
            cross join lateral jsonb_array_elements_text(d.item) a(value)
            where not game_private.is_officeholder_name(a.value)) then
          raise exception 'non-name status distractor survived for 2025 Q% geography %',r.question_number,r.geography;
        end if;
      elsif v_strategy='official_variants_only' and exists(select 1 from unnest(r.answers) a(value)
          where game_private.normalize_learning_answer(a.value)='washingtondc') then
        if not exists(select 1 from jsonb_array_elements(v_item->'answer_groups') g(item)
            cross join lateral jsonb_array_elements_text(g.item->'aliases') a(value) where a.value='Washington DC') then
          raise exception 'Washington DC capital alias missing for 2025 Q% geography %',r.question_number,r.geography;
        end if;
        if not exists(select 1 from jsonb_array_elements(v_item->'answer_groups') g(item)
            cross join lateral jsonb_array_elements_text(g.item->'aliases') a(value) where a.value='Washington D.C.') then
          raise exception 'Washington D.C. capital alias missing for 2025 Q% geography %',r.question_number,r.geography;
        end if;
      end if;
      if v_item ? 'question_number' is false or v_item ? 'required_count' is false
         or v_item ? 'answer_groups' is false or v_item ? 'distractor_sets' is false
         or v_item ? 'content_version' is false or (select count(*) from jsonb_object_keys(v_item))<>5
         or jsonb_array_length(v_item->'answer_groups')<1
         or jsonb_array_length(v_item->'distractor_sets')<3 then
        raise exception 'metadata contract failed for 2025 Q% geography %',r.question_number,r.geography;
      end if;
      if exists(select 1 from jsonb_array_elements(v_item->'answer_groups') g(item)
          where (select count(*) from jsonb_object_keys(g.item))<>3
             or g.item->>'key' is null or g.item->>'display' is null
             or jsonb_typeof(g.item->'aliases')<>'array')
         or exists(
           select 1 from jsonb_array_elements(v_item->'answer_groups') g(item)
           cross join lateral (select g.item->>'display' as value union all
             select a.value from jsonb_array_elements_text(g.item->'aliases') a(value)) aliases(value)
           group by game_private.normalize_learning_answer(aliases.value)
           having count(distinct (g.item->>'key'))>1
         ) then raise exception 'answer-group shape or alias ownership failed for 2025 Q% geography %',r.question_number,r.geography; end if;
      if exists(select 1 from jsonb_array_elements(v_item->'distractor_sets') d(value)
        where not game_private.safe_distractor_set(d.value,v_item->'answer_groups',(v_item->>'required_count')::integer,v_strategy)) then
        raise exception 'unsafe distractor found for 2025 Q% geography %',r.question_number,r.geography;
      end if;
      v_checked:=v_checked+1;
    end loop;
  end if;
  if v_checked=0 and v_offset<v_total then raise exception 'verification batch unexpectedly empty'; end if;
  raise notice 'verified % rows; total %, next offset %',v_checked,v_total,v_offset+v_checked;
end $$;
rollback;
