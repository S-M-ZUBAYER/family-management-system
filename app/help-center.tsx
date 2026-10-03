"use client";

import { useMemo, useState } from "react";
import { BookOpen, LockKeyhole, Search, ShieldCheck } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Guide = { href: string; bn: string; en: string; stepsBn: string; stepsEn: string };

const groups: Array<{ bn: string; en: string; guides: Guide[] }> = [
  {
    bn: "শুরু ও সদস্য", en: "Getting started and members", guides: [
      { href: "/setup", bn: "পরিবার তৈরি বা যোগ দিন", en: "Create or join a family", stepsBn: "সাইন ইন করুন → নিজের পরিবার তৈরি করুন অথবা আমন্ত্রণ কোড দিয়ে আবেদন করুন। অন্য পরিবারে যোগ দিলেও অনুমোদন না পাওয়া পর্যন্ত তথ্য দেখা যাবে না।", stepsEn: "Sign in → create a family or apply with its invitation code. Joining another family remains pending until approval." },
      { href: "/members", bn: "নতুন সদস্য অনুমোদন", en: "Approve new members", stepsBn: "Owner বা Family Admin সদস্য অনুমোদন পেজে আবেদন যাচাই করে অনুমোদন বা প্রত্যাখ্যান করবেন। অনুমোদনের পর সদস্য পরিবারে ঢুকতে পারবেন।", stepsEn: "An Owner or Family Admin reviews applications here and approves or rejects them. Access starts only after approval." },
      { href: "/directory", bn: "সদস্য প্রোফাইল", en: "Member profiles", stepsBn: "অনুমোদিত অ্যাডমিন নতুন প্রোফাইল যোগ করেন। সদস্যের তথ্য, সম্পর্ক, ছবি ও যোগাযোগের দৃশ্যমানতা যাচাই করে সংরক্ষণ করুন।", stepsEn: "An authorized admin adds profiles. Check details, relationships, photos, and contact visibility before saving." },
      { href: "/family-tree", bn: "ফ্যামিলি ট্রি", en: "Family tree", stepsBn: "ডিরেক্টরিতে সম্পর্ক ঠিক করার পর এখানে প্রজন্ম ও আত্মীয়তার মানচিত্র দেখুন। ভুল সম্পর্ক থাকলে ডিরেক্টরিতে সংশোধন করুন।", stepsEn: "After setting relationships in Directory, explore generations and connections here. Correct mistakes in Directory." },
    ],
  },
  {
    bn: "যোগাযোগ ও আয়োজন", en: "Communication and events", guides: [
      { href: "/notices", bn: "নোটিশ", en: "Notices", stepsBn: "নোটিশ পড়ুন; অনুমতিপ্রাপ্ত ব্যক্তি নতুন নোটিশ প্রকাশ বা পুরোনোটি হালনাগাদ করতে পারবেন।", stepsEn: "Read notices; authorized people can publish or update them." },
      { href: "/events", bn: "ইভেন্ট ও ট্যুর", en: "Events and tours", stepsBn: "আয়োজন খুলে সময়, স্থান ও RSVP দেখুন; অনুমতি থাকলে ছবি ও পরিকল্পনার তথ্য যোগ করুন।", stepsEn: "Open an event for its date, location and RSVP; add media or planning details when permitted." },
      { href: "/magazine", bn: "ফ্যামিলি ম্যাগাজিন", en: "Family magazine", stepsBn: "পারিবারিক লেখা, স্মৃতি ও ছবি পড়ুন। নিজের লেখা তৈরি করে প্রকাশের নিয়ম অনুসরণ করুন।", stepsEn: "Read family stories and memories. Create your own article and follow its publishing workflow." },
      { href: "/chat", bn: "চ্যাট", en: "Chat", stepsBn: "সাধারণ গ্রুপ বা অনুমোদিত চ্যানেল বেছে বার্তা পাঠান। ব্যক্তিগত তথ্য ভুল গ্রুপে পাঠানোর আগে প্রাপক যাচাই করুন।", stepsEn: "Choose the family group or a permitted channel before sending. Check recipients before sharing private information." },
      { href: "/notifications", bn: "নোটিফিকেশন", en: "Notifications", stepsBn: "অপঠিত আপডেট, স্মরণিকা এবং পারিবারিক কার্যক্রমের খবর এখানে দেখুন।", stepsEn: "Review unread updates, reminders, and family activity here." },
    ],
  },
  {
    bn: "হিসাব ও ব্যবস্থাপনা", en: "Records and management", guides: [
      { href: "/qurbani", bn: "কোরবানি A–Z", en: "Qurbani A–Z", stepsBn: "Campaign তৈরি → শেয়ার/অংশগ্রহণকারী → পশু ও vendor → সংগ্রহ ও খরচ → সময়সূচি/কাজ → মাংস বণ্টন → চূড়ান্ত হিসাব। প্রয়োজনমতো প্রতিটি ট্যাব বা সম্পূর্ণ XLSX রপ্তানি করুন।", stepsEn: "Create a campaign → register shares → add animals and vendors → record collections and costs → plan tasks → distribute meat → settle accounts. Export individual tabs or the full XLSX." },
      { href: "/finance", bn: "ব্যক্তিগত হিসাব", en: "Private finance", stepsBn: "নিজের আয়-ব্যয়, বাজেট, দেনা-পাওনা ও লক্ষ্য লিখুন। এই অংশ অন্য সদস্য বা Family Admin-এর জন্য উন্মুক্ত নয়।", stepsEn: "Track your own income, expenses, budgets, debts and goals. Other family members and admins do not see your private finance records." },
      { href: "/welfare", bn: "কল্যাণ তহবিল", en: "Welfare fund", stepsBn: "তহবিল, অনুদান, ব্যয় ও সহায়তার অনুরোধ দেখুন। অর্থের হিসাব যাচাই ছাড়া চূড়ান্ত করবেন না।", stepsEn: "Review funds, contributions, expenses and assistance requests. Reconcile money before finalizing records." },
      { href: "/household", bn: "বাসা ব্যবস্থাপনা", en: "Household", stepsBn: "শেয়ার্ড বাজার তালিকা, বিল, রক্ষণাবেক্ষণ ও প্রয়োজনীয় রসিদের তথ্য পরিচালনা করুন।", stepsEn: "Manage shared shopping lists, bills, maintenance, and related receipts." },
      { href: "/governance", bn: "ভোট ও সিদ্ধান্ত", en: "Polls and decisions", stepsBn: "পারিবারিক প্রস্তাব পড়ুন এবং অনুমতি অনুযায়ী ভোট বা মতামত দিন।", stepsEn: "Read family proposals and vote or respond where you have permission." },
      { href: "/admin", bn: "অ্যাডমিন কন্ট্রোল", en: "Admin control", stepsBn: "Owner ও Family Admin ভূমিকা, কার্যক্রম ও audit history যাচাই করেন। সংবেদনশীল পরিবর্তনের আগে নিশ্চিতকরণ দেখুন।", stepsEn: "Owners and Family Admins review roles, activity and audit history. Check confirmation details before sensitive changes." },
    ],
  },
  {
    bn: "নিরাপত্তা ও সহায়তা", en: "Safety and support", guides: [
      { href: "/health", bn: "স্বাস্থ্য ও SOS", en: "Health and SOS", stepsBn: "নিজের স্বাস্থ্যতথ্য ও জরুরি যোগাযোগ নিয়ন্ত্রণ করুন। SOS-এর ইন-অ্যাপ অবস্থা দেখুন; বাহ্যিক SMS বা জরুরি সেবা স্বয়ংক্রিয়ভাবে পাঠানো হচ্ছে ধরে নেবেন না।", stepsEn: "Control your health details and emergency contacts. Check in-app SOS status; do not assume external SMS or emergency dispatch is automatic." },
      { href: "/archives", bn: "আর্কাইভ ও ভল্ট", en: "Archives and vault", stepsBn: "পারিবারিক স্মৃতি ও অনুমতিসাপেক্ষ ডকুমেন্ট রাখুন। আপলোডের আগে দৃশ্যমানতা ঠিক করুন।", stepsEn: "Store family memories and permission-scoped documents. Set visibility before uploading." },
      { href: "/privacy", bn: "Privacy ও Data Rights", en: "Privacy and data rights", stepsBn: "ডিরেক্টরি যোগাযোগের দৃশ্যমানতা ও নিজের তথ্যসংক্রান্ত অনুরোধ এখানে পরিচালনা করুন।", stepsEn: "Manage directory visibility and requests about your own data here." },
      { href: "/contact", bn: "যোগাযোগ ও সহায়তা", en: "Contact and support", stepsBn: "পরিবারের অ্যাডমিনকে অ্যাপের ভেতর অনুরোধ পাঠান অথবা প্রদর্শিত ইমেইল/WhatsApp-এ সাপোর্টে যোগাযোগ করুন।", stepsEn: "Send an in-app request to family admins or contact support using the displayed email or WhatsApp link." },
    ],
  },
];

