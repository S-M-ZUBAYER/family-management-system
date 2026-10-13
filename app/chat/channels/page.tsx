import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { ChatChannelManagement } from "./channel-management";
export const dynamic = "force-dynamic";
export default async function ChannelsPage() {
  await requireChatGPTUser("/chat/channels");
  return <ChatChannelManagement />;
}
