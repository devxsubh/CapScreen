import type {
  EntityScreeningQuery,
  WatchmanAddress,
  WatchmanListInfo,
  WatchmanMatch,
  WatchmanScorePiece,
} from "../../types/screening";
import { getScreeningThresholds } from "./screeningConfig";
import { screeningLog, screeningWarn } from "./screeningLog";
import { watchmanCache, watchmanCacheKey } from "../infra/cache";
import { dedup } from "../infra/requestDedup";

export type {
  WatchmanListInfo,
  WatchmanMatch,
} from "../../types/screening";

const DEFAULT_BASE = "http://localhost:8084";
const LISTINFO_TTL_MS = 2 * 60_000;

let listInfoCache: { data: WatchmanListInfo; at: number } | null = null;

export class WatchmanUnavailableError extends Error {
  constructor(
    message = "Sanctions screening engine (Watchman) is unavailable. Restart CapScreen; if it persists, check logs/watchman.log.",
  ) {
    super(message);
    this.name = "WatchmanUnavailableError";
  }
}

export interface WatchmanSearchOptions {
  altNames?: string[];
  birthDate?: string;
  address?: string;
  country?: string;
  registrationId?: string;
  source?: string;
  limit?: number;
  debug?: boolean;
  requestId?: string;
}

export function getWatchmanBaseUrl(): string {
  return (process.env.WATCHMAN_URL ?? DEFAULT_BASE).replace(/\/$/, "");
}

