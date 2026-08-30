# Daily Report Control

## Source-ready surface

The Admin Hub includes a seventh core card named `Daily 6:00 AM Report`. It opens the authenticated internal route `/settings/reports/daily`; it is not an external destination and cannot be changed through the external tool URL editor.

The control exposes:

- enabled or disabled state;
- 24-hour schedule time;
- IANA timezone;
- recipient email address;
- last run timestamp;
- next intended run timestamp;
- latest delivery status;
- latest error;
- cloud scheduling and delivery state;
- a manual dry check that never sends email.

## Persistence and run identity

Migration `0003_black_morgan_stark.sql` adds:

- `dailyReportSettings`, a singleton settings and latest-state record;
- `dailyReportRuns`, an append-oriented durable run ledger with a unique `runId`.

The unique run ID is the idempotency boundary. Replaying the same run ID returns the existing run and does not insert another row. Configuration persists in MySQL and is read again after process restart. The UI disables writes when `DATABASE_URL` is unavailable or the migration has not been applied.

## API and service boundary

Authenticated administrator procedures:

- `dailyReport.get` returns settings, intended next run, persistence availability, and cloud-worker state;
- `dailyReport.save` validates and persists enabled state, schedule, timezone, and recipient;
- `dailyReport.runManualDryRun` validates the stored configuration and records either `DRY_RUN_READY` or `SKIPPED`. It never invokes a mail provider.

`server/dailyReportCloud.ts` defines the provider-neutral cloud request/result contract. The source package intentionally supplies only an unconfigured adapter. It throws before queue or delivery activity and reports both `scheduleActive` and `deliveryActive` as false.

## Missing cloud implementation gate

Cloud execution is not operational. A separately authorized deployment contract must provide and independently verify all of the following before the card can show `Working`:

1. An approved always-on cloud scheduler and worker that do not depend on Beny's PC.
2. A durable queue or equivalent retry mechanism that preserves the same run ID across retries.
3. A report generator and mail-delivery adapter with provider credentials stored only in the deployment secret manager.
4. An atomic state transition strategy for queued, delivered, failed, and skipped runs.
5. An independently verified end-to-end delivery test with timestamped evidence and no secrets in logs.
6. Deployment configuration, migration application, and rollback approval.

Neither a URL nor environment configuration alone may promote the card to `Working`.

## Acceptance criteria

- Exactly seven core cards render in the expected order.
- The Daily Report card opens the internal report-settings route.
- Existing six-card launch rules and administrator authorization remain unchanged.
- Settings survive service re-instantiation through the repository boundary.
- A disabled report records `SKIPPED` and sends nothing.
- A valid manual dry check records `DRY_RUN_READY` and sends nothing.
- Replaying one run ID creates no duplicate durable run.
- An unavailable database yields honest defaults and blocks writes.
- Unconfigured cloud execution is visible and cannot enqueue or deliver.
- Type-check, test suite, production build, output scan, secret scan, and `git diff --check` pass before deployment review.

## Authority statement

This addendum changes source only. It does not authorize or perform deployment, DNS, hosting-provider access, credential configuration, email delivery, account changes, or any other external action.
