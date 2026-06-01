"""Password gate for the whole app.

Ported from the balance-tracker pattern: a single shared password unlocks the
app, and the server hands back an HMAC-signed, HttpOnly session cookie. This is
about *who may open the app* — it is unrelated to the Google Drive OAuth that
stores invoice files (that runs once, server-side, see drive.py).
"""
import base64
import hashlib
import hmac
import os
import time
from functools import wraps

from flask import request, jsonify, make_response

APP_PASSWORD = os.environ.get("APP_PASSWORD", "change-me")
SESSION_SECRET = os.environ.get("SESSION_SECRET", "dev-secret-change-me").encode()
SESSION_TTL = 60 * 60 * 24 * 30  # 30 days
COOKIE_NAME = "expenses_session"
IS_PROD = os.environ.get("ENVIRONMENT", "development") == "production"

# Best-effort in-memory login throttle (resets on restart — fine for a 1-user app).
_FAILED_LOGINS = {}
_MAX_FAILS = 8


def _client_ip():
    fwd = request.headers.get("X-Forwarded-For", "")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.remote_addr or "unknown"


def sign_session():
    expires = int(time.time()) + SESSION_TTL
    payload = f"user:{expires}"
    sig = hmac.new(SESSION_SECRET, payload.encode(), hashlib.sha256).hexdigest()
    token = base64.urlsafe_b64encode(f"{payload}:{sig}".encode()).decode()
    return token


def verify_session(token):
    if not token:
        return False
    try:
        raw = base64.urlsafe_b64decode(token.encode()).decode()
        user, expires, sig = raw.split(":")
        payload = f"{user}:{expires}"
        expected = hmac.new(SESSION_SECRET, payload.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return False
        if int(expires) < int(time.time()):
            return False
        return True
    except Exception:
        return False


def check_password(candidate):
    return hmac.compare_digest((candidate or "").encode(), APP_PASSWORD.encode())


def _set_cookie(resp, token, max_age):
    resp.set_cookie(
        COOKIE_NAME, token,
        max_age=max_age, httponly=True, samesite="Lax",
        secure=IS_PROD, path="/",
    )


def is_authenticated():
    return verify_session(request.cookies.get(COOKIE_NAME))


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not is_authenticated():
            return jsonify({"error": "Unauthorized"}), 401
        return fn(*args, **kwargs)
    return wrapper


def register_auth_routes(app):
    @app.route("/api/login", methods=["POST"])
    def login():
        ip = _client_ip()
        if _FAILED_LOGINS.get(ip, 0) >= _MAX_FAILS:
            return jsonify({"error": "Too many attempts. Try again later."}), 429

        data = request.get_json(silent=True) or {}
        if check_password(data.get("password", "")):
            _FAILED_LOGINS[ip] = 0
            resp = make_response(jsonify({"success": True}))
            _set_cookie(resp, sign_session(), SESSION_TTL)
            return resp

        _FAILED_LOGINS[ip] = _FAILED_LOGINS.get(ip, 0) + 1
        return jsonify({"error": "Invalid password"}), 401

    @app.route("/api/logout", methods=["POST"])
    def logout():
        resp = make_response(jsonify({"success": True}))
        _set_cookie(resp, "", 0)
        return resp

    @app.route("/api/me", methods=["GET"])
    def me():
        return jsonify({"authenticated": is_authenticated()})


def assert_safe_config():
    """Refuse to run in production with default secrets."""
    if not IS_PROD:
        return
    problems = []
    if APP_PASSWORD == "change-me":
        problems.append("APP_PASSWORD is still the default")
    if SESSION_SECRET == b"dev-secret-change-me":
        problems.append("SESSION_SECRET is still the default")
    if problems:
        raise SystemExit("FATAL: " + "; ".join(problems))
