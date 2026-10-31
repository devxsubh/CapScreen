import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { connectDatabase } from "./http/connectDatabase";
import { errorHandler, notFoundHandler } from "./http/errorHandler";
import { desktopToken } from "./middleware/desktopToken";
import { requireAuth } from "./middleware/requireAuth";
import { apiRouter } from "./routes";

const isProduction = process.env.NODE_ENV === "production";

// The desktop token is the real gate; CORS just admits the app's own
// origin and loopback dev servers, whose ports change every launch.
const LOOPBACK_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

/** The local desktop API. index.ts starts it; tests mount it on a free port. */
export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", false); // loopback desktop API — no reverse proxy

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      hsts: isProduction
        ? { maxAge: 15552000, includeSubDomains: true }
        : false,
      referrerPolicy: { policy: "no-referrer" },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) =>
        cb(null, !origin || origin === process.env.FRONTEND_URL || origin === "capscreen://app" || LOOPBACK_ORIGIN.test(origin)),
      credentials: true,
    }),
  );

  app.use(desktopToken);
  app.use(cookieParser());
  app.use(express.json({ limit: "10mb" }));
  app.use(requireAuth);
  app.use(connectDatabase);

  app.use(apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
