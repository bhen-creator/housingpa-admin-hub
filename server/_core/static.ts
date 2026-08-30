import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error("Production client build directory is missing.");
  }

  app.use(
    express.static(distPath, {
      fallthrough: true,
      index: false,
      maxAge: "1h",
    })
  );

  app.use("*", (_request, response) => {
    response.sendFile(path.resolve(distPath, "index.html"));
  });
}
