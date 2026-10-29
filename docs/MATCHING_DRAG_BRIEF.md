# Match & Learn: real drag interaction

Owner authorization: implement, verify and publish real dragging of answers in
Match & Learn end to end. GPT-6 Luna implements application and verification
code. Root reviews, executes browser checks and operates Git/Vercel. This
supersedes the original brief's tap-only interaction scope; other game rules,
the new hub gradients and anonymous persistence remain in force.

## Interaction

- Use actual pointer movement for mouse, touch and pen, without a dependency.
  Drag an answer tile onto a question to place it. Drag an assigned answer chip
  onto another question to move it directly. A placed chip can still be tapped
  to remove it. Ordinary answer/question buttons retain tap and keyboard use.
- A small movement threshold separates a tap from a drag. A drag preview follows
  the pointer; eligible questions highlight as drop targets. Full questions are
  visibly unavailable. The preview must not obscure hit testing or controls.
  Never reveal correctness before submitting the round.
- Release over an eligible question to commit once. Release elsewhere, over a
  full question, or cancel to retain the original assignment unchanged. Respect
  each question's required count; one answer tile can occupy only one slot.
  Counters update immediately. Suppress the compatibility click after dragging.
- Capture and track the active pointer. Resolve the final drop from its latest
  coordinates and live assignment references. Ignore unrelated pointers.
  Pointer cancellation, lost capture, Escape, window blur/hidden tab, round
  changes and unmount all cancel cleanly.
- Support scrolling to reach offscreen questions while dragging, with bounded
  edge scrolling. Keep normal page/answer-panel scrolling available outside
  drag surfaces. Cancel every animation frame and listener on completion.
- Submitting or reaching the absolute round deadline cancels any active drag.
  A late release must not mutate frozen results or extend the timer. Reuse the
  current guarded assignment and idempotent submission path.
- Use concise English instructions and an accessible status announcement for
  placements/moves/cancellations. Keep focus visible, touch targets comfortable,
  reduced-motion respected and positioning compatible with the production CSP.

## Scope and verification

- Frontend-only feature: no schema, RPC, question content, answer dates,
  persistence payloads, credentials, analytics or new packages.
- Luna frontend owns the component, focused helpers and styles. Luna QA owns a
  new focused CDP browser script; root owns Chrome so runs do not collide.
- Verify real mouse and touch event sequences, multi-answer placement, moving
  assigned chips, invalid/full-target drops, cancellation, repeated drags,
  ordinary taps/keyboard, mobile scroll reachability and deadline races.
- Run the existing matching flow as a regression for scoring, retries, round
  transitions, final review and session recovery. Run build/typecheck, existing
  unit tests, English and whitespace checks. No implementation-mirroring tests.
- Review safe mobile/desktop board captures. Use only synthetic anonymous
  sessions and log their SHA-256 verifier for exact cleanup; never log codes or
  answer-bearing network payloads. Root verifies the public HTTPS flow, exact
  deployed source/assets, security scan and clean local/remote Git state.
- Update the existing checklist with coder/reviewer attribution and preserve
  private handoff records outside the public repository.
