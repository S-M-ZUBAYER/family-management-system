"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  GitFork,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SetupState = "checking" | "ready" | "saving" | "complete" | "error";

type Family = {
  id: string;
  name_bn: string;
  name_en: string;
  slug: string;
};

export function FamilySetup({
  displayName,
  email,
}: {
  displayName: string;
  email: string;
}) {
  const [state, setState] = useState<SetupState>("checking");
  const [family, setFamily] = useState<Family | null>(null);
  const [nameBn, setNameBn] = useState("শেখ মনছুফ পরিবার");
  const [nameEn, setNameEn] = useState("Sheikh Monsuf Family");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/setup/family", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as {
          setupComplete?: boolean;
          family?: Family | null;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "Setup status পাওয়া যায়নি।");
        if (payload.setupComplete) {
          setFamily(payload.family ?? null);
          setState("complete");
        } else {
          setState("ready");
        }
      })
      .catch((cause: unknown) => {
        if ((cause as { name?: string }).name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Setup status পাওয়া যায়নি।");
        setState("error");
      });
    return () => controller.abort();
  }, []);

  async function createFamily() {
    setState("saving");
    setError(null);
    try {
      const response = await fetch("/api/setup/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nameBn, nameEn }),
      });
      const payload = (await response.json()) as { family?: Family; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Family setup সম্পন্ন হয়নি।");
      setFamily(payload.family ?? null);
      setState("complete");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Family setup সম্পন্ন হয়নি।");
      setState("error");
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:grid md:place-items-center md:py-14">
      <div className="w-full max-w-5xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm">
            <GitFork className="size-5" />
          </div>
          <div>
            <p className="font-bold tracking-tight">Family Management System</p>
            <p className="text-sm text-muted-foreground">নিরাপদ প্রাথমিক সেটআপ</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[.85fr_1.15fr]">
          <section className="rounded-3xl bg-primary p-6 text-primary-foreground md:p-8">
            <div className="grid size-12 place-items-center rounded-2xl bg-white/12">
              <ShieldCheck className="size-6" />
            </div>
            <h1 className="mt-8 text-3xl font-bold leading-tight">
              প্রথম পরিবার ও Owner account সক্রিয় করুন
            </h1>
            <p className="mt-3 leading-7 text-primary-foreground/78">
              এই ধাপটি একবারই করতে হবে। আপনার signed-in account পরিবারের Owner হবে এবং পরবর্তী member request অনুমোদন করতে পারবে।
            </p>
            <div className="mt-8 space-y-3 text-sm">
              {[
                "PostgreSQL-এ family workspace তৈরি",
                "Owner profile ও membership সংযুক্ত",
                "প্রথম audit record সংরক্ষণ",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl bg-white/8 px-4 py-3">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </section>

          <Card className="gap-0 rounded-3xl border-border/75 py-0 shadow-none">
            <CardHeader className="border-b p-6 md:p-8">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
                <Database className="size-4" /> PostgreSQL connected
              </div>
              <CardTitle className="text-2xl">
                {state === "complete" ? "সেটআপ সম্পন্ন হয়েছে" : "পরিবারের পরিচয়"}
              </CardTitle>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Signed in as {displayName} · {email}
              </p>
            </CardHeader>
            <CardContent className="p-6 md:p-8">
              {state === "checking" ? (
                <div className="flex min-h-56 items-center justify-center gap-3 text-muted-foreground">
                  <LoaderCircle className="size-5 animate-spin" /> Setup status যাচাই হচ্ছে
                </div>
              ) : state === "complete" ? (
                <div className="flex min-h-56 flex-col justify-center">
                  <CheckCircle2 className="size-12 text-emerald-600" />
                  <h2 className="mt-5 text-2xl font-bold">{family?.name_bn ?? "পরিবার প্রস্তুত"}</h2>
                  <p className="mt-2 text-muted-foreground">
                    Owner access সক্রিয় হয়েছে। এখন dashboard ও member approval ব্যবহার করতে পারবেন।
                  </p>
                  <Button asChild className="mt-7 w-fit gap-2 rounded-xl">
                    <a href="/members">
                      সদস্য অনুমোদন খুলুন <ArrowRight className="size-4" />
                    </a>
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="family-name-bn">পরিবারের বাংলা নাম</Label>
                    <Input
                      id="family-name-bn"
                      value={nameBn}
                      onChange={(event) => setNameBn(event.target.value)}
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="family-name-en">Family name in English</Label>
                    <Input
                      id="family-name-en"
                      value={nameEn}
                      onChange={(event) => setNameEn(event.target.value)}
                      className="h-11 rounded-xl"
                    />
                  </div>
                  {error ? (
                    <p className="rounded-xl border border-destructive/25 bg-destructive/8 px-4 py-3 text-sm text-destructive">
                      {error}
                    </p>
                  ) : null}
                  <Button
                    className="h-11 w-full gap-2 rounded-xl"
                    disabled={state === "saving" || nameBn.trim().length < 2 || nameEn.trim().length < 2}
                    onClick={() => void createFamily()}
                  >
                    {state === "saving" ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="size-4" />
                    )}
                    পরিবার তৈরি ও Owner সক্রিয় করুন
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}

