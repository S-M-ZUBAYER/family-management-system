type Locale = "bn" | "en";

const names = {
  fund: { bn: "কল্যাণ তহবিল", en: "welfare fund" },
  contribution: { bn: "অনুদান", en: "contribution" },
  expense: { bn: "ব্যয়", en: "expense" },
  request: { bn: "সহায়তার আবেদন", en: "assistance request" },
  pledge: { bn: "অঙ্গীকার", en: "pledge" },
} as const;

const statuses = {
  active: { bn: "সক্রিয়", en: "active" },
  paused: { bn: "স্থগিত", en: "paused" },
  closed: { bn: "বন্ধ", en: "closed" },
  approved: { bn: "অনুমোদিত", en: "approved" },
  rejected: { bn: "প্রত্যাখ্যাত", en: "rejected" },
  refunded: { bn: "ফেরত দেওয়া", en: "refunded" },
  paid: { bn: "পরিশোধিত", en: "paid" },
  under_review: { bn: "পর্যালোচনাধীন", en: "under review" },
  disbursed: { bn: "বিতরণ করা", en: "disbursed" },
  cancelled: { bn: "বাতিল", en: "cancelled" },
  completed: { bn: "সম্পন্ন", en: "completed" },
} as const;

export function welfareActionCopy(body: Record<string, unknown>, method: string, locale: Locale) {
  const action = typeof body.action === "string" ? body.action : "";
  const data = typeof body.data === "object" && body.data && !Array.isArray(body.data)
    ? body.data as Record<string, unknown> : {};

  if (method === "POST" && action === "update_status") {
    const { entity, status } = data;
    if (typeof entity !== "string" || typeof status !== "string" || !Object.hasOwn(names, entity) || !Object.hasOwn(statuses, status)) return null;
    const name = names[entity as keyof typeof names][locale];
    const value = statuses[status as keyof typeof statuses][locale];
    const final = (entity === "fund" && status === "closed")
      || (entity === "contribution" && ["approved", "rejected", "refunded"].includes(status))
      || (entity === "expense" && ["approved", "rejected", "paid"].includes(status))
      || (entity === "request" && ["approved", "rejected", "disbursed", "cancelled"].includes(status))
      || (entity === "pledge" && ["completed", "cancelled"].includes(status));
    if (locale === "bn") return {
      title: final ? "গুরুত্বপূর্ণ স্ট্যাটাস নিশ্চিত করুন" : "স্ট্যাটাস পরিবর্তন করবেন?",
      description: `${name} রেকর্ডের স্ট্যাটাস “${value}” করবেন?${final ? " এই পরিবর্তনের পরে রেকর্ড সংশোধন বা স্থায়ীভাবে মুছে ফেলা সীমিত হতে পারে; হিসাবের ইতিহাস সংরক্ষিত থাকবে।" : ""}`,
      confirmLabel: "হ্যাঁ, পরিবর্তন করুন",
      destructive: final,
      successMessage: `${name} রেকর্ডের স্ট্যাটাস “${value}” করা হয়েছে।`,
    };
    return {
      title: final ? "Confirm important status" : "Change status?",
      description: `Set the ${name} status to “${value}”?${final ? " Editing or permanently deleting this record may be restricted afterward; its financial history is retained." : ""}`,
      confirmLabel: "Yes, change status",
      destructive: final,
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
