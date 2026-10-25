import fs from "fs";
import { Notification } from "electron";
import { userData } from "./paths";
import type { RuntimeInfo } from "./sidecars";

/**
 * Watches the backend's latest re-screen digest and raises a native
 * notification when background screening finds new flags or review items.
 */
type Digest = { id: string; generatedAt: string; newFlagCount: number; newReviewCount: number; rescreenedCount: number };

const stateFile = () => userData("notify-state.json");

function lastNotified(): string | null {
  try {
    return (JSON.parse(fs.readFileSync(stateFile(), "utf8")) as { digestId?: string }).digestId ?? null;
  } catch {
    return null;
  }
}

export function startNotificationPoller(rt: RuntimeInfo, navigate: (route: string) => void): void {
  let seen = lastNotified();
  const check = async () => {
    try {
      const resp = await fetch(`${rt.backendUrl}/api/portfolio/digest`, {
        headers: { "x-capscreen-token": rt.token },
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) return;
      const d = (await resp.json()) as Partial<Digest> | null;
      if (!d?.id || d.id === seen) return;
      const first = seen === null;
      seen = d.id;
      fs.writeFileSync(stateFile(), JSON.stringify({ digestId: d.id }));
      // Don't replay an old digest the first time the app runs.
      if (first && Date.now() - new Date(d.generatedAt ?? 0).getTime() > 3_600_000) return;

      const flags = d.newFlagCount ?? 0;
      const reviews = d.newReviewCount ?? 0;
      if (!flags && !reviews || !Notification.isSupported()) return;
      const parts = [flags && `${flags} new flagged`, reviews && `${reviews} new for review`].filter(Boolean);
      const n = new Notification({
        title: "Portfolio re-screen: action needed",
        body: `${parts.join(", ")} across ${d.rescreenedCount ?? 0} startups. Click to review.`,
      });
      n.on("click", () => navigate("/startups"));
      n.show();
    } catch {
      /* backend restarting — try next tick */
    }
  };
  setTimeout(() => void check(), 30_000);
  setInterval(() => void check(), 2 * 60_000);
}
