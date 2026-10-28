# Current answers and update dates — October 27, 2026

The owner authorized current answers and nationwide coverage after the original
question-only research. This follow-up resolves all **128 questions in the 2025
bank** and **100 questions in the 2008 bank**, while preserving the original
question-only snapshots. Work remains local, uncommitted and unpublished.
The dedicated Supabase banks are now loaded privately; Vercel remains unchanged.
No updater or reminder has been scheduled. See ../../../supabase/README.md.

## Files

| File | Contents |
| --- | --- |
| [resolved-answers.csv](resolved-answers.csv) | Start here: actual answers for every national/jurisdiction/district case, including sources, verification and suggested update dates. |
| [answers-2025.json](answers-2025.json) / [CSV](answers-2025.csv) | All 128 questions with national responses or complete geographic lookups. |
| [answers-2008.json](answers-2008.json) / [CSV](answers-2008.csv) | All 100 earlier-edition questions, separately identified. |
| [jurisdictions.json](jurisdictions.json) / [CSV](jurisdictions.csv) | 50 states, D.C. and five inhabited territories; senators, governors and capitals. |
| [senators.json](senators.json) / [CSV](senators.csv) | 100 senators, Senate classes and regular seat term-end dates. |
| [house-districts.json](house-districts.json) / [CSV](house-districts.csv) | 435 voting seats and six nonvoting delegate/commissioner records, including vacancies. |
| [review-schedule.csv](review-schedule.csv) | Dated response sets sorted by suggested update date. |
| [sources.json](sources.json) | Source identities, dates, hashes where available, retrieval methods and limits. |
| [coverage.json](coverage.json) | Machine-readable completion counts. |

The **1,438 resolved response sets** comprise 733 for 2025 and 705 for 2008.
These are not 1,438 unique facts: editions overlap and local prompts expand into
location-specific rows. A state senator set offers both current senators.

In JSON, `current_answer.mode` is `national`, `jurisdiction_lookup`, or
`district_lookup`. Lookup entries refer to complete catalogs; they are not
missing answers. The flattened CSV contains actual options for every case.
“Answers will vary” and “Visit USCIS” instructions are never used as resolved
responses. Source instructions remain separate provenance fields.

## Answers and sources

General options come from the official USCIS PDFs. Changing national names,
presidential party and the Supreme Court count were checked against the
[USCIS updates page][updates]. Multiple official alternatives and optional
parenthetical wording are preserved. Source notes are separated: a tribe-list
website is not part of a tribe name, and additional accepted Statue of Liberty
locations are indexed as separate options.

Options are not necessarily exhaustive. Prompts asking for multiple examples
still require the number in the prompt. This research does not implement grading.

Local names come from the [Senate directory][senate], [House Clerk][house] and
the [live National Governors Association roster][governors]. NGA is a primary
association source, not a government agency. These sources establish public
facts; they do not certify every exact name variant as a published USCIS answer.
The USCIS banks supply the geographic and special-jurisdiction instructions.

Capital names use an [official state legislative table][capitals],
[Census island geography][islands], [Guam government][guam] and a
[San Juan municipal report hosted by Treasury][pr-capital]. Publication dates
of older geographic references are recorded separately from verification dates.

## Monthly updates

The owner changed the policy to **once per calendar month**, superseding all
previous weekly, next-day, thirty-day and per-class suggestions. Every response
set records `verified_on`, `data_updated_on`, and a concrete `suggested_update_on`.
The full 1,438-row [review schedule](review-schedule.csv) now has the same next
monthly date: **November 27, 2026**, following verification on October 27, 2026.
This includes vacancies and stable historical material.

[maintenance-policy.json](maintenance-policy.json) is the current policy record.
A calendar month is not a fixed thirty days; end-of-month dates clamp normally.
Importing data does not advance its factual update/verification date. No automatic
job, shorter scheduled reviews, or event-triggered refreshes have been created.
Known transitions remain informational; users should corroborate official sources.

