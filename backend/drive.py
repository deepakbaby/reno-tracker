"""Google Drive invoice storage (scope: drive.file).

Files live in the *user's own* Google Drive, inside a "House Invoices" folder,
so they can be browsed from the Drive app. With the non-sensitive `drive.file`
scope the app can only see/manage files it created itself.

Auth model: a one-time, server-side OAuth (run authorize_drive.py) mints a
refresh token stored in server secrets. From then on the app silently refreshes
short-lived access tokens. If the refresh token is ever revoked, calls raise
`ReauthRequired` so the UI can surface a "re-auth needed" banner.
"""
import io
import os

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google.auth.exceptions import RefreshError
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from googleapiclient.errors import HttpError

from storage import InvoiceStore, ReauthRequired

SCOPES = ["https://www.googleapis.com/auth/drive.file"]
TOKEN_URI = "https://oauth2.googleapis.com/token"
FOLDER_NAME = os.environ.get("DRIVE_FOLDER_NAME", "House Invoices")
FOLDER_MIME = "application/vnd.google-apps.folder"


def build_credentials():
    return Credentials(
        token=None,
        refresh_token=os.environ["GOOGLE_REFRESH_TOKEN"],
        token_uri=TOKEN_URI,
        client_id=os.environ["GOOGLE_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        scopes=SCOPES,
    )


class GoogleDriveStore(InvoiceStore):
    backend = "drive"

    def __init__(self):
        self._creds = build_credentials()
        self._folder_id = os.environ.get("DRIVE_FOLDER_ID") or None

    # ── internals ────────────────────────────────────────────────────────────

    def _service(self):
        try:
            if not self._creds.valid:
                self._creds.refresh(Request())
        except RefreshError as e:
            raise ReauthRequired(str(e))
        return build("drive", "v3", credentials=self._creds, cache_discovery=False)

    def _ensure_folder(self, svc):
        if self._folder_id:
            return self._folder_id
        # Find an existing folder we created earlier...
        q = (
            f"name = '{FOLDER_NAME}' and mimeType = '{FOLDER_MIME}' and trashed = false"
        )
        res = svc.files().list(q=q, spaces="drive", fields="files(id, name)").execute()
        files = res.get("files", [])
        if files:
            self._folder_id = files[0]["id"]
        else:
            meta = {"name": FOLDER_NAME, "mimeType": FOLDER_MIME}
            folder = svc.files().create(body=meta, fields="id").execute()
            self._folder_id = folder["id"]
        return self._folder_id

    # ── interface ────────────────────────────────────────────────────────────

    def upload(self, stream, filename, mimetype):
        svc = self._service()
        folder_id = self._ensure_folder(svc)
        data = stream.read() if hasattr(stream, "read") else stream
        media = MediaIoBaseUpload(
            io.BytesIO(data),
            mimetype=mimetype or "application/octet-stream",
            resumable=True,  # resumable handles larger PDFs / flaky uploads
        )
        meta = {"name": filename, "parents": [folder_id]}
        try:
            created = svc.files().create(
                body=meta, media_body=media, fields="id, webViewLink",
            ).execute()
        except RefreshError as e:
            raise ReauthRequired(str(e))
        return {"file_id": created["id"], "link": created.get("webViewLink")}

    def delete(self, file_id):
        if not file_id:
            return
        svc = self._service()
        try:
            svc.files().delete(fileId=file_id).execute()
        except HttpError as e:
            if e.resp.status != 404:  # already gone is fine
                raise

    def status(self):
        configured = all(os.environ.get(k) for k in (
            "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN",
        ))
        if not configured:
            return {
                "backend": "drive", "configured": False, "ok": False,
                "needs_reauth": True,
                "message": "Google Drive is not configured.",
            }
        try:
            svc = self._service()
            svc.files().list(pageSize=1, fields="files(id)").execute()
            return {
                "backend": "drive", "configured": True, "ok": True,
                "needs_reauth": False, "message": "Connected to Google Drive.",
            }
        except ReauthRequired:
            return {
                "backend": "drive", "configured": True, "ok": False,
                "needs_reauth": True,
                "message": "Drive access was revoked. Re-run the one-time authorization.",
            }
        except Exception as e:  # noqa: BLE001
            return {
                "backend": "drive", "configured": True, "ok": False,
                "needs_reauth": False, "message": f"Drive error: {e}",
            }
