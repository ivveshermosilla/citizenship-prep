-- Name-only distractor candidates must not turn official absence/status
-- instructions into people. Current canonical absence answers also receive a
-- small, reviewed typed-answer alias set; predecessor strings remain excluded.
create or replace function game_private.is_officeholder_name(p_value text)
returns boolean language sql immutable strict security invoker set search_path = pg_catalog
as $$
  select btrim(p_value) <> '' and lower(btrim(p_value)) !~
    '^(vacant|none|n/?a|not[[:space:]]+applicable|not[[:space:]]+elected|answers?[[:space:]]+vary|answer[[:space:]]+varies|check[[:space:]])'
    and lower(p_value) !~ '(\mno\M|\mdoes[[:space:]]+not[[:space:]]+have\M|\mdoesn.t[[:space:]]+have\M|\mhas[[:space:]]+no\M|\mhave[[:space:]]+no\M|\mvoting[[:space:]]+representative\M|\mu[.]?s[.]?[[:space:]]+senators?\M)'
$$;
revoke all on function game_private.is_officeholder_name(text) from public, anon, authenticated;

create or replace function game_private.current_official_variant_aliases(p_value text)
returns text[] language sql immutable strict security invoker set search_path = pg_catalog, game_private
as $$
  select case when game_private.normalize_learning_answer(p_value) = 'washingtondc'
    then array[p_value, 'Washington DC', 'Washington D.C.']
    else array[p_value]
  end
$$;
revoke all on function game_private.current_official_variant_aliases(text) from public, anon, authenticated;

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
  if lower(p_name) ~ 'no .*u[.]?s[.]?[[:space:]]+senators?' then
    base_key := game_private.normalize_learning_answer(p_name);
    surname_key := base_key;
    aliases := array[p_name, 'No U.S. senators', 'No senators'];
    return next;
    return;
  elsif lower(p_name) ~ 'does[[:space:]]+not[[:space:]]+have[[:space:]]+(a[[:space:]]+)?governor' then
    base_key := game_private.normalize_learning_answer(p_name);
    surname_key := base_key;
    aliases := array[p_name, 'No governor'];
    return next;
    return;
  elsif lower(p_name) ~ 'no[[:space:]]+voting[[:space:]]+representative' then
    base_key := game_private.normalize_learning_answer(p_name);
    surname_key := base_key;
    aliases := array[p_name, 'No voting representative in Congress', 'No voting representative'];
    return next;
    return;
  end if;
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
    elsif v_alias_strategy = 'official_variants_only' then
      select coalesce(jsonb_agg(jsonb_build_object(
        'key', x.normalized, 'display', x.display, 'aliases', to_jsonb(x.aliases)
      ) order by x.normalized), '[]'::jsonb), count(*)
        into v_groups, v_group_count
        from (
          select game_private.normalize_learning_answer(a.answer) as normalized,
                 min(a.answer) as display,
                 array_agg(distinct variants.alias order by variants.alias) as aliases
            from unnest(v_row.answers) as a(answer)
            cross join lateral unnest(game_private.current_official_variant_aliases(a.answer)) variants(alias)
           group by game_private.normalize_learning_answer(a.answer)
        ) x;
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
         where (v_alias_strategy = 'person_name' and not game_private.is_officeholder_name(c.value))
            or lower(btrim(c.value)) ~ '^(vacant|none|n/?a|no[[:space:]]|not[[:space:]]+applicable|not[[:space:]]+elected|answers?[[:space:]]+vary|answer[[:space:]]+varies|check[[:space:]])') then
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
           and (v_alias_strategy <> 'person_name' or game_private.is_officeholder_name(c.answer))
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
           and (v_alias_strategy <> 'person_name' or game_private.is_officeholder_name(c.answer))
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
           where (v_alias_strategy = 'person_name' and not game_private.is_officeholder_name(c.value))
              or lower(btrim(c.value)) ~ '^(vacant|none|n/?a|no[[:space:]]|not[[:space:]]+applicable|not[[:space:]]+elected|answers?[[:space:]]+vary|answer[[:space:]]+varies|check[[:space:]])')
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
