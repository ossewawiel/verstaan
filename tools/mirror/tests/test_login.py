# SPDX-License-Identifier: MPL-2.0
"""`sign_in`: POSTs the login form, raises on a still-showing form (SPEC.md §3.1, issue 08)."""

from __future__ import annotations

from pathlib import Path

import pytest

from tools.mirror.http_client import HttpResponse
from tools.mirror.login import LoginError, sign_in

_LOGIN_FORM_HTML = (Path(__file__).parent / "fixtures" / "user_login.html").read_text(
    encoding="utf-8"
)
_LOGGED_IN_HTML = "<html><body><h2>Marsel Pretorius</h2></body></html>"


class FakeClient:
    def __init__(self, response: HttpResponse):
        self.response = response
        self.calls = []

    def post(self, url, *, data, extra_headers=None):
        self.calls.append((url, data, dict(extra_headers or {})))
        return self.response


def test_sign_in_posts_login_and_password_fields():
    client = FakeClient(HttpResponse(200, {}, _LOGGED_IN_HTML.encode("utf-8")))
    sign_in(client, "https://unlarchive.org", "wawiel", "hunter2")
    url, data, headers = client.calls[0]
    assert url == "https://unlarchive.org/user/index.php?page=login"
    body = data.decode("utf-8")
    assert "login=wawiel" in body
    assert "password=hunter2" in body
    assert headers["Content-Type"] == "application/x-www-form-urlencoded"


def test_sign_in_succeeds_when_the_login_form_is_gone():
    client = FakeClient(HttpResponse(200, {}, _LOGGED_IN_HTML.encode("utf-8")))
    sign_in(client, "https://unlarchive.org", "wawiel", "hunter2")  # must not raise


def test_sign_in_raises_when_the_login_form_is_still_showing():
    client = FakeClient(HttpResponse(200, {}, _LOGIN_FORM_HTML.encode("utf-8")))
    with pytest.raises(LoginError):
        sign_in(client, "https://unlarchive.org", "wawiel", "wrong-password")


def test_sign_in_raises_on_a_4xx_response():
    client = FakeClient(HttpResponse(403, {}, b"forbidden"))
    with pytest.raises(LoginError):
        sign_in(client, "https://unlarchive.org", "wawiel", "hunter2")