/** Ping Watchman at startup — logs whether the local sanctions engine is reachable. */
export async function checkWatchmanHealth(): Promise<{
  ok: boolean;
  url: string;
  detail: string;
}> {
  const url = getWatchmanBaseUrl();
  try {
    const resp = await fetch(`${url}/ping`, {
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      const body = (await resp.text()).trim();
      screeningLog("Watchman reachable — sanctions lists loaded", {
        url,
        ping: body || "ok",
        source: "watchman-local",
      });
      return { ok: true, url, detail: body || "ok" };
    }
    screeningWarn("Watchman responded but ping failed", {
      url,
      status: resp.status,
    });
    return { ok: false, url, detail: `HTTP ${resp.status}` };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    screeningWarn(
      "Watchman unreachable — screenings are refused until the sanctions engine is available",
      { url, error: detail },
    );
    return { ok: false, url, detail };
  }
}

/** Fetch loaded sanctions list metadata (GET /v2/listinfo). */
export async function fetchWatchmanListInfo(): Promise<WatchmanListInfo | null> {
  if (listInfoCache && Date.now() - listInfoCache.at < LISTINFO_TTL_MS) {
    return listInfoCache.data;
  }

  const baseUrl = getWatchmanBaseUrl();
  try {
    const resp = await fetch(`${baseUrl}/v2/listinfo`, {
      signal: AbortSignal.timeout(8000),
    });
    if (resp.status === 404) return null;
    if (!resp.ok) {
      screeningWarn("Watchman listinfo HTTP error", { status: resp.status });
      return null;
    }
    const data = (await resp.json()) as Record<string, unknown>;
    const lists =
      data.lists && typeof data.lists === "object" && !Array.isArray(data.lists)
        ? (data.lists as Record<string, number>)
        : {};
    const listHashes =
      data.listHashes &&
      typeof data.listHashes === "object" &&
      !Array.isArray(data.listHashes)
        ? (data.listHashes as Record<string, string>)
        : undefined;

    const info: WatchmanListInfo = {
      lists,
      listHashes,
      startedAt: strOrUndef(data.startedAt),
      endedAt: strOrUndef(data.endedAt),
      version: strOrUndef(data.version),
      fetchedAt: new Date().toISOString(),
    };
    listInfoCache = { data: info, at: Date.now() };
    screeningLog("Watchman listinfo loaded", {
      version: info.version,
      listCount: Object.keys(lists).length,
      totalEntities: Object.values(lists).reduce((a, b) => a + b, 0),
    });
    return info;
  } catch (err) {
    screeningWarn("Watchman listinfo request failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export function entityScreeningQueryFromHints(
  hints: EntityScreeningQuery | undefined,
  requestId?: string,
): EntityScreeningQuery | undefined {
  if (!hints && !requestId) return undefined;
  const query: EntityScreeningQuery = { ...(hints ?? {}) };
  if (requestId) query.requestId = requestId;
  const hasData =
    (query.altNames?.length ?? 0) > 0 ||
    query.birthDate ||
    query.address ||
    query.country ||
    query.registrationId ||
    query.requestId;
  return hasData ? query : undefined;
}

function hintsCacheSuffix(options?: WatchmanSearchOptions): string {
  if (!options) return "";
  const parts: string[] = [];
  if (options.altNames?.length) {
    parts.push(`alt:${[...options.altNames].sort().join("|")}`);
  }
  if (options.birthDate) parts.push(`dob:${options.birthDate}`);
  if (options.address) parts.push(`addr:${options.address}`);
  if (options.country) parts.push(`cty:${options.country}`);
  if (options.registrationId) parts.push(`reg:${options.registrationId}`);
  if (options.source) parts.push(`src:${options.source}`);
  return parts.join(";");
}

export async function searchWatchman(
  name: string,
  type: "person" | "company",
  options: WatchmanSearchOptions = {},
): Promise<WatchmanMatch[]> {
  const suffix = hintsCacheSuffix(options);
  const key = watchmanCacheKey(name, type, suffix);
  const cached = watchmanCache.get(key);
  if (cached !== null) {
    screeningLog("Watchman cache hit", {
      entity: name,
      type,
      matchCount: cached.length,
    });
    return cached;
  }

  return dedup(key, () => fetchFromWatchman(name, type, key, options));
}

function v2EntityType(type: "person" | "company"): string {
  return type === "person" ? "person" : "business";
}

function v1EntityType(type: "person" | "company"): string {
  return type === "person" ? "individual" : "entity";
}

function appendSearchParams(
  params: URLSearchParams,
  name: string,
  type: "person" | "company",
  options: WatchmanSearchOptions,
  minMatch: number,
  v2: boolean,
): void {
  params.set("name", name);
  if (v2) {
    params.set("type", v2EntityType(type));
    params.set("minMatch", String(minMatch));
    const thresholds = getScreeningThresholds();
    params.set("limit", String(options.limit ?? thresholds.watchmanResultLimit));
    if (options.debug ?? thresholds.watchmanDebug) {
      params.set("debug", "true");
    }
  } else {
    params.set("sdnType", v1EntityType(type));
  }

  if (options.source) params.set("source", options.source);
  if (options.requestId) params.set("requestID", options.requestId);
  for (const alt of options.altNames ?? []) {
    params.append("altNames", alt);
  }
  if (options.birthDate) params.set("birthDate", options.birthDate);
  if (options.address) params.append("address", options.address);
  if (options.country) params.set("country", options.country);
  if (options.registrationId) {
    params.set("gov_business-registration", options.registrationId);
  }
}

async function fetchFromWatchman(
  name: string,
  type: "person" | "company",
  key: string,
  options: WatchmanSearchOptions,
): Promise<WatchmanMatch[]> {
  const baseUrl = getWatchmanBaseUrl();
  const minMatch = getScreeningThresholds().watchmanMinMatch;

  const v2Params = new URLSearchParams();
  appendSearchParams(v2Params, name, type, options, minMatch, true);
  const v1Params = new URLSearchParams();
  appendSearchParams(v1Params, name, type, options, minMatch, false);

  const urls = [
    {
      label: "v2",
      url: `${baseUrl}/v2/search?${v2Params.toString()}`,
    },
    {
      label: "v1",
      url: `${baseUrl}/search?${v1Params.toString()}`,
    },
  ];

  for (const { label, url } of urls) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (resp.status === 404) continue;
      if (!resp.ok) {
        screeningWarn("Watchman HTTP error", {
          entity: name,
          endpoint: label,
          status: resp.status,
        });
        return [];
      }
      const data = (await resp.json()) as Record<string, unknown>;
      const matches = normalizeResponse(data, minMatch);
      if (matches.length > 0) {
        screeningLog("Watchman match (deterministic — from local sanctions lists)", {
          entity: name,
          type,
          endpoint: label,
          matchCount: matches.length,
          topMatch: matches[0].sdnName,
          topScore: `${(matches[0].match * 100).toFixed(0)}%`,
          program: matches[0].programs[0] ?? "n/a",
          sourceList: matches[0].sourceList ?? "n/a",
          source: "watchman-local",
          requestId: options.requestId,
        });
      } else {
        screeningLog("Watchman clear", {
          entity: name,
          type,
          endpoint: label,
          source: "watchman-local",
          requestId: options.requestId,
        });
      }
      watchmanCache.set(key, matches);
      return matches;
    } catch (err) {
      screeningWarn("Watchman request failed", {
        entity: name,
        endpoint: label,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
  }

  screeningWarn("No Watchman response for entity", {
    entity: name,
    type,
    url: baseUrl,
  });
  throw new WatchmanUnavailableError();
}

export async function assertWatchmanAvailable(): Promise<void> {
  const health = await checkWatchmanHealth();
  if (!health.ok) {
    throw new WatchmanUnavailableError(
      `Sanctions data source (Watchman) is unavailable at ${health.url}: ${health.detail}`,
    );
  }
}

function strOrUndef(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}

function programsFrom(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(String).filter((p) => p.length > 0);
}

function parseAddresses(raw: unknown): WatchmanAddress[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: WatchmanAddress[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const a = item as Record<string, unknown>;
    const line1 = strOrUndef(a.line1 ?? a.address1);
    const country = strOrUndef(a.country);
    if (!line1 && !country) continue;
    out.push({
      line1,
      line2: strOrUndef(a.line2 ?? a.address2),
      city: strOrUndef(a.city),
      state: strOrUndef(a.state ?? a.province),
      postalCode: strOrUndef(a.postalCode ?? a.zip),
      country,
    });
  }
  return out.length > 0 ? out : undefined;
}

function parseAffiliations(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      out.push(item);
      continue;
    }
    if (typeof item !== "object" || item === null) continue;
    const a = item as Record<string, unknown>;
    const entityName = strOrUndef(a.entityName ?? a.name);
    const rel = strOrUndef(a.type);
    if (entityName) {
      out.push(rel ? `${entityName} (${rel})` : entityName);
    }
  }
  return out.length > 0 ? out : undefined;
}

function parseCryptoAddresses(raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      out.push(item);
      continue;
    }
    if (typeof item !== "object" || item === null) continue;
    const c = item as Record<string, unknown>;
    const address = strOrUndef(c.address);
    const currency = strOrUndef(c.currency ?? c.type);
    if (address) out.push(currency ? `${currency}:${address}` : address);
  }
  return out.length > 0 ? out : undefined;
}

