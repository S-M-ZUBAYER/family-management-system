import { welfareObject } from "./welfare-validation.ts";
import { welfareDocumentUuid } from "./welfare-document-upload.ts";
import { financeDate, financeMoney } from "./personal-finance-validation.ts";
import { healthTimestamp } from "./health-validation.ts";
import { welfareLedger } from "./welfare-ledger.ts";
import type { WelfarePayload } from "./welfare-types.ts";

export type WelfareSnapshot = Required<Pick<WelfarePayload, "family" | "viewer" | "funds" | "contributions" | "expenses" | "requests" | "pledges" | "documents" | "permissions" | "migrationRequired">> & {
  family: { id: string; name_bn: string; name_en: string }; viewer: { displayName: string; role: string }; scope: { familyId: string; actorId: string };
};
const account = (v: unknown): v is string => typeof v === "string" && !!v && v.length <= 240 && !/[\u0000-\u001f\u007f]/.test(v);
const text = (v: unknown, nullable = false) => v === null && nullable || typeof v === "string" && (nullable || !!v.trim()) && v.length <= 10000;
const date = (v: unknown, nullable = false) => v === null && nullable || typeof v === "string" && financeDate(v) === v;
const stamp = (v: unknown, nullable = false) => v === null && nullable || typeof v === "string" && !!healthTimestamp(v);
const money = (v: unknown) => financeMoney(v) !== undefined && Number(v) >= 0;
const uuid = (v: unknown, nullable = false) => v === null && nullable || welfareDocumentUuid(v);
const oneOf = (v: unknown, values: string[]) => typeof v === "string" && values.includes(v);
const fields = {
  funds: "id name description category target_amount opening_balance status visibility created_at updated_at",
  contributions: "id fund_id contributor_user_id contributor_name amount contribution_date payment_method reference notes status approved_by_name approved_at created_at is_mine",
  expenses: "id fund_id linked_request_id title beneficiary_name category amount expense_date payment_method reference notes status approved_by_name approved_at paid_at created_at",
  requests: "id fund_id requester_user_id requester_name request_type title description requested_amount approved_amount urgency visibility status admin_note reviewed_by_name reviewed_at created_at updated_at is_mine",
  pledges: "id fund_id auth_user_id member_name frequency amount start_date next_due_date status notes created_at updated_at is_mine",
  documents: "id entity_type entity_id document_type title file_name mime_type file_size visibility uploaded_by_name created_at can_view is_mine",
};
const payment = ["cash", "bank", "mobile", "card", "other"];
export function welfareSameScope(a: WelfareSnapshot, b: WelfareSnapshot) {
  return a.scope.familyId === b.scope.familyId && a.scope.actorId === b.scope.actorId && a.viewer.role === b.viewer.role;
}
// Members may read their own contribution/pledge/request to a hidden fund.
// Such history is not a complete hidden-fund ledger: never mix it into the
// visible funds' available balance. Own pledge commitments remain separate.
export function welfareSnapshotLedger(s: Pick<WelfareSnapshot, "funds" | "contributions" | "expenses" | "pledges">) {
  const visible = new Set(s.funds.map(r => r.id));
  return welfareLedger(s.funds, s.contributions.filter(r => visible.has(r.fund_id)), s.expenses.filter(r => visible.has(r.fund_id)), s.pledges);
}
// Reject incomplete/extra-field/private-storage responses instead of coercing
// absent arrays, malformed permissions or invalid money into empty accounts.
export function welfareReadSnapshot(raw: unknown): WelfareSnapshot | null {
  if (!welfareObject(raw) || !welfareObject(raw.family) || !uuid(raw.family.id) || !text(raw.family.name_bn) || typeof raw.family.name_en !== "string"
    || !welfareObject(raw.scope) || raw.scope.familyId !== raw.family.id || !account(raw.scope.actorId) || !welfareObject(raw.viewer) || !text(raw.viewer.displayName) || !oneOf(raw.viewer.role, ["owner", "family_admin", "manager", "member"])
    || typeof raw.migrationRequired !== "boolean" || !welfareObject(raw.permissions) || raw.permissions.canManage !== (raw.viewer.role !== "member")) return null;
  const manager = raw.permissions.canManage === true, actor = raw.scope.actorId;
  const ids: Record<string, Set<string>> = {};
  for (const [section, keys] of Object.entries(fields)) {
    const rows = raw[section]; if (!Array.isArray(rows) || rows.length > 20000 || raw.migrationRequired && rows.length) return null;
    const allowed = new Set(keys.split(" ")); ids[section] = new Set();
    for (const r of rows) {
      if (!welfareObject(r) || Object.keys(r).some(k => !allowed.has(k)) || !welfareDocumentUuid(r.id) || ids[section].has(r.id) || !stamp(r.created_at)) return null;
      ids[section].add(r.id);
      if (["funds", "requests", "pledges"].includes(section) && !stamp(r.updated_at)) return null;
      if (["funds", "requests", "documents"].includes(section) && !oneOf(r.visibility, ["family", "admins"])) return null;
      if (["contributions", "requests", "pledges", "documents"].includes(section) && typeof r.is_mine !== "boolean") return null;
      if (["contributions", "expenses", "requests", "pledges"].includes(section) && !uuid(r.fund_id, section === "requests")) return null;
      if (["contributions", "expenses", "pledges"].includes(section) && !money(r.amount)) return null;
      if (["contributions", "expenses"].includes(section) && (!oneOf(r.payment_method, payment) || !text(r.reference, true) || !text(r.notes, true) || !text(r.approved_by_name, true) || !stamp(r.approved_at, true))) return null;
      if (section === "funds" && (!text(r.name) || !text(r.description, true) || !money(r.target_amount) || !money(r.opening_balance) || !oneOf(r.category, ["general", "emergency", "medical", "education", "charity"]) || !oneOf(r.status, ["active", "paused", "closed"]) || !manager && r.visibility !== "family")) return null;
      if (section === "contributions" && (!text(r.contributor_name) || !(r.contributor_user_id === null || account(r.contributor_user_id)) || r.is_mine !== (r.contributor_user_id === actor) || !date(r.contribution_date) || !oneOf(r.status, ["pending", "approved", "rejected", "refunded"]))) return null;
      if (section === "expenses" && (!text(r.title) || !text(r.beneficiary_name, true) || !uuid(r.linked_request_id, true) || !date(r.expense_date) || !stamp(r.paid_at, true) || !oneOf(r.category, ["medical", "education", "emergency", "charity", "operations", "other"]) || !oneOf(r.status, ["pending", "approved", "paid", "rejected"]))) return null;
      if (section === "requests" && (!account(r.requester_user_id) || r.is_mine !== (r.requester_user_id === actor) || !text(r.requester_name) || !text(r.title) || !text(r.description) || !money(r.requested_amount) || !money(r.approved_amount) || !text(r.admin_note, true) || !text(r.reviewed_by_name, true) || !stamp(r.reviewed_at, true) || !oneOf(r.request_type, ["medical", "education", "emergency", "livelihood", "charity", "other"]) || !oneOf(r.urgency, ["normal", "high", "critical"]) || !oneOf(r.status, ["submitted", "under_review", "approved", "rejected", "disbursed", "cancelled"]))) return null;
      if (section === "pledges" && (!account(r.auth_user_id) || r.is_mine !== (r.auth_user_id === actor) || !text(r.member_name) || !text(r.notes, true) || !date(r.start_date) || !date(r.next_due_date, true) || r.next_due_date !== null && String(r.next_due_date) < String(r.start_date) || !oneOf(r.frequency, ["monthly", "quarterly", "yearly", "one_time"]) || !oneOf(r.status, ["active", "paused", "completed", "cancelled"]) || !manager && !r.is_mine)) return null;
      if (section === "documents" && (!uuid(r.entity_id) || !oneOf(r.entity_type, ["fund", "contribution", "expense", "request"]) || !oneOf(r.document_type, ["receipt", "invoice", "approval", "evidence", "other"]) || !text(r.title) || !text(r.file_name) || !text(r.uploaded_by_name) || !oneOf(r.mime_type, ["image/jpeg", "image/png", "image/webp", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]) || !Number.isSafeInteger(r.file_size) || Number(r.file_size) < 1 || Number(r.file_size) > 12 * 1024 * 1024 || r.can_view !== true || !manager && r.visibility !== "family" && !r.is_mine)) return null;
    }
  }
  const snapshot = raw as WelfareSnapshot;
  for (const r of snapshot.contributions) if (!ids.funds.has(r.fund_id) && (manager || !r.is_mine) || !manager && !r.is_mine && r.status !== "approved") return null;
  for (const r of snapshot.expenses) if (!ids.funds.has(r.fund_id) || !manager && !["approved", "paid"].includes(r.status)) return null;
  for (const r of snapshot.requests) if (r.fund_id !== null && !ids.funds.has(r.fund_id) && (manager || !r.is_mine) || !manager && !r.is_mine && (r.visibility !== "family" || !["approved", "disbursed"].includes(r.status))) return null;
  for (const r of snapshot.pledges) if (!ids.funds.has(r.fund_id) && (manager || !r.is_mine)) return null;
  const parents = { fund: ids.funds, contribution: ids.contributions, expense: ids.expenses, request: ids.requests };
  for (const r of snapshot.documents) if (!parents[r.entity_type].has(r.entity_id)) return null;
  try { welfareLedger(snapshot.funds, snapshot.contributions, snapshot.expenses, snapshot.pledges); } catch { return null; }
  return snapshot;
}
export class WelfareReadError extends Error { readonly code: string; constructor(code: string) { super(code); this.code = code; } }
export class WelfareReadGate {
  private token: { controller: AbortController } | null = null;
  begin() { this.token?.controller.abort(); const t = { controller: new AbortController() }; this.token = t; return t; }
  current(t: { controller: AbortController }) { return this.token === t && !t.controller.signal.aborted; }
  invalidate() { this.token?.controller.abort(); this.token = null; }
}
export async function readWelfare(request: (init: RequestInit) => Promise<Response>, signal?: AbortSignal, timeoutMs = 25000): Promise<WelfareSnapshot> {
  if (signal?.aborted) throw new WelfareReadError("WELFARE_READ_SUPERSEDED");
  const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined; let onAbort = () => {};
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { reject(new WelfareReadError("WELFARE_READ_TIMEOUT")); controller.abort(); }, timeoutMs); });
  const aborted = new Promise<never>((_, reject) => { onAbort = () => { reject(new WelfareReadError("WELFARE_READ_SUPERSEDED")); controller.abort(); }; signal?.addEventListener("abort", onAbort, { once: true }); if (signal?.aborted) onAbort(); });
  try {
    const r = await Promise.race([request({ cache: "no-store", signal: controller.signal }), deadline, aborted]);
    if ([401, 403, 413].includes(r.status)) throw new WelfareReadError(r.status === 401 ? "WELFARE_READ_SIGN_IN" : r.status === 413 ? "WELFARE_ROW_LIMIT" : "WELFARE_READ_ACCESS");
    const raw: unknown = await Promise.race([r.json(), deadline, aborted]);
    if (r.status === 409) throw new WelfareReadError(welfareObject(raw) && raw.code === "FAMILY_SETUP_REQUIRED" ? "WELFARE_READ_SETUP" : "WELFARE_READ_CONTEXT");
    if (!r.ok) throw new WelfareReadError("WELFARE_READ_FAILED");
    const s = welfareReadSnapshot(raw); if (!s) throw new WelfareReadError("WELFARE_READ_INVALID"); return s;
  } catch (e) { throw e instanceof WelfareReadError ? e : new WelfareReadError("WELFARE_READ_FAILED"); }
  finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
}
export function welfareReadCopy(code: unknown, locale: "bn" | "en") {
  const messages: Record<string, [string, string]> = {
    WELFARE_READ_TIMEOUT: ["কল্যাণ তহবিল লোডের সময় শেষ। পুরোনো তথ্য সরানো হয়েছে; Retry করুন।", "Welfare loading timed out. Previous data was cleared; retry."],
    WELFARE_READ_INVALID: ["সম্পূর্ণ সঠিক কল্যাণ snapshot পাওয়া যায়নি। পরিবর্তন ও export বন্ধ; Retry করুন।", "A complete valid Welfare snapshot was not received. Changes and export are disabled; retry."],
    WELFARE_READ_SIGN_IN: ["কল্যাণ তহবিল দেখতে sign in করুন।", "Sign in to view Welfare data."],
    WELFARE_READ_ACCESS: ["কল্যাণ তহবিল access সক্রিয় নয়। সদস্যপদ যাচাই করুন।", "Welfare access is not active. Check your membership."],
    WELFARE_READ_SETUP: ["আগে family setup বা approval সম্পন্ন করুন।", "Complete family setup or approval first."],
    WELFARE_READ_CONTEXT: ["পরিবার, account বা role বদলেছে। আগের তথ্য দিয়ে export হয়নি; বর্তমান workspace লোড করুন।", "The family, account or role changed. No export used previous data; load the current workspace."],
    WELFARE_READ_SUPERSEDED: ["নতুন read শুরু হয়েছে বা page বন্ধ হয়েছে; আগের ফল ব্যবহার হয়নি।", "A newer read started or the page closed; the obsolete result was not used."],
    WELFARE_ROW_LIMIT: ["একটি কল্যাণ section ২০,০০০ সারি ছাড়িয়েছে। অসম্পূর্ণ হিসাব/export হবে না; Support-এর সহায়তা নিন।", "A Welfare section exceeds 20,000 rows. No partial accounts/export will be used; contact support."],
    WELFARE_READ_FAILED: ["কল্যাণ তহবিল লোড হয়নি। পুরোনো তথ্য সরানো হয়েছে; Retry করুন।", "Welfare data could not be loaded. Previous data was cleared; retry."],
  };
  return (messages[typeof code === "string" ? code : ""] ?? messages.WELFARE_READ_FAILED)[locale === "bn" ? 0 : 1];
}
