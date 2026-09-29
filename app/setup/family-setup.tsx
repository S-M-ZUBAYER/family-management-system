"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, Database, GitFork, KeyRound, LoaderCircle, ShieldCheck, UserRoundPlus } from "lucide-react";

import { useActionFeedback } from "@/components/action-modal-provider";
import { useLocale } from "@/components/locale-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SetupState = "checking" | "ready" | "saving" | "pending" | "complete" | "error";
type SetupMode = "create" | "join";

type Family = { id: string; name_bn: string; name_en: string; slug: string };
type JoinRequest = {
  id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  rejection_reason: string | null;
  created_at: string;
  families: { name_bn: string; name_en: string } | null;
};

export function FamilySetup({ displayName, email }: { displayName: string; email: string }) {
  const { locale, pick } = useLocale();
  const [state, setState] = useState<SetupState>("checking");
  const [mode, setMode] = useState<SetupMode>("join");
  const [family, setFamily] = useState<Family | null>(null);
  const [joinRequest, setJoinRequest] = useState<JoinRequest | null>(null);
  const [initialSetupAvailable, setInitialSetupAvailable] = useState(false);
  const [familyNameBn, setFamilyNameBn] = useState("শেখ মনছুফ পরিবার");
  const [familyNameEn, setFamilyNameEn] = useState("Sheikh Monsuf Family");
  const [joinCode, setJoinCode] = useState("");
  const [memberNameBn, setMemberNameBn] = useState(displayName);
  const [memberNameEn, setMemberNameEn] = useState(displayName);
  const [relationship, setRelationship] = useState("");
  const [sponsor, setSponsor] = useState("");
  const [phone, setPhone] = useState("");
  const [, setFeedback] = useActionFeedback();

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/setup/family", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json() as { setupComplete?: boolean; family?: Family | null; initialSetupAvailable?: boolean; joinRequest?: JoinRequest | null; error?: string };
        if (!response.ok) throw new Error(payload.error ?? pick("সেটআপের অবস্থা পাওয়া যায়নি।", "Could not load setup status."));
        if (payload.setupComplete) {
          setFamily(payload.family ?? null);
          setState("complete");
          return;
        }
        setInitialSetupAvailable(Boolean(payload.initialSetupAvailable));
        setMode(payload.initialSetupAvailable ? "create" : "join");
        setJoinRequest(payload.joinRequest ?? null);
        setState(payload.joinRequest?.status === "pending" ? "pending" : "ready");
      })
      .catch((cause: unknown) => {
        if ((cause as { name?: string }).name === "AbortError") return;
        setState("error");
        setFeedback(cause instanceof Error ? cause.message : pick("সেটআপের অবস্থা পাওয়া যায়নি।", "Could not load setup status."));
      });
    return () => controller.abort();
  }, [pick, setFeedback]);

  async function submitSetup() {
    if (mode === "join" && (!joinCode.trim() || memberNameBn.trim().length < 2 || relationship.trim().length < 2)) {
      setFeedback(pick("জয়েন কোড, আপনার বাংলা নাম এবং পারিবারিক সম্পর্ক দিন।", "Enter the join code, your Bangla name, and your family relationship."));
      return;
    }
    setState("saving");
    try {
      const response = await fetch("/api/setup/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "create" ? { mode, nameBn: familyNameBn, nameEn: familyNameEn } : { mode, joinCode, nameBn: memberNameBn, nameEn: memberNameEn, relationship, sponsor, phone }),
      });
      if (response.status === 499) {
        setState("ready");
        return;
      }
      const payload = await response.json() as { family?: Family; joinRequest?: { id: string; status: string }; requestSubmitted?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error ?? pick("ফ্যামিলি সেটআপ সম্পন্ন হয়নি।", "Family setup could not be completed."));
      if (payload.requestSubmitted) {
        setFamily(payload.family ?? null);
        setJoinRequest({ id: payload.joinRequest?.id ?? "submitted", status: "pending", rejection_reason: null, created_at: new Date().toISOString(), families: payload.family ? { name_bn: payload.family.name_bn, name_en: payload.family.name_en } : null });
        setState("pending");
      } else {
        setFamily(payload.family ?? null);
        setState("complete");
      }
    } catch (cause) {
      setState("ready");
      setFeedback(cause instanceof Error ? cause.message : pick("ফ্যামিলি সেটআপ সম্পন্ন হয়নি।", "Family setup could not be completed."));
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:grid md:place-items-center md:py-14">
      <div className="w-full max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><GitFork className="size-5" /></div>
          <div><p className="font-bold tracking-tight">Family Management System</p><p className="text-sm text-muted-foreground">{pick("নিরাপদ ফ্যামিলি অনবোর্ডিং", "Secure family onboarding")}</p></div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
          <section className="rounded-3xl bg-primary p-6 text-primary-foreground md:p-8">
            <div className="grid size-12 place-items-center rounded-2xl bg-white/12"><ShieldCheck className="size-6" /></div>
            <h1 className="mt-8 text-3xl font-bold leading-tight">{pick("নিজের পরিবার তৈরি করুন অথবা আমন্ত্রণ কোড দিয়ে যোগ দিন", "Create your family or join one with an invitation code")}</h1>
            <p className="mt-3 leading-7 text-primary-foreground/78">{pick("নতুন সদস্যের প্রবেশাধিকার সরাসরি চালু হবে না। নির্দিষ্ট পরিবারের Owner বা Family Admin আবেদনটি যাচাই ও অনুমোদন করবেন।", "New-member access is never activated automatically. The selected family's Owner or Family Admin must review and approve the request.")}</p>
            <div className="mt-8 space-y-3 text-sm">
              {(locale === "bn" ? ["প্রতিটি আবেদন নির্দিষ্ট পরিবারের জন্য", "Admin অনুমোদন ছাড়া কোনো প্রবেশাধিকার নয়", "অনুমোদন ও প্রত্যাখ্যান audit log-এ সংরক্ষিত"] : ["Every request is family-specific", "No access without admin approval", "Approvals and rejections are saved to the audit log"]).map((item) => <div key={item} className="flex items-center gap-3 rounded-2xl bg-white/8 px-4 py-3"><CheckCircle2 className="size-4 shrink-0" /><span>{item}</span></div>)}
            </div>
          </section>
          <Card className="gap-0 rounded-3xl border-border/75 py-0 shadow-none">
            <CardHeader className="border-b p-6 md:p-8">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary"><Database className="size-4" /> PostgreSQL connected</div>
              <CardTitle className="text-2xl">{state === "complete" ? pick("আপনার ফ্যামিলি ওয়ার্কস্পেস প্রস্তুত", "Your family workspace is ready") : state === "pending" ? pick("Admin অনুমোদনের অপেক্ষায়", "Waiting for admin approval") : pick("ফ্যামিলি অনবোর্ডিং", "Family onboarding")}</CardTitle>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{pick("সাইন ইন করেছেন", "Signed in as")} {displayName} · {email}</p>
            </CardHeader>
            <CardContent className="p-6 md:p-8">
              {state === "checking" ? <div className="flex min-h-64 items-center justify-center gap-3 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /> {pick("সেটআপের অবস্থা যাচাই হচ্ছে", "Checking setup status")}</div> : null}
              {state === "complete" ? <div className="flex min-h-64 flex-col justify-center"><CheckCircle2 className="size-12 text-emerald-600" /><h2 className="mt-5 text-2xl font-bold">{locale === "en" ? family?.name_en || family?.name_bn || "Family ready" : family?.name_bn ?? "পরিবার প্রস্তুত"}</h2><p className="mt-2 text-muted-foreground">{pick("আপনার প্রবেশাধিকার সক্রিয় হয়েছে। এখন ফ্যামিলি ড্যাশবোর্ড ব্যবহার করতে পারবেন।", "Your access is active. You can now use the family dashboard.")}</p><Button asChild className="mt-7 w-fit gap-2 rounded-xl"><Link href="/" prefetch={false}>{pick("ড্যাশবোর্ড খুলুন", "Open dashboard")} <ArrowRight className="size-4" /></Link></Button></div> : null}
              {state === "pending" ? <div className="flex min-h-64 flex-col justify-center"><Clock3 className="size-12 text-amber-600" /><h2 className="mt-5 text-2xl font-bold">{locale === "en" ? joinRequest?.families?.name_en || family?.name_en || "Membership request" : joinRequest?.families?.name_bn ?? family?.name_bn ?? "সদস্যপদের আবেদন"}</h2><p className="mt-2 leading-6 text-muted-foreground">{pick("আপনার আবেদন Family Admin-এর অপেক্ষমাণ তালিকায় আছে। অনুমোদন হলে এই account স্বয়ংক্রিয়ভাবে ফ্যামিলি ওয়ার্কস্পেসে যুক্ত হবে।", "Your request is in the Family Admin's pending queue. After approval, this account will be added to the family workspace automatically.")}</p><Button variant="outline" className="mt-7 w-fit rounded-xl" onClick={() => window.location.reload()}>{pick("অবস্থা আবার দেখুন", "Check status again")}</Button></div> : null}
              {(state === "ready" || state === "saving" || state === "error") ? <div className="space-y-5">
                {initialSetupAvailable ? <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/55 p-1.5"><Button type="button" variant={mode === "create" ? "default" : "ghost"} className="rounded-xl" onClick={() => setMode("create")}><GitFork /> {pick("নতুন পরিবার", "New family")}</Button><Button type="button" variant={mode === "join" ? "default" : "ghost"} className="rounded-xl" onClick={() => setMode("join")}><UserRoundPlus /> {pick("পরিবারে যোগ দিন", "Join a family")}</Button></div> : null}
                {mode === "create" ? <div className="space-y-4"><Field label={pick("পরিবারের বাংলা নাম", "Family name in Bangla")} id="family-name-bn"><Input id="family-name-bn" value={familyNameBn} onChange={(event) => setFamilyNameBn(event.target.value)} /></Field><Field label={pick("পরিবারের ইংরেজি নাম", "Family name in English")} id="family-name-en"><Input id="family-name-en" value={familyNameEn} onChange={(event) => setFamilyNameEn(event.target.value)} /></Field></div> : <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Field label={pick("ফ্যামিলি জয়েন কোড", "Family join code")} id="join-code"><div className="relative"><KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="join-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} className="pl-10 font-mono uppercase tracking-widest" autoComplete="off" /></div></Field></div><Field label={pick("নাম (বাংলা)", "Name (Bangla)")} id="member-name-bn"><Input id="member-name-bn" value={memberNameBn} onChange={(event) => setMemberNameBn(event.target.value)} /></Field><Field label={pick("নাম (ইংরেজি)", "Name (English)")} id="member-name-en"><Input id="member-name-en" value={memberNameEn} onChange={(event) => setMemberNameEn(event.target.value)} /></Field><div className="sm:col-span-2"><Field label={pick("পরিবারের সঙ্গে সম্পর্ক", "Relationship to the family")} id="relationship"><Input id="relationship" value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder={pick("যেমন: মো. রাশেদের ছেলে", "For example: son of Md. Rashed")} /></Field></div><Field label={pick("ফ্যামিলি রেফারেন্স / স্পনসর", "Family reference / sponsor")} id="sponsor"><Input id="sponsor" value={sponsor} onChange={(event) => setSponsor(event.target.value)} /></Field><Field label={pick("ফোন", "Phone")} id="phone"><Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>{joinRequest?.status === "rejected" ? <div className="sm:col-span-2 rounded-2xl border border-rose-500/25 bg-rose-500/8 p-4 text-sm"><p className="font-bold text-rose-700 dark:text-rose-300">{pick("আগের আবেদনটি গ্রহণ হয়নি", "The previous request was not approved")}</p><p className="mt-1 text-muted-foreground">{joinRequest.rejection_reason || pick("Admin কোনো কারণ উল্লেখ করেননি। তথ্য ঠিক করে আবার আবেদন করতে পারেন।", "The admin did not provide a reason. Correct the details and submit again.")}</p></div> : null}</div>}
                <Button className="h-11 w-full gap-2 rounded-xl" disabled={state === "saving" || (mode === "create" ? familyNameBn.trim().length < 2 || familyNameEn.trim().length < 2 : joinCode.trim().length < 6 || memberNameBn.trim().length < 2 || relationship.trim().length < 2)} onClick={() => void submitSetup()}>{state === "saving" ? <LoaderCircle className="size-4 animate-spin" /> : mode === "create" ? <ShieldCheck className="size-4" /> : <UserRoundPlus className="size-4" />}{mode === "create" ? pick("পরিবার তৈরি করে Owner সক্রিয় করুন", "Create family and activate Owner") : pick("Admin অনুমোদনের জন্য আবেদন করুন", "Request admin approval")}</Button>
              </div> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}
