"""Read-only parent discovery journeys on desktop and mobile web."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--base-url", default="http://127.0.0.1:3315")
parser.add_argument("--output", default="test-results/home-institution-types")
parser.add_argument("--engine", choices=["chromium", "webkit"], default="chromium")
parser.add_argument("--width", type=int, help="Run one viewport for diagnostics")
args = parser.parse_args()
base_url = args.base_url.rstrip("/")
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
report = []


def no_overflow(page):
    assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"), "Horizontal page overflow"


with sync_playwright() as playwright:
    browser = getattr(playwright, args.engine).launch(headless=True)
    for width in (args.width,) if args.width else (320, 390, 768, 1440):
        context = browser.new_context(viewport={"width": width, "height": 1000 if width > 640 else 844}, reduced_motion="reduce")
        page = context.new_page()
        errors = []
        stage = "initial"
        page.on("pageerror", lambda error: errors.append({"stage": stage, "message": str(error), "stack": error.stack}))
        failed_requests = []
        page.on("requestfailed", lambda request: failed_requests.append({"stage": stage, "url": request.url, "failure": request.failure}))
        response = page.goto(base_url)
        assert response and response.status == 200
        section = page.get_by_role("region", name="살펴볼 기관", exact=True)
        expect(section).to_be_visible()
        groups = section.locator(".home-institution-group")
        assert groups.count() >= 2
        ids = groups.evaluate_all("nodes => nodes.map(node => node.id)")
        names = []
        for group in groups.all():
            title = group.get_by_role("heading", level=3).inner_text()
            names.append(title)
            cards = group.locator(".institution-card")
            assert 1 <= cards.count() <= 4
            assert all(title == text for text in cards.locator(".card-kicker > span:first-child").all_inner_texts())
            assert "KR-11" not in group.inner_text()
            for link in [group.locator(".home-institution-group__all"), *cards.locator("h4 a").all()]:
                box = link.bounding_box()
                assert box and box["height"] >= 44, "Touch target below 44px"
            columns = group.locator(".home-institution-group__cards").evaluate("node => getComputedStyle(node).gridTemplateColumns.split(' ').length")
            assert columns == (1 if width <= 640 else 2 if width <= 1100 else 4)
        assert names[:2] == ["영어유치원", "사립초등학교"]
        no_overflow(page)

        # A parent can skip the first category without a tab hiding content.
        stage = "jump"
        jump = page.get_by_role("navigation", name="살펴볼 기관 유형별 이동").get_by_role("link", name="사립초등학교", exact=True)
        jump.focus()
        expect(jump).to_be_focused()
        assert jump.evaluate("node => getComputedStyle(node).outlineStyle") != "none"
        jump.press("Enter")
        page.wait_for_url("**/#home-private-elementary")
        target = page.locator("#home-private-elementary")
        header = page.locator(".site-header").bounding_box()
        box = target.bounding_box()
        assert box and header and box["y"] >= header["y"] + header["height"], "Group hidden by sticky header"
        assert groups.count() == len(ids)
        page.wait_for_load_state("networkidle")
        page.evaluate("document.fonts.ready")
        page.screenshot(path=str(output / f"{args.engine}-{width}-private.png"))

        # Continue to one institution and return to the same type section.
        stage = "detail"
        card_link = target.locator("h4 a").first
        institution_name = card_link.inner_text()
        institution_href = card_link.get_attribute("href")
        card_link.click()
        page.wait_for_url(f"{base_url}{institution_href}")
        expect(page.get_by_role("heading", level=1, name=institution_name, exact=True)).to_be_visible()
        no_overflow(page)
        stage = "back"
        page.go_back()
        expect(page.locator("#home-private-elementary")).to_be_visible()

        # Each full-list action carries its category through to the destination.
        for group_id in ids:
            group = page.locator(f"#{group_id}")
            stage = f"jump-{group_id}"
            title = group.get_by_role("heading", level=3).inner_text()
            page.get_by_role("navigation", name="살펴볼 기관 유형별 이동").get_by_role("link", name=title, exact=True).click()
            page.wait_for_url(f"**/#{group_id}")
            category = group.get_attribute("data-category")
            stage = f"list-{group_id}"
            group.locator(".home-institution-group__all").click()
            page.wait_for_url("**/institutions?category=*")
            assert parse_qs(urlparse(page.url).query)["category"] == [category]
            expect(page.get_by_role("heading", level=1)).to_be_visible()
            no_overflow(page)
            stage = f"back-{group_id}"
            page.go_back()
            page.wait_for_url(f"**/#{group_id}")
            expect(group).to_be_visible()

        stage = "overview"
        section.evaluate("node => node.scrollIntoView({block: 'start'})")
        expect(section).to_be_visible()
        page.wait_for_load_state("networkidle")
        page.evaluate("document.fonts.ready")
        page.screenshot(path=str(output / f"{args.engine}-{width}-overview.png"))
        if width == 1440:
            section.screenshot(path=str(output / f"{args.engine}-desktop-groups.png"))
        assert not errors, {"errors": errors, "failed_requests": failed_requests}
        report.append({"engine": args.engine, "width": width, "groups": names, "journeys": "passed"})
        context.close()

    context = browser.new_context(java_script_enabled=False, viewport={"width": 390, "height": 844})
    page = context.new_page()
    page.goto(base_url)
    expect(page.locator("#home-english-kindergartens")).to_be_visible()
    expect(page.locator("#home-private-elementary")).to_be_visible()
    no_overflow(page)
    context.close()
    browser.close()

(output / f"{args.engine}-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(report, ensure_ascii=True))
