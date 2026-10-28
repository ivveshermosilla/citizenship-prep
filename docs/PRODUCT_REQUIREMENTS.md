# Product requirements

Confirmed by the owner on October 27, 2026. This records product acceptance
behavior. The local MVP now implements the core interface and session flow;
the first English-only publication is in preparation, with hosting and
provider-retention review still pending.

## Purpose and official sources

The product is an unofficial interactive learning/practice aid for U.S.
naturalization civics questions. It does not replace USCIS or other official
sources. Encourage users strongly to study those sources and corroborate that
what they learn is correct and current.

Show a prominent notice at the start of the application explaining that answers
can depend on the applicable residence/jurisdiction and on an official's period
of service. Some answers can change between monthly updates.

Required English notice:

> IMPORTANT NOTICE: Civic Compass is an unofficial study aid and does not
> replace official sources. Some answers depend on the applicable residence or
> jurisdiction and may change by geography or by an official's term of service.
> Always study with official sources and verify that the information presented
> and learned is correct and current.

All user-facing application text, errors, accessibility labels, metadata and
document title must be English. Use the provisional product name **Civic
Compass**, `lang="en"`, and `en-US` date formatting. Preserve official English
questions and accepted answer options exactly.

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
Do not keep detailed behavior, individual response histories or additional
session metadata by default. Any need to persist the chosen question cohort or
coarse state/district settings must be justified in the later minimal design.
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
The owner has now authorized the minimum local implementation, delegated to
GPT-6 Luna with coordinator review. This supersedes the earlier requirements-only
gate for the scope in [MVP_IMPLEMENTATION_BRIEF.md](MVP_IMPLEMENTATION_BRIEF.md).
Track authorship and review in [IMPLEMENTATION_CHECKLIST.md](IMPLEMENTATION_CHECKLIST.md).
The coordinator does not write application, SQL or test implementation. The
owner has authorized a reviewed first GitHub source publication and dedicated
Vercel static deployment for phone testing. The coordinator reviews and operates
Git/Vercel; Luna prepares the implementation and configuration. Preserve
reproducible local artifacts and keep provider-retention review as a launch limit.
