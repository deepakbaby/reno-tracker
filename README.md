# House Expenses

A small private app to log home-buying / furnishing expenses, tag each with a
category I define, and attach the invoice (photo or PDF). Invoices live in **my
own Google Drive**; everything else is a Flask + SQLite backend serving a React
PWA. Sibling to the budget app — same stack, layout and deploy pattern.

Live at **https://expenses.deepakbaby.in**.

## What it does

- Add / edit / delete expenses: amount (EUR, stored as integer **cents**), date,
  vendor, category, optional note, optional invoice file.
- **User-created, editable categories.** Creating / renaming / deleting
  categories is reliable; deleting a category never deletes its expenses — they
  fall back to *Uncategorized*.
- Filter expenses by category; running total + per-category totals.
- View / download the attached invoice (opens the Google Drive file).
- **Tasks** — a simple todo tracker (To Do / In Progress / Done) with optional
  due dates, for keeping track of what still needs doing on the house.

Visual style follows the HomeNest look: near-black UI, Playfair Display serif
headings, deep-green hero cards, emerald accents.

## Stack & layout

```
backend/      Flask + SQLite API, password gate, Drive invoice module
  app.py            routes + static serving of the built PWA
  db.py             SQLite schema + queries (categories, expenses)
  auth.py           password gate (PBKDF2-style HMAC session cookie)
  storage.py        backend-agnostic InvoiceStore + local fallback
  drive.py          Google Drive store (scope: drive.file, resumable upload)
  authorize_drive.py  one-time OAuth helper to mint a refresh token
  (todos live in the same SQLite DB: a `todos` table for the Tasks tab)
frontend/     React + Vite + Tailwind PWA (dark theme, green accent)
nginx/        reverse-proxy config for expenses.deepakbaby.in
systemd/      gunicorn service unit
deploy.sh     pull + build + restart on the server
```

Auth vs. Drive are **two separate things**: the **password** controls who can
open the app; the **Drive OAuth** is a one-time, server-side grant for storing
invoice files in my Drive (not a per-user login).

---

## Local development

**Backend** (port 5001):

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
APP_PASSWORD='dev' SESSION_SECRET='dev' python app.py
```

Without Google Drive env vars the app transparently stores invoices on local
disk under `backend/data/invoices/` (handy for dev/tests).

**Frontend** (port 5173, proxies `/api` → 5001):

```bash
cd frontend
npm install
npm run dev
```

Build for production: `npm run build` → `frontend/dist/` (Flask serves it).

---

## Google Drive setup (invoice storage)

Scope is `drive.file` — **non-sensitive**, so only basic verification is needed
(no security assessment). The app can only see/manage files it creates, and it
puts them in a "House Invoices" folder in my Drive.

1. **Google Cloud Console** → create/choose a project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **OAuth consent screen** → External. Add my email as the owner.
   - **Set it to "In production."** ⚠️ In *Testing* mode Google revokes the
     refresh token after **7 days** and the app silently breaks. Personal use
     (<100 users) needs no formal verification — just click past the
     "unverified app" warning once during step 5.
4. **Credentials → Create credentials → OAuth client ID → Desktop app.**
   Note the **client ID** and **client secret**.
5. **Mint a refresh token** (one time, on a machine with a browser — e.g. my Mac):

   ```bash
   cd backend
   pip install google-auth-oauthlib
   GOOGLE_CLIENT_ID='...' GOOGLE_CLIENT_SECRET='...' python authorize_drive.py
   ```

   A browser opens; approve the `drive.file` access (click past "unverified
   app"). The script prints `GOOGLE_REFRESH_TOKEN=...`.
6. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN`
   into `backend/.env` on the server (see `.env.example`).

The app auto-refreshes access tokens from then on. If the refresh token is ever
revoked (e.g. ~6 months unused), the UI shows a **"Drive needs
re-authorization"** banner and uploads are blocked — just re-run step 5 and
update `GOOGLE_REFRESH_TOKEN`. Check status anytime at `/api/drive/status`.

---

## Production deployment (Lightsail Ubuntu)

Runs alongside the budget app on the same box. `budget.deepakbaby.in` is left
untouched.

```bash
# 1. Clone
git clone <repo-url> /opt/apps/reno-tracker
cd /opt/apps/reno-tracker

# 2. Backend
cd backend
python3 -m venv venv && ./venv/bin/pip install -r requirements.txt
cp ../.env.example .env   # then edit .env: password, secret, Drive creds
mkdir -p /opt/apps/reno-tracker/data

# 3. Frontend build
cd ../frontend && npm install && npm run build

# 4. systemd service
sudo cp ../systemd/expenses.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now expenses.service

# 5. nginx
sudo cp ../nginx/expenses.deepakbaby.in.conf /etc/nginx/sites-available/expenses
sudo ln -s /etc/nginx/sites-available/expenses /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 6. DNS: add an A record  expenses.deepakbaby.in → <Lightsail IP>

# 7. TLS (required for PWA install on iOS)
sudo certbot --nginx -d expenses.deepakbaby.in
```

Generate the secret with `openssl rand -hex 32`. The server refuses to start in
`ENVIRONMENT=production` if `APP_PASSWORD` or `SESSION_SECRET` are left default.

**Updating:** `./deploy.sh` (pull → build → restart).

**Install as an app:** iPhone — open the URL in Safari → Share → Add to Home
Screen. Mac — Chrome/Edge address-bar install icon.

---

## Data & git hygiene

- Code is in git. **Data is not**: the SQLite DB and any local-fallback invoices
  live under `backend/data/` (gitignored); real invoices live in Google Drive.
- `.env` and any `client_secret*.json` are gitignored — never commit secrets.
