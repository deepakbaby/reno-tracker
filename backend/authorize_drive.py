#!/usr/bin/env python3
"""One-time Google Drive authorization — run this on a machine with a browser
(e.g. your Mac), then copy the printed refresh token into the server's .env.

What it does:
  - Opens Google's consent screen for the `drive.file` scope.
  - Uses access_type=offline + prompt=consent so Google returns a REFRESH token.
  - Prints that refresh token. Store it as GOOGLE_REFRESH_TOKEN in server secrets.

Prereqs:
  pip install google-auth-oauthlib
  Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (a "Desktop app" OAuth client
  from Google Cloud Console), or pass a client_secret.json via --client-secrets.

IMPORTANT: Set the OAuth consent screen to "In production" in Google Cloud
Console. In "Testing" mode Google expires the refresh token after 7 days and the
app will silently break. Personal use (<100 users) needs no formal verification —
just click past the "unverified app" warning once here.
"""
import argparse
import json
import os
import sys
import tempfile

SCOPES = ["https://www.googleapis.com/auth/drive.file"]


def main():
    parser = argparse.ArgumentParser(description="Mint a Google Drive refresh token.")
    parser.add_argument("--client-secrets", help="Path to client_secret.json (optional)")
    parser.add_argument("--port", type=int, default=0, help="Local redirect port (0 = auto)")
    args = parser.parse_args()

    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError:
        sys.exit("Missing dependency. Run: pip install google-auth-oauthlib")

    if args.client_secrets:
        flow = InstalledAppFlow.from_client_secrets_file(args.client_secrets, SCOPES)
    else:
        client_id = os.environ.get("GOOGLE_CLIENT_ID")
        client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
        if not (client_id and client_secret):
            sys.exit(
                "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or pass "
                "--client-secrets path/to/client_secret.json"
            )
        config = {
            "installed": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": ["http://localhost"],
            }
        }
        # InstalledAppFlow wants a file; write a throwaway one.
        tmp = tempfile.NamedTemporaryFile("w", suffix=".json", delete=False)
        json.dump(config, tmp)
        tmp.close()
        flow = InstalledAppFlow.from_client_secrets_file(tmp.name, SCOPES)
        os.unlink(tmp.name)

    creds = flow.run_local_server(
        port=args.port,
        access_type="offline",
        prompt="consent",
        open_browser=True,
    )

    if not creds.refresh_token:
        sys.exit(
            "No refresh token returned. Make sure the consent screen granted access "
            "and that you used prompt=consent (revoke prior access at "
            "https://myaccount.google.com/permissions and retry)."
        )

    print("\n" + "=" * 60)
    print("SUCCESS — add this line to the server's .env:")
    print("=" * 60)
    print(f"GOOGLE_REFRESH_TOKEN={creds.refresh_token}")
    print("=" * 60)


if __name__ == "__main__":
    main()