Review suggestions are not expiration dates. The regular presidential, House,
Senate-class and Puerto Rico commissioner boundaries remain separate metadata.
Appointed incumbents can change before a regular seat term ends. Specific
governor term-end days were not invented; all governors have the monthly date.

For the game's future notice, use the recorded answer update date. The confirmed
[product requirements](../../../docs/PRODUCT_REQUIREMENTS.md) specify the initial
unofficial-tool/geographic-change warning and the circled-info bubble, visible
for five seconds before fading, with links to official current information.

## Geographic edge cases

- D.C. uses USCIS's no-senators, no-governor and no-state-capital responses.
  Do not substitute its mayor for the governor answer. Its House delegate is
  recorded separately from voting representation.
- Territories keep nonvoting delegates/commissioners distinct from voting
  members. The USCIS no-voting-representative response is also stored.
- Puerto Rico's resident commissioner has a four-year term, with a regular
  checkpoint of **January 3, 2029**, rather than 2027. [Official biography][pr-member].
- **FL20 and TX23 are vacant** in the Clerk data and [vacancy register][vacancies].
  The canonical game answer is `Vacant`, with display text
  `Vacant (previously: NAME)` and the predecessor stored separately. This is the
  owner-defined game rule, not a claim about official interview grading.
- American Samoa is canonical **AS00**. The House XML's original `AQ00` identifier
  is preserved, but its explicit postal field is AS; identifiers are not guessed
  from source prefixes.
- Capitol Hill is on Saipan. The Northern Mariana Islands entry preserves the
  precise capital and broader name; these variants are not an exhaustive
  USCIS-certified scoring list.
- Freely associated sovereign states are not treated as U.S. states/territories.
- The 2008 tax response remains the USCIS study response, separate from actual
  IRS deadlines, extensions and relief. No unsupported 2027 deadline is
  substituted. [IRS source][irs].

## Verification and limits

Original question prompts and numbering are unchanged. PDF hashes were
rechecked. Static responses were compared against source extraction; national
changing values against the USCIS update text. The senator catalog has two
members per state and class sizes 33/33/34. Official Class II/III rosters identify
67 memberships; Class I is the remaining 33 from the complete directory, marked
as a computed complement.

The Senate directory is dated **August 3, 2026**; House XML **October 1, 2026**.
They were consulted on October 27 alongside live class/appointment and vacancy
records. Publication dates are not replaced with today's verification date.
The live governors roster supplies names; inconsistent historical term columns
in its linked PDF were not imported. State capital facts were inspected through
indexed text of the official reference PDF after direct retrieval failed.

Complete lookup coverage, uniqueness, source references, vacancy handling,
JSON/CSV consistency, review dates and secret checks were verified. This is a
dated research snapshot, with a private Supabase import and no website or automatic updater.

[updates]: https://www.uscis.gov/citizenship/find-study-materials-and-resources/check-for-test-updates
[senate]: https://www.senate.gov/general/resources/pdf/senators_phone_list.pdf
[house]: https://clerk.house.gov/xml/lists/MemberData.xml
[governors]: https://www.nga.org/governors/
[capitals]: https://www.lrl.mn.gov/docs/2013/other/130551.pdf
[islands]: https://www.census.gov/content/dam/Census/library/publications/2015/demo/p23-213.pdf
[guam]: https://www.mcog.guam.gov/villages-list?keyword=capital
[pr-capital]: https://home.treasury.gov/system/files/136/San-Juan-Municipio-Puerto-Rico_2024-Recovery-Plan_SLT-2215.pdf
[pr-member]: https://history.house.gov/People/Listing/H/HERNANDEZ%2C-Pablo-Jose-%28H001103%29/
[vacancies]: https://clerk.house.gov/Members/ViewVacancies
[irs]: https://www.irs.gov/individual-tax-filing
# Internal change guidance follow-up

The separate [change-guidance.json](change-guidance.json) catalog adds internal
expectations to every edition/question/geography row without rewriting these
source-reviewed answers or their dates. It is included in both Supabase tables;
see [field definitions and caveats](../../../supabase/CHANGE_GUIDANCE.md).
