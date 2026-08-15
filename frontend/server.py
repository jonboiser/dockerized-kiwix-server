#!/usr/bin/env python3
"""Minimal, JavaScript-free frontend for bootstrapping a Kiwix server.

Serves a single styled page that lets you:
  * search the Kiwix ZIM catalog (https://library.kiwix.org/catalog/v2)
  * download ZIM files into the volume shared with the kiwix-serve container
  * view/delete the ZIM files already installed

Pure standard library, pure HTML forms + CSS. No JavaScript anywhere.
"""

import html
import os
import re
import threading
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ZIMDIR = os.environ.get("ZIMDIR", os.path.join(os.path.dirname(__file__), "..", "zims"))
PORT = int(os.environ.get("PORT", "3000"))
CATALOG_URL = "https://library.kiwix.org/catalog/v2/entries"
CATALOG_BASE = "https://library.kiwix.org"
USER_AGENT = "dockerized-kiwix-server/2.0"
MAX_RESULTS = 24

LANGUAGES = {
    "": "All languages",
    "eng": "English",
    "spa": "Spanish",
    "fra": "French",
    "deu": "German",
    "zho": "Chinese",
    "rus": "Russian",
    "ara": "Arabic",
    "por": "Portuguese",
    "ita": "Italian",
    "jpn": "Japanese",
}

# filename -> {title, status, downloaded, total, error}
downloads = {}
downloads_lock = threading.Lock()
# lang -> (timestamp, [entry])
catalog_cache = {}
catalog_lock = threading.Lock()


def esc(s):
    return html.escape(str(s), quote=True)


def format_bytes(n):
    if not n:
        return "?"
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if n < 1024 or unit == "TB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{n} B"
        n /= 1024


def fetch_catalog(lang):
    """Fetch and parse the OPDS catalog, with a 5-minute in-memory cache."""
    now = time.time()
    with catalog_lock:
        hit = catalog_cache.get(lang)
        if hit and now - hit[0] < 300:
            return hit[1]

    url = CATALOG_URL + "?count=100"
    if lang:
        url += "&lang=" + urllib.parse.quote(lang)
    req = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/atom+xml, application/xml, text/xml",
    })
    with urllib.request.urlopen(req, timeout=30) as resp:
        root = ET.fromstring(resp.read())

    entries = []
    for el in root.iter():
        if el.tag.rsplit("}", 1)[-1] != "entry":
            continue
        entry = {"title": "Untitled", "summary": "", "language": "",
                 "updated": "", "icon": "", "url": "", "size": 0, "filename": ""}
        for child in el:
            tag = child.tag.rsplit("}", 1)[-1]
            if tag in ("title", "summary", "language", "updated"):
                entry[tag] = (child.text or "").strip() or entry.get(tag, "")
            elif tag == "link":
                rel = child.get("rel", "")
                href = child.get("href", "")
                if rel.endswith("/image/thumbnail"):
                    entry["icon"] = href if href.startswith("http") else CATALOG_BASE + href
                elif rel.endswith("/acquisition/open-access") or ".zim" in href:
                    dl = href[:-6] if href.endswith(".meta4") else href
                    dl = dl.replace("lb.download.kiwix.org", "download.kiwix.org")
                    if dl.endswith(".zim"):
                        entry["url"] = dl
                        entry["size"] = int(child.get("length", 0) or 0)
        if entry["url"]:
            entry["filename"] = entry["url"].rsplit("/", 1)[-1]
            entry["updated"] = entry["updated"][:10]
            entries.append(entry)

    with catalog_lock:
        catalog_cache[lang] = (now, entries)
    return entries


def search_catalog(q, lang):
    entries = fetch_catalog(lang)
    if q:
        ql = q.lower()
        entries = [e for e in entries
                   if ql in e["title"].lower() or ql in e["summary"].lower()
                   or ql in e["filename"].lower()]
    return entries[:MAX_RESULTS]


