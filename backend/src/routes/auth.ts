import { Router, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { connectDb } from "../lib/infra/db";
import { requireJwt } from "../middleware/requireJwt";
import {
  generateAuthTokens,
  serializeAuthTokens,
} from "../lib/auth/tokens";
import { jwtConfigured } from "../lib/auth/config";
import {
  clearRefreshTokenCookie,
  REFRESH_COOKIE_NAME,
  setRefreshTokenCookie,
} from "../lib/auth/cookies";
import {
  clearLoginLockout,
  isAccountLocked,
  lockoutMessage,
  recordFailedLogin,
} from "../lib/auth/loginLockout";
import { normalizeEmail, validateEmail, validatePassword } from "../lib/auth/validate";
import { EMAIL_TOKEN_TYPES, emailConfigured } from "../lib/auth/emailConfig";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "../lib/auth/email";
import {
  confirmUserEmail,
  consumeEmailToken,
  createUser,
  findUserByEmail,
  findUserByEmailWithPassword,
  findUserById,
  issueEmailToken,
  serializePublicUser,
  updateUserPassword,
  verifyPassword,
} from "../models";
import {
  findValidRefreshToken,
  revokeRefreshToken,
} from "../models";

export const authRouter = Router();

const INVALID_REFRESH_DETAIL = "Invalid or expired refresh token";
const GENERIC_RESET_MESSAGE =
  "If an account exists for that email, a reset link has been sent.";

function createAuthLimiter(max: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { detail: "Too many auth requests. Please try again later." },
  });
}

const signupLimiter = createAuthLimiter(10);
const signinLimiter = createAuthLimiter(15);
const refreshLimiter = createAuthLimiter(30);
const signoutLimiter = createAuthLimiter(30);
const emailActionLimiter = createAuthLimiter(5);

authRouter.use(async (_req, _res, next) => {
  try {
    await connectDb();
    next();
  } catch (err) {
    next(err);
  }
});

function authNotConfigured(res: Response): boolean {
  if (jwtConfigured()) return false;
  res.status(500).json({ detail: "Server auth is not configured" });
  return true;
}

function readRefreshToken(req: Request): string | null {
  const fromCookie = req.cookies?.[REFRESH_COOKIE_NAME];
  return typeof fromCookie === "string" && fromCookie.trim()
    ? fromCookie.trim()
    : null;
}

async function issueAuthResponse(
  res: Response,
  user: Awaited<ReturnType<typeof createUser>>,
  status = 200,
): Promise<void> {
  const issued = await generateAuthTokens(user);
  setRefreshTokenCookie(res, issued.refreshTokenValue, issued.refreshExpires);
  res.status(status).json({
    user: serializePublicUser(user),
    tokens: serializeAuthTokens(issued),
  });
}

async function sendVerificationForUser(
  user: Awaited<ReturnType<typeof createUser>>,
): Promise<void> {
  const token = await issueEmailToken(
    user._id,
    EMAIL_TOKEN_TYPES.VERIFY_EMAIL,
  );
  await sendVerificationEmail(user.email, token);
}

authRouter.post("/signup", signupLimiter, async (req, res) => {
  if (authNotConfigured(res)) return;

  const email = typeof req.body?.email === "string" ? req.body.email : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";
  const displayName =
    typeof req.body?.displayName === "string" ? req.body.displayName : null;
  const organisation =
    typeof req.body?.organisation === "string" ? req.body.organisation : null;
  const name = typeof req.body?.name === "string" ? req.body.name : null;

  const emailError = validateEmail(email);
  if (emailError) {
    res.status(400).json({ detail: emailError });
    return;
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    res.status(400).json({ detail: passwordError });
    return;
  }

  const requireVerification = emailConfigured();

  try {
    const user = await createUser({
      email: normalizeEmail(email),
      password,
      displayName: displayName ?? name,
      organisation,
      confirmed: !requireVerification,
    });

    if (requireVerification) {
      await sendVerificationForUser(user);
      res.status(201).json({
        message:
          "Account created. Check your email to verify your address before signing in.",
        emailVerificationRequired: true,
        user: serializePublicUser(user),
      });
      return;
    }

    await issueAuthResponse(res, user, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Signup failed";
    if (message === "Email already exists") {
      res.status(409).json({ detail: message });
      return;
    }
    res.status(500).json({ detail: message });
  }
});

authRouter.post("/signin", signinLimiter, async (req, res) => {
  if (authNotConfigured(res)) return;

  const email = typeof req.body?.email === "string" ? req.body.email : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";

  const emailError = validateEmail(email);
  if (emailError || !password) {
    res.status(400).json({ detail: "Email and password are required" });
    return;
  }

  const user = await findUserByEmailWithPassword(normalizeEmail(email));
  if (!user) {
    res.status(401).json({ detail: "Incorrect email or password" });
    return;
  }

  if (!user.confirmed && emailConfigured()) {
    res.status(403).json({
      detail:
        "Email not verified. Check your inbox or request a new verification link.",
      emailVerificationRequired: true,
    });
    return;
  }

  if (isAccountLocked(user)) {
    res.status(423).json({ detail: lockoutMessage(user) });
    return;
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    await recordFailedLogin(user);
    res.status(401).json({ detail: "Incorrect email or password" });
    return;
  }

  await clearLoginLockout(user);
  await issueAuthResponse(res, user);
});

authRouter.post("/verify-email", emailActionLimiter, async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  if (!token) {
    res.status(400).json({ detail: "token is required" });
    return;
  }

  const userId = await consumeEmailToken(token, EMAIL_TOKEN_TYPES.VERIFY_EMAIL);
  if (!userId) {
    res.status(400).json({ detail: "Invalid or expired verification link" });
    return;
  }

  const confirmed = await confirmUserEmail(userId.toString());
  if (!confirmed) {
    res.status(404).json({ detail: "User not found" });
    return;
  }

  const user = await findUserById(userId.toString());
  if (!user) {
    res.status(404).json({ detail: "User not found" });
    return;
  }

  res.json({
    message: "Email verified. You can sign in now.",
    user: serializePublicUser(user),
  });
});

