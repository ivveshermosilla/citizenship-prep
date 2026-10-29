# Match & Learn drag release review

Status: published and verified on the canonical HTTPS app.
GPT-6 Luna implemented the component/styles and the focused browser
verification. Codex (`/root`) reviews, executes checks and publishes.

Answers now support real pointer dragging with mouse, touch and pen. A preview
follows the pointer and question cards show available drop capacity. A valid
release places the answer or moves an already placed answer. Invalid/full-target
drops and cancellation preserve existing assignments. Tap-to-select,
tap-to-remove and standard keyboard controls remain available.

The implementation attempts pointer capture and tracks the active pointer through
component-lifetime window listeners, so movement continues when capture is
unavailable. It uses a movement threshold, guarded live assignment references
and the existing absolute round deadline. Cancellation
handles Escape, lost capture, blur, hidden tabs, submission and round changes.
Compatibility-click suppression follows the canceled pointer through physical
release, so holding it after Escape cannot remove the original answer.
Page/answer-panel edge scrolling supports offscreen targets. Preview positioning
uses measured bounds and the Web Animations API under the existing CSP.

This is a frontend change. No question data, review dates, backend schema/RPC,
saved payloads, retention policies, packages or hub gradients changed.

## Evidence

- Root production build/typecheck, 30 existing unit tests, English-copy check and
  whitespace check passed.
- Root's focused real mouse/touch drag flow passed: tile placement and visible
  counters, direct moves of placed answers, full/outside-target rejection,
  Escape with a further 900 ms physical hold, touch cancellation, subsequent
  intentional taps and native keyboard selection. Mobile edge scrolling was
  measured at 320 px, with 390/1440 responsive checks. A real 80-second Challenge
  deadline saved exactly once while a touch drag remained held; late release
  preserved the saved partial answer state and final review. The synthetic
  session was target-cleaned; follow-up returned zero.
- Root inspected an active mobile drag capture: the preview follows the target,
  remains readable and uses available-slot highlighting without correctness
  feedback. The browser verifier also checks preview bounds and pointer distance.
- Existing full matching browser regression passed locally: both editions,
  UT03/American Samoa/D.C., four responsive widths, touch/keyboard alternatives,
  scoring and review, immutable retry, consecutive Untimed rounds, actual
  Challenge expiry/background timing and session recovery. All three synthetic
  sessions were target-cleaned; follow-up returned zero.
- The complete existing matching flow passed again after the final window-event
  routing correction, including both editions and all four responsive widths.
  Its three synthetic sessions were target-cleaned; follow-up returned zero.

## Publication

- Live: https://naturalization-preparation-app.vercel.app/ — **Match & Learn**.
- Source commit: `4bfecd72d3d816d332ebae364de26c7835eac2c6`.
- Source Vercel deployment: `dpl_Cxzuq7eroCvzSRivqbfhtzd6t1cs`, READY for
  that exact commit.
- [Source Security CI](https://github.com/ivveshermosilla/citizenship-prep/actions/runs/40921469880)
  passed. Staged/full-history scans and Git hooks passed without suppressions.
- Root's full focused drag flow passed on public HTTPS with the real 2025 UT03
  bank. Actual mouse/touch movement placed and relocated answers; invalid/full
  drops, delayed Escape, touch cancel, tap/keyboard alternatives, measured edge
  scrolling and multi-answer counters passed. Preview bounds and distance to
  the real pointer passed; root inspected active mobile/desktop drag captures.
- Holding a touch drag through actual timer expiry produced one minimal round
  save. Late release did not change the frozen partial-answer outcome or final
  review. The public probe was target-cleaned; follow-up returned zero.
- Public HTTP 200, security headers and private-path 404 checks passed. Reviewed
  local build bytes match public JavaScript and CSS. SHA-256:
  `72668b0e25ea52bb0f8ac0dbffdd1541fc141ef809076fcf8d40e5f05d2db5da`
  (JavaScript) and
  `bf8b94f5b73a1a135aab372a6afb518f5d7bc7b9f398ad5d3f2235bfc85bab56`
  (CSS). Production CSP permits the verified preview positioning.

## Limits

Browser checks emulate mouse and touch in Chrome; physical devices and Safari
remain part of owner feedback. Pen uses the same pointer interaction path.
Drop highlighting indicates available answer capacity and does not indicate
whether an answer is correct. Answer selection details remain page-local under
the existing anonymous session policy.
