import React from "react";

interface Tab<T extends string> {
    id: T;
    label: string;
}

interface Props<T extends string> {
    tabs: Tab<T>[];
    active: T;
    onChange: (id: T) => void;
    /** Optional content rendered on the right side of the toolbar */
    actions?: React.ReactNode;
}

export function ToolbarTabs<T extends string>({
    tabs,
    active,
    onChange,
    actions,
}: Props<T>) {
    return (
        <div className="flex h-11 shrink-0 items-center border-b border-black/[0.06] px-6 md:px-10">
            <div role="tablist" className="flex flex-1 items-center gap-1">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active === tab.id}
                        onClick={() => onChange(tab.id)}
                        className={`h-7 rounded-md px-2.5 text-[13px] transition-colors ${
                            active === tab.id
                                ? "bg-black/[0.06] font-medium text-gray-950"
                                : "text-gray-500 hover:bg-black/[0.04] hover:text-gray-900"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            {actions && (
                <div className="flex items-center gap-2">{actions}</div>
            )}
        </div>
    );
}
