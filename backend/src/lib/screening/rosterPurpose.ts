/** Detect co-investor / vendor roster uploads from filename and headers (F13). */
export type RosterPurpose =
  | "cap_table"
  | "co_investor"
  | "vendor"
  | "entity_roster";

export function detectRosterPurpose(
  filename?: string,
  headers?: string[],
): RosterPurpose {
  const name = (filename ?? "").toLowerCase();
  const headerLine = (headers ?? []).join(" ").toLowerCase();

  if (
    /co[-_]?investor|coinvestor|syndicate|lp.?list|fund.?partner/.test(name) ||
    /co[-_]?investor|syndicate partner/.test(headerLine)
  ) {
    return "co_investor";
  }

  if (
    /vendor|supplier|service.?provider|contractor/.test(name) ||
    /vendor|supplier/.test(headerLine)
  ) {
    return "vendor";
  }

  return "cap_table";
}

