"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, GitFork, LocateFixed, LoaderCircle, Minus, Move, Plus, Search, ShieldAlert, Sparkles, Users } from "lucide-react";

import { useActionFeedback } from "@/components/action-modal-provider";
import { useLocale, type AppLocale } from "@/components/locale-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FamilyMember, FamilyRelationship } from "./member-directory";

type TreePayload = {
  family?: { id: string; name_bn: string; name_en: string };
  members?: FamilyMember[];
  relationships?: FamilyRelationship[];
  viewerMemberId?: string | null;
  migrationRequired?: boolean;
  code?: string;
  error?: string;
};

type Point = { x: number; y: number };
const scaleMin = 0.45;
const scaleMax = 1.8;

export function FamilyTreeView() {
  const { locale, pick } = useLocale();
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [relationships, setRelationships] = useState<FamilyRelationship[]>([]);
  const [family, setFamily] = useState<TreePayload["family"]>();
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<FamilyMember | null>(null);
  const [pathStartId, setPathStartId] = useState("");
  const [pathEndId, setPathEndId] = useState("");
  const [viewerMemberId, setViewerMemberId] = useState("");
  const [exporting, setExporting] = useState(false);
  const [scale, setScale] = useState(0.85);
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [, setFeedback] = useActionFeedback();
  const drag = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/members", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as TreePayload;
        if (payload.code === "FAMILY_SETUP_REQUIRED") return { ...payload, setup: true };
        if (!response.ok) throw new Error(payload.error ?? pick("ফ্যামিলি ট্রি লোড হয়নি।", "Family tree could not be loaded."));
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        if ("setup" in payload) {
          setSetupRequired(true);
          return;
        }
        setFamily(payload.family);
        setMembers(payload.members ?? []);
        setRelationships(payload.relationships ?? []);
        setViewerMemberId(payload.viewerMemberId ?? "");
        setPathStartId((current) => current || payload.viewerMemberId || "");
        setMigrationRequired(Boolean(payload.migrationRequired));
      })
      .catch((error: unknown) => {
        if (active) setFeedback(error instanceof Error ? error.message : pick("ফ্যামিলি ট্রি লোড হয়নি।", "Family tree could not be loaded."));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [pick, setFeedback]);

  const model = useMemo(() => buildTreeModel(members, relationships), [members, relationships]);
  const path = useMemo(() => findPath(pathStartId, pathEndId, relationships), [pathEndId, pathStartId, relationships]);
  const highlightedNodes = useMemo(() => new Set(path), [path]);
  const pathLabel = useMemo(() => relationshipLabel(pathStartId, pathEndId, path, relationships, members, locale), [locale, members, path, pathEndId, pathStartId, relationships]);
  const viewerRelations = useMemo(() => new Map(members.map((member) => { const memberPath = findPath(viewerMemberId, member.id, relationships); return [member.id, relationshipLabel(viewerMemberId, member.id, memberPath, relationships, members, locale)]; })), [locale, members, relationships, viewerMemberId]);
  const queryNeedle = query.trim().toLowerCase();
  const matchedIds = useMemo(() => new Set(members
    .filter((member) => !queryNeedle || [member.name_bn, member.name_en, member.relationship_text, member.occupation]
      .filter(Boolean).join(" ").toLowerCase().includes(queryNeedle))
    .map((member) => member.id)), [members, queryNeedle]);

  async function exportTree() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const byId = new Map(members.map((member) => [member.id, member]));
      const memberSheet = XLSX.utils.json_to_sheet(members.map((member) => ({
        "নাম (বাংলা)": member.name_bn,
        "Name (English)": member.name_en ?? "",
        "সম্পর্ক": member.relationship_text ?? "",
        "প্রজন্ম": (model.levels.get(member.id) ?? 0) + 1,
        "জন্মতারিখ": member.date_of_birth ?? "",
        "রক্তের গ্রুপ": member.blood_group ?? "",
        "পেশা": member.occupation ?? "",
        "শহর": member.city ?? "",
        "দেশ": member.country ?? "",
      })));
      const relationshipSheet = XLSX.utils.json_to_sheet(relationships.map((item) => ({
        From: byId.get(item.from_member_id)?.name_en ?? byId.get(item.from_member_id)?.name_bn ?? "",
        Relationship: item.relationship_type,
        To: byId.get(item.to_member_id)?.name_en ?? byId.get(item.to_member_id)?.name_bn ?? "",
      })));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, memberSheet, "Members");
      XLSX.utils.book_append_sheet(workbook, relationshipSheet, "Relationships");
      XLSX.writeFile(workbook, `${family?.name_en?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "family"}-tree.xlsx`);
      setFeedback(pick("Family Tree XLSX সফলভাবে তৈরি হয়েছে।", "Family Tree XLSX was created successfully."));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : pick("Family Tree XLSX তৈরি হয়নি।", "Family Tree XLSX could not be created."));
    } finally {
      setExporting(false);
    }
  }

  function resetViewport() {
    setScale(0.85);
    setOffset({ x: 0, y: 0 });
  }

  function pointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: offset.x, originY: offset.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function pointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    setOffset({ x: current.originX + event.clientX - current.x, y: current.originY + event.clientY - current.y });
  }

  function pointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (drag.current?.pointerId === event.pointerId) drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  if (setupRequired) {
    return <main className="mx-auto w-full max-w-[1500px] px-4 py-8 md:px-7"><Card className="rounded-3xl border-amber-500/30 py-0 shadow-none"><CardContent className="flex flex-col items-start gap-5 p-7 md:flex-row md:items-center"><ShieldAlert className="size-10 text-amber-700" /><div className="flex-1"><h1 className="text-2xl font-bold">{pick("ফ্যামিলি access সক্রিয় নয়", "Family access is not active")}</h1><p className="mt-1 text-muted-foreground">{pick("Join code দিয়ে আবেদন করুন। Admin অনুমোদনের পর Family Tree ব্যবহার করা যাবে।", "Apply with a join code. You can use Family Tree after admin approval.")}</p></div><Button asChild className="rounded-xl"><a href="/setup">{pick("Family onboarding খুলুন", "Open family onboarding")}</a></Button></CardContent></Card></main>;
  }

  return <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 md:px-7 md:py-8">
    <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><GitFork className="size-4" /> {pick("ইন্টারঅ্যাক্টিভ বংশতালিকা", "Interactive genealogy")}</div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">{pick("ইন্টারঅ্যাক্টিভ ফ্যামিলি ট্রি", "Interactive Family Tree")}</h1><p className="mt-1 text-muted-foreground">{pick("Recursive branch, zoom, pan এবং দুই সদস্যের সম্পর্কের পথ একসাথে দেখুন।", "Explore recursive branches, zoom, pan, and the relationship path between two members.")}</p></div>
      <div className="flex flex-wrap gap-2"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pick("সদস্য খুঁজুন", "Search members")} className="w-56 rounded-xl pl-9" /></div><Button variant="outline" className="gap-2 rounded-xl" disabled={!members.length || exporting} onClick={() => void exportTree()}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} XLSX</Button></div>
    </section>

    {migrationRequired ? <div className="rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">{pick("Relationship migration এখনও apply হয়নি। Member card দেখা যাবে, কিন্তু parent-child connection migration-এর পরে সক্রিয় হবে।", "The relationship migration has not been applied yet. Member cards remain visible, but parent-child connections activate after the migration.")}</div> : null}

    <Card className="rounded-3xl border-border/75 py-0 shadow-none"><CardContent className="grid gap-4 p-4 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
      <div className="space-y-2"><label className="text-sm font-semibold">{pick("প্রথম সদস্য", "First member")}</label><Select value={pathStartId || "none"} onValueChange={(value) => setPathStartId(value === "none" ? "" : value)}><SelectTrigger className="w-full rounded-xl"><SelectValue placeholder={pick("সদস্য নির্বাচন", "Select member")} /></SelectTrigger><SelectContent><SelectItem value="none">{pick("নির্বাচন করুন", "Select")}</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id}>{locale === "en" ? member.name_en || member.name_bn : member.name_bn}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><label className="text-sm font-semibold">{pick("দ্বিতীয় সদস্য", "Second member")}</label><Select value={pathEndId || "none"} onValueChange={(value) => setPathEndId(value === "none" ? "" : value)}><SelectTrigger className="w-full rounded-xl"><SelectValue placeholder={pick("সদস্য নির্বাচন", "Select member")} /></SelectTrigger><SelectContent><SelectItem value="none">{pick("নির্বাচন করুন", "Select")}</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id}>{locale === "en" ? member.name_en || member.name_bn : member.name_bn}</SelectItem>)}</SelectContent></Select></div>
      <div className="rounded-2xl border bg-primary/5 px-4 py-3 text-sm lg:min-w-64"><div className="flex items-center gap-2 font-semibold text-primary"><Sparkles className="size-4" /> {pick("সম্পর্ক", "Relationship")}</div><p className="mt-1 text-muted-foreground">{pathLabel}</p></div>
    </CardContent></Card>

    <Card className="overflow-hidden rounded-3xl border-border/75 py-0 shadow-none">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3"><div className="flex items-center gap-2 text-sm text-muted-foreground"><Move className="size-4" /> {pick("খালি জায়গা drag করে pan করুন · card click করলে বিস্তারিত", "Drag empty space to pan · click a card for details")}</div><div className="flex items-center gap-1"><Button size="icon-sm" variant="outline" aria-label={pick("Zoom কমান", "Zoom out")} onClick={() => setScale((value) => Math.max(scaleMin, Number((value - 0.1).toFixed(2))))}><Minus /></Button><span className="min-w-14 text-center text-xs font-semibold">{Math.round(scale * 100)}%</span><Button size="icon-sm" variant="outline" aria-label={pick("Zoom বাড়ান", "Zoom in")} onClick={() => setScale((value) => Math.min(scaleMax, Number((value + 0.1).toFixed(2))))}><Plus /></Button><Button size="icon-sm" variant="outline" aria-label={pick("Tree view reset করুন", "Reset tree view")} onClick={resetViewport}><LocateFixed /></Button></div></div>
      <div className="relative min-h-[620px] touch-none cursor-grab overflow-hidden bg-[radial-gradient(circle_at_1px_1px,var(--border)_1px,transparent_0)] bg-[size:24px_24px] active:cursor-grabbing" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
        {loading ? <div className="absolute inset-0 flex items-center justify-center gap-3 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /> {pick("Family tree লোড হচ্ছে", "Loading family tree")}</div> : !members.length ? <div className="absolute inset-0 flex flex-col items-center justify-center text-center"><Users className="size-11 text-muted-foreground/45" /><h2 className="mt-4 text-xl font-bold">{pick("Tree শুরু করার মতো সদস্য নেই", "No members available to start the tree")}</h2><p className="mt-1 text-sm text-muted-foreground">{pick("Directory থেকে প্রথম member profile যোগ করুন।", "Add the first member profile from the Directory.")}</p><Button asChild className="mt-5 rounded-xl"><a href="/directory">{pick("সদস্য ডিরেক্টরি খুলুন", "Open member directory")}</a></Button></div> : <div className="absolute left-1/2 top-12 origin-top transition-transform duration-150" style={{ transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px) scale(${scale})` }}><div className="flex min-w-max items-start justify-center gap-14 px-12 pb-24">{model.roots.map((root) => <TreeBranch key={root.id} member={root} childrenByParent={model.childrenByParent} highlightedNodes={highlightedNodes} matchedIds={matchedIds} queryActive={Boolean(queryNeedle)} onSelect={setSelected} visited={new Set()} viewerRelations={viewerRelations} viewerMemberId={viewerMemberId} />)}</div></div>}
      </div>
    </Card>

    <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><DialogContent className="rounded-3xl sm:max-w-lg"><DialogHeader><DialogTitle>{locale === "en" ? selected?.name_en || selected?.name_bn : selected?.name_bn}</DialogTitle><DialogDescription>{locale === "bn" ? selected?.name_en || "ফ্যামিলি সদস্যের profile" : selected?.name_bn || "Family member profile"}</DialogDescription></DialogHeader>{selected ? <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-3 rounded-2xl bg-muted/45 p-5 text-sm"><span className="text-muted-foreground">{pick("আমার সাথে", "Relation to me")}</span><strong>{viewerMemberId ? viewerRelations.get(selected.id) ?? pick("Connection পাওয়া যায়নি", "No connection found") : pick("নিজের member profile link করা নেই", "Your member profile is not linked")}</strong><span className="text-muted-foreground">{pick("পরিবারে পরিচয়", "Family identity")}</span><strong>{selected.relationship_text || "—"}</strong><span className="text-muted-foreground">{pick("প্রজন্ম", "Generation")}</span><strong>{Number((model.levels.get(selected.id) ?? 0) + 1).toLocaleString(locale === "bn" ? "bn-BD" : "en-US")}</strong><span className="text-muted-foreground">{pick("জন্মতারিখ", "Date of birth")}</span><strong>{selected.date_of_birth || "—"}</strong><span className="text-muted-foreground">{pick("রক্তের গ্রুপ", "Blood group")}</span><strong>{selected.blood_group || "—"}</strong><span className="text-muted-foreground">{pick("পেশা", "Occupation")}</span><strong>{selected.occupation || "—"}</strong><span className="text-muted-foreground">{pick("অবস্থান", "Location")}</span><strong>{[selected.city, selected.country].filter(Boolean).join(", ") || "—"}</strong></div> : null}</DialogContent></Dialog>
  </main>;
}

function TreeBranch({ member, childrenByParent, highlightedNodes, matchedIds, queryActive, onSelect, visited, viewerRelations, viewerMemberId }: { member: FamilyMember; childrenByParent: Map<string, FamilyMember[]>; highlightedNodes: Set<string>; matchedIds: Set<string>; queryActive: boolean; onSelect: (member: FamilyMember) => void; visited: Set<string>; viewerRelations: Map<string, string>; viewerMemberId: string }) {
  const { locale, pick } = useLocale();
  const nextVisited = new Set(visited);
  const repeated = nextVisited.has(member.id);
  nextVisited.add(member.id);
  const children = repeated ? [] : childrenByParent.get(member.id) ?? [];
  const highlighted = highlightedNodes.has(member.id);
  const match = matchedIds.has(member.id);
  return <div className="flex flex-col items-center"><button type="button" onClick={() => onSelect(member)} className={`w-52 rounded-2xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${highlighted ? "border-primary bg-primary/8 ring-4 ring-primary/10" : "border-border"} ${queryActive && !match ? "opacity-30 grayscale" : "opacity-100"}`}><div className="flex items-center gap-3"><Avatar className="size-11">{member.profile_photo_file_id ? <AvatarImage src={`/api/archive-file/${member.profile_photo_file_id}`} alt={member.name_bn} className="object-cover" /> : null}<AvatarFallback className="bg-primary/10 font-bold text-primary">{member.name_bn.slice(0, 2)}</AvatarFallback></Avatar><div className="min-w-0"><p className="truncate font-bold">{locale === "en" ? member.name_en || member.name_bn : member.name_bn}</p><p className="truncate text-xs text-muted-foreground">{locale === "en" ? member.name_bn : member.name_en || member.occupation || pick("পরিবারের সদস্য", "Family member")}</p></div></div><div className="mt-3 flex flex-wrap gap-1.5">{viewerMemberId ? <Badge variant={member.id === viewerMemberId ? "secondary" : "outline"} className="max-w-full truncate">{member.id === viewerMemberId ? pick("আমার profile", "My profile") : pick(`আমার ${viewerRelations.get(member.id) ?? "আত্মীয়"}`, `My ${viewerRelations.get(member.id) ?? "relative"}`)}</Badge> : member.relationship_text ? <Badge variant="outline" className="max-w-full truncate">{member.relationship_text}</Badge> : null}{member.blood_group ? <Badge variant="secondary">{member.blood_group}</Badge> : null}</div></button>{children.length ? <><div className={`h-7 border-l ${highlighted ? "border-primary" : "border-border"}`} /><div className={`flex items-start gap-6 border-t pt-7 ${highlighted ? "border-primary" : "border-border"}`}>{children.map((child) => <div key={child.id} className="relative before:absolute before:-top-7 before:left-1/2 before:h-7 before:border-l before:border-border"><TreeBranch member={child} childrenByParent={childrenByParent} highlightedNodes={highlightedNodes} matchedIds={matchedIds} queryActive={queryActive} onSelect={onSelect} visited={nextVisited} viewerRelations={viewerRelations} viewerMemberId={viewerMemberId} /></div>)}</div></> : null}</div>;
}

function buildTreeModel(members: FamilyMember[], relationships: FamilyRelationship[]) {
  const byId = new Map(members.map((member) => [member.id, member]));
  const parentEdges = relationships.filter((item) => item.relationship_type === "parent" && byId.has(item.from_member_id) && byId.has(item.to_member_id));
  const primaryParent = new Map<string, string>();
  parentEdges.forEach((edge) => { if (!primaryParent.has(edge.to_member_id)) primaryParent.set(edge.to_member_id, edge.from_member_id); });
  const childrenByParent = new Map<string, FamilyMember[]>();
  primaryParent.forEach((parentId, childId) => { const child = byId.get(childId); if (child) childrenByParent.set(parentId, [...(childrenByParent.get(parentId) ?? []), child]); });
  const roots = members.filter((member) => !primaryParent.has(member.id));
  const safeRoots = roots.length ? roots : members;
  const levels = new Map<string, number>();
  const queue = safeRoots.map((member) => ({ id: member.id, level: 0 }));
  while (queue.length) { const current = queue.shift(); if (!current || levels.has(current.id)) continue; levels.set(current.id, current.level); (childrenByParent.get(current.id) ?? []).forEach((child) => queue.push({ id: child.id, level: current.level + 1 })); }
  members.forEach((member) => { if (!levels.has(member.id)) levels.set(member.id, 0); });
  return { roots: safeRoots, childrenByParent, levels };
}

function findPath(startId: string, endId: string, relationships: FamilyRelationship[]) {
  if (!startId || !endId) return [];
  if (startId === endId) return [startId];
  const graph = new Map<string, string[]>();
  relationships.forEach((edge) => { graph.set(edge.from_member_id, [...(graph.get(edge.from_member_id) ?? []), edge.to_member_id]); graph.set(edge.to_member_id, [...(graph.get(edge.to_member_id) ?? []), edge.from_member_id]); });
  const queue: string[][] = [[startId]];
  const visited = new Set([startId]);
  while (queue.length) { const current = queue.shift(); if (!current) break; const last = current[current.length - 1]; for (const next of graph.get(last) ?? []) { if (visited.has(next)) continue; const candidate = [...current, next]; if (next === endId) return candidate; visited.add(next); queue.push(candidate); } }
  return [];
}

function relationshipLabel(startId: string, endId: string, path: string[], relationships: FamilyRelationship[], members: FamilyMember[], locale: AppLocale) {
  const p = (bangla: string, english: string) => locale === "bn" ? bangla : english;
  if (!startId || !endId) return p("দুইজন সদস্য নির্বাচন করুন", "Select two members");
  if (!path.length) return p("কোনো connected relationship path পাওয়া যায়নি", "No connected relationship path was found");
  if (path.length === 1) return p("একই সদস্য", "Same member");
  const byId = new Map(members.map((member) => [member.id, member]));
  const target = byId.get(endId);
  const gendered = (male: string, female: string, neutral: string) => target?.gender === "male" ? male : target?.gender === "female" ? female : neutral;
  const steps = path.slice(0, -1).map((id, index) => {
    const next = path[index + 1];
    const edge = relationships.find((item) => (item.from_member_id === id && item.to_member_id === next) || (item.from_member_id === next && item.to_member_id === id));
    if (!edge) return "other";
    if (edge.relationship_type === "spouse") return "spouse";
    if (edge.relationship_type === "guardian") return edge.from_member_id === id ? "dependent" : "guardian";
    return edge.from_member_id === id ? "down" : "up";
  });
  const pattern = steps.join(",");
  if (pattern === "spouse") return locale === "bn" ? gendered("স্বামী", "স্ত্রী", "জীবনসঙ্গী") : gendered("husband", "wife", "spouse");
  if (pattern === "up") return locale === "bn" ? gendered("বাবা", "মা", "অভিভাবক") : gendered("father", "mother", "parent");
  if (pattern === "down") return locale === "bn" ? gendered("ছেলে", "মেয়ে", "সন্তান") : gendered("son", "daughter", "child");
  if (pattern === "up,up") return locale === "bn" ? gendered("দাদা/নানা", "দাদি/নানি", "দাদা-দাদি/নানা-নানি") : gendered("grandfather", "grandmother", "grandparent");
  if (pattern === "down,down") return locale === "bn" ? gendered("নাতি", "নাতনি", "নাতি-নাতনি") : gendered("grandson", "granddaughter", "grandchild");
  if (pattern === "up,down") return locale === "bn" ? gendered("ভাই", "বোন", "সহোদর") : gendered("brother", "sister", "sibling");
  if (pattern === "up,up,down") return locale === "bn" ? gendered("চাচা/মামা", "ফুপু/খালা", "চাচা-মামা/ফুপু-খালা") : gendered("uncle", "aunt", "uncle/aunt");
  if (pattern === "up,up,down,down") return p("কাজিন", "cousin");
  if (["up,down,spouse", "spouse,up,down"].includes(pattern)) return locale === "bn" ? gendered("দুলাভাই/ভগ্নিপতি", "ভাবি/ননদ", "শ্বশুরবাড়ির আত্মীয়") : "in-law";
  if (pattern === "down,spouse") return locale === "bn" ? gendered("জামাই", "পুত্রবধূ", "সন্তানের জীবনসঙ্গী") : gendered("son-in-law", "daughter-in-law", "child's spouse");
  if (["spouse,up", "up,spouse"].includes(pattern)) return locale === "bn" ? gendered("শ্বশুর/বাবা", "শাশুড়ি/মা", "শ্বশুর-শাশুড়ি") : gendered("father-in-law", "mother-in-law", "parent-in-law");
  if (pattern === "guardian") return p("অভিভাবক", "guardian");
  if (pattern === "dependent") return p("নির্ভরশীল", "dependent");
  return p(`${(path.length - 1).toLocaleString("bn-BD")} ধাপের পারিবারিক connection`, `${(path.length - 1).toLocaleString("en-US")}-step family connection`);
}
