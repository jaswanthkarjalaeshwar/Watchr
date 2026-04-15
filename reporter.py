import os
from datetime import date

import requests
from dotenv import load_dotenv

from alerts import send_immediate_alert
from summarizer import summarize_all_diffs

load_dotenv()

_SEVERITY_EMOJI = {
    "high": "\U0001f534",    # red circle
    "medium": "\U0001f7e1",  # yellow circle
    "low": "\U0001f7e2",     # green circle
}


def _build_blocks(summaries: list[dict]) -> list[dict]:
    today = date.today().strftime("%B %d, %Y")
    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"Competitor Intelligence Digest — {today}",
                "emoji": True,
            },
        },
        {"type": "divider"},
    ]

    if not summaries:
        blocks.append(
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": ":white_check_mark: No changes detected this week.",
                },
            }
        )
        return blocks

    for s in summaries:
        competitor = s.get("competitor", "Unknown")
        page_type = s.get("page_type", "unknown")
        severity = s.get("severity", "low")
        category = s.get("category", "other")
        summary = s.get("summary", "")
        key_changes = s.get("key_changes") or []
        what_it_means = s.get("what_it_means", "")

        emoji = _SEVERITY_EMOJI.get(severity, _SEVERITY_EMOJI["low"])
        category_badge = ":briefcase: Hiring" if page_type == "careers" else f"_{category.capitalize()}_"

        bullets = "\n".join(f"• {change}" for change in key_changes)

        text_parts = [
            f"*{competitor} / {page_type}*   {emoji} {severity.capitalize()}  ·  {category_badge}",
            summary,
        ]
        if bullets:
            text_parts.append(bullets)
        if what_it_means:
            text_parts.append(f"_{what_it_means}_")
        hiring_signal = s.get("hiring_signal", "")
        if hiring_signal:
            text_parts.append(f":mag: {hiring_signal}")

        blocks.append(
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": "\n".join(text_parts),
                },
            }
        )
        blocks.append({"type": "divider"})

    return blocks


def send_slack_report(summaries: list[dict]) -> None:
    webhook_url = os.getenv("SLACK_WEBHOOK_URL")
    if not webhook_url:
        raise EnvironmentError("SLACK_WEBHOOK_URL is not set in the environment.")

    blocks = _build_blocks(summaries)

    # Fallback plain-text for notifications
    if summaries:
        fallback = f"Competitor Intelligence Digest — {len(summaries)} change(s) detected."
    else:
        fallback = "Competitor Intelligence Digest — No changes detected this week."

    payload = {"text": fallback, "blocks": blocks}

    response = requests.post(webhook_url, json=payload, timeout=10)
    response.raise_for_status()
    print(f"Slack report sent ({response.status_code}). {len(summaries)} item(s) included.")


def main() -> None:
    summaries = summarize_all_diffs()
    send_slack_report(summaries)


if __name__ == "__main__":
    main()
