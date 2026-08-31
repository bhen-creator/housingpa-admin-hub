import {
  DEFAULT_INTERNAL_TOOLS,
  isDestinationUrl,
  isExternalCoreToolSlug,
  mergeInternalTools,
  normalizeInternalTool,
  toPublicToolCard,
} from "@shared/toolCatalog";
import { isValidScheduleTime, isValidTimeZone } from "@shared/dailyReport";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  listInternalTools,
  readDailyReportRun,
  readDailyReportSettings,
  recordDailyReportRun,
  saveDailyReportSettings,
  upsertInternalTool,
} from "./db";
import {
  createDailyReportService,
  DailyReportPersistenceUnavailableError,
} from "./dailyReportService";
import {
  DailyIdeaGeneratorVerificationError,
  verifyDailyIdeaGenerator,
} from "./dailyIdeaGeneratorVerification";
import { systemRouter } from "./_core/systemRouter";
import { adminAccessProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createAdminSession,
  LOCAL_ADMIN_COOKIE_NAME,
  localAdminCookieOptions,
  verifyOwnerCredentials,
} from "./localAdminAuth";
import { auditLoginFailure, loginThrottle } from "./loginThrottle";
import { isPublicReadOnlyHubEnabled } from "./publicReadOnlyHub";

export const LOCAL_AUTH_ERROR_MESSAGE = "Authentication failed.";
const allowLocalHttp = process.env.NODE_ENV !== "production";

const destinationUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(
    value => isDestinationUrl(value, { allowLocalHttp }),
    "Use HTTPS. Local development may use http://localhost or http://127.0.0.1."
  );

const futureToolInput = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(8).max(1000),
  destinationUrl: destinationUrl.refine(
    Boolean,
    "A destination URL is required."
  ),
});

const reportRecipient = z
  .string()
  .trim()
  .max(320)
  .refine(
    value => !value || z.email().safeParse(value).success,
    "Enter a valid email address."
  );

const dailyReportSettingsInput = z
  .object({
    enabled: z.boolean(),
    scheduleTime: z
      .string()
      .trim()
      .refine(isValidScheduleTime, "Use a 24-hour time such as 06:00."),
    timezone: z
      .string()
      .trim()
      .max(64)
      .refine(isValidTimeZone, "Choose a valid IANA timezone."),
    recipient: reportRecipient,
  })
  .superRefine((value, context) => {
    if (value.enabled && !value.recipient) {
      context.addIssue({
        code: "custom",
        path: ["recipient"],
        message: "A recipient is required when the report is enabled.",
      });
    }
  });

const dailyReportService = createDailyReportService({
  readSettings: readDailyReportSettings,
  saveSettings: saveDailyReportSettings,
  readRun: readDailyReportRun,
  recordRun: recordDailyReportRun,
});

function reportProcedureError(error: unknown): never {
  if (error instanceof DailyReportPersistenceUnavailableError) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: error.message,
    });
  }
  throw error;
}

