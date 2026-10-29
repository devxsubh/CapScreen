"use client";

import { Compass, ExternalLink, KeyRound, LogOut, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useOnboardingTour } from "@/app/contexts/OnboardingTourContext";
import { useDesktop } from "@/lib/desktop";
import { DetailRow, SettingsCard, SettingsHeader } from "@/app/components/settings/SettingsParts";

function initials(name: string): string {
    const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export default function AccountSettingsPage() {
    const { user, signOut } = useAuth();
    const { profile } = useUserProfile();
    const { startTour } = useOnboardingTour();
    const bridge = useDesktop();
    const name = profile.displayName ?? user.email;

    return (
        <div className="space-y-5">
            <SettingsHeader
                title="Profile"
                description="Your CapScreen account controls access to this app. Cap tables, documents and screenings stay on this computer."
            />

            <SettingsCard title="You">
                <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-b from-neutral-700 to-black font-eb-garamond text-2xl text-white shadow-sm">
                        {initials(name)}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate text-lg font-medium text-gray-950">{name}</p>
                        <p className="truncate text-sm text-gray-500">{user.email}</p>
                    </div>
                </div>
                <dl className="mt-5 divide-y divide-gray-100 border-t border-gray-100">
                    <DetailRow label="Organisation">
                        {profile.organisation ?? (
                            <span className="text-gray-400">
                                Not set
                                {bridge ? " — edit in the account portal" : ""}
                            </span>
                        )}
                    </DetailRow>
                    <DetailRow label="Connection">
                        {bridge?.offline ? (
                            <span className="inline-flex items-center gap-1.5 text-amber-700">
                                <WifiOff className="h-3.5 w-3.5" />
                                Offline — CapScreen reconnects automatically
                            </span>
                        ) : bridge ? (
                            <span className="inline-flex items-center gap-1.5 text-emerald-700">
                                <Wifi className="h-3.5 w-3.5" />
                                Signed in
                            </span>
                        ) : (
                            <span className="text-gray-500">Browser dev mode (no account)</span>
                        )}
                    </DetailRow>
                </dl>
            </SettingsCard>

            <div className="grid gap-5 xl:grid-cols-2">
                {bridge && (
                    <SettingsCard
                        title="Password & profile details"
                        icon={<KeyRound className="h-4 w-4" />}
                        description="Name, organisation and password are managed on the CapScreen account portal in your browser."
                        aside={
                            <Button variant="outline" size="sm" className="rounded-lg" onClick={() => void bridge.openAccount()}>
                                Open portal <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                        }
                    />
                )}

                <SettingsCard
                    title="Product tour"
                    icon={<Compass className="h-4 w-4" />}
                    description="Walk through startups, screening and the assistant again."
                    aside={
                        <Button variant="outline" size="sm" className="rounded-lg" onClick={() => startTour({ force: true })}>
                            Restart tour
                        </Button>
                    }
                />
            </div>

            {bridge && (
                <SettingsCard
                    title="Sign out"
                    icon={<LogOut className="h-4 w-4" />}
                    description="Your data stays on this computer and is there when you sign back in."
                    tone="danger"
                    aside={
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-red-700 shadow-[0_0_0_1px_rgba(220,38,38,0.25)] hover:bg-red-50 hover:text-red-800"
                            onClick={() => void signOut()}
                        >
                            Sign out
                        </Button>
                    }
                />
            )}
        </div>
    );
}
