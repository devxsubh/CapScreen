import crypto from "crypto";
import type { UserDocument } from "../../models";
import {
  JWT_ACCESS_TOKEN_EXPIRATION_MINUTES,
  REFRESH_TOKEN_EXPIRATION_DAYS,
} from "./config";
import { signAccessToken } from "./jwt";
import * as tokens from "./token.repository";
import { toPublicUser } from "./user.serializer";

/** A freshly issued access token + refresh token pair. */
export interface Session {
  accessToken: { token: string; expires: string };
  refreshToken: { expires: string };
  refreshTokenValue: string;
  refreshExpires: Date;
}

export async function issueSession(
  user: UserDocument,
  refreshDays: number = REFRESH_TOKEN_EXPIRATION_DAYS,
): Promise<Session> {
  const accessExpires = new Date(
    Date.now() + JWT_ACCESS_TOKEN_EXPIRATION_MINUTES * 60 * 1000,
  );
  const refreshExpires = new Date(
    Date.now() + refreshDays * 24 * 60 * 60 * 1000,
  );

  const accessToken = signAccessToken(
    user._id.toString(),
    user.email,
    accessExpires,
  );
  const refreshTokenValue = crypto.randomBytes(33).toString("hex");
  await tokens.saveRefreshToken(user._id, refreshTokenValue, refreshExpires);

  return {
    accessToken: {
      token: accessToken,
      expires: accessExpires.toISOString(),
    },
    refreshToken: {
      expires: refreshExpires.toISOString(),
    },
    refreshTokenValue,
    refreshExpires,
  };
}

/** Browser response: the refresh token itself travels only in the httpOnly cookie. */
export function toBrowserTokens(session: Session) {
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };
}

/** Desktop response: the app keeps the refresh token in the OS keychain. */
export function toDesktopSession(user: UserDocument, session: Session) {
  return {
    user: toPublicUser(user),
    accessToken: session.accessToken.token,
    accessExpires: session.accessToken.expires,
    refreshToken: session.refreshTokenValue,
    refreshExpires: session.refreshExpires.toISOString(),
  };
}
