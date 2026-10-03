type Locale = "bn" | "en";

const names = {
  household: { bn: "বাসা", en: "household" },
  list: { bn: "বাজারের তালিকা", en: "shopping list" },
  item: { bn: "বাজারের আইটেম", en: "shopping item" },
  bill: { bn: "ইউটিলিটি বিল", en: "utility bill" },
  task: { bn: "শেয়ার্ড কাজ", en: "shared task" },
  contact: { bn: "সেবা যোগাযোগ", en: "service contact" },
  maintenance: { bn: "মেরামতের অনুরোধ", en: "maintenance request" },
} as const;

const statuses = {
  paid: { bn: "পরিশোধিত", en: "paid" },
  skipped: { bn: "এড়িয়ে যাওয়া", en: "skipped" },
  completed: { bn: "সম্পন্ন", en: "completed" },
  in_progress: { bn: "চলমান", en: "in progress" },
  todo: { bn: "করণীয়", en: "to do" },
  approved: { bn: "অনুমোদিত", en: "approved" },
  scheduled: { bn: "নির্ধারিত", en: "scheduled" },
  cancelled: { bn: "বাতিল", en: "cancelled" },
  inactive: { bn: "নিষ্ক্রিয়", en: "inactive" },
  active: { bn: "সক্রিয়", en: "active" },
  purchased: { bn: "কেনা হয়েছে", en: "purchased" },
  needed: { bn: "প্রয়োজন", en: "needed" },
  unavailable: { bn: "অনুপলব্ধ", en: "unavailable" },
  archived: { bn: "আর্কাইভ", en: "archived" },
} as const;

export function householdActionCopy(body: Record<string, unknown>, method: string, locale: Locale) {
  const action = typeof body.action === "string" ? body.action : "";
  const data = typeof body.data === "object" && body.data && !Array.isArray(body.data)
    ? body.data as Record<string, unknown> : {};

  if (method === "POST" && action === "update_status") {
    const entity = data.entity;
    const status = data.status;
    if (typeof entity !== "string" || typeof status !== "string" || !Object.hasOwn(names, entity) || !Object.hasOwn(statuses, status)) return null;
    const name = names[entity as keyof typeof names][locale];
    const value = statuses[status as keyof typeof statuses][locale];
    const locksDeletion = (entity === "bill" && status === "paid") || (entity === "maintenance" && status === "completed");
    return locale === "bn" ? {
      title: locksDeletion ? "চূড়ান্ত স্ট্যাটাস নিশ্চিত করুন" : "স্ট্যাটাস পরিবর্তন করবেন?",
      description: `${name} রেকর্ডের স্ট্যাটাস “${value}” করবেন?${locksDeletion ? " এরপর audit history রক্ষার জন্য এই রেকর্ড স্থায়ীভাবে মুছতে পারবেন না।" : ""}`,
      confirmLabel: "হ্যাঁ, পরিবর্তন করুন",
      destructive: locksDeletion,
      successMessage: `${name} রেকর্ডের স্ট্যাটাস “${value}” করা হয়েছে।`,
    } : {
      title: locksDeletion ? "Confirm final status" : "Change status?",
      description: `Set the ${name} status to “${value}”?${locksDeletion ? " This record cannot be permanently deleted afterward because its audit history must be retained." : ""}`,
      confirmLabel: "Yes, change status",
      destructive: locksDeletion,
      successMessage: `${name.charAt(0).toUpperCase()}${name.slice(1)} status changed to “${value}”.`,
    };
  }

  const kind = method === "POST" && action.startsWith("create_") ? action.slice(7) : body.kind;
  if (typeof kind !== "string" || !Object.hasOwn(names, kind) || !["POST", "PATCH", "DELETE"].includes(method)) return null;
  const name = names[kind as keyof typeof names][locale];
  const deleting = method === "DELETE";
  if (locale === "bn") return {
    title: deleting ? "স্থায়ীভাবে মুছবেন?" : method === "POST" ? "নতুন রেকর্ড যোগ করবেন?" : "পরিবর্তন সংরক্ষণ করবেন?",
    description: deleting ? `এই ${name} রেকর্ড স্থায়ীভাবে মুছবেন? এটি ফিরিয়ে আনা যাবে না।`
      : method === "POST" ? `নতুন ${name} রেকর্ড যোগ করবেন?` : `${name} রেকর্ডের পরিবর্তন সংরক্ষণ করবেন?`,
    confirmLabel: deleting ? "হ্যাঁ, মুছে ফেলুন" : "হ্যাঁ, সংরক্ষণ করুন",
    destructive: deleting,
    successMessage: `${name} রেকর্ড ${deleting ? "স্থায়ীভাবে মুছে ফেলা হয়েছে" : method === "POST" ? "যোগ হয়েছে" : "হালনাগাদ হয়েছে"}।`,
  };
  return {
    title: deleting ? "Delete record permanently?" : method === "POST" ? "Add record?" : "Save changes?",
    description: deleting ? `Permanently delete this ${name} record? This cannot be undone.`
      : method === "POST" ? `Add a new ${name} record?` : `Save changes to this ${name} record?`,
    confirmLabel: deleting ? "Yes, delete" : "Yes, save",
    destructive: deleting,
    successMessage: `${name.charAt(0).toUpperCase()}${name.slice(1)} record ${deleting ? "deleted permanently" : method === "POST" ? "added" : "updated"}.`,
  };
}
