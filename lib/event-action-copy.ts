type Locale = "bn" | "en";

type ActionCopy = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive: boolean;
  successMessage: string;
};

type LocalizedCopy = [string, string, string, string, string, string, string, string, boolean];

function localize(copy: LocalizedCopy, locale: Locale): ActionCopy {
  const [titleBn, descriptionBn, confirmBn, successBn, titleEn, descriptionEn, confirmEn, successEn, destructive] = copy;
  return locale === "bn"
    ? { title: titleBn, description: descriptionBn, confirmLabel: confirmBn, successMessage: successBn, destructive }
    : { title: titleEn, description: descriptionEn, confirmLabel: confirmEn, successMessage: successEn, destructive };
}

export function eventActionCopy(pathname: string, method: string, body: Record<string, unknown>, locale: Locale): ActionCopy | null {
  if (pathname === "/api/events" && method === "POST") {
    return localize(body.status === "draft"
      ? ["ইভেন্ট খসড়া হিসেবে সংরক্ষণ করবেন?", "খসড়াটি পরিবারের সদস্যদের কাছে প্রকাশিত হবে না।", "হ্যাঁ, খসড়া সংরক্ষণ করুন", "ইভেন্ট খসড়া হিসেবে সংরক্ষিত হয়েছে।", "Save event as a draft?", "The draft will not be visible to family members.", "Yes, save draft", "Event saved as a draft.", false]
      : ["ইভেন্ট প্রকাশ করবেন?", "ইভেন্টটি পরিবারের সদস্যদের কাছে প্রকাশিত হবে এবং নিবন্ধন খোলা থাকবে।", "হ্যাঁ, প্রকাশ করুন", "ইভেন্ট প্রকাশিত হয়েছে।", "Publish event?", "The event will be visible to family members and registration will open.", "Yes, publish", "Event published.", false], locale);
  }

  const eventItem = /^\/api\/events\/[^/]+$/.test(pathname);
  if (eventItem && method === "DELETE") return localize([
    "ইভেন্ট স্থায়ীভাবে মুছবেন?", "ইভেন্টের সঙ্গে RSVP, মন্তব্য ও media record-ও স্থায়ীভাবে মুছে যাবে।", "হ্যাঁ, মুছে ফেলুন", "ইভেন্ট ও সংশ্লিষ্ট তথ্য মুছে ফেলা হয়েছে।",
    "Permanently delete event?", "Its RSVPs, comments and media records will also be permanently removed.", "Yes, delete event", "Event and linked records deleted.", true,
  ], locale);
  if (eventItem && method === "PATCH") {
    const action = typeof body.action === "string" ? body.action : "";
    const actions: Record<string, LocalizedCopy> = {
      edit: ["ইভেন্টের পরিবর্তন সংরক্ষণ করবেন?", "সময়, স্থান, বাজেট ও বর্তমান অবস্থা যাচাই করে সংরক্ষণ করুন।", "হ্যাঁ, সংরক্ষণ করুন", "ইভেন্টের বিস্তারিত আপডেট হয়েছে।", "Save event changes?", "Review its schedule, venue, budget and status before saving.", "Yes, save changes", "Event details updated.", false],
      publish: ["ইভেন্ট প্রকাশ করবেন?", "ইভেন্টটি সদস্যদের কাছে দৃশ্যমান হবে এবং নিবন্ধন খোলা থাকবে।", "হ্যাঁ, প্রকাশ করুন", "ইভেন্ট প্রকাশিত হয়েছে।", "Publish event?", "Members will see the event and registration will open.", "Yes, publish", "Event published.", false],
      draft: ["ইভেন্ট খসড়ায় ফেরাবেন?", "ইভেন্টটি সদস্যদের তালিকা থেকে সরে যাবে এবং নিবন্ধন বন্ধ হবে।", "হ্যাঁ, খসড়ায় ফেরান", "ইভেন্ট খসড়ায় ফেরানো হয়েছে।", "Move event to draft?", "It will leave the member list and registration will close.", "Yes, move to draft", "Event moved to draft.", true],
      close: ["নিবন্ধন বন্ধ করবেন?", "সদস্যরা আর নতুন RSVP জমা দিতে পারবেন না।", "হ্যাঁ, বন্ধ করুন", "ইভেন্টের নিবন্ধন বন্ধ হয়েছে।", "Close registration?", "Members will no longer be able to submit new RSVPs.", "Yes, close registration", "Event registration closed.", true],
      complete: ["ইভেন্ট সম্পন্ন করবেন?", "ইভেন্টটি সম্পন্ন হিসেবে চিহ্নিত হবে; RSVP বন্ধ থাকবে।", "হ্যাঁ, সম্পন্ন করুন", "ইভেন্ট সম্পন্ন হিসেবে চিহ্নিত হয়েছে।", "Mark event completed?", "The event will be marked completed and RSVPs will close.", "Yes, mark completed", "Event marked completed.", false],
      cancel: ["ইভেন্ট বাতিল করবেন?", "সদস্যদের কাছে ইভেন্টটি বাতিল দেখাবে এবং RSVP বন্ধ থাকবে।", "হ্যাঁ, বাতিল করুন", "ইভেন্ট বাতিল হয়েছে।", "Cancel event?", "Members will see the cancellation and RSVPs will close.", "Yes, cancel event", "Event cancelled.", true],
    };
    return actions[action] ? localize(actions[action], locale) : null;
  }

  if (/^\/api\/events\/[^/]+\/rsvp$/.test(pathname) && method === "POST") {
    const response = body.response;
    const answer = response === "going" ? ["যাব", "Going"] : response === "maybe" ? ["হয়তো", "Maybe"] : ["যেতে পারব না", "Not going"];
    return localize(["RSVP সংরক্ষণ করবেন?", `আপনার উত্তর “${answer[0]}” হিসেবে সংরক্ষিত হবে।`, "হ্যাঁ, সংরক্ষণ করুন", `আপনার উত্তর “${answer[0]}” হিসেবে সংরক্ষিত হয়েছে।`, "Save RSVP?", `Your response will be saved as “${answer[1]}”.`, "Yes, save RSVP", `Your response was saved as “${answer[1]}”.`, false], locale);
  }
  if (/^\/api\/events\/[^/]+\/comments$/.test(pathname) && method === "POST") return localize([
    "মন্তব্য যোগ করবেন?", "মন্তব্যটি ইভেন্টের আলোচনায় সদস্যদের কাছে দেখা যাবে।", "হ্যাঁ, মন্তব্য করুন", "মন্তব্য যোগ হয়েছে।",
    "Add comment?", "Family members will see it in the event discussion.", "Yes, add comment", "Comment added.", false,
  ], locale);
  if (/^\/api\/events\/[^/]+\/media$/.test(pathname) && method === "POST") return localize([
    "ইভেন্টে media যোগ করবেন?", "নির্বাচিত ছবি বা ভিডিও ইভেন্টের গ্যালারিতে আপলোড হবে।", "হ্যাঁ, আপলোড করুন", "ইভেন্ট গ্যালারিতে media যোগ হয়েছে।",
    "Add event media?", "The selected photo or video will be uploaded to the event gallery.", "Yes, upload", "Media added to the event gallery.", false,
  ], locale);
  if (/^\/api\/event-media\/[^/]+$/.test(pathname) && method === "DELETE") return localize([
    "ইভেন্টের media মুছবেন?", "ছবি বা ভিডিওটি গ্যালারি থেকে স্থায়ীভাবে সরে যাবে।", "হ্যাঁ, মুছে ফেলুন", "ইভেন্টের media মুছে ফেলা হয়েছে।",
    "Delete event media?", "The photo or video will be permanently removed from the gallery.", "Yes, delete media", "Event media deleted.", true,
  ], locale);
  return null;
}
