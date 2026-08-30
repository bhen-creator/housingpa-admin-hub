# Runtime Configuration

## Administrator access

The production service requires these secret-target names:

- `OWNER_USERNAME`
- `OWNER_PASSWORD_SCRYPT`
- `SESSION_SECRET` (or the legacy-compatible `JWT_SECRET`)

Secret values belong in the deployment provider's protected environment configuration. They must not be committed, logged, or included in evidence packages.

## Core destinations

The six core destination variables are:

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

## Database and operations

`DATABASE_URL` is optional for reading the default catalog and required for saving tool records. Apply the checked-in migration through a separately authorized deployment workflow before using the new state fields in production.

- Liveness: `/healthz`
- Readiness: `/readyz`
- Default exact port: `3000`, or the valid integer in `PORT`
