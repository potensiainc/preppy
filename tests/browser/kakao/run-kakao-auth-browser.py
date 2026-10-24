"""Headless Chromium end-to-end check of Kakao sign-up and login.

The app runs with tests/browser/kakao/fake-kakao-fetch.mjs preloaded, so the
real start, callback, onboarding and follow code runs; only Kakao's token and
user/me answers are local. The Kakao authorize page is replaced by a browser
route that redirects straight back to the callback like Kakao would.

Run (APP_BASE_URL and KAKAO_REDIRECT_URI on http://localhost:3100, other
.env.example values filled, DATABASE_URL pointing at a dedicated *_test DB):

    npx tsx --tsconfig scripts/db/tsconfig.json tests/browser/kakao/seed-kakao-auth.ts
    npx next build
    KAKAO_FAKE_ALLOWED=1 DATABASE_MAX_CONNECTIONS=10 \
      NODE_OPTIONS="--import ./tests/browser/kakao/fake-kakao-fetch.mjs" \
      npx next start -p 3100
    KAKAO_E2E_EVIDENCE_DIR=/tmp/kakao-e2e python3 tests/browser/kakao/run-kakao-auth-browser.py
"""

from __future__ import annotations

import os
import re
import secrets
import subprocess
import time
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlparse

from playwright.sync_api import Browser, BrowserContext, Page, expect, sync_playwright

