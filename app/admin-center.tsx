"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Download,
  KeyRound,
  LoaderCircle,
  Save,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  Users,
} from "lucide-react";

import { useActionFeedback } from "@/components/action-modal-provider";
import { useLocale } from "@/components/locale-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FamilyRole } from "@/lib/family-access";

type MembershipStatus = "active" | "suspended" | "left";

type Membership = {
  id: string;
  auth_user_id: string;
  role: FamilyRole;
  status: MembershipStatus;
  created_at: string;
  updated_at: string;
  profile: {
    id: string;
    name_bn: string;
    name_en: string | null;
    email: string | null;
    phone: string | null;
    relationship_text: string | null;
  } | null;
};

type AuditLog = {
  id: number;
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type AdminPayload = {
  family?: { id: string; name_bn: string; name_en: string } | null;
  viewer?: { userId: string; role: FamilyRole };
  permissions?: { canManageRoles: boolean };
  memberships?: Membership[];
  auditLogs?: AuditLog[];
  actorNames?: Record<string, string>;
  error?: string;
};

const roleLabelsEn: Record<FamilyRole, string> = {
  owner: "Owner",
  family_admin: "Family Admin",
  manager: "Manager",
  member: "Member",
};

const roleLabelsBn: Record<FamilyRole, string> = { owner: "মালিক", family_admin: "ফ্যামিলি অ্যাডমিন", manager: "ম্যানেজার", member: "সদস্য" };

const statusLabelsEn: Record<MembershipStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  left: "Left family",
};
const statusLabelsBn: Record<MembershipStatus, string> = { active: "সক্রিয়", suspended: "স্থগিত", left: "পরিবার ছেড়েছেন" };

