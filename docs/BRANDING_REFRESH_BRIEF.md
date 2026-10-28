# Owner-directed branding and first visual refresh

The owner rejected the coordinator-selected Civic Compass brand and generated
`citizenship-prep-sandy.vercel.app` alias. The owner explicitly selected
**Naturalization Preparation App (NPA)** with the proposed URL
`naturalization-preparation-app.vercel.app`. Use that exact full name and
approved abbreviation consistently. The coordinator checks and configures the
URL on the existing project, then publishes the reviewed refresh. Use NPA on
compact screens if needed, retaining the full accessible name.

## Requested corrections

- Replace the small study-guide tagline with **Interactive U.S. Naturalization
  Test Prep**, a concise English description of the requested interactive tool.
- Replace user-visible “bank” vocabulary with **Question Edition**, using 2008
  or 2025 where a year is appropriate. Selector options can say “2008 edition ·
  100 questions” and “2025 edition · 128 questions”. Do not change the N-400
  cutoff, underlying edition identifiers, actual review dates or official content.
- Replace the letter-in-a-circle logo with a self-hosted SVG showing a
  recognizable U.S. country silhouette filled with stars/stripes of the flag.
  Use credible geographic geometry, not a rough generic polygon. Preserve
  compatible licensing/provenance; no external runtime image/font requests.
  Make the logo clear at mobile-header size. Use accessible markup and an SVG
  favicon where appropriate, with no external scripts or active SVG content.
- Make the visual system more professional and modern, using the owner's
  MatPro and DivisionPro as explicit design references. Keep the accepted
  notice/setup/recovery flow and session behavior. Prioritize mobile.
- Keep **Study Cards** and **Quick Quiz** functionality unchanged. The owner
  recognizes that they currently overlap and explicitly deferred changes to
  their learning mechanics. No extra minigames, grading modes or stored data.

## Reference inspection

Inspect styling and app structure only; do not copy unrelated game logic,
identity/persistence/ranking systems, multilingual controls, personal project
stories, analytics or account configuration from the reference repositories.

- [MatPro](https://github.com/ivveshermosilla/matpro-triple-method), inspected
  main commit `ff0c2488e412db90ff2bac7db086acb102df12c5`.
- [DivisionPro](https://github.com/ivveshermosilla/DivisionPro), inspected main
  commit `257b32b37693fade5dc5dc92c3ce0668f6581ae2`.
- Both current references use `assets/css/styles.css` and `index.html`.
- Their live entry screens were also inspected in Chrome at 1440px. Both
  present a compact rounded header, a prominent white central panel, clear
  primary/secondary actions and a soft blue/cyan background wash. Use those
  visual relationships without importing their language-selection step.
- Shared direction: clean sans-serif typography, cool light backgrounds,
  white/surface panels, blue/cyan with restrained mint accents, consistent
  rounded cards, subtle depth, a compact app-style topbar and clear actions.
  Apply that quality/direction coherently rather than adding more decorative
  effects to the existing serif/green postcard design.
- Keep touch targets, focus indicators, contrast, reduced motion and legibility
  at 320/390/820/1440px. Do not hide overflow to conceal layout problems.

## Responsibilities and release gate

GPT-6 Luna implements all app/SVG/CSS/test/config changes. Root writes scope,
reviews and performs Git/Vercel operations. No other implementation agents.
Add a BR section to IMPLEMENTATION_CHECKLIST.md with actual progress,
Codificado por and Revisado por. Only root marks verified.

The earlier independent tagline, Question Edition, SVG and styling work is
implemented and reviewed locally. Complete the owner's explicit branding
selection above, verify its phone layout and prepare the complete release.
Do not select another name or publish unfinished branding.

Apply the selected name to visible titles, metadata, notices,
footer, accessible names and tests consistent; update canonical requirements
so Civic Compass is historical only. Root checks the chosen subdomain and binds
it to the existing dedicated Vercel project, preserving sessions and data.
Do not create another Supabase project or rename/delete databases or the GitHub
repository. URL changes must not erase or invalidate saved recovery codes.

Verify build, unit/English checks and real browser flows with the new design,
including long product name at phone widths, SVG rendering, bank-word removal,
source notices, recovery and unchanged game behavior. Keep all code/data
privacy policies, source review dates and the production security headers.
Do not log recovery codes or capture code screens. Target-clean synthetic
test sessions only; preserve real users. Share safe notice/hub screenshots
for coordinator review before publication.
