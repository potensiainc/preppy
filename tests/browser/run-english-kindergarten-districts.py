"""Verify Seoul district discovery for the public English-kindergarten list."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from playwright.sync_api import Page, sync_playwright


BASE_URL = os.environ.get(
    "ENGLISH_KINDERGARTEN_BASE_URL",
    "https://preppy-web-production.up.railway.app",
).rstrip("/")
LIST_URL = f"{BASE_URL}/institutions?category=ENGLISH_KINDERGARTEN"


def assert_no_horizontal_overflow(page: Page) -> None:
    overflow = page.evaluate(
        "document.documentElement.scrollWidth - document.documentElement.clientWidth"
    )
    assert overflow <= 1, f"document has {overflow}px horizontal overflow"


def open_district_picker(page: Page) -> None:
    picker = page.get_by_label("서울 자치구 선택")
    picker.locator("summary").click()
    assert picker.get_attribute("open") is not None


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)

    desktop = browser.new_page(viewport={"width": 1440, "height": 1000})
    desktop.goto(LIST_URL)
    desktop.wait_for_load_state("networkidle")
    assert desktop.get_by_text("서울 영어유치원 25곳", exact=True).is_visible()
    assert desktop.get_by_text("서울 전체 · 25곳", exact=True).is_visible()

    open_district_picker(desktop)
    district_nav = desktop.get_by_role("navigation", name="서울 자치구")
    assert district_nav.get_by_role("link").count() == 26
    district_nav.get_by_role("link", name="강남구 13곳", exact=True).click()
    desktop.wait_for_url("**district=%EA%B0%95%EB%82%A8%EA%B5%AC**")
    desktop.wait_for_load_state("networkidle")
    assert desktop.get_by_text("강남구 영어유치원 13곳", exact=True).is_visible()
    assert desktop.locator(".ek-card").count() == 12
    assert set(desktop.locator(".ek-card__region").all_inner_texts()) == {"강남구"}

    desktop.goto(f"{LIST_URL}&district=%EC%86%A1%ED%8C%8C%EA%B5%AC")
    desktop.wait_for_load_state("networkidle")
    assert desktop.get_by_text("송파구 영어유치원 0곳", exact=True).is_visible()
    assert desktop.get_by_text(
        "현재 송파구에 공개된 영어유치원이 없어요", exact=True
    ).is_visible()
    assert desktop.get_by_role("link", name="서울 전체 보기", exact=True).is_visible()

    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    mobile.goto(LIST_URL)
    mobile.wait_for_load_state("networkidle")
    open_district_picker(mobile)
    assert_no_horizontal_overflow(mobile)
    mobile_links = mobile.get_by_role("navigation", name="서울 자치구").get_by_role(
        "link"
    )
    first = mobile_links.nth(0).bounding_box()
    second = mobile_links.nth(1).bounding_box()
    third = mobile_links.nth(2).bounding_box()
    assert first is not None and second is not None and third is not None
    assert abs(first["y"] - second["y"]) <= 1
    assert third["y"] > first["y"]

    screenshot = Path(tempfile.gettempdir()) / "preppy-english-kindergarten-districts.png"
    mobile.screenshot(path=str(screenshot), full_page=True)

    browser.close()

print(f"English-kindergarten district browser test passed; screenshot={screenshot}")
