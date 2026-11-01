"use client";

import { WorkflowList } from "@/features/workflows/components/WorkflowList";

export default function WorkflowsPage() {
    return (
        <div className="flex flex-col h-full min-h-0">
            <WorkflowList />
        </div>
    );
}
