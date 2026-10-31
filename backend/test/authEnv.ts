import crypto from "crypto";

// lib/auth/config reads the JWT keys at import time, so this module must be
// imported before anything from src/.
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "pkcs1", format: "pem" },
});
process.env.JWT_ACCESS_TOKEN_SECRET_PRIVATE = Buffer.from(privateKey).toString("base64");
process.env.JWT_ACCESS_TOKEN_SECRET_PUBLIC = Buffer.from(publicKey).toString("base64");
delete process.env.RESEND_API_KEY;
