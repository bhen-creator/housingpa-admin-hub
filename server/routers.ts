import {
  DEFAULT_INTERNAL_TOOLS,
  isCoreToolSlug,
  isDestinationUrl,
  mergeInternalTools,
  normalizeInternalTool,
} from "@shared/toolCatalog";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { listInternalTools, upsertInternalTool } from "./db";
import { systemRouter } from "./_core/systemRouter";
import { adminAccessProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createAdminSession,
  LOCAL_ADMIN_COOKIE_NAME,
  localAdminCookieOptions,
  verifyOwnerCredentials,
} from "./localAdminAuth";
import { auditLoginFailure, loginThrottle } from "./loginThrottle";

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
    "idea-generator": process.env.IDEA_GENERATOR_URL ?? "",
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
  tools: router({
    list: adminAccessProcedure.query(async () => {
      const persistedTools = await listInternalTools();
      return configuredToolDirectory(persistedTools);
    }),
    updateDestination: adminAccessProcedure
      .input(z.object({ slug: z.string(), destinationUrl }))
      .mutation(async ({ input }) => {
        if (!isCoreToolSlug(input.slug)) {
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
});

export type AppRouter = typeof appRouter;
