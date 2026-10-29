# Product requirements

Confirmed by the owner on October 27, 2026. This records product acceptance
behavior. The English-only MVP implements the core interface and session flow.
The initial phone-test release used the provisional Civic Compass name and old
Vercel alias; the owner has since selected Naturalization Preparation App (NPA) and
`naturalization-preparation-app.vercel.app` as the canonical name and hostname.
The refreshed NPA release is published and verified; see BRANDING_REFRESH_REVIEW.md. Provider technical
logging is disclosed; infrastructure-wide zero logging or backup erasure is not
promised. See FIRST_PUBLICATION.md for release checks and remaining limits.

## Purpose and official sources

The product is an unofficial interactive learning/practice aid for U.S.
naturalization civics questions. It does not replace USCIS or other official
sources. Encourage users strongly to study those sources and corroborate that
what they learn is correct and current.

Show a prominent notice at the start of the application explaining that answers
can depend on the applicable residence/jurisdiction and on an official's period
of service. Some answers can change between monthly updates.

Required English notice:

> IMPORTANT NOTICE: Naturalization Preparation App (NPA) is an unofficial study
> aid and does not replace official sources. Some answers depend on the
> applicable residence or jurisdiction and may change by geography or by an
> official's term of service.
> Always study with official sources and verify that the information presented
> and learned is correct and current.

All user-facing application text, errors, accessibility labels, metadata and
document title must be English. Use **Naturalization Preparation App (NPA)** as
the product name, displaying NPA on compact phone headers when needed while
keeping the full name accessible. The approved canonical hostname is
`naturalization-preparation-app.vercel.app`; use `lang="en"` and `en-US` date
formatting. Preserve official English questions and accepted answer options
exactly.

Link to USCIS study/test-update pages and the relevant official source for each
changing local answer. Product copy must not expose database or account details.

## Modern appearance and mobile-first experience

Owner policy: the interactive tool must have a modern appearance and work across
devices, prioritizing mobile use. These are design requirements only; no UI,
framework, component library or visual identity is selected by this policy.

- Design the complete experience for small phone screens first, then adapt it
  to tablets and desktop/laptop screens. Keep every core feature available on
  each device class, including notices, code recovery, the hub and minigames.
- Use clear visual hierarchy, readable typography, consistent controls and
  comfortable spacing. Choose colors, fonts, illustration style and exact layout
  in the implementation brief; it does not independently choose a visual
  identity or component library.
- Make layouts responsive to screen width and orientation without clipped
  content, overlapping controls or unnecessary horizontal scrolling. Preserve
  readability when text is enlarged or the on-screen keyboard opens.
- Prioritize comfortable touch interaction. Also support mouse and keyboard;
  no required action or information may depend exclusively on hovering. Keep
  the question-information bubble accessible by tap and keyboard as specified.
- Include readable contrast, visible keyboard focus, meaningful control labels
  and reduced-motion support in the design. Visual effects must not obstruct
  learning or navigation.
- Owner update: give each game a distinct gradient on its hub card. Study Flash
  Cards uses purple/indigo, Match & Learn uses orange/terracotta, and Quick Quiz
  retains its blue/turquoise gradient. Keep names and icons alongside color so
  users can distinguish games without relying on color alone.
- Keep loading and interactions lightweight for mobile devices and connections.
  Validate the complete flow on representative phones, tablets and desktop
  browsers before release; define the browser/device test matrix during
  implementation rather than treating responsive styling as proof of support.

## Anonymous use and minimal session storage

Owner policy: the application must work entirely without identifying its users.
Reflect this in both the interface and implementation. No accounts, registration,
names, email addresses, immigration identifiers, exact filing dates, addresses,
identity providers, advertising, analytics, session replay, fingerprinting, or
user-tracking integrations. Do not infer location or request device geolocation.

The owner also explicitly wants progress retained in Supabase. Therefore the
precise promise is **no personal-data collection or tracking**, with the minimum
anonymous game-session state necessary to resume. Do not claim that no data of
any kind is stored: scores and session timestamps are data. Treat the session
identifier and progress as private, even without a named account.

