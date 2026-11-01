"use client";

import { createContext, useContext } from "react";

interface SidebarContextValue {
    isSidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    toggleSidebar: () => void;
}

export const SidebarContext = createContext<SidebarContextValue>({
    isSidebarOpen: true,
    setSidebarOpen: () => {},
    toggleSidebar: () => {},
});

export function useSidebar() {
    return useContext(SidebarContext);
}
