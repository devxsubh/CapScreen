"use client";

import { Compass, ExternalLink, KeyRound, LogOut, WifiOff } from "lucide-react";
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
        <div className="space-y-4">
            <SettingsHeader
                title="Account"
                description="Your CapScreen account controls access to this app. Cap tables, documents and screenings stay on this computer."
            />

            <SettingsCard title="Profile">
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-800 font-serif text-lg text-white">
                        {initials(name)}
                    </div>
                    <div className="min-w-0">
                        <p className="truncate font-medium">{name}</p>
                        <p className="truncate text-sm text-gray-500">{user.email}</p>
                    </div>
                </div>
                <dl className="mt-4 divide-y divide-gray-100 border-t border-gray-100">
                    <DetailRow label="Organisation">{profile.organisation ?? "—"}</DetailRow>
                    <DetailRow label="Connection">
                        {bridge?.offline ? (
                            <span className="inline-flex items-center gap-1 text-amber-700">
                                <WifiOff className="h-3.5 w-3.5" /> Offline. CapScreen reconnects automatically.
                            </span>
                        ) : bridge ? (
                            <span className="text-emerald-700">Signed in</span>
                        ) : (
                            <span className="text-gray-500">Browser dev mode (no account)</span>
                        )}
                    </DetailRow>
                </dl>
            </SettingsCard>

            {bridge && (
                <SettingsCard
                    title="Password and profile"
                    icon={<KeyRound className="h-4 w-4 text-gray-400" />}
                    description="Name, organisation and password are managed on the CapScreen account portal."
                    aside={
                        <Button variant="outline" size="sm" onClick={() => void bridge.openAccount()}>
                            Open portal <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                    }
                />
            )}

            <SettingsCard
                title="Product tour"
                icon={<Compass className="h-4 w-4 text-gray-400" />}
                description="Walk through startups, screening and the assistant again."
                aside={
                    <Button variant="outline" size="sm" onClick={() => startTour({ force: true })}>
                        Restart tour
                    </Button>
                }
            />

            {bridge && (
                <SettingsCard
                    title="Sign out"
                    icon={<LogOut className="h-4 w-4 text-gray-400" />}
                    description="Your data stays on this computer and is there when you sign back in."
                    aside={
                        <Button variant="outline" size="sm" onClick={() => void signOut()}>
                            Sign out
                        </Button>
                    }
                />
            )}
        </div>
    );
}
