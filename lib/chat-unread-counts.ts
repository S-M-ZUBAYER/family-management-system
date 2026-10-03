export async function countUnreadChatMessages(
  channels: ReadonlyArray<{ id: string }>,
  receipts: ReadonlyMap<string, { last_read_at: string }>,
  familyId: string,
  userId: string,
  countRows: (path: string) => Promise<number>,
): Promise<Map<string, number>> {
  const countsByChannel = new Map<string, number>();
  for (let offset = 0; offset < channels.length; offset += 8) {
    const batch = channels.slice(offset, offset + 8);
    const counts = await Promise.all(batch.map((channel) => {
      const query = new URLSearchParams({
        select: "id",
        limit: "0",
        family_id: `eq.${familyId}`,
        channel_id: `eq.${channel.id}`,
        auth_user_id: `neq.${userId}`,
      });
      const readAt = receipts.get(channel.id)?.last_read_at;
      if (readAt) query.set("created_at", `gt.${readAt}`);
      return countRows(`chat_messages?${query}`);
    }));
    batch.forEach((channel, index) => countsByChannel.set(channel.id, counts[index]));
  }
  return countsByChannel;
}
