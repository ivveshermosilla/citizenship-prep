# Local visual refresh review

Implemented by GPT-6 Luna (`/root/luna_branding_refresh`) and reviewed by
Codex (`/root`) on October 27, 2026, America/Denver.

The local app now uses a light blue/cyan visual system, white rounded panels,
sans-serif typography, clearer actions and a locally served U.S.-map/flag SVG.
MatPro and DivisionPro were inspected as design references. The visible
description is **Interactive U.S. Naturalization Test Prep**, and question
selection uses **Question Edition**. Study Cards and Quick Quiz retain their
existing behavior.

## Verification

- Coordinator: production build, four unit tests, English-copy check and
  whitespace checks passed. A scan of tracked and non-ignored source files
  found no secrets. No scanner rules or access policies were weakened.
- Luna: Chrome smoke and full real-backend flow passed at 320, 390, 820 and
  1440 CSS pixels, covering both editions, session recovery, score restoration,
  cards, self-check quiz, official sources and the five-second information notice.
- Coordinator: inspected safe mobile/desktop notice and hub screenshots;
  independently confirmed the notice layouts have no horizontal overflow and
  the local logo loads. SVG inspection found unique IDs and no active content
  or external references. Map geometry provenance and CC0 dedication were
  checked against the linked source in the implementation checklist.
- Coordinator: removed exactly the two synthetic sessions created by this
  browser run using their verifier hashes; a follow-up query found zero
  remaining matching rows. Other sessions were preserved.

## Approved name and release preparation

Following the initial local review, the owner explicitly selected
**Naturalization Preparation App (NPA)** and
`naturalization-preparation-app.vercel.app`. Luna applied the name to the app,
metadata, accessible names, canonical requirements and tests. Phone headers use
NPA, retaining the full accessible name; larger screens show the full name.

The coordinator secured the approved production hostname on the existing Vercel
project with `verified: true`. Final build, four unit tests, English-copy check
and whitespace checks passed. Luna's final browser smoke and full flow passed
at all four widths, including the full/compact brand. The coordinator inspected
safe final mobile/desktop screenshots and target-cleaned the two new synthetic
sessions, then confirmed zero matching rows remained.

The selected-name local review completed before the publication checks below.
Existing recovery codes and database content were preserved.

No schema, answer facts, source-review dates, analytics, session retention rules
or gameplay changes were introduced. Physical-device and other-browser checks
remain part of the owner's testing.

## Public release verified — 2026-10-27 20:07 MDT

The reviewed source commit `cff4a5215c7b3f0bb9c2afbe93473132099b5988` was
pushed to GitHub main. The existing connected Vercel project deployed it with
READY status at [Naturalization Preparation App (NPA)](https://naturalization-preparation-app.vercel.app/).
The previous test hostname returns a 307 redirect to this address.

The coordinator verified anonymous HTTPS 200, the approved title and English
document language, security response headers and the locally served SVG. Public
JS, CSS and SVG bytes match the reviewed production build. Private environment,
Git, source, seed and internal research paths return 404. GitHub Security CI
run 40618924116 succeeded.

Browser smoke and the full real-backend flow passed against the new public
HTTPS URL at all four widths and both editions, including manual recovery,
restored score, unchanged activities and the five-second information notice.
Only the two synthetic sessions from that production run were removed using
their exact verifier hashes. No real-session deletion, schema migration,
tracking SDK, provider-security weakening or factual-answer refresh occurred.