Retain only the score/progress needed to continue, session creation time, last
meaningful activity time, and the minimum protected recovery-code reference.
For the owner-approved timed practice test, persist only question IDs, bounded
correct/incorrect/skipped counts, last outcome, and bounded retry receipts for
the current round prefix. Do not persist answer text, selected options, detailed
navigation history, or raw individual response histories. This minimal
per-question outcome projection supersedes the earlier default prohibition on
question-level outcomes. The selected edition and coarse jurisdiction remain
necessary to restore the correct official question set.
Ask only for the before/on-or-after cohort, rather than the actual N-400 filing
date; do not ask for an address to resolve the district.

Before publishing, review provider access logs, error reporting, backups, client
storage and third-party requests for compatibility with this policy. Never log
recovery codes, request bodies containing them, or personal/device identifiers
in application telemetry. Do not promise infrastructure-wide zero collection
or complete seven-day backup erasure without verifying the provider settings
and retention behavior. This is a future deployment acceptance requirement,
not a claim that those settings have already been audited.

## Entry screens and recovery flow

1. On entry, present the previously defined notices as successive screens, each
   with an advance button. Include the unofficial-aid, official-source,
   geographic/service-period and anonymous-session explanations.
2. Under the advance button on each notice screen, show **Resume previous
   session**. It opens code entry; possessing a valid, active code allows the
   user to resume from any of these screens without finishing the notice sequence.
3. At the end of the notices, offer **New session** and **Resume previous
   session**. Resume always uses the same code-entry flow.
4. A new session shows a newly generated, unique and unguessable recovery code,
   with clear instructions to save it. Explain that it is the only key to this
   progress, that anyone possessing it can use the session, and that there is no
   email/identity-based recovery. Losing it means starting a new session.
5. A successful resume goes **directly to the learning minigame hub** with the
   retained score/progress. Do not force the returning user through the notices
   or new-session flow again. Exact new-session selector order and hub layout
   remain for the later interface design.

The owner's phrase "encrypted and unique" specifies the protection goal, not
an encryption algorithm. Later implementation must generate a cryptographically
random code, protect the server-side reference with a suitable one-way verifier,
enforce uniqueness, and prevent access to other sessions. Avoid storing the
usable plaintext recovery code in the database, logs, URLs or analytics. Choose
the format, length, browser handling and authorization mechanism during the
implementation design; none is implemented or selected here. No account or
Supabase Auth user is required or authorized merely to provide code recovery.

## Seven-day inactivity expiration

- Accumulate score/progress from session creation through its latest activity.
- Expire the session after **seven consecutive days (168 elapsed hours)** with
  no meaningful activity, measured from the last activity rather than creation.
  Timezone/daylight-saving changes must not alter this duration.
- Successful resumption and genuine gameplay count as activity. Define the
  exact event set later; failed code guesses, background polling or passive
  heartbeats must not keep sessions alive indefinitely.
- At or beyond the expiration threshold, reject resume and score updates. An
  expired code cannot revive a session, even if a deletion task has not run yet.
- Automatically delete expired session records and their associated progress
  from active Supabase storage; then require a new session from the beginning.
  Session retention must not create indefinite histories or orphan records.
- The local MVP uses an hourly `pg_cron` cleanup job after exact 168-hour access
  expiry. Physical deletion may take up to the next hourly run. Verify scheduled
  job health and provider retention settings before making stronger deployment
  promises.
- This future cleanup is separate from the **monthly civics-content review**.
  The monthly content policy does not govern session expiration/deletion.

Required English session notice:

> No account or personal information is required. We store only the minimum
> progress needed to resume this anonymous session. Save your code to continue:
> it is the only key to this progress; do not share it. After 7 days without
> activity, the session expires and its progress is deleted. You will need to
> start a new session. We do not ask for identity details or use tracking
> analytics. Hosting and database providers may retain technical
> request/security logs under their own policies.

This is proposed copy; verify the implemented storage, cleanup and provider
retention behavior before publishing it.

## Entry selectors

- N-400 filed **before October 20, 2025**: 2008 bank, 100 distinct questions.
- N-400 filed **on or after October 20, 2025**: 2025 bank, 128 distinct questions.
- The filing-date cohort selects the bank; the interview year does not replace
  it. Do not collect the exact filing date.
- Ask for the applicable state/territory. Do not infer it from this computer's
  timezone, browser position, or an unrelated office address. Do not silently
  treat the physical location of an interview office as a replacement for the
  applicable residence/jurisdiction.
