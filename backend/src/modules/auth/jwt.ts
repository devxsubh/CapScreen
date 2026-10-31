import jwt from "jsonwebtoken";
import {
  JWT_ACCESS_TOKEN_SECRET_PRIVATE,
  JWT_ACCESS_TOKEN_SECRET_PUBLIC,
} from "./config";

export interface AccessTokenPayload {
  sub: string;
  email: string;
}

export function signAccessToken(
  userId: string,
  email: string,
  expiresAt: Date,
): string {
  if (!JWT_ACCESS_TOKEN_SECRET_PRIVATE) {
    throw new Error("JWT_ACCESS_TOKEN_SECRET_PRIVATE is not configured");
  }
  return jwt.sign(
    { sub: userId, email },
    JWT_ACCESS_TOKEN_SECRET_PRIVATE,
    {
      algorithm: "RS256",
      expiresIn: Math.max(
        1,
        Math.floor((expiresAt.getTime() - Date.now()) / 1000),
      ),
    },
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  if (!JWT_ACCESS_TOKEN_SECRET_PUBLIC) {
    throw new Error("JWT_ACCESS_TOKEN_SECRET_PUBLIC is not configured");
  }
  const payload = jwt.verify(token, JWT_ACCESS_TOKEN_SECRET_PUBLIC, {
    algorithms: ["RS256"],
  });
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid token payload");
  }
  const sub = (payload as jwt.JwtPayload).sub;
  const email = (payload as jwt.JwtPayload).email;
  if (typeof sub !== "string" || typeof email !== "string") {
    throw new Error("Invalid token claims");
  }
  return { sub, email };
}
