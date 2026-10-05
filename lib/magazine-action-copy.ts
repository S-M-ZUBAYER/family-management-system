type Locale = "bn" | "en";
type Copy = { title: string; description: string; confirmLabel: string; successMessage: string; destructive: boolean };
type Pair = [string, string];

function copy(locale: Locale, title: Pair, description: Pair, confirmLabel: Pair, successMessage: Pair, destructive = false): Copy {
  const index = locale === "bn" ? 0 : 1;
  return { title: title[index], description: description[index], confirmLabel: confirmLabel[index], successMessage: successMessage[index], destructive };
}

export function magazineActionCopy(pathname: string, method: string, body: Record<string, unknown>, locale: Locale): Copy | null {
  if (pathname === "/api/magazine/upload" && method === "POST") return copy(locale,
    ["কভার ছবি আপলোড করবেন?", "Upload the article cover?"],
    ["ছবিটি ম্যাগাজিনের লেখার সঙ্গে সংযুক্ত হবে।", "The image will be attached to the magazine article."],
    ["হ্যাঁ, আপলোড করুন", "Yes, upload"], ["কভার ছবি আপলোড হয়েছে।", "Article cover uploaded."]);
  if (pathname !== "/api/magazine/records") return null;

  if (method === "PATCH") return copy(locale,
    ["লেখার পরিবর্তন সংরক্ষণ করবেন?", "Save article changes?"],
    ["লেখার শিরোনাম, বিষয়বস্তু ও দৃশ্যমানতা যাচাই করুন।", "Review the title, content and visibility."],
    ["হ্যাঁ, সংরক্ষণ করুন", "Yes, save"], ["লেখা হালনাগাদ হয়েছে।", "Article updated."]);
  if (method === "DELETE") {
    const comment = body.kind === "comment";
    return comment ? copy(locale,
      ["মন্তব্য মুছবেন?", "Delete comment?"],
      ["মন্তব্যটি স্থায়ীভাবে সরে যাবে।", "The comment will be permanently removed."],
      ["হ্যাঁ, মুছুন", "Yes, delete"], ["মন্তব্য মুছে ফেলা হয়েছে।", "Comment deleted."], true)
      : copy(locale,
      ["লেখাটি স্থায়ীভাবে মুছবেন?", "Permanently delete article?"],
      ["লেখার সঙ্গে মন্তব্য ও আপলোড করা মিডিয়াও সরে যাবে।", "Its comments and uploaded media will also be removed."],
      ["হ্যাঁ, মুছুন", "Yes, delete"], ["লেখাটি মুছে ফেলা হয়েছে।", "Article deleted."], true);
  }
  if (method !== "POST") return null;
  const action = body.action;
  if (action === "create_article") {
    const data = typeof body.data === "object" && body.data ? body.data as Record<string, unknown> : {};
    if (data.saveDraft === "true") return copy(locale,
      ["লেখাটি খসড়া হিসেবে সংরক্ষণ করবেন?", "Save article as draft?"],
      ["খসড়াটি পরিবারের সাধারণ সদস্যদের কাছে প্রকাশিত হবে না।", "The draft will not be published to ordinary family members."],
      ["হ্যাঁ, খসড়া রাখুন", "Yes, save draft"], ["খসড়া সংরক্ষিত হয়েছে।", "Draft saved."]);
    if (data.publishNow === "true") return copy(locale,
      ["লেখাটি প্রকাশ করবেন?", "Publish article now?"],
      ["প্রকাশিত লেখা পরিবারের সদস্যরা দেখতে পারবেন।", "Family members will be able to view the published article."],
      ["হ্যাঁ, প্রকাশ করুন", "Yes, publish"], ["লেখাটি প্রকাশিত হয়েছে।", "Article published."]);
    return copy(locale,
      ["লেখাটি যাচাইয়ের জন্য জমা দেবেন?", "Submit article for review?"],
      ["অ্যাডমিন যাচাইয়ের আগে এটি প্রকাশিত হবে না।", "It will not be published until an admin reviews it."],
      ["হ্যাঁ, জমা দিন", "Yes, submit"], ["লেখাটি যাচাইয়ের জন্য জমা হয়েছে।", "Article submitted for review."]);
  }
  if (action === "set_status") {
    const data = typeof body.data === "object" && body.data ? body.data as Record<string, unknown> : {};
    if (typeof data.featured === "boolean") return copy(locale,
      data.featured ? ["লেখাটি Featured করবেন?", "Feature this article?"] : ["Featured থেকে সরাবেন?", "Remove from featured?"],
      ["ম্যাগাজিনে লেখাটির বিশেষ প্রদর্শন পরিবর্তিত হবে।", "This changes the article's highlighted placement."],
      ["হ্যাঁ, পরিবর্তন করুন", "Yes, change"], ["Featured অবস্থা পরিবর্তিত হয়েছে।", "Featured status updated."]);
    if (data.status === "published") return copy(locale,
      ["লেখাটি প্রকাশ করবেন?", "Publish article?"],
      ["প্রকাশিত লেখা পরিবারের সদস্যরা দেখতে পারবেন।", "Family members will be able to read the article."],
      ["হ্যাঁ, প্রকাশ করুন", "Yes, publish"], ["লেখাটি প্রকাশিত হয়েছে।", "Article published."]);
    const archived = data.status === "archived";
    return copy(locale,
      archived ? ["লেখাটি আর্কাইভ করবেন?", "Archive article?"] : ["লেখার অবস্থা পরিবর্তন করবেন?", "Change article status?"],
      archived ? ["লেখাটি প্রকাশিত তালিকা থেকে সরে যাবে।", "The article will leave the published list."] : ["নতুন অবস্থা অনুযায়ী লেখাটির দৃশ্যমানতা বদলাবে।", "The article's visibility will change with its status."],
      ["হ্যাঁ, পরিবর্তন করুন", "Yes, change"], ["লেখার অবস্থা পরিবর্তিত হয়েছে।", "Article status updated."], archived);
  }
  if (action === "toggle_like") return copy(locale,
    ["পছন্দের অবস্থা বদলাবেন?", "Change your like?"],
    ["এই লেখায় আপনার পছন্দ যোগ বা সরানো হবে।", "Your like on this article will be added or removed."],
    ["হ্যাঁ, পরিবর্তন করুন", "Yes, change"], ["পছন্দের অবস্থা পরিবর্তিত হয়েছে।", "Like updated."]);
  if (action === "add_comment") return copy(locale,
    ["মন্তব্য যোগ করবেন?", "Add comment?"],
    ["মন্তব্যটি লেখার আলোচনায় দেখা যাবে।", "The comment will appear in the article discussion."],
    ["হ্যাঁ, মন্তব্য করুন", "Yes, comment"], ["মন্তব্য যোগ হয়েছে।", "Comment added."]);
  return null;
}
