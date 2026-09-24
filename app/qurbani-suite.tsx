"use client";

import { useEffect } from "react";
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  HandCoins,
  PackageCheck,
  Plus,
  ReceiptText,
  Scale,
  Truck,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const shares = [
  { participant: "মো. রাশেদ", animal: "গরু A-01", shares: "২", total: "৳ ৯২,০০০", paid: "৳ ৯২,০০০", status: "Paid" },
  { participant: "সাইফুল আহমেদ", animal: "গরু A-01", shares: "১", total: "৳ ৪৬,০০০", paid: "৳ ৩০,০০০", status: "Partial" },
  { participant: "নাসরিন আক্তার", animal: "গরু A-02", shares: "১", total: "৳ ৪৮,৫০০", paid: "৳ ৪৮,৫০০", status: "Paid" },
  { participant: "আরিফ মনছুফ", animal: "গরু A-02", shares: "২", total: "৳ ৯৭,০০০", paid: "৳ ৫০,০০০", status: "Partial" },
  { participant: "তানিয়া রহমান", animal: "অপেক্ষমাণ", shares: "১", total: "৳ ৪৮,৫০০", paid: "৳ ০", status: "Due" },
];

const animals = [
  { tag: "A-01", type: "গরু", vendor: "রহমান ক্যাটল ফার্ম", price: "৳ ৩,১২,০০০", shares: "৬/৭", status: "Purchased" },
  { tag: "A-02", type: "গরু", vendor: "আল-মদিনা লাইভস্টক", price: "৳ ৩,৩৮,০০০", shares: "৫/৭", status: "Verified" },
  { tag: "A-03", type: "গরু", vendor: "Quotation review", price: "৳ ২,৯০,০০০", shares: "৪/৭", status: "Planned" },
];

