# Internal answer change guidance

Assessed October 27, 2026. Both edition tables contain the metadata below for
every question/geography row. This guide is for maintainers; it does not define
end-user notices or assert when a person's name must change.

| Field | Meaning |
| --- | --- |
| `expected_change_on` | Regular checkpoint or first day of an estimated window; nullable. |
| `expected_change_through` | Last day of that window; equals the checkpoint for a single day. |
| `change_expectation` | `regular_cycle`, `estimated_window`, `annual_checkpoint`, `unscheduled`, or `not_applicable`. |
| `change_guidance` | Explanation, assessment date, source URLs and individual candidate timelines. |
| `review_flagged_on`, `review_flag_reason` | Optional manual incident report; both required together. Clear explicitly after investigation. |

No date is a guaranteed factual expiration. No new verification of the answers
is implied by this metadata work: `answer_updated_on` stays October 27 and
`next_update_on` stays November 27. `regular_transition_on` is the earlier,
potentially incomplete seat-cycle field; use the new fields for this guide.

## How expectations are assigned

- President, Vice President and presidential party: January 20, 2029 regular
  term checkpoint. House seats: January 3, 2027; Puerto Rico resident commissioner:
  January 3, 2029. Speaker: new-Congress organization checkpoint, not a promise of
  a completed vote that day. Basis: [Twentieth Amendment](https://www.archives.gov/founding-docs/amendments-11-27).
- Senators: preserve each valid name's class and regular seat end date inside
  `change_guidance.answer_candidates`. The row-level date is the earliest relevant
  candidate checkpoint. Classes and terms follow the [Senate roster](https://www.senate.gov/senators/Class_II.htm).
  Ohio/Florida appointed senators additionally have an editorial special-election
  window from November 3, 2026 to January 3, 2027. This window is a planning
  estimate, not a statutory certification/oath deadline. The regular seat term
  remains recorded separately. Sources: [Ohio election directive](https://www.ohiosos.gov/globalassets/elections/directives/2025/directive-2025-54---writ-of-special-election-for-united-states-senate-election.pdf),
  [Florida election notice](https://files.floridados.gov/media/710256/2026_nge_des_english.pdf),
  [Senate appointment/succession explanation](https://www.senate.gov/senators/AppointedSenators.htm).
- Governors: editorial **month windows** extrapolated from regular election cycles
  and historical transition patterns in [NGA election/term information](https://www.nga.org/governors/elections/).
  Most next windows are January 2027; Kentucky December 2027; Louisiana/Mississippi
  January 2028; North Dakota December 2028; the remaining 2028-cycle jurisdictions
  January 2029; New Jersey/Virginia January 2030. These are not announced
  inauguration dates. Alaska/Hawaii instead have a sourced December 7, 2026
  regular checkpoint: [Alaska election calendar](https://www.elections.alaska.gov/calendar/),
  [Hawaii term rules](https://elections.hawaii.gov/resources/elected-officials/).
- Chief Justice, Court membership and other mutable institutions: `unscheduled`
  with no invented date. Annual tax-year review gets a January 1 checkpoint,
  which does not change the USCIS study answer “April 15” or predict an IRS deadline.
- Capitals and fixed/historical facts: `not_applicable` for periodic renewal,
  with null dates. Geographic dependence alone creates no service term. Offices
  that do not exist in a jurisdiction are also explicitly marked, not vacant.
- A currently vacant seat can be filled before its regular boundary; the guide
  does not claim to know that filling date. Continue monthly official-source review.

## Live administrative status

`internal.civics_answer_review` is a private, caller-security (`security_invoker`)
view over the two existing tables; there is no third application table.
It evaluates the America/Denver calendar date when read and provides:

- `possibly_outdated`: true for a manual report, a reached expectation since the
  recorded review, or a due monthly review of a time-dependent answer.
- `possible_outdated_reasons`: the exact applicable reason codes.
- `monthly_review_due`: the independent monthly date has arrived, for any row.
- `assessed_on`: the view's date, separate from the metadata assessment and
  actual answer-update date.

A window can remain relevant after a review within that window. Once its end
has been reviewed, that old window alone no longer raises a flag. A future
checkpoint alone raises no flag. Review flags never modify answers or
verification dates. Manual incident flags persist until explicitly cleared.
For a nonperiodic fact, a late monthly review alone does not imply an obsolete
answer; its independent `monthly_review_due` still becomes true.

```sql
select edition, question_number, geography, expected_change_on,
       expected_change_through, possibly_outdated, possible_outdated_reasons,
       monthly_review_due, answer_updated_on, next_update_on
from internal.civics_answer_review
where is_time_dependent or is_geography_dependent
order by expected_change_on nulls last, edition, question_number, geography;
```

The view and internal schema deny `anon`/`authenticated` access; only privileged
admin/server reads are enabled. Existing table RLS and client denials remain.
Keep these columns out of the public practice-question RPC's explicit projection.
This calculation creates no cron, background writes or extra review cadence.

## Reproduction and checks

Run `python3 scripts/build-change-guidance.py`, then
`python3 scripts/build-supabase-seed.py`. The first builds the
[local guide](../research/2026-10-27/answers/change-guidance.json) from the reviewed
catalogs and explicit date assumptions; the second includes it in deterministic
seed upserts. Seed imports preserve separately managed manual incident fields.
Future genuine monthly reviews must refresh obsolete assumptions/windows and
their assessment dates; rerunning the scripts is not source verification.

[Migration](migrations/20261027193452_add_internal_change_guidance.sql) adds the
fields and view. [SQL checks](tests/verify_change_guidance.sql) exercise reached
and future checkpoints, open windows, monthly and manual flags, constraints,
server access, client denial and independent view RLS; all probes roll back.
