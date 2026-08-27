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
import { adminProcedure, publicProcedure, router } from "./_core/trpc";

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

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  tools: router({
    list: adminProcedure.query(async () => {
      const persistedTools = await listInternalTools();
      return mergeInternalTools(persistedTools);
    }),
    updateDestination: adminProcedure
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
    addFutureTool: adminProcedure
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
