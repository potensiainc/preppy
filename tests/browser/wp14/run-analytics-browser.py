"""Headless Chromium acceptance runner for WP-14 analytics Test capture."""

from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse

from playwright.sync_api import BrowserContext, Page, expect, sync_playwright


REPO_ROOT = Path(__file__).resolve().parents[3]
BASE_URL = os.environ["APP_BASE_URL"].rstrip("/")
DATABASE_URL = os.environ["DATABASE_URL"]
EVIDENCE_DIR = Path(os.environ["WP14_BROWSER_EVIDENCE_DIR"]).resolve()
RAW_QUERY = "Browser"
FIXTURE_EMAIL = "wp14-browser@example.test"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def run_fixture(*arguments: str) -> dict[str, object]:
    executable = "npx.cmd" if os.name == "nt" else "npx"
    result = subprocess.run(
        [
            executable,
            "tsx",
            "--tsconfig",
            "scripts/db/tsconfig.json",
            "tests/browser/wp14/seed-analytics.ts",
            *arguments,
        ],
        cwd=REPO_ROOT,
        env={**os.environ, "DATABASE_URL": DATABASE_URL},
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    require(bool(lines), "WP-14 browser fixture produced no output")
    return json.loads(lines[-1])


def capture_context(browser, events: list[dict[str, object]]) -> BrowserContext:
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    context.expose_function("__wp14_record", lambda event: events.append(event))
    context.add_init_script(
        """
        window.__PREPPY_ANALYTICS_CAPTURE__ = (event) => {
          window.__wp14_record(JSON.parse(JSON.stringify(event)));
        };
        """
    )
    return context


def settle(page: Page) -> None:
    page.wait_for_load_state("load")
    page.wait_for_timeout(350)


def wait_for_event(page: Page, events: list[dict[str, object]], name: str) -> None:
    page.wait_for_function(
        "([eventName]) => window.__PREPPY_ANALYTICS_CAPTURE__ && true",
        arg=[name],
    )
    for _ in range(30):
        if any(event.get("name") == name for event in events):
            return
        page.wait_for_timeout(100)
    raise AssertionError(f"analytics event did not arrive: {name}; got {events}")


def screenshot(page: Page, name: str) -> None:
    page.screenshot(path=str(EVIDENCE_DIR / name), full_page=True)


def assert_forbidden_payloads(events: list[dict[str, object]]) -> None:
    serialized = json.dumps(events, ensure_ascii=False).lower()
    forbidden = [
        FIXTURE_EMAIL.lower(),
        f'"query":"{RAW_QUERY.lower()}"',
        "location.search",
        "page_location",
        "http://127.0.0.1",
        "childbirth",
        "child_name",
        "schoolid",
        "admissionevent",
        "provider_subject",
        "kakao_subject",
        "memo",
    ]
    for value in forbidden:
        require(value not in serialized, f"forbidden analytics payload survived: {value}")


def public_flow(
    context: BrowserContext,
    events: list[dict[str, object]],
    fixture: dict[str, object],
    google_requests: list[str],
) -> None:
    page = context.new_page()
    page.on(
        "request",
        lambda request: google_requests.append(request.url)
        if "googletagmanager" in request.url or "google-analytics" in request.url
        else None,
    )
    page.set_default_timeout(30_000)
    page.goto(BASE_URL)
    settle(page)
    wait_for_event(page, events, "home_view")
    screenshot(page, "01-home.png")

    page.get_by_role("link", name="기관 둘러보기", exact=True).click()
    page.wait_for_url(f"{BASE_URL}/institutions")
    settle(page)
    wait_for_event(page, events, "hero_primary_cta_click")

    page.get_by_label("기관명 검색").fill(RAW_QUERY)
    page.get_by_role("button", name="검색", exact=True).click()
    page.wait_for_url(
        f"{BASE_URL}/institutions?category=&region=&recruitmentState=&query={RAW_QUERY}"
    )
    settle(page)
    wait_for_event(page, events, "search")
    page.get_by_role("link", name="WP14 Browser Academy", exact=True).click()
    page.wait_for_url(f"{BASE_URL}/institutions/{fixture['institutionSlug']}")
    settle(page)
    wait_for_event(page, events, "institution_view")

    page.get_by_role("link", name="WP14 Browser Admissions Guide", exact=True).click()
    page.wait_for_url(f"{BASE_URL}/articles/{fixture['articleSlug']}")
    settle(page)
    wait_for_event(page, events, "article_view")
    screenshot(page, "02-article.png")

    page.get_by_role("link", name="WP14 Browser Academy", exact=True).first.click()
    page.wait_for_url(f"{BASE_URL}/institutions/{fixture['institutionSlug']}")
    settle(page)
    wait_for_event(page, events, "article_to_institution")
    page.goto(f"{BASE_URL}/articles/{fixture['articleSlug']}")
    settle(page)

    page.route(
        "**/auth/kakao/start",
        lambda route: route.fulfill(
            status=200,
            content_type="text/html",
            body="<!doctype html><title>Fixture auth boundary</title>",
        ),
    )
    button = page.get_by_role("button", name="WP14 Browser Academy 업데이트 받기")
    expect(button).to_be_enabled()
    button.click()
    page.wait_for_url(f"{BASE_URL}/auth/kakao/start")
    wait_for_event(page, events, "follow_click")
    wait_for_event(page, events, "article_to_follow")

    session = fixture["sessionCookie"]
    require(isinstance(session, dict), "fixture session cookie is invalid")
    context.add_cookies(
        [
            {
                "name": str(session["name"]),
                "value": str(session["value"]),
                "url": BASE_URL,
                "httpOnly": True,
                "sameSite": "Lax",
            }
        ]
    )
    page.unroute("**/auth/kakao/start")
    page.goto(f"{BASE_URL}/onboarding")
    settle(page)
    expect(page.get_by_role("heading", name="알림을 위한 기본 설정")).to_be_visible()
    page.get_by_label("서비스 이용약관 동의 (필수)").check()
    page.get_by_label("개인정보 처리 동의 (필수)").check()
    page.get_by_label("알림 이메일 (선택)").fill(FIXTURE_EMAIL)
    page.get_by_label("서비스 이메일 업데이트 수신 (선택)").check()
    page.get_by_role("button", name="동의하고 완료").click()
    page.wait_for_url(f"{BASE_URL}/my-preppy")
    settle(page)
    wait_for_event(page, events, "my_preppy_view")
    expect(page.get_by_role("heading", name="내 프레피")).to_be_visible()
    screenshot(page, "03-my-preppy.png")

    before_404 = len(events)
    response = page.goto(f"{BASE_URL}/does-not-exist-wp14")
    settle(page)
    require(response is not None and response.status == 404, "fixture 404 did not return 404")
    require(len(events) == before_404, "404 zero-event boundary was violated")
    page.close()


def admin_zero_flow(browser, google_requests: list[str]) -> None:
    admin_events: list[dict[str, object]] = []
    context = capture_context(browser, admin_events)
    page = context.new_page()
    page.on(
        "request",
        lambda request: google_requests.append(request.url)
        if "googletagmanager" in request.url or "google-analytics" in request.url
        else None,
    )
    page.goto(f"{BASE_URL}/admin/login")
    settle(page)
    expect(page.get_by_role("heading", name="Admin sign-in")).to_be_visible()
    screenshot(page, "04-admin-zero.png")
    require(admin_events == [], f"Admin zero-event boundary was violated: {admin_events}")
    context.close()


def main() -> None:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    require(EVIDENCE_DIR.is_absolute(), "evidence directory must be absolute")
    database_name = DATABASE_URL.rsplit("/", 1)[-1].lower()
    require(database_name.endswith(("_test", "_verify")), "browser DB must be dedicated")
    fixture = run_fixture("--seed")
    events: list[dict[str, object]] = []
    google_requests: list[str] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = capture_context(browser, events)
        public_flow(context, events, fixture, google_requests)
        context.close()
        admin_zero_flow(browser, google_requests)
        browser.close()

    event_names = [str(event.get("name")) for event in events]
    required = [
        "home_view",
        "hero_primary_cta_click",
        "search",
        "institution_view",
        "article_view",
        "article_to_institution",
        "follow_click",
        "article_to_follow",
        "my_preppy_view",
    ]
    for name in required:
        require(name in event_names, f"missing browser event {name}: {event_names}")
    assert_forbidden_payloads(events)
    require(not google_requests, f"non-production contacted Google: {google_requests}")

    database = run_fixture("--inspect")
    require(database["user_status"] == "ACTIVE", "signup did not commit ACTIVE User")
    require(database["active_follows"] == 1, "Follow did not commit exactly once")
    require(database["email_state"] == "UNVERIFIED/USABLE", "email truth mismatch")
    require(database["consent"] == "GRANTED", "consent truth mismatch")
    require(database["preference"] == "ENABLED", "preference truth mismatch")
    require(database["product_signals"] == 0, "browser flow created notification signals")

    evidence = {
        "type": "WP14_BROWSER_PASS",
        "databaseName": database_name,
        "eventNames": event_names,
        "events": events,
        "googleRequests": google_requests,
        "adminZero": True,
        "notFoundZero": True,
        "database": database,
        "screenshots": sorted(path.name for path in EVIDENCE_DIR.glob("*.png")),
    }
    (EVIDENCE_DIR / "browser-evidence.json").write_text(
        json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps(evidence, ensure_ascii=True))


if __name__ == "__main__":
    main()
