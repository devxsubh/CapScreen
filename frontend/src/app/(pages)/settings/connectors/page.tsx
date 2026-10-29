"use client";

import { Landmark } from "lucide-react";
import { CONNECTOR_GROUPS, CONNECTORS, useHiddenConnectors } from "@/lib/connectors";
import { SettingsCard, SettingsHeader, Switch } from "@/app/components/settings/SettingsParts";

export default function ConnectorsSettingsPage() {
    const [hidden, setHidden] = useHiddenConnectors();
    const shown = CONNECTORS.filter((c) => !hidden.has(c.id)).length;

    return (
        <div className="space-y-5">
            <SettingsHeader
                title="Connectors"
                description="Bring cap tables, documents and company data in from the tools you already use. Connectors are on the way; choose which ones appear in the chat's Files & Sources menu."
            />

            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-700">
                    {shown} of {CONNECTORS.length} shown in chat
                </span>
                {hidden.size > 0 && (
                    <button
                        type="button"
                        onClick={() => setHidden([...hidden], false)}
                        className="rounded-full px-2.5 py-1 text-gray-600 underline decoration-gray-300 hover:text-gray-900 hover:decoration-gray-900"
                    >
                        Show all
                    </button>
                )}
            </div>

            {CONNECTOR_GROUPS.map((group) => (
                <SettingsCard key={group} title={group}>
                    <ul className="divide-y divide-gray-100">
                        {CONNECTORS.filter((c) => c.group === group).map((c) => (
                            <li key={c.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white">
                                    {c.logo ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- tiny static logo
                                        <img src={c.logo} alt="" className="h-5 w-5 object-contain" />
                                    ) : (
                                        <Landmark className="h-5 w-5 text-gray-500" />
                                    )}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-medium text-gray-900">{c.name}</span>
                                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                                            Coming soon
                                        </span>
                                    </div>
                                    <p className="mt-0.5 text-xs text-gray-500">{c.description}</p>
                                </div>
                                <label className="flex shrink-0 items-center gap-2 text-xs text-gray-500">
                                    <span className="hidden sm:inline">Show in chat</span>
                                    <Switch
                                        checked={!hidden.has(c.id)}
                                        onChange={(on) => setHidden(c.id, !on)}
                                        label={`Show ${c.name} in the chat menu`}
                                    />
                                </label>
                            </li>
                        ))}
                    </ul>
                </SettingsCard>
            ))}
        </div>
    );
}
