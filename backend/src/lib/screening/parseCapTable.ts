import type {
  ColumnMapping,
  EntityType,
  OwnershipRecord,
  ParseError,
  ParseResult,
  RosterEntity,
} from "../../types/screening";

export type { OwnershipRecord } from "../../types/screening";

const REQUIRED_HEADERS = [
  "entity",
  "entity_type",
  "owner",
  "owner_type",
  "ownership_pct",
] as const;

const VALID_TYPES = new Set(["person", "company"]);

/** Normalized header token → canonical cap-table field */
const HEADER_ALIASES: Record<string, string> = {
  entity: "entity",
  company: "entity",
  investee: "entity",
  subsidiary: "entity",
  entity_name: "entity",
  company_name: "entity",
  portfolio_company: "entity",
  target: "entity",
  issuer: "entity",

  entity_type: "entity_type",
  entitytype: "entity_type",
  company_type: "entity_type",

  owner: "owner",
  shareholder: "owner",
  investor: "owner",
  owner_name: "owner",
  parent: "owner",
  holder: "owner",
  shareholder_name: "owner",

  owner_type: "owner_type",
  ownertype: "owner_type",
  shareholder_type: "owner_type",
  investor_type: "owner_type",

  ownership_pct: "ownership_pct",
  ownership: "ownership_pct",
  ownership_percent: "ownership_pct",
  ownership_percentage: "ownership_pct",
  ownershippercent: "ownership_pct",
  percent: "ownership_pct",
  percentage: "ownership_pct",
  pct: "ownership_pct",
  stake: "ownership_pct",
  stake_pct: "ownership_pct",
  stake_percent: "ownership_pct",
  percent_owned: "ownership_pct",
  ownership_stake: "ownership_pct",

  name: "name",
  full_name: "name",
  entity_name_roster: "name",
  person_name: "name",
  company_name_roster: "name",
  caption: "name",
  label: "name",

  type: "type",
  entity_type_roster: "type",
  person_or_company: "type",

  role: "role",
  title: "role",
  position: "role",
  category: "role",
  relationship: "role",
  capacity: "role",
  function: "role",

  alt_name: "alt_name",
  alias: "alt_name",
  aka: "alt_name",
  alternate_name: "alt_name",
  other_name: "alt_name",

  birth_date: "birth_date",
  dob: "birth_date",
  date_of_birth: "birth_date",
  birthdate: "birth_date",

  address: "address",
  street_address: "address",
  mailing_address: "address",
  registered_address: "address",

  country: "country",
  jurisdiction: "country",
  nationality: "country",
  country_of_incorporation: "country",

  registration_id: "registration_id",
  registration_number: "registration_id",
  company_number: "registration_id",
  reg_number: "registration_id",
  tax_id: "registration_id",
  ein: "registration_id",
};

function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[%]/g, "percent")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function detectDelimiter(csv: string): "," | ";" | "\t" {
  const firstLine = csv.trim().split(/\r?\n/)[0] ?? "";
  const counts = {
    ",": (firstLine.match(/,/g) ?? []).length,
    ";": (firstLine.match(/;/g) ?? []).length,
    "\t": (firstLine.match(/\t/g) ?? []).length,
  };
  if (counts["\t"] >= counts[","] && counts["\t"] >= counts[";"]) return "\t";
  if (counts[";"] > counts[","]) return ";";
  return ",";
}

export function tokenizeLine(line: string, delimiter = ","): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === delimiter && !inQuotes) {
      tokens.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  tokens.push(current.trim());
  return tokens;
}

export interface CsvTable {
  delimiter: "," | ";" | "\t";
  headers: string[];
  normalizedHeaders: string[];
  rows: string[][];
}

