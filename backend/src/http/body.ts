/** Small readers for untyped JSON bodies and query strings. */

export type Body = Record<string, unknown>;

export function asBody(value: unknown): Body {
  return value && typeof value === "object" ? (value as Body) : {};
}

/** The string, or "" when it is missing or not a string. */
export function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The string, or null when it is missing or not a string. */
export function optionalStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
