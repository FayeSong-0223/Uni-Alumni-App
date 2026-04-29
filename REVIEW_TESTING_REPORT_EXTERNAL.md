# Review and Testing Report

Date: 2026-04-29

Project: AU Alumni Network / onlyfayes

Reviewer: Codex

## Purpose

This report records the review and testing work performed on the project, including automated checks, build checks, manual code review findings, and known limitations of the test run.

The goal is to make the review reproducible and easy to share with another reviewer.

## Scope

Reviewed the full repository rather than a single pull request, because the working tree did not contain a tracked feature diff.

Main areas reviewed:

- Django REST backend configuration, authentication, 2FA, password reset, profile privacy, messaging, connections, activities, and bookings.
- React Native / Expo frontend API configuration and buildability.
- Project setup, Docker entrypoint, tracked generated files, and test coverage gaps.

## Repository State

Command:

```bash
git status --short
```

Observed:

```text
?? .gitignore
```

No tracked source-code diff was present at review time.

## Environment Notes

The backend repository contains a `backend/venv` directory, but it is not usable on this machine. Its Python symlink points to another local machine path:

```text
backend/venv/bin/python3: broken symbolic link to python3.14
```

To avoid modifying the repository, a temporary virtual environment was created under `/tmp` for backend verification.

The full `backend/requirements.txt` install failed on `mysqlclient` because local native build tooling was missing:

```text
pkg-config: command not found
Exception: Can not find valid pkg-config name.
```

Because the project defaults to SQLite locally, the remaining Django dependencies were installed without `mysqlclient` to run checks and tests.

## Automated Checks Run

### Backend System Check

Command:

```bash
/tmp/onlyfayes-review-venv/bin/python manage.py check
```

Working directory:

```text
backend/
```

Result:

```text
System check identified some issues:

WARNINGS:
?: (staticfiles.W004) The directory '/Users/songziqi/Desktop/Industry research project/onlyfayes/backend/static' in the STATICFILES_DIRS setting does not exist.

System check identified 1 issue (0 silenced).
```

Status: Passed with warning.

### Backend Tests

Command:

```bash
/tmp/onlyfayes-review-venv/bin/python manage.py test
```

Working directory:

```text
backend/
```

Result:

```text
Ran 24 tests in 9.791s

OK
```

Additional warning:

```text
UnorderedObjectListWarning: Pagination may yield inconsistent results with an unordered object_list: <class 'profiles.models.Profile'> QuerySet.
```

Status: Passed.

### Migration Drift Check

Command:

```bash
/tmp/onlyfayes-review-venv/bin/python manage.py makemigrations --check --dry-run
```

Result:

```text
No changes detected
```

Status: Passed.

### Frontend Script Discovery

Command:

```bash
npm run
```

Working directory:

```text
frontend/
```

Result:

```text
Lifecycle scripts included in frontend@1.0.0:
  start
    expo start
available via `npm run`:
  android
    expo start --android
  ios
    expo start --ios
  web
    expo start --web
```

No test, lint, or typecheck script is currently defined.

### Frontend Web Export

Command:

```bash
npx expo export --platform web --output-dir /tmp/onlyfayes-web-export
```

Working directory:

```text
frontend/
```

Result:

```text
Web Bundled index.js
Exported: /tmp/onlyfayes-web-export
```

Status: Passed.

### Expo Doctor

Initial command attempted:

```bash
npm exec -- expo-doctor --version
```

Result:

```text
npm error code ENOTFOUND
npm error network request to https://registry.npmjs.org/expo-doctor failed
```

Status: Not completed because network access to npm registry was unavailable.

Follow-up command after network access was allowed:

```bash
npm exec -- expo-doctor
```

Initial follow-up result:

```text
16/17 checks passed. 1 checks failed.

react-native-web  expected ^0.21.0   found 0.20.0
expo              expected ~54.0.34  found 54.0.33
```

Fix applied:

```bash
npx expo install expo react-native-web
```

Updated frontend dependencies:

```text
expo              ~54.0.34
react-native-web  ^0.21.0
```

Verification result after the fix:

```text
17/17 checks passed. No issues detected.
```

Status: Passed after dependency version alignment.

Note: npm reported 13 moderate severity vulnerabilities during install. This was not addressed as part of the Expo version-alignment fix, because `npm audit fix --force` can introduce breaking dependency changes and should be reviewed separately.

### Frontend Dependency Audit

Command:

```bash
npm audit --json
```

Working directory:

```text
frontend/
```

Result summary:

```text
0 low
13 moderate
0 high
0 critical
```

Assessment:

The vulnerabilities fall into two groups:

- Direct frontend dependency chain: `axios@1.14.0` and its transitive dependency `follow-redirects@1.15.11`.
- Expo SDK/tooling dependency chain: `@expo/config`, `@expo/config-plugins`, `@expo/metro-config`, `@expo/prebuild-config`, `expo-asset`, `expo-constants`, `postcss`, `uuid`, and `xcode`.

The npm audit suggested fix for several Expo-related issues points to `expo@49.0.23`, which would downgrade the project from Expo SDK 54 to SDK 49. This is a high-risk breaking change and should not be applied.

Decision:

Do not run `npm audit fix --force` for this project at this stage.

Recommended handling:

- Keep the current Expo SDK 54 dependency set because `expo-doctor` passes 17/17 checks.
- Track the audit result as a known moderate dependency risk.
- Consider a separate, small dependency update for `axios` later, because that is the only direct dependency in the audit result.
- Revisit Expo-related advisories when Expo publishes compatible SDK 54 patches or during the next planned SDK upgrade.

