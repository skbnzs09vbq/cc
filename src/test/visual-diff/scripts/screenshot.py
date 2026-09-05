#!/usr/bin/env python3
"""
Take a single full-page screenshot of a URL with Playwright.

Usage:
    python screenshot.py <url> <output_path>

For dynamic pages, waits for networkidle before capturing. Works for
file:// URLs (static HTML) the same way.
"""

import sys

from playwright.sync_api import sync_playwright


def main():
    if len(sys.argv) != 3:
        print("Usage: python screenshot.py <url> <output_path>")
        sys.exit(1)

    url, output_path = sys.argv[1], sys.argv[2]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url)
        try:
            page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass  # static pages / pages with long-lived connections may never go idle
        page.screenshot(path=output_path, full_page=True)
        browser.close()

    print(f"Saved: {output_path}")


if __name__ == "__main__":
    main()
