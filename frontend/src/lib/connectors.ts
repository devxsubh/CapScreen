import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Integrations on the roadmap. Listed in the chat's Files & Sources menu and managed under Settings → Connectors.
 * Logos are the brands' own marks (public/connectors/); Companies House has none we may use (Crown/Royal Arms).
 */
export type Connector = {
    id: string;
    name: string;
    group: "Cap tables" | "Documents" | "Company data";
    description: string;
    logo?: string;
    status: "soon";
};

export const CONNECTORS: Connector[] = [
    { id: "carta", name: "Carta", group: "Cap tables", description: "Import cap tables and ownership changes.", logo: "/connectors/carta.svg", status: "soon" },
    { id: "pulley", name: "Pulley", group: "Cap tables", description: "Import cap tables and stakeholder lists.", logo: "/connectors/pulley.png", status: "soon" },
    { id: "angellist", name: "AngelList", group: "Cap tables", description: "Bring in SPV and fund investor rosters.", logo: "/connectors/angellist.svg", status: "soon" },
    { id: "google-drive", name: "Google Drive", group: "Documents", description: "Attach data-room files and term sheets.", logo: "/connectors/google-drive.svg", status: "soon" },
    { id: "dropbox", name: "Dropbox", group: "Documents", description: "Attach data-room files and term sheets.", logo: "/connectors/dropbox.svg", status: "soon" },
    { id: "sharepoint", name: "SharePoint", group: "Documents", description: "Attach files from your firm's document library.", logo: "/connectors/sharepoint.svg", status: "soon" },
    { id: "opencorporates", name: "OpenCorporates", group: "Company data", description: "Look up company officers and registrations.", logo: "/connectors/opencorporates.png", status: "soon" },
    { id: "companies-house", name: "Companies House", group: "Company data", description: "UK company filings and persons with significant control.", status: "soon" },
];

export const CONNECTOR_GROUPS: Connector["group"][] = ["Cap tables", "Documents", "Company data"];

// Which connectors the chat menu shows: a per-computer display preference, kept in browser storage.
const HIDDEN_KEY = "capscreen.connectors.hidden";
const listeners = new Set<() => void>();

function readHidden(): string {
    try {
        return localStorage.getItem(HIDDEN_KEY) ?? "[]";
    } catch {
        return "[]";
    }
}

function subscribe(onChange: () => void) {
    listeners.add(onChange);
    window.addEventListener("storage", onChange);
    return () => {
        listeners.delete(onChange);
        window.removeEventListener("storage", onChange);
    };
}

/** Connector ids hidden from the chat menu, and a setter shared by every component using it. */
export function useHiddenConnectors(): [Set<string>, (ids: string | string[], hidden: boolean) => void] {
    const raw = useSyncExternalStore(subscribe, readHidden, () => "[]");
    const hidden = useMemo(() => {
        try {
            return new Set<string>(JSON.parse(raw) as string[]);
        } catch {
            return new Set<string>();
        }
    }, [raw]);
    const setHidden = useCallback(
        (ids: string | string[], hide: boolean) => {
            const next = new Set(hidden);
            for (const id of Array.isArray(ids) ? ids : [ids]) {
                if (hide) next.add(id);
                else next.delete(id);
            }
            try {
                localStorage.setItem(HIDDEN_KEY, JSON.stringify([...next]));
            } catch {
                // Storage unavailable (private window, blocked site data): the choice can't be kept.
            }
            listeners.forEach((l) => l());
        },
        [hidden],
    );
    return [hidden, setHidden];
}
