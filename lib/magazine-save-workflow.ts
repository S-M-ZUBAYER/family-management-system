type Payload = { id?: string; code?: string; error?: string; success?: boolean; status?: string; outcomeUnknown?: boolean; cleanupPending?: boolean; auditPending?: boolean };
type Result = { kind: "cancelled" | "saved" | "record-pending" | "article-failed" | "article-unknown" | "cover-cancelled" | "cover-failed" | "cover-unknown" | "cover-pending"; articleId: string | null; payload?: Payload; articleAuditPending?: boolean };
const validId = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export async function saveMagazineWithCover(options: {
  articleId: string | null; hasCover: boolean; validateCover: () => Promise<unknown>;
  persist: (id: string | null) => Promise<Response>; upload: (id: string) => Promise<Response>;
  onPersisted: (id: string) => void;
}): Promise<Result> {
  // Check before creating/editing an article: a bad file must not create a row.
  if (options.hasCover) await options.validateCover();
  let articleId = options.articleId;
  let articleAuditPending = false;
  try {
    const response = await options.persist(articleId);
    if (response.status === 499) return { kind: "cancelled", articleId };
    const payload = await response.json().catch(() => {
      if (!response.ok && response.status >= 400 && response.status < 500) return {};
      throw new Error("Unconfirmed magazine response.");
    }) as Payload;
    if (!response.ok) return { kind: response.status >= 500 || response.status === 408 || payload.outcomeUnknown ? "article-unknown" : "article-failed", articleId, payload };
    if (!payload || typeof payload !== "object" || Array.isArray(payload) || payload.success !== true || payload.outcomeUnknown === true
      || (Object.hasOwn(payload, "auditPending") && typeof payload.auditPending !== "boolean")
      || (response.status !== 202 && payload.auditPending === true)
      || (response.status === 202 && payload.auditPending !== true)
      || (articleId ? ![200,202].includes(response.status) || payload.id !== articleId
        : ![201,202].includes(response.status) || !["draft","pending","published"].includes(String(payload.status)))) return { kind: "article-unknown", articleId, payload };
    articleAuditPending = payload.auditPending === true;
    if (!articleId) articleId = payload.id ?? null;
    if (!validId(articleId)) return { kind: "article-unknown", articleId: null };
  } catch { return { kind: "article-unknown", articleId }; }
  // Immediately checkpoint a confirmed save before a second network operation.
  // Subsequent explicit retries edit this same row instead of creating another.
  options.onPersisted(articleId);
  if (!options.hasCover) return { kind: articleAuditPending ? "record-pending" : "saved", articleId, articleAuditPending };
  try {
    const response = await options.upload(articleId);
    if (response.status === 499) return { kind: "cover-cancelled", articleId, articleAuditPending };
    const payload = await response.json().catch(() => {
      if (!response.ok && response.status >= 400 && response.status < 500) return response.status === 413 ? { code: "MAGAZINE_INVALID_COVER" } : {};
      throw new Error("Unconfirmed cover response.");
    }) as Payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { kind: "cover-unknown", articleId, articleAuditPending };
    if (!response.ok) return { kind: payload.code !== "MAGAZINE_STORAGE_UNAVAILABLE" && (response.status >= 500 || payload.outcomeUnknown) ? "cover-unknown" : "cover-failed", articleId, payload, articleAuditPending };
    if (!validId(payload.id)) return { kind: "cover-unknown", articleId, payload, articleAuditPending };
    if (![201,202].includes(response.status) || (response.status === 202 && payload.cleanupPending !== true && payload.auditPending !== true)) return { kind: "cover-unknown", articleId, payload, articleAuditPending };
    return { kind: response.status === 202 ? "cover-pending" : articleAuditPending ? "record-pending" : "saved", articleId, payload, articleAuditPending };
  } catch { return { kind: "cover-unknown", articleId, articleAuditPending }; }
}