export function QurbaniSuite() {
  useEffect(() => {
    const modelContext = (document as Document & {
      modelContext?: {
        registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void>;
      };
    }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      modelContext.registerTool(
        {
          name: "read_qurbani_program_summary",
          title: "Read Kurbani programme summary",
          description: "Read the visible 2027 Kurbani programme totals, payment progress and preparation status.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: () => ({
            programme: "Kurbani 2027",
            shares: { registered: 26, capacity: 35 },
            budgetBdt: 1680000,
            collectedBdt: 987500,
            animals: { total: 3, purchased: 2 },
            outstandingTasks: 12,
          }),
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 md:px-7 md:py-8">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <CalendarDays className="size-4" /> ১৪৪৮ হিজরি · ২০২৭
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">কোরবানি ম্যানেজমেন্ট স্যুট</h1>
          <p className="mt-1 max-w-3xl text-muted-foreground">
            Planning, shares, animals, purchase, payments, expenses, operations এবং meat distribution—সবকিছু এক জায়গায়।
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2 rounded-xl">
            <FileSpreadsheet className="size-4" /> Complete XLSX
          </Button>
          <Button className="gap-2 rounded-xl">
            <Plus className="size-4" /> নতুন রেকর্ড
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {[
          { label: "মোট শেয়ার", value: "২৬ / ৩৫", note: "৭৪% পূর্ণ", icon: Users },
          { label: "মোট বাজেট", value: "৳ ১৬.৮ লাখ", note: "অনুমোদিত", icon: CircleDollarSign },
          { label: "সংগৃহীত", value: "৳ ৯.৮৭ লাখ", note: "৮২% collection", icon: HandCoins },
          { label: "মোট পশু", value: "৩", note: "২টি purchased", icon: Truck },
          { label: "বাকি কাজ", value: "১২", note: "৪টি জরুরি", icon: ClipboardCheck },
        ].map((item) => (
          <Card key={item.label} className="rounded-2xl border-border/75 py-0 shadow-none">
            <CardContent className="p-5">
              <span className="mb-4 grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary">
                <item.icon className="size-5" />
              </span>
              <p className="text-sm text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-2xl font-bold">{item.value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.note}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-5 lg:grid-cols-[1.4fr_.6fr]">
        <Card className="gap-0 rounded-3xl border-border/75 py-0 shadow-none">
          <CardHeader className="p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-xl">প্রস্তুতির অগ্রগতি</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Kurbani closing checklist পর্যন্ত সম্পূর্ণ operational progress</p>
              </div>
              <Badge variant="secondary">Planning</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 px-5 pb-6 sm:grid-cols-2 md:px-6">
            {[
              ["অংশগ্রহণকারী নিবন্ধন", 74],
              ["পশু ক্রয় ও verification", 66],
              ["Payment collection", 82],
              ["Distribution planning", 38],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <div className="mb-2 flex justify-between text-sm">
                  <span>{label}</span><span className="font-semibold text-primary">{value}%</span>
                </div>
                <Progress value={Number(value)} className="h-2.5" />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/75 bg-primary py-0 text-primary-foreground shadow-none">
          <CardContent className="flex h-full flex-col justify-between gap-6 p-6">
            <div>
              <span className="grid size-12 place-items-center rounded-2xl bg-white/12">
                <Scale className="size-6" />
              </span>
              <p className="mt-5 text-sm text-primary-foreground/70">আনুমানিক meat yield</p>
              <p className="mt-1 text-3xl font-bold">৬৮০ কেজি</p>
              <p className="mt-2 text-sm text-primary-foreground/70">Purchased animals-এর estimated total</p>
            </div>
            <Button variant="secondary" className="rounded-xl">Distribution plan খুলুন</Button>
          </CardContent>
        </Card>
      </section>

      <Tabs defaultValue="shares" className="space-y-4">
        <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-2xl bg-muted/70 p-1.5">
          <TabsTrigger value="shares" className="rounded-xl px-4 py-2.5">Participants & Shares</TabsTrigger>
          <TabsTrigger value="animals" className="rounded-xl px-4 py-2.5">Animals</TabsTrigger>
          <TabsTrigger value="operations" className="rounded-xl px-4 py-2.5">Operations</TabsTrigger>
        </TabsList>

        <TabsContent value="shares">
          <Card className="gap-0 overflow-hidden rounded-3xl border-border/75 py-0 shadow-none">
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h2 className="text-lg font-bold">শেয়ার ও পেমেন্ট</h2>
                <p className="text-sm text-muted-foreground">Participant-wise contribution and due tracking</p>
              </div>
              <Button variant="outline" size="sm" className="gap-2 rounded-xl"><Download className="size-4" /> XLSX</Button>
            </div>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/35">
                  <TableHead className="pl-5">অংশগ্রহণকারী</TableHead><TableHead>পশু</TableHead><TableHead>শেয়ার</TableHead><TableHead>মোট</TableHead><TableHead>পরিশোধ</TableHead><TableHead className="pr-5">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shares.map((share) => (
                  <TableRow key={share.participant}>
                    <TableCell className="pl-5 font-semibold">{share.participant}</TableCell><TableCell>{share.animal}</TableCell><TableCell>{share.shares}</TableCell><TableCell>{share.total}</TableCell><TableCell>{share.paid}</TableCell>
                    <TableCell className="pr-5"><StatusBadge status={share.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="animals">
          <Card className="gap-0 overflow-hidden rounded-3xl border-border/75 py-0 shadow-none">
            <div className="flex items-center justify-between border-b p-5">
              <div><h2 className="text-lg font-bold">পশু ও procurement</h2><p className="text-sm text-muted-foreground">Purchase, verification and share assignment</p></div>
              <Button variant="outline" size="sm" className="gap-2 rounded-xl"><Download className="size-4" /> XLSX</Button>
            </div>
            <Table>
              <TableHeader><TableRow className="bg-muted/35"><TableHead className="pl-5">Tag</TableHead><TableHead>ধরন</TableHead><TableHead>Vendor</TableHead><TableHead>মূল্য</TableHead><TableHead>Assigned</TableHead><TableHead className="pr-5">Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {animals.map((animal) => (
                  <TableRow key={animal.tag}><TableCell className="pl-5 font-bold">{animal.tag}</TableCell><TableCell>{animal.type}</TableCell><TableCell>{animal.vendor}</TableCell><TableCell>{animal.price}</TableCell><TableCell>{animal.shares}</TableCell><TableCell className="pr-5"><StatusBadge status={animal.status} /></TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="operations">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { title: "Purchase approvals", text: "২টি quotation review বাকি", icon: ReceiptText },
              { title: "Kurbani day", text: "Schedule ও team assignment", icon: ClipboardCheck },
              { title: "Packaging", text: "Label, token ও weight plan", icon: PackageCheck },
              { title: "Year closing", text: "Financial reconciliation ও approval", icon: CheckCircle2 },
            ].map((item) => (
              <Card key={item.title} className="rounded-2xl border-border/75 py-0 shadow-none">
                <CardContent className="p-5">
                  <item.icon className="size-5 text-primary" />
                  <h3 className="mt-4 font-bold">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.text}</p>
                  <Button variant="ghost" size="sm" className="mt-4 -ml-3 rounded-xl text-primary">Open module</Button>
                </CardContent>
              </Card>
            ))}
          </section>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Paid: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    Partial: "bg-amber-500/12 text-amber-700 dark:text-amber-300",
    Due: "bg-red-500/12 text-red-700 dark:text-red-300",
    Purchased: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    Verified: "bg-blue-500/12 text-blue-700 dark:text-blue-300",
    Planned: "bg-muted text-muted-foreground",
  };
  return <Badge className={styles[status] ?? ""} variant="secondary">{status}</Badge>;
}
