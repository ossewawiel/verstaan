# SPDX-License-Identifier: MPL-2.0
"""Sign in at `/user/index.php?page=login` (SPEC.md §3.1, issue 08).

The form posts `login` and `password` fields. A wrong credential, or no credential at all,
re-serves the same login form (`id="loginForm"`); a real sign-in redirects to a page that does
not. The session cookie itself never appears in this module — it lives only in the `Transport`'s
in-memory cookie jar (`tools.mirror.http_client.UrllibTransport`), which every later `client.get`
call reuses automatically.
"""

from __future__ import annotations

from urllib.parse import urlencode

from tools.mirror.http_client import RateLimitedClient

_LOGIN_FORM_MARKER = 'id="loginForm"'


class LoginError(Exception):
    """Raised when the sign-in POST did not authenticate (bad credentials, changed form, ...)."""


def sign_in(client: RateLimitedClient, root: str, username: str, password: str) -> None:
    """POST the sign-in form. Raises `LoginError` if the login form is still showing afterwards."""
    url = f"{root}/user/index.php?page=login"
    body = urlencode({"login": username, "password": password, "Submit": "Submit"}).encode("utf-8")
    response = client.post(
        url, data=body, extra_headers={"Content-Type": "application/x-www-form-urlencoded"}
    )
    html = response.body.decode("utf-8", errors="replace")
    if response.status >= 400 or _LOGIN_FORM_MARKER in html:
        raise LoginError(
            "sign-in failed: the login form is still showing after the POST "
            "(check UNL_USER / UNL_PASS)"
        )
