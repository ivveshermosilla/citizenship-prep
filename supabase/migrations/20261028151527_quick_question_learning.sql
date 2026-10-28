-- Quick Question metadata and mode-separated private learning outcomes.
-- Existing flashcard rows remain the aggregate projection; existing MC rows are
-- backfilled into the new per-mode table before new writes are enabled.

create table game_private.learning_content_versions (
  content_version text primary key check (content_version ~ '^[A-Za-z0-9._-]{1,80}$'),
  status text not null default 'draft' check (status in ('draft', 'approved', 'retired')),
  created_at timestamptz not null default clock_timestamp(),
  reviewed_at timestamptz,
  review_summary text,
  check ((status = 'approved' and reviewed_at is not null)
      or (status = 'draft' and reviewed_at is null)
      or status = 'retired')
);
create unique index learning_content_one_approved_version
  on game_private.learning_content_versions ((status)) where status = 'approved';
alter table game_private.learning_content_versions enable row level security;
revoke all on game_private.learning_content_versions from public, anon, authenticated;
create policy learning_content_versions_deny_client_access
  on game_private.learning_content_versions for all to anon, authenticated
  using (false) with check (false);

create table game_private.practice_question_metadata (
  content_version text not null references game_private.learning_content_versions(content_version) on delete cascade,
  edition text not null check (edition in ('2008', '2025')),
  question_number integer not null check (question_number between 1 and 128),
  required_count integer not null check (required_count between 1 and 8),
  reference_answers text[] not null default '{}'::text[] check (array_position(reference_answers, null) is null),
  answer_groups jsonb not null check (jsonb_typeof(answer_groups) = 'array'),
  distractor_sets jsonb not null check (jsonb_typeof(distractor_sets) = 'array' and jsonb_array_length(distractor_sets) >= 3),
  strategy jsonb not null check (
    jsonb_typeof(strategy) = 'object'
    and strategy ? 'answer_groups' and strategy ? 'distractors' and strategy ? 'current_aliases'
    and strategy - 'answer_groups' - 'distractors' - 'current_aliases' = '{}'::jsonb
    and (strategy->>'answer_groups' in ('catalog', 'current_answer')) is true
    and (strategy->>'distractors' in ('curated', 'other_geographies')) is true
    and (strategy->>'current_aliases' in ('catalog', 'official_variants_only', 'person_name', 'political_party')) is true
  ),
  rationale text not null check (btrim(rationale) <> ''),
  source_urls text[] not null check (cardinality(source_urls) > 0 and array_position(source_urls, null) is null),
  review_status text not null default 'draft' check (review_status in ('draft', 'approved')),
  primary key (content_version, edition, question_number),
  check (edition <> '2008' or question_number <= 100),
  check (strategy->>'answer_groups' <> 'current_answer' or jsonb_array_length(answer_groups) = 0),
  check (strategy->>'answer_groups' <> 'catalog' or cardinality(reference_answers) > 0),
  check (strategy->>'answer_groups' <> 'current_answer' or cardinality(reference_answers) = 0),
  check (strategy->>'answer_groups' <> 'catalog' or strategy->>'current_aliases' = 'catalog'),
  check (strategy->>'answer_groups' <> 'current_answer' or strategy->>'current_aliases' <> 'catalog')
);
alter table game_private.practice_question_metadata enable row level security;
revoke all on game_private.practice_question_metadata from public, anon, authenticated;
create policy practice_question_metadata_deny_client_access
  on game_private.practice_question_metadata for all to anon, authenticated
  using (false) with check (false);

alter table game_private.flashcard_round_receipts
  add column mode text not null default 'multiple_choice'
  check (mode in ('multiple_choice', 'written'));

create table game_private.learning_mode_progress (
  session_id uuid not null references game_private.sessions(session_id) on delete cascade,
  mode text not null check (mode in ('multiple_choice', 'written')),
  question_number integer not null check (question_number between 1 and 128),
  correct_count integer not null default 0 check (correct_count between 0 and 100000),
  incorrect_count integer not null default 0 check (incorrect_count between 0 and 100000),
  skipped_count integer not null default 0 check (skipped_count between 0 and 100000),
  last_outcome text not null check (last_outcome in ('correct', 'incorrect', 'skipped')),
  primary key (session_id, mode, question_number)
);
insert into game_private.learning_mode_progress(
  session_id, mode, question_number, correct_count, incorrect_count, skipped_count, last_outcome
)
select session_id, 'multiple_choice', question_number, correct_count, incorrect_count, skipped_count, last_outcome
  from game_private.flashcard_progress;
alter table game_private.learning_mode_progress enable row level security;
revoke all on game_private.learning_mode_progress from public, anon, authenticated;
create policy learning_mode_progress_deny_client_access
  on game_private.learning_mode_progress for all to anon, authenticated
  using (false) with check (false);

