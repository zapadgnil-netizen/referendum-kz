# Ashyq Dala

"Who am I dealing with?" for Kazakhstan: link a company to its owners, affiliates, land, state
contracts and court cases, then summarise the risk in plain language with sources.

This repo holds a working MVP that runs entirely in the browser on **invented data**. Nothing is connected to a
real source yet. Start with `CLAUDE.md` (rules and commands) and `docs/spec.md` (product).

## Run it locally

Needs Python 3.11 or newer. No other install.

```
git clone https://github.com/zapadgnil-netizen/referendum-kz
cd referendum-kz
git checkout claude/ashyqdala-building-skills-ed11yp
python tools/serve.py          # builds the page, serves http://127.0.0.1:8000/ and opens your browser
```

Or build one file and open it by double-clicking: `python web/build.py`, then open `web/dist/index.html`.

## Develop

```
pip install -e ".[dev]"
python -m pytest -q                                   # Python reference, JS parity, pipeline, build checks
python tools/smoke.py http://127.0.0.1:8000/          # click through every page in Chromium (needs playwright)
python tools/viewer_sim.py                            # same, inside a sandboxed frame with strict CSP
PYTHONPATH=src python -m ashyqdala.evaluate data/gold/pairs.jsonl
```
