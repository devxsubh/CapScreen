"use client";

import { useEffect, useState } from "react";

/** Matches Tailwind `md` breakpoint (768px). */
export function useIsMobile(breakpoint = 768): boolean {
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== "undefined" ? window.innerWidth < breakpoint : false,
    );

    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
        const update = () => setIsMobile(mq.matches);
        update();
        mq.addEventListener("change", update);
        return () => mq.removeEventListener("change", update);
    }, [breakpoint]);

    return isMobile;
}
