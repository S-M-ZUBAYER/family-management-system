import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageWelfare, getActiveFamilyMembership } from "@/lib/family-access";
import type { WelfareContribution, WelfareDocument, WelfareExpense, WelfareFund, WelfarePledge, WelfareRequest } from "@/lib/welfare-types";
import { collectPaginatedRows, PaginatedRowLimitError } from "@/lib/paginated-rows";
import { BackendNotConfiguredError, isBackendConfigured, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";
import { canMemberSeeWelfareContribution, canMemberSeeWelfareDocument, canMemberSeeWelfareExpense, canMemberSeeWelfareRequest } from "@/lib/welfare-visibility";

type ContributionRow = Omit<WelfareContribution, "is_mine">;
type RequestRow = Omit<WelfareRequest, "is_mine">;
type PledgeRow = Omit<WelfarePledge, "is_mine">;
type DocumentRow = Omit<WelfareDocument, "can_view" | "is_mine"> & { uploaded_by_user_id: string };

async function readAllWelfareRows<T>(table: string, query: URLSearchParams): Promise<T[]> {
  return collectPaginatedRows(
    (offset, limit) => {
      const pageQuery = new URLSearchParams(query);
      pageQuery.set("offset", String(offset));
      pageQuery.set("limit", String(limit));
      return supabaseRest<T[]>(`${table}?${pageQuery}`);
    },
    { pageSize: 500, maxRows: 20000 },
  );
}

export function welfareErrorResponse(error: unknown, label: string) {
  if (error instanceof PaginatedRowLimitError) return Response.json({ code: "WELFARE_ROW_LIMIT", maxRows: error.maxRows, error: `Welfare history exceeds ${error.maxRows} rows in one section. No partial data was shown; contact support for a paged export.` }, { status: 413 });
  if (error instanceof BackendNotConfiguredError) return Response.json({ error: "PostgreSQL connection configured নয়।" }, { status: 503 });
  if (error instanceof SupabaseRequestError) {
    if (/WELFARE_DOCUMENTS_ATTACHED/.test(error.message)) return Response.json({ code: "WELFARE_DOCUMENTS_ATTACHED", error: "Remove this draft record's documents before deleting the record." }, { status: 409 });
    if (/WELFARE_DOCUMENT_FINALIZED/.test(error.message)) return Response.json({ code: "WELFARE_DOCUMENT_FINALIZED", error: "Reviewed, closed, or paid Welfare evidence cannot be permanently deleted." }, { status: 409 });
    if (/WELFARE_DOCUMENT_PARENT_MISSING/.test(error.message)) return Response.json({ code: "WELFARE_DOCUMENT_PARENT_MISSING", error: "The linked Welfare record no longer exists." }, { status: 409 });
    console.error(label, error.status, error.message);
    return Response.json({ error: "Welfare Fund data সাময়িকভাবে পাওয়া যাচ্ছে না।" }, { status: 502 });
  }
  console.error(label, error);
  return Response.json({ error: "Welfare Fund request সম্পন্ন হয়নি।" }, { status: 500 });
}

export async function GET() {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ code: "FAMILY_SETUP_REQUIRED", error: "প্রথম family setup সম্পন্ন করুন।" }, { status: 409 });
    const canManage = canManageWelfare(membership.role);
    const familyQuery = new URLSearchParams({ select: "id,name_bn,name_en", id: `eq.${membership.family_id}`, limit: "1" });
    const family = (await supabaseRest<Array<{ id: string; name_bn: string; name_en: string }>>(`families?${familyQuery}`))[0];

    let funds: WelfareFund[] = [];
    let contributions: ContributionRow[] = [];
    let expenses: WelfareExpense[] = [];
    let requests: RequestRow[] = [];
    let pledges: PledgeRow[] = [];
    let documents: DocumentRow[] = [];
    let migrationRequired = false;
    try {
      const family_id = `eq.${membership.family_id}`;
      const query = (select: string, order: string) => new URLSearchParams({ select, family_id, order });
      [funds, contributions, expenses, requests, pledges, documents] = await Promise.all([
        readAllWelfareRows<WelfareFund>("welfare_funds", query("id,name,description,category,target_amount,opening_balance,status,visibility,created_at,updated_at", "status.asc,created_at.desc,id.asc")),
        readAllWelfareRows<ContributionRow>("welfare_contributions", query("id,fund_id,contributor_user_id,contributor_name,amount,contribution_date,payment_method,reference,notes,status,approved_by_name,approved_at,created_at", "contribution_date.desc,created_at.desc,id.asc")),
        readAllWelfareRows<WelfareExpense>("welfare_expenses", query("id,fund_id,linked_request_id,title,beneficiary_name,category,amount,expense_date,payment_method,reference,notes,status,approved_by_name,approved_at,paid_at,created_at", "expense_date.desc,created_at.desc,id.asc")),
        readAllWelfareRows<RequestRow>("welfare_requests", query("id,fund_id,requester_user_id,requester_name,request_type,title,description,requested_amount,approved_amount,urgency,visibility,status,admin_note,reviewed_by_name,reviewed_at,created_at,updated_at", "created_at.desc,id.asc")),
        readAllWelfareRows<PledgeRow>("welfare_pledges", query("id,fund_id,auth_user_id,member_name,frequency,amount,start_date,next_due_date,status,notes,created_at,updated_at", "status.asc,next_due_date.asc.nullslast,created_at.desc,id.asc")),
        readAllWelfareRows<DocumentRow>("welfare_documents", query("id,entity_type,entity_id,document_type,title,file_name,mime_type,file_size,visibility,uploaded_by_user_id,uploaded_by_name,created_at", "created_at.desc,id.asc")),
      ]);
    } catch (error) {
      if (error instanceof SupabaseRequestError && /PGRST205|42P01|42703/.test(error.message)) migrationRequired = true;
      else throw error;
    }

    if (!canManage) {
      const visibleFundIds = new Set(funds.filter((item) => item.visibility === "family").map((item) => item.id));
      funds = funds.filter((item) => visibleFundIds.has(item.id));
      contributions = contributions.filter((item) => canMemberSeeWelfareContribution(item, visibleFundIds, user.userId));
      expenses = expenses.filter((item) => canMemberSeeWelfareExpense(item, visibleFundIds));
      requests = requests.filter((item) => canMemberSeeWelfareRequest(item, visibleFundIds, user.userId));
      pledges = pledges.filter((item) => item.auth_user_id === user.userId);
      const visibleEntityIds = {
        fund: visibleFundIds,
        contribution: new Set(contributions.map((item) => item.id)),
        expense: new Set(expenses.map((item) => item.id)),
        request: new Set(requests.map((item) => item.id)),
      };
      documents = documents.filter((item) => canMemberSeeWelfareDocument(item, visibleEntityIds[item.entity_type].has(item.entity_id), user.userId));
    }

    return Response.json({
      family,
      viewer: { displayName: user.displayName, role: membership.role },
      funds,
      contributions: contributions.map((item) => ({ ...item, is_mine: item.contributor_user_id === user.userId })),
      expenses,
      requests: requests.map((item) => ({ ...item, is_mine: item.requester_user_id === user.userId })),
      pledges: pledges.map((item) => ({ ...item, is_mine: item.auth_user_id === user.userId })),
      documents: documents.map(({ uploaded_by_user_id, ...item }) => ({ ...item, can_view: canManage || item.visibility === "family" || uploaded_by_user_id === user.userId, is_mine: uploaded_by_user_id === user.userId })),
      permissions: { canManage },
      migrationRequired,
    });
  } catch (error) {
    return welfareErrorResponse(error, "Unable to load Welfare Fund");
  }
}