function createSlug(name: string) {
  const normalized = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${normalized || "internal-tool"}-${Date.now().toString(36)}`;
}

function environmentDestinations() {
  return {
    "quote-pilot": process.env.QPILOT_URL ?? "",
    "email-app": process.env.EMAIL_APP_URL ?? "",
    "bids-ai": process.env.BIDSAI_URL ?? "",
    "snooz-app": process.env.SNOOZE_URL ?? "",
    // The Daily Idea Generator can only be made launchable by the dedicated
    // server-side verification procedure below. Do not allow environment or
    // editable runtime values to make it look published.
    "idea-generator": "",
    "prospecting-machine": process.env.PROSPECTING_MACHINE_URL ?? "",
  };
}

function configuredToolDirectory(
  persistedTools: Awaited<ReturnType<typeof listInternalTools>>
) {
  const destinationBySlug = environmentDestinations();
  const mergedTools = mergeInternalTools(persistedTools);
  return mergedTools.map(tool =>
    normalizeInternalTool(
      {
        ...tool,
        destinationUrl:
          tool.destinationUrl ||
          destinationBySlug[tool.slug as keyof typeof destinationBySlug] ||
          "",
      },
      { allowLocalHttp }
    )
  );
}

function requestClientIp(request: {
  ip?: string;
  socket?: { remoteAddress?: string | null };
}) {
  return request.ip || request.socket?.remoteAddress || "unknown";
}

export const appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    localLogin: publicProcedure
      .input(
        z.object({
          username: z.string().trim().min(1),
          password: z.string().min(1),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const clientIp = requestClientIp(ctx.req);
        const currentDecision = loginThrottle.check(input.username, clientIp);
        if (!currentDecision.allowed) {
          auditLoginFailure(
            input.username,
            clientIp,
            currentDecision,
            "backoff_active"
          );
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: LOCAL_AUTH_ERROR_MESSAGE,
          });
        }

        const authenticated = await verifyOwnerCredentials(
          input.username,
          input.password
        );
        if (!authenticated) {
          const failedDecision = loginThrottle.recordFailure(
            input.username,
            clientIp
          );
          auditLoginFailure(
            input.username,
            clientIp,
            failedDecision,
            "invalid_credentials"
          );
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: LOCAL_AUTH_ERROR_MESSAGE,
          });
        }

        loginThrottle.recordSuccess(input.username, clientIp);

        ctx.res.cookie(
          LOCAL_ADMIN_COOKIE_NAME,
          createAdminSession(process.env.OWNER_USERNAME || input.username),
          localAdminCookieOptions()
        );
        return { success: true } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      ctx.res.clearCookie(LOCAL_ADMIN_COOKIE_NAME, {
        ...localAdminCookieOptions(),
        maxAge: -1,
      });
      return {
        success: true,
      } as const;
    }),
  }),
  publicHub: router({
    mode: publicProcedure.query(() => ({
      enabled: isPublicReadOnlyHubEnabled(),
    })),
    list: publicProcedure.query(async () => {
      if (!isPublicReadOnlyHubEnabled()) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Public Hub view is disabled.",
        });
      }

      const persistedTools = await listInternalTools();
      return configuredToolDirectory(persistedTools)
        .filter(tool => tool.category === "featured")
        .map(toPublicToolCard);
    }),
  }),
  tools: router({
    list: adminAccessProcedure.query(async () => {
      const persistedTools = await listInternalTools();
      return configuredToolDirectory(persistedTools);
    }),
    updateDestination: adminAccessProcedure
      .input(z.object({ slug: z.string(), destinationUrl }))
      .mutation(async ({ input }) => {
        if (input.slug === "idea-generator") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "The Daily Idea Generator uses a fixed canonical route. Use its dedicated verification control.",
          });
        }
        if (!isExternalCoreToolSlug(input.slug)) {
          throw new Error(
            "Only the predefined tool destinations can be updated here."
          );
        }

        const tool = DEFAULT_INTERNAL_TOOLS.find(
          item => item.slug === input.slug
        );
        if (!tool) throw new Error("Tool configuration was not found.");

        await upsertInternalTool({
          ...tool,
          destinationUrl: input.destinationUrl,
          operationalState: input.destinationUrl
            ? "CONFIGURED_UNVERIFIED"
            : "UNCONFIGURED",
          verificationEvidence: null,
          verifiedAt: null,
          blockedReason: null,
        });
        return { success: true } as const;
      }),
    verifyDailyIdeaGenerator: adminAccessProcedure
      .input(z.void())
      .mutation(async () => {
        let verification;
        try {
          verification = await verifyDailyIdeaGenerator();
        } catch (error) {
          if (error instanceof DailyIdeaGeneratorVerificationError) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: error.message,
            });
          }
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message:
              "The Daily Idea Generator could not be verified. Nothing was published.",
          });
        }

        const tool = DEFAULT_INTERNAL_TOOLS.find(
          item => item.slug === "idea-generator"
        );
        if (!tool) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "The Daily Idea Generator configuration was not found.",
          });
        }

        await upsertInternalTool({
          ...tool,
          destinationUrl: verification.destinationUrl,
          operationalState: "VERIFIED_USABLE",
          verificationEvidence: verification.evidence,
          verifiedAt: verification.verifiedAt,
          blockedReason: null,
        });

        return {
          success: true as const,
          destinationUrl: verification.destinationUrl,
          operationalState: "VERIFIED_USABLE" as const,
          verifiedAt: verification.verifiedAt,
        };
      }),
    addFutureTool: adminAccessProcedure
      .input(futureToolInput)
      .mutation(async ({ input }) => {
        await upsertInternalTool({
          slug: createSlug(input.name),
          name: input.name,
          description: input.description,
          destinationUrl: input.destinationUrl,
          category: "future",
          sortOrder: 100,
          isActive: true,
          operationalState: "CONFIGURED_UNVERIFIED",
          verificationEvidence: null,
          verifiedAt: null,
          blockedReason: null,
        });
        return { success: true } as const;
      }),
  }),
  dailyReport: router({
    get: adminAccessProcedure.query(() => dailyReportService.readView()),
    save: adminAccessProcedure
      .input(dailyReportSettingsInput)
      .mutation(async ({ input }) => {
        try {
          return await dailyReportService.saveSettings(input);
        } catch (error) {
          reportProcedureError(error);
        }
      }),
    runManualDryRun: adminAccessProcedure.mutation(async () => {
      try {
        return await dailyReportService.runManualDryRun();
      } catch (error) {
        reportProcedureError(error);
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
