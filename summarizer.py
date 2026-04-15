import json

import anthropic
from dotenv import load_dotenv

from differ import get_all_diffs
from alerts import send_immediate_alert

load_dotenv()

_client = anthropic.Anthropic()

_SYSTEM_PROMPT = """You are a competitive intelligence analyst. You analyze diffs of competitor
web pages and extract strategic insights. Always respond with valid JSON only — no markdown,
no explanation, just the raw JSON object."""

_MIN_DIFF_CHARS = 50


def summarize_diff(diff: dict) -> dict | None:
    """Summarize a single diff dict using the Claude API.

    Returns None if the diff is too small or the API call fails.
    Returns a summary dict with keys: summary, category, severity,
    key_changes, what_it_means, competitor, page_type.
    """
    diff_text = diff.get("diff_text", "")
    if not diff_text or len(diff_text) < _MIN_DIFF_CHARS:
        return None

    competitor = diff["competitor"]
    page_type = diff["page_type"]
    url = diff.get("url", "")
    word_count_change = diff.get("word_count_change", 0)

    if page_type == "careers":
        prompt = f"""Analyze the following diff from {competitor}'s careers page ({url}).
Word count change: {word_count_change:+d} words.

Diff:
{diff_text}

Focus on hiring signals. Identify which roles were added or removed, which teams are growing
or shrinking, and what the hiring pattern suggests about the company's strategic direction.

Respond with a JSON object containing exactly these keys:
- "summary": one sentence describing what changed on the careers page
- "category": "hiring"
- "severity": one of "high", "medium", "low"
- "key_changes": a list of strings, each naming a specific role added or removed (e.g. "Added: Senior ML Engineer", "Removed: iOS Developer")
- "what_it_means": strategic implication in 2 sentences — what does this hiring pattern reveal about their product or business direction?
- "hiring_signal": one sentence interpreting the overall hiring trend (e.g. "{competitor} is aggressively hiring ML engineers suggesting an AI feature push")"""
    else:
        prompt = f"""Analyze the following diff from {competitor}'s {page_type} page ({url}).
Word count change: {word_count_change:+d} words.

Diff:
{diff_text}

Respond with a JSON object containing exactly these keys:
- "summary": one sentence describing what changed
- "category": one of "pricing", "feature", "positioning", "hiring", "other"
- "severity": one of "high", "medium", "low"
- "key_changes": a list of strings, each describing one specific change
- "what_it_means": strategic implication in 2 sentences"""

    try:
        response = _client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        text = next(
            (block.text for block in response.content if block.type == "text"), ""
        ).strip()

        parsed = json.loads(text)

        parsed["competitor"] = competitor
        parsed["page_type"] = page_type

        if parsed.get("severity") == "high":
            send_immediate_alert(parsed)

        return parsed

    except json.JSONDecodeError as e:
        print(f"[summarizer] JSON parse error for {competitor}/{page_type}: {e}")
        return None
    except anthropic.APIError as e:
        print(f"[summarizer] API error for {competitor}/{page_type}: {e}")
        return None


def summarize_all_diffs() -> list[dict]:
    """Fetch all non-trivial diffs and summarize each one.

    Returns a list of summary dicts (only non-None results).
    """
    diffs = get_all_diffs()
    summaries = []
    for diff in diffs:
        summary = summarize_diff(diff)
        if summary is not None:
            summaries.append(summary)
    return summaries


if __name__ == "__main__":
    summaries = summarize_all_diffs()

    if not summaries:
        print("No changes to summarize.")
    else:
        for s in summaries:
            print(f"\n{'='*60}")
            print(f"  {s['competitor']} / {s['page_type']}")
            print(f"  Severity : {s.get('severity', 'N/A')}")
            print(f"  Category : {s.get('category', 'N/A')}")
            print(f"  Summary  : {s.get('summary', '')}")
            key_changes = s.get("key_changes", [])
            if key_changes:
                print("  Key changes:")
                for change in key_changes:
                    print(f"    - {change}")
            print(f"  Implication: {s.get('what_it_means', '')}")
