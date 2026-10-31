import type { Request, Response } from "express";
import { asBody } from "../../http/body";
import { currentUser } from "../../http/currentUser";
import * as desktopOAuthService from "./desktopOAuth.service";
import {
  parseAuthorizeRequest,
  parseRefreshToken,
  parseTokenRequest,
} from "./desktopOAuth.validation";
import { toDesktopSession } from "./session";

export async function authorizeCode(req: Request, res: Response): Promise<void> {
  const redirect = await desktopOAuthService.createAuthorizationCode(
    currentUser(res).userId,
    parseAuthorizeRequest(req.body),
  );
  res.json({ redirect });
}

export async function token(req: Request, res: Response): Promise<void> {
  const { user, session } = await desktopOAuthService.exchangeCode(parseTokenRequest(req.body));
  res.json(toDesktopSession(user, session));
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { user, session } = await desktopOAuthService.refreshSession(parseRefreshToken(req.body));
  res.json(toDesktopSession(user, session));
}

export async function revoke(req: Request, res: Response): Promise<void> {
  const { refreshToken } = asBody(req.body);
  if (typeof refreshToken === "string" && refreshToken) {
    await desktopOAuthService.revoke(refreshToken);
  }
  res.json({ ok: true });
}
