import type { MagazineArticle, MagazineComment, MagazineMedia, MagazinePayload } from "./magazine-types.ts";
import { magazineExportRows } from "./magazine-export.ts";
import { healthTimestamp } from "./health-validation.ts";

export type MagazineSnapshot = {
  family: NonNullable<MagazinePayload["family"]>; viewer: NonNullable<MagazinePayload["viewer"]>;
  articles: MagazineArticle[]; comments: MagazineComment[]; media: MagazineMedia[];
  permissions: { canManage: boolean }; migrationRequired: boolean;
};
export class MagazineReadError extends Error {
  public readonly code: string;
  constructor(code: string) { super(code); this.code = code; this.name = "MagazineReadError"; }
}
const invalid = (): never => { throw new MagazineReadError("MAGAZINE_INVALID_SNAPSHOT"); };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : invalid();

// Successful HTTP is not sufficient: never turn a malformed/partial payload
// into an empty authorized library or enable controls from coerced booleans.
export function magazineReadSnapshot(value: unknown, expectedFamilyId?: string): MagazineSnapshot {
  const row = object(value), family = object(row.family), viewer = object(row.viewer), permissions = object(row.permissions);
  if (typeof family.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(family.id)
    || typeof family.name_bn !== "string" || typeof family.name_en !== "string" || !family.name_bn.trim() || !family.name_en.trim()
    || typeof viewer.displayName !== "string" || typeof viewer.role !== "string" || !["owner", "family_admin", "manager", "member"].includes(viewer.role)
    || typeof permissions.canManage !== "boolean" || typeof row.migrationRequired !== "boolean"
    || !Array.isArray(row.articles) || !Array.isArray(row.comments) || !Array.isArray(row.media)) invalid();
  if (expectedFamilyId && family.id !== expectedFamilyId) throw new MagazineReadError("MAGAZINE_FAMILY_CHANGED");
  const snapshot = row as unknown as MagazineSnapshot;
  if (permissions.canManage !== ["owner", "family_admin", "manager"].includes(String(viewer.role))) invalid();
  try {
    // The established field/link/enum/count validator also rejects orphan and
    // duplicate children. No workbook is built or downloaded during a read.
    magazineExportRows(snapshot.articles, snapshot.comments, snapshot.media, "en");
    for (const article of snapshot.articles) {
      if (typeof article.is_mine !== "boolean" || typeof article.reacted_by_me !== "boolean"
        || !healthTimestamp(article.created_at) || !healthTimestamp(article.updated_at)
        || (article.published_at !== null && !healthTimestamp(article.published_at))) invalid();
    }
    for (const comment of snapshot.comments) if (typeof comment.is_mine !== "boolean" || !healthTimestamp(comment.created_at)) invalid();
    for (const media of snapshot.media) if (!healthTimestamp(media.created_at)) invalid();
    if (snapshot.migrationRequired && (snapshot.articles.length || snapshot.comments.length || snapshot.media.length)) invalid();
  } catch { invalid(); }
  return snapshot;
}

export class MagazineReadGate {
  private generation = 0;
  private controller?: AbortController;
  begin() {
    this.invalidate();
    const generation = this.generation, controller = new AbortController();
    this.controller = controller;
    return { signal: controller.signal, abort: () => controller.abort(), current: () => this.generation === generation };
  }
  invalidate() { this.generation++; this.controller?.abort(); }
}

// Only explicit callers retry GET. No mutation or automatic retry is involved.
// The guard applies after JSON parsing and to errors/finally, even if a fetch
// implementation ignores AbortSignal and completes after unmount/newer reads.
export async function readMagazine(options: {
  gate: MagazineReadGate; request: (init: RequestInit) => Promise<Response>; expectedFamilyId?: string; timeoutMs?: number;
  start: () => void; loaded: (snapshot: MagazineSnapshot) => void; setup: () => void;
  failed: (error: MagazineReadError) => void; settled: () => void;
}): Promise<boolean> {
  const ticket = options.gate.begin(); options.start();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => {};
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new MagazineReadError("MAGAZINE_LOAD_TIMEOUT")); ticket.abort(); }, options.timeoutMs ?? 25000); });
  const aborted = new Promise<never>((_, reject) => { onAbort = () => reject(new MagazineReadError("MAGAZINE_LOAD_FAILED")); ticket.signal.addEventListener("abort", onAbort, { once: true }); });
  try {
    const response = await Promise.race([options.request({ cache: "no-store", signal: ticket.signal }), deadline, aborted]);
    if (!ticket.current()) return false;
    if (response.status === 401 || response.status === 403) throw new MagazineReadError(response.status === 401 ? "MAGAZINE_SIGN_IN_REQUIRED" : "MAGAZINE_ACCESS_DENIED");
    const payload: unknown = await Promise.race([response.json().catch(() => { throw new MagazineReadError(response.ok ? "MAGAZINE_INVALID_SNAPSHOT" : response.status === 413 ? "MAGAZINE_ROW_LIMIT" : "MAGAZINE_BACKEND_UNAVAILABLE"); }), deadline, aborted]);
    if (!ticket.current()) return false;
    const body = object(payload);
    if (response.status === 409 && body.code === "FAMILY_SETUP_REQUIRED") { options.setup(); return false; }
    if (!response.ok) {
      const code = response.status === 401 ? "MAGAZINE_SIGN_IN_REQUIRED" : response.status === 403 ? "MAGAZINE_ACCESS_DENIED"
        : typeof body.code === "string" ? body.code : "MAGAZINE_BACKEND_UNAVAILABLE";
      throw new MagazineReadError(code);
    }
    const snapshot = magazineReadSnapshot(payload, options.expectedFamilyId);
    if (!ticket.current()) return false;
    options.loaded(snapshot); return true;
  } catch (error) {
    if (ticket.current()) options.failed(error instanceof MagazineReadError ? error : new MagazineReadError("MAGAZINE_LOAD_FAILED"));
    return false;
  } finally { clearTimeout(timer); ticket.signal.removeEventListener("abort", onAbort); if (ticket.current()) options.settled(); }
}
