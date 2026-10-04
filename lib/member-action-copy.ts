type Locale = "bn" | "en";

function memberName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim().slice(0, 80);
  return name || null;
}

export function memberActionCopy(pathname: string, method: string, body: Record<string, unknown>, locale: Locale) {
  if (pathname === "/api/members/photo" && method === "POST") {
    return locale === "bn" ? {
      title: "প্রোফাইল ছবি আপলোড করবেন?",
      description: "নির্বাচিত ছবি সদস্যের প্রোফাইলে যোগ হবে। অনুমোদিত পরিবারের সদস্যরা তাঁদের ডিরেক্টরি-অ্যাক্সেস অনুযায়ী ছবিটি দেখতে পারবেন।",
      confirmLabel: "হ্যাঁ, আপলোড করুন",
      destructive: false,
      successMessage: "প্রোফাইল ছবি আপলোড হয়েছে।",
    } : {
      title: "Upload profile photo?",
      description: "Add the selected photo to this member profile? Authorized family members can see it according to their directory access.",
      confirmLabel: "Yes, upload",
      destructive: false,
      successMessage: "Profile photo uploaded.",
    };
  }
  if (pathname !== "/api/members") return null;
  const action = typeof body.action === "string" ? body.action : "";
  if (method === "POST") {
    const name = memberName(locale === "bn" ? body.nameBn : body.nameEn) ?? memberName(body.nameBn);
    return locale === "bn" ? {
      title: "সদস্য প্রোফাইল যোগ করবেন?",
      description: `${name ? `“${name}”` : "নতুন সদস্য"} প্রোফাইলটি এই পরিবারে যোগ করবেন? এটি শুধু ডিরেক্টরি প্রোফাইল; আলাদা অ্যাকাউন্টের সদস্যপদ অনুমোদন নয়।`,
      confirmLabel: "হ্যাঁ, যোগ করুন",
      destructive: false,
      successMessage: "সদস্য প্রোফাইল যোগ হয়েছে।",
    } : {
      title: "Add member profile?",
      description: `Add ${name ? `“${name}”` : "this new profile"} to this family? A directory profile does not approve a separate user's membership.`,
      confirmLabel: "Yes, add profile",
      destructive: false,
      successMessage: "Member profile added.",
    };
  }
  if (method !== "PATCH") return null;
  if (action === "update_profile") {
    const data = typeof body.data === "object" && body.data && !Array.isArray(body.data) ? body.data as Record<string, unknown> : {};
    const name = memberName(locale === "bn" ? data.nameBn : data.nameEn) ?? memberName(data.nameBn);
    return locale === "bn" ? {
      title: "প্রোফাইল পরিবর্তন সংরক্ষণ করবেন?",
      description: `${name ? `“${name}”` : "এই সদস্যের"} প্রোফাইলের তথ্য ও অবস্থা হালনাগাদ করবেন?`,
      confirmLabel: "হ্যাঁ, সংরক্ষণ করুন",
      destructive: false,
      successMessage: "সদস্য প্রোফাইল হালনাগাদ হয়েছে।",
    } : {
      title: "Save profile changes?",
      description: `Update the details and status of ${name ? `“${name}”` : "this member profile"}?`,
      confirmLabel: "Yes, save changes",
      destructive: false,
      successMessage: "Member profile updated.",
    };
  }
  if (action === "create_relationship") return locale === "bn" ? {
    title: "পারিবারিক সংযোগ যোগ করবেন?",
    description: "নির্বাচিত দুই সদস্যের সম্পর্কটি Family Tree-তে যোগ হবে। সদস্যদের দিক ও সম্পর্কের ধরন যাচাই করুন।",
    confirmLabel: "হ্যাঁ, যোগ করুন",
    destructive: false,
    successMessage: "পারিবারিক সংযোগ যোগ হয়েছে।",
  } : {
    title: "Add family connection?",
    description: "Add this relationship to the Family Tree? Check the two members' direction and relationship type.",
    confirmLabel: "Yes, add connection",
    destructive: false,
    successMessage: "Family connection added.",
  };
  if (action === "delete_relationship") return locale === "bn" ? {
    title: "পারিবারিক সংযোগ সরাবেন?",
    description: "এই সম্পর্কটি Family Tree থেকে সরবে; সদস্যদের প্রোফাইল মুছে যাবে না।",
    confirmLabel: "হ্যাঁ, সংযোগ সরান",
    destructive: true,
    successMessage: "পারিবারিক সংযোগ সরানো হয়েছে।",
  } : {
    title: "Remove family connection?",
    description: "Remove this relationship from the Family Tree? Neither member profile will be deleted.",
    confirmLabel: "Yes, remove connection",
    destructive: true,
    successMessage: "Family connection removed.",
  };
  return null;
}

export function memberActionResult(
  pathname: string,
  method: string,
  body: Record<string, unknown>,
  payload: Record<string, unknown>,
  locale: Locale,
  successMessage: string,
  responseStatus: number,
) {
  if (pathname === "/api/members" && method === "POST" && typeof payload.warning === "string" && payload.warning) {
    return {
      status: 202,
      noChange: false,
      message: locale === "bn"
        ? "সদস্য প্রোফাইল যোগ হয়েছে, কিন্তু প্রথম পারিবারিক সংযোগটি তৈরি হয়নি। Family Tree migration ও সম্পর্কটি যাচাই করুন।"
        : "The member profile was added, but its first family connection was not created. Check the Family Tree migration and the relationship.",
    };
  }
  if (pathname === "/api/members" && method === "PATCH" && body.action === "create_relationship" && payload.relationship === null) {
    return {
      status: 202,
      noChange: true,
      message: locale === "bn" ? "এই পারিবারিক সংযোগটি আগে থেকেই আছে; নতুন সংযোগ তৈরি হয়নি।" : "This family connection already exists; no new connection was created.",
    };
  }
  return { status: responseStatus, noChange: false, message: successMessage };
}
