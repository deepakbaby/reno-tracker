import sqlite3
import os

DB_PATH = os.environ.get("DB_PATH", "expenses.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    db = get_db()
    db.executescript("""
        CREATE TABLE IF NOT EXISTS categories (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL UNIQUE COLLATE NOCASE,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS expenses (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            amount_cents  INTEGER NOT NULL,
            currency      TEXT NOT NULL DEFAULT 'EUR',
            date          TEXT NOT NULL,
            vendor        TEXT NOT NULL,
            category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
            note          TEXT,
            drive_file_id TEXT,
            drive_link    TEXT,
            created_at    TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date DESC);
        CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);

        CREATE TABLE IF NOT EXISTS todos (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            title       TEXT NOT NULL,
            note        TEXT,
            due_date    TEXT,
            status      TEXT NOT NULL DEFAULT 'todo'
                          CHECK(status IN ('todo', 'in_progress', 'done')),
            priority    TEXT NOT NULL DEFAULT 'medium'
                          CHECK(priority IN ('low', 'medium', 'high')),
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            done_at     TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
    """)

    # Migration: add `priority` to a pre-existing todos table that lacks it.
    todo_cols = [r["name"] for r in db.execute("PRAGMA table_info(todos)").fetchall()]
    if "priority" not in todo_cols:
        db.execute("ALTER TABLE todos ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'")

    # Seed a few starter categories only on first run (empty table).
    existing = db.execute("SELECT COUNT(*) AS c FROM categories").fetchone()["c"]
    if existing == 0:
        db.executemany(
            "INSERT INTO categories (name) VALUES (?)",
            [("Furnishings",), ("Renovations",), ("Appliances",)],
        )
    db.commit()
    db.close()


# ─── Categories ───────────────────────────────────────────────────────────────

def list_categories():
    db = get_db()
    rows = db.execute("""
        SELECT c.id, c.name, c.created_at,
               COUNT(e.id) AS expense_count
        FROM categories c
        LEFT JOIN expenses e ON e.category_id = c.id
        GROUP BY c.id
        ORDER BY c.name COLLATE NOCASE ASC
    """).fetchall()
    db.close()
    return [dict(r) for r in rows]


def create_category(name):
    db = get_db()
    cur = db.execute("INSERT INTO categories (name) VALUES (?)", (name,))
    db.commit()
    new_id = cur.lastrowid
    row = db.execute("SELECT id, name, created_at FROM categories WHERE id = ?", (new_id,)).fetchone()
    db.close()
    return dict(row)


def rename_category(category_id, name):
    db = get_db()
    db.execute("UPDATE categories SET name = ? WHERE id = ?", (name, category_id))
    db.commit()
    row = db.execute("SELECT id, name, created_at FROM categories WHERE id = ?", (category_id,)).fetchone()
    db.close()
    return dict(row) if row else None


def delete_category(category_id):
    """Delete a category. Expenses keep their row but lose the category link
    (ON DELETE SET NULL), so no expense or invoice is ever lost this way."""
    db = get_db()
    db.execute("DELETE FROM categories WHERE id = ?", (category_id,))
    db.commit()
    db.close()


def category_exists(category_id):
    db = get_db()
    row = db.execute("SELECT 1 FROM categories WHERE id = ?", (category_id,)).fetchone()
    db.close()
    return row is not None


# ─── Expenses ─────────────────────────────────────────────────────────────────

EXPENSE_SELECT = """
    SELECT e.id, e.amount_cents, e.currency, e.date, e.vendor,
           e.category_id, c.name AS category_name,
           e.note, e.drive_file_id, e.drive_link, e.created_at
    FROM expenses e
    LEFT JOIN categories c ON c.id = e.category_id
"""


def list_expenses(category_id=None):
    db = get_db()
    if category_id:
        rows = db.execute(
            EXPENSE_SELECT + " WHERE e.category_id = ? ORDER BY e.date DESC, e.id DESC",
            (category_id,),
        ).fetchall()
    else:
        rows = db.execute(
            EXPENSE_SELECT + " ORDER BY e.date DESC, e.id DESC"
        ).fetchall()
    db.close()
    return [dict(r) for r in rows]


def get_expense(expense_id):
    db = get_db()
    row = db.execute(EXPENSE_SELECT + " WHERE e.id = ?", (expense_id,)).fetchone()
    db.close()
    return dict(row) if row else None


def create_expense(amount_cents, date, vendor, category_id, note, drive_file_id=None, drive_link=None):
    db = get_db()
    cur = db.execute("""
        INSERT INTO expenses (amount_cents, currency, date, vendor, category_id, note, drive_file_id, drive_link)
        VALUES (?, 'EUR', ?, ?, ?, ?, ?, ?)
    """, (amount_cents, date, vendor, category_id, note, drive_file_id, drive_link))
    db.commit()
    new_id = cur.lastrowid
    db.close()
    return get_expense(new_id)


def update_expense(expense_id, fields):
    """Patch only the provided columns. `fields` is a dict of column->value."""
    allowed = {"amount_cents", "date", "vendor", "category_id", "note", "drive_file_id", "drive_link"}
    sets = {k: v for k, v in fields.items() if k in allowed}
    if not sets:
        return get_expense(expense_id)
    assignments = ", ".join(f"{k} = ?" for k in sets)
    values = list(sets.values()) + [expense_id]
    db = get_db()
    db.execute(f"UPDATE expenses SET {assignments} WHERE id = ?", values)
    db.commit()
    db.close()
    return get_expense(expense_id)


def delete_expense(expense_id):
    db = get_db()
    db.execute("DELETE FROM expenses WHERE id = ?", (expense_id,))
    db.commit()
    db.close()


def totals(category_id=None):
    """Running total (filtered) plus a per-category breakdown of the whole DB."""
    db = get_db()
    if category_id:
        grand = db.execute(
            "SELECT COALESCE(SUM(amount_cents), 0) AS s, COUNT(*) AS c FROM expenses WHERE category_id = ?",
            (category_id,),
        ).fetchone()
    else:
        grand = db.execute(
            "SELECT COALESCE(SUM(amount_cents), 0) AS s, COUNT(*) AS c FROM expenses"
        ).fetchone()

    by_cat = db.execute("""
        SELECT c.id AS category_id, c.name AS category_name,
               COALESCE(SUM(e.amount_cents), 0) AS total_cents,
               COUNT(e.id) AS count
        FROM categories c
        LEFT JOIN expenses e ON e.category_id = c.id
        GROUP BY c.id
        ORDER BY total_cents DESC
    """).fetchall()

    # Expenses whose category was deleted (category_id IS NULL) still count.
    uncat = db.execute("""
        SELECT COALESCE(SUM(amount_cents), 0) AS total_cents, COUNT(*) AS count
        FROM expenses WHERE category_id IS NULL
    """).fetchone()
    db.close()

    by_category = [dict(r) for r in by_cat]
    if uncat["count"] > 0:
        by_category.append({
            "category_id": None,
            "category_name": "Uncategorized",
            "total_cents": uncat["total_cents"],
            "count": uncat["count"],
        })

    return {
        "total_cents": grand["s"],
        "count": grand["c"],
        "by_category": by_category,
    }


# ─── Todos ────────────────────────────────────────────────────────────────────

TODO_STATUSES = ("todo", "in_progress", "done")
TODO_PRIORITIES = ("low", "medium", "high")

# Order: open items first (todo, then in_progress), done last; within a group,
# higher priority first, then items with a due date (soonest first), then newest.
TODO_ORDER = """
    ORDER BY
        CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
        CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
        (due_date IS NULL), due_date ASC,
        id DESC
"""


def list_todos(status=None):
    db = get_db()
    if status in TODO_STATUSES:
        rows = db.execute(
            f"SELECT * FROM todos WHERE status = ? {TODO_ORDER}", (status,)
        ).fetchall()
    else:
        rows = db.execute(f"SELECT * FROM todos {TODO_ORDER}").fetchall()
    db.close()
    return [dict(r) for r in rows]


def todo_counts():
    db = get_db()
    rows = db.execute("SELECT status, COUNT(*) AS c FROM todos GROUP BY status").fetchall()
    db.close()
    counts = {s: 0 for s in TODO_STATUSES}
    for r in rows:
        counts[r["status"]] = r["c"]
    counts["all"] = sum(counts[s] for s in TODO_STATUSES)
    counts["remaining"] = counts["todo"] + counts["in_progress"]
    return counts


def get_todo(todo_id):
    db = get_db()
    row = db.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
    db.close()
    return dict(row) if row else None


def create_todo(title, note=None, due_date=None, status="todo", priority="medium"):
    db = get_db()
    cur = db.execute(
        "INSERT INTO todos (title, note, due_date, status, priority, done_at) VALUES (?, ?, ?, ?, ?, ?)",
        (title, note, due_date, status, priority, _now() if status == "done" else None),
    )
    db.commit()
    new_id = cur.lastrowid
    db.close()
    return get_todo(new_id)


def update_todo(todo_id, fields):
    allowed = {"title", "note", "due_date", "status", "priority"}
    sets = {k: v for k, v in fields.items() if k in allowed}
    if not sets:
        return get_todo(todo_id)
    # Keep done_at consistent with status transitions.
    if "status" in sets:
        sets["done_at"] = _now() if sets["status"] == "done" else None
    assignments = ", ".join(f"{k} = ?" for k in sets)
    values = list(sets.values()) + [todo_id]
    db = get_db()
    db.execute(f"UPDATE todos SET {assignments} WHERE id = ?", values)
    db.commit()
    db.close()
    return get_todo(todo_id)


def delete_todo(todo_id):
    db = get_db()
    db.execute("DELETE FROM todos WHERE id = ?", (todo_id,))
    db.commit()
    db.close()


def _now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
