import { Router } from "express";
import { asyncHandler } from "../../http/asyncHandler";
import * as authController from "./auth.controller";
import { authRateLimit } from "./rateLimits";
import { requireAuthConfigured, requireJwt } from "./requireJwt";

/** /api/auth — accounts and browser sessions (refresh token in an httpOnly cookie). */
export const authRouter = Router();

const signupLimiter = authRateLimit(10);
const signinLimiter = authRateLimit(15);
const refreshLimiter = authRateLimit(30);
const signoutLimiter = authRateLimit(30);
const emailActionLimiter = authRateLimit(5);

authRouter.post("/signup", signupLimiter, requireAuthConfigured, asyncHandler(authController.signUp));
authRouter.post("/signin", signinLimiter, requireAuthConfigured, asyncHandler(authController.signIn));
authRouter.post("/refresh-tokens", refreshLimiter, requireAuthConfigured, asyncHandler(authController.refreshTokens));
authRouter.post("/signout", signoutLimiter, requireJwt, asyncHandler(authController.signOut));
authRouter.get("/me", requireJwt, asyncHandler(authController.me));

authRouter.post("/verify-email", emailActionLimiter, asyncHandler(authController.verifyEmail));
authRouter.post("/resend-verification", emailActionLimiter, asyncHandler(authController.resendVerification));
authRouter.post("/forgot-password", emailActionLimiter, asyncHandler(authController.forgotPassword));
authRouter.post("/reset-password", emailActionLimiter, asyncHandler(authController.resetPassword));