BASE_URL = os.environ["APP_BASE_URL"].rstrip("/")
DATABASE_URL = os.environ["DATABASE_URL"]
EVIDENCE_DIR = Path(os.environ["KAKAO_E2E_EVIDENCE_DIR"]).resolve()
INSTITUTION_SLUG = "wp14-browser-academy"
INSTITUTION_NAME = "WP14 Browser Academy"
RUN = str(int(time.time()) % 1_000_000)
results: list[tuple[str, str]] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def sql(query: str) -> str:
    return subprocess.run(
        ["psql", DATABASE_URL, "-At", "-c", query],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


def subject(n: int) -> str:
    return f"9{RUN}{n:02d}"


def user_row(kakao_subject: str) -> str:
    return sql(
        "select u.status from users u join auth_identities a on a.user_id=u.id "
        f"where a.provider='KAKAO' and a.provider_subject='{kakao_subject}'"
    )


def shot(page: Page, name: str) -> None:
    page.screenshot(path=str(EVIDENCE_DIR / name), full_page=True)


def kakao_redirect(context: BrowserContext, build_callback) -> None:
    """Stand in for Kakao's authorize page.

    Playwright does not route redirect hops, so every document request is
    fetched with redirects off. App redirects are followed here, and the
    redirect to Kakao authorize is replaced by the callback Kakao would send.
    The real start response (and its state cookie) is kept.
    """

    def navigation(route):
        if route.request.resource_type != "document":
            return route.continue_()
        first = route.fetch(max_redirects=0)
        response = first
        location = response.headers.get("location", "")
        # Look ahead through app redirects only to find a Kakao hand-off; any
        # other chain is returned as its first redirect so the browser URL moves.
        while location.startswith("/") and response.status in (302, 303, 307, 308):
            response = route.fetch(url=f"{BASE_URL}{location}", max_redirects=0)
            location = response.headers.get("location", "")
        if not location.startswith("https://kauth.kakao.com/"):
            return route.fulfill(response=first)
        require(
            location.startswith("https://kauth.kakao.com/oauth/authorize?"),
            f"start must redirect to Kakao authorize, got {location!r}",
        )
        query = parse_qs(urlparse(location).query)
        require(query.get("response_type") == ["code"], "authorize must request a code")
        require(query.get("scope") == ["account_email"], "authorize must ask for account_email")
        headers = dict(response.headers)
        headers["location"] = build_callback(query["redirect_uri"][0], query["state"][0])
        route.fulfill(response=response, headers=headers)

    context.route(f"{BASE_URL}/**", navigation)


def fake_kakao(context: BrowserContext, code: str | None, error: str | None = None) -> None:
    def callback(redirect_uri: str, state: str) -> str:
        params = {"state": state}
        if error:
            params.update(error=error, error_description="User denied access")
        else:
            params["code"] = f"{code}.{secrets.token_hex(4)}"
        return f"{redirect_uri}?{urlencode(params)}"

    kakao_redirect(context, callback)


def new_context(browser: Browser, mobile: bool = False) -> BrowserContext:
    if mobile:
        return browser.new_context(
            viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True
        )
    return browser.new_context(viewport={"width": 1280, "height": 900})


def complete_onboarding(page: Page, email: str | None) -> None:
    expect(page.get_by_role("heading", name="프레피 시작하기")).to_be_visible()
    page.get_by_label(re.compile("만 19세 이상이에요")).check()
    page.get_by_label(re.compile("서비스 이용약관에 동의해요")).check()
    page.get_by_label(re.compile("개인정보 수집·이용에 동의해요")).check()
    if email is not None:
        page.get_by_label("알림 이메일", exact=True).fill(email)
    page.get_by_role("button", name=re.compile("동의하고 가입하기")).click()


def scenario(name: str):
    def wrap(function):
        def run(*args):
            try:
                function(*args)
                results.append((name, "PASS"))
            except Exception as error:  # noqa: BLE001 - report every scenario
                results.append((name, f"FAIL: {error}"))

        return run

    return wrap


@scenario("1. 신규 가입: 기관 페이지 관심기관 등록 → 카카오 → 가입 → 내 프레피")
def new_signup_from_follow(browser: Browser) -> None:
    context = new_context(browser)
    fake_kakao(context, f"e2e.{subject(1)}.verified")
    page = context.new_page()
    page.goto(f"{BASE_URL}/institutions/{INSTITUTION_SLUG}")
    button = page.get_by_role("button", name="카카오 로그인 후 관심기관 등록").first
    expect(button).to_be_enabled()
    button.click()
    page.wait_for_url(f"{BASE_URL}/onboarding")
    expect(page.get_by_label("이어갈 관심기관")).to_contain_text(INSTITUTION_NAME)
    expect(page.get_by_label("알림 이메일", exact=True)).to_have_value(
        f"kakao{subject(1)}@example.test"
    )
    require(user_row(subject(1)) == "PENDING", "user must be PENDING before onboarding")
    shot(page, "01-onboarding-desktop.png")
    complete_onboarding(page, None)
    page.wait_for_url(f"{BASE_URL}/my-preppy")
    expect(page.get_by_role("heading", name="내 프레피")).to_be_visible()
    expect(page.get_by_text(INSTITUTION_NAME).first).to_be_visible()
    shot(page, "02-my-preppy.png")
    require(user_row(subject(1)) == "ACTIVE", "user must be ACTIVE after onboarding")
    follows = sql(
        "select count(*) from follows f join auth_identities a on a.user_id=f.user_id "
        f"where a.provider_subject='{subject(1)}' and f.status='ACTIVE'"
    )
    require(follows == "1", f"expected one active follow, got {follows}")
    context.close()


@scenario("2. 재로그인: 가입한 회원은 가입 화면 없이 바로 로그인")
def returning_login(browser: Browser) -> None:
    context = new_context(browser)
    fake_kakao(context, f"e2e.{subject(1)}.verified")
    page = context.new_page()
    page.goto(f"{BASE_URL}/auth/kakao/start")
    page.wait_for_url(f"{BASE_URL}/")
    session = page.request.get(f"{BASE_URL}/api/auth/session").json()
    require(session.get("authenticated") is True, f"session not authenticated: {session}")
    page.goto(f"{BASE_URL}/institutions/{INSTITUTION_SLUG}")
    expect(page.get_by_role("button", name="관심기관 해제").first).to_be_visible()
    identities = sql(
        f"select count(*) from auth_identities where provider_subject='{subject(1)}'"
    )
    require(identities == "1", "re-login must not create a second identity")
    context.close()


@scenario("3. 내 프레피 직접 접속: 로그인 후 내 프레피로 돌아옴")
def my_preppy_return(browser: Browser) -> None:
    context = new_context(browser)
    fake_kakao(context, f"e2e.{subject(1)}.verified")
    page = context.new_page()
    page.goto(f"{BASE_URL}/my-preppy")
    page.wait_for_load_state("networkidle")
    require(
        urlparse(page.url).path == "/my-preppy",
        f"expected to land on /my-preppy after login, landed on {urlparse(page.url).path}",
    )
    context.close()


@scenario("4. 이메일 제공 미동의 회원도 가입 가능 (모바일)")
def signup_without_email(browser: Browser) -> None:
    context = new_context(browser, mobile=True)
    fake_kakao(context, f"e2e.{subject(2)}.none")
    page = context.new_page()
    page.goto(f"{BASE_URL}/auth/kakao/start")
    page.wait_for_url(f"{BASE_URL}/onboarding")
    expect(page.get_by_role("switch", name="알림 이메일 제공 (선택)")).not_to_be_checked()
    expect(page.get_by_label("알림 이메일", exact=True)).to_have_count(0)
    shot(page, "03-onboarding-mobile.png")
    complete_onboarding(page, None)
    page.wait_for_url(re.compile(f"{re.escape(BASE_URL)}/(my-preppy)?$"))
    require(user_row(subject(2)) == "ACTIVE", "no-email user must become ACTIVE")
    emails = sql(
        "select count(*) from user_emails e join auth_identities a on a.user_id=e.user_id "
        f"where a.provider_subject='{subject(2)}'"
    )
    require(emails == "0", "no email may be stored without Kakao email consent")
    context.close()


@scenario("5. 가입 중단 후 재로그인하면 가입 화면으로 이어짐")
def abandoned_signup_resumes(browser: Browser) -> None:
    for _ in range(2):
        context = new_context(browser)
        fake_kakao(context, f"e2e.{subject(3)}.verified")
        page = context.new_page()
        page.goto(f"{BASE_URL}/auth/kakao/start")
        page.wait_for_url(f"{BASE_URL}/onboarding")
        context.close()
    require(user_row(subject(3)) == "PENDING", "abandoned sign-up stays PENDING")


@scenario("6. 카카오 화면에서 취소하면 안내 화면")
def kakao_cancel(browser: Browser) -> None:
    context = new_context(browser)
    fake_kakao(context, None, error="access_denied")
    page = context.new_page()
    response_holder = {}
    page.on(
        "response",
        lambda r: response_holder.setdefault("status", r.status)
        if "/auth/kakao/callback" in r.url
        else None,
    )
    page.goto(f"{BASE_URL}/auth/kakao/start")
    page.wait_for_url(re.compile("/auth/kakao/callback"))
    shot(page, "04-cancel.png")
    body = page.locator("body").inner_text()
    require("다시 시도" in body, f"cancel page must offer retry: {body!r}")
    context.close()


@scenario("7. 카카오 서버 오류 시 다시 시도 안내")
def kakao_upstream_error(browser: Browser) -> None:
    context = new_context(browser)
    fake_kakao(context, "e2e.5000.verified")
    page = context.new_page()
    page.goto(f"{BASE_URL}/auth/kakao/start")
    page.wait_for_url(re.compile("/auth/kakao/callback"))
    shot(page, "05-upstream-error.png")
    body = page.locator("body").inner_text()
    require("다시 시도" in body, f"error page must offer retry: {body!r}")
    context.close()


@scenario("8. 위조 state와 재사용 콜백 차단")
def forged_and_replayed_callback(browser: Browser) -> None:
    context = new_context(browser)
    page = context.new_page()
    forged = page.goto(
        f"{BASE_URL}/auth/kakao/callback?code=e2e.{subject(4)}.verified&state=forged"
    )
    require(forged is not None and forged.status == 400, "forged state must be 400")
    require(user_row(subject(4)) == "", "forged callback must not create a user")

    captured = {}

    def capture(redirect_uri: str, state: str) -> str:
        captured["url"] = f"{redirect_uri}?" + urlencode(
            {"code": f"e2e.{subject(5)}.verified.replay", "state": state}
        )
        return captured["url"]

    kakao_redirect(context, capture)
    page.goto(f"{BASE_URL}/auth/kakao/start")
    page.wait_for_url(f"{BASE_URL}/onboarding")
    replay = page.goto(captured["url"])
    require(replay is not None and replay.status == 400, "replayed callback must be 400")
    context.close()


@scenario("9. 계정 설정의 로그아웃 버튼으로 로그아웃")
def logout(browser: Browser) -> None:
    context = new_context(browser)
    fake_kakao(context, f"e2e.{subject(1)}.verified")
    page = context.new_page()
    page.goto(f"{BASE_URL}/auth/kakao/start")
    page.wait_for_url(f"{BASE_URL}/")
    page.goto(f"{BASE_URL}/my-preppy/settings")
    page.get_by_role("main").get_by_role("button", name="로그아웃").click()
    page.wait_for_url(f"{BASE_URL}/")
    session = page.request.get(f"{BASE_URL}/api/auth/session").json()
    require(session.get("authenticated") is False, "session must end after logout")
    context.close()


@scenario("10. 헤더 로그인 → 내 프레피, 헤더 로그아웃 (데스크톱·모바일)")
def header_login(browser: Browser) -> None:
    for mobile in (False, True):
        context = new_context(browser, mobile=mobile)
        fake_kakao(context, f"e2e.{subject(1)}.verified")
        page = context.new_page()
        page.goto(BASE_URL)
        header = page.locator("header").first
        login = header.get_by_role("link", name="카카오 로그인")
        expect(login).to_be_visible()
        expect(header.get_by_role("link", name="내 프레피")).to_have_count(0)
        shot(page, f"07-header-signed-out-{'mobile' if mobile else 'desktop'}.png")
        login.click()
        page.wait_for_url(f"{BASE_URL}/my-preppy")
        header = page.locator("header").first
        expect(header.get_by_role("link", name="내 프레피")).to_be_visible()
        expect(header.get_by_role("link", name="카카오 로그인")).to_have_count(0)
        shot(page, f"08-header-signed-in-{'mobile' if mobile else 'desktop'}.png")
        header.get_by_role("button", name="로그아웃").click()
        page.wait_for_url(f"{BASE_URL}/")
        expect(page.locator("header").first.get_by_role("link", name="카카오 로그인")).to_be_visible()
        context.close()


@scenario("11. 관심기관 등록 중 카카오 취소 → 헤더 로그인하면 그 관심기관이 등록됨")
def pending_follow_after_header_login(browser: Browser) -> None:
    context = new_context(browser)
    fake_kakao(context, None, error="access_denied")
    page = context.new_page()
    page.goto(f"{BASE_URL}/institutions/{INSTITUTION_SLUG}")
    page.get_by_role("button", name="카카오 로그인 후 관심기관 등록").first.click()
    page.wait_for_url(re.compile("/auth/kakao/callback"))
    context.unroute(f"{BASE_URL}/**")
    fake_kakao(context, f"e2e.{subject(2)}.none")
    page.goto(BASE_URL)
    page.locator("header").first.get_by_role("link", name="카카오 로그인").click()
    page.wait_for_url(f"{BASE_URL}/my-preppy")
    expect(page.get_by_text(INSTITUTION_NAME).first).to_be_visible()
    follows = sql(
        "select count(*) from follows f join auth_identities a on a.user_id=f.user_id "
        f"where a.provider_subject='{subject(2)}' and f.status='ACTIVE'"
    )
    require(follows == "1", f"pending follow must activate on header login, got {follows}")
    context.close()


@scenario("12. 선택 토글: 모두 동의 버튼 문구, 이메일 제공 끄면 저장 이메일 삭제 (데스크톱)")
def optional_toggles(browser: Browser) -> None:
    context = new_context(browser)
    fake_kakao(context, f"e2e.{subject(6)}.verified")
    page = context.new_page()
    page.goto(f"{BASE_URL}/auth/kakao/start")
    page.wait_for_url(f"{BASE_URL}/onboarding")
    email_switch = page.get_by_role("switch", name="알림 이메일 제공 (선택)")
    updates_switch = page.get_by_role("switch", name="남들보다 빠르게 입학정보 받아볼래요 (선택)")
    submit = page.locator("button[type=submit]")
    expect(email_switch).to_be_checked()
    expect(submit).to_have_text("필수 동의하고 가입하기")
    updates_switch.check()
    expect(submit).to_have_text("모두 동의하고 가입하기")
    shot(page, "09-onboarding-all-agreed-desktop.png")
    email_switch.uncheck()
    expect(submit).to_have_text("필수 동의하고 가입하기")
    expect(page.get_by_text("알림을 받으려면 알림 이메일 제공을 켜 주세요.")).to_be_visible()
    updates_switch.uncheck()
    complete_onboarding(page, None)
    page.wait_for_url(re.compile(f"{re.escape(BASE_URL)}/(my-preppy)?$"))
    emails = sql(
        "select count(*) from user_emails e join auth_identities a on a.user_id=e.user_id "
        f"where a.provider_subject='{subject(6)}'"
    )
    require(emails == "0", f"turning email off must remove the Kakao email, found {emails}")
    context.close()


def main() -> None:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    require(
        re.search(r"(?:^|_)(?:test|verify\d*)$", DATABASE_URL.rsplit("/", 1)[-1]) is not None,
        "DATABASE_URL must be a dedicated test database",
    )
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        for check in (
            new_signup_from_follow,
            returning_login,
            my_preppy_return,
            signup_without_email,
            abandoned_signup_resumes,
            kakao_cancel,
            kakao_upstream_error,
            forged_and_replayed_callback,
            logout,
            header_login,
            pending_follow_after_header_login,
            optional_toggles,
        ):
            check(browser)
        browser.close()
    for name, outcome in results:
        print(f"{outcome[:4]}  {name}" + ("" if outcome == "PASS" else f"\n      {outcome}"))
    if any(outcome != "PASS" for _, outcome in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
