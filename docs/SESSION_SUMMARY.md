# Session summary: Ashyq Dala (2026-10-06 to 2026-10-13)

A record of what was asked, what was done, what went wrong, and what is still open, so a new session can pick up
without this conversation. For the project's current state and rules read `docs/HANDOFF.md` and `CLAUDE.md` too.

## The project in one paragraph
Ashyq Dala ("open steppe") is a "who am I dealing with?" engine for Kazakhstan: type a company name or BIN and get
owners, affiliates, land, state contracts, court cases, plain-language risk indicators with sources, monitoring and
history snapshots. First buyer idea: KYB / compliance teams at foreign banks and investors, and law firms doing Kazakh
M&A. Repo: `zapadgnil-netizen/referendum-kz`, branch `claude/ashyqdala-building-skills-ed11yp`, 9 commits, all pushed.

## Timeline: what you asked, what happened
1. **"What skills and plugins should I download for Ashyq Dala?"** The assistant had no memory of the project and the
   repo was empty. Searches of the plugin catalog found nothing for Kazakhstan data, sanctions or PEP, so the gap was
   filled with custom skills. An install card offered Data, operations (KYC), Legal, OWASP Security Audit and
   software-framework; you enabled them.
2. **You pasted the product pitch** (entity resolution as the moat, risk flags, monitoring, historical snapshots,
   buyer options, pricing, watch-outs). The assistant could not verify it had written that, and treated it as the spec
   (`docs/spec.md`).
3. **"You are fully authorized."** Built the matcher core in Python (BIN/IIN check digit, Cyrillic/Kazakh/Latin match
   keys, legal-form parsing, MATCH / REVIEW / NO_MATCH), a 35-pair gold set, four project skills
   (`kz-entity-resolution`, `source-ingestion`, `risk-flags`, `kz-data-compliance`) and docs. Test-first.
4. **"Show me a demo."** Built a static demo page, then restyled it twice: you asked for an early-2000s
   business-portal look.
5. **"Build a full MVP and keep improving."** Five phases: JS port of the matcher with a parity test against Python
   (about 9,700 cases), a deterministic synthetic dataset (27 invented companies), a browser pipeline (linking, risk
   flags, ownership, search, monitoring events, matcher QA), the portal UI (search, 9-tab reports, watchlist with a
   simulated clock, review queue, compare, matcher quality, help), and browser tests. Published as a private artifact.
6. **"It doesn't seem to work at all. Deploy locally."** Could not reproduce a failure in a simulated viewer, but found
   and fixed a real bug: the page had no `<meta charset>`, so over a plain HTTP server Cyrillic names were garbled and
   search found nothing. Also removed a regex feature older Safari cannot parse, made navigation independent of the URL
   hash, added a visible startup-error message, and wrote `tools/serve.py` and `tools/viewer_sim.py`. Sent you the
   standalone `index.html`.
7. **"Why can't we pull the whole Kazakh company database?"** Researched the sources (`docs/data-sources.md`). Findings:
   competitors Adata.kz and Kompra.kz already aggregate this data; land data is owner-requested with a digital
   signature; tax lookups are per BIN with no bulk download found; court records usually lack BINs; LLP financials are
   private; personal data must be stored in Kazakhstan. Ran `superpowers:brainstorming`; you chose priority **1: first
   paying customer fastest**. Proposed **concierge-first** (design section 1) and wrote the next steps for you.
8. **"Take over my Mac and research LinkedIn."** Not possible from a cloud session. Advised against automating
   LinkedIn (account risk; the project is companies-only). Gave a manual 15-minute search plan and firm-level targets.
9. **"Where is the MVP file?"** It is generated, not committed (`web/dist/` is gitignored). Re-sent the file.
10. **"Everything a coding agent needs."** Wrote `docs/HANDOFF.md` and `AGENTS.md`, and folded the research into
    `docs/data-sources.md`.

## Current state (verified 2026-10-13)
- `python -m pytest -q`: 82 passed. Node pipeline tests: 26 passed. Browser click-through and sandboxed-viewer
  simulation: 0 failures at last run.
- Private artifact: https://claude.ai/artifact/Pp3otgnkgSpYYhQHZhNS3Q
- Run locally: `git clone` the repo, check out the branch, `python tools/serve.py` (opens http://127.0.0.1:8000/).
  Or `python web/build.py` and open `web/dist/index.html`.
- **Everything in the app is invented data.** No real source is connected.

## Decisions
- Companies and public officials only. No profiling of private individuals.
- A false merge is worse than a missed link; unsure goes to REVIEW.
- Name-only evidence is shown but never adds to a risk score until a BIN or a person confirms it.
- Python is the matcher's reference; `web/engine.js` must match it exactly (the parity test enforces it).
- Next 90 days: first paying customer. Chosen direction: concierge-first, **approved 2026-10-13**. The launch kit in
  `launch/` (Partner Desk, public offer, 21-day plan) is the tooling; it was reviewed and fixed on 2026-10-13.

## Mistakes and corrections made in this session
- The original pitch said nobody joins these records well. That was unchecked; Adata.kz and Kompra.kz already
  aggregate them. Aggregation is not the moat.
- The browser pipeline was written before its tests, against the project's own rule. It was then mutation-tested, which
  exposed two untested thresholds; boundary tests were added.
- The MVP was first published after testing only from disk, not under viewer-like conditions, which is why the
  missing-charset bug reached you.
- Smaller: the first parity test passed too easily and had to be proven able to fail; a `pkill` pattern killed the
  assistant's own shell twice.

## Open items
**For you (the assistant cannot do these):**
1. Approve or change the concierge-first plan.
2. List 10 target buyers; have about 10 short discovery conversations (how they check Kazakh counterparties today,
   cost, time, what they would pay for a 48-hour report). Use only the invented-data demo as a sample.
3. Book one hour with a Kazakh lawyer; bring `docs/legal-questions.md`.
4. Send the assistant the results.

**For the assistant, after approval:** record import (paste/CSV), a customer-ready report export, a one-page counterparty
consent request (EN/RU). Then, with the user's and counsel's agreement, the first real source (fill its row in
`docs/data-sources.md` first). No scrapers before that.

**Unverified:** the BIN check-digit algorithm and BIN-vs-IIN rule against an official sample; all risk thresholds and
weights; the public-official list (synthetic); portal terms and APIs for procurement, courts, cadastre and tax.

## Gotchas
Charset required in the page; no regex lookbehind in browser code; do not depend on hash, localStorage or clipboard;
Python `\d` accepts non-ASCII digits (use `[0-9]`); Python rounds half to even; never `pkill -f` a pattern that appears
in your own command; never commit `web/dist/`; the artifact viewer blocks downloads and printing.

## Start a new session with this
> Read `docs/SESSION_SUMMARY.md`, `docs/HANDOFF.md`, `CLAUDE.md` and `docs/spec.md`. Run `python -m pytest -q`. Then
> tell me what you understand the project to be, what is verified and what is not, and what you would do next. Do not
> write code until I approve a design. My answers so far: priority is the first paying customer; concierge-first is
> [approved / not approved / changed to: ...].