export function extractCsvTable(csv: string): CsvTable | null {
  const lines = csv
    .trim()
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  if (lines.length < 1) return null;

  const delimiter = detectDelimiter(csv);
  const headers = tokenizeLine(lines[0], delimiter);
  const normalizedHeaders = headers.map(normalizeHeader);
  const rows = lines.slice(1).map((l) => tokenizeLine(l, delimiter));
  return { delimiter, headers, normalizedHeaders, rows };
}

export function extractPartialColumnMapping(table: CsvTable): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();

  for (let i = 0; i < table.headers.length; i++) {
    const norm = table.normalizedHeaders[i];
    const canonical = HEADER_ALIASES[norm];
    if (!canonical || used.has(canonical)) continue;
    if (
      canonical === "entity" ||
      canonical === "entity_type" ||
      canonical === "owner" ||
      canonical === "owner_type" ||
      canonical === "ownership_pct" ||
      canonical === "name" ||
      canonical === "type" ||
      canonical === "role" ||
      canonical === "alt_name" ||
      canonical === "birth_date" ||
      canonical === "address" ||
      canonical === "country" ||
      canonical === "registration_id"
    ) {
      (mapping as Record<string, string>)[canonical] = table.headers[i];
      used.add(canonical);
    }
  }

  return mapping;
}

function findHeaderMatching(
  table: CsvTable,
  test: (norm: string) => boolean,
): string | undefined {
  for (let i = 0; i < table.normalizedHeaders.length; i++) {
    if (test(table.normalizedHeaders[i])) return table.headers[i];
  }
  return undefined;
}

/** Shareholder schedule: names + ownership % but no investee company column. */
export function guessShareholderScheduleMapping(
  table: CsvTable,
): ColumnMapping | null {
  const partial = extractPartialColumnMapping(table);

  const ownerHeader =
    partial.owner ??
    findHeaderMatching(
      table,
      (n) =>
        /shareholder|^(owner|investor|holder)(_|$)/.test(n) &&
        !n.includes("officer"),
    );
  const pctHeader =
    partial.ownership_pct ??
    findHeaderMatching(table, (n) => /ownership|percent|stake|pct/.test(n));
  const investeeHeader =
    partial.entity ??
    findHeaderMatching(
      table,
      (n) =>
        (n === "entity" ||
          /^(company|investee|portfolio|target|issuer|subsidiary)(_|$)/.test(
            n,
          )) &&
        n !== "entity_type",
    );

  if (ownerHeader && pctHeader && !investeeHeader) {
    const typeHeader =
      partial.entity_type ??
      partial.type ??
      findHeaderMatching(
        table,
        (n) =>
          n === "entity_type" ||
          n === "type" ||
          /holder_type|owner_type/.test(n),
      );
    return { name: ownerHeader, type: typeHeader };
  }
  return null;
}

/** AI often maps shareholder schedules as cap tables — recover roster mapping. */
export function rosterMappingFromCapTableColumns(
  mapping: ColumnMapping,
): ColumnMapping | null {
  if (mapping.owner && mapping.ownership_pct && !mapping.entity) {
    return {
      name: mapping.owner,
      type: mapping.entity_type ?? mapping.owner_type ?? mapping.type,
    };
  }
  return null;
}

export function guessHeuristicColumnMapping(
  table: CsvTable,
): ColumnMapping | null {
  const mapping = extractPartialColumnMapping(table);

  const hasCapTable =
    mapping.entity && mapping.owner && mapping.ownership_pct;
  const hasRoster = mapping.name;

  if (hasCapTable || hasRoster) return mapping;
  return null;
}

function parseOwnershipPct(raw: string): number | null {
  const cleaned = raw.replace(/%/g, "").replace(/,/g, "").trim();
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  if (Number.isNaN(n)) return null;
  if (n > 0 && n <= 1) return n * 100;
  return n;
}

