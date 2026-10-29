"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, Archive, Info, ShieldCheck, SlidersHorizontal, Sparkles, User } from "lucide-react";

const NAV = [
    { href: "/settings/account", label: "Account", icon: User },
    { href: "/settings/screening", label: "Screening", icon: SlidersHorizontal },
    { href: "/settings/sanctions", label: "Sanctions data", icon: ShieldCheck },
    { href: "/settings/data", label: "Backup & audit", icon: Archive },
    { href: "/settings/about", label: "About", icon: Info },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();

    const linkClass = (active: boolean) =>
        `flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
            active ? "bg-gray-100 font-medium text-gray-900" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        }`;

    return (
        <div className="flex h-full flex-col overflow-y-auto">
            <header className="mx-auto w-full max-w-5xl shrink-0 px-4 pt-10 pb-4 sm:px-6">
                <h1 className="text-4xl font-medium font-eb-garamond">Settings</h1>
                <p className="mt-1 text-sm text-gray-500">
                    Everything here is stored on this computer, except your account sign-in.
                </p>
            </header>
            <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pb-16 sm:px-6 md:flex-row md:gap-10">
                <nav aria-label="Settings" className="md:w-52 md:shrink-0">
                    <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 md:sticky md:top-4 md:flex-col md:overflow-visible">
                        {NAV.map(({ href, label, icon: Icon }) => {
                            const active = pathname === href || pathname.startsWith(href + "/");
                            return (
                                <li key={href}>
                                    <Link href={href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
                                        <Icon className="h-4 w-4" />
                                        {label}
                                    </Link>
                                </li>
                            );
                        })}
                        <li className="md:mt-2 md:border-t md:border-gray-100 md:pt-2">
                            <Link href="/ai" className={linkClass(false)}>
                                <Sparkles className="h-4 w-4" />
                                AI models
                                <ArrowUpRight className="h-3.5 w-3.5 text-gray-400" />
                            </Link>
                        </li>
                    </ul>
                </nav>
                <main className="min-w-0 flex-1 md:max-w-3xl">{children}</main>
            </div>
        </div>
    );
}
