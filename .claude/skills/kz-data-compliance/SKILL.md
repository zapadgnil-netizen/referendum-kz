---
name: kz-data-compliance
description: Use when deciding whether a data field, record type or source may be ingested, stored or shown, when personal data or individuals appear in Kazakhstan records, or before launching anything that redistributes registry or sanctions data.
---

# Data compliance gate (checklist, not legal advice)

This skill is a **checklist for the engineer**. It is not legal advice and states no conclusions about
Kazakhstan law. Open questions for counsel are in `docs/legal-questions.md`. Do not claim a field is
"legal to show" because this skill passed it.

## Gate every field
1. **Subject.** A company, or a public official acting in an official capacity? If it is a private
   individual: do not ingest, store or show it.
2. **Need.** Which report section needs it? No section, no field.
3. **Source terms.** Row in `docs/data-sources.md` filled, terms allow our use and redistribution?
4. **Sensitivity.** Contact details, ID numbers (IIN), addresses, family or health data: default no.
   A person's IIN is not needed to identify a company.
5. **Provenance.** Source link and `fetched_at` attached.
6. **Correction.** Can a user report an error and can we correct or take it down?

## Scope rules
- Companies and public officials only. No people-search, no individual profiles, no "find this person".
- Directors and owners appear as roles of a company, tied to a record, not as standalone profiles.
- Prefer open-data dumps and APIs over scraping. Never circumvent access controls.
- Sanctions/PEP lists: check the licence. OpenSanctions is non-commercial by default; a paid product
  needs a commercial licence.

## Stop and ask the user when
- A source needs login, local ID or CAPTCHA.
- A record is about a private individual.
- A field would be shown that no one has reviewed.
- Anything leaves Kazakhstan's borders in bulk (storage, backups, analytics, third-party APIs).

## Common mistakes
- Ingesting everything a portal exposes "for later".
- Using real people's or companies' data as test fixtures. Use synthetic data.
- Sending records to a third-party LLM or scraping API without checking the field list first.