export function HelpCenter() {
  const { pick } = useLocale();
  const [query, setQuery] = useState("");
  const visibleGroups = useMemo(() => groups.map((group) => ({
    ...group,
    guides: group.guides.filter((guide) => `${guide.bn} ${guide.en} ${guide.stepsBn} ${guide.stepsEn}`.toLowerCase().includes(query.trim().toLowerCase())),
  })).filter((group) => group.guides.length), [query]);

  return <main className="mx-auto w-full max-w-[1400px] space-y-6 px-4 py-6 md:px-7 md:py-8">
    <header className="rounded-3xl bg-[linear-gradient(120deg,#122f4b,#12685f_60%,#9a6420)] p-6 text-white shadow-lg md:p-8">
      <div className="flex items-center gap-2 text-sm text-cyan-100"><BookOpen className="size-5" /> {pick("সাইট ব্যবহারের নির্দেশিকা", "Site usage guide")}</div>
      <h1 className="mt-3 text-2xl font-bold md:text-4xl">{pick("কোন কাজ কোথায় করবেন", "Find the right place for each task")}</h1>
      <p className="mt-3 max-w-2xl text-base leading-7 text-white/85">{pick("প্রথমবার শুরু থেকে কোরবানি, হিসাব, গোপনীয়তা ও সহায়তা—প্রতিটি কাজের জন্য সঠিক পেজে যান।", "Follow the steps from first sign-in through Qurbani, records, privacy and support.")}</p>
    </header>
    <div className="relative max-w-xl"><Search className="absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" /><Input aria-label={pick("নির্দেশিকায় খুঁজুন", "Search help guides")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pick("যেমন: সদস্য, কোরবানি, XLSX", "For example: member, Qurbani, XLSX")} className="h-12 rounded-xl pl-11 text-base" /></div>
    <div className="grid gap-6 xl:grid-cols-2">{visibleGroups.map((group) => <section key={group.en} className="space-y-3"><h2 className="text-xl font-semibold">{pick(group.bn, group.en)}</h2>{group.guides.map((guide, index) => <Card key={guide.href} className="rounded-2xl py-0 shadow-none"><CardContent className="p-5"><div className="flex items-start gap-4"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-sm font-bold text-primary">{index + 1}</span><div className="min-w-0"><a href={guide.href} className="text-base font-semibold text-primary underline-offset-4 hover:underline">{pick(guide.bn, guide.en)}</a><p className="mt-2 text-sm leading-6 text-muted-foreground">{pick(guide.stepsBn, guide.stepsEn)}</p></div></div></CardContent></Card>)}</section>)}</div>
    {!visibleGroups.length ? <p className="rounded-2xl border p-6 text-base text-muted-foreground">{pick("এই শব্দে কোনো নির্দেশিকা পাওয়া যায়নি। অন্য শব্দে খুঁজুন অথবা যোগাযোগ ও সহায়তায় যান।", "No guide matched. Try another term or open Contact & Support.")}</p> : null}
    <section className="grid gap-4 lg:grid-cols-2"><Card className="rounded-2xl shadow-none"><CardContent className="flex gap-4 p-5"><LockKeyhole className="mt-1 size-6 shrink-0 text-primary" /><div><h2 className="text-base font-semibold">{pick("কীভাবে তথ্য সুরক্ষিত থাকে", "How access is protected")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{pick("প্রতিটি পরিবারের তথ্য আলাদা; নতুন সদস্যের প্রবেশ Family Admin-এর অনুমোদনসাপেক্ষ। ভূমিকা ও তথ্যের দৃশ্যমানতা অনুযায়ী পেজ ও রেকর্ড দেখানো হয়। ব্যক্তিগত হিসাব শুধু মালিক দেখেন। গুরুত্বপূর্ণ পরিবর্তনে নিশ্চিতকরণ এবং পরে ফলাফলের বার্তা দেখানো হয়।", "Family data is separated; a Family Admin must approve new access. Roles and visibility settings control pages and records. Private finance is owner-only. Important changes show confirmation and a result message.")}</p></div></CardContent></Card><Card className="rounded-2xl shadow-none"><CardContent className="flex gap-4 p-5"><ShieldCheck className="mt-1 size-6 shrink-0 text-primary" /><div><h2 className="text-base font-semibold">{pick("কিছু দেখা না গেলে", "If data does not appear")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{pick("প্রথমে সাইন ইন করুন, /setup-এ সঠিক পরিবার নির্বাচন করুন এবং সদস্যপদ সক্রিয় কি না দেখুন। অনুমোদন বাকি থাকলে Family Admin-এর সঙ্গে যোগাযোগ করুন। এরপর পেজ রিফ্রেশ করুন। সমস্যা থাকলে যোগাযোগ ও সহায়তায় অনুরোধ পাঠান।", "First sign in, select the correct family in /setup, and check that your membership is active. If approval is pending, contact the Family Admin. Refresh the page; if it still fails, send a support request.")}</p></div></CardContent></Card></section>
    <a href="/contact" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">{pick("যোগাযোগ ও সহায়তায় যান", "Open Contact & Support")}</a>
  </main>;
}
