import type { Metadata } from "next";
import { Inter, EB_Garamond } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
});

const ebGaramond = EB_Garamond({
    variable: "--font-eb-garamond",
    subsets: ["latin"],
    weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
    metadataBase: new URL(
        process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    ),
    title: "CapScreen — Compliance Platform",
    description:
        "VC cap-table sanctions screening and legal compliance decision support.",
    icons: {
        icon: [
            {
                url: "/VC%20Fund%20Research%20and%20Tool%20Building.svg",
                type: "image/svg+xml",
            },
            { url: "/favicon.ico" },
        ],
        apple: "/apple-touch-icon.png",
    },
    openGraph: {
        type: "website",
        url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
        siteName: "CapScreen",
        title: "CapScreen — Compliance Platform",
        description:
            "VC cap-table sanctions screening and legal compliance decision support.",
        images: [
            {
                url: "/link-image.jpg",
                width: 1200,
                height: 651,
                alt: "CapScreen",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "CapScreen — Compliance Platform",
        description:
            "VC cap-table sanctions screening and legal compliance decision support.",
        images: ["/link-image.jpg"],
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body
                className={`${inter.variable} ${ebGaramond.variable} font-sans antialiased`}
            >
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