def list_installed():
    zims = []
    try:
        for f in os.listdir(ZIMDIR):
            if f.endswith(".zim"):
                st = os.stat(os.path.join(ZIMDIR, f))
                zims.append({"filename": f, "size": st.st_size,
                             "modified": time.strftime("%Y-%m-%d", time.localtime(st.st_mtime))})
    except FileNotFoundError:
        pass
    return sorted(zims, key=lambda z: z["modified"], reverse=True)


def download_worker(url, filename, title):
    tmp_path = os.path.join(ZIMDIR, filename + ".part")
    final_path = os.path.join(ZIMDIR, filename)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=60) as resp, open(tmp_path, "wb") as out:
            total = int(resp.headers.get("Content-Length", 0) or 0)
            with downloads_lock:
                downloads[filename]["total"] = total
            while True:
                chunk = resp.read(1 << 20)
                if not chunk:
                    break
                out.write(chunk)
                with downloads_lock:
                    downloads[filename]["downloaded"] += len(chunk)
        os.replace(tmp_path, final_path)
        with downloads_lock:
            downloads[filename]["status"] = "completed"
    except Exception as e:
        with downloads_lock:
            downloads[filename]["status"] = "failed"
            downloads[filename]["error"] = str(e)
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


PAGE_CSS = """
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body {
  margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  background: #0d1117; color: #e6edf3; line-height: 1.5;
}
a { color: #58a6ff; }
header {
  padding: 2rem 1.5rem 1.5rem; text-align: center;
  background: linear-gradient(135deg, #161b22 0%, #1c2733 100%);
  border-bottom: 1px solid #30363d;
}
header h1 { margin: 0 0 .25rem; font-size: 1.9rem; }
header h1 .accent { color: #f78166; }
header p { margin: 0; color: #8b949e; }
main { max-width: 1100px; margin: 0 auto; padding: 1.5rem; }
section { margin-bottom: 2.5rem; }
h2 { border-bottom: 1px solid #30363d; padding-bottom: .4rem; font-size: 1.25rem; }
h2 .count { color: #8b949e; font-weight: normal; font-size: .9em; }
.notice {
  background: #1f6feb22; border: 1px solid #1f6feb; border-radius: 8px;
  padding: .7rem 1rem; margin-bottom: 1.5rem;
}
.notice.error { background: #f8514922; border-color: #f85149; }
.hint { color: #8b949e; font-size: .9rem; }
form.search { display: flex; gap: .5rem; flex-wrap: wrap; margin-bottom: 1.25rem; }
input[type=text], input[type=url], select {
  background: #0d1117; color: #e6edf3; border: 1px solid #30363d;
  border-radius: 6px; padding: .5rem .75rem; font-size: 1rem;
}
input[type=text] { flex: 1; min-width: 200px; }
input:focus, select:focus { outline: 2px solid #1f6feb; border-color: transparent; }
button, .btn {
  background: #238636; color: #fff; border: none; border-radius: 6px;
  padding: .5rem 1rem; font-size: .95rem; cursor: pointer; white-space: nowrap;
}
button:hover { background: #2ea043; }
button.danger { background: #da3633; }
button.danger:hover { background: #f85149; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
.card {
  display: flex; gap: .9rem; background: #161b22; border: 1px solid #30363d;
  border-radius: 10px; padding: 1rem;
}
.card img { width: 48px; height: 48px; border-radius: 8px; flex-shrink: 0; background: #0d1117; }
.card .body { min-width: 0; flex: 1; }
.card h3 { margin: 0 0 .25rem; font-size: 1rem; }
.card .summary {
  margin: 0 0 .5rem; font-size: .85rem; color: #8b949e;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.card .meta { font-size: .8rem; color: #8b949e; margin-bottom: .6rem; }
.meta span { margin-right: .8rem; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: .55rem .5rem; border-bottom: 1px solid #21262d; }
th { color: #8b949e; font-weight: 600; font-size: .85rem; }
td.num, th.num { text-align: right; }
tr td:last-child, tr th:last-child { text-align: right; }
.progress { background: #21262d; border-radius: 4px; height: 8px; overflow: hidden; min-width: 120px; }
.progress > div { background: #1f6feb; height: 100%; }
.badge {
  display: inline-block; font-size: .75rem; padding: .1rem .5rem;
  border-radius: 999px; border: 1px solid #30363d; color: #8b949e;
}
.badge.ok { color: #3fb950; border-color: #3fb950; }
.badge.err { color: #f85149; border-color: #f85149; }
footer { text-align: center; color: #8b949e; font-size: .85rem; padding: 2rem 1rem; }
"""