- The House-representative question also needs the applicable congressional
  district. Automatically choose an at-large/nonvoting district only when the
  selected jurisdiction has exactly one catalog entry; otherwise ask for the
  district or provide an official lookup. A state alone is insufficient.
- Keep the 65/20 subset markers available; its eligibility/selector flow has not
  yet been designed.

## Monthly maintenance

- Update/review the dataset **once per calendar month**. This supersedes all
  prior weekly, next-day, thirty-day and per-class cadence recommendations.
- Record the actual dataset/source-review date and calculate the next date by
  adding one calendar month, with normal end-of-month clamping.
- Current verified dataset: October 27, 2026. Next monthly date: November 27, 2026.
- Import time is not a new factual verification date. Do not change the recorded
  answer date unless the dataset has actually been reviewed against sources.
- Term ends and elections remain informative metadata, not extra scheduled
  updates or automatic answer expiration dates.
- No cron job, autonomous updater or reminder is requested by this requirement.

## Study Flash Cards and timed practice test

The current local implementation follows [the approved feature brief](FLASHCARDS_IMPLEMENTATION_BRIEF.md).
Study Flash Cards opens setup first and supports random, in-order, official
section/subsection, and inclusive question-range selections. An optional test
uses four complete answer sets, one correct, with a 15-second elapsed deadline.
Skip and timeout are recorded separately from incorrect answers. With rolling
review enabled, each round studies and tests the cumulative prefix of the same
deck; repeated question presentations are counted in the displayed percentage.

Only per-question IDs, outcome counts and last outcome are stored. Quick Quiz
continues to use its separate self-assessed aggregate. Leaving or reloading
abandons the in-memory deck and unfinished test, while confirmed outcomes stay
saved. This practice percentage is not an official test score, pass/fail result,
or competition result. Voice input, microphone permission, speech evaluation,
prerecorded narration, and an official 20-question simulation remain future work.

## Quick Question

The owner separately approved an untimed written question directly in the hub.
Use the session's edition and jurisdiction projection, choose a random question
and avoid immediate repetition when the user requests Another question. Render
one text field per required concept; accept fields in any order only when each
exactly matches a reviewed canonical answer or reviewed variant and the concepts
are distinct. Normalize case, diacritic variants in names, optional hyphens,
extra spacing and immaterial punctuation. Do not use substring, fuzzy,
bag-of-words or AI paraphrase grading.

Check and Skip both reveal feedback with the existing flash-card rotation.
Show the canonical official answer display (including former-officeholder
context for a vacancy), not parser-only grading aliases, with the actual answer
date, official source links and dependent-answer notice. Preserve one attempt
UUID through safe retries and wait for durable save before Another question.
All-empty Check is Skipped;
partial or invalid content is Incorrect. Leaving without submission records
nothing. Keep typed text in memory only and send only question ID, outcome and
attempt UUID in the written-result RPC.

The written activity remains separate from the old self-assessed Quick Quiz.
Written and multiple-choice counts appear separately in the hub, while the
aggregate per-question error count feeds missed-question prioritization. The
written UI and reviewed-metadata frontend have passed the local browser flow
against the approved catalog and RPCs. Root verified all 1,438 geographic rows;
the [release review](QUICK_QUESTION_REVIEW.md) records publication checks. See
[the Quick Question implementation brief](QUICK_QUESTION_IMPLEMENTATION_BRIEF.md).

Written answers stay in component memory only. The submission sends the
question number, outcome and one attempt UUID; it does not send the typed
strings or a derived hash. Written outcomes and multiple-choice outcomes have
separate progress projections, with a combined projection used only for review
priority. Quick Quiz remains a separate self-assessed total.

## Match & Learn

Match & Learn opens from the hub and uses only the current session's edition,
jurisdiction, and reviewed `PracticeMetadata`. Settings default to 12 distinct
questions, four per round, and Standard pace. Users may select 4 or 5 questions
per round, 4–30 questions bounded by reviewed availability, Relaxed (30 seconds
per question), Standard (22.5 seconds), Challenge (15 seconds), or Untimed.
Each additional required answer adds 10 seconds to the question's allowance.
The app shows the generated round count and actual allowance before play.
Prioritize missed uses saved aggregate question outcomes when present and stays
within the active edition and jurisdiction.

