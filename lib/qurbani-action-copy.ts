import type { QurbaniRecordKind } from "@/lib/qurbani-types";

type Locale = "bn" | "en";
type MutationMethod = "POST" | "PATCH" | "DELETE";

const recordNames: Record<QurbaniRecordKind, { bn: string; en: string }> = {
  participant: { bn: "অংশগ্রহণকারী ও শেয়ার", en: "participant and share" },
  animal: { bn: "পশু", en: "animal" },
  transaction: { bn: "লেনদেন", en: "transaction" },
  vendor: { bn: "বিক্রেতা", en: "vendor" },
  schedule: { bn: "সময়সূচি", en: "schedule" },
  task: { bn: "স্বেচ্ছাসেবক কাজ", en: "volunteer task" },
  distribution: { bn: "মাংস বণ্টন", en: "meat distribution" },
};

export function qurbaniRecordActionCopy(kind: unknown, method: string, locale: Locale) {
  if (typeof kind !== "string" || !Object.hasOwn(recordNames, kind) || !["POST", "PATCH", "DELETE"].includes(method)) return null;
  const name = recordNames[kind as QurbaniRecordKind][locale];
  const action = method as MutationMethod;
  const destructive = action === "DELETE";

  if (locale === "bn") {
    return {
      title: destructive ? "স্থায়ীভাবে মুছবেন?" : action === "POST" ? "নতুন রেকর্ড যোগ করবেন?" : "পরিবর্তন সংরক্ষণ করবেন?",
      description: destructive
        ? `এই ${name} রেকর্ড স্থায়ীভাবে মুছবেন? এটি ফিরিয়ে আনা যাবে না।`
        : action === "POST" ? `নতুন ${name} রেকর্ড যোগ করবেন?` : `${name} রেকর্ডের পরিবর্তন সংরক্ষণ করবেন?`,
      confirmLabel: destructive ? "হ্যাঁ, মুছে ফেলুন" : "হ্যাঁ, সংরক্ষণ করুন",
      destructive,
      successMessage: `${name} রেকর্ড ${destructive ? "স্থায়ীভাবে মুছে ফেলা হয়েছে" : action === "POST" ? "যোগ হয়েছে" : "হালনাগাদ হয়েছে"}।`,
    };
  }

  return {
    title: destructive ? "Delete record permanently?" : action === "POST" ? "Add record?" : "Save changes?",
    description: destructive
      ? `Permanently delete this ${name} record? This cannot be undone.`
      : action === "POST" ? `Add a new ${name} record?` : `Save changes to this ${name} record?`,
    confirmLabel: destructive ? "Yes, delete" : "Yes, save",
    destructive,
    successMessage: `${name.charAt(0).toUpperCase()}${name.slice(1)} record ${destructive ? "deleted permanently" : action === "POST" ? "added" : "updated"}.`,
  };
}
