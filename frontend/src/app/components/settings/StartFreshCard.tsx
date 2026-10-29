"use client";

import { useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { desktopDataApi } from "@/lib/desktopDataApi";
import { SettingsCard, StatusLine, type Status } from "./SettingsParts";

/** Erase everything the user added and reopen CapScreen as a new user would see it. */
export function StartFreshCard() {
    const [confirmText, setConfirmText] = useState("");
    const [busy, setBusy] = useState(false);
    const [status, setStatus] = useState<Status>(null);

    const erase = async () => {
        setBusy(true);
        setStatus(null);
        try {
            const r = await desktopDataApi.erase(confirmText);
            // Forget per-computer UI state too (tour, checklist, panel choices) so onboarding starts over.
            try {
                for (const key of Object.keys(localStorage)) {
                    if (key.startsWith("capscreen")) localStorage.removeItem(key);
                }
            } catch {
                // Storage unavailable: nothing to forget.
            }
            setStatus({ ok: true, text: `Erased ${r.deleted} records. A safety copy is in ${r.safetyCopy}. Reloading…` });
            setTimeout(() => window.location.assign("/assistant"), 2500);
        } catch (e) {
            setStatus({ ok: false, text: (e as Error).message });
            setBusy(false);
        }
    };

    return (
        <SettingsCard
            title="Start fresh"
            icon={<RotateCcw className="h-4 w-4" />}
            tone="danger"
            description="Erase every startup, cap table, screening, document, chat, tabular review, custom workflow and the audit log, then reopen CapScreen as a new user. Your sign-in, AI setup and settings are kept. A safety copy of the database and uploaded files is saved in the data folder first."
        >
            <div className="flex flex-wrap items-center gap-2">
                <Input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Type ERASE to confirm"
                    aria-label="Type ERASE to confirm"
                    autoComplete="off"
                    className="h-9 max-w-[14rem]"
                />
                <Button
                    variant="outline"
                    disabled={confirmText !== "ERASE" || busy}
                    onClick={() => void erase()}
                    className="text-red-700 shadow-[0_0_0_1px_rgba(220,38,38,0.25)] hover:bg-red-50 hover:text-red-800"
                >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Erase all data
                </Button>
            </div>
            <StatusLine status={status} />
        </SettingsCard>
    );
}
