# Match & Learn drag release review

Status: local drag verification passed; publication verification in progress.
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
- Public HTTPS verification, exact deployment/assets and security CI: pending.

## Limits

Browser checks emulate mouse and touch in Chrome; physical devices and Safari
remain part of owner feedback. Pen uses the same pointer interaction path.
Drop highlighting indicates available answer capacity and does not indicate
whether an answer is correct. Answer selection details remain page-local under
the existing anonymous session policy.
