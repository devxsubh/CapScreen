import Link from "next/link";
import { AppLogo } from "@/components/app-logo";

interface SiteLogoProps {
    size?: "sm" | "md" | "lg" | "xl";
    className?: string;
    animate?: boolean;
    asLink?: boolean;
}

const heights = {
    sm: 24,
    md: 28,
    lg: 40,
    xl: 56,
};

export function SiteLogo({
    size = "md",
    className = "",
    animate = false,
    asLink = false,
}: SiteLogoProps) {
    const landingHref =
        process.env.NODE_ENV === "production"
            ? "/"
            : "http://localhost:3000";

    const logo = (
        <div
            className={`flex items-center ${animate ? "sidebar-fade-in" : ""} ${className}`}
        >
            <AppLogo height={heights[size]} />
        </div>
    );

    if (asLink) {
        return (
            <Link
                href={landingHref}
                className="cursor-pointer hover:opacity-80 transition-opacity inline-flex"
            >
                {logo}
            </Link>
        );
    }

    return logo;
}
