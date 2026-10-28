# Official civics question research — October 27, 2026

This directory preserves the original local question-only research and metadata.
The original question JSON/CSV snapshots contain no answers. The subsequently
authorized [answer follow-up](answers/README.md) adds current responses for all
states and districts with suggested update dates in a separate directory.
The two Supabase banks are now loaded privately. Vercel remains untouched, and
these Git changes have not been committed or pushed.

## Editions and publication dates

The latest question-bank edition identified in the official sources checked is
the **2025 Naturalization Civics Test**, containing **128 questions**. It applies
to N-400 applications filed **on or after October 20, 2025**. The **2008 test**
still applies to applications filed before that date, so its 100 questions are
collected separately. Filing date determines the applicable edition, rather than
the year of study or interview. [USCIS overview][study], [policy manual][policy].

| Date or label | Evidence and meaning |
| --- | --- |
| 2025, M-1778 (09/25) | Edition and printed month-level identifier on the 128-question PDF. |
| September 17, 2025 | USCIS announcement release date and 2025 landing-page review date. |
| September 18, 2025 | Federal Register publication: 2025-18050, 90 FR 45047–45050. |
| October 20, 2025 | Filing-date cutoff for applicability of the 2025 test. |
| October 14, 2025 | Observed embedded PDF modification and HTTP Last-Modified date; not proof of first publication. |
| Exact first publication day of the downloaded PDF | Not established. The edition label and file metadata do not establish it. |
| Next edition or retirement date | No announced date identified in the consulted official sources. |

Sources: [USCIS announcement][announcement], [2025 landing page][2025-page],
[official 2025 PDF][2025-pdf], [Federal Register notice][notice]. Exact hashes,
file timestamps and retrieval details are in [sources.json](sources.json).

The currently linked 2008 PDF is marked **rev. 08/21**. Its observed modification
date is August 26, 2025; that does not make it a 2025 test. The exact initial
publication day of that revision was not established. The older official URL
`100q.pdf` still serves rev. 01/19, so this collection instead uses the newer
rev. 08/21 PDF linked by the current study page. [Official 2008 PDF][2008-pdf].

## Possible future updates

USCIS describes updates on a **rolling basis**, including elections, judicial
appointments, statutory changes, and other updates. The public bank and study
materials are revised when applicable. The sources checked do not establish an
annual replacement cycle or a scheduled next edition. A third-party title
advertising “2026 questions” does not establish an official 2026 edition.
[USCIS policy manual][policy], [test updates][updates].

A Federal Register API search for “civics test,” bounded from September 18, 2025
through October 27, 2026, returned the 2025 implementation notice and a 2026
naturalization-fee notice, without identifying a newer replacement bank. This
is bounded research evidence, not a guarantee about every possible notice. The
exact query and result metadata are preserved in sources.json.

The owner subsequently selected **one calendar month** as the maintenance cadence,
superseding the original research's shorter/per-class suggestions. Current policy
and all active answer dates are in [answers/maintenance-policy.json](answers/maintenance-policy.json).
The question-only snapshots retain historical analysis as provenance; their old
interval fields must not override this policy. Current dataset update date:
October 27, 2026; next monthly review: November 27, 2026. Import time is separate.

## Question-only collection

| Edition | JSON | CSV | Records | National | Residence-dependent |
| --- | --- | --- | ---: | ---: | ---: |
| 2025 | [questions-2025.json](questions-2025.json) | [questions-2025.csv](questions-2025.csv) | 128 | 124 | 4 |
| 2008 | [questions-2008.json](questions-2008.json) | [questions-2008.csv](questions-2008.csv) | 100 | 96 | 4 |

There are **228 edition-specific records**, not 228 distinct facts: the banks
overlap. Never merge them by unqualified question number. Each bank preserves
official numbering, sections, source pages, and its 20 starred 65/20 questions.
No applicant's eligibility for that subset is assumed.

[editions.json](editions.json) records edition applicability and date evidence.
The prompts preserve official English wording, with normalized layout whitespace,
star markers moved into metadata, and extraction control characters removed.
One bracketed USCIS officer note is separated from its prompt. Source PDFs with
answers were used temporarily and are not retained in the project.

## Geographic dependency

Geography and time are separate dimensions. A national question can change over
time; a state-dependent question can remain stable. Tags describe the context
needed to identify the relevant fact, not whether a question mentions states.

| Scope | Meaning |
| --- | --- |
| `national` | No applicant state/district needed; this does not imply permanent truth. |
| `state_or_territory` | Applicant's jurisdiction needed; special jurisdiction rules need review. |
| `congressional_district` | Applicant's state/jurisdiction and House district needed; a state alone may be insufficient. |

The four residence-dependent prompts in each bank are:

| Topic, without its answer | 2025 # | 2008 # | Geography and time |
| --- | ---: | ---: | --- |
| Current U.S. senator for the applicant's state | 23 | 20 | State/jurisdiction; federal office. Incumbency and selected seat's term matter. |
| Applicant's U.S. representative | 29 | 23 | Congressional district; federal office. Incumbency, term and district changes matter. |
| Current governor | 61 | 43 | State/jurisdiction; state office. State-specific term and succession rules matter. |
| State capital | 62 | 44 | State/jurisdiction. No ordinary election-driven expiration; review designation or residence changes. |

