# Testing Strategy and Evidence

This document describes how the AU Alumni Network / onlyfayes codebase is
tested, how to reproduce every check on a clean machine, and how each
test maps back to the risks identified in the project's review report
([REVIEW_TESTING_REPORT_EXTERNAL.md](REVIEW_TESTING_REPORT_EXTERNAL.md)).

It is intended as standalone test evidence: another reviewer should be
able to read this file alone, rerun every command, and reach the same
conclusions.

---

## 1. Test Strategy

The project follows a layered testing approach:

| Layer                        | Where it lives                          | What it covers                                                                                              |
| ---------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Static / system check        | `manage.py check`                       | Django configuration sanity (settings, app loading, URL routing).                                           |
| Migration consistency        | `manage.py makemigrations --check`      | Detects model changes that haven't been captured in migrations.                                             |
| Unit + integration (backend) | `backend/<app>/tests.py`                | Model behavior, serializer validation, API endpoint contracts, permission boundaries, authentication flows. |
| Security regression          | `backend/<app>/tests.py` (named tests)  | Locks in fixes for findings reported by the external review.                                                |
| Coverage gate                | `.coveragerc` + `coverage` CLI          | Fails the run if line+branch coverage drops below the agreed floor.                                         |
| CI                           | `.github/workflows/test.yml`            | Re-runs the full suite on every push and pull request.                                                      |
| Frontend buildability        | `npx expo export --platform web`        | Confirms the React Native / Expo client still bundles after changes.                                        |
| Frontend doctor              | `npx expo-doctor`                       | Catches Expo SDK / dependency drift.                                                                        |
| Frontend dependency audit    | `npm audit`                             | Tracks known-vulnerable transitive dependencies.                                                            |

Manual / exploratory testing of the React Native UI is performed in
addition to the automated layers above and is recorded in the review
report rather than this file.

---

## 2. Test Inventory

The backend test suite contains **52 automated tests** across five Django
apps. Each app's tests are located in `backend/<app>/tests.py`.

### 2.1 `users` (15 tests)

Account creation, JWT authentication, two-factor authentication, and
password validation.

| Test class                  | Tests | Purpose                                                                |
| --------------------------- | ----- | ---------------------------------------------------------------------- |
| `UserModelTests`            | 3     | Custom User model: alumni-id auto-generation, default privacy fields.  |
| `AuthAPITests`              | 5     | Registration, JWT login, `/me` permission boundary.                    |
| `TOTPSetupSafetyTests`      | 2     | Regression: starting 2FA setup must not invalidate an active secret.   |
| `PasswordValidatorTests`    | 5     | Regression: weak passwords rejected at register, change, reset.        |

### 2.2 `profiles` (8 tests)

Public alumni directory, profile privacy, search.

| Test class                            | Tests | Purpose                                                                  |
| ------------------------------------- | ----- | ------------------------------------------------------------------------ |
| `ProfileTests`                        | 5     | Profile auto-creation, retrieval, update, search, private-profile gate. |
| `PublicProfileEmailVisibilityTests`   | 3     | Regression: email leaked only to owner + connected users, not to public. |

### 2.3 `activities` (12 tests)

Activity bookings (the surface most likely to leak personally
identifiable information) and the admin-only write boundary on
activities themselves.

| Test class                       | Tests | Purpose                                                                                |
| -------------------------------- | ----- | -------------------------------------------------------------------------------------- |
| `BookingVisibilityTests`         | 4     | Regression: only staff/organizer see the full booking list with names, emails, notes. |
| `ActivityWritePermissionTests`   | 8     | Boundary: only staff can edit/delete activities; non-staff users — including a non-staff `organizer` — are rejected; anonymous requests are rejected. |

### 2.4 `connections` (6 tests)

Connection request / accept / list flow.

| Test class           | Tests | Purpose                                                                |
| -------------------- | ----- | ---------------------------------------------------------------------- |
| `ConnectionTests`    | 6     | Send / self-block / allow_contact gate / accept / list / received.    |

### 2.5 `messaging` (11 tests)

In-app messaging — happy path plus read-side permission boundary.

| Test class                         | Tests | Purpose                                                                |
| ---------------------------------- | ----- | ---------------------------------------------------------------------- |
| `MessagingTests`                   | 5     | Send (connected only), inbox, message detail marks-as-read, conversation. |
| `MessagePermissionBoundaryTests`   | 6     | Boundary: only sender/recipient can read a message; third parties get 404 on detail, see no messages in inbox, and cannot extract via the conversation endpoint. |

