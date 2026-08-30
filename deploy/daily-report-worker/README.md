# Daily Report Worker Deployment Template

This directory is source-only deployment guidance. Nothing here creates a scheduler, queue, database, credential, DNS record, or external resource.

## Entrypoint

Build the application, then invoke:

```text
node dist/dailyReportWorkerEntrypoint.js
```

The scheduler must supply one ISO-8601 `DAILY_REPORT_SCHEDULED_FOR` value for the logical scheduled run. It may also supply `DAILY_REPORT_RUN_ID`; otherwise the worker derives a deterministic ID from the scheduled timestamp. Every retry must reuse the same logical run ID.

## Required configuration names

```text
DAILY_REPORT_WORKER_ENABLED
DAILY_REPORT_SCHEDULE
DAILY_REPORT_TIMEZONE
DAILY_REPORT_RECIPIENT
DAILY_REPORT_PROVIDER_ADAPTER
DAILY_REPORT_MAX_ATTEMPTS
DAILY_REPORT_BACKOFF_SECONDS
DAILY_REPORT_LEASE_SECONDS
DAILY_REPORT_QUEUE_DATABASE_URL
DAILY_REPORT_SCHEDULED_FOR
DAILY_REPORT_RUN_ID
```

Values belong only in the deployment provider's protected configuration. The checked-in examples intentionally contain placeholders only.

## Acceptance gate

Before enabling a live schedule, a separately authorized deployment must verify the migration, rollback point, configured generator, idempotent provider adapter, same-run retry, provider receipt, and one real end-to-end delivery. Until then the Admin Hub card remains `Not Ready Yet`.
