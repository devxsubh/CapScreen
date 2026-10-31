import type { Request, Response } from "express";
import { currentUser } from "../../http/currentUser";
import { unauthorized } from "../../http/httpError";
import * as authService from "./auth.service";
import {
  parseEmail,
  parseEmailLinkToken,
  parseResetPassword,
  parseSignIn,
  parseSignUp,
} from "./auth.validation";
import {
  clearRefreshTokenCookie,
  readRefreshTokenCookie,
  setRefreshTokenCookie,
} from "./cookies";
import { toBrowserTokens, type Session } from "./session";
import { toPublicUser } from "./user.serializer";
import type { UserDocument } from "../../models";

/** HTTP edge of /api/auth: read the request, call the service, shape the response. */

function sendSession(res: Response, user: UserDocument, session: Session, status = 200): void {
  setRefreshTokenCookie(res, session.refreshTokenValue, session.refreshExpires);
  res.status(status).json({ user: toPublicUser(user), tokens: toBrowserTokens(session) });
}

export async function signUp(req: Request, res: Response): Promise<void> {
  const result = await authService.signUp(parseSignUp(req.body));
  if (result.verificationRequired) {
    res.status(201).json({
      message: "Account created. Check your email to verify your address before signing in.",
      emailVerificationRequired: true,
      user: toPublicUser(result.user),
    });
    return;
  }
  sendSession(res, result.user, result.session, 201);
}

export async function signIn(req: Request, res: Response): Promise<void> {
  const { email, password } = parseSignIn(req.body);
  const { user, session } = await authService.signIn(email, password);
  sendSession(res, user, session);
}

export async function refreshTokens(req: Request, res: Response): Promise<void> {
  const refreshToken = readRefreshTokenCookie(req);
  if (!refreshToken) throw unauthorized(authService.INVALID_REFRESH_DETAIL);
  try {
    const session = await authService.refreshSession(refreshToken);
    setRefreshTokenCookie(res, session.refreshTokenValue, session.refreshExpires);
    res.json({ tokens: toBrowserTokens(session) });
  } catch (err) {
    clearRefreshTokenCookie(res);
    throw err;
  }
}

export async function signOut(req: Request, res: Response): Promise<void> {
  const refreshToken = readRefreshTokenCookie(req);
  if (refreshToken) {
    await authService.signOut(currentUser(res).userId, refreshToken);
  }
  clearRefreshTokenCookie(res);
  res.json({ ok: true });
}

export async function me(_req: Request, res: Response): Promise<void> {
  const user = await authService.getProfile(currentUser(res).userId);
  res.json(toPublicUser(user));
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const user = await authService.verifyEmail(parseEmailLinkToken(req.body));
  res.json({ message: "Email verified. You can sign in now.", user: toPublicUser(user) });
}

export async function resendVerification(req: Request, res: Response): Promise<void> {
  await authService.resendVerification(parseEmail(req.body));
  res.json({
    message: "If an unverified account exists for that email, a new verification link has been sent.",
  });
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  await authService.requestPasswordReset(parseEmail(req.body));
  res.json({ message: "If an account exists for that email, a reset link has been sent." });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { token, password } = parseResetPassword(req.body);
  await authService.resetPassword(token, password);
  res.json({ message: "Password updated. You can sign in with your new password." });
}
