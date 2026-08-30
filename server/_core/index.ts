import "dotenv/config";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import express from "express";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { registerOperationalEndpoints } from "../health";
import { appRouter } from "../routers";
import { securityHeaders } from "../security";
import { configuredPort, REQUEST_BODY_LIMIT } from "../serverConfig";
import { createContext } from "./context";
import { serveStatic } from "./static";

export async function createApplication() {
  const app = express();
  const server = createServer(app);
  const isProduction = process.env.NODE_ENV === "production";

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(securityHeaders(isProduction));
  registerOperationalEndpoints(app);
  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ limit: REQUEST_BODY_LIMIT, extended: true }));
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (process.env.NODE_ENV === "development") {
    const developmentModule = "./vite";
    const { setupVite } = await import(developmentModule);
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction
    ) => {
      const status =
        typeof error === "object" && error && "status" in error
          ? Number((error as { status?: unknown }).status) || 500
          : 500;
      response
        .status(status)
        .json({
          error:
            status === 413 ? "Request body is too large." : "Request failed.",
        });
    }
  );

  return { app, server };
}

export async function startServer() {
  const { server } = await createApplication();
  const port = configuredPort();

  await new Promise<void>((resolveListening, rejectListening) => {
    server.once("error", rejectListening);
    server.listen(port, "0.0.0.0", () => resolveListening());
  });

  console.log(`Server listening on configured port ${port}.`);
  return server;
}

const entryPoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (import.meta.url === entryPoint) {
  startServer().catch(error => {
    const message =
      error instanceof Error ? error.message : "Unknown startup error";
    console.error(`Server failed to start: ${message}`);
    process.exitCode = 1;
  });
}
