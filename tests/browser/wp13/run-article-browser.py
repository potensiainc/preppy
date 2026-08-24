"""Headless Chromium acceptance runner for the isolated WP-13 Article CMS fixture."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import urlparse

from playwright.sync_api import Browser, BrowserContext, Page, expect, sync_playwright


REPO_ROOT = Path(__file__).resolve().parents[3]
BASE_URL = os.environ["APP_BASE_URL"].rstrip("/")
DATABASE_URL = os.environ["DATABASE_URL"]
EVIDENCE_DIR = Path(os.environ["WP13_BROWSER_EVIDENCE_DIR"]).resolve()
STATE_PATH = EVIDENCE_DIR / "article-state.json"
ACTIVE_SUBJECT = "wp13-browser-active"
INTERNAL_ADMIN_NAME = "WP-13 Internal Operator"
INSTITUTION_ID = "33333333-3333-4333-8333-333333333333"
OPPORTUNITY_ID = "44444444-4444-4444-8444-444444444444"
INITIAL_SLUG = "wp13-browser-article-a"
SECOND_SLUG = "wp13-browser-article-b"
FINAL_SLUG = "wp13-browser-article-c"
STALE_GUIDANCE = "다른 운영자가 먼저 변경했을 수 있습니다."


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def wait_dynamic(page: Page) -> None:
    # Next development mode keeps HMR connections active, so network-idle is
    # not a stable readiness signal. Wait through script load and give React a
    # bounded hydration turn; each call site then uses an exact URL, response,
    # or visible-element assertion.
    page.wait_for_load_state("load")
    page.wait_for_timeout(250)


def wait_for_react_event(page: Page, selector: str, event_name: str) -> None:
    page.wait_for_function(
        """({ selector, eventName }) => {
          const element = document.querySelector(selector);
          if (!element) return false;
          return Object.keys(element).some((key) =>
            key.startsWith("__reactProps$") &&
            typeof element[key]?.[eventName] === "function"
          );
        }""",
        arg={"selector": selector, "eventName": event_name},
        timeout=30_000,
    )


def screenshot(page: Page, name: str) -> None:
    page.screenshot(path=str(EVIDENCE_DIR / name), full_page=True)


def inspect_database(article_id: str) -> dict[str, object]:
    executable = "npx.cmd" if os.name == "nt" else "npx"
    result = subprocess.run(
        [
            executable,
            "tsx",
            "tests/browser/wp13/seed-article-cms.ts",
            "--inspect",
            "--article-id",
            article_id,
        ],
        cwd=REPO_ROOT,
        env={**os.environ, "DATABASE_URL": DATABASE_URL},
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    require(bool(lines), "WP-13 database inspection produced no output")
    return json.loads(lines[-1])


def install_diagnostics(page: Page, failures: list[str], console_errors: list[str]) -> None:
    def page_error(error) -> None:
        value = f"pageerror: {error}"
        failures.append(value)
        print(value)

    def request_failed(request) -> None:
        value = (
            f"requestfailed: {request.method} {request.url} "
            f"{request.failure or 'unknown'}"
        )
        failures.append(value)
        print(value)

    def console(message) -> None:
        if message.type == "error":
            console_errors.append(message.text)
            print(f"console-error: {message.text}")

    page.on("pageerror", page_error)
    page.on("requestfailed", request_failed)
    page.on("console", console)


def login(context: BrowserContext, failures: list[str], console_errors: list[str]) -> Page:
    page = context.new_page()
    install_diagnostics(page, failures, console_errors)
    page.set_default_timeout(120_000)
    page.set_default_navigation_timeout(120_000)
    page.goto(f"{BASE_URL}/admin/auth/start", wait_until="domcontentloaded")
    wait_dynamic(page)
    require(
        page.url.rstrip("/") == f"{BASE_URL}/admin",
        f"real fake-OIDC login did not reach Admin dashboard: {page.url}",
    )
    expect(page.get_by_role("heading", name="Operations overview")).to_be_visible()
    return page


def response_for(page: Page, method: str, path: str, action) -> int:
    requests: list[str] = []

    def record(request) -> None:
        if request.method != "GET":
            requests.append(f"{request.method} {urlparse(request.url).path}")

    page.on("request", record)
    try:
        with page.expect_response(
            lambda response: response.request.method == method
            and urlparse(response.url).path == path,
            timeout=30_000,
        ) as observed:
            action()
        return observed.value.status
    except Exception as error:
        raise AssertionError(
            f"expected {method} {path}; observed non-GET requests: {requests[-20:]}"
        ) from error
    finally:
        page.remove_listener("request", record)


def request_status(context: BrowserContext, path: str) -> tuple[int, str | None, str]:
    response = context.request.get(f"{BASE_URL}{path}", max_redirects=0)
    return response.status, response.headers.get("location"), response.text()


def assert_not_public(context: BrowserContext, *paths: str) -> None:
    for path in paths:
        status, location, _body = request_status(context, path)
        require(status == 404, f"{path} was not a 404: {status}")
        require(location is None, f"{path} leaked redirect target {location}")


def assert_redirect(context: BrowserContext, source: str, target: str) -> None:
    status, location, _body = request_status(context, source)
    require(status == 308, f"{source} did not return 308: {status}")
    require(location == target, f"{source} target mismatch: {location!r}")


def assert_safe_article_html(html: str, *, allow_runtime_scripts: bool = False) -> None:
    lowered = html.lower()
    forbidden_values = [
        "onclick=",
        "javascript:",
        "<iframe",
        "<svg",
        "<math",
        f'{BASE_URL}/admin',
        f'{BASE_URL}/api',
        f'{BASE_URL}/auth',
        INTERNAL_ADMIN_NAME.lower(),
    ]
    if not allow_runtime_scripts:
        forbidden_values.append("<script")
    for forbidden in forbidden_values:
        require(forbidden.lower() not in lowered, f"unsafe/private output survived: {forbidden}")


def create_and_publish_article(
    page: Page,
) -> tuple[str, str]:
    page.goto(f"{BASE_URL}/admin/articles")
    wait_dynamic(page)
    expect(page.get_by_role("heading", name="Article ledger")).to_be_visible()
    page.get_by_role("link", name="New Article").click()
    wait_dynamic(page)
    wait_for_react_event(page, "form.admin-article-create", "onSubmit")
    page.get_by_label("Slug").fill(INITIAL_SLUG)
    page.get_by_label("Title").fill("WP-13 Browser Article")
    status = response_for(
        page,
        "POST",
        "/api/admin/articles",
        lambda: page.get_by_role("button", name="Create Draft").click(
            no_wait_after=True
        ),
    )
    require(status == 200, f"create draft returned {status}")
    page.wait_for_url(re.compile(rf"{re.escape(BASE_URL)}/admin/articles/[0-9a-f-]+$"))
    wait_dynamic(page)
    wait_for_react_event(page, ".admin-article-workbench input", "onChange")
    article_id = page.url.rsplit("/", 1)[-1]

    page.get_by_label("Excerpt").fill("A useful bounded browser Article summary.")
    page.get_by_label("SEO title").fill("WP-13 Browser Article Guide")
    page.get_by_label("SEO description").fill(
        "A complete browser-verified Article description for PREPPY families."
    )
    page.get_by_label("Index", exact=True).check()
    page.get_by_role("button", name="Source", exact=True).click()
    source = page.get_by_label("Sanitized-compatible HTML")
    malicious_html = f"""
      <h2 onclick="globalThis.wp13Xss=true">Safe admissions planning</h2>
      <p>This meaningful Article body contains enough verified editorial text for the central indexability policy.</p>
      <p><a href="{BASE_URL}/articles/related-guide">Internal guide</a>
      <a href="https://external.example/guide" target="_blank">External guide</a></p>
      <p><a href="{BASE_URL}/admin/users">Private Admin</a>
      <a href="{BASE_URL}/api/private">Private API</a>
      <a href="javascript:globalThis.wp13Xss=true">Unsafe scheme</a></p>
      <script>globalThis.wp13Xss=true</script>
      <svg><script>globalThis.wp13Xss=true</script></svg>
      <math><annotation-xml encoding="text/html"><script>globalThis.wp13Xss=true</script></annotation-xml></math>
      <iframe src="https://external.example/embed"></iframe>
    """
    source.fill(malicious_html)
    page.get_by_role("button", name="Visual", exact=True).click()
    page.get_by_role("button", name="Source", exact=True).click()
    require("Safe admissions planning" in source.input_value(), "Visual/Source lost candidate")
    status = response_for(
        page,
        "POST",
        f"/api/admin/articles/{article_id}/draft",
        lambda: page.get_by_role("button", name="Save Draft").click(),
    )
    require(status == 200, f"draft save returned {status}")
    expect(
        page.locator(".admin-article-workbench > .admin-form-status")
    ).to_contain_text("Persisted")

    page.goto(f"{BASE_URL}/admin/articles/{article_id}/preview")
    wait_dynamic(page)
    preview_html = page.locator("main").inner_html()
    assert_safe_article_html(preview_html)
    screenshot(page, "01-sanitized-admin-preview.png")

    page.goto(f"{BASE_URL}/admin/articles/{article_id}")
    wait_dynamic(page)
    wait_for_react_event(page, ".admin-article-workbench input", "onChange")
    page.get_by_role("button", name="Source", exact=True).click()
    persisted_source = page.get_by_label("Sanitized-compatible HTML").input_value()
    assert_safe_article_html(persisted_source)
    require('href="/articles/related-guide"' in persisted_source, "same-origin public URL was not normalized")
    require('href="https://external.example/guide"' in persisted_source, "external HTTPS link was removed")
    require('target="_blank"' in persisted_source, "external target was not preserved")
    require("noopener" in persisted_source and "noreferrer" in persisted_source, "external rel was not hardened")
    page.get_by_role("button", name="Visual", exact=True).click()

    institutions = page.locator("fieldset", has_text="Institutions")
    opportunities = page.locator("fieldset", has_text="Opportunities")
    institutions.locator(f'input[value="{INSTITUTION_ID}"]').check() if institutions.locator(f'input[value="{INSTITUTION_ID}"]').count() else institutions.locator('input[type="checkbox"]').first.check()
    opportunities.locator(f'input[value="{OPPORTUNITY_ID}"]').check() if opportunities.locator(f'input[value="{OPPORTUNITY_ID}"]').count() else opportunities.locator('input[type="checkbox"]').first.check()
    status = response_for(
        page,
        "POST",
        f"/api/admin/articles/{article_id}/relations",
        lambda: page.get_by_role("button", name="Save Relations").click(),
    )
    require(status == 200, f"relation save returned {status}")
    status = response_for(
        page,
        "POST",
        f"/api/admin/articles/{article_id}/publish",
        lambda: page.get_by_role("button", name="Publish Article").click(),
    )
    require(status == 200, f"publish returned {status}")
    wait_dynamic(page)
    return article_id, persisted_source


def verify_public_article(
    context: BrowserContext,
    failures: list[str],
    console_errors: list[str],
    slug: str,
) -> None:
    page = context.new_page()
    install_diagnostics(page, failures, console_errors)
    with page.expect_response(
        lambda candidate: urlparse(candidate.url).path == "/api/auth/session"
    ) as session_response:
        response = page.goto(
            f"{BASE_URL}/articles/{slug}", wait_until="domcontentloaded"
        )
    require(
        session_response.value.status == 200,
        f"public consumer-session projection returned {session_response.value.status}",
    )
    page.wait_for_selector("article.article-detail")
    article_count = page.locator("article.article-detail").count()
    if article_count != 1:
        screenshot(page, "public-article-render-failure.png")
        raise AssertionError(
            "public Article did not render: "
            f"status={response.status if response else None} url={page.url} "
            f"count={article_count} body={page.locator('body').inner_text()[:600]!r}"
        )
    html = page.content()
    assert_safe_article_html(html, allow_runtime_scripts=True)
    assert_safe_article_html(
        page.locator("article.article-detail").inner_html()
    )
    require(page.evaluate("() => globalThis.wp13Xss") is None, "browser XSS side effect executed")
    require("WP-13 Browser Article" in page.title(), "Article metadata title missing")
    json_ld_values = [json.loads(item.inner_text()) for item in page.locator('script[type="application/ld+json"]').all()]
    require(any(item.get("@type") == "Article" for item in json_ld_values), "Article JSON-LD missing")
    require(any(item.get("@type") == "BreadcrumbList" for item in json_ld_values), "Breadcrumb JSON-LD missing")
    require(all("author" not in item for item in json_ld_values), "internal Admin leaked as JSON-LD author")
    external = page.locator('a[href="https://external.example/guide"]')
    expect(external).to_have_count(1)
    require(external.get_attribute("target") == "_blank", "external link target mismatch")
    rel = external.get_attribute("rel") or ""
    require("noopener" in rel and "noreferrer" in rel, "external link rel mismatch")
    expect(page.locator('a[href="/articles/related-guide"]')).to_have_count(1)
    screenshot(page, "02-public-article.png")
    page.close()
    expected_dev_abort = (
        f"requestfailed: GET {BASE_URL}/api/auth/session net::ERR_ABORTED"
    )
    failures[:] = [failure for failure in failures if failure != expected_dev_abort]


def verify_published_edit_and_stale(
    context: BrowserContext,
    failures: list[str],
    console_errors: list[str],
    article_id: str,
) -> Page:
    current = context.new_page()
    stale = context.new_page()
    for page in (current, stale):
        install_diagnostics(page, failures, console_errors)
        page.goto(f"{BASE_URL}/admin/articles/{article_id}")
        wait_dynamic(page)
        wait_for_react_event(page, ".admin-article-workbench input", "onChange")

    current.get_by_label("Title", exact=True).fill(
        "WP-13 Browser Article — Atomic Edit"
    )
    status = response_for(
        current,
        "POST",
        f"/api/admin/articles/{article_id}/publish",
        lambda: current.get_by_role("button", name="Publish Changes").click(),
    )
    require(status == 200, f"published atomic edit returned {status}")
    wait_dynamic(current)

    stale.get_by_label("Title", exact=True).fill(
        "STALE OVERWRITE MUST NOT WIN"
    )
    status = response_for(
        stale,
        "POST",
        f"/api/admin/articles/{article_id}/publish",
        lambda: stale.get_by_role("button", name="Publish Changes").click(),
    )
    require(status == 409, f"stale published edit returned {status}")
    expect(
        stale.locator(".admin-article-workbench > .admin-form-status")
    ).to_contain_text(STALE_GUIDANCE)
    expect(stale.get_by_role("button", name="Reload latest data")).to_be_visible()
    stale.close()
    return current


def change_slug(page: Page, article_id: str, slug: str) -> None:
    page.get_by_label("Change slug").fill(slug)
    status = response_for(
        page,
        "POST",
        f"/api/admin/articles/{article_id}/change-slug",
        lambda: page.get_by_role("button", name="Change slug").click(),
    )
    require(status == 200, f"slug change to {slug} returned {status}")
    wait_dynamic(page)


def verify_responsive_editor(page: Page, article_id: str) -> dict[str, object]:
    evidence: dict[str, object] = {}
    for label, width, height in (("tablet", 820, 1180), ("mobile", 390, 844)):
        page.set_viewport_size({"width": width, "height": height})
        page.goto(f"{BASE_URL}/admin/articles/{article_id}")
        wait_dynamic(page)
        wait_for_react_event(page, ".admin-article-workbench input", "onChange")
        toolbar = page.get_by_role("toolbar", name="Article formatting")
        expect(toolbar).to_be_visible()
        require(
            toolbar.evaluate("element => getComputedStyle(element).flexWrap") == "wrap",
            f"{label} toolbar does not wrap",
        )
        page.get_by_role("button", name="Source", exact=True).click()
        expect(page.get_by_label("Sanitized-compatible HTML")).to_be_visible()
        page.get_by_role("button", name="Visual", exact=True).click()
        title = page.get_by_label("Title", exact=True)
        title.focus()
        focus = title.evaluate(
            """element => {
              const style = getComputedStyle(element);
              const box = element.getBoundingClientRect();
              return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, width: box.width, height: box.height };
            }"""
        )
        require(focus["width"] > 0 and focus["height"] > 0, f"{label} focus target has no box")
        require(focus["outlineStyle"] != "none", f"{label} focus indicator is invisible")
        page.once("dialog", lambda dialog: dialog.dismiss())
        page.get_by_role("button", name="Archive").click()
        screenshot(page, f"03-{label}-editor.png")
        evidence[label] = focus
    return evidence


def verify_logout(page: Page) -> None:
    page.set_viewport_size({"width": 1440, "height": 1000})
    page.goto(f"{BASE_URL}/admin")
    wait_dynamic(page)
    page.get_by_role("button", name="Sign out").click()
    page.wait_for_url(f"{BASE_URL}/admin/login")
    page.goto(f"{BASE_URL}/admin/articles")
    wait_dynamic(page)
    expect(page.get_by_role("heading", name="Admin sign-in")).to_be_visible()


def write_article_state(article_id: str) -> None:
    STATE_PATH.write_text(
        json.dumps({"articleId": article_id}, indent=2), encoding="utf-8"
    )


def read_article_state() -> str:
    require(STATE_PATH.is_file(), "WP-13 browser Article state is missing")
    state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
    article_id = state.get("articleId")
    require(
        isinstance(article_id, str) and re.fullmatch(r"[0-9a-f-]{36}", article_id),
        "WP-13 browser Article state is invalid",
    )
    return article_id


def main() -> None:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    require(EVIDENCE_DIR.is_absolute(), "evidence directory must be absolute")
    require(DATABASE_URL.rsplit("/", 1)[-1].lower().endswith(("_test", "_verify")), "browser DB must be dedicated")
    failures: list[str] = []
    console_errors: list[str] = []
    phase = os.environ.get("WP13_BROWSER_PHASE", "FULL")
    require(
        phase
        in {
            "EDITOR",
            "PUBLIC",
            "STALE_SLUG",
            "UNPUBLISH",
            "REPUBLISH",
            "REPUBLISH_ONLY",
            "FINAL",
            "FULL",
        },
        f"unsupported WP-13 browser phase: {phase}",
    )
    article_id = ""
    responsive: dict[str, object] = {}

    with sync_playwright() as playwright:
        browser: Browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1000})

        if phase in {"EDITOR", "FULL"}:
            page = login(context, failures, console_errors)
            article_id, _sanitized = create_and_publish_article(page)
            write_article_state(article_id)

        if phase in {"PUBLIC", "FULL"}:
            article_id = article_id or read_article_state()
            verify_public_article(
                context, failures, console_errors, INITIAL_SLUG
            )

        if phase in {"STALE_SLUG", "FULL"}:
            article_id = article_id or read_article_state()
            page = login(context, failures, console_errors)
            page = verify_published_edit_and_stale(
                context, failures, console_errors, article_id
            )
            change_slug(page, article_id, SECOND_SLUG)
            assert_redirect(
                context,
                f"/articles/{INITIAL_SLUG}",
                f"/articles/{SECOND_SLUG}",
            )

        if phase in {"UNPUBLISH", "FULL"}:
            article_id = article_id or read_article_state()
            page = login(context, failures, console_errors)
            page.goto(f"{BASE_URL}/admin/articles/{article_id}")
            wait_dynamic(page)
            wait_for_react_event(page, ".admin-article-workbench input", "onChange")
            status = response_for(
                page,
                "POST",
                f"/api/admin/articles/{article_id}/unpublish",
                lambda: page.get_by_role("button", name="Unpublish").click(),
            )
            require(status == 200, f"unpublish returned {status}")
            wait_dynamic(page)
            assert_not_public(
                context,
                f"/articles/{INITIAL_SLUG}",
                f"/articles/{SECOND_SLUG}",
            )

        if phase in {"REPUBLISH", "REPUBLISH_ONLY", "FULL"}:
            article_id = article_id or read_article_state()
            page = login(context, failures, console_errors)
            page.goto(f"{BASE_URL}/admin/articles/{article_id}")
            wait_dynamic(page)
            wait_for_react_event(page, ".admin-article-workbench input", "onChange")
            if phase != "REPUBLISH_ONLY":
                change_slug(page, article_id, FINAL_SLUG)
                assert_not_public(
                    context,
                    f"/articles/{INITIAL_SLUG}",
                    f"/articles/{SECOND_SLUG}",
                    f"/articles/{FINAL_SLUG}",
                )
            status = response_for(
                page,
                "POST",
                f"/api/admin/articles/{article_id}/publish",
                lambda: page.get_by_role("button", name="Publish Article").click(),
            )
            require(status == 200, f"republish returned {status}")
            wait_dynamic(page)
            assert_redirect(
                context,
                f"/articles/{INITIAL_SLUG}",
                f"/articles/{FINAL_SLUG}",
            )
            assert_redirect(
                context,
                f"/articles/{SECOND_SLUG}",
                f"/articles/{FINAL_SLUG}",
            )
            require(
                request_status(context, f"/articles/{FINAL_SLUG}")[0] == 200,
                "final public Article is not 200",
            )

        if phase in {"FINAL", "FULL"}:
            article_id = article_id or read_article_state()
            js_disabled = browser.new_context(java_script_enabled=False)
            no_js = js_disabled.new_page()
            response = no_js.goto(f"{BASE_URL}/articles/{FINAL_SLUG}")
            require(
                response is not None and response.status == 200,
                "no-JS public Article failed",
            )
            assert_safe_article_html(
                no_js.content(), allow_runtime_scripts=True
            )
            assert_safe_article_html(
                no_js.locator("article.article-detail").inner_html()
            )
            js_disabled.close()

            page = login(context, failures, console_errors)
            page.goto(f"{BASE_URL}/admin/operations")
            wait_dynamic(page)
            expect(
                page.get_by_role("heading", name="Operations control room")
            ).to_be_visible()
            responsive = verify_responsive_editor(page, article_id)
            verify_logout(page)

        context.close()
        browser.close()

    unexpected_console = [
        message
        for message in console_errors
        if "the server responded with a status of 409" not in message.lower()
    ]
    require(not failures, "browser/page failures: " + " | ".join(failures))
    require(
        not unexpected_console,
        "unexpected console errors: " + " | ".join(unexpected_console),
    )
    final_database = inspect_database(article_id)
    if phase in {"FINAL", "FULL"}:
        require(final_database["slug"] == FINAL_SLUG, "final slug mismatch")
        require(final_database["status"] == "PUBLISHED", "final Article is not PUBLIC")
        require(final_database["title"] == "WP-13 Browser Article — Atomic Edit", "stale edit overwrote current truth")
        require(final_database["unsafe_content"] is False, "unsafe raw Article body persisted")
        require(final_database["institution_relations"] == 1, "Institution relation missing")
        require(final_database["opportunity_relations"] == 1, "Opportunity relation missing")
        require(final_database["cache_events"] == 6, f"cache event count mismatch: {final_database['cache_events']}")
        require(final_database["productSignals"] == {
            "opportunityChanges": 0,
            "notifications": 0,
            "notificationDeliveries": 0,
            "deliveryAttempts": 0,
            "emailOutboxEvents": 0,
        }, "WP-13 created customer Product signals")
        require(final_database["redirects"] == [
            {"sourcePath": f"/articles/{INITIAL_SLUG}", "targetPath": f"/articles/{FINAL_SLUG}"},
            {"sourcePath": f"/articles/{SECOND_SLUG}", "targetPath": f"/articles/{FINAL_SLUG}"},
        ], "redirect history was not flattened")

    evidence = {
        "type": "WP13_BROWSER_PASS",
        "phase": phase,
        "appUrl": BASE_URL,
        "databaseName": DATABASE_URL.rsplit("/", 1)[-1],
        "activeSubject": ACTIVE_SUBJECT,
        "articleId": article_id,
        "responsiveFocus": responsive,
        "finalDatabase": final_database,
        "screenshots": sorted(path.name for path in EVIDENCE_DIR.glob("*.png")),
    }
    (EVIDENCE_DIR / "browser-evidence.json").write_text(
        json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps(evidence, ensure_ascii=True))


if __name__ == "__main__":
    main()
