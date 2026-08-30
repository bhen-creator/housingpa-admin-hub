# Runtime Configuration

## Administrator access

The production service requires these secret-target names:

- `OWNER_USERNAME`
- `OWNER_PASSWORD_SCRYPT`
- `SESSION_SECRET` (or the legacy-compatible `JWT_SECRET`)

Secret values belong in the deployment provider's protected environment configuration. They must not be committed, logged, or included in evidence packages.

## Core destinations

The six external core destination variables are:

- `QPILOT_URL`
- `EMAIL_APP_URL`
- `BIDSAI_URL`
- `SNOOZE_URL`
- `IDEA_GENERATOR_URL`
- `PROSPECTING_MACHINE_URL`

A nonempty variable only makes a tool `CONFIGURED_UNVERIFIED`. It does not make the card launchable. Production destinations require HTTPS. Local development may use HTTP only for `localhost` or `127.0.0.1`.

## Verification state

Tool records use four states: `UNCONFIGURED`, `CONFIGURED_UNVERIFIED`, `VERIFIED_USABLE`, and `BLOCKED`. A tool launches only when all of the following are stored together:

- state `VERIFIED_USABLE`;
- a policy-compliant destination;
- nonempty verification evidence;
- a valid verification timestamp.

Changing a destination clears prior verification. This hardening pass intentionally does not add a public or administrator-facing route that can self-promote a URL to verified.

## Daily report control

The seventh core card is an authenticated internal control at `/settings/reports/daily`. It does not accept an external destination URL. Its settings and durable dry-run records require migration `0003_black_morgan_stark.sql`.

The provider-neutral worker source uses these deployment configuration names:

- `DAILY_REPORT_WORKER_ENABLED`
- `DAILY_REPORT_SCHEDULE`
- `DAILY_REPORT_TIMEZONE`
- `DAILY_REPORT_RECIPIENT`
- `DAILY_REPORT_PROVIDER_ADAPTER`
- `DAILY_REPORT_MAX_ATTEMPTS`
- `DAILY_REPORT_BACKOFF_SECONDS`
- `DAILY_REPORT_LEASE_SECONDS`
- `DAILY_REPORT_QUEUE_DATABASE_URL`
- `DAILY_REPORT_RUN_ID`
- `DAILY_REPORT_SCHEDULED_FOR`

The last two identify one scheduler event. When a scheduler does not supply a run ID, the worker derives a stable 64-character ID from `DAILY_REPORT_SCHEDULED_FOR`. A retry must preserve that same scheduled timestamp or explicitly reuse the original run ID.

No provider implementation or credential value is configured by this source package. The worker refuses delivery unless the injected adapter is configured and explicitly supports provider idempotency. The page must continue to show cloud scheduling and delivery as inactive until a separately authorized worker is deployed and independently verified. See `docs/DAILY_REPORT_CONTROL.md` and `deploy/daily-report-worker/README.md`.

## Database and operations

`DATABASE_URL` is optional for reading the default catalog and required for saving tool or report records. The worker may use the more narrowly scoped `DAILY_REPORT_QUEUE_DATABASE_URL`; when present it takes precedence for the shared durable report ledger. Apply the checked-in migrations through a separately authorized deployment workflow before using the new fields in production.

- Liveness: `/healthz`
- Readiness: `/readyz`
- Default exact port: `3000`, or the valid integer in `PORT`