def render_page(q, lang, msg, msg_error):
    parts = ["<!DOCTYPE html><html lang='en'><head><meta charset='utf-8'>",
             "<meta name='viewport' content='width=device-width, initial-scale=1'>",
             "<title>Kiwix Bootstrap</title>", f"<style>{PAGE_CSS}</style>"]
    with downloads_lock:
        any_active = any(d["status"] == "downloading" for d in downloads.values())
    if any_active:
        parts.append("<meta http-equiv='refresh' content='5'>")
    parts.append("</head><body>")
    parts.append("<header><h1>Kiwix <span class='accent'>Bootstrap</span></h1>"
                 "<p>Download ZIM files into your Kiwix server &mdash; no JavaScript required.</p></header>")
    parts.append("<main>")

    if msg:
        parts.append(f"<div class='notice{' error' if msg_error else ''}'>{esc(msg)}</div>")

    # --- Catalog search ---
    parts.append("<section><h2>ZIM Catalog</h2>")
    parts.append("<form class='search' method='get' action='/'>"
                 f"<input type='text' name='q' placeholder='Search Wikipedia, Gutenberg, TED...' value='{esc(q)}'>")
    parts.append("<select name='lang'>")
    for code, name in LANGUAGES.items():
        sel = " selected" if code == lang else ""
        parts.append(f"<option value='{esc(code)}'{sel}>{esc(name)}</option>")
    parts.append("</select><button type='submit'>Search</button></form>")

    try:
        results = search_catalog(q, lang)
        if results:
            parts.append("<div class='grid'>")
            for e in results:
                icon = f"<img src='{esc(e['icon'])}' alt=''>" if e["icon"] else ""
                meta = (f"<span>{esc(e['language'])}</span>" if e["language"] else "") + \
                       f"<span>{format_bytes(e['size'])}</span>" + \
                       (f"<span>updated {esc(e['updated'])}</span>" if e["updated"] else "")
                parts.append(
                    f"<div class='card'>{icon}<div class='body'>"
                    f"<h3>{esc(e['title'])}</h3>"
                    f"<p class='summary'>{esc(e['summary'])}</p>"
                    f"<div class='meta'>{meta}</div>"
                    f"<form method='post' action='/download'>"
                    f"<input type='hidden' name='url' value='{esc(e['url'])}'>"
                    f"<input type='hidden' name='title' value='{esc(e['title'])}'>"
                    f"<button type='submit'>Download</button></form>"
                    f"</div></div>")
            parts.append("</div>")
        else:
            parts.append("<p class='hint'>No catalog entries matched.</p>")
    except Exception as e:
        parts.append(f"<p class='notice error'>Could not load the catalog: {esc(e)}</p>")
    parts.append("</section>")

    # --- Downloads + installed library ---
    installed = list_installed()
    with downloads_lock:
        active = [(f, dict(d)) for f, d in downloads.items()
                  if d["status"] in ("downloading", "failed")]

    parts.append(f"<section id='library'><h2>Library <span class='count'>"
                 f"{len(installed)} installed &middot; served at "
                 f"<a href='http://localhost:8080'>localhost:8080</a></span></h2>")

    if active:
        parts.append("<table><tr><th>File</th><th>Progress</th><th class='num'>Size</th><th>Status</th></tr>")
        for fname, d in active:
            if d["status"] == "downloading":
                pct = min(99, round(100 * d["downloaded"] / d["total"])) if d["total"] else 0
                bar = f"<div class='progress'><div style='width:{pct}%'></div></div> {pct}%"
                size = f"{format_bytes(d['downloaded'])} / {format_bytes(d['total'])}"
                status = "<span class='badge'>downloading</span>"
            else:
                bar = esc(d.get("error") or "failed")
                size = ""
                status = "<span class='badge err'>failed</span>"
            parts.append(f"<tr><td>{esc(fname)}</td><td>{bar}</td>"
                         f"<td class='num'>{size}</td><td>{status}</td></tr>")
        parts.append("</table><p class='hint'>This page refreshes automatically "
                     "every 5 seconds while downloads are running.</p>")

    if installed:
        parts.append("<table><tr><th>File</th><th class='num'>Size</th><th>Added</th><th></th></tr>")
        for z in installed:
            parts.append(
                f"<tr><td>{esc(z['filename'])}</td>"
                f"<td class='num'>{format_bytes(z['size'])}</td>"
                f"<td>{esc(z['modified'])}</td>"
                f"<td><form method='post' action='/delete' style='display:inline'>"
                f"<input type='hidden' name='file' value='{esc(z['filename'])}'>"
                f"<button type='submit' class='danger'>Delete</button></form></td></tr>")
        parts.append("</table>")
    elif not active:
        parts.append("<p class='hint'>No ZIM files yet. Search the catalog above and "
                     "download one to get started.</p>")

    parts.append("<p class='hint'>After downloads finish, run "
                 "<code>docker compose restart kiwix</code> so kiwix-serve picks up the new files.</p>")
    parts.append("</section>")

    parts.append("</main><footer>Data from <a href='https://library.kiwix.org'>library.kiwix.org</a>"
                 " &middot; served with the Python standard library, zero JavaScript.</footer>")
    parts.append("</body></html>")
    return "".join(parts).encode()


