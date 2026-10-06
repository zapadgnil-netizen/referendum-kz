---
name: source-ingestion
description: Use when writing or changing a scraper, fetcher, parser or loader for a Kazakhstan government portal or registry, or when storing fetched records, snapshots or "last updated" data.
---

# Source ingestion

## Principle
Our archive and our provenance are the product. Never overwrite what a source told us.

## Before the first request to any portal
1. Read its terms of use and robots.txt. Record date and findings in the `docs/data-sources.md` row.
2. Check for an official API or open-data dump first. Prefer it to scraping.
3. If access needs a local ID, login or CAPTCHA, **stop**. Do not circumvent. Ask the user.
4. Set a conservative rate limit and a clear User-Agent. Use plain HTTP or Playwright before any third-party scraping proxy.
5. Note whether personal data appears and which fields. Pass to `kz-data-compliance`.

## Every stored record carries
| Field | Why |
|---|---|
| `source` + `source_url` | one-click citation in reports |
| `fetched_at` (UTC) | the "last updated" stamp shown to users |
| `content_hash` of the raw payload | detects silent edits |
| `raw_ref` to the immutable raw snapshot | proof of what the source said |
| `parser_version` | re-parse old snapshots safely |

## Rules
- **Append-only.** A changed record is a new version, not an update. Deleted at source means mark
  `gone_at`, keep the history.
- Store the raw payload before parsing. Parsing bugs must never lose data.
- Normalise through `ashyqdala.bin` and `ashyqdala.names`; keep the original strings next to them.
- Idempotent loads: same payload twice produces one version.
- A fetch failure is data too: record it, and do not show stale facts without their stamp.

## Common mistakes
- Updating rows in place "because the source changed".
- Showing a fact without its `fetched_at`.
- Ingesting individuals' records because the portal exposes them. Scope is companies and public officials.
