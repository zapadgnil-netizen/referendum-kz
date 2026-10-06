# Ashyq Dala

"Who am I dealing with?" for Kazakhstan: link a company to its owners, affiliates, land, state
contracts and court cases, then summarise the risk in plain language with sources.

Start with `CLAUDE.md` (rules and commands) and `docs/spec.md` (product).

```
pip install -e ".[dev]"
python -m pytest -q
PYTHONPATH=src python -m ashyqdala.evaluate data/gold/pairs.jsonl
```
