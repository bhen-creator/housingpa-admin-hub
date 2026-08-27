import { COOKIE_NAME } from "@shared/const";
import {
  DEFAULT_INTERNAL_TOOLS,
  isCoreToolSlug,
  isExternalToolUrl,
  mergeInternalTools,
} from "@shared/toolCatalog";
import { z } from "zod";
import { listInternalTools, upsertInternalTool } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminAccessProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createAdminSession,
  getLocalAdminSession,
  LOCAL_ADMIN_COOKIE_NAME,
  localAdminCookieOptions,
  verifyOwnerCredentials,
} from "./localAdminAuth";

const destinationUrl = z
  .string()
  .trim()
  .max(2048)
  .refine(isExternalToolUrl, "Enter a full http:// or https:// destination.");

const futureToolInput = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().min(8).max(1000),
  destinationUrl,
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
  };
}

function configuredToolDirectory(persistedTools: Awaited<ReturnType<typeof listInternalTools>>) {
  const destinationBySlug = environmentDestinations();
  const mergedTools = mergeInternalTools(persistedTools);
  return mergedTools.map(tool => ({
    ...tool,
    destinationUrl: tool.destinationUrl || destinationBySlug[tool.slug as keyof typeof destinationBySlug] || "",
  }));
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user ?? getLocalAdminSession(opts.ctx.req)),
    localLogin: publicProcedure
      .input(z.object({ username: z.string().trim().min(1), password: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const authenticated = await verifyOwnerCredentials(input.username, input.password);
        if (!authenticated) {
          throw new Error("The administrator credentials were not accepted.");
        }

        ctx.res.cookie(
          LOCAL_ADMIN_COOKIE_NAME,
          createAdminSession(input.username),
          localAdminCookieOptions(),
        );
        return { success: true } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      if (!ctx.user) {
        ctx.res.clearCookie(LOCAL_ADMIN_COOKIE_NAME, { ...localAdminCookieOptions(), maxAge: -1 });
      }
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
          throw new Error("Only the predefined tool destinations can be updated here.");
        }

        const tool = DEFAULT_INTERNAL_TOOLS.find(item => item.slug === input.slug);
        if (!tool) throw new Error("Tool configuration was not found.");

        await upsertInternalTool({ ...tool, destinationUrl: input.destinationUrl });
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
        });
        return { success: true } as const;
      }),
  }),
});

export type AppRouter = typeof appRouter;