function normalizeEntityType(raw: string, defaultType: EntityType): EntityType {
  const v = raw.trim().toLowerCase();
  if (!v) return defaultType;
  if (v === "person" || v === "individual" || v === "natural person") {
    return "person";
  }
  if (
    v === "company" ||
    v === "corporate" ||
    v === "corp" ||
    v === "organisation" ||
    v === "organization" ||
    v === "entity" ||
    v === "fund" ||
    v === "trust"
  ) {
    return "company";
  }
  return defaultType;
}

export function parseWithMapping(
  csv: string,
  mapping: ColumnMapping,
): ParseResult {
  const errors: ParseError[] = [];
  const records: OwnershipRecord[] = [];
  const parsed = extractCsvTable(csv);
  if (!parsed || parsed.rows.length === 0) {
    errors.push({
      row: 1,
      message: "CSV must include a header row and at least one data row",
    });
    return { records, errors };
  }
  const table = parsed;

  function colIndex(field: keyof ColumnMapping): number {
    const src = mapping[field];
    if (!src) return -1;
    const norm = normalizeHeader(src);
    return table.normalizedHeaders.findIndex((h) => h === norm || h === src.toLowerCase());
  }

  function col(row: string[], field: keyof ColumnMapping): string {
    const i = colIndex(field);
    if (i < 0) {
      const idx = table.headers.indexOf(mapping[field] ?? "");
      return idx >= 0 ? (row[idx] ?? "").trim() : "";
    }
    return (row[i] ?? "").trim();
  }

  const entityCol = mapping.entity;
  const ownerCol = mapping.owner;
  const pctCol = mapping.ownership_pct;

  if (!entityCol) {
    errors.push({
      row: 1,
      field: "entity",
      message:
        'Missing required column for entity — add a column such as "entity", "company", or "investee".',
    });
  }
  if (!ownerCol) {
    errors.push({
      row: 1,
      field: "owner",
      message:
        'Missing required column for owner — add a column such as "owner", "shareholder", or "investor".',
    });
  }
  if (!pctCol) {
    errors.push({
      row: 1,
      field: "ownership_pct",
      message:
        'Missing required column for ownership % — add a column such as "ownership_pct", "% Stake", or "ownership".',
    });
  }
  if (errors.length > 0) return { records, errors };

  for (let i = 0; i < table.rows.length; i++) {
    const rowNum = i + 2;
    const cells = table.rows[i];
    const entity = col(cells, "entity");
    const owner = col(cells, "owner");
    const entityTypeRaw = col(cells, "entity_type");
    const ownerTypeRaw = col(cells, "owner_type");
    const pctRaw = col(cells, "ownership_pct");

    let rowInvalid = false;

    if (!entity) {
      errors.push({ row: rowNum, field: "entity", message: "Entity is required" });
      rowInvalid = true;
    }
    if (!owner) {
      errors.push({ row: rowNum, field: "owner", message: "Owner is required" });
      rowInvalid = true;
    }

    const entityType = normalizeEntityType(entityTypeRaw, "company");
    const ownerType = normalizeEntityType(ownerTypeRaw, "company");

    if (entityTypeRaw && !VALID_TYPES.has(entityTypeRaw.toLowerCase()) && entityTypeRaw.toLowerCase() !== "individual") {
      // normalized above
    }

    const ownershipPct = parseOwnershipPct(pctRaw);
    if (ownershipPct === null) {
      errors.push({
        row: rowNum,
        field: "ownership_pct",
        message: "ownership_pct must be a valid number",
      });
      rowInvalid = true;
    } else if (ownershipPct < 0 || ownershipPct > 100) {
      errors.push({
        row: rowNum,
        field: "ownership_pct",
        message: "ownership_pct must be between 0 and 100",
      });
      rowInvalid = true;
    }

    if (rowInvalid) continue;

    records.push({
      entity,
      entityType,
      owner,
      ownerType,
      ownershipPct: ownershipPct!,
    });
  }

  if (records.length === 0 && errors.length === 0) {
    errors.push({ row: 2, message: "No valid ownership rows found" });
  }

  return { records, errors };
}

