import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ChatMembershipManagement } from "./membership-management";
export const dynamic = "force-dynamic";
export default async function MembersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireChatGPTUser(`/chat/channels/${encodeURIComponent(id)}/members`);
  return <ChatMembershipManagement channelId={id} />;
}
