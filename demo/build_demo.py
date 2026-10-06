"""Build demo/index.html: run the real matcher and embed the result in the page template."""

import json
from pathlib import Path

from ashyqdala.demo import build_report

root = Path(__file__).parent
html = (root / "template.html").read_text(encoding="utf-8")
data = json.dumps(build_report(), ensure_ascii=False).replace("</", "<\\/")
(root / "index.html").write_text(html.replace("/*__DATA__*/null", data), encoding="utf-8")
print("wrote", root / "index.html")
