"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Download, Eye, Filter, Search, UserCheck, UserRoundPlus, X } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Applicant = {
  id: number;
  name: string;
  english: string;
  relation: string;
  sponsor: string;
  requestedRole: string;
  submitted: string;
  initials: string;
  duplicate: boolean;
};

const initialApplicants: Applicant[] = [
  { id: 1, name: "মেহেদী হাসান", english: "Mehedi Hasan", relation: "রাশেদের ছেলে", sponsor: "মো. রাশেদ", requestedRole: "সাধারণ সদস্য", submitted: "১২ মিনিট আগে", initials: "মে", duplicate: false },
  { id: 2, name: "নাজিয়া রহমান", english: "Nazia Rahman", relation: "নাসরিনের মেয়ে", sponsor: "নাসরিন আক্তার", requestedRole: "সাধারণ সদস্য", submitted: "১ ঘণ্টা আগে", initials: "না", duplicate: true },
  { id: 3, name: "তানভীর মনছুফ", english: "Tanvir Monsuf", relation: "আব্দুল করিমের নাতি", sponsor: "Family invitation", requestedRole: "সাধারণ সদস্য", submitted: "গতকাল", initials: "তা", duplicate: false },
  { id: 4, name: "সাবিহা সুলতানা", english: "Sabiha Sultana", relation: "বিবাহসূত্রে সদস্য", sponsor: "শারমিন হক", requestedRole: "সদস্য", submitted: "২ দিন আগে", initials: "সা", duplicate: false },
];

export function MemberApprovals() {
  const [applicants, setApplicants] = useState(initialApplicants);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Applicant | null>(null);

  const visibleApplicants = useMemo(
    () =>
      applicants.filter((applicant) =>
        `${applicant.name} ${applicant.english} ${applicant.relation}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [applicants, query],
  );

  function completeReview(id: number) {
    setApplicants((items) => items.filter((item) => item.id !== id));
    setSelected(null);
  }

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
          name: "list_pending_member_requests",
          title: "List pending family members",
          description: "Read the currently pending Sheikh Monsuf Family membership requests shown in the approval centre.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: () => ({
            count: applicants.length,
            requests: applicants.map(({ id, name, english, relation, duplicate }) => ({ id, name, english, relation, duplicate })),
          }),
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    void Promise.resolve(
      modelContext.registerTool(
        {
          name: "review_member_request",
          title: "Review a family member request",
          description: "Approve or reject one visible pending membership request for Sheikh Monsuf Family.",
          inputSchema: {
            type: "object",
            properties: {
              requestId: { type: "number" },
              decision: { type: "string", enum: ["approve", "reject"] },
            },
            required: ["requestId", "decision"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: false },
          execute: (input: unknown) => {
            const value = input as { requestId?: unknown; decision?: unknown };
            if (typeof value.requestId !== "number" || !["approve", "reject"].includes(String(value.decision))) {
              throw new Error("A valid requestId and decision are required.");
            }
            const request = applicants.find((item) => item.id === value.requestId);
            if (!request) throw new Error("The membership request is not pending.");
            completeReview(request.id);
            return { requestId: request.id, member: request.english, decision: value.decision, status: "completed" };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, [applicants]);

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 md:px-7 md:py-8">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <UserCheck className="size-4" /> Family Admin workflow
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">সদস্য অনুমোদন কেন্দ্র</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            শুধু শেখ মনছুফ পরিবারের আবেদনগুলো যাচাই করুন, existing profile-এর সঙ্গে মিলিয়ে তারপর access দিন।
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2 rounded-xl">
            <Download className="size-4" /> XLSX Export
          </Button>
          <Button className="gap-2 rounded-xl">
            <UserRoundPlus className="size-4" /> সদস্য আমন্ত্রণ
          </Button>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["অপেক্ষমাণ আবেদন", applicants.length.toLocaleString("bn-BD"), "আজ ২টি নতুন"],
          ["Duplicate সতর্কতা", applicants.filter((item) => item.duplicate).length.toLocaleString("bn-BD"), "Profile মিলিয়ে দেখুন"],
          ["এই মাসে অনুমোদিত", "১৭", "গড় সময় ৪ ঘণ্টা"],
        ].map(([label, value, note]) => (
          <Card key={label} className="rounded-2xl border-border/75 py-0 shadow-none">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-3xl font-bold">{value}</p>
              <p className="mt-1 text-xs text-muted-foreground">{note}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="gap-0 overflow-hidden rounded-3xl border-border/75 py-0 shadow-none">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between md:p-5">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="নাম বা সম্পর্ক দিয়ে খুঁজুন"
              className="h-10 w-full rounded-xl border bg-background pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/15"
            />
          </div>
          <Button variant="outline" className="gap-2 rounded-xl">
            <Filter className="size-4" /> Filter
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/35">
              <TableHead className="pl-5">আবেদনকারী</TableHead>
              <TableHead>দাবিকৃত সম্পর্ক</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>অবস্থা</TableHead>
              <TableHead>সময়</TableHead>
              <TableHead className="pr-5 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleApplicants.map((applicant) => (
              <TableRow key={applicant.id}>
                <TableCell className="pl-5">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9">
                      <AvatarFallback className="bg-primary/10 text-xs font-bold text-primary">{applicant.initials}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-semibold">{applicant.name}</p>
                      <p className="text-xs text-muted-foreground">{applicant.english}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{applicant.relation}</TableCell>
                <TableCell>{applicant.sponsor}</TableCell>
                <TableCell>
                  {applicant.duplicate ? (
                    <Badge variant="outline" className="border-amber-400/60 bg-amber-500/10 text-amber-700 dark:text-amber-300">Duplicate check</Badge>
                  ) : (
                    <Badge variant="secondary">Pending review</Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">{applicant.submitted}</TableCell>
                <TableCell className="pr-5 text-right">
                  <Button variant="ghost" size="sm" className="gap-2 rounded-xl" onClick={() => setSelected(applicant)}>
                    <Eye className="size-4" /> যাচাই
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {visibleApplicants.length === 0 ? (
          <div className="px-6 py-14 text-center text-sm text-muted-foreground">কোনো আবেদন পাওয়া যায়নি।</div>
        ) : null}
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>সদস্য আবেদন যাচাই</DialogTitle>
            <DialogDescription>Relationship, existing profile এবং family reference নিশ্চিত করুন।</DialogDescription>
          </DialogHeader>
          {selected ? (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-4 rounded-2xl bg-muted/55 p-4">
                <Avatar className="size-12">
                  <AvatarFallback className="bg-primary text-primary-foreground">{selected.initials}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-lg font-bold">{selected.name}</p>
                  <p className="text-sm text-muted-foreground">{selected.english}</p>
                </div>
              </div>
              <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-muted-foreground">সম্পর্ক</dt><dd className="font-medium">{selected.relation}</dd>
                <dt className="text-muted-foreground">Reference</dt><dd className="font-medium">{selected.sponsor}</dd>
                <dt className="text-muted-foreground">Requested role</dt><dd className="font-medium">{selected.requestedRole}</dd>
                <dt className="text-muted-foreground">Duplicate check</dt><dd className="font-medium">{selected.duplicate ? "সম্ভাব্য profile পাওয়া গেছে" : "কোনো match নেই"}</dd>
              </dl>
            </div>
          ) : null}
          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" className="gap-2 rounded-xl" onClick={() => selected && completeReview(selected.id)}>
              <X className="size-4" /> Reject
            </Button>
            <Button className="gap-2 rounded-xl" onClick={() => selected && completeReview(selected.id)}>
              <Check className="size-4" /> Approve member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
