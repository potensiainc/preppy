"""Catch a missing full-card hit area, swallowed secondary link, or broken keyboard target.

Uses actual rendered cards, not an injected click handler. The local fixture renders
the real components and CSS; the same journeys can run read-only on production.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

parser = argparse.ArgumentParser()
parser.add_argument("--base-url", required=True)
parser.add_argument("--output", default="test-results/card-links")
parser.add_argument("--fixture", action="store_true")
args = parser.parse_args()
base = args.base_url.rstrip("/")
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
scenarios = [
    ("#home-english-kindergartens .institution-card", "h4 a", None),
    ("#home-private-elementary .institution-card", "h4 a", ".card-opportunity a"),
    ("#current-opportunities .opportunity-card", "h3 a", ".card-parent a"),
]
if args.fixture:
    scenarios.append((".fixture-analytics .institution-card", "h3 a", ".card-opportunity a"))
report = []

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in (320, 390, 1440):
        context = browser.new_context(viewport={"width": width, "height": 900}, has_touch=width < 640, reduced_motion="reduce")
        page = context.new_page()
        page.set_default_timeout(10000)
        for index, (selector, title_selector, secondary_selector) in enumerate(scenarios):
            page.goto(base)
            card = page.locator(selector).first
            expect(card).to_be_visible()
            primary = card.locator(title_selector)
            href = primary.get_attribute("href")
            original_text = card.inner_text()
            assert card.locator("a a").count() == 0, "Nested links"
            # Blank lower-right padding is deliberately outside every text link.
            card.scroll_into_view_if_needed()
            box = card.bounding_box()
            point = {"x": box["width"] - 10, "y": box["height"] - 10}
            if width < 640:
                card.tap(position=point)
            else:
                card.click(position=point)
            page.wait_for_url(base + href, timeout=5000)
            expect(page.get_by_role("heading", level=1)).to_be_visible()
            page.go_back()
            expect(card).to_have_text(original_text, use_inner_text=True)

            # All four padding corners belong to the primary link, not a sibling.
            card.scroll_into_view_if_needed()
            hits = card.evaluate("""(node, selector) => {
              const r = node.getBoundingClientRect();
              const link = node.querySelector(selector);
              return [[10,10],[r.width-10,10],[10,r.height-10],[r.width-10,r.height-10]]
                .map(([x,y]) => document.elementFromPoint(r.x+x,r.y+y)?.closest('a') === link);
            }""", title_selector)
            assert all(hits), {"selector": selector, "corners": hits}
            primary.focus()
            # Enter keyboard modality: programmatic focus after touch correctly
            # does not necessarily match :focus-visible in a hydrated app.
            primary.press("Tab")
            page.keyboard.press("Shift+Tab")
            expect(primary).to_be_focused()
            assert primary.evaluate("node => getComputedStyle(node, '::after').outlineStyle") != "none", "Missing full-card focus outline"
            if index == 1:
                page.screenshot(path=str(output / f"{width}-focus.png"))
            primary.press("Enter")
            page.wait_for_url(base + href)
            page.go_back()

            if secondary_selector:
                secondary = card.locator(secondary_selector)
                secondary_href = secondary.get_attribute("href")
                secondary.click()
                page.wait_for_url(base + secondary_href)
                expect(page.get_by_role("heading", level=1)).to_be_visible()
                page.go_back()

            # A real anchor keeps the browser's native new-tab action.
            if width == 1440:
                with context.expect_page() as opened:
                    card.click(position=point, modifiers=["Control"])
                popup = opened.value
                popup.wait_for_url(base + href)
                popup.close()
            assert page.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1")
            report.append({"width": width, "card": selector, "status": "passed"})
        context.close()

    context = browser.new_context(java_script_enabled=False, viewport={"width":390,"height":900}, has_touch=True)
    page = context.new_page()
    for selector, title_selector, _ in scenarios:
        page.goto(base)
        card = page.locator(selector).first
        href = card.locator(title_selector).get_attribute("href")
        card.scroll_into_view_if_needed()
        box = card.bounding_box()
        card.tap(position={"x": box["width"]-10, "y": box["height"]-10})
        page.wait_for_url(base + href, timeout=5000)
    context.close()
    browser.close()
print(json.dumps(report, ensure_ascii=True))
(output / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
