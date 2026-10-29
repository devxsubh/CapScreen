"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PanelLeft } from "lucide-react";
import { ChatHistoryProvider } from "@/app/contexts/ChatHistoryContext";
import { SidebarContext } from "@/app/contexts/SidebarContext";
import { OnboardingTourProvider } from "@/app/contexts/OnboardingTourContext";
import { AppSidebar } from "@/app/components/shared/AppSidebar";
import { DesktopShell } from "@/app/components/shared/DesktopShell";

export default function CapScreenLayout({
    children,
}: {
    children: React.ReactNode;
}) {

    const [isSidebarOpenDesktop, setIsSidebarOpenDesktop] = useState(() => {
        if (typeof window !== "undefined") {
            const saved = localStorage.getItem("sidebarOpen");
            return saved !== null ? saved === "true" : true;
        }
        return true;
    });

    const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
        if (typeof window !== "undefined" && window.innerWidth < 768) {
            return false;
        }
        return true;
    });

    useEffect(() => {
        if (typeof window !== "undefined" && window.innerWidth >= 768) {
            localStorage.setItem("sidebarOpen", isSidebarOpen.toString());
        }
    }, [isSidebarOpenDesktop]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const handleResize = () => {
            const isSmall = window.innerWidth < 768;
            if (isSmall && isSidebarOpen) setIsSidebarOpen(false);
            else if (!isSmall && !isSidebarOpen)
                setIsSidebarOpen(isSidebarOpenDesktop);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [isSidebarOpen, isSidebarOpenDesktop]);

    const setSidebarOpen = useCallback((open: boolean) => {
        setIsSidebarOpen(open);
        setIsSidebarOpenDesktop(open);
    }, []);

    const toggleSidebar = useCallback(() => {
        if (typeof window !== "undefined" && window.innerWidth >= 768) {
            setIsSidebarOpenDesktop((prev) => {
                const next = !prev;
                setIsSidebarOpen(next);
                return next;
            });
        } else {
            setIsSidebarOpen((prev) => !prev);
        }
    }, []);

    const sidebarContext = useMemo(
        () => ({
            isSidebarOpen,
            setSidebarOpen,
            toggleSidebar,
        }),
        [isSidebarOpen, setSidebarOpen, toggleSidebar],
    );

    return (
        <ChatHistoryProvider>
            <SidebarContext.Provider value={sidebarContext}>
                <OnboardingTourProvider>
                    <div className="h-dvh bg-white flex flex-col">
                        <DesktopShell>
                        <div className="flex-1 flex overflow-hidden">
                            <AppSidebar
                                isOpen={isSidebarOpen}
                                onToggle={toggleSidebar}
                            />
                            <div className="flex-1 flex flex-col min-h-0 md:overflow-hidden relative w-full">
                                {/* Mobile header */}
                                <div className="flex md:hidden items-center gap-3 px-4 pt-3 pb-1 shrink-0">
                                    <button
                                        onClick={toggleSidebar}
                                        className="flex h-8 w-8 items-center justify-center rounded-full bg-white/70 text-gray-700 shadow-[0_8px_24px_rgba(15,23,42,0.12)] ring-1 ring-white/70 backdrop-blur-md transition-all hover:bg-white/90 active:scale-95"
                                        title="Open sidebar"
                                        aria-label="Open sidebar"
                                    >
                                        <PanelLeft className="h-4 w-4" />
                                    </button>
                                </div>
                                <main className="flex flex-col flex-1 min-h-0 overflow-y-auto md:overflow-hidden w-full h-full">
                                    {children}
                                </main>
                            </div>
                        </div>
                        </DesktopShell>
                    </div>
                </OnboardingTourProvider>
            </SidebarContext.Provider>
        </ChatHistoryProvider>
    );
}
