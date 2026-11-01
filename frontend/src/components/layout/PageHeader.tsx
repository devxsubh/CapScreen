/** Top of a main page: serif title, optional one-line description, actions on the right. Matches the Settings headers. */
export function PageHeader({
    title,
    description,
    actions,
}: {
    title: React.ReactNode;
    description?: React.ReactNode;
    actions?: React.ReactNode;
}) {
    return (
        <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-4 gap-y-3 px-6 pb-4 pt-7 md:px-10">
            <div className="min-w-0">
                <h1 className="font-eb-garamond text-3xl font-medium tracking-tight text-gray-950">{title}</h1>
                {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
            </div>
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
    );
}
