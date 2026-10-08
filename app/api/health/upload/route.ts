import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import type { HealthDocument } from "@/lib/health-types";
import { supabaseRest } from "@/lib/supabase-rest";
import { healthErrorResponse } from "../route";
import { healthDate } from "@/lib/health-validation";

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };
const categories = ["prescription", "lab_report", "imaging", "vaccine", "insurance", "other"];
const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export async function POST(request: Request) {
  let uploadedKey: string | null = null;
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const bucket = (env as RuntimeEnv).BUCKET;
    if (!bucket) return Response.json({ error: "Private document storage configured নয়।" }, { status: 503 });
    const formData = await request.formData();
    const file = formData.get("file");
    const titleValue = formData.get("title");
    const categoryValue = formData.get("category");
    const documentDateValue = formData.get("documentDate");
    const notesValue = formData.get("notes");
    const documentDate = healthDate(documentDateValue);
    if (documentDate === undefined) return Response.json({ code: "HEALTH_INVALID_DATE", error: "সঠিক নথির তারিখ দিন।" }, { status: 400 });
    if (!(file instanceof File) || !allowedTypes.has(file.type)) {
      return Response.json({ error: "JPG, PNG, WebP, PDF বা Word document দিন।" }, { status: 400 });
    }
    if (!file.size || file.size > 12 * 1024 * 1024) {
      return Response.json({ error: "Medical document সর্বোচ্চ ১২ MB হতে পারবে।" }, { status: 400 });
    }
    const title = typeof titleValue === "string" && titleValue.trim()
      ? titleValue.trim().slice(0, 180)
      : file.name.slice(0, 180);
    const category = typeof categoryValue === "string" && categories.includes(categoryValue)
      ? categoryValue
      : "other";
    const extension = file.name.includes(".")
      ? file.name.split(".").pop()!.replace(/[^a-z0-9]/gi, "").toLowerCase()
      : "bin";
    uploadedKey = `families/${membership.family_id}/health/${user.userId}/${crypto.randomUUID()}.${extension || "bin"}`;
    await bucket.put(uploadedKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { originalName: file.name.slice(0, 180), ownerId: user.userId },
    });
    const [document] = await supabaseRest<HealthDocument[]>("health_documents", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        family_id: membership.family_id,
        auth_user_id: user.userId,
        storage_key: uploadedKey,
        file_name: file.name.slice(0, 220),
        mime_type: file.type,
        file_size: file.size,
        category,
        title,
        document_date: documentDate,
        notes: typeof notesValue === "string" && notesValue.trim() ? notesValue.trim().slice(0, 2000) : null,
      }),
    });
    return Response.json({ document }, { status: 201 });
  } catch (error) {
    if (uploadedKey) await (env as RuntimeEnv).BUCKET?.delete(uploadedKey).catch(() => undefined);
    return healthErrorResponse(error, "Unable to upload health document");
  }
}