create or replace function game_private.normalize_learning_answer(p_value text)
returns text language sql immutable strict security invoker set search_path = pg_catalog
as $$
  select regexp_replace(
    translate(lower(p_value),
      'áàâäãåāăąçćčďđéèêëēėęíìîïīįłñńóòôöõøōřśšşťúùûüūůýÿžźż',
      'aaaaaaaaacccddeeeeeeeiiiiiilnnooooooorssstuuuuuuyyzzz'),
    '[^[:alnum:]]', '', 'g')
$$;
revoke all on function game_private.normalize_learning_answer(text) from public, anon, authenticated;

-- Current-person aliases derive from current canonical answers only. Surname
-- aliases are emitted on accepted groups only when unambiguous in that row.
create or replace function game_private.current_person_shape(p_name text)
returns table(base_key text, surname_key text, aliases text[])
language plpgsql immutable strict security invoker set search_path = pg_catalog, game_private
as $$
declare
  v_tokens text[];
  v_last integer;
  v_surname_start integer;
  v_first text;
  v_surname text;
  v_core text;
  v_middle_safe boolean := true;
  v_has_particle boolean := false;
  v_index integer;
begin
  if lower(btrim(p_name)) ~ '^(vacant|none|n/?a|no[[:space:]]|not[[:space:]]+applicable|not[[:space:]]+elected|answers?[[:space:]]+vary|answer[[:space:]]+varies|check[[:space:]])' then
    base_key := game_private.normalize_learning_answer(p_name);
    surname_key := base_key;
    aliases := array[p_name];
    return next;
    return;
  end if;
  -- Keep internal hyphens in surnames as one token (Ocasio-Cortez).
  v_tokens := regexp_split_to_array(btrim(regexp_replace(p_name, '[^[:alnum:]-]+', ' ', 'g')), '[[:space:]]+');
  v_last := cardinality(v_tokens);
  if v_last > 1 and game_private.normalize_learning_answer(v_tokens[v_last]) in ('jr','sr','ii','iii','iv','v') then
    v_last := v_last - 1;
  end if;
  if v_last < 2 then
    base_key := game_private.normalize_learning_answer(p_name);
    surname_key := base_key;
    aliases := array[p_name];
    return next;
    return;
  end if;
  v_surname_start := v_last;
  while v_surname_start > 2 and lower(v_tokens[v_surname_start - 1]) = any(array['de','del','da','das','dos','van','von','la','le','du','st','saint','bin','al','el']) loop
    v_surname_start := v_surname_start - 1;
    v_has_particle := true;
  end loop;
  -- Known two-part elected-official surnames are conservative reviewed
  -- patterns; other multiword surnames remain fullname-only when ambiguous.
  if v_surname_start = v_last and v_last >= 3
     and game_private.normalize_learning_answer(v_tokens[v_last - 1] || ' ' || v_tokens[v_last])
         in ('cortezmasto', 'gluesenkampperez') then
    v_surname_start := v_last - 1;
    v_has_particle := true;
  end if;
  if not v_has_particle and v_surname_start > 2 then
    for v_index in 2..(v_surname_start - 1) loop
      if char_length(game_private.normalize_learning_answer(v_tokens[v_index])) <> 1 then
        v_middle_safe := false;
      end if;
    end loop;
  end if;
  if not v_middle_safe then
    v_core := array_to_string(v_tokens[1:v_last], ' ');
    base_key := game_private.normalize_learning_answer(v_core);
    surname_key := base_key;
    aliases := array[p_name, v_core];
    return next;
    return;
  end if;
  v_first := v_tokens[1];
  v_surname := array_to_string(v_tokens[v_surname_start:v_last], ' ');
  base_key := game_private.normalize_learning_answer(v_first || ' ' || v_surname);
  surname_key := game_private.normalize_learning_answer(v_surname);
  aliases := array[p_name, v_first || ' ' || v_surname, v_surname];
  -- Some current canonical names use an uppercase two-letter given-name
  -- initial (for example, JD Vance); users commonly type both initials.
  if v_first ~ '^[A-Z]{2}$' then
    aliases := array_append(aliases,
      substr(v_first, 1, 1) || '. ' || substr(v_first, 2, 1) || '. ' || v_surname);
  end if;
  return next;
end
$$;
revoke all on function game_private.current_person_shape(text) from public, anon, authenticated;

create or replace function game_private.current_party_aliases(p_value text)
returns text[] language sql immutable strict security invoker set search_path = pg_catalog
as $$
  select array[p_value, btrim(replace(replace(lower(p_value), '(party)', ''), ' party', ''))]
$$;
revoke all on function game_private.current_party_aliases(text) from public, anon, authenticated;

create or replace function game_private.learning_alias_keys(p_value text, p_strategy text)
returns text[] language plpgsql immutable strict security invoker set search_path = pg_catalog, game_private
as $$
declare v_alias text; v_result text[] := array[]::text[]; v_shape record;
begin
  if p_strategy = 'person_name' then
    select * into v_shape from game_private.current_person_shape(p_value);
    for v_alias in select unnest(v_shape.aliases) loop
      v_result := array_append(v_result, game_private.normalize_learning_answer(v_alias));
    end loop;
  elsif p_strategy = 'political_party' then
    for v_alias in select unnest(game_private.current_party_aliases(p_value)) loop
      v_result := array_append(v_result, game_private.normalize_learning_answer(v_alias));
    end loop;
  else
    v_result := array[game_private.normalize_learning_answer(p_value)];
  end if;
  return (select array_agg(distinct x.value) from unnest(v_result) as x(value));
