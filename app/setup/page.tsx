import { requireChatGPTUser } from "../chatgpt-auth";
import { FamilySetup } from "./family-setup";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const user = await requireChatGPTUser("/setup");
  return <FamilySetup displayName={user.displayName} email={user.email} />;
}

