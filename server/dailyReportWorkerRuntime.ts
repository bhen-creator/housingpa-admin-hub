import { createHash } from "node:crypto";
import {
  claimDailyReportWorkerRun,
  queueDailyReportWorkerRun,
  skipDailyReportWorkerRun,
  transitionDailyReportWorkerRun,
} from "./db";
import {
  unconfiguredDailyReportDeliveryAdapter,
  unconfiguredDailyReportGenerator,
  type DailyReportDeliveryAdapter,
  type DailyReportGenerator,
} from "./dailyReportCloud";
import { createDailyReportWorker } from "./dailyReportWorker";
import {
  DAILY_REPORT_WORKER_ENV,
  DailyReportWorkerConfigurationError,
  readDailyReportWorkerConfig,
} from "./dailyReportWorkerConfig";

export function deriveDailyReportRunId(scheduledFor: Date) {
  return createHash("sha256")
    .update(`daily-report:${scheduledFor.toISOString()}`)
    .digest("hex");
}

export function readDailyReportWorkerInvocation(
  environment: NodeJS.ProcessEnv = process.env
) {
  const scheduledValue = environment[DAILY_REPORT_WORKER_ENV.scheduledFor];
  if (!scheduledValue) {
    throw new DailyReportWorkerConfigurationError(
      `${DAILY_REPORT_WORKER_ENV.scheduledFor} is required for a scheduler invocation.`
    );
  }
  const scheduledFor = new Date(scheduledValue);
  if (Number.isNaN(scheduledFor.getTime())) {
    throw new DailyReportWorkerConfigurationError(
      `${DAILY_REPORT_WORKER_ENV.scheduledFor} must be an ISO-8601 timestamp.`
    );
  }
  const runId =
    environment[DAILY_REPORT_WORKER_ENV.runId]?.trim() ||
    deriveDailyReportRunId(scheduledFor);
  if (!/^[A-Za-z0-9._:-]{1,64}$/.test(runId)) {
    throw new DailyReportWorkerConfigurationError(
      `${DAILY_REPORT_WORKER_ENV.runId} must be a safe 1 to 64 character identifier.`
    );
  }
  return { runId, scheduledFor };
}

export function createDailyReportWorkerRuntime(
  options: {
    environment?: NodeJS.ProcessEnv;
    generator?: DailyReportGenerator;
    deliveryAdapter?: DailyReportDeliveryAdapter;
  } = {}
) {
  const environment = options.environment ?? process.env;
  const config = readDailyReportWorkerConfig(environment);
  const worker = createDailyReportWorker({
    repository: {
      queueRun: queueDailyReportWorkerRun,
      claimRun: claimDailyReportWorkerRun,
      transitionRun: transitionDailyReportWorkerRun,
      skipRun: skipDailyReportWorkerRun,
    },
    generator: options.generator ?? unconfiguredDailyReportGenerator,
    deliveryAdapter:
      options.deliveryAdapter ?? unconfiguredDailyReportDeliveryAdapter,
    config,
  });

  return {
    config,
    worker,
    invocation: readDailyReportWorkerInvocation(environment),
  };
}
