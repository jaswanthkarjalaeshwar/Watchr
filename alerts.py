import os

import requests
from dotenv import load_dotenv

load_dotenv()


def send_immediate_alert(summary: dict) -> None:
    """Send an urgent Slack alert for a single high-severity change."""
    webhook_url = os.getenv("SLACK_WEBHOOK_URL")
    if not webhook_url:
        raise EnvironmentError("SLACK_WEBHOOK_URL is not set in the environment.")

    competitor = summary.get("competitor", "Unknown")
    page_type = summary.get("page_type", "unknown")
    change_summary = summary.get("summary", "")
    key_changes = summary.get("key_changes") or []
    what_it_means = summary.get("what_it_means", "")

    bullets = "\n".join(f"• {change}" for change in key_changes)

    detail_parts = [f"*{competitor}* · {page_type}", change_summary]
    if bullets:
        detail_parts.append(bullets)
    if what_it_means:
        detail_parts.append(f"_{what_it_means}_")

    blocks = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": "\U0001f534  High Severity Change Detected",
                "emoji": True,
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "\n".join(detail_parts),
            },
        },
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": ":warning: This alert was triggered immediately because the change was rated *high* severity.",
                }
            ],
        },
    ]

    fallback = f"HIGH SEVERITY: {competitor} ({page_type}) — {change_summary}"
    payload = {"text": fallback, "blocks": blocks}

    response = requests.post(webhook_url, json=payload, timeout=10)
    response.raise_for_status()
    print(f"[alerts] Immediate alert sent for {competitor}/{page_type} ({response.status_code}).")
