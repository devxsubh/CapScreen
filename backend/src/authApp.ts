import cookieParser from "cookie-parser";
import express from "express";
import helmet from "helmet";
import { connectDatabase } from "./http/connectDatabase";
import { errorHandler, notFoundHandler } from "./http/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { logAuthStartupWarnings } from "./modules/auth/config";
import { desktopOAuthRouter } from "./modules/auth/desktopOAuth.routes";
import { logEmailStartupWarnings } from "./modules/auth/emailConfig";
import { portalHtml } from "./modules/auth/portal/portal";

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

  app.use("/api/auth", connectDatabase);
  app.use("/api/auth/desktop", desktopOAuthRouter);
  app.use("/api/auth", authRouter);
  app.get("/health", (_req, res) => res.json({ ok: true }));

  const page = (_req: express.Request, res: express.Response) => res.type("html").send(portalHtml());
  for (const p of ["/", "/signin", "/desktop/authorize", "/verify-email", "/reset-password"]) app.get(p, page);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