---

## 3. Mapping Tests to Review Findings

Every priority finding raised in [REVIEW_TESTING_REPORT_EXTERNAL.md](REVIEW_TESTING_REPORT_EXTERNAL.md)
has a corresponding regression test, so the issue cannot silently return.

| Review finding                                                  | Severity | Code change                                            | Regression test(s)                                                   |
| --------------------------------------------------------------- | -------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| Activity booking list exposes PII                               | P1       | `backend/activities/views.py:bookings()`               | `BookingVisibilityTests` (4 tests, `backend/activities/tests.py`)    |
| Public profile detail leaks email                               | P1       | `backend/profiles/serializers.py:PublicProfileSerializer`, `backend/profiles/views.py:ProfileDetailView` | `PublicProfileEmailVisibilityTests` (3 tests, `backend/profiles/tests.py`) |
| Docker startup creates fixed weak admin                         | P1       | `backend/entrypoint.sh` (env-driven, opt-in)           | Manual review — verified by reading the script; no auto-test.        |
| SMTP credentials committed in settings                          | P1       | `backend/config/settings.py` (env-var override pattern); demo credential retained for evaluation only and disclaimed in this document and the review report. | Configuration-level fix; covered by review.                          |
| 2FA setup overwrites active TOTP secret                         | P1       | `backend/users/models.py` (new `pending_totp_secret`), `backend/users/views.py:TOTPSetupView`, `TOTPEnableView`, `TOTPDisableView`, migration `0003_user_pending_totp_secret.py` | `TOTPSetupSafetyTests` (2 tests, `backend/users/tests.py`)           |
| Password validators not enforced                                | P2       | `backend/users/serializers.py`, `backend/users/views.py:PasswordResetConfirmView` | `PasswordValidatorTests` (5 tests, `backend/users/tests.py`)         |
| Frontend API URL hardcoded                                      | P2       | `frontend/src/api/client.js`, `frontend/.env.example`  | Manual: `npx expo export` confirms the client still bundles.         |

In addition to the review-driven regressions above, the suite locks in
two implicit security boundaries that were untested at review time:

| Boundary                                                          | Severity | Where enforced                                          | Test(s)                                                           |
| ----------------------------------------------------------------- | -------- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| Activities are admin-write only (no organizer-self-edit loophole) | Boundary | `backend/activities/permissions.py:IsAdminOrReadOnly`   | `ActivityWritePermissionTests` (8 tests, `backend/activities/tests.py`) |
| Messages are readable only by sender or recipient                 | Boundary | `backend/messaging/views.py:MessageDetailView.get_queryset`, `InboxView.get_queryset`, `ConversationView.get_queryset` | `MessagePermissionBoundaryTests` (6 tests, `backend/messaging/tests.py`) |

---

## 4. How to Run

### 4.1 Prerequisites

```bash
# from the project root
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install -r requirements-dev.txt   # adds coverage tooling
```

If `mysqlclient` fails to install locally (it requires the `pkg-config`
native build dependency), it can be skipped — Django falls back to
SQLite, which is what the test suite uses.

### 4.2 Backend system check

```bash
cd backend
python manage.py check
```

Expected: a single `staticfiles.W004` warning (the optional `static/`
directory is intentionally absent). No errors.

### 4.3 Migration consistency

```bash
cd backend
python manage.py makemigrations --check --dry-run
```

Expected: `No changes detected`.

### 4.4 Backend test suite

```bash
cd backend
python manage.py test
```

Expected: `Ran 52 tests in <Ns>` followed by `OK`.

### 4.5 Test suite with coverage gate

```bash
cd backend
coverage run --rcfile=.coveragerc manage.py test
coverage report --rcfile=.coveragerc
coverage html --rcfile=.coveragerc      # produces htmlcov/index.html
```

Expected: total coverage ≥ 45% (the agreed floor — see §5). The HTML
report at `backend/htmlcov/index.html` shows per-line coverage.

### 4.6 Frontend buildability

```bash
cd frontend
npm install
npx expo export --platform web --output-dir /tmp/onlyfayes-web-export
```

Expected: `Web Bundled index.js` followed by `Exported: ...`.

