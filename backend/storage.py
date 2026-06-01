"""Backend-agnostic invoice storage.

The rest of the app only ever talks to the `InvoiceStore` interface, so the
Google Drive layer can be swapped or stubbed for tests. `get_store()` returns a
`GoogleDriveStore` when Drive is configured, otherwise a `LocalInvoiceStore`
that writes under DATA_DIR (handy for local dev and unit tests).
"""
import os
import uuid

DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "data"))
INVOICE_DIR = os.path.join(DATA_DIR, "invoices")


class ReauthRequired(Exception):
    """Raised when the Drive refresh token is missing/revoked and the one-time
    server-side OAuth needs to be re-run (see authorize_drive.py)."""


class InvoiceStore:
    backend = "none"

    def upload(self, stream, filename, mimetype):
        """Store the file. Returns {"file_id": str, "link": str}."""
        raise NotImplementedError

    def delete(self, file_id):
        raise NotImplementedError

    def status(self):
        """Returns {"backend", "configured", "ok", "needs_reauth", "message"}."""
        raise NotImplementedError


class LocalInvoiceStore(InvoiceStore):
    """Filesystem fallback. Files are served back through /api/invoices/<id>."""
    backend = "local"

    def __init__(self):
        os.makedirs(INVOICE_DIR, exist_ok=True)

    def upload(self, stream, filename, mimetype):
        safe = filename.replace("/", "_").replace("\\", "_")
        file_id = f"{uuid.uuid4().hex}__{safe}"
        path = os.path.join(INVOICE_DIR, file_id)
        with open(path, "wb") as f:
            f.write(stream.read())
        return {"file_id": file_id, "link": f"/api/invoices/{file_id}"}

    def delete(self, file_id):
        path = os.path.join(INVOICE_DIR, file_id)
        if os.path.exists(path):
            os.remove(path)

    def local_path(self, file_id):
        # Guard against path traversal.
        if "/" in file_id or "\\" in file_id or file_id.startswith("."):
            return None
        path = os.path.join(INVOICE_DIR, file_id)
        return path if os.path.exists(path) else None

    def status(self):
        return {
            "backend": "local",
            "configured": True,
            "ok": True,
            "needs_reauth": False,
            "message": "Storing invoices on the local disk (Google Drive not configured).",
        }


_store = None


def get_store():
    """Lazily build and cache the active store."""
    global _store
    if _store is not None:
        return _store

    has_drive_config = all(os.environ.get(k) for k in (
        "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN",
    ))
    if has_drive_config:
        try:
            from drive import GoogleDriveStore
            _store = GoogleDriveStore()
            return _store
        except Exception as e:  # noqa: BLE001 - never let storage init crash the app
            print(f"[storage] Drive configured but failed to initialise: {e}. Falling back to local.")

    _store = LocalInvoiceStore()
    return _store
