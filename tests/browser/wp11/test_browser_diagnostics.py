"""Unit regressions for the WP-11 Playwright diagnostic boundary."""

from __future__ import annotations

import importlib.util
import os
from pathlib import Path
import unittest


RUNNER_PATH = Path(__file__).with_name("run-browser-scenarios.py")
os.environ.setdefault("APP_BASE_URL", "http://127.0.0.1:3311")
os.environ.setdefault("ADMIN_AUTH_ISSUER", "http://127.0.0.1:3312")
os.environ.setdefault(
    "DATABASE_URL",
    "postgres://admissionradar:admissionradar@localhost:55433/"
    "admissionradar_wp11_browser_verify13",
)
os.environ.setdefault("WP11_BROWSER_EVIDENCE_DIR", str(Path.cwd() / ".evidence"))

spec = importlib.util.spec_from_file_location("wp11_browser_runner", RUNNER_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError("WP-11 browser runner could not be loaded")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class FakeRequest:
    def __init__(self, method: str, url: str, failure: str | None = None):
        self.method = method
        self.url = url
        self.failure = failure


class FakeResponse:
    def __init__(self, status: int, method: str, url: str):
        self.status = status
        self.url = url
        self.request = FakeRequest(method, url)


class FakeConsoleMessage:
    def __init__(self, text: str, url: str, message_type: str = "error"):
        self.text = text
        self.type = message_type
        self.location = {"url": url, "lineNumber": 0, "columnNumber": 0}


class BrowserDiagnosticsTest(unittest.TestCase):
    def test_unexpected_http_console_and_request_failures_are_never_ignored(self) -> None:
        failures: list[str] = []
        diagnostics = runner.BrowserDiagnostics(failures)

        diagnostics.record_response(
            FakeResponse(404, "GET", "http://127.0.0.1:3311/broken.css")
        )
        diagnostics.record_console(
            FakeConsoleMessage(
                "Failed to load resource: the server responded with a status of 404",
                "http://127.0.0.1:3311/broken.css",
            )
        )
        diagnostics.record_request_failed(
            FakeRequest(
                "GET",
                "http://127.0.0.1:3311/broken.js",
                "net::ERR_CONNECTION_RESET",
            )
        )

        self.assertEqual(len(failures), 3)
        self.assertTrue(any(item.startswith("http:404:GET:") for item in failures))
        self.assertTrue(any(item.startswith("console:error:") for item in failures))
        self.assertTrue(any(item.startswith("requestfailed:GET:") for item in failures))

    def test_expected_failure_requires_one_exact_response_inside_its_window(self) -> None:
        failures: list[str] = []
        now = [100.0]
        diagnostics = runner.BrowserDiagnostics(failures, clock=lambda: now[0])
        expected_url = (
            "http://127.0.0.1:3311/api/admin/opportunities/"
            "44444444-4444-4444-8444-444444444444/verify"
        )

        diagnostics.arm_expected_http_failure(
            method="POST",
            url=expected_url,
            status=409,
            label="stale verification",
            window_seconds=2.0,
        )
        diagnostics.record_response(FakeResponse(409, "POST", expected_url))
        diagnostics.record_console(
            FakeConsoleMessage(
                "Failed to load resource: the server responded with a status of 409",
                expected_url,
            )
        )
        observation = diagnostics.finish_expected_http_failure()

        self.assertEqual(observation["responseCount"], 1)
        self.assertEqual(observation["resourceConsoleCount"], 1)
        self.assertEqual(failures, [])

    def test_wrong_method_url_duplicate_and_expired_occurrences_fail_closed(self) -> None:
        expected_url = "http://127.0.0.1:3311/expected"

        for response, advance in (
            (FakeResponse(409, "GET", expected_url), 0.0),
            (FakeResponse(409, "POST", f"{expected_url}/other"), 0.0),
            (FakeResponse(404, "POST", expected_url), 0.0),
            (FakeResponse(409, "POST", expected_url), 2.0),
        ):
            with self.subTest(response=(response.status, response.request.method, response.url)):
                failures: list[str] = []
                now = [10.0]
                diagnostics = runner.BrowserDiagnostics(
                    failures, clock=lambda: now[0]
                )
                diagnostics.arm_expected_http_failure(
                    method="POST",
                    url=expected_url,
                    status=409,
                    label="bounded",
                    window_seconds=1.0,
                )
                now[0] += advance
                diagnostics.record_response(response)
                with self.assertRaisesRegex(AssertionError, "exactly once"):
                    diagnostics.finish_expected_http_failure()
                self.assertNotEqual(failures, [])

        failures = []
        diagnostics = runner.BrowserDiagnostics(failures)
        diagnostics.arm_expected_http_failure(
            method="POST",
            url=expected_url,
            status=409,
            label="duplicate",
        )
        diagnostics.record_response(FakeResponse(409, "POST", expected_url))
        diagnostics.record_response(FakeResponse(409, "POST", expected_url))
        with self.assertRaisesRegex(AssertionError, "exactly once"):
            diagnostics.finish_expected_http_failure()
        self.assertTrue(any(item.startswith("http:409:POST:") for item in failures))


if __name__ == "__main__":
    unittest.main()
