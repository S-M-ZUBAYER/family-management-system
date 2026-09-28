"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, Database, GitFork, KeyRound, LoaderCircle, ShieldCheck, UserRoundPlus } from "lucide-react";

import { useActionFeedback } from "@/components/action-modal-provider";
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
        if (!response.ok) throw new Error(payload.error ?? "Setup status পাওয়া যায়নি।");
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
        setFeedback(cause instanceof Error ? cause.message : "Setup status পাওয়া যায়নি।");
      });
    return () => controller.abort();
  }, [setFeedback]);

  async function submitSetup() {
    if (mode === "join" && (!joinCode.trim() || memberNameBn.trim().length < 2 || relationship.trim().length < 2)) {
      setFeedback("Join code, আপনার বাংলা নাম এবং পারিবারিক সম্পর্ক দিন।");
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
      if (!response.ok) throw new Error(payload.error ?? "Family setup সম্পন্ন হয়নি।");
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
      setFeedback(cause instanceof Error ? cause.message : "Family setup সম্পন্ন হয়নি।");
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:grid md:place-items-center md:py-14">
      <div className="w-full max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm"><GitFork className="size-5" /></div>
          <div><p className="font-bold tracking-tight">Family Management System</p><p className="text-sm text-muted-foreground">নিরাপদ family onboarding</p></div>
        </div>
        <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
          <section className="rounded-3xl bg-primary p-6 text-primary-foreground md:p-8">
            <div className="grid size-12 place-items-center rounded-2xl bg-white/12"><ShieldCheck className="size-6" /></div>
            <h1 className="mt-8 text-3xl font-bold leading-tight">নিজের পরিবার তৈরি করুন অথবা invitation code দিয়ে যোগ দিন</h1>
            <p className="mt-3 leading-7 text-primary-foreground/78">নতুন সদস্যের access কখনো সরাসরি চালু হবে না। আবেদনটি নির্দিষ্ট পরিবারের Owner বা Family Admin যাচাই করে অনুমোদন করবেন।</p>
            <div className="mt-8 space-y-3 text-sm">
              {["প্রতিটি আবেদন family-specific", "Admin approval ছাড়া কোনো access নয়", "Approval ও rejection audit log-এ সংরক্ষিত"].map((item) => <div key={item} className="flex items-center gap-3 rounded-2xl bg-white/8 px-4 py-3"><CheckCircle2 className="size-4 shrink-0" /><span>{item}</span></div>)}
            </div>
          </section>
          <Card className="gap-0 rounded-3xl border-border/75 py-0 shadow-none">
            <CardHeader className="border-b p-6 md:p-8">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary"><Database className="size-4" /> PostgreSQL connected</div>
              <CardTitle className="text-2xl">{state === "complete" ? "আপনার family workspace প্রস্তুত" : state === "pending" ? "Admin approval-এর অপেক্ষায়" : "Family onboarding"}</CardTitle>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Signed in as {displayName} · {email}</p>
            </CardHeader>
            <CardContent className="p-6 md:p-8">
              {state === "checking" ? <div className="flex min-h-64 items-center justify-center gap-3 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /> Setup status যাচাই হচ্ছে</div> : null}
              {state === "complete" ? <div className="flex min-h-64 flex-col justify-center"><CheckCircle2 className="size-12 text-emerald-600" /><h2 className="mt-5 text-2xl font-bold">{family?.name_bn ?? "পরিবার প্রস্তুত"}</h2><p className="mt-2 text-muted-foreground">আপনার access সক্রিয় হয়েছে। এখন family dashboard ব্যবহার করতে পারবেন।</p><Button asChild className="mt-7 w-fit gap-2 rounded-xl"><Link href="/" prefetch={false}>Dashboard খুলুন <ArrowRight className="size-4" /></Link></Button></div> : null}
              {state === "pending" ? <div className="flex min-h-64 flex-col justify-center"><Clock3 className="size-12 text-amber-600" /><h2 className="mt-5 text-2xl font-bold">{joinRequest?.families?.name_bn ?? family?.name_bn ?? "Membership request"}</h2><p className="mt-2 leading-6 text-muted-foreground">আপনার আবেদন Family Admin-এর queue-তে আছে। অনুমোদন হলে এই account স্বয়ংক্রিয়ভাবে family workspace-এ যুক্ত হবে।</p><Button variant="outline" className="mt-7 w-fit rounded-xl" onClick={() => window.location.reload()}>Status আবার দেখুন</Button></div> : null}
              {(state === "ready" || state === "saving" || state === "error") ? <div className="space-y-5">
                {initialSetupAvailable ? <div className="grid grid-cols-2 gap-2 rounded-2xl bg-muted/55 p-1.5"><Button type="button" variant={mode === "create" ? "default" : "ghost"} className="rounded-xl" onClick={() => setMode("create")}><GitFork /> নতুন পরিবার</Button><Button type="button" variant={mode === "join" ? "default" : "ghost"} className="rounded-xl" onClick={() => setMode("join")}><UserRoundPlus /> পরিবারে যোগ দিন</Button></div> : null}
                {mode === "create" ? <div className="space-y-4"><Field label="পরিবারের বাংলা নাম" id="family-name-bn"><Input id="family-name-bn" value={familyNameBn} onChange={(event) => setFamilyNameBn(event.target.value)} /></Field><Field label="Family name in English" id="family-name-en"><Input id="family-name-en" value={familyNameEn} onChange={(event) => setFamilyNameEn(event.target.value)} /></Field></div> : <div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Field label="Family join code" id="join-code"><div className="relative"><KeyRound className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="join-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} className="pl-10 font-mono uppercase tracking-widest" autoComplete="off" /></div></Field></div><Field label="নাম (বাংলা)" id="member-name-bn"><Input id="member-name-bn" value={memberNameBn} onChange={(event) => setMemberNameBn(event.target.value)} /></Field><Field label="Name (English)" id="member-name-en"><Input id="member-name-en" value={memberNameEn} onChange={(event) => setMemberNameEn(event.target.value)} /></Field><div className="sm:col-span-2"><Field label="পরিবারের সঙ্গে সম্পর্ক" id="relationship"><Input id="relationship" value={relationship} onChange={(event) => setRelationship(event.target.value)} placeholder="যেমন: মো. রাশেদের ছেলে" /></Field></div><Field label="Family reference / sponsor" id="sponsor"><Input id="sponsor" value={sponsor} onChange={(event) => setSponsor(event.target.value)} /></Field><Field label="Phone" id="phone"><Input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>{joinRequest?.status === "rejected" ? <div className="sm:col-span-2 rounded-2xl border border-rose-500/25 bg-rose-500/8 p-4 text-sm"><p className="font-bold text-rose-700 dark:text-rose-300">আগের আবেদনটি গ্রহণ হয়নি</p><p className="mt-1 text-muted-foreground">{joinRequest.rejection_reason || "Admin কোনো কারণ উল্লেখ করেননি। তথ্য ঠিক করে আবার আবেদন করতে পারেন।"}</p></div> : null}</div>}
                <Button className="h-11 w-full gap-2 rounded-xl" disabled={state === "saving" || (mode === "create" ? familyNameBn.trim().length < 2 || familyNameEn.trim().length < 2 : joinCode.trim().length < 6 || memberNameBn.trim().length < 2 || relationship.trim().length < 2)} onClick={() => void submitSetup()}>{state === "saving" ? <LoaderCircle className="size-4 animate-spin" /> : mode === "create" ? <ShieldCheck className="size-4" /> : <UserRoundPlus className="size-4" />}{mode === "create" ? "পরিবার তৈরি ও Owner সক্রিয় করুন" : "Admin approval-এর জন্য আবেদন করুন"}</Button>
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
