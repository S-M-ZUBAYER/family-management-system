type Locale = "bn" | "en";

type NoticeCopy = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive: boolean;
  successMessage: string;
};

export function noticeActionCopy(pathname: string, method: string, body: Record<string, unknown>, locale: Locale): NoticeCopy | null {
  const collection = pathname === "/api/notices";
  const item = /^\/api\/notices\/[^/]+$/.test(pathname);
  const action = typeof body.action === "string" ? body.action : "";

  if (collection && method === "POST") {
    const draft = body.status !== "published";
    if (locale === "bn") return draft ? {
      title: "খসড়া নোটিশ সংরক্ষণ করবেন?",
      description: "নোটিশটি খসড়া হিসেবে সংরক্ষিত হবে; পরিবারের সদস্যদের কাছে প্রকাশিত হবে না।",
      confirmLabel: "হ্যাঁ, খসড়া সংরক্ষণ করুন",
      destructive: false,
      successMessage: "নোটিশ খসড়া হিসেবে সংরক্ষিত হয়েছে।",
    } : {
      title: "নোটিশ প্রকাশ করবেন?",
      description: "নোটিশটি প্রকাশিত হবে। নির্ধারিত প্রকাশের সময় ও মেয়াদ অনুযায়ী পরিবারের সদস্যরা এটি দেখতে পারবেন।",
      confirmLabel: "হ্যাঁ, প্রকাশ করুন",
      destructive: false,
      successMessage: "নোটিশ প্রকাশিত হয়েছে।",
    };
    return draft ? {
      title: "Save notice as a draft?",
      description: "Save this notice as a draft? It will not be visible to family members.",
      confirmLabel: "Yes, save draft",
      destructive: false,
      successMessage: "Notice saved as a draft.",
    } : {
      title: "Publish notice?",
      description: "Publish this notice? Family members can see it according to its publish and expiry times.",
      confirmLabel: "Yes, publish",
      destructive: false,
      successMessage: "Notice published.",
    };
  }

  if (!item) return null;
  if (method === "DELETE") return locale === "bn" ? {
    title: "নোটিশ স্থায়ীভাবে মুছবেন?",
    description: "এই নোটিশটি স্থায়ীভাবে মুছে যাবে এবং তালিকা থেকে ফিরিয়ে আনা যাবে না।",
    confirmLabel: "হ্যাঁ, মুছে ফেলুন",
    destructive: true,
    successMessage: "নোটিশ মুছে ফেলা হয়েছে।",
  } : {
    title: "Permanently delete notice?",
    description: "This notice will be permanently removed and cannot be restored from the list.",
    confirmLabel: "Yes, delete notice",
    destructive: true,
    successMessage: "Notice deleted.",
  };
  if (method !== "PATCH") return null;

  const copy: Record<string, [string, string, string, string, string, string, boolean]> = {
    edit: ["নোটিশের পরিবর্তন সংরক্ষণ করবেন?", "শিরোনাম, বিস্তারিত, সময় ও প্রকাশের অবস্থা যাচাই করে সংরক্ষণ করুন।", "হ্যাঁ, সংরক্ষণ করুন", "Save notice changes?", "Save the updated title, details, times, and publication status?", "Yes, save changes", false],
    publish: ["নোটিশ প্রকাশ করবেন?", "প্রকাশের সময় এখন নির্ধারিত হবে; সক্রিয় মেয়াদ থাকলে সদস্যরা নোটিশটি দেখতে পারবেন।", "হ্যাঁ, প্রকাশ করুন", "Publish notice?", "Its publish time will be set to now; members can see it while it remains active.", "Yes, publish", false],
    draft: ["নোটিশ খসড়ায় ফেরাবেন?", "নোটিশটি সদস্যদের সক্রিয় তালিকা থেকে সরে যাবে।", "হ্যাঁ, খসড়ায় ফেরান", "Move notice to draft?", "It will no longer appear in the active member notice list.", "Yes, move to draft", true],
    archive: ["নোটিশ আর্কাইভ করবেন?", "নোটিশটি সদস্যদের সক্রিয় তালিকা থেকে সরে আর্কাইভে যাবে।", "হ্যাঁ, আর্কাইভ করুন", "Archive notice?", "It will leave the active member notice list and move to the archive.", "Yes, archive", true],
    pin: ["নোটিশ পিন করবেন?", "প্রকাশিত হলে এটি সক্রিয় তালিকায় পিন করা থাকবে; প্রকাশের অবস্থা এখন বদলাবে না।", "হ্যাঁ, পিন করুন", "Pin notice?", "It will be pinned in the active list once published; its publication status will not change now.", "Yes, pin", false],
    unpin: ["নোটিশ আনপিন করবেন?", "এটি আর তালিকার উপরে পিন করা থাকবে না; প্রকাশের অবস্থা বদলাবে না।", "হ্যাঁ, আনপিন করুন", "Unpin notice?", "It will no longer be pinned at the top; its publication status will not change.", "Yes, unpin", false],
  };
  const selected = copy[action];
  if (!selected) return null;
  const [titleBn, descriptionBn, confirmBn, titleEn, descriptionEn, confirmEn, destructive] = selected;
  return {
    title: locale === "bn" ? titleBn : titleEn,
    description: locale === "bn" ? descriptionBn : descriptionEn,
    confirmLabel: locale === "bn" ? confirmBn : confirmEn,
    destructive,
    successMessage: action === "edit"
      ? locale === "bn" ? "নোটিশের বিস্তারিত আপডেট হয়েছে।" : "Notice details updated."
      : locale === "bn" ? "নোটিশের অবস্থা আপডেট হয়েছে।" : "Notice status updated.",
  };
}
