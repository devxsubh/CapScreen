import { redirect } from "next/navigation";

interface Props {
    params: Promise<{ id: string; chatId: string }>;
}

/** Startup chats now live in the startup workspace; old links land there. */
export default async function StartupAssistantChatRedirect({ params }: Props) {
    const { id } = await params;
    redirect(`/startups/${id}`);
}
