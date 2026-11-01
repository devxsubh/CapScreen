/** Human-readable labels for agent tool calls, while running and when done. */

export function toolCallLabel(name: string): string {
    if (name === "generate_docx") return "Creating document...";
    if (name === "edit_document") return "Editing document...";
    if (name === "read_document") return "Reading document...";
    if (name === "fetch_documents") return "Reading documents...";
    if (name === "find_in_document") return "Searching document...";
    if (name === "replicate_document") return "Copying document...";
    if (name === "read_workflow") return "Loading workflow...";
    if (name === "list_workflows") return "Loading workflows...";
    if (name === "web_search") return "Searching the web…";
    if (name === "list_documents") return "Loading documents...";
    if (name === "screen_cap_table") return "Screening cap table…";
    if (name === "query_screening_data") return "Querying screening data…";
    if (name === "ic_memo") return "Generating IC memo…";
    if (name === "update_plan") return "Planning…";
    if (name === "delegate_task") return "Sub-agent researching…";
    return name ? `Running ${name}...` : "Working...";
}

export function toolCallDoneLabel(name: string): string {
    if (name === "generate_docx") return "Created document";
    if (name === "edit_document") return "Edited document";
    if (name === "read_document") return "Read document";
    if (name === "fetch_documents") return "Read documents";
    if (name === "find_in_document") return "Searched document";
    if (name === "replicate_document") return "Copied document";
    if (name === "read_workflow") return "Loaded workflow";
    if (name === "list_workflows") return "Loaded workflows";
    if (name === "web_search") return "Searched the web";
    if (name === "list_documents") return "Loaded documents";
    if (name === "screen_cap_table") return "Screened cap table";
    if (name === "query_screening_data") return "Queried screening data";
    if (name === "ic_memo") return "Generated IC memo";
    if (name === "update_plan") return "Updated plan";
    if (name === "delegate_task") return "Sub-agent finished";
    return name ? `Ran ${name}` : "Completed";
}
