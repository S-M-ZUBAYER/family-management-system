type Locale = "bn" | "en";
const names = { medication: ["ওষুধ", "medication"], appointment: ["অ্যাপয়েন্টমেন্ট", "appointment"], measurement: ["স্বাস্থ্য পরিমাপ", "health measurement"] } as const;
export function healthErrorCopy(code: unknown, locale: Locale): string | null {
  const messages: Record<string, [string, string]> = {
    HEALTH_INVALID_DATE: ["সঠিক তারিখ দিন। ওষুধের শেষের তারিখ শুরুর আগে হতে পারবে না।", "Enter valid calendar dates. A medication end date cannot precede its start date."],
    HEALTH_INVALID_MEDICATION: ["ওষুধের নাম, মাত্রা, ব্যবধান ও রিমাইন্ডার সময় সঠিকভাবে দিন।", "Enter a medicine name, dosage, frequency and valid reminder times (HH:mm)."],
    HEALTH_INVALID_APPOINTMENT: ["অ্যাপয়েন্টমেন্টের শিরোনাম, সময় ও ০–১০,০৮০ পূর্ণ মিনিটের রিমাইন্ডার দিন।", "Enter an appointment title, valid timezone-aware time and reminder of 0–10,080 whole minutes."],
    HEALTH_INVALID_MEASUREMENT: ["সঠিক পরিমাপের ধরন, সর্বোচ্চ দুই দশমিকের মান, একক ও সময় দিন। রক্তচাপে উভয় মান দিন।", "Enter a measurement type, value with up to two decimals, unit and valid timezone-aware time. Blood pressure requires both values."],
    HEALTH_SOS_INVALID: ["সঠিক SOS ধরন, অন্তত তিন অক্ষরের বার্তা বা বন্ধ করার স্ট্যাটাস দিন।", "Enter a valid SOS type, message of at least three characters or closing status."],
    HEALTH_SOS_LOCATION: ["সঠিক অক্ষাংশ ও দ্রাঘিমাংশ একসঙ্গে দিন; অবস্থানের নির্ভুলতা ঋণাত্মক হতে পারবে না।", "Enter valid paired latitude/longitude; location accuracy cannot be negative."],
    HEALTH_SOS_RESPONSE: ["সঠিক SOS পরিচয় ও সাড়ার ধরন দিন।", "Choose a valid SOS alert and response type."],
    HEALTH_SOS_NOT_FOUND: ["এই পরিবারে SOS পাওয়া যায়নি।", "SOS was not found in this family."],
    HEALTH_SOS_CLOSED: ["এই SOS ইতিমধ্যে বন্ধ হয়েছে। পৃষ্ঠা হালনাগাদ করুন।", "This SOS is already closed. Refresh the page."],
    HEALTH_SOS_CONFLICT: ["সংরক্ষণের সময়ে SOS বদলেছে। পৃষ্ঠা হালনাগাদ করে আবার চেষ্টা করুন।", "The SOS changed while saving. Refresh and retry."],
    HEALTH_SOS_FORBIDDEN: ["শুধু SOS-এর প্রতিবেদক বা অনুমোদিত স্বাস্থ্য ব্যবস্থাপক এটি বন্ধ করতে পারবেন।", "Only the SOS reporter or an authorized health manager can close it."],
  };
  return typeof code === "string" && Object.hasOwn(messages, code) ? messages[code][locale === "bn" ? 0 : 1] : null;
}
export function healthActionCopy(body: Record<string, unknown>, method: string, locale: Locale) {
  const data = body.data && typeof body.data === "object" && !Array.isArray(body.data) ? body.data as Record<string, unknown> : body;
  if (method === "POST" && ["create_sos", "respond_sos", "update_sos"].includes(String(body.action))) {
    const create = body.action === "create_sos", respond = body.action === "respond_sos";
    if (!create && !respond && !["resolved", "cancelled"].includes(String(data.status))) return null;
    return locale === "bn" ? {
      title: create ? "ফ্যামিলি SOS প্রকাশ করবেন?" : respond ? "SOS সাড়া সংরক্ষণ করবেন?" : "SOS বন্ধ করবেন?",
      description: create ? "বার্তা ও দেওয়া অবস্থান অনুমোদিত পরিবারের সদস্যদের SOS পাতায় দেখা যাবে। SMS, ইমেইল বা জরুরি সেবায় স্বয়ংক্রিয়ভাবে পাঠানো হবে না। জরুরি সেবায় সরাসরি যোগাযোগ করুন।" : respond ? "এই সাড়া পরিবারের SOS ইতিহাসে সংরক্ষিত হবে। সিস্টেম নিজে জরুরি সেবায় কল করে না বা সাহায্য পাঠায় না।" : `SOS-টি “${data.status === "resolved" ? "সমাধান" : "বাতিল"}” হিসেবে বন্ধ করবেন? এরপর নতুন সাড়া দেওয়া যাবে না।`,
      confirmLabel: create ? "হ্যাঁ, SOS প্রকাশ করুন" : respond ? "হ্যাঁ, সাড়া সংরক্ষণ করুন" : "হ্যাঁ, বন্ধ করুন", destructive: !create && !respond,
      successMessage: create ? "SOS পরিবারের পাতায় প্রকাশ হয়েছে; বাহ্যিক delivery নিশ্চিত নয়।" : respond ? "SOS সাড়া সংরক্ষণ হয়েছে; জরুরি সেবায় কোনো কল করা হয়নি।" : data.status === "resolved" ? "SOS সমাধান হিসেবে বন্ধ হয়েছে।" : "SOS বাতিল হিসেবে বন্ধ হয়েছে।",
    } : {
      title: create ? "Publish family SOS?" : respond ? "Save SOS response?" : "Close SOS?",
      description: create ? "The message and supplied location will appear on the SOS page for approved family members. No automatic SMS, email or emergency-services call is sent. Contact emergency services directly." : respond ? "This response is saved in the family's SOS history. The system does not call emergency services or dispatch help." : `Close this SOS as “${data.status}”? No new responses will be accepted afterward.`,
      confirmLabel: create ? "Yes, publish SOS" : respond ? "Yes, save response" : "Yes, close SOS", destructive: !create && !respond,
      successMessage: create ? "SOS published on the family page; external delivery is not confirmed." : respond ? "SOS response saved; no emergency-services call was made." : `SOS closed as “${data.status}”.`,
    };
  }
  const kind = method === "POST" && typeof body.action === "string" && body.action.startsWith("create_") ? body.action.slice(7) : body.kind;
  if (typeof kind === "string" && Object.hasOwn(names, kind) && ["POST", "PATCH", "DELETE"].includes(method)) {
    const name = names[kind as keyof typeof names][locale === "bn" ? 0 : 1], remove = method === "DELETE";
    return locale === "bn" ? {
      title: remove ? "স্থায়ীভাবে মুছবেন?" : method === "POST" ? "রেকর্ড যোগ করবেন?" : "পরিবর্তন সংরক্ষণ করবেন?",
      description: remove ? `${name} রেকর্ড স্থায়ীভাবে মুছবেন? এটি ফিরিয়ে আনা যাবে না।` : `${name} রেকর্ড ${method === "POST" ? "যোগ" : "হালনাগাদ"} করবেন? এটি তথ্য সংরক্ষণ করে, চিকিৎসা বা বাইরের বুকিং সম্পন্ন করে না।`,
      confirmLabel: remove ? "হ্যাঁ, মুছে ফেলুন" : "হ্যাঁ, সংরক্ষণ করুন", destructive: remove,
      successMessage: `${name} রেকর্ড ${remove ? "স্থায়ীভাবে মুছে ফেলা হয়েছে" : method === "POST" ? "যোগ হয়েছে" : "হালনাগাদ হয়েছে"}।`,
    } : {
      title: remove ? "Delete record permanently?" : method === "POST" ? "Add health record?" : "Save health changes?",
      description: remove ? `Permanently delete this ${name} record? This cannot be undone.` : `${method === "POST" ? "Add" : "Update"} this ${name} record? This stores information; it does not provide treatment or make an external booking.`,
      confirmLabel: remove ? "Yes, delete" : "Yes, save", destructive: remove,
      successMessage: `${name.charAt(0).toUpperCase()}${name.slice(1)} record ${remove ? "deleted permanently" : method === "POST" ? "added" : "updated"}.`,
    };
  }
  if (method !== "POST" || body.action !== "update_status" || !["medication", "appointment"].includes(String(data.entity))) return null;
  const states: Record<string, string> = data.entity === "medication" ? { active: "সক্রিয়", paused: "স্থগিত", completed: "সম্পন্ন" } : { scheduled: "নির্ধারিত", completed: "সম্পন্ন", cancelled: "বাতিল" };
  if (typeof data.status !== "string" || !Object.hasOwn(states, data.status)) return null;
  return locale === "bn" ? {
    title: "রেকর্ডের স্ট্যাটাস বদলাবেন?", description: `রেকর্ডের স্ট্যাটাস “${states[data.status]}” করবেন? এটি শুধু রেকর্ডের পরিবর্তন; চিকিৎসা নির্দেশনা বা বাইরের বুকিং পরিবর্তন নয়।`,
    confirmLabel: "হ্যাঁ, পরিবর্তন করুন", destructive: false, successMessage: `রেকর্ডের স্ট্যাটাস “${states[data.status]}” করা হয়েছে।`,
  } : {
    title: "Change health record status?", description: `Mark this ${data.entity} record “${data.status}”? This changes only the record, not treatment instructions or an external booking.`,
    confirmLabel: "Yes, change status", destructive: false, successMessage: `Health record marked “${data.status}”.`,
  };
}
