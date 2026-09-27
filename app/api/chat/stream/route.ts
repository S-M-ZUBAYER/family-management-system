import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getActiveFamilyMembership } from "@/lib/family-access";
import { getAccessibleChatChannel, loadChatMessages } from "@/lib/family-chat";

const encoder = new TextEncoder();

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return new Response("Sign in is required.", { status: 401 });
  const membership = await getActiveFamilyMembership(user.userId);
  if (!membership) return new Response("Family membership required.", { status: 403 });
  const url = new URL(request.url);
  const channelId = url.searchParams.get("channelId");
  let cursor = url.searchParams.get("after");
  if (!channelId || !/^[0-9a-f-]{36}$/i.test(channelId)) {
    return new Response("Valid channel is required.", { status: 400 });
  }
  const channel = await getAccessibleChatChannel(membership, user.userId, channelId);
  if (!channel) return new Response("Channel not found.", { status: 404 });

  let cancelled = false;
  request.signal.addEventListener("abort", () => {
    cancelled = true;
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: string, value: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));
      };
      emit("ready", { channelId: channel.id });
      try {
        for (let iteration = 0; iteration < 20 && !cancelled; iteration += 1) {
          if (iteration > 0) await wait(2500);
          if (cancelled) break;
          if (cursor) {
            const feed = await loadChatMessages(membership, user, channel.id, cursor);
            if (feed.messages.length) {
              cursor = feed.messages[feed.messages.length - 1].created_at;
              emit("messages", feed);
            }
          }
          if (iteration % 5 === 0) emit("heartbeat", { at: new Date().toISOString() });
        }
      } catch (error) {
        console.error("Family chat stream stopped", error);
        if (!cancelled) emit("recover", { retry: true });
      } finally {
        if (!cancelled) controller.close();
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