### 4.7 Expo doctor

```bash
cd frontend
npm exec -- expo-doctor
```

Expected: `17/17 checks passed. No issues detected.`

### 4.8 Frontend dependency audit

```bash
cd frontend
npm audit
```

Current expected counts (review-time snapshot, monitor for change):
0 low / 13 moderate / 0 high / 0 critical. The moderate set is dominated
by Expo SDK 54 transitive dependencies; do **not** run
`npm audit fix --force` because npm proposes downgrading to Expo SDK 49,
which is a breaking change. Track and revisit on each Expo SDK upgrade.

---

## 5. Coverage

Coverage is measured with `coverage.py` configured by
[backend/.coveragerc](backend/.coveragerc). Migrations, test files,
WSGI/ASGI bootstrap, and `manage.py` are excluded because they aren't
meaningful application code.

**Current baseline:** 50% line+branch coverage across 1,618 statements
in 33 files (post-regression-suite + permission-boundary tests,
2026-04-29).

**Floor:** `fail_under = 45` — set just below the current baseline so
the gate is enforced today. This is a **ratchet**, not a target: the
expectation is that future work tightens the floor upward, never
loosens it.

**Where the gap is:** the largest uncovered surfaces are
`activities/views.py` (search, autocomplete, recommendations) and
`profiles/views.py` (enhanced profile search). These are functional
features without security implications and are exercised manually
during evaluation rather than by automated tests. They are tracked as
suggested follow-up tests in the review report.

---

## 6. Continuous Integration

A GitHub Actions workflow at
[.github/workflows/test.yml](.github/workflows/test.yml) runs the full
backend test suite plus the coverage gate on every push and pull request
to `main`. The workflow uses SQLite (no `mysqlclient`) so it has no
native build dependencies and runs in under a minute on
`ubuntu-latest`.

A run is considered green only if **all of**:

- `manage.py check` passes (warnings allowed)
- `manage.py makemigrations --check --dry-run` reports no changes
- `manage.py test` passes (all 52 tests)
- `coverage report` total ≥ floor (currently 45%)

succeed.

---

## 7. Known Limitations

These are deliberate scope decisions, not bugs.

- **No automated test for the Docker entrypoint superuser path.** The
  fix is configuration-level: shell-script behavior is verified by
  reading `backend/entrypoint.sh` and noting that no superuser is
  created unless `DJANGO_SUPERUSER_*` environment variables are
  explicitly set. A spawnable Docker integration test would be
  disproportionate effort for a single-line gate.
- **SMTP credentials still appear in source for the evaluation demo.**
  This is an explicit, documented exception. `EMAIL_HOST_USER` /
  `EMAIL_HOST_PASSWORD` are read from environment variables first;
  the embedded values are only used as fallback so the password-reset
  email flow works during the evaluation period. The committed Gmail
  App Password is treated as compromised; in any real deployment the
  environment variables must be set and the demo credential must not
  be used.
- **`mysqlclient` cannot be installed without `pkg-config`** on a
  bare developer machine. The test database is SQLite, so this does
  not block local testing. Document `pkg-config` (e.g. via Homebrew on
  macOS) as a prerequisite for production-database verification.
- **Frontend tests are buildability-only.** There is no Jest / RTL
  test suite for React components. This is logged as a follow-up in
  the review report.

---

## 8. Suggested Future Tests

In priority order, taken from the review report. Items previously
listed here that have since been covered are noted inline.

1. ~~Activity organizer can edit/cancel their own activity but not someone
   else's.~~ — Covered in this round by `ActivityWritePermissionTests`.
   The actual policy turned out to be stricter than "organizer-only":
   activities are admin-write only, so the test asserts that even a
   non-staff user listed as `organizer` cannot edit their own activity.
2. `EnhancedProfileSearchView` ranking — assertions over expected ordering
   for known fixtures.
3. Recommendations endpoint — cold-start (no profile signals) returns
   nearest-future events.
4. ~~Messaging permission boundary — sender / recipient only, not third
   parties.~~ — Covered in this round by `MessagePermissionBoundaryTests`.
5. End-to-end test for the password-reset email flow against a
   `locmem` email backend (so we can assert the outbound email
   contents without sending real mail).
6. Frontend Jest + React Testing Library smoke tests for login,
   register, profile, and booking screens.
