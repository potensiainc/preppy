"""Headless Chromium acceptance for WP-12B Admin Operations action policy."""

from __future__ import annotations

import json
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright


BASE_URL = os.environ["APP_BASE_URL"].rstrip("/")
EVIDENCE_DIR = Path(os.environ["WP12B_BROWSER_EVIDENCE_DIR"]).resolve()
OUTBOX_ID = "15151515-1515-4151-8151-151515151515"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    failures: list[str] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = context.new_page()
        page.set_default_timeout(120_000)
        page.set_default_navigation_timeout(120_000)
        page.on("pageerror", lambda error: failures.append(f"pageerror: {error}"))
        page.on(
            "console",
            lambda message: failures.append(f"console: {message.text}")
            if message.type == "error"
            else None,
        )
        page.on(
            "requestfailed",
            lambda request: failures.append(
                f"requestfailed: {request.method} {request.url} "
                f"{request.failure or 'unknown'}"
            ),
        )

        page.goto(f"{BASE_URL}/admin/auth/start", wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        require(
            page.url.rstrip("/") == f"{BASE_URL}/admin",
            f"OIDC login did not reach Admin dashboard: url={page.url}",
        )
        expect(page.get_by_role("heading", name="Operations overview")).to_be_visible()

        page.goto(f"{BASE_URL}/admin/operations")
        page.wait_for_load_state("networkidle")
        if page.get_by_role("heading", name="Operations control room").count() != 1:
            page.screenshot(
                path=str(EVIDENCE_DIR / "wp12b-operations-failure.png"),
                full_page=True,
            )
            raise AssertionError(
                "Operations page did not render: "
                f"url={page.url} body={page.locator('body').inner_text()[:1000]!r}"
            )
        expect(page.get_by_role("heading", name="Operations control room")).to_be_visible()
        expect(page.get_by_text("Command guarded", exact=True)).to_be_visible()

        page.goto(f"{BASE_URL}/admin/operations/outbox")
        page.wait_for_load_state("networkidle")
        expect(page.get_by_role("heading", name="Outbox event ledger")).to_be_visible()
        row = page.locator("tr", has_text=OUTBOX_ID)
        expect(row).to_have_count(1)
        expect(row).to_contain_text("RESEND · STARTED")
        expect(
            row.get_by_role("button", name="Reconcile Resend Result", exact=True)
        ).to_be_visible()
        require(
            row.get_by_role("button", name="Retry", exact=True).count() == 0,
            "ambiguous send exposed generic Retry",
        )
        require(
            row.get_by_role("button", name="Cancel", exact=True).count() == 0,
            "ambiguous send exposed Cancel",
        )
        main_text = page.locator("main").inner_text()
        for forbidden in (
            "browser-recipient@example",
            "RESEND_API_KEY",
            "whsec_",
            "raw webhook",
        ):
            require(forbidden not in main_text, f"Operations exposed {forbidden}")
        page.screenshot(
            path=str(EVIDENCE_DIR / "wp12b-operations.png"), full_page=True
        )
        context.close()
        browser.close()

    require(not failures, "browser failures: " + " | ".join(failures))
    evidence = {
        "type": "WP12B_BROWSER_PASS",
        "url": f"{BASE_URL}/admin/operations/outbox",
        "outboxId": OUTBOX_ID,
        "reconcileVisible": True,
        "genericRetryVisible": False,
        "cancelVisible": False,
        "screenshot": str(EVIDENCE_DIR / "wp12b-operations.png"),
    }
    (EVIDENCE_DIR / "browser-evidence.json").write_text(
        json.dumps(evidence, indent=2), encoding="utf-8"
    )
    print(json.dumps(evidence))


if __name__ == "__main__":
    main()
