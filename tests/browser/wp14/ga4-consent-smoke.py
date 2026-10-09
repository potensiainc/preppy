"""Check consent-gated GA4 loading without sending requests to Google."""

from __future__ import annotations

import json
import os
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


BASE_URL = os.environ["APP_BASE_URL"].rstrip("/")
MEASUREMENT_ID = os.environ["GA4_MEASUREMENT_ID"]


def main() -> None:
    assert urlparse(BASE_URL).hostname in {"localhost", "127.0.0.1"}
    requests: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(channel="chrome", headless=True)
        context = browser.new_context(viewport={"width": 390, "height": 844})
        page = context.new_page()
        page.on(
            "request",
            lambda request: requests.append(request.url)
            if "googletagmanager.com" in request.url
            or "google-analytics.com" in request.url
            else None,
        )
        page.route(
            "**/googletagmanager.com/**",
            lambda route: route.fulfill(
                status=200, content_type="application/javascript", body=""
            ),
        )
        page.route("**/google-analytics.com/**", lambda route: route.abort())
        page.goto(f"{BASE_URL}/privacy?private_query=never_send")
        banner = page.get_by_role("region", name="방문 분석 설정")
        banner.wait_for(state="visible")
        bounds = banner.bounding_box()
        assert bounds is not None
        assert bounds["x"] >= 0 and bounds["x"] + bounds["width"] <= 390
        page.wait_for_timeout(300)
        assert requests == [], f"Google loaded before consent: {requests}"

        banner.get_by_role("button", name="분석 거부").click()
        assert page.evaluate("localStorage.getItem('preppy.analytics.consent.v1')") == "denied"
        page.wait_for_timeout(300)
        assert requests == [], f"Google loaded after denial: {requests}"

        page.get_by_role("button", name="방문 분석 설정").click()
        banner.get_by_role("button", name="분석 허용").click()
        page.wait_for_function(
            "measurementId => window.__PREPPY_GTAG_INITIALIZED__ === measurementId",
            arg=MEASUREMENT_ID,
        )
        assert any(f"gtag/js?id={MEASUREMENT_ID}" in url for url in requests)
        config = page.evaluate(
            """measurementId => Array.from(window.dataLayer.find(
              args => args[0] === 'config' && args[1] === measurementId
            ))""",
            MEASUREMENT_ID,
        )
        assert config is not None
        assert page.evaluate(
            "Object.prototype.toString.call(window.dataLayer[0])"
        ) == "[object Arguments]"
        assert config[2]["send_page_view"] is False
        assert config[2]["cookie_expires"] == 60 * 60 * 24 * 90
        assert config[2]["cookie_update"] is False
        assert config[2]["page_location"] == f"{BASE_URL}/"
        assert "private_query" not in json.dumps(config)

        page.evaluate("document.cookie = '_ga=GA1.1.123; path=/'")
        page.get_by_role("button", name="방문 분석 설정").click()
        banner.get_by_role("button", name="분석 거부").click()
        assert page.evaluate(
            "measurementId => window['ga-disable-' + measurementId]",
            MEASUREMENT_ID,
        )
        assert "_ga=" not in page.evaluate("document.cookie")
        browser.close()
    print(json.dumps({"result": "PASS", "googleScriptRequestsAfterGrant": len(requests)}))


if __name__ == "__main__":
    main()
