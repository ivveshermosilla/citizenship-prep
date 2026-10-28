-- Keep one-answer option filtering linear in the answer aliases. The previous
-- generic assignment matcher recomputed dynamic-person aliases for every
-- candidate/alias pair, which made broad geographic metadata resolution slow.
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
  v_candidate text;
  v_candidate_keys text[];
  v_accepted_keys text[];
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

  if p_required_count = 1 then
    select e.value into v_candidate from jsonb_array_elements_text(p_set) e(value);
    v_candidate_keys := game_private.learning_alias_keys(v_candidate, p_alias_strategy);
    select coalesce(array_agg(distinct game_private.normalize_learning_answer(a.value)), array[]::text[])
      into v_accepted_keys
      from jsonb_array_elements(p_answer_groups) g(item)
      cross join lateral (
        select g.item->>'display' as value
        union all
        select x.value #>> '{}' from jsonb_array_elements(g.item->'aliases') x(value)
      ) a;
    -- The group aliases have already been expanded from the reviewed/current
    -- source answer. Only normalize that flat list here; don't infer every
    -- answer alias repeatedly for every distractor comparison.
    return not (coalesce(v_candidate_keys, array[]::text[]) && v_accepted_keys);
  end if;

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
