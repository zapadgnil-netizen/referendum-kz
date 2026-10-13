"""Build a dependency-free private workbench and public offer from source."""
from pathlib import Path
import base64
import json

ROOT = Path(__file__).resolve().parent
SRC = ROOT / 'src'
OUT = ROOT / 'dist'
OUT.mkdir(exist_ok=True)
prospects = json.loads((SRC / 'prospects.json').read_text())
offer = (SRC / 'offer.html').read_bytes()
replacements = {
    '/*__CSS__*/': (SRC / 'desk.css').read_text(),
    '/*__APP__*/': (SRC / 'desk.js').read_text(),
    '/*__PROSPECTS__*/': json.dumps(prospects, ensure_ascii=False).replace('<', '\\u003c'),
    '/*__OFFER__*/': base64.b64encode(offer).decode(),
}
html = (SRC / 'desk.html').read_text()
for marker, content in replacements.items():
    assert html.count(marker) == 1, marker
    html = html.replace(marker, content)
(OUT / 'Ashyq_Dala_Desk.html').write_text(html)
(OUT / 'Ashyq_Dala_Offer.html').write_bytes(offer)
print(f'Built private desk ({len(html.encode()):,} bytes) and public offer ({len(offer):,} bytes).')
