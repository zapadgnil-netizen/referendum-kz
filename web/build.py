"""Assemble web/ into one self-contained page: web/dist/index.html."""

import json
from pathlib import Path

root = Path(__file__).parent
read = lambda name: (root / name).read_text(encoding="utf-8")
data = json.dumps(json.loads(read("data.json")), ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
page = (read("template.html")
        .replace("/*__CSS__*/", read("app.css"))
        .replace("/*__DATA__*/", data)
        .replace("/*__ENGINE__*/", read("engine.js"))
        .replace("/*__PIPELINE__*/", read("pipeline.js"))
        .replace("/*__APP__*/", read("app.js")))
out = root / "dist" / "index.html"
out.parent.mkdir(exist_ok=True)
out.write_text(page, encoding="utf-8")
print(f"wrote {out} ({len(page):,} bytes)")
