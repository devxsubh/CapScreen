import rateLimit from "express-rate-limit";

/** Per-IP limit over a 15-minute window. */
export function authRateLimit(max: number, detail = "Too many auth requests. Please try again later.") {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { detail },
  });
}
