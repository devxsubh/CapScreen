import { Router } from "express";
import { asyncHandler } from "../../http/asyncHandler";
import * as desktopOAuthController from "./desktopOAuth.controller";
import { authRateLimit } from "./rateLimits";
import { requireJwt } from "./requireJwt";

/** /api/auth/desktop — desktop sign-in (RFC 8252 + PKCE); see desktopOAuth.service.ts. */
export const desktopOAuthRouter = Router();

desktopOAuthRouter.use(authRateLimit(60, "Too many requests. Please try again later."));

desktopOAuthRouter.post("/authorize-code", requireJwt, asyncHandler(desktopOAuthController.authorizeCode));
desktopOAuthRouter.post("/token", asyncHandler(desktopOAuthController.token));
desktopOAuthRouter.post("/refresh", asyncHandler(desktopOAuthController.refresh));
desktopOAuthRouter.post("/revoke", asyncHandler(desktopOAuthController.revoke));
