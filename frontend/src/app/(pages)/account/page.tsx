import { redirect } from "next/navigation";

/** Old location of account settings. */
export default function AccountRedirect() {
    redirect("/settings/account");
}
