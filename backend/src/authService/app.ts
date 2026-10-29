import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { logAuthStartupWarnings } from "../lib/auth/config";
import { logEmailStartupWarnings } from "../lib/auth/emailConfig";
import { authRouter } from "../routes/auth";
import { desktopOAuthRouter } from "../routes/desktopOAuth";
import { portalHtml } from "./portal";

/**
 * Cloud auth service (Vercel): accounts + desktop sign-in only. No screening
 * data ever reaches it. Requires CAPSCREEN_DB=mongodb, MONGODB_URI, JWT keys;
 * RESEND_API_KEY enables email verification; FRONTEND_URL = this service's URL.
 */
export function createAuthApp(): express.Express {
  logAuthStartupWarnings();
  logEmailStartupWarnings();
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Vercel edge
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          // The portal hands the browser to the app's loopback callback.
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: "100kb" }));

  app.use("/api/auth/desktop", desktopOAuthRouter);
  app.use("/api/auth", authRouter);
  app.get("/health", (_req, res) => res.json({ ok: true }));

  const page = (_req: express.Request, res: express.Response) => res.type("html").send(portalHtml());
  for (const p of ["/", "/signin", "/desktop/authorize", "/verify-email", "/reset-password"]) app.get(p, page);

  app.use((_req, res) => res.status(404).json({ detail: "Not found" }));
  return app;
}
