import os
import tempfile

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("COMMUTE_SMOKE_BASE_URL", "http://127.0.0.1:3312")


def assert_no_horizontal_overflow(page) -> None:
    overflow = page.evaluate(
        "document.documentElement.scrollWidth - document.documentElement.clientWidth"
    )
    assert overflow <= 1, f"document has {overflow}px horizontal overflow"


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    console_errors: list[str] = []
    page_errors: list[str] = []

    desktop = browser.new_page(viewport={"width": 1440, "height": 900})
    desktop.on(
        "console",
        lambda message: console_errors.append(message.text)
        if message.type == "error"
        else None,
    )
    desktop.on("pageerror", lambda error: page_errors.append(str(error)))
    desktop.goto(f"{BASE_URL}/commute?area=서초구")
    desktop.wait_for_load_state("networkidle")
    desktop.locator(".school-card").first.wait_for(state="visible")

    assert desktop.url.endswith(
        "/commute/index.html?area=%EC%84%9C%EC%B4%88%EA%B5%AC"
    )
    assert desktop.locator("#page-title").inner_text().startswith(
        "우리 아이의 학교 가는 길"
    )
    assert desktop.locator(".school-card").count() == 12
    assert "2026년 8월 31일" in desktop.locator(".explorer-foot").inner_text()

    desktop_wordmark = desktop.locator(".site-header .wordmark")
    assert desktop_wordmark.evaluate("element => element.tagName") == "A"
    assert desktop_wordmark.inner_text() == "PREPPY"
    assert desktop_wordmark.get_attribute("href") == "/"
    assert desktop.evaluate(
        "performance.getEntriesByType('resource').some(entry => entry.name.endsWith('/vendor/DM-Sans-Latin.woff2'))"
    )
    assert desktop_wordmark.evaluate(
        """element => {
          const style = getComputedStyle(element);
          return {
            color: style.color,
            fontFamily: style.fontFamily,
            fontSize: style.fontSize,
            fontWeight: style.fontWeight,
            letterSpacing: style.letterSpacing,
          };
        }"""
    ) == {
        "color": "rgb(49, 92, 80)",
        "fontFamily": '"DM Sans", "DM Sans Fallback", "IBM Plex Sans KR", "IBM Plex Sans KR Fallback", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
        "fontSize": "16.8px",
        "fontWeight": "600",
        "letterSpacing": "1.848px",
    }

    desktop.locator(".school-open").first.click()
    desktop.locator("#school-detail").wait_for(state="visible")
    assert desktop.locator("#school-detail .detail-directions button").count() == 3
    assert_no_horizontal_overflow(desktop)

    mobile = browser.new_page(viewport={"width": 390, "height": 844})
    mobile.goto(f"{BASE_URL}/commute?area=서초구&school=soongeui&scope=all")
    mobile.wait_for_load_state("networkidle")
    mobile.locator("#school-detail").wait_for(state="visible")
    assert "mobile-map" in (mobile.locator("body").get_attribute("class") or "")
    assert "route-summary" in (mobile.locator("body").get_attribute("class") or "")
    assert mobile.locator(".map-pane").is_visible()
    assert mobile.locator(".mobile-detail-action").is_visible()
    assert mobile.locator("#school-detail").bounding_box()["height"] <= 231
    assert mobile.locator(".site-header .wordmark").evaluate(
        "element => getComputedStyle(element).fontSize"
    ) == "15.68px"
    assert_no_horizontal_overflow(mobile)

    home_check = browser.new_page(viewport={"width": 1440, "height": 900})
    home_check.goto(f"{BASE_URL}/commute")
    home_check.wait_for_load_state("networkidle")
    home_check.locator(".site-header .wordmark").click()
    home_check.wait_for_url(f"{BASE_URL}/")
    home_check.close()

    screenshot = os.path.join(tempfile.gettempdir(), "preppy-commute-production.png")
    mobile.screenshot(path=screenshot, full_page=True)

    browser.close()

    assert not page_errors, page_errors
    assert not console_errors, console_errors
    print(f"commute browser smoke passed; screenshot={screenshot}")