Each board contains one tile for each selected reviewed answer concept, with
at most ten tiles. The builder rejects overlapping normalized aliases across
questions and packs all selected questions into safely compatible rounds,
including smaller rounds when needed. Players tap or keyboard-activate a
question and a tile in either order; they can remove assignments until submit.
Progress shows placed answer slots and does not reveal correctness. Submission
locks the round, grades by question against reviewed aliases, and saves only
one `{question_number, outcome}` per question with a round UUID. The absolute
wall-clock timer continues when the tab is hidden. Identical retries reuse the
same UUID and outcomes. Leaving an unfinished round requires confirmation and
does not create attempts for it.

Correct requires the required number of distinct valid concepts. An incorrect
assigned concept makes the question Incorrect. An unanswered or incomplete
question with only valid assignments is Skipped. Skipped counts as unsuccessful
in the practice percentage. After the last round, the page shows Correct,
Incorrect and Skipped totals plus page-local match detail: placed answers,
missing slots, one example accepted set, all accepted answers, answer date and
official source links. Navigating away or reloading clears this detail; the
anonymous session retains only aggregate per-question matching outcome counts.
Matching totals are separate from written and multiple-choice totals, while the
aggregate history remains available for missed-question priority. There are no
raw answer strings, tile IDs, answer labels, detailed review payloads, or
answer-text hashes in remote storage or browser storage.

## Internal change expectations

Keep optional expected-change dates/windows alongside the corresponding question
and geography in both Supabase banks. This is administrative guidance, not
end-user copy. Record the basis, sources, assessment date and uncertainty. Each
valid senator answer needs its own timeline; a single state's earliest checkpoint
does not replace those individual dates. Re-election can preserve a name and
unexpected succession can change it earlier. Leave dates null when no scheduled
change exists, with an explicit explanation.

Provide an internal `possibly_outdated` signal with reasons. A reached checkpoint,
overdue/due monthly review for a time-dependent answer, or a manual incident flag
requests verification; it does not prove the response incorrect. Evaluate this
when the administrative view is read. Keep the monthly review schedule and
recorded answer date separate. No additional job, notification, or user-interface
indicator is authorized here. See [database guide](../supabase/CHANGE_GUIDANCE.md).

## Vacancies

The game answer is **Vacant**. Display the former occupant in parentheses:

- English template: `Vacant (previously: {previous_officeholder})`.

Keep the canonical answer and former-occupant metadata separate. The previous
name must not be treated as the current officeholder or accepted as the current
name. Preserve the vacancy source and prior-holder identity for monthly review.
This is the game's answer/display rule, not a claim about USCIS interview grading.

## Per-question freshness notice

Depending on the game mode, show the exact heading:

> IMPORTANT NOTICE FOR THIS QUESTION

Pair it with a circled information icon (`ⓘ`). On hover or tap, show a bubble for
**5 seconds**, then fade it out. Keyboard activation/focus must also make the
information available. A later interaction can show it again. Exact mode
placement and fade duration remain design choices for the UI phase.

Required English bubble text:

> This answer was last updated on {answer_updated_on}. Check the official
> sources to confirm that the answer is current.

Use the recorded answer date, not the current device date. Geographic/time
dependency flags and vacancy status let the UI decide where the notice is
relevant; do not remove the underlying source links in a game mode.

## Current implementation scope

The two Supabase question banks and internal change guidance are already loaded.
The owner authorized the minimum local implementation, delegated to GPT-6 Luna
with coordinator review. The approved product name and canonical hostname are
Naturalization Preparation App (NPA) and `naturalization-preparation-app.vercel.app`;
the earlier Civic Compass name and test alias are historical only. This supersedes the earlier requirements-only
gate for the scope in [MVP_IMPLEMENTATION_BRIEF.md](MVP_IMPLEMENTATION_BRIEF.md).
Track authorship and review in [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md).
The coordinator does not write application, SQL or test implementation. The
owner has authorized a reviewed first GitHub source publication and dedicated
Vercel static deployment for phone testing. The coordinator reviews and operates
Git/Vercel; Luna prepares the implementation and configuration. Preserve
reproducible local artifacts and keep provider-retention review as a launch limit.