## Manual Review Findings

### P1: Activity booking list exposes PII to all authenticated users

File:

```text
backend/activities/views.py
```

Lines:

```text
722-726
```

Issue:

`GET /api/activities/<id>/bookings/` inherits read-only access for authenticated users. Any logged-in user can retrieve all confirmed bookings for an activity. The serialized booking data includes names, emails, and notes.

Risk:

PII exposure.

Recommendation:

Restrict this endpoint to staff or the activity organizer. For normal users, return only participant count and the current user's own booking status.

### P1: Public profile detail leaks email addresses

File:

```text
backend/profiles/serializers.py
```

Lines:

```text
6-30
```

Issue:

`ProfileSerializer` always returns `email`. `ProfileDetailView` uses this serializer for public profile views.

Risk:

Any authenticated user can view email addresses for public profiles, which bypasses the intent of `allow_contact`.

Recommendation:

Use a separate public profile serializer that excludes email, or return email only to the profile owner and connected users.

### P1: Docker startup creates a fixed weak admin account

File:

```text
backend/entrypoint.sh
```

Lines:

```text
27-35
```

Issue:

The Docker entrypoint creates `admin/admin123` automatically if the admin user does not exist.

Risk:

Any deployed environment using this compose setup may expose a predictable superuser account.

Recommendation:

Remove automatic superuser creation, or require strong credentials via environment variables and disable this behavior in production.

### P1: SMTP credentials are committed in settings

File:

```text
backend/config/settings.py
```

Lines:

```text
218-225
```

Issue:

SMTP email and Gmail app password are hardcoded in source control.

Risk:

Credential exposure. The password should be treated as compromised.

Recommendation:

Rotate the Gmail app password immediately. Read email credentials from environment variables. Use console or file email backend for local development.

### P1: 2FA setup overwrites the active TOTP secret before verification

File:

```text
backend/users/views.py
```

Lines:

```text
177-181
```

Issue:

`GET /2fa/setup/` generates and saves a new `totp_secret` immediately.

Risk:

If a user with 2FA already enabled opens setup but does not complete verification, their old authenticator app code may stop working and they can be locked out.

Recommendation:

Store a pending TOTP secret separately and only replace the active secret after successful code verification.

### P2: Password validators are configured but not enforced

File:

```text
backend/users/serializers.py
```

Lines:

```text
7-28
```

Issue:

Registration, password change, and password reset only enforce `min_length=8`. Django's configured `AUTH_PASSWORD_VALIDATORS` are not called by `create_user()` or `set_password()`.

Risk:

Weak passwords such as common or numeric-only passwords may be accepted despite the README claiming stronger password validation.

Recommendation:

Call `django.contrib.auth.password_validation.validate_password()` in registration, change-password, and reset-password flows.

### P2: Frontend API base URL is hardcoded to a local network IP

File:

```text
frontend/src/api/client.js
```

Lines:

```text
5-8
```

Issue:

Web, Android, and iOS all use:

```text
http://172.20.10.10:8000/api
```

Risk:

The app will fail on other machines, networks, Docker setups, and deployed environments. This also conflicts with the README, which documents localhost ports.

Recommendation:

Use Expo environment configuration for the API base URL. For local development, handle web and native separately.

## Additional Observations

The repository currently tracks generated/runtime files, including:

- `backend/db.sqlite3`
- `backend/**/__pycache__/`
- `backend/media/...`

Recommendation:

Add these to `.gitignore` and remove them from source control if they are not intentional fixtures.

The local SQLite database has some migrations unapplied:

```text
[ ] activities.0002_tags_image_category_softdelete
[ ] activities.0003_rename_act_del_end_idx_activities__is_dele_ef1836_idx_and_more
[ ] profiles.0003_hobbies_prof_interests_companies
```

This does not affect Django's isolated test database, but it can affect manual local testing against `backend/db.sqlite3`.

## Industry Practice

In industry, this kind of review is usually recorded as a test evidence log or review report. A good record includes:

- Scope: what was reviewed and what was intentionally not reviewed.
- Environment: OS, runtime versions, dependency setup, database mode, and any temporary workarounds.
- Commands: exact commands run, from which directory.
- Results: pass/fail/warnings, with key output copied or summarized.
- Defects: severity, file, line, risk, and recommendation.
- Limitations: checks that could not be run and why.
- Next actions: recommended fix order.

The key principle is reproducibility. Another engineer should be able to understand what was tested, rerun it, and trust what was not covered.

## Suggested Fix Priority

1. Rotate the exposed email credential and move secrets to environment variables.
2. Remove or secure the auto-created `admin/admin123` Docker user.
3. Lock down activity booking visibility.
4. Remove email from public profile responses unless explicitly allowed.
5. Fix the 2FA setup flow to use pending secrets.
6. Enforce Django password validators.
7. Replace hardcoded frontend API URL with environment-based configuration.
8. Add test/lint/typecheck scripts for frontend.
9. Clean generated/runtime files from version control.

## Suggested Follow-up Tests

Add backend tests for:

- A normal user cannot view another activity's full booking list.
- Staff can view activity bookings.
- Public profile detail does not include email for non-connected users.
- Connected users can access only the profile fields intentionally allowed.
- Existing 2FA users are not locked out by starting setup and abandoning it.
- Weak passwords are rejected during registration, change password, and password reset.

Add frontend checks for:

- API base URL is resolved from environment config.
- Web export still succeeds after config changes.
- Login, register, 2FA, profile detail, activity booking, and cancellation flows do not regress.
