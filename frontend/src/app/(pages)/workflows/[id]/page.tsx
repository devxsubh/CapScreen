"use client";

import { use } from "react";
import { WorkflowEditorPage } from "@/features/workflows/components/WorkflowEditorPage";

interface Props {
    params: Promise<{ id: string }>;
}

export default function Page({ params }: Props) {
    const { id } = use(params);
    return <WorkflowEditorPage workflowId={id} />;
}
