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

const statusNames: Record<string, Record<string, { bn: string; en: string }>> = {
  campaign: {
    planning: { bn: "পরিকল্পনা", en: "planning" }, registration: { bn: "রেজিস্ট্রেশন", en: "registration" },
    procurement: { bn: "পশু ক্রয়", en: "procurement" }, slaughter: { bn: "কোরবানির দিন", en: "Qurbani day" },
    distribution: { bn: "বণ্টন", en: "distribution" }, settled: { bn: "হিসাব নিষ্পত্তি", en: "settled" },
    closed: { bn: "বন্ধ", en: "closed" },
  },
  participant: {
    pending: { bn: "অপেক্ষমাণ", en: "pending" }, confirmed: { bn: "নিশ্চিত", en: "confirmed" },
    cancelled: { bn: "বাতিল", en: "cancelled" },
  },
  animal: {
    shortlisted: { bn: "বাছাইকৃত", en: "shortlisted" }, purchased: { bn: "ক্রয় করা", en: "purchased" },
    received: { bn: "গ্রহণ করা", en: "received" }, slaughtered: { bn: "কোরবানি সম্পন্ন", en: "slaughtered" },
    cancelled: { bn: "বাতিল", en: "cancelled" },
  },
  vendor: {
    planned: { bn: "পরিকল্পিত", en: "planned" }, confirmed: { bn: "নিশ্চিত", en: "confirmed" },
    completed: { bn: "সম্পন্ন", en: "completed" }, cancelled: { bn: "বাতিল", en: "cancelled" },
  },
  schedule: {
    scheduled: { bn: "নির্ধারিত", en: "scheduled" }, in_progress: { bn: "চলমান", en: "in progress" },
    completed: { bn: "সম্পন্ন", en: "completed" }, delayed: { bn: "বিলম্বিত", en: "delayed" },
  },
  task: {
    todo: { bn: "করণীয়", en: "to do" }, in_progress: { bn: "চলমান", en: "in progress" },
    completed: { bn: "সম্পন্ন", en: "completed" }, cancelled: { bn: "বাতিল", en: "cancelled" },
  },
};

export function qurbaniStatusActionCopy(entity: unknown, status: unknown, method: string, locale: Locale) {
  if (method !== "PATCH" || typeof entity !== "string" || typeof status !== "string" || !Object.hasOwn(statusNames, entity)) return null;
  const options = statusNames[entity];
  if (!Object.hasOwn(options, status)) return null;
  const name = entity === "campaign" ? { bn: "ক্যাম্পেইন", en: "campaign" } : recordNames[entity as QurbaniRecordKind];
  if (!name) return null;
  const label = options[status][locale];
  const finalizing = entity === "campaign" && ["settled", "closed"].includes(status);

  return locale === "bn" ? {
    title: finalizing ? "চূড়ান্ত স্ট্যাটাস নিশ্চিত করুন" : "স্ট্যাটাস পরিবর্তন করবেন?",
    description: `${name.bn} রেকর্ডের স্ট্যাটাস “${label}” করবেন?${finalizing ? " এই ধাপের পর সাধারণ সম্পাদনা বন্ধ থাকবে।" : ""}`,
    confirmLabel: "হ্যাঁ, পরিবর্তন করুন",
    destructive: finalizing,
    successMessage: `${name.bn} রেকর্ডের স্ট্যাটাস “${label}” করা হয়েছে।`,
  } : {
    title: finalizing ? "Confirm final status" : "Change status?",
    description: `Set the ${name.en} status to “${label}”?${finalizing ? " Ordinary edits will be locked after this step." : ""}`,
    confirmLabel: "Yes, change status",
    destructive: finalizing,
    successMessage: `${name.en.charAt(0).toUpperCase()}${name.en.slice(1)} status changed to “${label}”.`,
  };
}

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