export function parseRosterWithMapping(
  csv: string,
  mapping: ColumnMapping,
): { entities: RosterEntity[]; errors: ParseError[] } {
  const errors: ParseError[] = [];
  const entities: RosterEntity[] = [];
  const table = extractCsvTable(csv);
  if (!table) {
    errors.push({ row: 1, message: "CSV must include a header row" });
    return { entities, errors };
  }

  const nameHeader = mapping.name;
  if (!nameHeader) {
    errors.push({
      row: 1,
      field: "name",
      message:
        'Missing required column for entity name — add a column such as "name", "entity", or "company".',
    });
    return { entities, errors };
  }

  const nameIdx = table.headers.findIndex(
    (h) => normalizeHeader(h) === normalizeHeader(nameHeader) || h === nameHeader,
  );
  const typeIdx = mapping.type
    ? table.headers.findIndex(
        (h) =>
          normalizeHeader(h) === normalizeHeader(mapping.type!) ||
          h === mapping.type,
      )
    : -1;
  const roleIdx = mapping.role
    ? table.headers.findIndex(
        (h) =>
          normalizeHeader(h) === normalizeHeader(mapping.role!) ||
          h === mapping.role,
      )
    : -1;

  for (let i = 0; i < table.rows.length; i++) {
    const rowNum = i + 2;
    const row = table.rows[i];
    const name = (row[nameIdx] ?? "").trim();
    if (!name) {
      errors.push({ row: rowNum, field: "name", message: "Name is required" });
      continue;
    }
    const typeRaw = typeIdx >= 0 ? (row[typeIdx] ?? "").trim() : "";
    const roleRaw = roleIdx >= 0 ? (row[roleIdx] ?? "").trim() : "";
    entities.push({
      name,
      type: normalizeEntityType(typeRaw, "company"),
      role: roleRaw || undefined,
    });
  }

  if (entities.length === 0 && errors.length === 0) {
    errors.push({ row: 2, message: "No valid entity names found" });
  }

  return { entities, errors };
}

export function buildNormalizedCsv(records: OwnershipRecord[]): string {
  const header =
    "entity,entity_type,owner,owner_type,ownership_pct";
  const lines = records.map(
    (r) =>
      `${escapeCsv(r.entity)},${r.entityType},${escapeCsv(r.owner)},${r.ownerType},${r.ownershipPct}`,
  );
  return [header, ...lines].join("\n");
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function parseCapTableDetailed(csv: string): ParseResult {
  const table = extractCsvTable(csv);
  if (!table) {
    return {
      records: [],
      errors: [
        {
          row: 1,
          message: "CSV must include a header row and at least one data row",
        },
      ],
    };
  }

  const hasStrict = REQUIRED_HEADERS.every((h) =>
    table.normalizedHeaders.includes(h),
  );
  if (!hasStrict) {
    const errors: ParseError[] = [];
    for (const header of REQUIRED_HEADERS) {
      if (!table.normalizedHeaders.includes(header)) {
        errors.push({
          row: 1,
          field: header,
          message: `Missing required column '${header}'`,
        });
      }
    }
    return { records: [], errors };
  }

  const strictMapping: ColumnMapping = {
    entity: "entity",
    entity_type: "entity_type",
    owner: "owner",
    owner_type: "owner_type",
    ownership_pct: "ownership_pct",
  };
  return parseWithMapping(csv, strictMapping);
}

/** Returns valid records only. Throws if the CSV cannot be parsed. */
export function parseCapTable(csv: string): OwnershipRecord[] {
  const { records, errors } = parseCapTableDetailed(csv);
  if (errors.length > 0) {
    const summary = errors
      .slice(0, 3)
      .map((e) => `Row ${e.row}: ${e.message}`)
      .join("; ");
    throw new Error(errors.length > 3 ? `${summary}; …` : summary);
  }
  return records;
}
