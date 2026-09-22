"""Verify that home navigation anchors clear the sticky site header."""

from __future__ import annotations

import os

from playwright.sync_api import Page, sync_playwright


BASE_URL = os.environ.get(
    "HOME_ANCHOR_BASE_URL",
    "https://preppy-web-production.up.railway.app",
).rstrip("/")


def assert_target_below_header(page: Page, target_id: str) -> None:
    header = page.locator(".site-header").bounding_box()
    target = page.locator(f"#{target_id}").bounding_box()

    assert header is not None, "site header has no layout box"
    assert target is not None, f"#{target_id} has no layout box"

    gap = target["y"] - (header["y"] + header["height"])
    assert 16 <= gap <= 32, (
        f"#{target_id} should start 16-32px below the sticky header; "
        f"measured {gap:.1f}px"
    )


def click_desktop_anchor(page: Page, *, label: str, target_id: str) -> None:
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.locator(".site-navigation").get_by_role("link", name=label).click()
    page.wait_for_url(f"{BASE_URL}/#{target_id}")
    assert_target_below_header(page, target_id)


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)

    desktop = browser.new_page(viewport={"width": 1280, "height": 720})
    click_desktop_anchor(
        desktop,
        label="입학정보",
        target_id="current-opportunities",
    )
    click_desktop_anchor(desktop, label="아티클", target_id="articles")

    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    for target_id in ("current-opportunities", "articles"):
        mobile.goto(f"{BASE_URL}/#{target_id}")
        mobile.wait_for_load_state("networkidle")
        assert_target_below_header(mobile, target_id)

    browser.close()

print("home anchor navigation browser test passed")
