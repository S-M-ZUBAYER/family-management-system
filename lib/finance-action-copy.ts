type Locale = "bn" | "en";
export function financeErrorCopy(code: unknown, locale: Locale): string | null {
  if (code === "FINANCE_DEBT_OVERPAYMENT") return locale === "bn"
    ? "মোট নিষ্পত্তির পরিমাণ মূল দেনা বা পাওনার বেশি হতে পারে না।"
    : "The total settled amount cannot exceed the principal debt or lending amount.";
  if (code === "FINANCE_DUPLICATE_BUDGET") return locale === "bn"
    ? "এই মাস ও ক্যাটাগরির বাজেট আগে থেকেই আছে। নতুন করে যোগ না করে বিদ্যমান বাজেট সম্পাদনা করুন।"
    : "A budget already exists for this month and category. Edit the existing budget instead.";
  return null;
}
const names = {
  account: ["অ্যাকাউন্ট / ওয়ালেট", "account / wallet"], transaction: ["আয় / ব্যয়", "income / expense"],
  budget: ["মাসিক বাজেট", "monthly budget"], debt: ["দেনা / পাওনা", "debt / lending"],
  bill: ["বিল রিমাইন্ডার", "bill reminder"], goal: ["সঞ্চয়ের লক্ষ্য", "savings goal"],
} as const;

export function financeRecordActionCopy(kind: unknown, method: string, locale: Locale) {
  if (typeof kind !== "string" || !Object.hasOwn(names, kind) || !["POST", "PATCH", "DELETE"].includes(method)) return null;
  const name = names[kind as keyof typeof names][locale === "bn" ? 0 : 1];
  const remove = method === "DELETE";
  return locale === "bn" ? {
    title: remove ? "স্থায়ীভাবে মুছবেন?" : method === "POST" ? "নতুন রেকর্ড যোগ করবেন?" : "পরিবর্তন সংরক্ষণ করবেন?",
    description: remove ? `এই ${name} রেকর্ড স্থায়ীভাবে মুছবেন? এটি ফিরিয়ে আনা যাবে না।` : `${name} রেকর্ড ${method === "POST" ? "যোগ" : "হালনাগাদ"} করবেন?`,
    confirmLabel: remove ? "হ্যাঁ, মুছে ফেলুন" : "হ্যাঁ, সংরক্ষণ করুন", destructive: remove,
    successMessage: `${name} রেকর্ড ${remove ? "স্থায়ীভাবে মুছে ফেলা হয়েছে" : method === "POST" ? "যোগ হয়েছে" : "হালনাগাদ হয়েছে"}।`,
  } : {
    title: remove ? "Delete record permanently?" : method === "POST" ? "Add record?" : "Save changes?",
    description: remove ? `Permanently delete this ${name} record? This cannot be undone.` : `${method === "POST" ? "Add a new" : "Update this"} ${name} record?`,
    confirmLabel: remove ? "Yes, delete" : "Yes, save", destructive: remove,
    successMessage: `${name.charAt(0).toUpperCase()}${name.slice(1)} record ${remove ? "deleted permanently" : method === "POST" ? "added" : "updated"}.`,
  };
}

export function financeStatusActionCopy(body: Record<string, unknown>, method: string, locale: Locale) {
  if (method !== "PATCH") return null;
  if (body.entity === "debt" || body.entity === "goal") {
    const debt = body.entity === "debt";
    return locale === "bn" ? {
      title: "মোট অগ্রগতি হালনাগাদ করবেন?", description: `${debt ? "মোট নিষ্পত্তির" : "মোট সঞ্চিত"} পরিমাণ বদলাবেন? এটি আগের মোট পরিমাণ প্রতিস্থাপন করবে; কোনো টাকা পাঠানো হবে না।`,
      confirmLabel: "হ্যাঁ, হালনাগাদ করুন", destructive: false, successMessage: `${debt ? "মোট নিষ্পত্তির" : "মোট সঞ্চিত"} পরিমাণ হালনাগাদ হয়েছে।`,
    } : {
      title: "Update total progress?", description: `Replace the total ${debt ? "settled" : "saved"} amount? This replaces the previous total; no money will be transferred.`,
      confirmLabel: "Yes, update", destructive: false, successMessage: `Total ${debt ? "settled" : "saved"} amount updated.`,
    };
  }
  const states: Record<string, string> | null = body.entity === "account" ? { active: "সক্রিয়", archived: "আর্কাইভ" }
    : body.entity === "bill" ? { pending: "অপেক্ষমাণ", paid: "পরিশোধিত", skipped: "বাদ দেওয়া" } : null;
  if (!states || typeof body.status !== "string" || !Object.hasOwn(states, body.status)) return null;
  const state = body.status;
  return locale === "bn" ? {
    title: "স্ট্যাটাস পরিবর্তন করবেন?", description: `${body.entity === "bill" ? "বিল" : "অ্যাকাউন্ট"} রেকর্ডের স্ট্যাটাস “${states[state]}” করবেন? কোনো টাকা পাঠানো হবে না।`,
    confirmLabel: "হ্যাঁ, পরিবর্তন করুন", destructive: false, successMessage: `রেকর্ডের স্ট্যাটাস “${states[state]}” করা হয়েছে।`,
  } : {
    title: "Change status?", description: `Set the ${body.entity} record to “${state}”? No money will be transferred.`,
    confirmLabel: "Yes, change status", destructive: false, successMessage: `${body.entity === "bill" ? "Bill" : "Account"} record marked “${state}”.`,
  };
}
