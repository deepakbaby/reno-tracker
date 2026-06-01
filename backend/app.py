import os
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from datetime import datetime

from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_cors import CORS

import db
import auth
from storage import get_store, LocalInvoiceStore, ReauthRequired

# ─── Zero-dependency .env loader (mirrors the sibling apps) ────────────────────
_env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(_env_path):
    with open(_env_path) as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _v = _line.split("=", 1)
                os.environ.setdefault(_k, _v.split(" #")[0].strip().strip('"').strip("'"))

# Re-read auth config now that .env is loaded (auth read os.environ at import).
auth.APP_PASSWORD = os.environ.get("APP_PASSWORD", auth.APP_PASSWORD)
auth.SESSION_SECRET = os.environ.get("SESSION_SECRET", auth.SESSION_SECRET.decode() if isinstance(auth.SESSION_SECRET, bytes) else auth.SESSION_SECRET)
if isinstance(auth.SESSION_SECRET, str):
    auth.SESSION_SECRET = auth.SESSION_SECRET.encode()
auth.IS_PROD = os.environ.get("ENVIRONMENT", "development") == "production"

MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "25"))

# static_folder=None disables Flask's auto static route so our catch-all below
# can do proper SPA deep-link fallback (serve index.html for unknown paths).
DIST_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024

_origins = ["http://localhost:5173", "https://expenses.deepakbaby.in"]
CORS(app, supports_credentials=True, origins=_origins)

db.init_db()
auth.assert_safe_config()
auth.register_auth_routes(app)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def euros_to_cents(value):
    """Parse a euro amount (string or number) into integer cents, money-safe."""
    try:
        d = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        return None
    if d < 0:
        return None
    return int(d * 100)


def _form_value(key, default=None):
    """Read a value from JSON or multipart form indifferently."""
    if request.is_json:
        return (request.get_json(silent=True) or {}).get(key, default)
    return request.form.get(key, default)


def _save_invoice_if_present():
    """Returns (file_id, link) for an uploaded 'invoice' file, or (None, None)."""
    file = request.files.get("invoice")
    if not file or not file.filename:
        return None, None
    store = get_store()
    result = store.upload(file.stream, file.filename, file.mimetype)
    return result["file_id"], result["link"]


# ─── Health ───────────────────────────────────────────────────────────────────

@app.route("/api/health")
def health():
    return jsonify({"status": "ok", "timestamp": datetime.now().isoformat()})


# ─── Categories ───────────────────────────────────────────────────────────────

@app.route("/api/categories", methods=["GET"])
@auth.login_required
def get_categories():
    return jsonify(db.list_categories())


