import { getChatGPTUser } from "@/app/chatgpt-auth";
import { canManageHousehold, getActiveFamilyMembership } from "@/lib/family-access";
import type { Household, HouseholdDocument, HouseholdPayload, HouseholdTask, MaintenanceRequest, ServiceContact, ShoppingItem, ShoppingList, UtilityBill } from "@/lib/household-types";
import { BackendNotConfiguredError, isBackendConfigured, SupabaseRequestError, supabaseRest } from "@/lib/supabase-rest";

export function householdErrorResponse(error: unknown, label: string) {
  if (error instanceof BackendNotConfiguredError) return Response.json({ error: "PostgreSQL connection configured নয়।" }, { status: 503 });
  if (error instanceof SupabaseRequestError) { console.error(label, error.status, error.message); return Response.json({ error: "Household data সাময়িকভাবে পাওয়া যাচ্ছে না।" }, { status: 502 }); }
  console.error(label, error); return Response.json({ error: "Household request সম্পন্ন হয়নি।" }, { status: 500 });
}

export async function GET() {
  try {
    if (!isBackendConfigured()) throw new BackendNotConfiguredError();
    const user = await getChatGPTUser();
    if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
    const membership = await getActiveFamilyMembership(user.userId);
    if (!membership) return Response.json({ code: "FAMILY_SETUP_REQUIRED", error: "প্রথম family setup সম্পন্ন করুন।" }, { status: 409 });
    const familyQuery = new URLSearchParams({ select: "id,name_bn,name_en", id: `eq.${membership.family_id}`, limit: "1" });
    const family = (await supabaseRest<Array<{ id: string; name_bn: string; name_en: string }>>(`families?${familyQuery}`))[0];
    let households: Household[] = [], shoppingLists: ShoppingList[] = [], shoppingItems: ShoppingItem[] = [], bills: UtilityBill[] = [], tasks: HouseholdTask[] = [], contacts: ServiceContact[] = [], maintenance: MaintenanceRequest[] = [], documents: HouseholdDocument[] = [];
    let migrationRequired = false;
    try {
      const family_id = `eq.${membership.family_id}`;
      const query = (select: string, order: string) => new URLSearchParams({ select, family_id, order });
      [households, shoppingLists, shoppingItems, bills, tasks, contacts, maintenance, documents] = await Promise.all([
        supabaseRest<Household[]>(`households?${query("id,name,address,city,notes,status,created_at", "status.asc,created_at.asc")}`),
        supabaseRest<ShoppingList[]>(`household_shopping_lists?${query("id,household_id,title,description,budget_amount,needed_by,status,created_by_name,created_at,updated_at", "status.asc,needed_by.asc.nullslast,created_at.desc")}`),
        supabaseRest<ShoppingItem[]>(`household_shopping_items?${query("id,list_id,item_name,category,quantity,unit,estimated_cost,actual_cost,priority,assigned_to_name,status,purchased_by_name,purchased_at,notes,created_at", "status.asc,priority.desc,created_at.desc")}`),
        supabaseRest<UtilityBill[]>(`household_utility_bills?${query("id,household_id,title,category,provider,account_number,billing_month,amount,due_date,recurrence,status,payment_method,reference,paid_by_name,paid_at,notes,created_at,updated_at", "status.asc,due_date.asc,created_at.desc")}`),
        supabaseRest<HouseholdTask[]>(`household_tasks?${query("id,household_id,title,category,assigned_to_name,due_at,recurrence,priority,status,notes,completed_by_name,completed_at,created_at,updated_at", "status.asc,due_at.asc.nullslast,created_at.desc")}`),
        supabaseRest<ServiceContact[]>(`household_service_contacts?${query("id,household_id,name,service_type,phone,alternate_phone,address,rating,is_trusted,notes,status,created_at", "is_trusted.desc,status.asc,service_type.asc,name.asc")}`),
        supabaseRest<MaintenanceRequest[]>(`household_maintenance_requests?${query("id,household_id,service_contact_id,title,description,category,urgency,estimated_cost,actual_cost,assigned_vendor_name,scheduled_at,status,reported_by_name,resolved_by_name,resolved_at,created_at,updated_at", "status.asc,urgency.desc,created_at.desc")}`),
        supabaseRest<HouseholdDocument[]>(`household_documents?${query("id,entity_type,entity_id,document_type,title,file_name,mime_type,file_size,uploaded_by_name,created_at", "created_at.desc")}`),
      ]);
    } catch (error) { if (error instanceof SupabaseRequestError) migrationRequired = true; else throw error; }
    const payload: HouseholdPayload = { family, viewer: { displayName: user.displayName, role: membership.role }, households, shoppingLists, shoppingItems, bills, tasks, contacts, maintenance, documents, permissions: { canManage: canManageHousehold(membership.role) }, migrationRequired };
    return Response.json(payload);
  } catch (error) { return householdErrorResponse(error, "Unable to load household workspace"); }
}
