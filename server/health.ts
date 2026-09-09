import type { Express } from "express";
import { ADMIN_ACCOUNT } from "./adminAccount";

export function isApplicationReady(
  environment: NodeJS.ProcessEnv = process.env
) {
  return Boolean(
    environment.OWNER_USERNAME === ADMIN_ACCOUNT &&
      environment.OWNER_PASSWORD_SCRYPT?.trim() &&
      (environment.SESSION_SECRET?.trim() || environment.JWT_SECRET?.trim())
  );
}

export function registerOperationalEndpoints(app: Express) {
  app.get("/healthz", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.status(200).json({ status: "ok" });
  });

  app.get("/readyz", (_request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const ready = isApplicationReady();
    response
      .status(ready ? 200 : 503)
      .json({ status: ready ? "ready" : "not_ready" });
  });
}
