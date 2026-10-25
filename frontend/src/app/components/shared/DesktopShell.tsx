"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Cpu, X } from "lucide-react";
import { useDesktop } from "@/lib/desktop";
import { aiApi } from "@/lib/aiControlCenterApi";

/**
 * Desktop chrome: routes menu/tray/notification clicks, provides the macOS
 * title-bar drag strip, and nudges first-run users to configure a model.
 */
export function DesktopShell({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();
    const bridge = useDesktop();
    const isMac = bridge?.platform === "darwin";
    const [needsModel, setNeedsModel] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (!bridge) return;
        return bridge.onNavigate((route) => router.push(route));
    }, [bridge, router]);

    useEffect(() => {
        let cancelled = false;
        aiApi
            .state()
            .then((s) => {
                if (!cancelled) setNeedsModel(!s.effective.roles.agent || !!s.effective.roles.agent.error);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [pathname]);

    const showBanner = needsModel && !dismissed && !pathname.startsWith("/ai");

    return (
        <>
            {isMac && <div className="h-7 shrink-0 w-full [-webkit-app-region:drag]" aria-hidden />}
            {bridge?.offline && (
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-1.5 text-xs text-gray-600">
                    Working offline — your sign-in is cached on this computer. CapScreen will reconnect automatically.
                </div>
            )}
            {showBanner && (
                <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                    <Cpu className="h-4 w-4 shrink-0" />
                    <span className="flex-1">
                        No AI model is set up yet. Screening works, but the assistant needs a model — run one on this
                        computer or add your own API key.
                    </span>
                    <Link href="/ai" className="rounded-md bg-amber-900 px-3 py-1 text-xs font-medium text-white hover:bg-amber-800">
                        Open AI Control Center
                    </Link>
                    <button type="button" onClick={() => setDismissed(true)} aria-label="Dismiss" className="text-amber-700 hover:text-amber-900">
                        <X className="h-4 w-4" />
                    </button>
                </div>
            )}
            {children}
        </>
    );
}
