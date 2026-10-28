-- Run after applying the migration and seed. Tests roll back temporary grants,
-- constraint probes and a disposable table; they leave the data unchanged.
begin;
do $verify$
declare
  item record;
  selected_count integer;
begin
  if (select count(*) from public.civics_questions_2008) <> 705
     or (select count(*) from public.civics_questions_2025) <> 733 then
    raise exception 'Unexpected edition row counts';
  end if;

  for item in
    select distinct state_code, district_code, geography
    from public.civics_questions_2025
    where geographic_scope = 'congressional_district'
  loop
    select count(distinct question_number) into selected_count
    from public.civics_questions_2025
    where geography in ('US', 'US-' || item.state_code, item.geography);
    if selected_count <> 128 then
      raise exception 'Incomplete 2025 district selection: %', item.district_code;
    end if;
    select count(distinct question_number) into selected_count
    from public.civics_questions_2008
    where geography in ('US', 'US-' || item.state_code, item.geography);
    if selected_count <> 100 then
      raise exception 'Incomplete 2008 district selection: %', item.district_code;
    end if;
  end loop;

  if (select count(*) from public.civics_questions_2025 where answer_status = 'vacant' and answers = array['Vacant'] and previous_officeholder is not null) <> 2 then
    raise exception 'Vacancy policy is not represented';
  end if;
  if exists (select 1 from public.civics_questions_2025 where answer_updated_on <> date '2026-10-27' or next_update_on <> date '2026-11-27')
     or exists (select 1 from public.civics_questions_2008 where answer_updated_on <> date '2026-10-27' or next_update_on <> date '2026-11-27') then
    raise exception 'Initial monthly date mismatch';
  end if;
  if (date '2026-01-31' + interval '1 month')::date <> date '2026-02-28'
     or (date '2028-01-31' + interval '1 month')::date <> date '2028-02-29' then
    raise exception 'Calendar month boundary mismatch';
  end if;

  begin
    update public.civics_questions_2025 set geography = 'INVALID'
    where question_number = 1 and geography = 'US';
    raise exception 'Invalid geography was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.civics_questions_2025 set previous_officeholder = null
    where answer_status = 'vacant';
    raise exception 'Vacancy without predecessor was accepted';
  exception when check_violation then null;
  end;
  begin
    update public.civics_questions_2008 set question_number = 0
    where question_number = 1 and geography = 'US';
    raise exception 'Invalid question number was accepted';
  exception when check_violation then null;
  end;

  -- Verify the grant boundary using the actual client role.
  begin
    execute 'set local role anon';
    perform 1 from public.civics_questions_2025 limit 1;
    raise exception 'Anonymous read was unexpectedly permitted';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  begin
    execute 'set local role authenticated';
    perform 1 from public.civics_questions_2008 limit 1;
    raise exception 'Authenticated read was unexpectedly permitted';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
end;
$verify$;

-- A rolled-back grant lets us test the independent RLS boundary as well.
grant select on public.civics_questions_2008, public.civics_questions_2025 to anon, authenticated;
do $rls$
begin
  execute 'set local role anon';
  if exists (select 1 from public.civics_questions_2025) then
    raise exception 'RLS exposed anonymous data';
  end if;
  execute 'reset role';
  execute 'set local role authenticated';
  if exists (select 1 from public.civics_questions_2008) then
    raise exception 'RLS exposed authenticated data';
  end if;
  execute 'reset role';
end;
$rls$;

-- The narrowed EXECUTE privilege must preserve the existing automatic RLS trigger.
create table public._civics_auto_rls_probe (value integer);
do $trigger$
begin
  if not (select relrowsecurity from pg_class where oid = 'public._civics_auto_rls_probe'::regclass) then
    raise exception 'Automatic RLS trigger stopped working';
  end if;
end;
$trigger$;
rollback;

select true as all_checks_passed,
       (select count(*) from public.civics_questions_2008) as older_rows,
       (select count(*) from public.civics_questions_2025) as newer_rows,
       to_regclass('public._civics_auto_rls_probe') is null as probe_removed,
       not has_table_privilege('anon', 'public.civics_questions_2025', 'select') as temporary_grant_removed;
