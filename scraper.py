import hashlib

import yaml
from playwright.sync_api import sync_playwright

from database import init_db, save_snapshot


def load_competitors(path="competitors.yaml"):
    with open(path, "r") as f:
        data = yaml.safe_load(f)
    return data["competitors"]


def scrape_page(page, competitor_name, page_type, url):
    try:
        page.goto(url, timeout=30000)
        content = page.inner_text("body")
        content_hash = hashlib.md5(content.encode()).hexdigest()
        save_snapshot(competitor_name, page_type, url, content, content_hash)
        print(f"[OK] {competitor_name} / {page_type}: {url}")
    except Exception as e:
        print(f"[ERROR] {competitor_name} / {page_type}: {url} — {e}")


def main():
    init_db()
    competitors = load_competitors()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        for competitor in competitors:
            name = competitor["name"]
            scrape_page(page, name, "pricing", competitor["pricing_url"])
            scrape_page(page, name, "changelog", competitor["changelog_url"])
            if competitor.get("careers_url"):
                scrape_page(page, name, "careers", competitor["careers_url"])

        browser.close()


if __name__ == "__main__":
    main()
