"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Download,
  GitFork,
  LoaderCircle,
  Search,
  ShieldAlert,
  Users,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { FamilyMember, FamilyRelationship } from "./member-directory";

type TreePayload = {
  family?: { id: string; name_bn: string; name_en: string };
  members?: FamilyMember[];
  relationships?: FamilyRelationship[];
  migrationRequired?: boolean;
  code?: string;
  error?: string;
};

export function FamilyTreeView() {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [relationships, setRelationships] = useState<FamilyRelationship[]>([]);
  const [family, setFamily] = useState<TreePayload["family"]>();
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FamilyMember | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    void fetch("/api/members", { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as TreePayload;
        if (payload.code === "FAMILY_SETUP_REQUIRED") {
          setSetupRequired(true);
          return;
        }
        if (!response.ok) throw new Error(payload.error ?? "Family tree load হয়নি।");
        setFamily(payload.family);
        setMembers(payload.members ?? []);
        setRelationships(payload.relationships ?? []);
        setMigrationRequired(Boolean(payload.migrationRequired));
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Family tree load হয়নি।"),
      )
      .finally(() => setLoading(false));
  }, []);

  const generations = useMemo(() => {
    const parentEdges = relationships.filter((item) => item.relationship_type === "parent");
    const childrenByParent = new Map<string, string[]>();
    const childIds = new Set<string>();
    for (const edge of parentEdges) {
      childIds.add(edge.to_member_id);
      childrenByParent.set(edge.from_member_id, [
        ...(childrenByParent.get(edge.from_member_id) ?? []),
        edge.to_member_id,
      ]);
    }

    const level = new Map<string, number>();
    const queue = members.filter((member) => !childIds.has(member.id));
    const visited = new Set<string>();
    for (const root of queue) level.set(root.id, 0);
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      const currentLevel = level.get(current.id) ?? 0;
      for (const childId of childrenByParent.get(current.id) ?? []) {
        const child = members.find((member) => member.id === childId);
        if (!child) continue;
        level.set(child.id, Math.max(level.get(child.id) ?? 0, currentLevel + 1));
        if (!visited.has(child.id)) queue.push(child);
      }
    }
    for (const member of members) if (!level.has(member.id)) level.set(member.id, 0);

    const grouped = new Map<number, FamilyMember[]>();
    for (const member of members) {
      const memberLevel = level.get(member.id) ?? 0;
      grouped.set(memberLevel, [...(grouped.get(memberLevel) ?? []), member]);
    }
    return [...grouped.entries()].sort(([a], [b]) => a - b);
  }, [members, relationships]);

  async function exportTree() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const byId = new Map(members.map((member) => [member.id, member]));
      const memberSheet = XLSX.utils.json_to_sheet(
        members.map((member) => ({
          "নাম (বাংলা)": member.name_bn,
          "Name (English)": member.name_en ?? "",
          "সম্পর্ক": member.relationship_text ?? "",
          "জন্মতারিখ": member.date_of_birth ?? "",
          "রক্তের গ্রুপ": member.blood_group ?? "",
          "পেশা": member.occupation ?? "",
        })),
      );
      const relationshipSheet = XLSX.utils.json_to_sheet(
        relationships.map((item) => ({
          From: byId.get(item.from_member_id)?.name_en ?? byId.get(item.from_member_id)?.name_bn ?? "",
          Relationship: item.relationship_type,
          To: byId.get(item.to_member_id)?.name_en ?? byId.get(item.to_member_id)?.name_bn ?? "",
        })),
      );
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, memberSheet, "Members");
      XLSX.utils.book_append_sheet(workbook, relationshipSheet, "Relationships");
      XLSX.writeFile(workbook, `${family?.name_en?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "family"}-tree.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  if (setupRequired) {
    return (
      <main className="mx-auto w-full max-w-[1500px] px-4 py-8 md:px-7">
        <Card className="rounded-3xl border-amber-500/30 py-0 shadow-none"><CardContent className="flex flex-col items-start gap-5 p-7 md:flex-row md:items-center"><ShieldAlert className="size-10 text-amber-700" /><div className="flex-1"><h1 className="text-2xl font-bold">Family Owner setup বাকি</h1><p className="mt-1 text-muted-foreground">Tree তৈরির আগে প্রথম পরিবার সক্রিয় করুন।</p></div><Button asChild className="rounded-xl"><a href="/setup">Owner setup খুলুন</a></Button></CardContent></Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 md:px-7 md:py-8">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><GitFork className="size-4" /> Interactive genealogy</div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">ইন্টারঅ্যাক্টিভ ফ্যামিলি ট্রি</h1><p className="mt-1 text-muted-foreground">প্রজন্ম ও parent connection ধরে পরিবারের কাঠামো দেখুন।</p></div>
        <div className="flex flex-wrap gap-2"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="সদস্য খুঁজুন" className="w-56 rounded-xl pl-9" /></div><Button variant="outline" className="gap-2 rounded-xl" disabled={!members.length || exporting} onClick={() => void exportTree()}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} XLSX</Button></div>
      </section>

      {migrationRequired ? <div className="rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">Relationship migration এখনও apply হয়নি। Member card দেখা যাবে, কিন্তু parent-child connection migration-এর পরে সক্রিয় হবে।</div> : null}
      {error ? <div className="rounded-2xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">{error}</div> : null}

      <Card className="min-h-[560px] overflow-hidden rounded-3xl border-border/75 py-0 shadow-none">
        <CardContent className="p-5 md:p-8">
          {loading ? <div className="flex min-h-[480px] items-center justify-center gap-3 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /> Family tree load হচ্ছে</div> : !members.length ? <div className="flex min-h-[480px] flex-col items-center justify-center text-center"><Users className="size-11 text-muted-foreground/45" /><h2 className="mt-4 text-xl font-bold">Tree শুরু করার মতো সদস্য নেই</h2><p className="mt-1 text-sm text-muted-foreground">Directory থেকে প্রথম member profile যোগ করুন।</p><Button asChild className="mt-5 rounded-xl"><a href="/directory">সদস্য ডিরেক্টরি খুলুন</a></Button></div> : <div className="space-y-8">
            {generations.map(([generation, items], index) => (
              <section key={generation} className="relative">
                {index > 0 ? <div className="mx-auto mb-3 h-7 w-px bg-border" /> : null}
                <div className="mb-4 flex items-center justify-center gap-2"><Badge variant="secondary" className="rounded-full px-3">প্রজন্ম {Number(generation + 1).toLocaleString("bn-BD")}</Badge><span className="text-xs text-muted-foreground">{items.length.toLocaleString("bn-BD")} জন</span></div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {items.map((member) => {
                    const match = !query.trim() || `${member.name_bn} ${member.name_en ?? ""}`.toLowerCase().includes(query.toLowerCase());
                    return <button key={member.id} type="button" onClick={() => setSelected(member)} className={`rounded-2xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${match ? "opacity-100" : "opacity-35"}`}><div className="flex items-center gap-3"><Avatar className="size-11"><AvatarFallback className="bg-primary/10 font-bold text-primary">{member.name_bn.slice(0, 2)}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate font-bold">{member.name_bn}</p><p className="truncate text-xs text-muted-foreground">{member.name_en || member.relationship_text || "Family member"}</p></div></div><div className="mt-4 flex flex-wrap gap-2">{member.relationship_text ? <Badge variant="outline">{member.relationship_text}</Badge> : null}{member.blood_group ? <Badge variant="secondary">{member.blood_group}</Badge> : null}</div></button>;
                  })}
                </div>
              </section>
            ))}
          </div>}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="rounded-3xl sm:max-w-lg"><DialogHeader><DialogTitle>{selected?.name_bn}</DialogTitle><DialogDescription>{selected?.name_en || "Family member profile"}</DialogDescription></DialogHeader>{selected ? <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 rounded-2xl bg-muted/45 p-5 text-sm"><span className="text-muted-foreground">সম্পর্ক</span><strong>{selected.relationship_text || "—"}</strong><span className="text-muted-foreground">জন্মতারিখ</span><strong>{selected.date_of_birth || "—"}</strong><span className="text-muted-foreground">রক্তের গ্রুপ</span><strong>{selected.blood_group || "—"}</strong><span className="text-muted-foreground">পেশা</span><strong>{selected.occupation || "—"}</strong><span className="text-muted-foreground">অবস্থান</span><strong>{[selected.city, selected.country].filter(Boolean).join(", ") || "—"}</strong></div> : null}</DialogContent></Dialog>
    </main>
  );
}
