type Locale = "bn" | "en";

const names = {
  collection: { bn: "আর্কাইভ সংগ্রহ", en: "archive collection" },
  memory: { bn: "স্মৃতি", en: "memory" },
  vault: { bn: "ভল্ট ডকুমেন্ট", en: "vault document" },
  story: { bn: "ঐতিহ্যের গল্প", en: "heritage story" },
  asset: { bn: "পারিবারিক সম্পদ", en: "family asset" },
  capsule: { bn: "টাইম ক্যাপসুল", en: "time capsule" },
} as const;

const statuses = {
  active: { bn: "সক্রিয়", en: "active" },
  archived: { bn: "আর্কাইভ", en: "archived" },
  draft: { bn: "খসড়া", en: "draft" },
  pending: { bn: "অপেক্ষমাণ", en: "pending" },
  published: { bn: "প্রকাশিত", en: "published" },
  disputed: { bn: "বিতর্কিত", en: "disputed" },
  sold: { bn: "বিক্রি", en: "sold" },
  inactive: { bn: "নিষ্ক্রিয়", en: "inactive" },
  opened: { bn: "খোলা", en: "opened" },
  cancelled: { bn: "বাতিল", en: "cancelled" },
} as const;

export function archiveActionCopy(body: Record<string, unknown>, method: string, locale: Locale) {
  const action = typeof body.action === "string" ? body.action : "";
  const data = typeof body.data === "object" && body.data && !Array.isArray(body.data)
    ? body.data as Record<string, unknown> : {};
  if (method === "POST" && action === "update_status") {
    const { entity, status } = data;
    if (typeof entity !== "string" || typeof status !== "string" || !Object.hasOwn(names, entity) || !Object.hasOwn(statuses, status)) return null;
    const name = names[entity as keyof typeof names][locale];
    const value = statuses[status as keyof typeof statuses][locale];
    const final = entity === "capsule" && ["opened", "cancelled"].includes(status);
    if (locale === "bn") return {
      title: final ? "গুরুত্বপূর্ণ স্ট্যাটাস নিশ্চিত করুন" : "স্ট্যাটাস পরিবর্তন করবেন?",
      description: `${name} রেকর্ডের স্ট্যাটাস “${value}” করবেন?${final ? " এর পরে ক্যাপসুল আর সম্পাদনা করা যাবে না।" : ""}`,
      confirmLabel: "হ্যাঁ, পরিবর্তন করুন",
      destructive: final,
      successMessage: `${name} রেকর্ডের স্ট্যাটাস “${value}” করা হয়েছে।`,
    };
    return {
      title: final ? "Confirm important status" : "Change status?",
      description: `Set the ${name} status to “${value}”?${final ? " The capsule cannot be edited afterward." : ""}`,
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

export function archiveUploadActionCopy(mode: unknown, locale: Locale) {
  if (mode !== "memory" && mode !== "vault") return null;
  const name = mode === "memory" ? { bn: "স্মৃতি", en: "memory" } : { bn: "ভল্ট ডকুমেন্ট", en: "vault document" };
  if (locale === "bn") return {
    title: "ফাইল আপলোড করবেন?",
    description: `${name.bn} ফাইলটি পরিবারের আর্কাইভে আপলোড করবেন? নির্বাচিত গোপনীয়তা অনুযায়ী অনুমোদিত সদস্যরা এটি দেখতে পারবেন।`,
    confirmLabel: "হ্যাঁ, আপলোড করুন",
    destructive: false,
    successMessage: `${name.bn} ফাইল আপলোড হয়েছে।`,
  };
  return {
    title: "Upload file?",
    description: `Upload this ${name.en} file to the family archive? Authorized members can access it according to the selected privacy setting.`,
    confirmLabel: "Yes, upload",
    destructive: false,
    successMessage: `${name.en === "memory" ? "Memory" : "Vault document"} file uploaded.`,
  };
}

export function archiveFileDeleteActionCopy(locale: Locale) {
  if (locale === "bn") return {
    title: "ফাইল ও রেকর্ড স্থায়ীভাবে মুছবেন?",
    description: "এই আর্কাইভ ফাইল এবং এর সঙ্গে যুক্ত স্মৃতি বা ভল্ট রেকর্ড স্থায়ীভাবে মুছে যাবে। এটি ফিরিয়ে আনা যাবে না।",
    confirmLabel: "হ্যাঁ, স্থায়ীভাবে মুছুন",
    destructive: true,
    successMessage: "আর্কাইভ ফাইল এবং সংযুক্ত রেকর্ড মুছে ফেলা হয়েছে।",
  };
  return {
    title: "Delete file and record permanently?",
    description: "This archive file and its linked memory or vault record will be permanently deleted. This cannot be undone.",
    confirmLabel: "Yes, delete permanently",
    destructive: true,
    successMessage: "Archive file and linked record deleted.",
  };
}
