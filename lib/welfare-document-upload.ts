import type { WelfareDocument } from "./welfare-types";

export const welfareDocumentTables = { fund: "welfare_funds", contribution: "welfare_contributions", expense: "welfare_expenses", request: "welfare_requests" } as const;
const documentTypes = ["receipt", "invoice", "approval", "evidence", "other"] as const;
const mimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);

export function welfareDocumentUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function welfareDocumentInput(form: FormData, canManage: boolean) {
  const file = form.get("file"), entityType = form.get("entityType"), entityId = form.get("entityId");
  if (!(file instanceof File) || !mimeTypes.has(file.type)) return { code: "WELFARE_DOCUMENT_FILE_TYPE" } as const;
  if (!file.size || file.size > 12 * 1024 * 1024) return { code: "WELFARE_DOCUMENT_FILE_SIZE" } as const;
  if (typeof entityType !== "string" || !Object.hasOwn(welfareDocumentTables, entityType) || !welfareDocumentUuid(entityId)) return { code: "WELFARE_DOCUMENT_LINK_INVALID" } as const;
  const documentType = form.get("documentType") ?? "other", visibility = form.get("visibility") ?? "admins", title = form.get("title");
  if (typeof documentType !== "string" || !documentTypes.includes(documentType as typeof documentTypes[number]) || !["admins", "family"].includes(String(visibility))) return { code: "WELFARE_DOCUMENT_OPTIONS_INVALID" } as const;
  return { value: {
    file, entityType: entityType as keyof typeof welfareDocumentTables, entityId,
    documentType: documentType as WelfareDocument["document_type"],
    visibility: canManage && visibility === "family" ? "family" as const : "admins" as const,
    title: typeof title === "string" && title.trim() ? title.trim().slice(0, 180) : file.name.slice(0, 180),
  } };
}

export type WelfareDocumentRow = Omit<WelfareDocument, "can_view" | "is_mine"> & { uploaded_by_user_id: string };
export function publicWelfareDocument(row: WelfareDocumentRow, userId: string, canManage: boolean): WelfareDocument {
  // Whitelist rather than spreading a database return=representation response.
  return {
    id: row.id, entity_type: row.entity_type, entity_id: row.entity_id, document_type: row.document_type,
    title: row.title, file_name: row.file_name, mime_type: row.mime_type, file_size: row.file_size,
    visibility: row.visibility, uploaded_by_name: row.uploaded_by_name, created_at: row.created_at,
    is_mine: row.uploaded_by_user_id === userId,
    can_view: canManage || row.visibility === "family" || row.uploaded_by_user_id === userId,
  };
}

type Rest = <T>(path: string, init?: RequestInit) => Promise<T>;
export class WelfareDocumentOutcomeUnknownError extends Error {
  constructor() { super("Upload outcome is uncertain. Reload the documents list and contact support before uploading again."); this.name = "WelfareDocumentOutcomeUnknownError"; }
}
// Metadata must survive an audit outage together with its file. Never compensate
// a committed document by deleting only its object: that creates a broken link.
export async function persistWelfareDocument(
  rest: Rest, storage: { put: () => Promise<unknown>; remove: () => Promise<unknown>; metadataRejected?: (error: unknown) => boolean },
  data: Record<string, unknown>, userId: string, canManage: boolean,
) {
  let committed = false;
  let metadataAttempted = false;
  try {
    await storage.put();
    metadataAttempted = true;
    const [row] = await rest<WelfareDocumentRow[]>("welfare_documents", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(data) });
    if (!row) throw new Error("Welfare document metadata was not returned.");
    committed = true;
    let auditPending = false;
    try {
      await rest("audit_logs", { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({
        family_id: data.family_id, actor_user_id: userId, action: "welfare_document_uploaded", entity_type: "welfare_documents", entity_id: row.id,
        metadata: { module: "welfare", entity_type: row.entity_type, entity_id: row.entity_id },
      }) });
    } catch (error) { auditPending = true; console.error("Welfare document saved; upload audit pending", row.id, error); }
    return { document: publicWelfareDocument(row, userId, canManage), auditPending };
  } catch (error) {
    if (!committed && metadataAttempted && !storage.metadataRejected?.(error)) {
      // A lost/invalid response does not prove that INSERT rolled back. Keep
      // its file for reconciliation instead of possibly breaking a saved link.
      console.error("Welfare upload metadata outcome uncertain; object retained for reconciliation", error);
      throw new WelfareDocumentOutcomeUnknownError();
    }
    if (!committed) await storage.remove().catch(cleanup => console.error("Welfare failed-upload storage cleanup pending", cleanup));
    throw error;
  }
}