function parseMatchDetails(raw: unknown): WatchmanScorePiece[] | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const details = raw as Record<string, unknown>;
  const piecesRaw = details.pieces;
  if (!Array.isArray(piecesRaw)) return undefined;
  const pieces: WatchmanScorePiece[] = [];
  for (const item of piecesRaw) {
    if (typeof item !== "object" || item === null) continue;
    const p = item as Record<string, unknown>;
    if (typeof p.score !== "number") continue;
    pieces.push({
      pieceType: String(p.pieceType ?? "unknown"),
      score: p.score,
      weight: typeof p.weight === "number" ? p.weight : 0,
      matched: p.matched === true,
      required: p.required === true ? true : undefined,
      exact: p.exact === true ? true : undefined,
      fieldsCompared:
        typeof p.fieldsCompared === "number" ? p.fieldsCompared : undefined,
    });
  }
  return pieces.length > 0 ? pieces : undefined;
}

function vesselFieldsFromRecord(
  m: Record<string, unknown>,
): Pick<
  WatchmanMatch,
  | "callSign"
  | "vesselType"
  | "tonnage"
  | "grossRegisteredTonnage"
  | "vesselFlag"
  | "vesselOwner"
> {
  const vessel =
    typeof m.vessel === "object" && m.vessel !== null
      ? (m.vessel as Record<string, unknown>)
      : m;
  return {
    callSign: strOrUndef(vessel.callSign),
    vesselType: strOrUndef(vessel.vesselType ?? vessel.type),
    tonnage: strOrUndef(vessel.tonnage),
    grossRegisteredTonnage: strOrUndef(vessel.grossRegisteredTonnage),
    vesselFlag: strOrUndef(vessel.vesselFlag ?? vessel.flag),
    vesselOwner: strOrUndef(vessel.vesselOwner ?? vessel.owner),
  };
}

function parseV2Entity(
  e: Record<string, unknown>,
  minScore: number,
): WatchmanMatch | null {
  const score = typeof e.match === "number" ? e.match : 0;
  if (score < minScore) return null;

  const sdnName = strOrUndef(e.name);
  if (!sdnName) return null;

  const sanctionsInfo =
    typeof e.sanctionsInfo === "object" && e.sanctionsInfo !== null
      ? (e.sanctionsInfo as Record<string, unknown>)
      : null;
  const programs = programsFrom(sanctionsInfo?.programs ?? e.programs);
  const remarks = strOrUndef(sanctionsInfo?.description ?? e.remarks);

  const person =
    typeof e.person === "object" && e.person !== null
      ? (e.person as Record<string, unknown>)
      : null;
  const titles = person?.titles;
  const firstTitle =
    Array.isArray(titles) && titles.length > 0
      ? strOrUndef(titles[0])
      : undefined;

  return {
    sdnName,
    sdnType: strOrUndef(e.entityType) ?? "unknown",
    match: score,
    programs,
    remarks,
    hitSource: "v2",
    entityID: strOrUndef(e.sourceID ?? e.entityID),
    matchedName: strOrUndef(e.matchedName),
    title: firstTitle ?? strOrUndef(e.title),
    sourceList: strOrUndef(e.sourceList),
    sourceID: strOrUndef(e.sourceID),
    entityType: strOrUndef(e.entityType),
    secondarySanctions: sanctionsInfo?.secondary === true,
    addresses: parseAddresses(e.addresses),
    affiliations: parseAffiliations(e.affiliations),
    cryptoAddresses: parseCryptoAddresses(e.cryptoAddresses),
    matchDetails: parseMatchDetails(e.details),
    ...vesselFieldsFromRecord(e),
  };
}

