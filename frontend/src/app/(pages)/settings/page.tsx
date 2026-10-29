import { redirect } from "next/navigation";

/** Settings always opens on Profile — the sidebar covers every section. */
export default function SettingsIndex() {
    redirect("/settings/account");
}
