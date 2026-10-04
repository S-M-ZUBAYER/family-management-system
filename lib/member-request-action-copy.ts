type Locale = "bn" | "en";

export function memberRequestActionCopy(pathname: string, method: string, body: Record<string, unknown>, locale: Locale) {
  if (!/^\/api\/member-requests\/[^/]+$/.test(pathname) || method !== "PATCH") return null;
  const decision = body.decision;
  if (decision === "approve") return locale === "bn" ? {
    title: "সদস্যপদ অনুমোদন করবেন?",
    description: "এই আবেদনকারী আপনার পরিবারের সদস্যপদ ও নির্ধারিত access পাবেন। আবেদনকারীর পরিচয়, সম্পর্ক এবং requested role যাচাই করুন।",
    confirmLabel: "হ্যাঁ, অনুমোদন করুন",
    destructive: false,
    successMessage: "সদস্যপদ অনুমোদিত হয়েছে।",
  } : {
    title: "Approve family membership?",
    description: "The applicant will receive membership and the assigned access in your family. Verify their identity, relationship, and requested role first.",
    confirmLabel: "Yes, approve",
    destructive: false,
    successMessage: "Family membership approved.",
  };
  if (decision === "reject") return locale === "bn" ? {
    title: "সদস্যপদের আবেদন প্রত্যাখ্যান করবেন?",
    description: "এই আবেদনকারী পরিবারে প্রবেশাধিকার পাবেন না। লেখা কারণটি আবেদনকারীকে দেখানো হবে।",
    confirmLabel: "হ্যাঁ, প্রত্যাখ্যান করুন",
    destructive: true,
    successMessage: "সদস্যপদের আবেদন প্রত্যাখ্যাত হয়েছে।",
  } : {
    title: "Reject membership request?",
    description: "The applicant will not receive family access. The written reason will be shown to them.",
    confirmLabel: "Yes, reject",
    destructive: true,
    successMessage: "Membership request rejected.",
  };
  return null;
}