function parseSdnEntry(
  m: Record<string, unknown>,
  minScore: number,
): WatchmanMatch | null {
  const score = typeof m.match === "number" ? m.match : 0;
  if (score < minScore) return null;

  const sdnName = strOrUndef(m.SDNName ?? m.sdnName ?? m.name);
  if (!sdnName) return null;

  return {
    sdnName,
    sdnType: String(m.SDNType ?? m.sdnType ?? m.type ?? ""),
    match: score,
    programs: programsFrom(m.Programs ?? m.program),
    remarks: strOrUndef(m.Remarks ?? m.remarks),
    hitSource: "sdn",
    entityID: strOrUndef(m.entityID),
    matchedName: strOrUndef(m.matchedName),
    title: strOrUndef(m.title),
    callSign: strOrUndef(m.callSign),
    vesselType: strOrUndef(m.vesselType),
    tonnage: strOrUndef(m.tonnage),
    grossRegisteredTonnage: strOrUndef(m.grossRegisteredTonnage),
    vesselFlag: strOrUndef(m.vesselFlag),
    vesselOwner: strOrUndef(m.vesselOwner),
  };
}

function parseAltNameEntry(
  m: Record<string, unknown>,
  parentPrograms: Map<string, string[]>,
  minScore: number,
): WatchmanMatch | null {
  const score = typeof m.match === "number" ? m.match : 0;
  if (score < minScore) return null;

  const alternateName = strOrUndef(m.alternateName ?? m.AlternateName);
  if (!alternateName) return null;

  const entityID = strOrUndef(m.entityID);
  const programs = entityID ? (parentPrograms.get(entityID) ?? []) : [];

  return {
    sdnName: alternateName,
    sdnType: "alias",
    match: score,
    programs,
    remarks: strOrUndef(m.alternateRemarks ?? m.AlternateRemarks),
    hitSource: "altName",
    entityID,
    matchedName: strOrUndef(m.matchedName),
    alternateID: strOrUndef(m.alternateID ?? m.AlternateID),
    alternateType: strOrUndef(m.alternateType ?? m.AlternateType),
    alternateName,
    alternateRemarks: strOrUndef(m.alternateRemarks ?? m.AlternateRemarks),
  };
}

function normalizeResponse(
  data: Record<string, unknown>,
  minScore: number,
): WatchmanMatch[] {
  const entities = Array.isArray(data.entities) ? data.entities : [];
  if (entities.length > 0) {
    const matches: WatchmanMatch[] = [];
    for (const item of entities) {
      if (typeof item !== "object" || item === null) continue;
      const parsed = parseV2Entity(item as Record<string, unknown>, minScore);
      if (parsed) matches.push(parsed);
    }
    return matches.sort((a, b) => b.match - a.match);
  }

  const sdns = Array.isArray(data.SDNs) ? (data.SDNs as unknown[]) : [];
  const altNames = Array.isArray(data.altNames)
    ? (data.altNames as unknown[])
    : [];

  const parentPrograms = new Map<string, string[]>();
  for (const item of sdns) {
    if (typeof item !== "object" || item === null) continue;
    const m = item as Record<string, unknown>;
    const id = strOrUndef(m.entityID);
    if (id) {
      parentPrograms.set(id, programsFrom(m.Programs ?? m.program));
    }
  }

  const matches: WatchmanMatch[] = [];

  for (const item of sdns) {
    if (typeof item !== "object" || item === null) continue;
    const parsed = parseSdnEntry(item as Record<string, unknown>, minScore);
    if (parsed) matches.push(parsed);
  }

  for (const item of altNames) {
    if (typeof item !== "object" || item === null) continue;
    const parsed = parseAltNameEntry(
      item as Record<string, unknown>,
      parentPrograms,
      minScore,
    );
    if (parsed) matches.push(parsed);
  }

  return matches.sort((a, b) => b.match - a.match);
}