export function AdminCenter() {
  const { locale, pick } = useLocale();
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-BD", { dateStyle: "medium", timeStyle: "short" }), [locale]);
  const numberLocale = locale === "bn" ? "bn-BD" : "en-BD";
  const roleLabels = useMemo(() => locale === "bn" ? roleLabelsBn : roleLabelsEn, [locale]);
  const statusLabels = useMemo(() => locale === "bn" ? statusLabelsBn : statusLabelsEn, [locale]);
  const [payload, setPayload] = useState<AdminPayload>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [query, setQuery] = useState("");
  const [auditQuery, setAuditQuery] = useState("");
  const [, setFeedback] = useActionFeedback();
  const [drafts, setDrafts] = useState<Record<string, { role: FamilyRole; status: MembershipStatus }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin", { cache: "no-store" });
      const next = await response.json() as AdminPayload;
      if (response.status === 403) { setPayload({}); setDrafts({}); setLoadError(false); return; }
      if (!response.ok) throw new Error(next.error ?? pick("অ্যাডমিন সেন্টার লোড হয়নি।", "Could not load the Admin Center."));
      setPayload(next);
      setDrafts(Object.fromEntries((next.memberships ?? []).map((item) => [item.id, { role: item.role, status: item.status }])));
      setLoadError(false);
    } catch (error) {
      setPayload({});
      setDrafts({});
      setLoadError(true);
      setFeedback(error instanceof Error ? error.message : pick("অ্যাডমিন সেন্টার লোড হয়নি।", "Could not load the Admin Center."));
    } finally {
      setLoading(false);
    }
  }, [pick, setFeedback]);

  useEffect(() => { queueMicrotask(() => void load()); }, [load]);

  const visibleMemberships = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (payload.memberships ?? []).filter((item) => !needle || [
      item.profile?.name_bn,
      item.profile?.name_en,
      item.profile?.email,
      item.profile?.phone,
      roleLabels[item.role],
      statusLabels[item.status],
    ].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [payload.memberships, query, roleLabels, statusLabels]);

  const visibleAuditLogs = useMemo(() => {
    const needle = auditQuery.trim().toLowerCase();
    return (payload.auditLogs ?? []).filter((item) => !needle || [
      item.action,
      item.entity_type,
      item.entity_id,
      payload.actorNames?.[item.actor_user_id],
      JSON.stringify(item.metadata),
    ].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [auditQuery, payload.actorNames, payload.auditLogs]);

  async function saveMembership(item: Membership) {
    const draft = drafts[item.id];
    if (!draft) return;
    setSavingId(item.id);
    try {
      const response = await fetch("/api/admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_membership", membershipId: item.id, ...draft }),
      });
      if (response.status === 499) return;
      const result = await response.json() as { membership?: Membership; error?: string; message?: string };
      if (!response.ok || !result.membership) throw new Error(result.error ?? pick("সদস্যের অ্যাক্সেস হালনাগাদ হয়নি।", "Could not update member access."));
      await load();
      setFeedback(result.message ?? pick("সদস্যের ভূমিকা ও অ্যাক্সেস হালনাগাদ হয়েছে।", "Member role and access updated."));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : pick("সদস্যের অ্যাক্সেস হালনাগাদ হয়নি।", "Could not update member access."));
    } finally {
      setSavingId(null);
    }
  }

  async function exportAuditXlsx() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const memberSheet = XLSX.utils.json_to_sheet((payload.memberships ?? []).map((item, index) => ({
        [pick("ক্রমিক", "Serial")]: index + 1,
        [pick("সদস্য", "Member")]: item.profile?.name_bn ?? pick("প্রোফাইল পাওয়া যায়নি", "Profile unavailable"),
        [pick("ইংরেজি নাম", "Name (English)")]: item.profile?.name_en ?? "",
        [pick("সম্পর্ক", "Relationship")]: item.profile?.relationship_text ?? "",
        [pick("ইমেইল", "Email")]: item.profile?.email ?? "",
        [pick("ফোন", "Phone")]: item.profile?.phone ?? "",
        [pick("ভূমিকা", "Role")]: roleLabels[item.role],
        [pick("অ্যাক্সেস", "Access")]: statusLabels[item.status],
        [pick("যোগদানের সময়", "Joined at")]: dateFormatter.format(new Date(item.created_at)),
      })));
      const auditSheet = XLSX.utils.json_to_sheet((payload.auditLogs ?? []).map((item, index) => ({
        [pick("ক্রমিক", "Serial")]: index + 1,
        [pick("সময়", "Time")]: dateFormatter.format(new Date(item.created_at)),
        [pick("কে করেছেন", "Actor")]: payload.actorNames?.[item.actor_user_id] ?? item.actor_user_id,
        [pick("অ্যাকশন", "Action")]: item.action,
        [pick("রেকর্ডের ধরন", "Record type")]: item.entity_type,
        [pick("রেকর্ড আইডি", "Record ID")]: item.entity_id ?? "",
        [pick("বিস্তারিত", "Details")]: JSON.stringify(item.metadata),
      })));
      memberSheet["!cols"] = [8, 28, 24, 22, 32, 18, 18, 18, 24].map((wch) => ({ wch }));
      auditSheet["!cols"] = [8, 24, 28, 32, 24, 38, 60].map((wch) => ({ wch }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, memberSheet, locale === "bn" ? "সদস্য ও ভূমিকা" : "Members & Roles");
      XLSX.utils.book_append_sheet(workbook, auditSheet, locale === "bn" ? "অডিট লগ" : "Audit Log");
      XLSX.writeFile(workbook, `${payload.family?.name_en?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "family"}-admin-audit.xlsx`);
      setFeedback(pick("অ্যাডমিন XLSX তৈরি হয়েছে।", "The Admin XLSX was created."));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : pick("অ্যাডমিন XLSX তৈরি হয়নি।", "The Admin XLSX could not be created."));
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <main className="grid min-h-[calc(100vh-4rem)] place-items-center text-muted-foreground"><LoaderCircle className="mr-2 inline size-5 animate-spin" /> {pick("অ্যাডমিন সেন্টার লোড হচ্ছে", "Loading Admin Center")}</main>;

  if (loadError) return <main className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-4xl place-items-center p-6 text-center"><div><ShieldAlert className="mx-auto size-10 text-muted-foreground" /><h1 className="mt-4 text-xl font-bold">{pick("অ্যাডমিন তথ্য লোড হয়নি", "Admin data did not load")}</h1><p className="mt-2 text-sm text-muted-foreground">{pick("পুরোনো তথ্য দেখানো হচ্ছে না। আবার চেষ্টা করুন।", "Previous data has been cleared. Please try again.")}</p><Button className="mt-4" onClick={() => void load()}>{pick("আবার চেষ্টা করুন", "Retry")}</Button></div></main>;

  if (!payload.viewer) {
    return <main className="mx-auto w-full max-w-4xl px-4 py-8"><Card className="rounded-3xl border-amber-500/30 py-0"><CardContent className="flex items-center gap-4 p-7"><ShieldAlert className="size-10 text-amber-700" /><div><h1 className="text-xl font-bold">{pick("অ্যাডমিন অ্যাক্সেস প্রয়োজন", "Admin access required")}</h1><p className="mt-1 text-muted-foreground">{pick("শুধু Family Owner বা Family Admin এই অংশ ব্যবহার করতে পারবেন।", "Only the Family Owner or Family Admin can use this section.")}</p></div></CardContent></Card></main>;
  }

  const members = payload.memberships ?? [];
  const activeCount = members.filter((item) => item.status === "active").length;
  const adminCount = members.filter((item) => item.status === "active" && ["owner", "family_admin"].includes(item.role)).length;

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 md:px-7 md:py-8">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary"><ShieldCheck className="size-4" /> {pick("নিরাপদ প্রশাসন", "Secure Administration")}</div><h1 className="text-2xl font-bold tracking-tight md:text-3xl">{pick("অ্যাডমিন কন্ট্রোল সেন্টার", "Admin Control Center")}</h1><p className="mt-1 text-muted-foreground">{pick("সদস্যের ভূমিকা, অ্যাকাউন্ট অ্যাক্সেস ও প্রতিটি গুরুত্বপূর্ণ পরিবর্তনের অডিট ইতিহাস পরিচালনা করুন।", "Manage member roles, account access and the audit history of every important change.")}</p></div>
        <Button variant="outline" className="gap-2 rounded-xl" disabled={exporting || (!members.length && !visibleAuditLogs.length)} onClick={() => void exportAuditXlsx()}>{exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} {pick("পূর্ণ XLSX এক্সপোর্ট", "Full XLSX Export")}</Button>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: pick("মোট অ্যাকাউন্ট", "Total accounts"), value: members.length, icon: Users },
          { label: pick("সক্রিয় অ্যাক্সেস", "Active access"), value: activeCount, icon: KeyRound },
          { label: pick("Owner ও Admin", "Owners & Admins"), value: adminCount, icon: UserCog },
          { label: pick("অডিট এন্ট্রি", "Audit entries"), value: payload.auditLogs?.length ?? 0, icon: Activity },
        ].map(({ label, value, icon: Icon }) => <Card key={label} className="rounded-2xl border-border/75 py-0 shadow-none"><CardContent className="flex items-start justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value.toLocaleString(numberLocale)}</p></div><span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-5" /></span></CardContent></Card>)}
      </section>

      <Tabs defaultValue="members">
        <TabsList className="grid w-full max-w-lg grid-cols-2"><TabsTrigger value="members">{pick("ভূমিকা ও অ্যাক্সেস", "Roles & access")}</TabsTrigger><TabsTrigger value="audit">{pick("অডিট লগ", "Audit log")}</TabsTrigger></TabsList>
        <TabsContent value="members" className="pt-4">
          <Card className="gap-0 overflow-hidden rounded-3xl border-border/75 py-0 shadow-none">
            <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between md:p-5"><div className="relative w-full md:max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pick("সদস্য, ভূমিকা, ইমেইল বা অবস্থা", "Search member, role, email or status")} className="rounded-xl pl-10" /></div><Badge variant="secondary">{visibleMemberships.length.toLocaleString(numberLocale)} {pick("অ্যাকাউন্ট", "accounts")}</Badge></div>
            <div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/35"><TableHead className="pl-5">{pick("সদস্য", "Member")}</TableHead><TableHead>{pick("যোগাযোগ", "Contact")}</TableHead><TableHead>{pick("ভূমিকা", "Role")}</TableHead><TableHead>{pick("অ্যাক্সেস", "Access")}</TableHead><TableHead>{pick("শেষ আপডেট", "Last update")}</TableHead><TableHead className="pr-5 text-right">{pick("অ্যাকশন", "Action")}</TableHead></TableRow></TableHeader><TableBody>
              {visibleMemberships.map((item) => { const draft = drafts[item.id] ?? { role: item.role, status: item.status }; const isSelf = item.auth_user_id === payload.viewer?.userId; const changed = draft.role !== item.role || draft.status !== item.status; return <TableRow key={item.id}><TableCell className="pl-5"><p className="font-semibold">{item.profile?.name_bn ?? pick("প্রোফাইল পাওয়া যায়নি", "Profile unavailable")}</p><p className="text-xs text-muted-foreground">{item.profile?.name_en || item.profile?.relationship_text || "—"}</p></TableCell><TableCell><p>{item.profile?.phone || "—"}</p><p className="text-xs text-muted-foreground">{item.profile?.email || ""}</p></TableCell><TableCell><Select value={draft.role} disabled={!payload.permissions?.canManageRoles || isSelf} onValueChange={(role) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, role: role as FamilyRole } }))}><SelectTrigger className="w-40 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(roleLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></TableCell><TableCell><Select value={draft.status} disabled={!payload.permissions?.canManageRoles || isSelf} onValueChange={(status) => setDrafts((current) => ({ ...current, [item.id]: { ...draft, status: status as MembershipStatus } }))}><SelectTrigger className="w-40 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(statusLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></TableCell><TableCell className="text-sm text-muted-foreground">{dateFormatter.format(new Date(item.updated_at))}</TableCell><TableCell className="pr-5 text-right"><Button size="sm" className="gap-2 rounded-xl" disabled={!payload.permissions?.canManageRoles || isSelf || !changed || savingId === item.id} onClick={() => void saveMembership(item).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : pick("সদস্যের অ্যাক্সেস হালনাগাদ হয়নি।", "Could not update member access.")))}>{savingId === item.id ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} {pick("সংরক্ষণ", "Save")}</Button></TableCell></TableRow>; })}
              {!visibleMemberships.length ? <TableRow><TableCell colSpan={6} className="h-40 text-center text-muted-foreground">{pick("কোনো মিল পাওয়া অ্যাকাউন্ট নেই।", "No matching account found.")}</TableCell></TableRow> : null}
            </TableBody></Table></div>
            {!payload.permissions?.canManageRoles ? <div className="border-t bg-muted/25 p-4 text-sm text-muted-foreground"><Label>{pick("শুধু দেখার অ্যাক্সেস", "Read-only access")}</Label><p className="mt-1">{pick("Family Admin অডিট দেখতে পারবেন; ভূমিকা বা অ্যাক্সেস অবস্থা শুধু Owner পরিবর্তন করবেন।", "Family Admins can view audits; only the Owner can change roles or access status.")}</p></div> : null}
          </Card>
        </TabsContent>
        <TabsContent value="audit" className="pt-4">
          <Card className="gap-0 overflow-hidden rounded-3xl border-border/75 py-0 shadow-none"><div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between md:p-5"><div className="relative w-full md:max-w-md"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={auditQuery} onChange={(event) => setAuditQuery(event.target.value)} placeholder={pick("অ্যাকশন, রেকর্ড বা ব্যবহারকারী খুঁজুন", "Search action, record or actor")} className="rounded-xl pl-10" /></div><Badge variant="secondary">{pick("শেষ", "Latest")} {visibleAuditLogs.length.toLocaleString(numberLocale)} {pick("এন্ট্রি", "entries")}</Badge></div><div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-muted/35"><TableHead className="pl-5">{pick("সময়", "Time")}</TableHead><TableHead>{pick("ব্যবহারকারী", "Actor")}</TableHead><TableHead>{pick("অ্যাকশন", "Action")}</TableHead><TableHead>{pick("রেকর্ড", "Record")}</TableHead><TableHead className="pr-5">{pick("বিস্তারিত", "Details")}</TableHead></TableRow></TableHeader><TableBody>{visibleAuditLogs.map((item) => <TableRow key={item.id}><TableCell className="whitespace-nowrap pl-5 text-sm">{dateFormatter.format(new Date(item.created_at))}</TableCell><TableCell className="font-medium">{payload.actorNames?.[item.actor_user_id] ?? pick("সিস্টেম ব্যবহারকারী", "System user")}</TableCell><TableCell><Badge variant="outline" className="font-mono text-xs">{item.action}</Badge></TableCell><TableCell><p>{item.entity_type}</p><p className="max-w-48 truncate font-mono text-xs text-muted-foreground">{item.entity_id || "—"}</p></TableCell><TableCell className="max-w-md pr-5"><p className="line-clamp-2 break-all text-xs text-muted-foreground">{Object.keys(item.metadata ?? {}).length ? JSON.stringify(item.metadata) : "—"}</p></TableCell></TableRow>)}{!visibleAuditLogs.length ? <TableRow><TableCell colSpan={5} className="h-40 text-center text-muted-foreground">{pick("কোনো মিল পাওয়া অডিট এন্ট্রি নেই।", "No matching audit entry found.")}</TableCell></TableRow> : null}</TableBody></Table></div></Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