The national current-officeholder prompts are 2025 **30, 38, 39, 57** and 2008
**28, 29, 40, 47**. The 2008 bank also asks about current presidential party in
**46**. Including the residence-dependent offices gives seven officeholder
records in 2025 and eight officeholder/affiliation records in 2008. Current names
and party responses are omitted from the original question-only snapshots and
stored separately in the answer follow-up.

Other change-sensitive topics have separate tags: institutional counts, Cabinet
roles, legal rules, party structure, official recognition lists, holidays, and
the 2008 tax-calendar prompt. Open-ended historical sets can gain examples
without necessarily invalidating existing examples.

## Expiration versus review checkpoints

A question's wording, its edition's applicability, and a future answer's factual
validity are separate. Every record has `question_valid_until: null` because no
official question-specific expiration date was established. Null means **no
established scheduled expiration**, not “valid forever.” USCIS can revise or
retire a prompt or edition at any time.

Regular term boundaries are useful review checkpoints. They are not guaranteed
answer-expiration dates: succession, resignation, vacancies, appointments, or
other changes may require an earlier update. Election day alone generally does
not mark when a replacement takes office. The checkpoints below are editorial
inferences from regular constitutional cycles, not USCIS bank-renewal dates.
[Constitution, Articles I and II][constitution], [20th Amendment][amendments],
[Supreme Court FAQ][court].

| Dependency | Tentative review checkpoint | Limitation |
| --- | --- | --- |
| President / vice president | January 20, 2029 | Regular term boundary; succession may require an earlier change. |
| House representative | January 3, 2027 | Regular term boundary; check vacancies and district changes sooner. |
| Speaker | January 3, 2027 onward | Next Congress organization checkpoint; election may be later, replacement may be earlier. |
| State's senator | January 3, 2027 as partial-renewal checkpoint | Not all senators' terms end then. A specific end date requires state, seat and class. |
| Governor | No nationwide date | Requires jurisdiction-specific term and inauguration rules. |
| Chief Justice | No fixed term-end date | Appointment/vacancy-driven review. |
| State capital / historical topics | No regular term-based date | Review authoritative changes, corrections, and USCIS revisions. |

No officeholder was selected, no actual incumbent term-end record was created,
and no automated reminders were scheduled.

## Metadata interpretation

Question wording, numbers, sections, and star markers come from USCIS.
**Geographic/temporal labels, volatility, review dates and intervals are editorial
analysis**, marked `classification_is_editorial: true`.

- `id`: edition-qualified identifier; use instead of an unqualified number.
- `geographic_scope`, `depends_on_applicant_residence`, and
  `required_location_inputs`: geographic context for a future application.
- `temporal_class`, `volatility`, `expiry_model`, and `review_triggers`: change
  mechanism and review priority. Low volatility does not mean immutable.
- `question_valid_until`: authoritative retirement date if established;
  currently null for every record.
- `scheduled_review_on`, `scheduled_review_kind`, and `review_note`: optional
  regular-cycle checkpoint and its limitations. `scheduled_review_is_expiration`
  is always false.
- `suggested_review_interval_days`: editorial maintenance recommendation.
- `source_id`, `source_page`, and `checked_as_of`: provenance and research date.

This is research, not a Supabase migration or final application schema. The
answer follow-up stores jurisdiction, sources, verification dates and suggested
review dates separately. Future application persistence still needs its own
effective-interval and change-trigger design.

## Validation and limitations

- Direct HTTPS retrieval from USCIS succeeded. The browser research tool returned
  403 for several USCIS pages/PDFs; sources were read directly instead.
- The 2008 source was selected from the live study-page link, avoiding the older
  still-accessible `100q.pdf` document.
- All 128/100 numbers occur exactly once; each bank has 20 starred records.
  Section boundaries, source pages, and extracted question text were checked.
  JSON and CSV were compared and the files scanned for secrets.
- The original question-only snapshots contain no response values or source
  answer bullets. The later answer follow-up has separate source and validation
  records. Raw source PDFs are not retained in either collection.
- No state, district, filing date, or interview date was assumed for the user.
- Scope is the published civics banks, excluding English reading/writing
  exercises and personal N-400 interview questions.
- Freshness is limited to October 27, 2026; recheck sources before future use
  or publication as study guidance.

[study]: https://www.uscis.gov/citizenship/find-study-materials-and-resources/study-for-the-test
[policy]: https://www.uscis.gov/policy-manual/volume-12-part-e-chapter-2
[announcement]: https://www.uscis.gov/newsroom/news-releases/uscis-unveils-first-changes-to-naturalization-test-in-multi-step-overhaul-of-american-citizenship
[2025-page]: https://www.uscis.gov/citizenship-resource-center/naturalization-test-and-study-resources/2025-civics-test
[2025-pdf]: https://www.uscis.gov/sites/default/files/document/questions-and-answers/2025-Civics-Test-128-Questions-and-Answers.pdf
[2008-pdf]: https://www.uscis.gov/sites/default/files/document/questions-and-answers/OoC_100_Questions_2008_Civics_Test_V1.pdf
[notice]: https://www.federalregister.gov/documents/2025/09/18/2025-18050/notice-of-implementation-of-2025-naturalization-civics-test
[updates]: https://www.uscis.gov/citizenship/find-study-materials-and-resources/check-for-test-updates
[constitution]: https://www.archives.gov/founding-docs/constitution-transcript
[amendments]: https://www.archives.gov/founding-docs/amendments-11-27
[court]: https://www.supremecourt.gov/about/faq_general.aspx
