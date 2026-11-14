// Builds the HTTP app. Every file in ./routes that exports `register` is mounted, so adding a route never means editing a shared list.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import type { Express, NextFunction, Request, Response, Router } from "express";
import { log } from "../src/core/log";
import type { AiClients } from "./ai/types";
import type { Config } from "./env";

export interface Deps {
  readonly config: Config;
  readonly ai: AiClients;
}

export type Register = (router: Router, deps: Deps) => void;

const ROUTES = fileURLToPath(new URL("./routes", import.meta.url));

function isRegister(value: unknown): value is Register {
  return typeof value === "function";
}

export async function createApp(deps: Deps): Promise<Express> {
  const app = express();
  app.disable("x-powered-by");
  // Webcam snapshots arrive as base64 inside JSON.
  app.use(express.json({ limit: "6mb" }));

  const router = express.Router();
  const files = readdirSync(ROUTES).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts")).sort();
  for (const file of files) {
    const module = (await import(pathToFileURL(join(ROUTES, file)).href)) as { register?: unknown };
    if (isRegister(module.register)) module.register(router, deps);
    else log("warn", "route_without_register", file);
  }
  app.use(router);

  // In a production run this server also serves the built game, so one port is enough.
  if (existsSync(deps.config.distDir)) app.use(express.static(deps.config.distDir));

  app.use((request: Request, response: Response) => {
    response.status(404).json({ error: "not_found", path: request.path });
  });
  // Express only treats a handler as the error handler when it takes four arguments.
  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    log("error", "request_failed", error);
    if (response.headersSent) next(error);
    else response.status(500).json({ error: "server_error" });
  });
  return app;
}