end
$$;
revoke all on function game_private.learning_alias_keys(text, text) from public, anon, authenticated;

create or replace function game_private.safe_distractor_set(
  p_set jsonb, p_answer_groups jsonb, p_required_count integer, p_alias_strategy text
)
returns boolean language plpgsql immutable strict security invoker set search_path = pg_catalog, game_private
as $$
declare
  v_item_count integer;
  v_unique_items integer;
  v_matched_items integer;
  v_distinct_groups integer;
  v_ambiguous boolean;
begin
  if jsonb_typeof(p_set) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(p_set) <> p_required_count then
    return false;
  end if;
  if exists(select 1 from jsonb_array_elements(p_set) e(item) where jsonb_typeof(e.item) <> 'string') then
    return false;
  end if;
  select count(*), count(distinct game_private.normalize_learning_answer(e.value))
    into v_item_count, v_unique_items from jsonb_array_elements_text(p_set) e(value);
  if v_item_count <> p_required_count or v_unique_items <> p_required_count then return false; end if;

  with candidates as (
    select e.ordinality, e.value from jsonb_array_elements_text(p_set) with ordinality e(value, ordinality)
  ), valid_values as (
    select g.item->>'key' as group_key, g.item->>'display' as value
      from jsonb_array_elements(p_answer_groups) g(item)
    union all
    select g.item->>'key', a.value #>> '{}'
      from jsonb_array_elements(p_answer_groups) g(item)
      cross join lateral jsonb_array_elements(g.item->'aliases') a(value)
  ), matches as (
    select c.ordinality, v.group_key
      from candidates c join valid_values v
        on game_private.learning_alias_keys(c.value, p_alias_strategy)
           && game_private.learning_alias_keys(v.value, p_alias_strategy)
  ), candidate_matches as (
    select c.ordinality, count(distinct m.group_key) as group_count, min(m.group_key) as group_key
      from candidates c left join matches m using (ordinality)
     group by c.ordinality
  )
  select count(*) filter (where group_count = 1),
         count(distinct group_key) filter (where group_count = 1),
         coalesce(bool_or(group_count > 1), false)
    into v_matched_items, v_distinct_groups, v_ambiguous
    from candidate_matches;
  if v_ambiguous or v_matched_items > v_distinct_groups then return false; end if;
  -- Reject only a full, distinct valid assignment. A set with some correct
  -- components plus a wrong complete component stays a plausible distractor.
  return not (v_matched_items = p_required_count and v_distinct_groups = p_required_count);
end
$$;
revoke all on function game_private.safe_distractor_set(jsonb, jsonb, integer, text) from public, anon, authenticated;

create or replace function game_private.progress_array(p_session_id uuid)
returns jsonb language sql stable security invoker set search_path = pg_catalog, game_private
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'question_number', p.question_number,
    'correct_count', p.correct_count,
    'incorrect_count', p.incorrect_count,
    'skipped_count', p.skipped_count,
    'last_outcome', p.last_outcome
  ) order by p.question_number), '[]'::jsonb)
  from game_private.flashcard_progress p
  where p.session_id = p_session_id
$$;
revoke all on function game_private.progress_array(uuid) from public, anon, authenticated;

create or replace function game_private.mode_progress_array(p_session_id uuid, p_mode text)
returns jsonb language sql stable security invoker set search_path = pg_catalog, game_private
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'question_number', p.question_number,
    'correct_count', p.correct_count,
    'incorrect_count', p.incorrect_count,
    'skipped_count', p.skipped_count,
    'last_outcome', p.last_outcome
  ) order by p.question_number), '[]'::jsonb)
  from game_private.learning_mode_progress p
  where p.session_id = p_session_id and p.mode = p_mode
$$;
revoke all on function game_private.mode_progress_array(uuid, text) from public, anon, authenticated;

create or replace function game_private.learning_projection(p_session_id uuid)
returns jsonb language sql stable security invoker set search_path = pg_catalog, game_private
as $$
  select jsonb_build_object(
    'progress', game_private.progress_array(p_session_id),
    'multiple_choice', game_private.mode_progress_array(p_session_id, 'multiple_choice'),
    'written', game_private.mode_progress_array(p_session_id, 'written')
  )
$$;
revoke all on function game_private.learning_projection(uuid) from public, anon, authenticated;

