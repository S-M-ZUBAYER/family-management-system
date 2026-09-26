import { env } from "cloudflare:workers";

import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import { BackendNotConfiguredError, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

import type { EventMediaRow, FamilyEventRow } from "../../route";

type RuntimeEnv = Cloudflare.Env & { BUCKET?: R2Bucket };
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  let uploadedKey: string | null = null;
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ error: "Active family membership প্রয়োজন।" }, { status: 403 });
    const bucket = (env as RuntimeEnv).BUCKET;
    if (!bucket) return Response.json({ error: "Media storage configured নয়।" }, { status: 503 });
    const { id } = await context.params;
    const eventQuery = new URLSearchParams({
      select: "id,status",
      id: `eq.${id}`,
      family_id: `eq.${membership.family_id}`,
      limit: "1",
    });
    const event = (await supabaseRest<Array<Pick<FamilyEventRow, "id" | "status">>>(`family_events?${eventQuery}`))[0];
    if (!event || event.status === "draft") return Response.json({ error: "Event পাওয়া যায়নি।" }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get("file");
    const captionValue = formData.get("caption");
    if (!(file instanceof File) || !allowedTypes.has(file.type)) {
      return Response.json({ error: "JPG, PNG, WebP, GIF, MP4 বা WebM file দিন।" }, { status: 400 });
    }
    const maxBytes = file.type.startsWith("video/") ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
    if (!file.size || file.size > maxBytes) {
      return Response.json({ error: file.type.startsWith("video/") ? "Video সর্বোচ্চ ২৫ MB হতে পারবে।" : "ছবি সর্বোচ্চ ৮ MB হতে পারবে।" }, { status: 400 });
    }
    const extension = file.name.includes(".") ? file.name.split(".").pop()!.replace(/[^a-z0-9]/gi, "").toLowerCase() : "bin";
    uploadedKey = `families/${membership.family_id}/events/${id}/${crypto.randomUUID()}.${extension || "bin"}`;
    await bucket.put(uploadedKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { originalName: file.name.slice(0, 180), uploaderId: user.userId },
    });

    const [media] = await supabaseRest<EventMediaRow[]>("event_media", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        family_id: membership.family_id,
        event_id: id,
        storage_key: uploadedKey,
        file_name: file.name.slice(0, 220),
        mime_type: file.type,
        file_size: file.size,
        caption: typeof captionValue === "string" && captionValue.trim() ? captionValue.trim().slice(0, 500) : null,
        uploaded_by_user_id: user.userId,
        uploader_name: user.displayName.slice(0, 180),
      }),
    });
    return Response.json({ media }, { status: 201 });
  } catch (error) {
    if (uploadedKey) await (env as RuntimeEnv).BUCKET?.delete(uploadedKey).catch(() => undefined);
    if (error instanceof BackendNotConfiguredError) return Response.json({ error: "Backend configured নয়।" }, { status: 503 });
    if (error instanceof SupabaseRequestError) {
      console.error("Unable to save event media", error.status, error.message);
      return Response.json({ error: "Media save হয়নি।" }, { status: 502 });
    }
    console.error("Unable to save event media", error);
    return Response.json({ error: "Media upload হয়নি।" }, { status: 500 });
  }
}
