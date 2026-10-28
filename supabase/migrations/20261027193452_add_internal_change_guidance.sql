-- Internal editorial expectations, separate from the monthly maintenance date.
do $migration$
declare bank text;
begin
  foreach bank in array array['civics_questions_2008', 'civics_questions_2025'] loop
    execute format('alter table public.%I
      add column expected_change_on date,
      add column expected_change_through date,
      add column change_expectation text not null default ''unscheduled'',
      add column change_guidance jsonb not null default ''{}''::jsonb,
      add column review_flagged_on date,
      add column review_flag_reason text,
      add constraint change_expectation_kind check (change_expectation in
        (''regular_cycle'', ''estimated_window'', ''annual_checkpoint'', ''unscheduled'', ''not_applicable'')),
      add constraint change_expectation_dates check (
        (change_expectation in (''unscheduled'', ''not_applicable'') and expected_change_on is null and expected_change_through is null)
        or (change_expectation in (''regular_cycle'', ''estimated_window'', ''annual_checkpoint'')
            and expected_change_on is not null and expected_change_through is not null
            and expected_change_through >= expected_change_on)),
      add constraint change_guidance_object check (jsonb_typeof(change_guidance) = ''object''),
      add constraint review_flag_pair check (
        (review_flagged_on is null and review_flag_reason is null)
        or (review_flagged_on is not null and review_flag_reason is not null and length(btrim(review_flag_reason)) > 0))', bank);
    execute format('comment on column public.%I.expected_change_on is %L', bank,
      'Internal earliest regular-cycle checkpoint or start of an editorial window. Nullable; not guaranteed expiration, not an extra update schedule.');
    execute format('comment on column public.%I.change_guidance is %L', bank,
      'Internal basis, sources, precision via change_expectation, assessment date and per-answer candidate timelines. Not for end-user display.');
  end loop;
end
$migration$;

create schema if not exists internal;
revoke all on schema internal from public, anon, authenticated;
grant usage on schema internal to service_role;

-- A clock-dependent status belongs in a view, not a stored generated column.
-- This reads the clock only when queried; it creates no job or periodic writes.
create view internal.civics_answer_review with (security_invoker = true) as
with banks as (
  select '2008'::text as edition, q.* from public.civics_questions_2008 q
  union all
  select '2025'::text as edition, q.* from public.civics_questions_2025 q
), assessment as (
  select b.*, (now() at time zone 'America/Denver')::date as assessed_on
  from banks b
), reasons as (
  select a.*,
    next_update_on <= assessed_on as monthly_review_due,
    array_remove(array[
      case when review_flagged_on <= assessed_on then 'manual_report' end,
      case when expected_change_on <= assessed_on
                 and answer_updated_on < least(assessed_on, expected_change_through)
           then 'expected_change_checkpoint_reached' end,
      case when is_time_dependent and next_update_on <= assessed_on
           then 'monthly_review_due_for_time_dependent_answer' end
    ], null)::text[] as possible_outdated_reasons
  from assessment a
)
select r.*, cardinality(possible_outdated_reasons) > 0 as possibly_outdated
from reasons r;

revoke all on internal.civics_answer_review from public, anon, authenticated, service_role;
grant select on internal.civics_answer_review to service_role;
comment on view internal.civics_answer_review is
  'Private administrative status at read time. possibly_outdated requests verification and does not assert an incorrect answer. Monthly cadence unchanged. Manual reports must be explicitly cleared after review.';
