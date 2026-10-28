# Study Flash Cards review

Implementation is by GPT-6 Luna: frontend and backend agents, with coordinator
review and publication. Local and public HTTPS verification are complete. The release is published.

## Backend verification

- Coordinator reviewed and applied migration
  `20261028031842_flashcard_progress.sql`, matching remote migration history.
  Its SHA-256 is
  `f88c0e81f47472292c10826540e31d608c326c0495fd60d7db8095280afd52c4`.
- Two private tables retain question identifiers, outcome counts/last outcome
  and bounded round-prefix retry receipts. No selected-answer text or audio is
  stored. Parent-session deletion cascades to both tables.
- Guarded RPCs enforce session-code ownership, immediate 168-hour expiry,
  strict payloads, append-only outcome prefixes and bounded counters/receipts.
  Exact retries do not count twice or refresh activity. Public invoker wrappers
  expose only the allowlisted projections; table access remains denied.
- Coordinator executed the rollback flashcard verifier and existing MVP SQL
  verifier successfully. These cover session isolation, malformed payloads,
  altered/shrunk prefixes, append/retry behavior, caps, grants, expiry, cascade
  cleanup and the existing jurisdiction/edition projections.
- Post-migration Supabase security advisor returned no lints.
- Backend Luna's real HTTP test passed simultaneous identical-prefix requests,
  simultaneous suffix appends, exact retries, invalid requests and isolation
  between two sessions. Coordinator inspected the script and removed exactly
  its two synthetic sessions by verifier hash; a follow-up found zero matches.

## Frontend and release

Local review completed on 2026-10-28 00:21 MDT.

- Coordinator independently passed the production build, 18 unit tests, English
  checks and whitespace checks; reviewed the React state flow and safe notice,
  settings, card and hub screenshots.
- Luna's full real Chrome/Supabase flow passed synchronized number/slider
  editing, topic/range and rolling-size limits, touch-driven study and tests,
  correct/incorrect outcomes, a real 15-second timeout saved as Skipped,
  cumulative rounds, recovery and both editions.
- The coordinator checked live option generation for both full question projections (100 and 128 questions), unique options and complete multi-item accepted answer sets.
  Full-bank generation took 14–16 ms locally after the conservative typed-pool
  optimization. Distractors are deliberately provisional: numerical counts
  for nonnumeric prompts, historical names for numerical/date prompts.
- Retry prefixes remain fixed while a save is pending. Card-review reservations
  prevent rapid flips from double-counting. Acknowledged question ordinals stay
  fixed until Continue; session activity is refreshed on return to the hub.
- Coordinator target-cleaned both final local-browser synthetic sessions and
  verified zero matching rows remained. Earlier failed synthetic runs were
  also target-cleaned; no real-user deletion.
- Both complete question-table fingerprints and all actual review dates remain
  unchanged. No new dependencies, tracking, microphone permissions or service
  credentials were introduced.

Git publication and public HTTPS verification completed as recorded below.

Speech recording, prerecorded narration, realistic curated distractors and an
official-exam simulation remain future work. Practice-test outcomes are client
evaluated learning data and are separate from the legacy self-assessed quiz.

## Public release — 2026-10-28 00:23 MDT

Source commit `6307dd1d18d001d4c1fd7db433874d7d9e18738f` was published to
GitHub main and deployed READY by the existing Vercel project.
[Study Flash Cards is live in NPA](https://naturalization-preparation-app.vercel.app/).
GitHub Security CI run 40643360541 succeeded.

The coordinator ran smoke and the full real-browser flow against the canonical
public HTTPS URL. It passed both editions, four viewport widths, touch-driven
study/test actions, synchronized topic/range/rolling controls, known correct and
incorrect outcomes, a real 15-second timeout persisted as Skipped, manual code
recovery and restored scores. Safe public screenshots were inspected, including
the balanced mobile hub. Only the two synthetic sessions from this run were
removed by their exact verifier hashes.

Anonymous HTTP 200, English language, security headers, private/source paths returning 404
and byte-identical reviewed JS/CSS/SVG were verified. No deployment protection,
secret scans, seven-day session policy or official answer dates were weakened.
