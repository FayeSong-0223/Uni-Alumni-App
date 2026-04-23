# AU Alumni Network

A full-stack alumni networking + activities platform for Adelaide University. Alumni register, build a profile, discover other alumni, connect and message each other, and book onto events organised by admins.

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
- `professional_interests` — dropdown constrained to the `ProfessionalInterestOption` catalog
- `companies` — free-text list; each entry upserts into a global `Company` catalog that powers autocomplete
- Avatar upload (multipart → `profile_picture`)

### Alumni discovery
- Filterable search: industry, graduation year, hobbies, professional interests
- `companies` is deliberately **not** a filter — only surfaces in autocomplete
- Grouped autocomplete endpoint merges **People · Companies · Professional interests**
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

## Quick Start (Docker)

```bash
docker-compose up --build
```

Then:
- **Frontend (Web):** http://localhost:8081
- **Backend API:** http://localhost:8000/api/
- **Django Admin:** http://localhost:8000/admin/

> Note: `config/settings.py` picks MySQL when `DB_ENGINE=mysql` is set, otherwise SQLite. To actually use the MySQL container, add `DB_ENGINE=mysql` to the `backend` service's `environment:` block in `docker-compose.yml`.

## Local Development

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
python manage.py runserver
```

### Frontend
```bash
cd frontend
npm install
npx expo start --web      # Web
npx expo start --ios      # iOS simulator
npx expo start --android  # Android emulator
```

### Scheduled jobs
```bash
# Soft-delete activities whose end_time has passed
python manage.py expire_activities
```
Run from cron (every 15 min is a reasonable default).

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
    api/            # Axios client + one module per backend resource
    context/        # AuthContext (JWT storage, login/logout)
    navigation/     # AppNavigator (stack + bottom tabs)
    screens/        # Login, Register, ForgotPassword, TwoFactor[ Setup ],
                    # Profile, Search, UserDetail, Connections,
                    # Inbox, Conversation, Activities, ActivityDetail
    components/
    theme.js
  App.js
  package.json
  Dockerfile

docker-compose.yml  # db (MySQL 8) + backend + frontend
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
| GET | `/api/profiles/search/` | `?industry=&graduation_year=&hobbies=&professional_interests=&search=` |
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
- **Smart search is pure ORM** (CASE/WHEN + `iregex` on title/description) so it runs on MySQL 8 today with no extra infra. API shape matches what a future Meilisearch/hybrid upgrade would return, so the client won't need to change.
- **Recommendations** use word-boundary token matching (not raw substring) — "AI" no longer matches "fair" and "Google" no longer matches "Googled". Relevance weights: `prof_interest=40`, `hobby=30`, `company=25`, `recency≤25` (linear decay over 30 days), normalised to 0–100. MMR with λ=0.7 handles diversity.
- **Auto-generated alumni IDs** (`AL-001`…) assigned on User save.
- **Throttling:** 100/hour anonymous, 1000/hour authenticated (DRF default classes).
- **CORS:** currently `CORS_ALLOW_ALL_ORIGINS = True` — tighten before prod.

## Tests

```bash
# Inside Docker
docker-compose exec backend python manage.py test

# Locally
cd backend && python manage.py test
```

## Security

- JWT on every protected endpoint; short-lived access + rotating refresh
- Optional TOTP 2FA (pyotp)
- Password validators (length, common-password, numeric, user-attribute similarity)
- Profile visibility + contact-allowed toggles per user
- Admin-only gates on activity create/update + image upload
- Per-request rate limits on the API
- Bcrypt-ready dependency stack
