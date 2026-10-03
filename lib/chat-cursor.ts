export type ChatCursor = { createdAt: string; id: string | null };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function parseChatCursor(value: string | null): ChatCursor | null {
  if (!value || value.length > 100) return null;
  const separator = value.indexOf("|");
  const createdAt = separator < 0 ? value : value.slice(0, separator);
  const id = separator < 0 ? null : value.slice(separator + 1);
  if (!timestampPattern.test(createdAt) || Number.isNaN(Date.parse(createdAt))) return null;
  if (id !== null && !uuidPattern.test(id)) return null;
  return { createdAt, id };
}

export function formatChatCursor(message: { created_at: string; id: string }) {
  return `${message.created_at}|${message.id}`;
}

export function applyChatCursorFilter(query: URLSearchParams, cursor: ChatCursor) {
  if (cursor.id) {
    query.set("or", `(created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id}))`);
  } else {
    // The initial timestamp-only cursor intentionally overlaps the boundary.
    query.set("created_at", `gte.${cursor.createdAt}`);
  }
}
