"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Info, Link2, ShieldCheck, SlidersHorizontal, Cpu, User, type LucideIcon } from "lucide-react";

type NavItem = { href: string; label: string; hint: string; icon: LucideIcon };

const NAV: Array<{ group: string; items: NavItem[] }> = [
    {
        group: "Account",
        items: [{ href: "/settings/account", label: "Profile", hint: "Sign-in, tour, sign out", icon: User }],
    },
    {
        group: "Screening",
        items: [
            { href: "/settings/ai", label: "AI Control", hint: "Models, API keys, local AI", icon: Cpu },
            { href: "/settings/screening", label: "Screening", hint: "Match scores, ownership rules", icon: SlidersHorizontal },
            { href: "/settings/sanctions", label: "Sanctions data", hint: "Lists, versions, re-screening", icon: ShieldCheck },
        ],
    },
    {
        group: "Data",
        items: [
            { href: "/settings/connectors", label: "Connectors", hint: "Carta, Google Drive, registries", icon: Link2 },
            { href: "/settings/data", label: "Backup & audit", hint: "Backups, restore, audit log", icon: Archive },
            { href: "/settings/about", label: "About", hint: "Version, engines, diagnostics", icon: Info },
        ],
    },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

    return (
        <div className="flex h-full min-h-0 flex-col bg-white md:flex-row">
            <aside className="shrink-0 border-b border-gray-200 bg-white md:w-64 md:overflow-y-auto md:border-b-0 md:border-r md:border-black/[0.06]">
                <div className="px-5 pb-3 pt-5 md:pb-4 md:pt-8">
                    <h1 className="font-eb-garamond text-2xl font-medium text-gray-950">Settings</h1>
                    <p className="mt-0.5 hidden text-xs leading-relaxed text-gray-500 md:block">
                        Everything here stays on this computer, except your sign-in.
                    </p>
                </div>

                {/* Narrow windows: one scrollable row of tabs */}
                <nav aria-label="Settings" className="flex gap-1 overflow-x-auto px-3 pb-3 md:hidden">
                    {NAV.flatMap((g) => g.items).map(({ href, label, icon: Icon }) => (
                        <Link
                            key={href}
                            href={href}
                            aria-current={isActive(href) ? "page" : undefined}
                            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                                isActive(href) ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"
                            }`}
                        >
                            <Icon className="h-4 w-4" />
                            {label}
                        </Link>
                    ))}
                </nav>

                {/* Wide windows: grouped list with a one-line hint per page */}
                <nav aria-label="Settings" className="hidden space-y-5 px-3 pb-8 md:block">
                    {NAV.map(({ group, items }) => (
                        <div key={group}>
                            <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-gray-400">{group}</p>
                            <ul className="space-y-0.5">
                                {items.map(({ href, label, hint, icon: Icon }) => {
                                    const active = isActive(href);
                                    return (
                                        <li key={href}>
                                            <Link
                                                href={href}
                                                aria-current={active ? "page" : undefined}
                                                className={`group flex items-center gap-3 rounded-xl px-2 py-2 transition-colors ${
                                                    active ? "bg-gray-100" : "hover:bg-gray-50"
                                                }`}
                                            >
                                                <span
                                                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                                                        active
                                                            ? "bg-gray-900 text-white"
                                                            : "border border-gray-200 bg-white text-gray-500 group-hover:text-gray-800"
                                                    }`}
                                                >
                                                    <Icon className="h-4 w-4" />
                                                </span>
                                                <span className="min-w-0">
                                                    <span className={`block text-sm ${active ? "font-medium text-gray-950" : "text-gray-700"}`}>
                                                        {label}
                                                    </span>
                                                    <span className="block truncate text-xs text-gray-400">{hint}</span>
                                                </span>
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </nav>
            </aside>

            <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                <div className="w-full max-w-[72rem] px-5 py-8 sm:px-8 lg:px-12 lg:py-10">{children}</div>
            </main>
        </div>
    );
}