class Handler(BaseHTTPRequestHandler):
    server_version = "KiwixBootstrap/2.0"

    def send_html(self, body, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def redirect(self, msg, error=False):
        q = urllib.parse.urlencode({"msg" if not error else "err": msg})
        self.send_response(303)
        self.send_header("Location", f"/?{q}#library")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/":
            self.send_error(404)
            return
        params = urllib.parse.parse_qs(parsed.query)
        q = params.get("q", [""])[0].strip()
        lang = params.get("lang", [""])[0]
        if lang not in LANGUAGES:
            lang = ""
        msg = params.get("msg", [""])[0]
        err = params.get("err", [""])[0]
        self.send_html(render_page(q, lang, msg or err, bool(err)))

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        if length > 8192:
            self.send_error(413)
            return
        form = urllib.parse.parse_qs(self.rfile.read(length).decode())

        if self.path == "/download":
            url = form.get("url", [""])[0].strip()
            title = form.get("title", [""])[0].strip()
            p = urllib.parse.urlparse(url)
            if p.scheme not in ("http", "https") or not p.path.endswith(".zim"):
                self.redirect("Invalid ZIM URL.", error=True)
                return
            filename = os.path.basename(p.path)
            if os.path.exists(os.path.join(ZIMDIR, filename)):
                self.redirect(f"{filename} is already installed.")
                return
            with downloads_lock:
                existing = downloads.get(filename)
                if existing and existing["status"] == "downloading":
                    self.redirect(f"{filename} is already downloading.")
                    return
                downloads[filename] = {"title": title, "status": "downloading",
                                       "downloaded": 0, "total": 0, "error": ""}
            threading.Thread(target=download_worker, args=(url, filename, title),
                             daemon=True).start()
            self.redirect(f"Started downloading {filename}.")

        elif self.path == "/delete":
            filename = os.path.basename(form.get("file", [""])[0])
            target = os.path.join(ZIMDIR, filename)
            if filename.endswith(".zim") and os.path.isfile(target):
                os.unlink(target)
                with downloads_lock:
                    downloads.pop(filename, None)
                self.redirect(f"Deleted {filename}. Run `docker compose restart kiwix` to update the server.")
            else:
                self.redirect(f"No such ZIM file: {filename}", error=True)
        else:
            self.send_error(404)

    def log_message(self, fmt, *args):
        print(f"[frontend] {self.address_string()} - {fmt % args}")


if __name__ == "__main__":
    os.makedirs(ZIMDIR, exist_ok=True)
    print(f"[frontend] Serving on http://0.0.0.0:{PORT} (ZIMDIR={ZIMDIR})")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
