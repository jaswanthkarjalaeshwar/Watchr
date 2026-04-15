import sqlite3
import subprocess
import sys
from pathlib import Path

import yaml
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS

from battlecard import generate_battle_card

load_dotenv()

app = Flask(__name__)
CORS(app)

BASE_DIR = Path(__file__).parent
COMPETITORS_FILE = BASE_DIR / "competitors.yaml"
DB_PATH = BASE_DIR / "watcher.db"


def _read_competitors():
    with open(COMPETITORS_FILE, "r") as f:
        data = yaml.safe_load(f) or {}
    return data.get("competitors", [])


def _write_competitors(competitors):
    with open(COMPETITORS_FILE, "w") as f:
        yaml.dump({"competitors": competitors}, f, default_flow_style=False, allow_unicode=True)


@app.get("/api/competitors")
def get_competitors():
    return jsonify(_read_competitors())


@app.post("/api/competitors")
def add_competitor():
    body = request.get_json(silent=True) or {}
    required = ("name", "pricing_url", "changelog_url", "linkedin_slug")
    missing = [k for k in required if not body.get(k)]
    if missing:
        return jsonify({"error": f"Missing fields: {', '.join(missing)}"}), 400

    competitors = _read_competitors()
    if any(c["name"] == body["name"] for c in competitors):
        return jsonify({"error": f"Competitor '{body['name']}' already exists"}), 409

    competitors.append({
        "name": body["name"],
        "pricing_url": body["pricing_url"],
        "changelog_url": body["changelog_url"],
        "linkedin_slug": body["linkedin_slug"],
    })
    _write_competitors(competitors)
    return jsonify({"ok": True}), 201


@app.delete("/api/competitors/<name>")
def delete_competitor(name):
    competitors = _read_competitors()
    updated = [c for c in competitors if c["name"] != name]
    if len(updated) == len(competitors):
        return jsonify({"error": f"Competitor '{name}' not found"}), 404
    _write_competitors(updated)
    return jsonify({"ok": True})


@app.post("/api/run")
def run_scrapers():
    python = sys.executable
    results = {}
    for script in ("scraper.py", "reporter.py"):
        proc = subprocess.run(
            [python, str(BASE_DIR / script)],
            capture_output=True,
            text=True,
            cwd=str(BASE_DIR),
        )
        results[script] = {
            "returncode": proc.returncode,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
        }
        if proc.returncode != 0:
            return jsonify({"ok": False, "results": results}), 500
    return jsonify({"ok": True, "results": results})


@app.post("/api/battlecard/<name>")
def battlecard(name):
    try:
        pdf_path = generate_battle_card(name)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": f"Generation failed: {e}"}), 500
    return send_file(
        pdf_path,
        mimetype="application/pdf",
        as_attachment=True,
        download_name=f"{name}_battlecard.pdf",
    )


@app.get("/api/activity")
def get_activity():
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            """
            SELECT id, competitor, page_type, url, content_hash, scraped_at
            FROM snapshots
            ORDER BY scraped_at DESC
            LIMIT 20
            """
        )
        rows = [dict(row) for row in cursor.fetchall()]
    return jsonify(rows)


if __name__ == "__main__":
    app.run(port=5000, debug=True)
