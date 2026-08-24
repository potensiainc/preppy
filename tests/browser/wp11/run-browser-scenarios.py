"""Headless Chromium acceptance runner for the isolated WP-11 browser fixture."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import subprocess
import time
from typing import Callable
import urllib.request

from playwright.sync_api import BrowserContext, Page, expect, sync_playwright


REPO_ROOT = Path(__file__).resolve().parents[3]
BASE_URL = os.environ["APP_BASE_URL"].rstrip("/")
ISSUER_URL = os.environ["ADMIN_AUTH_ISSUER"].rstrip("/")
DATABASE_URL = os.environ["DATABASE_URL"]
EVIDENCE_DIR = Path(os.environ["WP11_BROWSER_EVIDENCE_DIR"]).resolve()

SOURCE_ID = "55555555-5555-4555-8555-555555555555"
INITIAL_VERSION_ID = "66666666-6666-4666-8666-666666666666"
DETAIL_PATH = (
    "/admin/monitoring/OPPORTUNITY/"
    "44444444-4444-4444-8444-444444444444/"
    f"{SOURCE_ID}/PRIMARY_NOTICE"
)
CORRECTED_URL = "https://fixture.preppy.test/admissions/official"
REPLACEMENT_URL = "https://replacement.preppy.test/admissions"
CHANGED_TITLE = "WP-11 Browser Opportunity - Verified Change"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def wait_for_dynamic_page(page: Page) -> None:
    page.wait_for_load_state("networkidle")


def screenshot(page: Page, name: str) -> None:
    page.screenshot(path=str(EVIDENCE_DIR / name), full_page=True)


def set_issuer_mode(mode: str) -> None:
    request = urllib.request.Request(
        f"{ISSUER_URL}/__fixture__/mode",
        data=json.dumps({"mode": mode}).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        require(response.status == 200, f"fixture mode {mode} was rejected")


def listening_pid(port: int) -> int:
    command = (
        f"(Get-NetTCPConnection -State Listen -LocalPort {port} "
        "| Select-Object -First 1 -ExpandProperty OwningProcess)"
    )
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", command],
        check=True,
        capture_output=True,
        text=True,
    )
    pid = int(result.stdout.strip())
    require(pid > 0, f"no listener PID found for {port}")
    return pid


def inspect_database() -> dict[str, object]:
    executable = "npx.cmd" if os.name == "nt" else "npx"
    result = subprocess.run(
        [
            executable,
            "tsx",
            "tests/browser/wp11/seed-admin-console.ts",
            "--inspect",
        ],
        cwd=REPO_ROOT,
        env={**os.environ, "DATABASE_URL": DATABASE_URL},
        check=True,
        capture_output=True,
        text=True,
    )
    lines = [line for line in result.stdout.splitlines() if line.strip()]
    require(bool(lines), "database inspection produced no output")
    return json.loads(lines[-1])


class BrowserDiagnostics:
    def __init__(
        self,
        failures: list[str],
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.failures = failures
        self.clock = clock
        self.expected: dict[str, object] | None = None
        self.observations: list[dict[str, object]] = []

    def arm_expected_http_failure(
        self,
        *,
        method: str,
        url: str,
        status: int,
        label: str,
        window_seconds: float = 30.0,
    ) -> None:
        require(self.expected is None, "an expected HTTP failure is already armed")
        require(window_seconds > 0, "expected HTTP failure window must be positive")
        armed_at = self.clock()
        self.expected = {
            "method": method,
            "url": url,
            "status": status,
            "label": label,
            "armedAt": armed_at,
            "deadline": armed_at + window_seconds,
            "responseCount": 0,
            "resourceConsoleCount": 0,
            "unexpectedCount": 0,
        }

    def _matches(
        self,
        *,
        method: str,
        url: str,
        status: int,
    ) -> bool:
        expected = self.expected
        return bool(
            expected is not None
            and self.clock() <= expected["deadline"]
            and method == expected["method"]
            and url == expected["url"]
            and status == expected["status"]
        )

    def record_response(self, response: object) -> None:
        status = response.status
        if status < 400:
            return
        method = response.request.method
        url = response.url
        expected = self.expected
        if self._matches(method=method, url=url, status=status) and expected is not None:
            if expected["responseCount"] == 0:
                expected["responseCount"] = 1
                return
            expected["unexpectedCount"] += 1
        self.failures.append(f"http:{status}:{method}:{url}")

    def record_console(self, message: object) -> None:
        if message.type != "error":
            return
        text = message.text
        location = message.location
        location_url = location.get("url", "") if isinstance(location, dict) else ""
        status_match = re.fullmatch(
            r"Failed to load resource: the server responded with a status of (\d+)(?: \([^)]*\))?",
            text,
        )
        expected = self.expected
        if status_match is not None and expected is not None:
            status = int(status_match.group(1))
            if (
                self._matches(
                    method=str(expected["method"]),
                    url=location_url,
                    status=status,
                )
                and expected["resourceConsoleCount"] == 0
            ):
                expected["resourceConsoleCount"] = 1
                return
            expected["unexpectedCount"] += 1
        self.failures.append(f"console:error:{location_url}:{text}")

    def record_request_failed(self, request: object) -> None:
        self.failures.append(
            f"requestfailed:{request.method}:{request.url}:{request.failure or 'unknown'}"
        )

    def finish_expected_http_failure(self) -> dict[str, object]:
        expected = self.expected
        require(expected is not None, "no expected HTTP failure is armed")
        self.expected = None
        require(
            expected["responseCount"] == 1 and expected["unexpectedCount"] == 0,
            f"{expected['label']} was not observed exactly once inside its bounded window",
        )
        observation = {
            key: expected[key]
            for key in (
                "label",
                "method",
                "url",
                "status",
                "responseCount",
                "resourceConsoleCount",
            )
        }
        self.observations.append(observation)
        return observation

    def assert_idle(self) -> None:
        require(self.expected is None, "an expected HTTP failure was left armed")


def install_browser_diagnostics(page: Page, diagnostics: BrowserDiagnostics) -> None:
    page.set_default_timeout(15_000)
    page.set_default_navigation_timeout(120_000)

    page.on("console", diagnostics.record_console)
    page.on("response", diagnostics.record_response)
    page.on("requestfailed", diagnostics.record_request_failed)
    page.on(
        "pageerror", lambda error: diagnostics.failures.append(f"pageerror:{error}")
    )


def login(context: BrowserContext, diagnostics: BrowserDiagnostics) -> Page:
    page = context.new_page()
    install_browser_diagnostics(page, diagnostics)
    page.goto(f"{BASE_URL}/admin")
    wait_for_dynamic_page(page)
    expect(page.get_by_role("heading", name="Admin sign-in")).to_be_visible()
    expect(page.locator("nav[aria-label='Admin sections']")).to_have_count(0)
    screenshot(page, "01-admin-login.png")

    page.get_by_role("link", name="Continue with secure sign-in").click()
    page.wait_for_url(f"{BASE_URL}/admin")
    wait_for_dynamic_page(page)
    expect(page.get_by_role("heading", name="Operations overview")).to_be_visible()
    expect(page.get_by_text("Browser Active Admin", exact=True)).to_be_visible()
    screenshot(page, "02-admin-dashboard.png")
    return page


def verify_monitoring_and_commands(
    context: BrowserContext, page: Page, diagnostics: BrowserDiagnostics
) -> tuple[str, dict[str, object]]:
    baseline = inspect_database()
    require(baseline["current_version_id"] == INITIAL_VERSION_ID, "wrong seed version")
    require(baseline["outbox_count"] == 0, "seed outbox was not empty")
    require(baseline["notification_count"] == 0, "seed notifications were not empty")
    require(baseline["delivery_count"] == 0, "seed deliveries were not empty")

    page.get_by_role("link", name="Monitoring", exact=True).first.click()
    wait_for_dynamic_page(page)
    expect(page.get_by_role("heading", name="Monitoring queue")).to_be_visible()
    page.get_by_label("Target type").select_option("OPPORTUNITY")
    page.get_by_label("Source lifecycle").select_option("ACTIVE")
    page.get_by_role("button", name="Apply filters").click()
    wait_for_dynamic_page(page)
    require("targetType=OPPORTUNITY" in page.url, "Monitoring filter was not applied")
    page.get_by_role("link", name="wp11-browser-opportunity").click()
    page.wait_for_url(f"{BASE_URL}/admin/monitoring/OPPORTUNITY/**")
    wait_for_dynamic_page(page)
    require(
        page.url == f"{BASE_URL}{DETAIL_PATH}",
        f"unexpected Monitoring detail URL: {page.url}",
    )
    expect(page.get_by_role("heading", name="Decision")).to_be_visible()
    expect(page.get_by_text("WP-11 Browser Admissions", exact=True).first).to_be_visible()
    screenshot(page, "03-monitoring-detail.png")

    invalid_event_start = page.get_by_label("Event starts (ISO with offset)")
    candidate_title = page.get_by_label("Candidate title")
    verify_button = page.get_by_role("button", name="Verify Opportunity")
    validation_alert = page.locator(".admin-error-summary")
    invalid_event_start.fill("2026-08-24")
    verify_button.click()
    expect(validation_alert).to_contain_text(
        "날짜와 시간에는 명시적 시간대가 필요합니다."
    )
    require(
        page.evaluate(
            "document.activeElement?.classList.contains('admin-error-summary')"
        ),
        "first synchronous validation error did not focus its alert",
    )
    candidate_title.focus()
    require(candidate_title.evaluate("element => element === document.activeElement"),
            "could not move focus away from the first validation alert")
    verify_button.click()
    expect(validation_alert).to_contain_text(
        "날짜와 시간에는 명시적 시간대가 필요합니다."
    )
    require(
        page.evaluate(
            "document.activeElement?.classList.contains('admin-error-summary')"
        ),
        "repeated synchronous validation error did not refocus its alert",
    )
    screenshot(page, "03a-repeated-validation-focus.png")
    invalid_event_start.fill("")

    page.get_by_label("Optional operator note").fill("Browser fixture no-change")
    with page.expect_response(
        lambda response: response.request.method == "POST"
        and response.url.endswith(f"/monitoring/sources/{SOURCE_ID}/no-change")
    ) as no_change_response:
        page.get_by_role("button", name="Confirm no change").click()
    require(no_change_response.value.status == 200, "No Change did not return 200")
    expect(page.locator(".admin-form-status")).to_contain_text("Source check recorded")
    after_no_change = inspect_database()
    require(after_no_change["unchanged_observation_count"] == 1, "No Change missing")
    for key in ("opportunity_change_count", "outbox_count", "notification_count", "delivery_count"):
        require(after_no_change[key] == baseline[key], f"No Change mutated {key}")
    screenshot(page, "04-no-change.png")

    page.get_by_label("Candidate title").fill(CHANGED_TITLE)
    page.get_by_label("Observed business state").select_option("UPCOMING")
    page.get_by_label("Materiality override (optional)").select_option("USER_IMPACT")
    with page.expect_response(
        lambda response: response.request.method == "POST"
        and response.url.endswith("/opportunities/44444444-4444-4444-8444-444444444444/verify")
    ) as verify_response:
        page.get_by_role("button", name="Verify Opportunity").click()
    require(verify_response.value.status == 200, "Native verification did not return 200")
    expect(page.locator(".admin-form-status")).to_contain_text("Verification committed")
    page.wait_for_timeout(900)
    wait_for_dynamic_page(page)
    expect(page.get_by_text(CHANGED_TITLE, exact=True).first).to_be_visible()
    after_verify = inspect_database()
    require(after_verify["current_version_id"] != INITIAL_VERSION_ID, "version did not advance")
    require(after_verify["current_title"] == CHANGED_TITLE, "truth title did not change")
    require(after_verify["opportunity_change_count"] == 1, "change row missing")
    require(after_verify["outbox_count"] == 1, "applicable Outbox row missing")
    require(after_verify["notification_count"] == 0, "verification created Notification")
    require(after_verify["delivery_count"] == 0, "verification created Delivery")
    screenshot(page, "05-native-verify.png")

    stale_page = context.new_page()
    install_browser_diagnostics(stale_page, diagnostics)
    stale_page.goto(f"{BASE_URL}{DETAIL_PATH}")
    wait_for_dynamic_page(stale_page)
    stale_token = stale_page.locator("input[name='expectedCurrentVersionId']")
    expect(stale_token).not_to_have_value(INITIAL_VERSION_ID)
    stale_token.evaluate("(element, value) => { element.value = value; }", INITIAL_VERSION_ID)
    expect(stale_token).to_have_value(INITIAL_VERSION_ID)
    stale_page.get_by_label("Candidate title").fill(f"{CHANGED_TITLE} stale")
    stale_page.get_by_label("Materiality override (optional)").select_option("USER_IMPACT")
    stale_verify_url = (
        f"{BASE_URL}/api/admin/opportunities/"
        "44444444-4444-4444-8444-444444444444/verify"
    )
    diagnostics.arm_expected_http_failure(
        method="POST",
        url=stale_verify_url,
        status=409,
        label="stale verification",
    )
    with stale_page.expect_response(
        lambda response: response.request.method == "POST"
        and response.url == stale_verify_url
    ) as stale_response:
        stale_page.get_by_role("button", name="Verify Opportunity").click()
    require(
        stale_response.value.status == 409,
        f"stale write returned {stale_response.value.status}: {stale_response.value.text()}",
    )
    stale_page.wait_for_timeout(100)
    diagnostics.finish_expected_http_failure()
    error_summary = stale_page.locator(".admin-error-summary")
    expect(error_summary).to_contain_text("다른 운영자가 먼저 변경했을 수 있습니다")
    require(
        stale_page.evaluate("document.activeElement?.classList.contains('admin-error-summary')"),
        "stale error summary did not receive focus",
    )
    screenshot(stale_page, "06-stale-conflict.png")
    stale_page.wait_for_timeout(900)
    wait_for_dynamic_page(stale_page)
    expect(stale_page.locator("input[name='expectedCurrentVersionId']")).not_to_have_value(
        INITIAL_VERSION_ID
    )
    stale_page.close()

    page.get_by_label("New official URL").fill(CORRECTED_URL)
    page.get_by_label(
        "I confirmed this is the same official provenance and Source identity."
    ).check()
    with page.expect_response(
        lambda response: response.request.method == "POST"
        and response.url.endswith(f"/sources/{SOURCE_ID}/moved")
    ) as correction_response:
        page.get_by_role("button", name="Apply URL correction").click()
    require(correction_response.value.status == 200, "URL Correction did not return 200")
    expect(page.locator(".admin-form-status")).to_contain_text("URL_CORRECTION")
    page.wait_for_timeout(900)
    wait_for_dynamic_page(page)
    after_correction = inspect_database()
    require(after_correction["active_binding_source_id"] == SOURCE_ID, "Source identity changed")
    require(after_correction["old_source_url"] == CORRECTED_URL, "URL was not corrected")
    require(after_correction["old_source_status"] == "ACTIVE", "Source was retired")
    for key in ("opportunity_change_count", "outbox_count", "notification_count", "delivery_count"):
        require(after_correction[key] == after_verify[key], f"URL Correction mutated {key}")
    screenshot(page, "07-url-correction.png")

    page.get_by_label("New Source name").fill("WP-11 Replacement Admissions")
    page.get_by_label("New canonical URL").fill(REPLACEMENT_URL)
    page.get_by_label(
        "I understand this creates or reuses a different Source identity."
    ).check()
    moved_url = f"{BASE_URL}/api/admin/sources/{SOURCE_ID}/moved"
    diagnostics.arm_expected_http_failure(
        method="GET",
        url=f"{BASE_URL}{DETAIL_PATH}",
        status=404,
        label="retired Source detail reload",
    )
    with page.expect_response(
        lambda response: response.request.method == "GET"
        and response.url == f"{BASE_URL}{DETAIL_PATH}"
        and response.status == 404
    ) as retired_detail_response:
        with page.expect_response(
            lambda response: response.request.method == "POST"
            and response.url == moved_url
        ) as replacement_response:
            page.get_by_role("button", name="Replace Source identity").click()
        require(
            replacement_response.value.status == 200,
            "Source Replacement did not return 200",
        )
        replacement_payload = replacement_response.value.json()
        new_source_id = replacement_payload["data"]["newSourceId"]
        expect(page.locator(".admin-form-status")).to_contain_text(
            "SOURCE_REPLACEMENT"
        )
        screenshot(page, "08-source-replacement.png")
    require(
        retired_detail_response.value.status == 404,
        "retired Source detail reload did not return 404",
    )
    page.wait_for_timeout(100)
    diagnostics.finish_expected_http_failure()
    after_replacement = inspect_database()
    require(after_replacement["old_source_status"] == "RETIRED", "old Source was not retired")
    require(after_replacement["active_binding_source_id"] == new_source_id, "binding did not move")
    require(after_replacement["active_binding_source_url"] == REPLACEMENT_URL, "new Source URL mismatch")
    require(after_replacement["old_source_evidence_count"] >= 2, "old Evidence provenance was rewritten")
    for key in ("opportunity_change_count", "outbox_count", "notification_count", "delivery_count"):
        require(after_replacement[key] == after_verify[key], f"Source Replacement mutated {key}")

    new_detail_path = (
        "/admin/monitoring/OPPORTUNITY/"
        "44444444-4444-4444-8444-444444444444/"
        f"{new_source_id}/PRIMARY_NOTICE"
    )
    page.goto(f"{BASE_URL}{new_detail_path}")
    wait_for_dynamic_page(page)
    expect(page.get_by_text("WP-11 Replacement Admissions", exact=True).first).to_be_visible()
    expect(page.get_by_text("Historical Evidence remains attached to the old Source.")).to_be_visible()
    return new_detail_path, after_replacement


def verify_origin_rejection(
    context: BrowserContext,
    command_summary: dict[str, object],
) -> None:
    origin_rejection = context.request.post(
        f"{BASE_URL}/api/admin/monitoring/sources/{SOURCE_ID}/no-change",
        headers={"origin": "https://untrusted.example", "content-type": "application/json"},
        data={},
    )
    require(origin_rejection.status == 403, "untrusted Origin did not return 403")
    require(inspect_database() == command_summary, "Origin rejection mutated the database")


def assert_active_focus(
    page: Page,
    locator,
    label: str,
) -> dict[str, object]:
    expect(locator).to_be_visible()
    active = page.evaluate(
        """() => {
          const element = document.activeElement;
          return element instanceof HTMLElement
            ? {
                href: element.getAttribute('href'),
                id: element.id,
                name: element.getAttribute('name'),
                tag: element.tagName,
                text: element.textContent?.trim().slice(0, 80) ?? '',
              }
            : null;
        }"""
    )
    require(
        locator.evaluate("element => element === document.activeElement"),
        f"focus order did not reach {label}; active={active}",
    )
    focus = locator.evaluate(
        """element => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
          const outlineVisible =
            style.outlineStyle !== 'none' &&
            style.outlineStyle !== 'hidden' &&
            outlineWidth > 0 &&
            style.outlineColor !== 'transparent' &&
            style.outlineColor !== 'rgba(0, 0, 0, 0)';
          const shadowVisible =
            style.boxShadow !== 'none' &&
            !style.boxShadow.includes('rgba(0, 0, 0, 0)');
          return {
            height: rect.height,
            outlineColor: style.outlineColor,
            outlineStyle: style.outlineStyle,
            outlineWidth,
            shadow: style.boxShadow,
            visibleIndicator: outlineVisible || shadowVisible,
            width: rect.width,
          };
        }"""
    )
    require(
        focus["width"] > 0 and focus["height"] > 0,
        f"{label} had no visible focus box",
    )
    require(
        focus["visibleIndicator"],
        f"{label} had no computed visible focus indicator: {focus}",
    )
    return {"label": label, **focus}


def verify_responsive_focus_sequence(page: Page) -> list[dict[str, object]]:
    sequence: list[dict[str, object]] = []
    page.evaluate(
        """() => {
          const active = document.activeElement;
          if (active instanceof HTMLElement) active.blur();
          document.body.focus();
        }"""
    )
    page.locator("body").press("Tab")
    sequence.append(
        assert_active_focus(page, page.locator("a.admin-skip-link"), "Skip link")
    )
    page.keyboard.press("Tab")
    compact_summary = page.locator("details.admin-mobile-nav > summary")
    sequence.append(assert_active_focus(page, compact_summary, "Compact navigation"))
    page.keyboard.press("Enter")
    compact_navigation = page.get_by_role("navigation", name="Compact Admin sections")
    expect(compact_navigation).to_be_visible()

    for link_name in (
        "Dashboard",
        "Monitoring",
        "Institutions",
        "Opportunities",
        "Sources",
        "Articles",
        "Notifications",
        "Users",
        "Operations",
    ):
        page.keyboard.press("Tab")
        sequence.append(
            assert_active_focus(
                page,
                compact_navigation.get_by_role("link", name=link_name, exact=True),
                f"Compact nav: {link_name}",
            )
        )

    page.keyboard.press("Tab")
    sequence.append(
        assert_active_focus(
            page, page.get_by_role("button", name="Sign out"), "Sign out"
        )
    )
    page.keyboard.press("Tab")
    sequence.append(
        assert_active_focus(
            page, page.locator("main a[target='_blank']").first, "Official Source link"
        )
    )
    page.keyboard.press("Tab")
    sequence.append(
        assert_active_focus(
            page,
            page.locator("main .admin-table-scroll").first,
            "Current truth scroll region",
        )
    )
    page.keyboard.press("Tab")
    sequence.append(
        assert_active_focus(
            page,
            page.get_by_label("Optional operator note"),
            "No Change operator note",
        )
    )
    page.keyboard.press("Tab")
    sequence.append(
        assert_active_focus(
            page,
            page.get_by_role("button", name="Confirm no change"),
            "Confirm no change",
        )
    )

    correction_url = page.get_by_label("New official URL")
    correction_url.focus()
    sequence.append(
        assert_active_focus(page, correction_url, "URL correction candidate")
    )
    page.keyboard.press("Tab")
    sequence.append(
        assert_active_focus(
            page,
            page.get_by_label(
                "I confirmed this is the same official provenance and Source identity."
            ),
            "URL correction confirmation",
        )
    )
    page.keyboard.press("Tab")
    sequence.append(
        assert_active_focus(
            page,
            page.get_by_role("button", name="Apply URL correction"),
            "Apply URL correction",
        )
    )
    return sequence


def verify_read_only_and_responsive(
    page: Page,
    new_detail_path: str,
) -> dict[str, list[dict[str, object]]]:
    focus_sequences: dict[str, list[dict[str, object]]] = {}
    page.goto(f"{BASE_URL}/admin/operations")
    wait_for_dynamic_page(page)
    expect(page.get_by_role("heading", name="Operations control room")).to_be_visible()
    expect(page.get_by_text("Read only", exact=True)).to_be_visible()
    for path in ("outbox", "deliveries", "audit", "health"):
        page.goto(f"{BASE_URL}/admin/operations/{path}")
        wait_for_dynamic_page(page)
        require(page.locator("main form").count() == 0, f"Operations {path} exposed a form")
        require(page.locator("main button").count() == 0, f"Operations {path} exposed a button")
        content = page.locator("main").inner_text().lower()
        for forbidden in ("retry event", "cancel event", "dead-letter event"):
            require(forbidden not in content, f"Operations {path} exposed {forbidden}")
    screenshot(page, "09-operations-read-only.png")

    page.goto(f"{BASE_URL}/admin/articles")
    wait_for_dynamic_page(page)
    expect(page.get_by_role("heading", name="Article ledger")).to_be_visible()
    require(page.locator("main form").count() == 0, "Articles exposed an editor form")
    require(page.locator("main button").count() == 0, "Articles exposed a publish button")

    for viewport, name in (
        ({"width": 820, "height": 1180}, "tablet"),
        ({"width": 390, "height": 844}, "mobile"),
    ):
        page.set_viewport_size(viewport)
        page.goto(f"{BASE_URL}{new_detail_path}")
        wait_for_dynamic_page(page)
        compact_navigation = page.locator("details.admin-mobile-nav")
        expect(compact_navigation).to_be_visible()
        unlabeled = page.locator(
            "main input:not([type='hidden']), main select, main textarea, main button"
        ).evaluate_all(
            "els => els.filter(el => !el.getAttribute('aria-label') && "
            "!el.getAttribute('aria-labelledby') && !el.labels?.length && "
            "!el.textContent?.trim()).length"
        )
        require(unlabeled == 0, f"{name} contained unlabeled controls")
        for table_wrapper in page.locator(".admin-table-wrap").all():
            box = table_wrapper.bounding_box()
            if box is not None:
                require(box["x"] >= -1, f"{name} table wrapper escaped left viewport")
                require(
                    box["x"] + box["width"] <= viewport["width"] + 1,
                    f"{name} table wrapper escaped right viewport",
                )
        focus_sequences[name] = verify_responsive_focus_sequence(page)
        expect(page.get_by_label("I confirmed this is the same official provenance and Source identity.")).to_be_visible()
        expect(page.get_by_role("button", name="Apply URL correction")).to_be_visible()
        expect(page.locator(".admin-form-status")).to_have_attribute(
            "aria-live", "polite"
        )
        screenshot(page, f"10-{name}-detail.png")
    return focus_sequences


def denial_body(browser, mode: str) -> tuple[int, str]:
    set_issuer_mode(mode)
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    page = context.new_page()
    callback = page.goto(f"{BASE_URL}/admin/auth/start", wait_until="domcontentloaded")
    require(callback is not None, f"{mode} did not yield a callback response")
    wait_for_dynamic_page(page)
    require("/admin/auth/callback" in page.url, f"{mode} did not reach callback")
    status = callback.status
    body = " ".join(page.locator("body").inner_text().split())
    context.close()
    return status, body


def verify_subject_denials(browser) -> None:
    unknown = denial_body(browser, "UNKNOWN_SUBJECT")
    disabled = denial_body(browser, "DISABLED_SUBJECT")
    require(unknown[0] == 403 and disabled[0] == 403, "subject denial status mismatch")
    require(unknown[1] == disabled[1], "unknown and DISABLED denials were distinguishable")
    set_issuer_mode("NORMAL")

    consumer_only = browser.new_context(viewport={"width": 1280, "height": 900})
    consumer_only.add_cookies(
        [{"name": "preppy_session", "value": "consumer-only", "url": BASE_URL}]
    )
    denied_page = consumer_only.new_page()
    denied_page.goto(f"{BASE_URL}/admin")
    wait_for_dynamic_page(denied_page)
    expect(denied_page.get_by_role("heading", name="Admin sign-in")).to_be_visible()
    consumer_only.close()


def verify_logout(context: BrowserContext, page: Page) -> None:
    context.add_cookies(
        [{"name": "preppy_session", "value": "consumer-cookie-preserved", "url": BASE_URL}]
    )
    page.set_viewport_size({"width": 1440, "height": 1000})
    page.goto(f"{BASE_URL}/admin")
    wait_for_dynamic_page(page)
    page.get_by_role("button", name="Sign out").click()
    page.wait_for_url(f"{BASE_URL}/admin/login")
    wait_for_dynamic_page(page)
    cookies = {cookie["name"]: cookie["value"] for cookie in context.cookies()}
    require("preppy_admin_session" not in cookies, "Admin session survived logout")
    require(
        cookies.get("preppy_session") == "consumer-cookie-preserved",
        "logout mutated consumer session",
    )
    page.goto(f"{BASE_URL}/admin")
    wait_for_dynamic_page(page)
    expect(page.get_by_role("heading", name="Admin sign-in")).to_be_visible()
    screenshot(page, "11-logout-denied.png")


def main() -> None:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    require(EVIDENCE_DIR.is_absolute(), "evidence directory must be absolute")
    failures: list[str] = []
    diagnostics = BrowserDiagnostics(failures)
    evidence: dict[str, object] = {
        "appUrl": BASE_URL,
        "issuerUrl": ISSUER_URL,
        "databaseName": DATABASE_URL.rsplit("/", 1)[-1],
        "appPid": listening_pid(int(BASE_URL.rsplit(":", 1)[-1])),
        "issuerPid": listening_pid(int(ISSUER_URL.rsplit(":", 1)[-1])),
    }
    phase = os.environ.get("WP11_BROWSER_PHASE", "FULL")
    require(
        phase in {"AUTH", "COMMANDS", "READ_ONLY", "FULL"},
        f"unsupported browser phase: {phase}",
    )
    evidence["phase"] = phase
    responsive_focus_sequences: dict[str, list[dict[str, object]]] = {}

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        if phase in {"AUTH", "FULL"}:
            verify_subject_denials(browser)

        if phase in {"AUTH", "COMMANDS", "FULL"}:
            context = browser.new_context(viewport={"width": 1440, "height": 1000})
            page = login(context, diagnostics)
            if phase in {"COMMANDS", "FULL"}:
                new_detail_path, command_summary = verify_monitoring_and_commands(
                    context, page, diagnostics
                )
                verify_origin_rejection(context, command_summary)
                if phase == "FULL":
                    responsive_focus_sequences = verify_read_only_and_responsive(
                        page, new_detail_path
                    )
            verify_logout(context, page)
            context.close()

        if phase == "READ_ONLY":
            command_summary = inspect_database()
            require(command_summary["old_source_status"] == "RETIRED", "commands not complete")
            new_detail_path = (
                "/admin/monitoring/OPPORTUNITY/"
                "44444444-4444-4444-8444-444444444444/"
                f"{command_summary['active_binding_source_id']}/PRIMARY_NOTICE"
            )
            context = browser.new_context(viewport={"width": 1440, "height": 1000})
            page = login(context, diagnostics)
            responsive_focus_sequences = verify_read_only_and_responsive(
                page, new_detail_path
            )
            verify_logout(context, page)
            context.close()
        browser.close()

    diagnostics.assert_idle()
    require(not failures, "browser console/page errors: " + " | ".join(failures))
    evidence["expectedHttpFailures"] = diagnostics.observations
    evidence["responsiveFocusSequences"] = responsive_focus_sequences
    evidence["finalDatabase"] = inspect_database()
    evidence["screenshots"] = sorted(path.name for path in EVIDENCE_DIR.glob("*.png"))
    (EVIDENCE_DIR / "browser-evidence.json").write_text(
        json.dumps(evidence, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(json.dumps({"type": "WP11_BROWSER_PASS", **evidence}, ensure_ascii=False))


if __name__ == "__main__":
    main()
