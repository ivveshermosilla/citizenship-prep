-- Execute in one session. All probes are rolled back.
begin;
do $test$
declare bank text; n integer; day date := (now() at time zone 'America/Denver')::date;
begin
  select count(*) into n from internal.civics_answer_review;
  assert n = 1438, 'Review view must include both complete banks';
  assert not exists (select 1 from internal.civics_answer_review
    where change_guidance->>'assessed_on' <> '2026-10-27'
       or not (change_guidance ? 'basis') or not (change_guidance ? 'source_urls')),
    'Every row requires an assessed explanation and sources';
  assert not exists (select 1 from internal.civics_answer_review
    where answer_updated_on <> date '2026-10-27' or next_update_on <> date '2026-11-27'),
    'Metadata import must preserve factual and monthly dates';
  assert (select expected_change_on = date '2026-12-07' from public.civics_questions_2025
    where question_number=61 and geography='US-AK'), 'Alaska December checkpoint';
  assert (select expected_change_on = date '2029-01-03' from public.civics_questions_2025
    where question_number=29 and geography='US-PR-00'), 'Puerto Rico four-year seat';
  assert (select jsonb_array_length(change_guidance->'answer_candidates')=2
    from public.civics_questions_2025 where question_number=23 and geography='US-CO'),
    'Senators require separate candidate timelines';
  assert (select count(distinct x->>'regular_seat_term_end_on')=2
    from public.civics_questions_2025 q cross join lateral
      jsonb_array_elements(q.change_guidance->'answer_candidates') x
    where q.question_number=23 and q.geography='US-CO'), 'Colorado senators have different terms';
  assert (select expected_change_on=date '2026-11-03' from public.civics_questions_2025
    where question_number=23 and geography='US-OH'), 'Special election precedes regular seat boundary';
  assert not exists (select 1 from internal.civics_answer_review
    where change_expectation in ('unscheduled','not_applicable') and expected_change_on is not null),
    'No invented dates for unscheduled/nonperiodic facts';

  -- A reached checkpoint requires review even before the next monthly date.
  update public.civics_questions_2025 set answer_updated_on=day-2,
    expected_change_on=day-1, expected_change_through=day-1,
    change_expectation='regular_cycle' where question_number=38 and geography='US';
  assert (select possibly_outdated and not monthly_review_due
    from internal.civics_answer_review where edition='2025' and question_number=38 and geography='US'),
    'Reached checkpoint should flag an older answer';
  update public.civics_questions_2025 set answer_updated_on=day
    where question_number=38 and geography='US';
  assert (select not possibly_outdated from internal.civics_answer_review
    where edition='2025' and question_number=38 and geography='US'), 'Review clears an elapsed checkpoint';
  update public.civics_questions_2025 set expected_change_on=day+1, expected_change_through=day+1
    where question_number=38 and geography='US';
  assert (select not possibly_outdated from internal.civics_answer_review
    where edition='2025' and question_number=38 and geography='US'), 'Future checkpoint is not expired';

  -- Window still open: a later day may warrant checking again at the monthly review.
  update public.civics_questions_2025 set answer_updated_on=day-1,
    expected_change_on=day-5, expected_change_through=day+5, change_expectation='estimated_window'
    where question_number=38 and geography='US';
  assert (select possibly_outdated from internal.civics_answer_review
    where edition='2025' and question_number=38 and geography='US'), 'Ongoing window is considered';
  update public.civics_questions_2025 set answer_updated_on=day-40,
    expected_change_on=null, expected_change_through=null, change_expectation='unscheduled'
    where question_number=38 and geography='US';
  assert (select possibly_outdated and monthly_review_due and
    possible_outdated_reasons @> array['monthly_review_due_for_time_dependent_answer']
    from internal.civics_answer_review where edition='2025' and question_number=38 and geography='US'),
    'Unscheduled time-dependent answers remain covered by monthly review';

  update public.civics_questions_2025 set review_flagged_on=day, review_flag_reason='Rolled-back incident probe'
    where question_number=1 and geography='US';
  assert (select possibly_outdated and possible_outdated_reasons @> array['manual_report']
    from internal.civics_answer_review where edition='2025' and question_number=1 and geography='US'),
    'Manual reports support unscheduled incidents';
  begin
    update public.civics_questions_2025 set expected_change_on=day+1, expected_change_through=day,
      change_expectation='estimated_window' where question_number=1 and geography='US';
    raise exception 'Reversed window accepted';
  exception when check_violation then null; end;
  begin
    update public.civics_questions_2025 set review_flag_reason=null where question_number=1 and geography='US';
    raise exception 'Unexplained manual flag accepted';
  exception when check_violation then null; end;
end
$test$;

set local role service_role;
select count(*) as server_review_rows from internal.civics_answer_review;
reset role;
set local role anon;
do $test$ begin
  begin perform count(*) from internal.civics_answer_review; raise exception 'Anonymous view access allowed';
  exception when insufficient_privilege then null; end;
end $test$;
reset role;
set local role authenticated;
do $test$ begin
  begin perform count(*) from internal.civics_answer_review; raise exception 'Authenticated view access allowed';
  exception when insufficient_privilege then null; end;
end $test$;
reset role;

-- Independently prove that the view obeys caller RLS if grants are later changed.
grant usage on schema internal to anon, authenticated;
grant select on internal.civics_answer_review, public.civics_questions_2008,
  public.civics_questions_2025 to anon, authenticated;
set local role anon;
do $test$ begin
  assert (select count(*)=0 from internal.civics_answer_review), 'Invoker view bypassed anon RLS';
end $test$;
reset role;
set local role authenticated;
do $test$ begin
  assert (select count(*)=0 from internal.civics_answer_review), 'Invoker view bypassed authenticated RLS';
end $test$;
reset role;
rollback;
select 'change_guidance_checks_passed_and_probes_rolled_back' as result;
