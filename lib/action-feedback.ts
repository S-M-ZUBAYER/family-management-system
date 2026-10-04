import type { AppLocale } from "@/components/locale-provider";

export type ResultState = {
  kind: "success" | "error" | "info";
  title: string;
  message: string;
};

export function resultTitleForLocale(result: ResultState | null, locale: AppLocale): string | undefined {
  if (!result) return undefined;
  if (result.kind === "success" && ["সফল হয়েছে", "Completed successfully"].includes(result.title)) {
    return locale === "bn" ? "সফল হয়েছে" : "Completed successfully";
  }
  return result.title;
}

export function repeatsMutationFeedback(last: { kind: ResultState["kind"]; message: string; at: number } | null, next: ResultState, now: number): boolean {
  return Boolean(last && now - last.at >= 0 && now - last.at < 10000 &&
    (last.message === next.message || (last.kind === "success" && next.kind === "success")));
}

export function mutationResponseResult(status: number, message: string, locale: AppLocale): ResultState {
  if (status === 202) {
    return {
      kind: "info",
      title: locale === "bn" ? "কিছু কাজ বাকি আছে" : "Some work is still pending",
      message,
    };
  }

  if (status >= 200 && status < 300) {
    return { kind: "success", title: locale === "bn" ? "সফল হয়েছে" : "Completed successfully", message };
  }

  return { kind: "error", title: locale === "bn" ? "Action ব্যর্থ হয়েছে" : "Action failed", message };
}

export function feedbackResult(message: string, locale: AppLocale): ResultState {
  const normalized = message.toLowerCase();
  const failed = ["হয়নি", "যায়নি", "পাওয়া যায়নি", "সঠিক নয়", "সঠিকভাবে দিন", "সীমা ছাড়িয়েছে", "সঠিক প্রকৃত খরচ দিন", "সঠিক সময়সূচি দিন", "error", "failed", "invalid", "required", "denied", "unable", "unavailable", "exceeds", "cannot", "could not", "not saved", "not updated", "not deleted", "not completed", "enter a valid"]
    .some((word) => normalized.includes(word));
  const informational = ["সম্পন্ন করুন", "অনুমোদনের অপেক্ষায়", "approval-এর অপেক্ষায়", "যোগ দিন", "action cancelled", "no changes were saved", "কভার আপলোড বাতিল", "but the cover upload was cancelled"]
    .some((word) => normalized.includes(word));
  const successful = ["হয়েছে", "সংরক্ষিত", "যোগ হয়েছে", "তৈরি হয়েছে", "সম্পন্ন", "success", "saved", "updated", "deleted", "created", "changed to", "published", "uploaded", "submitted", "sent", "recorded", "added", "completed", "restored"]
    .some((word) => normalized.includes(word));

  if (failed) return { kind: "error", title: locale === "bn" ? "Action সম্পন্ন হয়নি" : "Action not completed", message };
  if (informational) return { kind: "info", title: locale === "bn" ? "পরবর্তী ধাপ প্রয়োজন" : "Next step required", message };
  if (successful) return { kind: "success", title: locale === "bn" ? "সফল হয়েছে" : "Completed successfully", message };
  return { kind: "info", title: locale === "bn" ? "গুরুত্বপূর্ণ তথ্য" : "Important information", message };
}
