# AU Alumni Network

A full-stack alumni networking + activities platform for Adelaide University. Alumni register, build a profile, discover other alumni, connect and message each other, and book onto events organised by admins.

## Background & Context

- **What this is:** a capstone / industry-research build for the University of Adelaide. It is feature-complete enough to demo end-to-end (registration → 2FA → search → connect → message → book) but is **not** hardened for public production deployment — see [Things you MUST change before any real deployment](#things-you-must-change-before-any-real-deployment).
- **Two user types:**
  - **Alumni** (regular users) — self-register, manage a profile, discover/connect/message, browse and book activities.
  - **Admins** — created via Django superuser. Only admins can create activities and upload activity hero images. There is no in-app admin signup; you must promote a user manually (`is_staff=True` / `is_superuser=True`) via `manage.py createsuperuser` or the Django admin.
- **Alumni IDs (`AL-001`, `AL-002`, …)** are auto-assigned on first save of a `User`. They are the public handle used in URLs (`/api/profiles/<alumni_id>/`) and messaging. Do not rely on Django's internal `id` for cross-references in the API.
- **Time zone is `Australia/Adelaide`** (set in `backend/config/settings.py`). All `start_time` / `end_time` on activities are stored in UTC but rendered in this zone — change it if you fork for a different region.
- **Semantic search** for activities uses `sentence-transformers` (heavy dep, ~100 MB model download on first run). The activity-search endpoint blends an ORM lexical scorer with embedding similarity, caches recent query embeddings in-process, and degrades cleanly to lexical-only if embeddings are unavailable. Quality regressions can be caught with `python manage.py eval_search`.
- **Frontend backend-host auto-detect:** on native (Expo Go on a real phone / emulator) the API client extracts the host from Metro's bundle URL, so LAN testing works without setting `EXPO_PUBLIC_API_URL`. Setting it is still supported as an override (see step 1 of [Getting Started](#getting-started-from-scratch)).
- **Demo SMTP credentials** are baked into `settings.py` as a fallback so password-reset works out-of-the-box during evaluation. They are **demo only** — see the production checklist below.

## Tech Stack

- **Backend:** Django 6 + Django REST Framework
- **Frontend:** React Native (Expo) — Web, iOS, Android
- **Database:** MySQL 8 (SQLite fallback for local dev)
- **Auth:** JWT (SimpleJWT) with TOTP 2FA + email password reset
- **DevOps:** Docker + docker-compose

## Features

### Accounts & security
- Register / login with auto-assigned alumni id (`AL-001`, `AL-002`, …)
- JWT access + rotating refresh tokens
- Optional TOTP 2FA (setup, enable, disable, verify-on-login)
- Forgot-password flow via emailed 6-digit code
- Per-user toggles: `is_profile_public`, `allow_contact`

### Profiles
- Core fields: name, degree, graduation year, industry, current role, bio
- `hobbies` — free-text list (personal / leisure)
- `expertise` — free-text list of skills / specialisations (filterable, also feeds autocomplete)
- `professional_interests` — dropdown constrained to the `ProfessionalInterestOption` catalog
- `companies` — free-text list; each entry upserts into a global `Company` catalog that powers autocomplete
- Avatar upload (multipart → `profile_picture`)

### Alumni discovery
- Filterable search: industry, graduation year, degree, hobbies, professional interests, expertise
- `companies` is deliberately **not** a filter — only surfaces in autocomplete
- Grouped autocomplete endpoint merges **People · Companies · Professional interests** (and pulls degrees / industries / roles / expertise / hobbies from existing profiles)
- Separate dedicated companies-autocomplete endpoint

### Connections
- Send / accept / reject contact requests
- Inbox views for sent + received
- List established connections

### Messaging
- Direct messages between connected alumni
- Inbox + sent views, per-message detail, and per-alumni conversation thread

### Activities (home tab)
- Admin-created events with title, description, location, start/end time, capacity, category, tags, and hero image
- **Smart search** over title + description: ORM-level CASE/WHEN scorer with word-boundary regex, stopword stripping, and a relevance threshold (no padding with weak matches)
- **Faceted filters** (separate params, not free-text): date range, category (controlled taxonomy), tags (power-user), location
- **Autocomplete** for activity titles (prefix-first, substring top-up)
- **Recommendations feed** — scores candidates on hobby / professional-interest / company overlap + linear-decay recency, then MMR-diversifies the top pool so near-duplicates don't crowd the list. Cold-start falls back to nearest upcoming.
- **Discover** view (excludes already-booked) vs **Booked** calendar view (`/bookings/calendar/?month=YYYY-MM`, bucketed by date)
- Soft-delete via `is_deleted`; `manage.py expire_activities` flips past events
- Admin-only image upload (`IsAdminOrReadOnly`, 10 MB cap)

## Setup — Zero to Running

Follow these steps top to bottom. They assume **nothing is installed on your machine** and you've never seen the project before. The whole walkthrough takes ~15 minutes the first time (mostly waiting for Docker to download MySQL on first boot).

### Step 1 — Install the three tools you need

You need exactly three programs on your machine. **Install them, then verify each one works before continuing.**

| # | Tool | Where to get it | Verify |
|---|---|---|---|
| 1 | **Git** | macOS: `xcode-select --install` · Windows: https://git-scm.com/download/win · Linux: `sudo apt install git` | `git --version` |
| 2 | **Docker Desktop** | https://www.docker.com/products/docker-desktop/ — download, install, then **launch the app once** so the whale icon appears in your menu bar / system tray. | `docker --version` AND `docker compose version` |
| 3 | **A plain-text editor** | VS Code, Sublime, even Notepad. Anything that edits `.env` files. | — |

You do **not** need to install Python, Node, MySQL, or anything else on your host machine. Docker provides all of that inside containers.

> **Important:** Docker Desktop must be running every time you work on the project. If `docker compose version` errors out, open the Docker Desktop app and wait until it says "Docker Desktop is running."

### Step 2 — Get the code

```bash
git clone https://github.com/FayeSong-0223/Uni-Alumni-App.git
cd Uni-Alumni-App
```

After `cd`, run `ls` (Mac/Linux) or `dir` (Windows) — you should see folders named `backend`, `frontend`, and a file named `docker-compose.yml`. If you don't, you're in the wrong directory.

### Step 3 — Create your `.env` files

The repo ships **example** env files (`.env.example`) but not the real ones — real env files contain passwords, so we never commit them. You make them yourself by copying the examples:

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

**You can leave `frontend/.env` exactly as-is** — its defaults work for the web demo, and for native (phone/emulator) the app auto-detects the backend host from the Metro bundle URL.

**You will edit `backend/.env` in the next step.**

### Step 4 — Edit `backend/.env`

Open `backend/.env` in your text editor. You only need to touch **two sections**.

#### 4a. Set a Django secret key

Find this line:
```
DJANGO_SECRET_KEY=replace-me-with-a-long-random-string
```

Replace the right-hand side with any long random string. The fastest way:

```bash
# Mac/Linux — uses the Python that ships with macOS / most Linux distros:
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
# Windows (in PowerShell):
[Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

Copy the output into the file. For local dev only, you can skip this entirely — the app falls back to a built-in placeholder — but **never** ship that placeholder anywhere real.

#### 4b. Set an admin username and password (so you can log in to Django admin later)

Find the three commented-out lines at the bottom of the file and **uncomment and fill them in**:

```
DJANGO_SUPERUSER_USERNAME=admin
DJANGO_SUPERUSER_EMAIL=admin@example.com
DJANGO_SUPERUSER_PASSWORD=PickAStrongPasswordHere
```

When you boot the stack in step 5, Docker will auto-create this admin user on first run. Without this, you'd have to drop into the container manually to create one — annoying for a first-time setup.

**Save the file.** Don't touch anything else.

### Step 5 — Boot everything

From the project root (the folder with `docker-compose.yml`):

```bash
docker compose up --build
```

What happens now:

1. Docker downloads the MySQL 8 image (~500 MB, first time only)
2. Builds the backend container (Python + Django, ~3 min first time)
3. Builds the frontend container (Node + Expo, ~2 min first time)
4. Starts MySQL, waits for it to be healthy
5. Runs database migrations
6. Creates your admin user (from step 4b)
7. Starts Django on :8000 and Expo on :8081

**First boot takes 5–15 minutes** depending on your internet speed. Subsequent boots take ~20 seconds.

You're done when the terminal shows roughly:

```
backend-1   | Superuser created
backend-1   | Starting server...
backend-1   | Watching for file changes with StatReloader
frontend-1  | Web is waiting on http://localhost:8081
```

**Leave this terminal window open** — closing it stops the app. Open a new terminal tab for any further commands.

### Step 6 — Open the app

Open these URLs in your browser:

| URL | What it is |
|---|---|
| http://localhost:8081 | The actual alumni-facing app (what real users see) |
| http://localhost:8000/admin/ | Django admin (where admins create activities and manage data) |
| http://localhost:8000/api/ | The backend REST API (useful for poking with curl/Postman) |

Log in to **Django admin** with the username + password you set in step 4b.

### Step 7 — Seed minimum data so the app isn't empty

A clean database has no users, no activities, and no dropdown options — the alumni-facing app will look broken until you add some. Do this **once**, in the Django admin you just logged into:

1. **Add one Professional Interest Option**
   - Navigate: *Profiles → Professional interest options → Add professional interest option*
   - Fill in: `slug = ai`, `label = Artificial Intelligence`, `sort order = 0`, `is active = ✓`
   - Save. Without at least one of these, the dropdown alumni see when editing their profile will be empty.
2. **Create one or two Activities**
   - Navigate: *Activities → Activities → Add activity*
   - Required: title, description, future start/end times, organizer (pick your admin user)
   - Optional: location, category, tags, hero image, max participants
   - Save.
3. **Register a regular alumni account**
   - Go to http://localhost:8081, click "Register"
   - Fill in email + password + name. You'll be auto-assigned an alumni ID like `AL-002`.
   - Edit your profile, then browse to the activities tab and book one. The full flow should work end-to-end.

### Step 8 — Stop and restart

| Goal | Command |
|---|---|
| Stop the app (preserves the database) | Press `Ctrl+C` in the terminal running `docker compose up`, then `docker compose down` |
| Stop **and wipe the database** (clean slate) | `docker compose down -v` — destroys MySQL data volume; next `up` re-runs migrations and re-creates your admin |
| Start it again (uses cached images, fast) | `docker compose up` |
| Run a Django command (e.g. shell, manage.py) | `docker compose exec backend python manage.py <command>` |

### Step 9 — (Optional) Semantic search

If you want the activity search to use AI embeddings on top of the keyword scorer (so e.g. "machine learning meetup" matches an activity titled "AI workshop"), run this once after creating some activities:

```bash
docker compose exec backend python manage.py backfill_embeddings
```

First run downloads a ~100 MB `sentence-transformers` model into the container. Skip this step if you don't care — keyword search still works without it.

---

### Troubleshooting

| What you see | What to do |
|---|---|
| `docker: command not found` | Docker Desktop isn't installed or isn't running. Install it, then launch the app and wait for "Docker Desktop is running." |
| `docker compose: 'compose' is not a docker command` | You're on an old Docker version that uses the hyphenated form. Use `docker-compose up --build` instead of `docker compose up --build`. Every other command in this guide works the same way (replace `docker compose` with `docker-compose`). |
| `port is already allocated` / `bind: address already in use` | Something on your machine is already using port 8000, 8081, or 3307. Quit that program, or edit `docker-compose.yml` and change the **left** side of the port mapping (e.g. `"8001:8000"` to expose the backend on 8001 instead). |
| `Access denied for user 'root'` (backend keeps restarting) | The `DB_PASSWORD` in your `backend/.env` doesn't match the one in `docker-compose.yml`. Easiest fix: delete the `DB_PASSWORD` line from `backend/.env` so the default (`alumni_pass`) is used everywhere. Then `docker compose down -v && docker compose up`. |
| App loads in browser but Login shows "Network Error" | The backend container hasn't finished starting. Wait until you see `Starting server...` in the compose logs. If it's been over a minute, check http://localhost:8000/api/ directly — if that's also failing, scroll up in the compose logs for the real error. |
| You set `DJANGO_SUPERUSER_*` but can't log in to /admin | The auto-creation runs **only when the database is empty** (first boot). If you set the vars after first boot, either run `docker compose down -v && docker compose up` to wipe and start fresh, or create one manually: `docker compose exec backend python manage.py createsuperuser`. |
| Password reset emails don't arrive | By default, password-reset emails go through a shared demo Gmail account (rate-limited). For real testing, set `EMAIL_HOST_USER` and `EMAIL_HOST_PASSWORD` in `backend/.env` to your own Gmail address + a [Google App Password](https://support.google.com/accounts/answer/185833) (not your normal Gmail password). |
| Phone on the same Wi-Fi can't reach the app | Add your laptop's LAN IP to `DJANGO_ALLOWED_HOSTS` in `backend/.env` (e.g. `DJANGO_ALLOWED_HOSTS=localhost,192.168.1.42`), then `docker compose restart backend`. The frontend's Metro bundle URL auto-detect handles the API URL automatically — you do **not** need to set `EXPO_PUBLIC_API_URL`. |
| `sentence-transformers` install fails / out of disk space | Optional dep — comment it out of `backend/requirements.txt` and rebuild. Activity search will fall back to keyword-only and still work. |

---

### Alternative: Local Development (no Docker)

Only do this if Docker isn't an option for you. It requires installing Python 3.11+ and Node 18+ on your host machine.

#### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate         # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Defaults to SQLite — perfect for first-time local exploration.
# To use MySQL instead, set DB_ENGINE=mysql + DB_* in backend/.env first.
python manage.py migrate
python manage.py createsuperuser   # creates your first admin
python manage.py runserver
```

#### Frontend (in a second terminal)

```bash
cd frontend
npm install
npx expo start --web      # Web at http://localhost:8081
npx expo start --ios      # iOS simulator
npx expo start --android  # Android emulator
```

#### Scheduled jobs (cron candidates)

```bash
# Soft-delete activities whose end_time has passed (run every 15 min):
python manage.py expire_activities

# Evaluate activity-search ranking against saved fixtures (run when tuning scoring):
python manage.py eval_search
```

## Things you MUST change before any real deployment

The defaults below are tuned for "clone it and have it work in five minutes," not for any environment with real users. Audit each one:

| Concern | Where | What to do |
|---|---|---|
| **Django secret key** | `backend/.env` `DJANGO_SECRET_KEY` | Generate a fresh random value. The fallback in `settings.py` is publicly visible in this repo. |
| **Demo SMTP credentials** | `backend/config/settings.py` `_DEMO_EMAIL_HOST_USER` / `_DEMO_EMAIL_HOST_PASSWORD` | Override with `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` env vars. Treat the embedded ones as already compromised. |
| **Default DB password** | `docker-compose.yml` / `backend/.env` `DB_PASSWORD` | `alumni_pass` is the dev fallback. Change it and pass the new value to both `db` and `backend` services. |
| **Debug mode** | `DJANGO_DEBUG` | Must be `False` in prod. |
| **Allowed hosts** | `DJANGO_ALLOWED_HOSTS` | `*` is fine locally, never in prod. |
| **CORS** | `settings.py` `CORS_ALLOW_ALL_ORIGINS = True` | Replace with `CORS_ALLOWED_ORIGINS=[...]` for your real frontend origin(s). |
| **Media storage** | `backend/media/` | Local filesystem only. Wire up S3 (or equivalent) before going to prod — Docker volumes don't survive a container rebuild on most hosts. |
| **MySQL auto-makemigrations on boot** | `backend/entrypoint.sh` | The entrypoint runs `makemigrations` on every container start. Convenient locally; remove for prod (migrations should be reviewed PRs, not auto-generated on boot). |

## Project Layout

```
backend/
  config/           # Django project: settings, urls, wsgi
  users/            # Custom User model + 2FA + password reset
  profiles/         # Profile, ProfessionalInterestOption, Company, search, autocomplete
  connections/      # Contact requests + connections list
  messaging/        # DMs + conversation threads
  activities/       # Activities, bookings, smart search, recommendations, calendar
    management/commands/expire_activities.py
  media/            # User uploads (avatars, activity images) — dev only
  requirements.txt
  Dockerfile

frontend/
  src/
    api/            # Axios client (with Metro-bundle host auto-detect) + one module per backend resource
    context/        # AuthContext (JWT storage, login/logout)
    navigation/     # AppNavigator (stack + bottom tabs)
    screens/        # Login, Register, ForgotPassword, TwoFactor[ Setup ],
                    # Profile, Search, UserDetail, Connections,
                    # Inbox, Conversation, Activities, ActivityDetail
    components/     # Toast, AnimatedComponents
    data/           # Static dropdown option lists (degrees, etc.)
    theme.js
  __tests__/        # Jest smoke tests (api base URL, data options)
  App.js
  package.json
  Dockerfile

docker-compose.yml  # db (MySQL 8) + backend + frontend
.github/workflows/  # CI: Django check + migration drift + test + coverage
```

## API Reference

All endpoints are JWT-protected unless noted. Pagination is page-number, default page size 10.

### Auth
| Method | Endpoint | Notes |
|---|---|---|
| POST | `/api/auth/register/` | Create account |
| POST | `/api/token/` | Login → returns tokens (or `2fa_required` if TOTP is on) |
| POST | `/api/token/2fa-verify/` | Exchange partial token + TOTP code for real tokens |
| POST | `/api/token/refresh/` | Refresh access token |
| GET/PATCH | `/api/auth/me/` | Current user |
| POST | `/api/auth/change-password/` | |
| POST | `/api/auth/2fa/setup/` | Returns provisioning URI + QR |
| POST | `/api/auth/2fa/enable/` | Confirm with TOTP code |
| POST | `/api/auth/2fa/disable/` | |
| POST | `/api/auth/password-reset/` | Email a 6-digit code |
| POST | `/api/auth/password-reset/confirm/` | Submit code + new password |

### Profiles
| Method | Endpoint | Notes |
|---|---|---|
| GET/PATCH | `/api/profiles/me/` | Own profile |
| POST | `/api/profiles/me/avatar/` | Multipart avatar upload |
| GET | `/api/profiles/search/` | `?industry=&graduation_year=&degree=&hobbies=&professional_interests=&expertise=&search=` |
| GET | `/api/profiles/search/enhanced/` | Richer scoring variant |
| GET | `/api/profiles/autocomplete/?q=&types=people,companies,prof` | Grouped |
| GET | `/api/profiles/autocomplete/companies/?q=` | Companies only |
| GET | `/api/profiles/options/professional-interests/` | Dropdown source of truth |
| GET | `/api/profiles/<alumni_id>/` | Public profile view |

### Connections
| Method | Endpoint |
|---|---|
| POST | `/api/connections/send/` |
| GET | `/api/connections/received/` |
| GET | `/api/connections/sent/` |
| POST | `/api/connections/<id>/respond/` |
| GET | `/api/connections/list/` |

### Messaging
| Method | Endpoint |
|---|---|
| POST | `/api/messaging/send/` |
| GET | `/api/messaging/inbox/` |
| GET | `/api/messaging/sent/` |
| GET | `/api/messaging/<id>/` |
| GET | `/api/messaging/conversation/<alumni_id>/` |

### Activities & bookings
| Method | Endpoint | Notes |
|---|---|---|
| GET | `/api/activities/` | List upcoming (soft-deleted hidden) |
| POST | `/api/activities/` | Admin only |
| GET | `/api/activities/<id>/` | |
| GET | `/api/activities/search/` | `?q=&date_from=&date_to=&categories=&tags=` — scored |
| GET | `/api/activities/autocomplete/?q=` | Titles |
| GET | `/api/activities/categories/` | Non-empty category chips with counts |
| GET | `/api/activities/tags/` | Distinct tags, frequency-ordered |
| GET | `/api/activities/recommendations/` | Personalized, MMR-diversified |
| GET | `/api/activities/discover/` | Default feed, excludes user's bookings |
| POST | `/api/activities/<id>/book/` | Create / re-enable booking |
| DELETE | `/api/activities/<id>/cancel_booking/` | Soft-cancel |
| GET | `/api/activities/<id>/bookings/` | Confirmed bookings for this activity |
| POST | `/api/activities/<id>/image/` | Admin only, multipart, 10 MB max |
| GET | `/api/bookings/` | Current user's bookings |
| GET | `/api/bookings/calendar/?month=YYYY-MM` | Grouped by date — powers calendar view |

## Architecture Notes

- **Context API** for client auth state — simpler than Redux and sufficient for JWT + user caching.
- **JSONField** for `hobbies`, `professional_interests`, `companies`, and activity `tags` — flexible schema, no extra join tables for simple string arrays. Trade-off: not index-friendly on MySQL, so filters on these fields do full scans today; denormalising to join tables is the standard next step if volume grows.
- **Smart search is a hybrid** of an ORM scorer (CASE/WHEN + `iregex` on title/description, stopword stripping, word-boundary regex) and a `sentence-transformers` embedding similarity blend. Embeddings live in `Activity.embedding` (JSONField, backfilled via `manage.py backfill_embeddings`); recent query embeddings are cached in-process. If `sentence-transformers` is unavailable, search transparently falls back to lexical-only.
- **Auth endpoints have per-scope throttles** on top of the global rate limits: login `10/min`, register `5/hour`, password-reset request + confirm `5/hour`. Counted per client IP — these are what stop brute-force password guessing and reset-email flooding.
- **Recommendations** use word-boundary token matching (not raw substring) — "AI" no longer matches "fair" and "Google" no longer matches "Googled". Relevance weights: `prof_interest=40`, `hobby=30`, `company=25`, `recency≤25` (linear decay over 30 days), normalised to 0–100. MMR with λ=0.7 handles diversity.
- **Auto-generated alumni IDs** (`AL-001`…) assigned on User save.
- **Throttling:** 100/hour anonymous, 1000/hour authenticated (DRF default classes).
- **CORS:** currently `CORS_ALLOW_ALL_ORIGINS = True` — tighten before prod.

## Tests

### Backend (Django)

```bash
# Inside Docker
docker-compose exec backend python manage.py test

# Locally
cd backend && python manage.py test

# With coverage (requires requirements-dev.txt)
cd backend && pip install -r requirements-dev.txt
coverage run --rcfile=.coveragerc manage.py test && coverage report
```

### Frontend (Jest smoke tests)

```bash
cd frontend && npm test
```

Currently covers the API base-URL resolver (platform / env / Metro-bundle fallbacks) and the static dropdown option lists. Run before any change to `src/api/client.js` or `src/data/options.js`.

### CI

`.github/workflows/test.yml` runs on every push and PR to `main`:

1. Django system check
2. Migration drift check (`makemigrations --check --dry-run` — fails if model changes weren't migrated)
3. Tests with coverage on Python 3.12 (SQLite — `mysqlclient` is skipped on CI)
4. Coverage HTML uploaded as a build artifact

## Security

- JWT on every protected endpoint; short-lived access + rotating refresh
- Optional TOTP 2FA (pyotp)
- Password validators (length, common-password, numeric, user-attribute similarity)
- Profile visibility + contact-allowed toggles per user
- Admin-only gates on activity create/update + image upload
- Global throttles (`100/h` anon, `1000/h` authed) **plus** scoped throttles on auth endpoints: login `10/min`, register `5/hour`, password reset `5/hour`
- Bcrypt-ready dependency stack