authRouter.post(
  "/resend-verification",
  emailActionLimiter,
  async (req, res) => {
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    const emailError = validateEmail(email);
    if (emailError) {
      res.status(400).json({ detail: emailError });
      return;
    }

    const user = await findUserByEmail(normalizeEmail(email));
    if (user && !user.confirmed) {
      try {
        await sendVerificationForUser(user);
      } catch {
        res.status(500).json({ detail: "Failed to send verification email" });
        return;
      }
    }

    res.json({
      message:
        "If an unverified account exists for that email, a new verification link has been sent.",
    });
  },
);

authRouter.post("/forgot-password", emailActionLimiter, async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email : "";
  const emailError = validateEmail(email);
  if (emailError) {
    res.status(400).json({ detail: emailError });
    return;
  }

  const user = await findUserByEmail(normalizeEmail(email));
  if (user) {
    try {
      const token = await issueEmailToken(
        user._id,
        EMAIL_TOKEN_TYPES.PASSWORD_RESET,
      );
      await sendPasswordResetEmail(user.email, token);
    } catch {
      res.status(500).json({ detail: "Failed to send password reset email" });
      return;
    }
  }

  res.json({ message: GENERIC_RESET_MESSAGE });
});

authRouter.post("/reset-password", emailActionLimiter, async (req, res) => {
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : "";
  const password =
    typeof req.body?.password === "string" ? req.body.password : "";

  if (!token) {
    res.status(400).json({ detail: "token is required" });
    return;
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    res.status(400).json({ detail: passwordError });
    return;
  }

  const userId = await consumeEmailToken(
    token,
    EMAIL_TOKEN_TYPES.PASSWORD_RESET,
  );
  if (!userId) {
    res.status(400).json({ detail: "Invalid or expired reset link" });
    return;
  }

  try {
    await updateUserPassword(userId.toString(), password);
    res.json({ message: "Password updated. You can sign in with your new password." });
  } catch {
    res.status(500).json({ detail: "Failed to update password" });
  }
});

authRouter.post("/signout", signoutLimiter, requireJwt, async (req, res) => {
  const refreshToken = readRefreshToken(req);
  if (!refreshToken) {
    clearRefreshTokenCookie(res);
    res.json({ ok: true });
    return;
  }

  try {
    const tokenDoc = await findValidRefreshToken(refreshToken);
    if (
      !tokenDoc ||
      tokenDoc.userId.toString() !== (res.locals.userId as string)
    ) {
      res.status(401).json({ detail: INVALID_REFRESH_DETAIL });
      return;
    }
    await revokeRefreshToken(refreshToken);
    clearRefreshTokenCookie(res);
    res.json({ ok: true });
  } catch {
    res.status(401).json({ detail: INVALID_REFRESH_DETAIL });
  }
});

authRouter.post("/refresh-tokens", refreshLimiter, async (req, res) => {
  if (authNotConfigured(res)) return;

  const refreshToken = readRefreshToken(req);
  if (!refreshToken) {
    res.status(401).json({ detail: INVALID_REFRESH_DETAIL });
    return;
  }

  const tokenDoc = await findValidRefreshToken(refreshToken);
  if (!tokenDoc) {
    clearRefreshTokenCookie(res);
    res.status(401).json({ detail: INVALID_REFRESH_DETAIL });
    return;
  }

  const user = await findUserById(tokenDoc.userId.toString());
  if (!user) {
    await tokenDoc.deleteOne();
    clearRefreshTokenCookie(res);
    res.status(401).json({ detail: INVALID_REFRESH_DETAIL });
    return;
  }

  await tokenDoc.deleteOne();
  try {
    const issued = await generateAuthTokens(user);
    setRefreshTokenCookie(res, issued.refreshTokenValue, issued.refreshExpires);
    res.json({ tokens: serializeAuthTokens(issued) });
  } catch {
    clearRefreshTokenCookie(res);
    res.status(500).json({ detail: "Failed to refresh session" });
  }
});

authRouter.get("/me", requireJwt, async (req, res) => {
  const userId = res.locals.userId as string | undefined;
  if (!userId) {
    res.status(401).json({ detail: "Authentication required" });
    return;
  }
  const user = await findUserById(userId);
  if (!user) {
    res.status(401).json({ detail: "Invalid or expired token" });
    return;
  }
  res.json(serializePublicUser(user));
});
