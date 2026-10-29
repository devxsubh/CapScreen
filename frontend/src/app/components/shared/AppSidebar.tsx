"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
    Building2,
    ChevronRight,
    PanelLeftClose,
    Plus,
    Search,
    Settings,
    SquarePen,
    TableProperties,
    Workflow,
    X,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/contexts/UserProfileContext";
import { useChatHistoryContext } from "@/app/contexts/ChatHistoryContext";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { AppLogo } from "@/components/app-logo";
import { SidebarChatItem } from "@/app/components/shared/SidebarChatItem";
import { ModelLogo } from "@/app/components/ai/ProviderLogo";
import { listProjects } from "@/app/lib/capScreenApi";
import { aiApi, type AiHealth } from "@/lib/aiControlCenterApi";
import { useDesktop } from "@/lib/desktop";
import { modelDisplayName } from "@/lib/modelDisplay";
import type { AppChat, AppProject } from "@/app/components/shared/types";

/** The assistant is reached through New chat, so it has no entry here. */
const NAV_ITEMS = [
    { href: "/startups", label: "Startups", icon: Building2, tourId: "nav-startups" },
    { href: "/tabular-reviews", label: "Tabular reviews", icon: TableProperties, tourId: "nav-tabular" },
    { href: "/workflows", label: "Workflows", icon: Workflow, tourId: "nav-workflows" },
] as const;

/** Muted tile colours for startup initials, picked by name so each startup keeps its colour. */
const TILE_COLORS = [
    "bg-sky-100 text-sky-800",
    "bg-emerald-100 text-emerald-800",
    "bg-amber-100 text-amber-800",
    "bg-violet-100 text-violet-800",
    "bg-rose-100 text-rose-800",
    "bg-teal-100 text-teal-800",
];

function tileColor(name: string): string {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return TILE_COLORS[h % TILE_COLORS.length];
}

/** Chats bucketed by age: Today, Yesterday, Previous 7 days, Previous 30 days, Older. */
function groupChats(chats: AppChat[]): Array<{ label: string; chats: AppChat[] }> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const day = 24 * 60 * 60 * 1000;
    const buckets = [
        { label: "Today", from: startOfToday.getTime() },
        { label: "Yesterday", from: startOfToday.getTime() - day },
        { label: "Previous 7 days", from: startOfToday.getTime() - 7 * day },
        { label: "Previous 30 days", from: startOfToday.getTime() - 30 * day },
        { label: "Older", from: -Infinity },
    ].map((b) => ({ ...b, chats: [] as AppChat[] }));
    for (const chat of chats) {
        const t = Date.parse(chat.created_at) || 0;
        (buckets.find((b) => t >= b.from) ?? buckets[buckets.length - 1]).chats.push(chat);
    }
    return buckets.filter((b) => b.chats.length > 0);
}

const AI_DOT: Record<string, string> = {
    ok: "bg-emerald-500",
    warning: "bg-amber-500",
    error: "bg-red-500",
    off: "bg-gray-300",
};

interface AppSidebarProps {
    isOpen: boolean;
    onToggle: () => void;
}

