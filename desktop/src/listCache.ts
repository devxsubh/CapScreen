import fs from "fs";
import path from "path";
import { userData } from "./paths";

/**
 * Offline snapshot of the public sanctions lists, so CapScreen can start and
 * screen without internet. Watchman only keeps lists in memory and, when given
 * an initial-data directory, uses it for every refresh — so the shell keeps its
 * own cache and points Watchman at it only when an online start fails.
 *
 * Sources mirror Watchman v1.2.1 (pkg/sources/ofac, pkg/sources/csl_eu).
 */
const OFAC = "https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/";
const EU = "https://webgate.ec.europa.eu/fsd/fsf/public/files/csvFullSanctionsList_1_1/content?token=dG9rZW4tMjAxNw";

export const CACHEABLE_LISTS: Record<string, Array<{ file: string; url: string }>> = {
  us_ofac: ["add.csv", "alt.csv", "sdn.csv", "sdn_comments.csv"].map((file) => ({ file, url: OFAC + file })),
  eu_csl: [{ file: "eu_csl.csv", url: EU }],
};

export type CacheManifest = { lists: Record<string, string> }; // list id → ISO time cached

export const cacheDir = () => userData("watchman", "cache");
const manifestFile = () => path.join(cacheDir(), "manifest.json");

export function readManifest(): CacheManifest {
  try {
    return JSON.parse(fs.readFileSync(manifestFile(), "utf8")) as CacheManifest;
  } catch {
    return { lists: {} };
  }
}

/** Lists from `wanted` that are fully present in the cache. */
export function cachedLists(wanted: string[]): string[] {
  const manifest = readManifest();
  return wanted.filter(
    (id) => manifest.lists[id] && CACHEABLE_LISTS[id]?.every((s) => fs.existsSync(path.join(cacheDir(), s.file))),
  );
}

/**
 * Download fresh copies. Each list is written atomically (all files or none),
 * so a failed download never replaces a good snapshot. Returns lists refreshed.
 */
export async function refreshListCache(wanted: string[]): Promise<string[]> {
  fs.mkdirSync(cacheDir(), { recursive: true });
  const manifest = readManifest();
  const refreshed: string[] = [];
  for (const id of wanted) {
    const sources = CACHEABLE_LISTS[id];
    if (!sources) continue;
    const tmp = fs.mkdtempSync(path.join(cacheDir(), `.${id}-`));
    try {
      for (const { file, url } of sources) {
        const resp = await fetch(url, { signal: AbortSignal.timeout(120_000), headers: { "User-Agent": "CapScreen" } });
        if (!resp.ok) throw new Error(`${file}: HTTP ${resp.status}`);
        const body = Buffer.from(await resp.arrayBuffer());
        if (body.length < 1024) throw new Error(`${file}: unexpectedly small (${body.length} bytes)`);
        fs.writeFileSync(path.join(tmp, file), body);
      }
      for (const { file } of sources) fs.renameSync(path.join(tmp, file), path.join(cacheDir(), file));
      manifest.lists[id] = new Date().toISOString();
      refreshed.push(id);
    } catch (err) {
      console.warn(`[lists] could not refresh ${id} snapshot: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }
  fs.writeFileSync(manifestFile(), JSON.stringify(manifest, null, 2));
  return refreshed;
}
