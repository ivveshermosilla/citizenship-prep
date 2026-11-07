# Monthly answer review — November 7, 2026

This review follows the October 27 source snapshot. It rechecked all current
officeholder and time-dependent study-response rows after the U.S. elections.
Regular election winners remain future officeholders until they take office.
No current answer name, status, accepted answer array, or vacancy predecessor
changed. The November 3 election did not itself replace an incumbent.

## Scope and result

- Verified all 100 Senate identities, states, parties, and classes against the
  Senate's current XML directory; all 55 governor names against the live NGA
  roster; and all 441 House rows against current Clerk data, including bioguide
  identifiers and the `AQ00` source-code to `AS00` app mapping.
- Confirmed FL20 and TX23 remain vacant. `Vacant` and the previous-holder display
  names remain unchanged.
- Rechecked both official USCIS PDFs. Their SHA-256 hashes match the October 27
  copies. The current updates page still supports the national current names,
  party, Chief Justice, and nine-justice answers. The 2025 Chief Justice answer
  includes the shorter form `Roberts`; the local and live answer sets already
  contain it, so this review makes no answer correction.
- Updated review dates only for 1,131 time-dependent rows: 566 in the 2008 bank
  and 565 in the 2025 bank. Their next monthly review date is December 7, 2026.
  The other 307 rows remain dated October 27, with a November 27 next review.
- Updated the Senate source citation from its prior PDF directory to the
  November 6 official XML roster, and added the official Supreme Court
  biography page as corroborating provenance for 2025 Q57.
- Updated only the Oklahoma senator expectation in the two editions. The
  Oklahoma Attorney General says the appointed Alan Armstrong serves until the
  elected successor takes the oath after certification. November 3 through
  January 3 is an editorial review window, not a promised transition date.
  Armstrong remains the current answer until succession is confirmed. The
  South Carolina appointment still has the January 3, 2027 checkpoint.

The root-reviewed source evidence, retrieval hashes, current-answer findings,
and limitations are in [official-source-checks.json](official-source-checks.json).
The scoped counts, prior database fingerprints, and generated artifacts are in
[review-manifest.json](review-manifest.json). The date-only, guarded database
patch is [2026-11-07-time-dependent-refresh.sql](../../supabase/content-updates/2026-11-07-time-dependent-refresh.sql).
The current 1,438-row [review schedule](../2026-10-27/answers/review-schedule.csv)
lists both due dates.

## Reproduction and validation

```sh
python3 scripts/build-supabase-seed.py
python3 scripts/build-scoped-content-refresh.py
python3 scripts/test_scoped_content_refresh.py
```

The scoped SQL checks both exact before-state fingerprints, old review dates,
and expected affected-row counts. It updates no answer arrays or vacancy names.
The post-refresh read-only SQL verifier is
`supabase/tests/verify_2026_11_07_content_refresh.sql`. Database execution and
read-only checks passed against the dedicated Supabase project; root applied the
patch after a rollback dry run and a deliberate wrong-fingerprint rejection.
The root-run public browser flow also passed both cohorts, the study and written
practice flows, timeout handling, session recovery, touch input, and responsive
layouts; its two synthetic sessions were removed by exact verifier hashes.
Source release: [cdfdfbbc2c0682024ab85f9f20ddfc910132133a](https://github.com/ivveshermosilla/citizenship-prep/commit/cdfdfbbc2c0682024ab85f9f20ddfc910132133a).
[Security CI 42400515396](https://github.com/ivveshermosilla/citizenship-prep/actions/runs/42400515396)
passed. Vercel production deployment `dpl_HuJWHSkj7zrPM5ckTjCHFHvTLvyq`
reached READY at the [canonical NPA URL](https://naturalization-preparation-app.vercel.app/).
The coordinator verified anonymous HTTP 200, production JavaScript/CSS equality
with the local build, and browser checks at 320/390/820/1440 pixels. This
publication record is a documentation follow-up to the verified source release.
