-- Read-only checks after the reviewed 2026-11-07 content patch.
begin;
do $verify$
declare
  payload jsonb;
  allowed_keys text[] := array[
    'question_number','question_text','section','subsection','answers',
    'answer_display','answer_updated_on','next_update_on','source_urls',
    'is_geography_dependent','is_time_dependent'
  ];
  actual_keys text[];
begin
  if (select count(*) from public.civics_questions_2008 where is_time_dependent and answer_updated_on = date '2026-11-07' and next_update_on = date '2026-12-07') <> 566
     or (select count(*) from public.civics_questions_2025 where is_time_dependent and answer_updated_on = date '2026-11-07' and next_update_on = date '2026-12-07') <> 565 then
    raise exception 'Reviewed time-dependent row counts or monthly dates differ';
  end if;
  if (select count(*) from public.civics_questions_2008 where not is_time_dependent and answer_updated_on = date '2026-10-27' and next_update_on = date '2026-11-27') <> 139
     or (select count(*) from public.civics_questions_2025 where not is_time_dependent and answer_updated_on = date '2026-10-27' and next_update_on = date '2026-11-27') <> 168 then
    raise exception 'One of the 307 out-of-scope rows was changed';
  end if;
  if exists (
    select 1 from public.civics_questions_2008 where is_time_dependent and answer_updated_on <> date '2026-11-07'
    union all
    select 1 from public.civics_questions_2025 where is_time_dependent and answer_updated_on <> date '2026-11-07'
  ) then raise exception 'A time-dependent row did not receive the reviewed date'; end if;

  if (select count(*) from public.civics_questions_2008 where question_number = 20) <> 56
     or (select count(*) from public.civics_questions_2025 where question_number = 23) <> 56
     or (select count(*) from public.civics_questions_2008 where question_number = 43) <> 56
     or (select count(*) from public.civics_questions_2025 where question_number = 61) <> 56
     or (select count(*) from public.civics_questions_2008 where question_number = 23) <> 441
     or (select count(*) from public.civics_questions_2025 where question_number = 29) <> 441 then
    raise exception 'Current officeholder geography coverage changed';
  end if;
  if exists (
    select 1 from public.civics_questions_2025
    where question_number = 57 and geography = 'US'
      and answers <> array['John Roberts','John G. Roberts, Jr.','Roberts']::text[]
  ) or not exists (
    select 1 from public.civics_questions_2025
    where question_number = 57 and geography = 'US'
      and 'https://www.supremecourt.gov/about/biographies.aspx' = any(source_urls)
  ) then raise exception 'Reviewed 2025 Chief Justice answer/provenance changed'; end if;
  if (select count(*) from public.civics_questions_2008 where question_number = 40 and geography = 'US') <> 1
     or exists (select 1 from public.civics_questions_2008 where question_number = 40 and geography = 'US' and answers <> array['John Roberts','John G. Roberts, Jr.']::text[]) then
    raise exception '2008 Chief Justice study answers changed';
  end if;

  if (select count(*) from public.civics_questions_2025 where answer_status = 'vacant' and geography in ('US-FL-20','US-TX-23') and answers = array['Vacant']::text[] and answer_display = 'Vacant (previously: ' || previous_officeholder || ')' and previous_officeholder in ('Sheila Cherfilus-McCormick','Tony Gonzales')) <> 2
     or (select count(*) from public.civics_questions_2008 where answer_status = 'vacant' and geography in ('US-FL-20','US-TX-23') and answers = array['Vacant']::text[] and answer_display = 'Vacant (previously: ' || previous_officeholder || ')' and previous_officeholder in ('Sheila Cherfilus-McCormick','Tony Gonzales')) <> 2 then
    raise exception 'House vacancies or predecessor display context changed';
  end if;
  if exists (
    select 1 from public.civics_questions_2008 where question_number = 20 and geography = 'US-OK'
      and (answers <> array['Alan Armstrong','James Lankford']::text[] or expected_change_on <> date '2026-11-03' or expected_change_through <> date '2027-01-03')
    union all
    select 1 from public.civics_questions_2025 where question_number = 23 and geography = 'US-OK'
      and (answers <> array['Alan Armstrong','James Lankford']::text[] or expected_change_on <> date '2026-11-03' or expected_change_through <> date '2027-01-03')
  ) then raise exception 'Oklahoma incumbent answers or internal review window changed'; end if;
  if exists (
    select 1 from public.civics_questions_2008 where question_number = 20 and geography = 'US-SC' and expected_change_on <> date '2027-01-03'
    union all
    select 1 from public.civics_questions_2025 where question_number = 23 and geography = 'US-SC' and expected_change_on <> date '2027-01-03'
  ) then raise exception 'South Carolina appointment checkpoint changed'; end if;

  payload := public.get_practice_questions('2025', 'UT', 'UT03');
  if jsonb_array_length(payload) <> 128 then raise exception 'Public practice projection is incomplete'; end if;
  if exists (
    select 1 from jsonb_array_elements(payload) as items(q)
    where (select array_agg(k.key_name order by k.key_name) from jsonb_object_keys(items.q) as k(key_name))
      <> (select array_agg(k.key_name order by k.key_name) from unnest(allowed_keys) as k(key_name))
  ) then raise exception 'Public practice projection exposed unexpected or missing keys'; end if;
end
$verify$;
rollback;
