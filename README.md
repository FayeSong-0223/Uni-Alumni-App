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

## Getting Started from Scratch

These steps walk a fresh clone from zero to a working local instance. Read the whole section before running anything — there are a few `.env` files you must create by hand.

### 0. Prerequisites

| Tool | Version | Why |
|---|---|---|
| Python | 3.11+ (3.14 confirmed in dev) | Backend runtime |
| Node | 18+ LTS | Frontend / Expo |
| Docker + docker-compose | latest | Easiest path for the full stack |
| MySQL client libs | only if running backend outside Docker against MySQL | `mysqlclient` builds against `libmysqlclient` |
| Git | any | obvious |

If you run Docker on a machine that already uses **port 3306** for a local MySQL, you're fine — the compose file maps the container's 3306 to host `3307` to avoid colliding. The backend talks to it over the internal Docker network on `db:3306`, not via the host port.

### 1. Clone & create your env files

The repo ships `.env.example` files but **not** real `.env` files (they're gitignored). You must create them yourself:

```bash
git clone <repo-url>
cd onlyfayes

# Backend env
cp backend/.env.example backend/.env

# Frontend env
cp frontend/.env.example frontend/.env
```

#### What to edit in `backend/.env`

| Key | When to change | Notes |
|---|---|---|
| `DJANGO_SECRET_KEY` | **Always** — every clone, every deployment | Generate with `python -c "import secrets; print(secrets.token_urlsafe(64))"`. The fallback baked into `settings.py` is fine for local dev but should never reach a real server. |
| `DJANGO_DEBUG` | Set to `False` for any non-dev environment | Defaults to `True`. |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated, set to your real hostnames for prod | Defaults to `*`. |
| `DB_ENGINE=mysql` and the `DB_*` block | Uncomment **only** if you're pointing the backend at MySQL outside Docker. When using `docker-compose`, these are already set inside `docker-compose.yml` and you don't need them in `.env`. | Without `DB_ENGINE=mysql`, the backend falls back to SQLite at `backend/db.sqlite3` — perfect for first-time local exploration. |
| `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` | Set to use **your** SMTP for password-reset emails | If left unset, the app falls back to the demo Gmail account hard-coded in `settings.py`. That account is shared and rate-limited; do not rely on it in any serious testing. For Gmail, this must be a [Google App Password](https://support.google.com/accounts/answer/185833), not your regular password. |
| `DJANGO_SUPERUSER_USERNAME` / `_EMAIL` / `_PASSWORD` | Optional. Only used by the Docker entrypoint to auto-create an admin on first boot | If any of the three is missing, no auto-superuser is created and you'll need to `createsuperuser` manually. |

#### What to edit in `frontend/.env`

| Key | When to change |
|---|---|
| `EXPO_PUBLIC_API_URL` | **Web only** — set this to point web at the backend. Defaults to `http://localhost:8000/api`. On native (Expo Go / emulator) the client auto-detects the host from the Metro bundle URL, so this is **optional**; set it only when you want to force a specific host. |
| `EXPO_PUBLIC_API_URL_ANDROID` | Optional override for Android. Without it, the client auto-detects from Metro; falls back to `10.0.2.2:8000` (the emulator's alias for host-localhost) if detection fails. |
| `EXPO_PUBLIC_API_URL_IOS` | Optional override for iOS. Same auto-detection applies. |
| (LAN / physical phone) | Usually nothing to do — Metro auto-detect handles it. If your backend is on a different host than the bundle server, set `EXPO_PUBLIC_API_URL=http://<host>:8000/api` and add the matching host to `DJANGO_ALLOWED_HOSTS` in `backend/.env`. |

#### Files you generally do NOT edit

- `docker-compose.yml` — values are parameterised via env vars (`DB_PASSWORD`, `DB_NAME`, etc.). Override them by exporting in your shell or putting them in a top-level `.env` file (compose reads it automatically).
- `backend/config/settings.py` — everything that varies between environments already reads from env vars. The one exception is the demo SMTP fallback, which you should override via `EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD` rather than editing in place.

### 2. Run it (Docker — recommended)

```bash
docker-compose up --build
```

Wait for `Starting server...` from the backend container, then:

- **Frontend (Web):** http://localhost:8081
- **Backend API:** http://localhost:8000/api/
- **Django Admin:** http://localhost:8000/admin/  (login with the superuser you set via `DJANGO_SUPERUSER_*`, or create one — see step 3)
- **MySQL (from host):** `localhost:3307` (user `root`, password `${DB_PASSWORD}` from your env, default `alumni_pass`)

The compose entrypoint runs `makemigrations` → `migrate` → optional superuser creation → `runserver` on every boot. First boot is the slowest because Docker pulls images and builds.

### 3. Run it (local, no Docker)

#### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Defaults to SQLite. To use MySQL, set DB_ENGINE=mysql + DB_* in backend/.env.
python manage.py migrate
python manage.py createsuperuser   # creates your first admin
python manage.py runserver
```

#### Frontend

```bash
cd frontend
npm install
npx expo start --web      # Web (http://localhost:8081)
npx expo start --ios      # iOS simulator
npx expo start --android  # Android emulator
```

### 4. First-run data setup

The app starts with **no users, no profiles, no activities**. To get something to look at:

1. **Create an admin** (if you didn't set `DJANGO_SUPERUSER_*`):
   ```bash
   # Docker:
   docker-compose exec backend python manage.py createsuperuser
   # Local:
   cd backend && python manage.py createsuperuser
   ```
2. **Log into Django admin** at `http://localhost:8000/admin/` and add at least one `ProfessionalInterestOption` row (this populates the dropdown alumni see when editing their profile).
3. **Create activities** from the Django admin or by hitting `POST /api/activities/` with an admin JWT — alumni-side accounts can't create them.
4. **Register a few alumni** via the app's normal Register screen so the discovery / connections flows have something to surface.

### 5. Semantic search (optional)

If you want activity search to use sentence embeddings on top of the ORM scorer, backfill embeddings for whatever activities you've created:

```bash
# Docker:
docker-compose exec backend python manage.py backfill_embeddings
# Local:
python manage.py backfill_embeddings
# Recompute everything (e.g. after changing the embedding model):
python manage.py backfill_embeddings --all
```

First run downloads the `sentence-transformers` model (~100 MB) into the container's HuggingFace cache. If the dep is too heavy for your environment, the search endpoint still works without embeddings — it just skips the semantic blend.

### 6. Scheduled jobs

```bash
# Soft-delete activities whose end_time has passed
python manage.py expire_activities
```
Run from cron (every 15 min is a reasonable default).

### 7. Evaluate search quality (optional)

`python manage.py eval_search` runs the saved relevance fixtures against the activity search ranker. Useful if you tune the scoring weights and want to confirm you haven't regressed.

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
