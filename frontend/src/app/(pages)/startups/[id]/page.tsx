"use client";

import { use } from "react";
import { StartupScreenerPage } from "@/features/startups/components/StartupScreenerPage";

interface Props {
    params: Promise<{ id: string }>;
}

export default function ProjectDetailPage({ params }: Props) {
    const { id } = use(params);
    return <StartupScreenerPage startupId={id} />;
}