@app.route("/api/categories", methods=["POST"])
@auth.login_required
def add_category():
    name = (_form_value("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    try:
        return jsonify(db.create_category(name)), 201
    except Exception as e:  # UNIQUE violation -> duplicate name
        if "UNIQUE" in str(e):
            return jsonify({"error": "A category with that name already exists"}), 409
        raise


@app.route("/api/categories/<int:category_id>", methods=["PUT"])
@auth.login_required
def edit_category(category_id):
    if not db.category_exists(category_id):
        return jsonify({"error": "Category not found"}), 404
    name = (_form_value("name") or "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    try:
        return jsonify(db.rename_category(category_id, name))
    except Exception as e:
        if "UNIQUE" in str(e):
            return jsonify({"error": "A category with that name already exists"}), 409
        raise


@app.route("/api/categories/<int:category_id>", methods=["DELETE"])
@auth.login_required
def remove_category(category_id):
    if not db.category_exists(category_id):
        return jsonify({"error": "Category not found"}), 404
    db.delete_category(category_id)
    return jsonify({"success": True})


# ─── Expenses ─────────────────────────────────────────────────────────────────

@app.route("/api/expenses", methods=["GET"])
@auth.login_required
def get_expenses():
    category_id = request.args.get("category_id", type=int)
    return jsonify(db.list_expenses(category_id))


@app.route("/api/expenses/totals", methods=["GET"])
@auth.login_required
def get_totals():
    category_id = request.args.get("category_id", type=int)
    return jsonify(db.totals(category_id))


@app.route("/api/expenses/<int:expense_id>", methods=["GET"])
@auth.login_required
def get_one_expense(expense_id):
    exp = db.get_expense(expense_id)
    if not exp:
        return jsonify({"error": "Not found"}), 404
    return jsonify(exp)


@app.route("/api/expenses", methods=["POST"])
@auth.login_required
def add_expense():
    amount_cents = euros_to_cents(_form_value("amount"))
    date = (_form_value("date") or "").strip()
    vendor = (_form_value("vendor") or "").strip()
    note = (_form_value("note") or "").strip()
    category_id = _form_value("category_id")
    category_id = int(category_id) if category_id not in (None, "", "null") else None

    if amount_cents is None:
        return jsonify({"error": "A valid amount is required"}), 400
    if not date:
        return jsonify({"error": "date is required"}), 400
    if not vendor:
        return jsonify({"error": "vendor is required"}), 400
    if category_id is not None and not db.category_exists(category_id):
        return jsonify({"error": "Unknown category"}), 400

    try:
        file_id, link = _save_invoice_if_present()
    except ReauthRequired:
        return jsonify({"error": "drive_reauth_required"}), 503

    exp = db.create_expense(amount_cents, date, vendor, category_id, note, file_id, link)
    return jsonify(exp), 201


@app.route("/api/expenses/<int:expense_id>", methods=["PUT", "POST"])
@auth.login_required
def edit_expense(expense_id):
    existing = db.get_expense(expense_id)
    if not existing:
        return jsonify({"error": "Not found"}), 404

    fields = {}

    if _form_value("amount") is not None:
        amount_cents = euros_to_cents(_form_value("amount"))
        if amount_cents is None:
            return jsonify({"error": "A valid amount is required"}), 400
        fields["amount_cents"] = amount_cents

    for key in ("date", "vendor", "note"):
        val = _form_value(key)
        if val is not None:
            fields[key] = val.strip()

    raw_cat = _form_value("category_id")
    if raw_cat is not None:
        category_id = int(raw_cat) if raw_cat not in ("", "null") else None
        if category_id is not None and not db.category_exists(category_id):
            return jsonify({"error": "Unknown category"}), 400
        fields["category_id"] = category_id

    store = get_store()

    # Replace or remove the invoice.
    remove_flag = str(_form_value("remove_invoice", "")).lower() in ("1", "true", "yes")
    new_file = request.files.get("invoice")
    if (new_file and new_file.filename) or remove_flag:
        if existing.get("drive_file_id"):
            try:
                store.delete(existing["drive_file_id"])
            except Exception as e:  # noqa: BLE001 - don't block edit on cleanup failure
                print(f"[invoice] failed to delete old file: {e}")
        if new_file and new_file.filename:
            try:
                file_id, link = _save_invoice_if_present()
            except ReauthRequired:
                return jsonify({"error": "drive_reauth_required"}), 503
            fields["drive_file_id"], fields["drive_link"] = file_id, link
        else:
            fields["drive_file_id"], fields["drive_link"] = None, None

    return jsonify(db.update_expense(expense_id, fields))


@app.route("/api/expenses/<int:expense_id>", methods=["DELETE"])
@auth.login_required
def remove_expense(expense_id):
    existing = db.get_expense(expense_id)
    if not existing:
        return jsonify({"error": "Not found"}), 404
    if existing.get("drive_file_id"):
        try:
            get_store().delete(existing["drive_file_id"])
        except Exception as e:  # noqa: BLE001
            print(f"[invoice] failed to delete file on expense delete: {e}")
    db.delete_expense(expense_id)
    return jsonify({"success": True})


# ─── Todos ────────────────────────────────────────────────────────────────────

@app.route("/api/todos", methods=["GET"])
@auth.login_required
def get_todos():
    status = request.args.get("status")
    return jsonify({
        "todos": db.list_todos(status),
        "counts": db.todo_counts(),
    })


@app.route("/api/todos", methods=["POST"])
@auth.login_required
def add_todo():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    if not title:
        return jsonify({"error": "title is required"}), 400
    status = data.get("status", "todo")
    if status not in db.TODO_STATUSES:
        status = "todo"
    priority = data.get("priority", "medium")
    if priority not in db.TODO_PRIORITIES:
        priority = "medium"
    due = (data.get("due_date") or "").strip() or None
    note = (data.get("note") or "").strip() or None
    return jsonify(db.create_todo(title, note, due, status, priority)), 201


@app.route("/api/todos/<int:todo_id>", methods=["PUT"])
@auth.login_required
def edit_todo(todo_id):
    if not db.get_todo(todo_id):
        return jsonify({"error": "Not found"}), 404
    data = request.get_json(silent=True) or {}
    fields = {}
    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            return jsonify({"error": "title is required"}), 400
        fields["title"] = title
    if "note" in data:
        fields["note"] = (data.get("note") or "").strip() or None
    if "due_date" in data:
        fields["due_date"] = (data.get("due_date") or "").strip() or None
    if "status" in data:
        if data["status"] not in db.TODO_STATUSES:
            return jsonify({"error": "invalid status"}), 400
        fields["status"] = data["status"]
    if "priority" in data:
        if data["priority"] not in db.TODO_PRIORITIES:
            return jsonify({"error": "invalid priority"}), 400
        fields["priority"] = data["priority"]
    return jsonify(db.update_todo(todo_id, fields))


@app.route("/api/todos/<int:todo_id>", methods=["DELETE"])
@auth.login_required
def remove_todo(todo_id):
    if not db.get_todo(todo_id):
        return jsonify({"error": "Not found"}), 404
    db.delete_todo(todo_id)
    return jsonify({"success": True})


# ─── Invoices (local store only) ──────────────────────────────────────────────

@app.route("/api/invoices/<file_id>", methods=["GET"])
@auth.login_required
def serve_invoice(file_id):
    store = get_store()
    if not isinstance(store, LocalInvoiceStore):
        return jsonify({"error": "Not found"}), 404
    path = store.local_path(file_id)
    if not path:
        return jsonify({"error": "Not found"}), 404
    return send_file(path)


# ─── Drive status ─────────────────────────────────────────────────────────────

@app.route("/api/drive/status", methods=["GET"])
@auth.login_required
def drive_status():
    return jsonify(get_store().status())


# ─── Serve React PWA ──────────────────────────────────────────────────────────

@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def serve(path):
    # Real static file? Serve it. Otherwise fall back to index.html (SPA routing).
    if path and os.path.exists(os.path.join(DIST_DIR, path)) and not path.startswith(".."):
        return send_from_directory(DIST_DIR, path)
    index = os.path.join(DIST_DIR, "index.html")
    if os.path.exists(index):
        return send_from_directory(DIST_DIR, "index.html")
    return jsonify({"error": "Frontend not built. Run `npm run build` in frontend/."}), 503


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "5001")), debug=False)
