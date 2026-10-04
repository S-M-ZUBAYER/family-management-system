export function redactLockedCapsule<T extends { unlock_at: unknown; message: unknown }>(record: T, now = Date.now()): Omit<T, "message"> & { message: T["message"] | null } {
  return new Date(String(record.unlock_at)).getTime() > now ? { ...record, message: null } : record;
}
