import difflib
import sqlite3

import yaml

from database import DB_PATH, get_latest_snapshot


def _load_competitors():
    with open("competitors.yaml") as f:
        data = yaml.safe_load(f)
    return data["competitors"]


def _get_page_types(competitor):
    page_types = []
    if "pricing_url" in competitor:
        page_types.append("pricing")
    if "changelog_url" in competitor:
        page_types.append("changelog")
    return page_types


def _get_two_latest_snapshots(competitor, page_type):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.execute(
            """
            SELECT * FROM snapshots
            WHERE competitor = ? AND page_type = ?
            ORDER BY scraped_at DESC
            LIMIT 2
            """,
            (competitor, page_type),
        )
        return cursor.fetchall()


def get_diff(competitor, page_type):
    rows = _get_two_latest_snapshots(competitor, page_type)

    if len(rows) < 2:
        return None

    newer, older = rows[0], rows[1]

    if newer["content_hash"] == older["content_hash"]:
        return None

    older_lines = older["content"].splitlines(keepends=True)
    newer_lines = newer["content"].splitlines(keepends=True)

    diff_lines = list(
        difflib.unified_diff(
            older_lines,
            newer_lines,
            fromfile=f"{competitor}/{page_type} (previous)",
            tofile=f"{competitor}/{page_type} (latest)",
            lineterm="",
        )
    )
    diff_text = "\n".join(diff_lines)

    older_word_count = len(older["content"].split())
    newer_word_count = len(newer["content"].split())
    word_count_change = newer_word_count - older_word_count

    return {
        "competitor": competitor,
        "page_type": page_type,
        "url": newer["url"],
        "diff_text": diff_text,
        "word_count_change": word_count_change,
    }


def get_all_diffs():
    competitors = _load_competitors()
    diffs = []
    for competitor in competitors:
        for page_type in _get_page_types(competitor):
            result = get_diff(competitor["name"], page_type)
            if result is not None:
                diffs.append(result)
    return diffs


def main():
    competitors = _load_competitors()
    changed = []
    unchanged = []
    no_data = []

    for competitor in competitors:
        for page_type in _get_page_types(competitor):
            name = competitor["name"]
            rows = _get_two_latest_snapshots(name, page_type)

            if len(rows) < 2:
                no_data.append((name, page_type))
                continue

            result = get_diff(name, page_type)
            if result is None:
                unchanged.append((name, page_type))
            else:
                changed.append(result)

    print(f"=== Competitor Diff Summary ===\n")

    if changed:
        print(f"CHANGED ({len(changed)}):")
        for diff in changed:
            sign = "+" if diff["word_count_change"] >= 0 else ""
            print(
                f"  {diff['competitor']} / {diff['page_type']}"
                f"  [{sign}{diff['word_count_change']} words]"
                f"  {diff['url']}"
            )
            print(diff["diff_text"][:500] + ("..." if len(diff["diff_text"]) > 500 else ""))
            print()

    if unchanged:
        print(f"UNCHANGED ({len(unchanged)}):")
        for name, page_type in unchanged:
            print(f"  {name} / {page_type}")
        print()

    if no_data:
        print(f"INSUFFICIENT DATA (fewer than 2 snapshots) ({len(no_data)}):")
        for name, page_type in no_data:
            print(f"  {name} / {page_type}")
        print()


if __name__ == "__main__":
    main()