export function AppSidebar({ isOpen, onToggle }: AppSidebarProps) {
    const { user } = useAuth();
    const { profile } = useUserProfile();
    const {
        chats,
        currentChatId,
        hasMoreChats,
        loadMoreChats,
        setCurrentChatId,
    } = useChatHistoryContext();
    const router = useRouter();
    const pathname = usePathname();
    const bridge = useDesktop();
    const mod = bridge?.platform === "darwin" ? "⌘" : "Ctrl ";
    const [shouldAnimate, setShouldAnimate] = useState(false);
    const [projectsCollapsed, setProjectsCollapsed] = useState(false);
    const [historyCollapsed, setHistoryCollapsed] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const [chatQuery, setChatQuery] = useState("");
    const searchRef = useRef<HTMLInputElement>(null);
    const [aiHealth, setAiHealth] = useState<AiHealth | null>(null);
    const [projectNames, setProjectNames] = useState<Record<string, string>>({});
    const [recentProjects, setRecentProjects] = useState<AppProject[] | null>(null);

    useEffect(() => {
        if (!user) return;
        listProjects()
            .then((projects) => {
                const map: Record<string, string> = {};
                for (const p of projects) map[p.id] = p.name;
                setProjectNames(map);
                setRecentProjects(
                    [...projects]
                        .sort(
                            (a, b) =>
                                Date.parse(b.updated_at || b.created_at) -
                                Date.parse(a.updated_at || a.created_at),
                        )
                        .slice(0, 5),
                );
            })
            .catch(() => {
                setProjectNames({});
                setRecentProjects([]);
            });
    }, [user]);

    // The model the assistant uses and whether it's healthy; refreshed when you move between pages.
    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        aiApi
            .health()
            .then((h) => {
                if (!cancelled) setAiHealth(h);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [user, pathname]);

    useEffect(() => {
        if (!isOpen) setShouldAnimate(true);
    }, [isOpen]);

    useEffect(() => {
        if (pathname.startsWith("/assistant/chat/")) {
            const chatId = pathname.split("/").pop() ?? null;
            setCurrentChatId(chatId);
            return;
        }
        if (pathname === "/assistant") {
            setCurrentChatId(null);
        }
    }, [pathname, setCurrentChatId]);

    const newChat = () => {
        setCurrentChatId(null);
        router.push("/assistant");
    };

    const openSearch = () => {
        if (!isOpen) onToggle();
        setHistoryCollapsed(false);
        setSearchOpen(true);
        requestAnimationFrame(() => searchRef.current?.focus());
    };

    // ⌘K / Ctrl+K searches chats; ⇧⌘O / Ctrl+Shift+O starts a new chat.
    const shortcuts = useRef({ newChat, openSearch });
    useEffect(() => {
        shortcuts.current = { newChat, openSearch };
    });
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (!(e.metaKey || e.ctrlKey)) return;
            const key = e.key.toLowerCase();
            if (key === "k" && !e.shiftKey) {
                e.preventDefault();
                shortcuts.current.openSearch();
            } else if (key === "o" && e.shiftKey) {
                e.preventDefault();
                shortcuts.current.newChat();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    const chatGroups = useMemo(() => {
        if (!chats) return null;
        const q = chatQuery.trim().toLowerCase();
        const matches = q
            ? chats.filter((c) =>
                  `${c.title ?? ""} ${c.project_id ? projectNames[c.project_id] ?? "" : ""}`.toLowerCase().includes(q),
              )
            : chats;
        return groupChats(matches);
    }, [chats, chatQuery, projectNames]);

    if (!user) return null;

    const displayName = profile?.displayName || user.email?.split("@")[0] || "";
    const subtitle = profile?.organisation || user.email || "";
    const initials = (profile?.displayName || user.email || "?").charAt(0).toUpperCase();
    const settingsActive = pathname.startsWith("/settings");
    const fadeIn = shouldAnimate ? "sidebar-fade-in" : "";
    const fadeIn2 = shouldAnimate ? "sidebar-fade-in-2" : "";
    const agent = aiHealth?.roles.agent;

    const rowClass = (active: boolean) =>
        `flex h-8 items-center gap-2.5 rounded-md text-left text-[13.5px] transition-colors ${
            active ? "bg-black/[0.06] font-medium text-gray-950" : "text-gray-600 hover:bg-black/[0.04] hover:text-gray-950"
        }`;

    const sectionHeader = (
        label: string,
        collapsed: boolean,
        toggle: () => void,
        action?: { label: string; onClick: () => void },
    ) => (
        <div className={`group/section flex h-7 items-center justify-between pl-3 pr-1.5 ${fadeIn}`}>
            <button
                type="button"
                onClick={toggle}
                aria-expanded={!collapsed}
                className="flex items-center gap-1 text-xs font-medium text-gray-500 transition-colors hover:text-gray-900"
            >
                {label}
                <ChevronRight
                    className={`h-3 w-3 transition-transform ${collapsed ? "" : "rotate-90"} opacity-0 group-hover/section:opacity-100`}
                />
            </button>
            {action && (
                <button
                    type="button"
                    onClick={action.onClick}
                    title={action.label}
                    aria-label={action.label}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 opacity-0 transition hover:bg-black/[0.05] hover:text-gray-900 focus-visible:opacity-100 group-hover/section:opacity-100"
                >
                    <Plus className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    );

    // ── Collapsed: icon rail ────────────────────────────────────────────────
    if (!isOpen) {
        const railButton = "flex h-9 w-9 items-center justify-center rounded-lg transition-colors";
        return (
            <div className="pointer-events-none absolute z-[99] flex h-auto w-14 flex-col items-center md:pointer-events-auto md:relative md:h-full md:border-r md:border-black/[0.06] md:bg-[#f7f7f7]">
                <div className="hidden w-full flex-1 flex-col items-center gap-1 py-3 md:flex">
                    <button type="button" onClick={onToggle} title="Open sidebar" aria-label="Open sidebar" className={`${railButton} mb-2 hover:bg-black/[0.05]`}>
                        <AppLogo variant="mark" height={22} />
                    </button>
                    <div data-tour="nav-assistant">
                        <button type="button" onClick={newChat} title={`New chat (⇧${mod}O)`} aria-label="New chat" className={`${railButton} text-gray-700 hover:bg-black/[0.05]`}>
                            <SquarePen className="h-[18px] w-[18px]" />
                        </button>
                    </div>
                    <button type="button" onClick={openSearch} title={`Search chats (${mod}K)`} aria-label="Search chats" className={`${railButton} text-gray-500 hover:bg-black/[0.05] hover:text-gray-900`}>
                        <Search className="h-[18px] w-[18px]" />
                    </button>
                    <div className="my-1.5 h-px w-6 bg-black/[0.08]" />
                    {NAV_ITEMS.map(({ href, label, icon: Icon, tourId }) => {
                        const active = pathname === href || pathname.startsWith(href + "/");
                        return (
                            <div key={href} data-tour={tourId}>
                                <button
                                    type="button"
                                    onClick={() => router.push(href)}
                                    title={label}
                                    aria-label={label}
                                    aria-current={active ? "page" : undefined}
                                    className={`${railButton} ${active ? "bg-black/[0.06] text-gray-950" : "text-gray-500 hover:bg-black/[0.04] hover:text-gray-900"}`}
                                >
                                    <Icon className="h-[18px] w-[18px]" />
                                </button>
                            </div>
                        );
                    })}
                    <div className="mt-auto flex flex-col items-center gap-2">
                        {agent?.binding && (
                            <Link href="/settings/ai" title={`${modelDisplayName(agent.binding.model)} · ${agent.title}`} className={`${railButton} relative hover:bg-black/[0.05]`}>
                                <ModelLogo model={agent.binding.model} provider={agent.binding.provider} local={agent.binding.local} size={16} />
                                <span className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ring-2 ring-[#f7f7f7] ${AI_DOT[agent.status] ?? AI_DOT.off}`} />
                            </Link>
                        )}
                        <button
                            type="button"
                            onClick={() => router.push("/settings/account")}
                            title={`${displayName} · Settings`}
                            aria-label="Open settings"
                            className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-b from-neutral-700 to-black font-serif text-sm text-white ring-offset-2 ring-offset-[#f7f7f7] transition hover:ring-2 hover:ring-gray-300"
                        >
                            {initials}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Open ────────────────────────────────────────────────────────────────
    return (
        <div className="absolute z-[99] flex h-dvh w-64 flex-col border-r border-black/[0.06] bg-[#f7f7f7] md:relative md:h-full">
            {/* Brand + collapse */}
            <div className="flex h-14 shrink-0 items-center justify-between pl-4 pr-2.5">
                <Link href="/assistant" className={`flex items-center transition-opacity hover:opacity-80 ${fadeIn}`}>
                    <AppLogo height={24} />
                </Link>
                <button
                    type="button"
                    onClick={onToggle}
                    title="Close sidebar"
                    aria-label="Close sidebar"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-black/[0.05] hover:text-gray-900"
                >
                    <PanelLeftClose className="h-4 w-4" />
                </button>
            </div>

            {/* Primary actions */}
            <div className="space-y-0.5 px-2.5">
                <div data-tour="nav-assistant">
                    <button
                        type="button"
                        onClick={newChat}
                        aria-current={pathname === "/assistant" ? "page" : undefined}
                        className="group flex h-9 w-full items-center gap-2.5 rounded-lg bg-white px-3 text-[13.5px] font-medium text-gray-900 shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.06)] transition hover:shadow-[0_2px_6px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.08)]"
                    >
                        <SquarePen className="h-4 w-4 text-gray-700" />
                        <span className={`flex-1 text-left ${fadeIn2}`}>New chat</span>
                        <kbd className="hidden font-sans text-[11px] font-normal text-gray-400 group-hover:inline">⇧{mod}O</kbd>
                    </button>
                </div>
                <button type="button" data-tour="nav-search" onClick={openSearch} className={`${rowClass(false)} group w-full px-3`}>
                    <Search className="h-4 w-4 text-gray-500" />
                    <span className={`flex-1 ${fadeIn2}`}>Search</span>
                    <kbd className="font-sans text-[11px] text-gray-400">{mod}K</kbd>
                </button>
            </div>

            {/* Navigation */}
            <nav aria-label="Main" className="mt-2 space-y-0.5 px-2.5">
                {NAV_ITEMS.map(({ href, label, icon: Icon, tourId }) => {
                    const active = pathname === href || pathname.startsWith(href + "/");
                    return (
                        <div key={href} data-tour={tourId}>
                            <button
                                type="button"
                                onClick={() => router.push(href)}
                                aria-current={active ? "page" : undefined}
                                className={`${rowClass(active)} w-full px-3`}
                            >
                                <Icon className={`h-4 w-4 ${active ? "text-gray-900" : "text-gray-500"}`} />
                                <span className={fadeIn2}>{label}</span>
                            </button>
                        </div>
                    );
                })}
            </nav>

            <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                {/* Startups */}
                <div data-tour="recent-projects" className="px-2.5">
                    {sectionHeader("Startups", projectsCollapsed, () => setProjectsCollapsed((v) => !v), {
                        label: "New startup",
                        onClick: () => router.push("/startups?new=1"),
                    })}
                    {!projectsCollapsed && (
                        <div className={`space-y-px ${fadeIn2}`}>
                            {!recentProjects ? (
                                [55, 70, 45].map((w, i) => (
                                    <div key={i} className="flex h-8 items-center gap-2.5 px-3">
                                        <div className="h-[18px] w-[18px] animate-pulse rounded-[5px] bg-black/[0.06]" />
                                        <div className="h-2.5 animate-pulse rounded bg-black/[0.06]" style={{ width: `${w}%` }} />
                                    </div>
                                ))
                            ) : recentProjects.length === 0 ? (
                                <button
                                    type="button"
                                    onClick={() => router.push("/startups?new=1")}
                                    className="w-full rounded-md px-3 py-1.5 text-left text-[13px] text-gray-500 transition-colors hover:bg-black/[0.04] hover:text-gray-900"
                                >
                                    Create your first startup
                                </button>
                            ) : (
                                <>
                                    {recentProjects.map((project) => {
                                        const active =
                                            pathname === `/startups/${project.id}` ||
                                            pathname.startsWith(`/startups/${project.id}/`);
                                        return (
                                            <button
                                                key={project.id}
                                                type="button"
                                                onClick={() => router.push(`/startups/${project.id}`)}
                                                title={project.name}
                                                aria-current={active ? "page" : undefined}
                                                className={`${rowClass(active)} w-full px-3`}
                                            >
                                                <span
                                                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] text-[10px] font-semibold ${tileColor(project.name)}`}
                                                >
                                                    {project.name.charAt(0).toUpperCase()}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                                            </button>
                                        );
                                    })}
                                    <Link
                                        href="/startups"
                                        className="flex h-7 items-center px-3 text-xs text-gray-400 transition-colors hover:text-gray-800"
                                    >
                                        All startups
                                    </Link>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Chats */}
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="px-2.5">
                        {sectionHeader("Chats", historyCollapsed, () => setHistoryCollapsed((v) => !v), {
                            label: "New chat",
                            onClick: newChat,
                        })}
                    </div>
                    {!historyCollapsed && (
                        <>
                            {(searchOpen || chatQuery) && (
                                <div className="px-2.5 pb-1.5">
                                    <div className="flex h-8 items-center gap-2 rounded-md bg-white px-2.5 shadow-[0_0_0_1px_rgba(0,0,0,0.08)] focus-within:shadow-[0_0_0_1px_rgba(0,0,0,0.2)]">
                                        <Search className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                        <input
                                            ref={searchRef}
                                            value={chatQuery}
                                            onChange={(e) => setChatQuery(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === "Escape") {
                                                    setChatQuery("");
                                                    setSearchOpen(false);
                                                }
                                            }}
                                            onBlur={() => !chatQuery && setSearchOpen(false)}
                                            placeholder="Search chats"
                                            aria-label="Search chats"
                                            className="min-w-0 flex-1 bg-transparent text-[13px] text-gray-800 outline-none placeholder:text-gray-400"
                                        />
                                        <button
                                            type="button"
                                            onMouseDown={(e) => e.preventDefault()}
                                            onClick={() => {
                                                setChatQuery("");
                                                setSearchOpen(false);
                                            }}
                                            aria-label="Close search"
                                            className="text-gray-400 hover:text-gray-700"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>
                                    </div>
                                </div>
                            )}
                            <div className="min-h-0 flex-1 overflow-y-auto pb-2 [scrollbar-width:thin]">
                                {!chatGroups ? (
                                    <div className="space-y-px px-2.5">
                                        {[40, 60, 50, 70, 45].map((w, i) => (
                                            <div key={i} className="flex h-8 items-center px-3">
                                                <div className="h-2.5 animate-pulse rounded bg-black/[0.06]" style={{ width: `${w}%` }} />
                                            </div>
                                        ))}
                                    </div>
                                ) : chatGroups.length === 0 ? (
                                    <p className={`px-5 py-1.5 text-[13px] text-gray-500 ${fadeIn2}`}>
                                        {chatQuery ? "No chats match." : "Your chats will appear here."}
                                    </p>
                                ) : (
                                    <div className={`space-y-3 ${fadeIn2}`}>
                                        {chatGroups.map((group) => (
                                            <div key={group.label}>
                                                <p className="px-5 pb-0.5 text-[11px] font-medium text-gray-400">{group.label}</p>
                                                <div className="space-y-px px-2.5">
                                                    {group.chats.map((chat) => (
                                                        <SidebarChatItem
                                                            key={chat.id}
                                                            chat={chat}
                                                            isActive={currentChatId === chat.id}
                                                            projectName={chat.project_id ? projectNames[chat.project_id] : undefined}
                                                            onSelect={() => {
                                                                setCurrentChatId(chat.id);
                                                                router.push(`/assistant/chat/${chat.id}`);
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                        {hasMoreChats && !chatQuery && (
                                            <div className="px-2.5">
                                                <button
                                                    type="button"
                                                    onClick={loadMoreChats}
                                                    className="flex h-7 w-full items-center rounded-md px-3 text-left text-xs text-gray-400 transition-colors hover:text-gray-800"
                                                >
                                                    Show more
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Footer: AI status + profile */}
            <div className="shrink-0 space-y-1 border-t border-black/[0.06] p-2.5">
                {agent && (
                    <Link
                        href="/settings/ai"
                        data-tour="ai-status"
                        title={agent.binding ? agent.binding.model : agent.title}
                        className="flex h-8 items-center gap-2.5 rounded-md px-3 text-[13px] text-gray-600 transition-colors hover:bg-black/[0.04] hover:text-gray-950"
                    >
                        {agent.binding ? (
                            <ModelLogo model={agent.binding.model} provider={agent.binding.provider} local={agent.binding.local} size={14} />
                        ) : (
                            <span className="h-3.5 w-3.5" />
                        )}
                        <span className="min-w-0 flex-1 truncate">
                            {agent.binding ? modelDisplayName(agent.binding.model) : "Set up AI"}
                        </span>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${AI_DOT[agent.status] ?? AI_DOT.off}`} title={agent.title} />
                    </Link>
                )}
                <button
                    type="button"
                    data-tour="nav-settings"
                    onClick={() => router.push("/settings/account")}
                    aria-label="Open settings"
                    aria-current={settingsActive ? "page" : undefined}
                    className={`group flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors ${
                        settingsActive ? "bg-black/[0.06]" : "hover:bg-black/[0.04]"
                    }`}
                >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-neutral-700 to-black font-serif text-sm text-white">
                        {initials}
                    </span>
                    <span className={`flex min-w-0 flex-1 flex-col ${fadeIn2}`}>
                        <span className="truncate text-[13.5px] font-medium leading-tight text-gray-900">{displayName}</span>
                        <span className="truncate text-[11.5px] leading-tight text-gray-500">{subtitle}</span>
                    </span>
                    <Settings className="h-4 w-4 shrink-0 text-gray-400 transition-colors group-hover:text-gray-700" />
                </button>
            </div>
        </div>
    );
}