create or replace function game_private.get_learning_progress(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare v_session game_private.sessions; v_verifier bytea;
begin
  v_verifier := game_private.validate_recovery_code(p_code);
  select s.* into v_session from game_private.sessions s
   where s.code_verifier = v_verifier
     and s.last_active_at > clock_timestamp() - interval '168 hours';
  if not found then raise exception using errcode = 'P0002', message = 'session unavailable'; end if;
  return game_private.learning_projection(v_session.session_id);
end
$$;

create or replace function game_private.apply_learning_outcome(
  p_session_id uuid, p_mode text, p_question_number integer, p_outcome text
)
returns void language plpgsql volatile security invoker set search_path = pg_catalog, game_private
as $$
declare v_aggregate_total bigint; v_mode_count integer;
begin
  if p_mode not in ('multiple_choice', 'written') or p_outcome not in ('correct', 'incorrect', 'skipped')
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

-- Internal resolver: current-geography answers are read from the selected
-- official row at call time. Only its accepted `answers` values are aliases;
-- answer_display/predecessor text is never graded as a current answer.
create or replace function game_private.practice_metadata_item(p_edition text, p_geography text, p_question_number integer)
returns jsonb language plpgsql stable security invoker set search_path = pg_catalog
as $$
declare
  v_row record;
  v_meta game_private.practice_question_metadata;
  v_groups jsonb;
  v_group_expanded jsonb;
  v_distractors jsonb := '[]'::jsonb;
  v_accepted text[];
  v_group_count integer;
  v_set jsonb;
  v_value text;
  v_alias_strategy text;
begin
  if p_edition = '2008' then
    select q.* into v_row from public.civics_questions_2008 q
     where q.question_number = p_question_number and q.geography = p_geography;
  elsif p_edition = '2025' then
    select q.* into v_row from public.civics_questions_2025 q
     where q.question_number = p_question_number and q.geography = p_geography;
  else
    raise exception using errcode = '22023', message = 'invalid practice metadata selection';
  end if;
  if not found then raise exception using errcode = '22023', message = 'practice question unavailable'; end if;

  select m.* into v_meta
    from game_private.practice_question_metadata m
    join game_private.learning_content_versions v using (content_version)
   where m.edition = p_edition and m.question_number = p_question_number
     and m.review_status = 'approved' and v.status = 'approved';
  if not found then raise exception using errcode = '55000', message = 'reviewed practice metadata unavailable'; end if;
  v_alias_strategy := v_meta.strategy->>'current_aliases';
  if (v_meta.strategy->>'answer_groups' = 'catalog' and v_alias_strategy <> 'catalog')
     or (v_meta.strategy->>'answer_groups' = 'current_answer' and v_alias_strategy not in ('official_variants_only','person_name','political_party')) then
    raise exception using errcode = '55000', message = 'reviewed answer alias strategy unavailable';
  end if;
  if v_meta.strategy->>'answer_groups' = 'catalog' and v_meta.reference_answers is distinct from v_row.answers then
    raise exception using errcode = '55000', message = 'reviewed answers need content refresh';
  end if;
  if jsonb_array_length(v_meta.distractor_sets) < 3 or exists(
    select 1 from jsonb_array_elements(v_meta.distractor_sets) d(item)
     where jsonb_typeof(d.item) <> 'array'
        or jsonb_array_length(d.item) <> v_meta.required_count
        or exists(select 1 from jsonb_array_elements(d.item) c(value)
                   where jsonb_typeof(c.value) <> 'string' or btrim(c.value #>> '{}') = '')
  ) then raise exception using errcode = '55000', message = 'reviewed practice distractors incomplete'; end if;

  if v_meta.strategy->>'answer_groups' = 'current_answer' then
    if v_alias_strategy = 'person_name' then
      with raw as (
        select a.answer, s.base_key, s.surname_key, s.aliases
          from unnest(v_row.answers) a(answer)
          cross join lateral game_private.current_person_shape(a.answer) s
      ), grouped as (
        select r.base_key, min(r.answer) as display, min(r.surname_key) as surname_key,
               array_agg(distinct a.alias) as aliases
          from raw r cross join lateral unnest(r.aliases) a(alias)
         group by r.base_key
      ), checked as (
        select g.*, count(*) over (partition by g.surname_key) as surname_owners from grouped g
      )
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', c.base_key,
        'display', c.display,
        'aliases', to_jsonb(array(select distinct alias from unnest(c.aliases) alias
                                  where c.surname_owners = 1 or game_private.normalize_learning_answer(alias) <> c.surname_key))
      ) order by c.base_key), '[]'::jsonb), count(*)
        into v_groups, v_group_count from checked c;
    elsif v_alias_strategy = 'political_party' then
      with raw as (
        select a.answer, game_private.current_party_aliases(a.answer) as aliases
          from unnest(v_row.answers) a(answer)
      ), grouped as (
        select game_private.normalize_learning_answer(r.aliases[2]) as base_key,
               min(r.answer) as display,
               array_agg(distinct alias) as aliases
          from raw r cross join lateral unnest(r.aliases) a(alias)
         group by game_private.normalize_learning_answer(r.aliases[2])
      )
      select coalesce(jsonb_agg(jsonb_build_object('key', g.base_key, 'display', g.display, 'aliases', to_jsonb(g.aliases)) order by g.base_key), '[]'::jsonb), count(*)
        into v_groups, v_group_count from grouped g;
    else
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', x.normalized, 'display', x.display, 'aliases', to_jsonb(x.aliases)
      ) order by x.normalized), '[]'::jsonb), count(*)
        into v_groups, v_group_count
        from (
          select game_private.normalize_learning_answer(a.answer) as normalized,
                 min(a.answer) as display,
                 array_agg(distinct a.answer order by a.answer) as aliases
            from unnest(v_row.answers) as a(answer)
           group by game_private.normalize_learning_answer(a.answer)
        ) x;
    end if;
    if v_group_count < v_meta.required_count then
      raise exception using errcode = '55000', message = 'dynamic answer groups incomplete';
    end if;
  else
    v_groups := v_meta.answer_groups;
    if jsonb_array_length(v_groups) < v_meta.required_count or exists(
      select 1 from jsonb_array_elements(v_groups) g(item)
       where jsonb_typeof(g.item) <> 'object'
          or (select count(*) from jsonb_object_keys(g.item)) <> 3
          or not (g.item ? 'key' and g.item ? 'display' and g.item ? 'aliases')
          or jsonb_typeof(g.item->'key') <> 'string'
          or jsonb_typeof(g.item->'display') <> 'string'
          or jsonb_typeof(g.item->'aliases') <> 'array'
          or btrim(g.item->>'key') = '' or btrim(g.item->>'display') = ''
          or exists (select 1 from jsonb_array_elements(g.item->'aliases') a(value)
                      where jsonb_typeof(a.value) <> 'string' or btrim(a.value #>> '{}') = '')
    ) then raise exception using errcode = '55000', message = 'reviewed answer groups malformed'; end if;
  end if;

  -- Return exact reviewed aliases plus their shared normalization forms. This
  -- accepts e.g. ASCII spellings of current names with diacritics while
  -- preserving the canonical display string.
  select coalesce(jsonb_agg(
      g.item || jsonb_build_object('aliases', to_jsonb(array(
        select distinct alias from (
          select g.item->>'display' as alias
          union all select a.value #>> '{}' from jsonb_array_elements(g.item->'aliases') a(value)
          union all select game_private.normalize_learning_answer(g.item->>'display')
          union all select game_private.normalize_learning_answer(a.value #>> '{}') from jsonb_array_elements(g.item->'aliases') a(value)
        ) accepted_aliases
      ))) order by g.ordinality), '[]'::jsonb)
    into v_group_expanded
    from jsonb_array_elements(v_groups) with ordinality g(item, ordinality);
  v_groups := v_group_expanded;
  select array_agg(distinct game_private.normalize_learning_answer(a.value #>> '{}'))
    into v_accepted from jsonb_array_elements(v_groups) g(item)
    cross join lateral jsonb_array_elements(g.item->'aliases') a(value);

  for v_set in select d.item from jsonb_array_elements(v_meta.distractor_sets) d(item) loop
    if game_private.safe_distractor_set(v_set, v_groups, v_meta.required_count, v_alias_strategy)
       and not exists(select 1 from jsonb_array_elements_text(v_set) c(value)
         where lower(btrim(c.value)) ~ '^(vacant|none|n/?a|no[[:space:]]|not[[:space:]]+applicable|not[[:space:]]+elected|answers?[[:space:]]+vary|answer[[:space:]]+varies|check[[:space:]])') then
      v_distractors := v_distractors || jsonb_build_array(v_set);
    end if;
  end loop;

  if v_meta.strategy->>'distractors' = 'other_geographies' and v_meta.required_count = 1 then
    if p_edition = '2008' then
      for v_value in
        select min(c.answer) from public.civics_questions_2008 q
          cross join lateral unnest(q.answers) c(answer)
         where q.question_number = p_question_number and q.geography <> p_geography
           and q.answer_status <> 'vacant'
           and lower(btrim(c.answer)) !~ '^(vacant|none|n/?a|no[[:space:]]|not[[:space:]]+applicable|not[[:space:]]+elected|answers?[[:space:]]+vary|answer[[:space:]]+varies|check[[:space:]])'
           and not (game_private.learning_alias_keys(c.answer, v_alias_strategy) && coalesce(v_accepted, array[]::text[]))
         group by game_private.normalize_learning_answer(c.answer)
         order by game_private.normalize_learning_answer(min(c.answer)) limit 64
      loop v_distractors := v_distractors || jsonb_build_array(jsonb_build_array(v_value)); end loop;
    else
      for v_value in
        select min(c.answer) from public.civics_questions_2025 q
          cross join lateral unnest(q.answers) c(answer)
         where q.question_number = p_question_number and q.geography <> p_geography
           and q.answer_status <> 'vacant'
           and lower(btrim(c.answer)) !~ '^(vacant|none|n/?a|no[[:space:]]|not[[:space:]]+applicable|not[[:space:]]+elected|answers?[[:space:]]+vary|answer[[:space:]]+varies|check[[:space:]])'
           and not (game_private.learning_alias_keys(c.answer, v_alias_strategy) && coalesce(v_accepted, array[]::text[]))
         group by game_private.normalize_learning_answer(c.answer)
         order by game_private.normalize_learning_answer(min(c.answer)) limit 64
      loop v_distractors := v_distractors || jsonb_build_array(jsonb_build_array(v_value)); end loop;
    end if;
  end if;

  -- Broadly exclude any option containing a currently accepted alias, including
  -- catalog answers, then require at least three complete incorrect options.
  select coalesce(jsonb_agg(d.item order by d.ordinality), '[]'::jsonb) into v_distractors
    from (
      select distinct on (d.item::text) d.item, d.ordinality
        from jsonb_array_elements(v_distractors) with ordinality d(item, ordinality)
       where game_private.safe_distractor_set(d.item, v_groups, v_meta.required_count, v_alias_strategy)
         and not exists (select 1 from jsonb_array_elements_text(d.item) c(value)
           where lower(btrim(c.value)) ~ '^(vacant|none|n/?a|no[[:space:]]|not[[:space:]]+applicable|not[[:space:]]+elected|answers?[[:space:]]+vary|answer[[:space:]]+varies|check[[:space:]])')
       order by d.item::text, d.ordinality
    ) d;
  if jsonb_array_length(v_distractors) < 3 then
    raise exception using errcode = '55000', message = 'reviewed practice distractors unavailable';
  end if;

  return jsonb_build_object(
    'question_number', p_question_number,
    'required_count', v_meta.required_count,
    'answer_groups', v_groups,
    'distractor_sets', v_distractors,
    'content_version', v_meta.content_version
  );
end
$$;
revoke all on function game_private.practice_metadata_item(text, text, integer) from public, anon, authenticated;

create or replace function game_private.practice_metadata(p_edition text, p_state_code text, p_district_code text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $$
declare v_district text; v_expected integer; v_result jsonb; v_count integer;
begin
  v_district := game_private.resolve_district(p_edition, p_state_code, p_district_code);
  v_expected := case p_edition when '2008' then 100 else 128 end;
  if p_edition = '2008' then
    select jsonb_agg(game_private.practice_metadata_item(p_edition, q.geography, q.question_number) order by q.question_number), count(*)
      into v_result, v_count
      from (select distinct on (question_number) question_number, geography from public.civics_questions_2008
        where geography in ('US', 'US-'||p_state_code, 'US-'||p_state_code||'-'||right(v_district,2))
        order by question_number, case when geography='US-'||p_state_code||'-'||right(v_district,2) then 1 when geography='US-'||p_state_code then 2 else 3 end) q;
  else
    select jsonb_agg(game_private.practice_metadata_item(p_edition, q.geography, q.question_number) order by q.question_number), count(*)
      into v_result, v_count
      from (select distinct on (question_number) question_number, geography from public.civics_questions_2025
        where geography in ('US', 'US-'||p_state_code, 'US-'||p_state_code||'-'||right(v_district,2))
        order by question_number, case when geography='US-'||p_state_code||'-'||right(v_district,2) then 1 when geography='US-'||p_state_code then 2 else 3 end) q;
  end if;
  if v_count <> v_expected then raise exception using errcode = '55000', message = 'complete reviewed practice metadata unavailable'; end if;
  return v_result;
end
$$;
revoke all on function game_private.practice_metadata(text, text, text) from public, anon, authenticated;
grant execute on function game_private.practice_metadata(text, text, text) to anon;

-- The existing private flashcard table is now the combined aggregate. Per-mode
-- views were backfilled from its pre-migration multiple-choice values above.
create or replace function game_private.get_flashcard_progress(p_code text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare v_session game_private.sessions; v_verifier bytea;
begin
  v_verifier := game_private.validate_recovery_code(p_code);
  select s.* into v_session from game_private.sessions s
   where s.code_verifier = v_verifier and s.last_active_at > clock_timestamp() - interval '168 hours';
  if not found then raise exception using errcode = 'P0002', message = 'session unavailable'; end if;
  return game_private.mode_progress_array(v_session.session_id, 'multiple_choice');
end
$$;

-- Preserve the old public shape while adding separate-mode learning metadata.
create or replace function game_private.record_flashcard_round(p_code text, p_round_id uuid, p_results jsonb)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_session game_private.sessions; v_verifier bytea; v_max_questions integer; v_length integer;
  v_old_length integer; v_hash bytea; v_old_hash bytea; v_correct integer; v_incorrect integer; v_skipped integer;
  v_question integer; v_outcome text; v_progress jsonb; v_learning jsonb; v_prefix jsonb; v_receipt_mode text;
begin
  v_verifier := game_private.validate_recovery_code(p_code);
  if p_round_id is null or p_results is null or jsonb_typeof(p_results) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid flashcard round';
  end if;
  if jsonb_array_length(p_results) < 1 then raise exception using errcode = '22023', message = 'invalid flashcard round'; end if;
  select s.* into v_session from game_private.sessions s
   where s.code_verifier = v_verifier and s.last_active_at > clock_timestamp() - interval '168 hours' for update;
  if not found then raise exception using errcode = 'P0002', message = 'session unavailable'; end if;
  if v_session.last_active_at <= clock_timestamp() - interval '168 hours' then raise exception using errcode = 'P0002', message = 'session unavailable'; end if;
  v_max_questions := case v_session.edition when '2008' then 100 else 128 end;
  v_length := jsonb_array_length(p_results);
  if v_length > v_max_questions then raise exception using errcode = '22023', message = 'round exceeds edition question limit'; end if;
  if exists(select 1 from jsonb_array_elements(p_results) e(item) where jsonb_typeof(e.item) <> 'object') then
    raise exception using errcode = '22023', message = 'invalid flashcard result';
  end if;
  if exists(select 1 from jsonb_array_elements(p_results) e(item)
    where (select count(*) from jsonb_object_keys(e.item)) <> 2 or not (e.item ? 'question_number') or not (e.item ? 'outcome')
       or jsonb_typeof(e.item->'question_number') <> 'number' or (e.item->>'question_number') !~ '^[0-9]{1,3}$'
       or jsonb_typeof(e.item->'outcome') <> 'string' or e.item->>'outcome' not in ('correct','incorrect','skipped')) then
    raise exception using errcode = '22023', message = 'invalid flashcard result';
  end if;
  if exists(select 1 from jsonb_array_elements(p_results) e(item) where (e.item->>'question_number')::integer < 1 or (e.item->>'question_number')::integer > v_max_questions)
     or (select count(distinct (e.item->>'question_number')::integer) from jsonb_array_elements(p_results) e(item)) <> v_length then
    raise exception using errcode = '22023', message = 'invalid or duplicate flashcard question';
  end if;
  select count(*) filter(where item->>'outcome'='correct'), count(*) filter(where item->>'outcome'='incorrect'), count(*) filter(where item->>'outcome'='skipped')
    into v_correct,v_incorrect,v_skipped from jsonb_array_elements(p_results) e(item);
  v_hash := extensions.digest(convert_to(p_results::text,'UTF8'),'sha256');
  select prefix_length,prefix_hash,mode into v_old_length,v_old_hash,v_receipt_mode
    from game_private.flashcard_round_receipts where session_id=v_session.session_id and round_id=p_round_id;
  if found then
    if v_receipt_mode <> 'multiple_choice' then raise exception using errcode = '22023', message = 'attempt UUID already used in another mode'; end if;
    if v_length < v_old_length then raise exception using errcode = '22023', message = 'flashcard round prefix cannot shrink'; end if;
    if v_length = v_old_length then
      if v_hash <> v_old_hash then raise exception using errcode = '22023', message = 'flashcard round prefix changed'; end if;
      return jsonb_build_object('progress',game_private.mode_progress_array(v_session.session_id,'multiple_choice'),
        'round',jsonb_build_object('answered',v_length,'correct',v_correct,'incorrect',v_incorrect,'skipped',v_skipped),
        'learning',game_private.learning_projection(v_session.session_id));
    end if;
    select jsonb_agg(e.item order by e.ordinality) into v_prefix from jsonb_array_elements(p_results) with ordinality e(item,ordinality) where e.ordinality<=v_old_length;
    if extensions.digest(convert_to(v_prefix::text,'UTF8'),'sha256') <> v_old_hash then raise exception using errcode='22023',message='flashcard round prefix changed'; end if;
  else
    if (select count(*) from game_private.flashcard_round_receipts where session_id=v_session.session_id) >= 1024 then
      raise exception using errcode='54000',message='learning attempt limit reached'; end if;
    v_old_length := 0;
  end if;
  if exists(select 1 from jsonb_array_elements(p_results) with ordinality e(item,ordinality)
      left join game_private.learning_mode_progress p on p.session_id=v_session.session_id and p.mode='multiple_choice' and p.question_number=(e.item->>'question_number')::integer
      where e.ordinality>v_old_length and case e.item->>'outcome' when 'correct' then coalesce(p.correct_count,0)>=100000 when 'incorrect' then coalesce(p.incorrect_count,0)>=100000 else coalesce(p.skipped_count,0)>=100000 end) then
    raise exception using errcode='54000',message='question learning outcome limit reached'; end if;
  if (select coalesce(sum(correct_count::bigint+incorrect_count::bigint+skipped_count::bigint),0) from game_private.flashcard_progress where session_id=v_session.session_id)+(v_length-v_old_length)>100000 then
    raise exception using errcode='54000',message='session learning outcome limit reached'; end if;
  for v_question,v_outcome in select (item->>'question_number')::integer,item->>'outcome' from jsonb_array_elements(p_results) with ordinality e(item,ordinality) where ordinality>v_old_length order by ordinality loop
    perform game_private.apply_learning_outcome(v_session.session_id,'multiple_choice',v_question,v_outcome);
  end loop;
  if v_old_length=0 then
    insert into game_private.flashcard_round_receipts(session_id,round_id,prefix_length,prefix_hash,correct_count,incorrect_count,skipped_count,mode)
    values(v_session.session_id,p_round_id,v_length,v_hash,v_correct,v_incorrect,v_skipped,'multiple_choice');
  else
    update game_private.flashcard_round_receipts set prefix_length=v_length,prefix_hash=v_hash,correct_count=v_correct,incorrect_count=v_incorrect,skipped_count=v_skipped
      where session_id=v_session.session_id and round_id=p_round_id;
  end if;
  update game_private.sessions set last_active_at=clock_timestamp() where session_id=v_session.session_id;
  v_progress := game_private.mode_progress_array(v_session.session_id,'multiple_choice');
  v_learning := game_private.learning_projection(v_session.session_id);
  return jsonb_build_object('progress',v_progress,'round',jsonb_build_object('answered',v_length,'correct',v_correct,'incorrect',v_incorrect,'skipped',v_skipped),'learning',v_learning);
end
$$;

create or replace function game_private.record_written_answer(p_code text,p_attempt_id uuid,p_question_number integer,p_outcome text)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare
  v_session game_private.sessions; v_verifier bytea; v_hash bytea; v_existing_hash bytea; v_mode text; v_learning jsonb; v_question_max integer;
begin
  v_verifier := game_private.validate_recovery_code(p_code);
  if p_attempt_id is null or p_question_number is null or p_outcome is null or p_outcome not in ('correct','incorrect','skipped') then
    raise exception using errcode='22023',message='invalid written answer'; end if;
  select s.* into v_session from game_private.sessions s
   where s.code_verifier=v_verifier and s.last_active_at>clock_timestamp()-interval '168 hours' for update;
  if not found then raise exception using errcode='P0002',message='session unavailable'; end if;
  if v_session.last_active_at<=clock_timestamp()-interval '168 hours' then raise exception using errcode='P0002',message='session unavailable'; end if;
  v_question_max := case v_session.edition when '2008' then 100 else 128 end;
  if p_question_number<1 or p_question_number>v_question_max then raise exception using errcode='22023',message='invalid written question'; end if;
  v_hash := extensions.digest(convert_to(jsonb_build_object('question_number',p_question_number,'outcome',p_outcome)::text,'UTF8'),'sha256');
  select mode,prefix_hash into v_mode,v_existing_hash from game_private.flashcard_round_receipts where session_id=v_session.session_id and round_id=p_attempt_id;
  if found then
    if v_mode <> 'written' then raise exception using errcode='22023',message='attempt UUID already used in another mode'; end if;
    if v_existing_hash <> v_hash then raise exception using errcode='22023',message='written attempt payload changed'; end if;
    return jsonb_build_object('learning',game_private.learning_projection(v_session.session_id));
  end if;
  if (select count(*) from game_private.flashcard_round_receipts where session_id=v_session.session_id)>=1024 then raise exception using errcode='54000',message='learning attempt limit reached'; end if;
  perform game_private.apply_learning_outcome(v_session.session_id,'written',p_question_number,p_outcome);
  insert into game_private.flashcard_round_receipts(session_id,round_id,prefix_length,prefix_hash,correct_count,incorrect_count,skipped_count,mode)
  values(v_session.session_id,p_attempt_id,1,v_hash,case when p_outcome='correct' then 1 else 0 end,case when p_outcome='incorrect' then 1 else 0 end,case when p_outcome='skipped' then 1 else 0 end,'written');
  update game_private.sessions set last_active_at=clock_timestamp() where session_id=v_session.session_id;
  return jsonb_build_object('learning',game_private.learning_projection(v_session.session_id));
end
$$;

create or replace function public.get_practice_metadata(p_edition text,p_state_code text,p_district_code text)
returns jsonb language sql stable security invoker set search_path=pg_catalog,game_private
as $$ select game_private.practice_metadata(p_edition,p_state_code,p_district_code) $$;
create or replace function public.get_learning_progress(p_code text)
returns jsonb language sql volatile security invoker set search_path=pg_catalog,game_private
as $$ select game_private.get_learning_progress(p_code) $$;
create or replace function public.record_written_answer(p_code text,p_attempt_id uuid,p_question_number integer,p_outcome text)
returns jsonb language sql volatile security invoker set search_path=pg_catalog,game_private
as $$ select game_private.record_written_answer(p_code,p_attempt_id,p_question_number,p_outcome) $$;

revoke all on function game_private.get_flashcard_progress(text) from public,anon,authenticated;
revoke all on function game_private.get_learning_progress(text) from public,anon,authenticated;
revoke all on function game_private.record_flashcard_round(text,uuid,jsonb) from public,anon,authenticated;
revoke all on function game_private.record_written_answer(text,uuid,integer,text) from public,anon,authenticated;
grant execute on function game_private.get_flashcard_progress(text) to anon;
grant execute on function game_private.get_learning_progress(text) to anon;
grant execute on function game_private.record_flashcard_round(text,uuid,jsonb) to anon;
grant execute on function game_private.record_written_answer(text,uuid,integer,text) to anon;

revoke all on function public.get_practice_metadata(text,text,text) from public,authenticated;
revoke all on function public.get_learning_progress(text) from public,authenticated;
revoke all on function public.record_written_answer(text,uuid,integer,text) from public,authenticated;
grant execute on function public.get_practice_metadata(text,text,text) to anon;
grant execute on function public.get_learning_progress(text) to anon;
grant execute on function public.record_written_answer(text,uuid,integer,text) to anon;
