"use client";

import { useActionFeedback } from "@/components/action-modal-provider";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Database,
  Download,
  GitFork,
  LoaderCircle,
  MapPin,
  Link2,
  Pencil,
  Plus,
  Search,
  ShieldAlert,
  UserRoundPlus,
  Users,
  Trash2,
} from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type FamilyMember = {
  id: string;
  name_bn: string;
  name_en: string | null;
  email: string | null;
  phone: string | null;
  relationship_text: string | null;
  gender: string | null;
  date_of_birth: string | null;
  blood_group: string | null;
  occupation: string | null;
  city: string | null;
  country: string | null;
  profile_status: string;
};

export type FamilyRelationship = {
  id: string;
  from_member_id: string;
  to_member_id: string;
  relationship_type: "parent" | "spouse" | "guardian";
};

type DirectoryPayload = {
  family?: { id: string; name_bn: string; name_en: string };
  members?: FamilyMember[];
  relationships?: FamilyRelationship[];
  migrationRequired?: boolean;
  permissions?: { canManage: boolean };
  code?: string;
  error?: string;
};

type MemberForm = {
  nameBn: string;
  nameEn: string;
  relationship: string;
  gender: string;
  dateOfBirth: string;
  bloodGroup: string;
  occupation: string;
  city: string;
  country: string;
  email: string;
  phone: string;
  parentId: string;
  relationshipType: "parent" | "spouse" | "guardian";
  profileStatus: string;
};

const emptyForm: MemberForm = {
  nameBn: "",
  nameEn: "",
  relationship: "",
  gender: "",
  dateOfBirth: "",
  bloodGroup: "",
  occupation: "",
  city: "",
  country: "বাংলাদেশ",
  email: "",
  phone: "",
  parentId: "none",
  relationshipType: "parent",
  profileStatus: "active",
};

export function MemberDirectory() {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [relationships, setRelationships] = useState<FamilyRelationship[]>([]);
  const [family, setFamily] = useState<DirectoryPayload["family"]>();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
  const [relationshipOpen, setRelationshipOpen] = useState(false);
  const [relationshipForm, setRelationshipForm] = useState<{ fromMemberId: string; toMemberId: string; relationshipType: "parent" | "spouse" | "guardian" }>({ fromMemberId: "none", toMemberId: "none", relationshipType: "parent" });
  const [setupRequired, setSetupRequired] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [feedback, setFeedback] = useActionFeedback();
  const [form, setForm] = useState<MemberForm>(emptyForm);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/members", { cache: "no-store" });
      const payload = (await response.json()) as DirectoryPayload;
      if (payload.code === "FAMILY_SETUP_REQUIRED") {
        setSetupRequired(true);
        setMembers([]);
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? "Family directory পাওয়া যায়নি।");
      setFamily(payload.family);
      setMembers(payload.members ?? []);
      setRelationships(payload.relationships ?? []);
      setMigrationRequired(Boolean(payload.migrationRequired));
      setCanManage(Boolean(payload.permissions?.canManage));
      setSetupRequired(false);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Family directory পাওয়া যায়নি।");
    } finally {
      setLoading(false);
    }
  }, [setFeedback]);

  useEffect(() => {
    void Promise.resolve().then(() => loadMembers());
  }, [loadMembers]);

  const visibleMembers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((member) =>
      [
        member.name_bn,
        member.name_en,
        member.relationship_text,
        member.occupation,
        member.city,
        member.blood_group,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [members, query]);
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  const createMember = useCallback(async (input: MemberForm) => {
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, parentId: input.parentId === "none" ? null : input.parentId }),
      });
      const payload = (await response.json()) as {
        member?: FamilyMember;
        warning?: string | null;
        error?: string;
      };
      if (!response.ok || !payload.member) {
        throw new Error(payload.error ?? "Member profile save হয়নি।");
      }
      setMembers((current) => [...current, payload.member!]);
      setForm(emptyForm);
      setDialogOpen(false);
      setFeedback(payload.warning ?? "নতুন member profile সংরক্ষিত হয়েছে।");
      if (!payload.warning) await loadMembers();
      return { memberId: payload.member.id, name: payload.member.name_en ?? payload.member.name_bn };
    } finally {
      setSaving(false);
    }
  }, [loadMembers, setFeedback]);

  async function updateMember(input: MemberForm) {
    if (!editingMember) return;
    setSaving(true);
    try {
      const response = await fetch("/api/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_profile", memberId: editingMember.id, data: input }),
      });
      if (response.status === 499) return;
      const payload = await response.json() as { member?: FamilyMember; error?: string };
      if (!response.ok || !payload.member) throw new Error(payload.error ?? "Member profile update হয়নি।");
      setMembers((current) => current.map((item) => item.id === payload.member?.id ? payload.member : item));
      setDialogOpen(false);
      setEditingMember(null);
      setForm(emptyForm);
    } finally {
      setSaving(false);
    }
  }

  function openCreateMember() {
    setEditingMember(null);
    setForm(emptyForm);
    setDialogOpen(true);
  }

  function openEditMember(member: FamilyMember) {
    setEditingMember(member);
    setForm({
      nameBn: member.name_bn,
      nameEn: member.name_en ?? "",
      relationship: member.relationship_text ?? "",
      gender: member.gender ?? "",
      dateOfBirth: member.date_of_birth ?? "",
      bloodGroup: member.blood_group ?? "",
      occupation: member.occupation ?? "",
      city: member.city ?? "",
      country: member.country ?? "",
      email: member.email ?? "",
      phone: member.phone ?? "",
      parentId: "none",
      relationshipType: "parent",
      profileStatus: member.profile_status,
    });
    setDialogOpen(true);
  }

  async function createRelationship() {
    if (relationshipForm.fromMemberId === "none" || relationshipForm.toMemberId === "none") {
      setFeedback("দুইজন সদস্য নির্বাচন করুন।");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_relationship", ...relationshipForm }),
      });
      if (response.status === 499) return;
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Relationship save হয়নি।");
      setRelationshipOpen(false);
      setRelationshipForm({ fromMemberId: "none", toMemberId: "none", relationshipType: "parent" });
      await loadMembers();
    } finally {
      setSaving(false);
    }
  }

  async function deleteRelationship(relationshipId: string) {
    const response = await fetch("/api/members", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_relationship", relationshipId }),
    });
    if (response.status === 499) return;
    const payload = await response.json() as { error?: string };
    if (!response.ok) throw new Error(payload.error ?? "Relationship সরানো যায়নি।");
    setRelationships((current) => current.filter((item) => item.id !== relationshipId));
  }

  async function exportXlsx() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rows = visibleMembers.map((member, index) => ({
        "ক্রমিক": index + 1,
        "নাম (বাংলা)": member.name_bn,
        "Name (English)": member.name_en ?? "",
        "সম্পর্ক": member.relationship_text ?? "",
        "লিঙ্গ": member.gender ?? "",
        "জন্মতারিখ": member.date_of_birth ?? "",
        "রক্তের গ্রুপ": member.blood_group ?? "",
        "পেশা": member.occupation ?? "",
        "শহর": member.city ?? "",
        "দেশ": member.country ?? "",
        "ফোন": member.phone ?? "",
        "ইমেইল": member.email ?? "",
        "অবস্থা": member.profile_status,
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet["!cols"] = [8, 24, 24, 24, 12, 15, 14, 22, 18, 18, 18, 28, 14].map(
        (width) => ({ wch: width }),
      );
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Family Members");
      XLSX.writeFile(
        workbook,
        `${family?.name_en?.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "family"}-members.xlsx`,
      );
    } finally {
      setExporting(false);
    }
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
          name: "list_family_members",
          title: "List family members",
          description: "Read the current family directory with profile and relationship details.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: true, untrustedContentHint: false },
          execute: () => ({
            family: family?.name_en ?? null,
            count: members.length,
            members: members.map((member) => ({
              id: member.id,
              name: member.name_en ?? member.name_bn,
              relationship: member.relationship_text,
              bloodGroup: member.blood_group,
              occupation: member.occupation,
            })),
          }),
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    if (canManage) {
      void Promise.resolve(
        modelContext.registerTool(
          {
            name: "create_family_member_profile",
            title: "Create a family member profile",
            description: "Create one member profile in the current family directory.",
            inputSchema: {
              type: "object",
              properties: {
                nameBn: { type: "string", minLength: 2 },
                nameEn: { type: "string" },
                relationship: { type: "string" },
                gender: { type: "string", enum: ["male", "female", "other", ""] },
                bloodGroup: { type: "string" },
                occupation: { type: "string" },
                city: { type: "string" },
                country: { type: "string" },
                parentId: { type: "string" },
              },
              required: ["nameBn"],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute: async (input: unknown) => {
              const value = input as Partial<MemberForm>;
              if (typeof value.nameBn !== "string" || value.nameBn.trim().length < 2) {
                throw new Error("A Bengali member name is required.");
              }
              return createMember({ ...emptyForm, ...value });
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => undefined);
    }
    return () => lifecycle.abort();
  }, [canManage, createMember, family?.name_en, members]);

  if (setupRequired) {
    return (
      <main className="mx-auto w-full max-w-[1500px] px-4 py-8 md:px-7">
        <Card className="rounded-3xl border-amber-500/30 py-0 shadow-none">
          <CardContent className="flex flex-col items-start gap-5 p-7 md:flex-row md:items-center">
            <span className="grid size-12 place-items-center rounded-2xl bg-amber-500/12 text-amber-700">
              <ShieldAlert className="size-6" />
            </span>
            <div className="flex-1">
              <h1 className="text-2xl font-bold">প্রথম Family Owner setup বাকি</h1>
              <p className="mt-1 text-muted-foreground">পরিবারের directory ব্যবহার করার আগে একবার owner account সক্রিয় করুন।</p>
            </div>
            <Button asChild className="rounded-xl">
              <Link href="/setup">Owner setup খুলুন</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 md:px-7 md:py-8">
      <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
            <Users className="size-4" /> PostgreSQL Family Directory
          </div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">পরিবারের সদস্য ডিরেক্টরি</h1>
          <p className="mt-1 text-muted-foreground">Profile, সম্পর্ক, রক্তের গ্রুপ, পেশা ও অবস্থান এক জায়গায়।</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="gap-2 rounded-xl"
            disabled={!visibleMembers.length || exporting}
            onClick={() => void exportXlsx()}
          >
            {exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
            XLSX Export
          </Button>
          {canManage ? (
            <><Button variant="outline" className="gap-2 rounded-xl" disabled={members.length < 2} onClick={() => setRelationshipOpen(true)}><Link2 className="size-4" /> সম্পর্ক যোগ করুন</Button><Button className="gap-2 rounded-xl" onClick={openCreateMember}><UserRoundPlus className="size-4" /> সদস্য যোগ করুন</Button></>
          ) : null}
        </div>
      </section>

      {migrationRequired ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
          <GitFork className="mt-0.5 size-4 shrink-0" />
          Member directory প্রস্তুত। Family Tree connection চালু করতে নতুন relationship migration একবার apply করতে হবে।
        </div>
      ) : null}
      {feedback ? (
        <div className="rounded-2xl border bg-muted/35 px-4 py-3 text-sm font-medium">{feedback}</div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "মোট সদস্য", value: members.length.toLocaleString("bn-BD"), icon: Users },
          { label: "রক্তের গ্রুপ যুক্ত", value: members.filter((member) => member.blood_group).length.toLocaleString("bn-BD"), icon: Database },
          { label: "বাংলাদেশের বাইরে", value: members.filter((member) => member.country && member.country !== "বাংলাদেশ").length.toLocaleString("bn-BD"), icon: MapPin },
          { label: "Tree connections", value: relationships.length.toLocaleString("bn-BD"), icon: GitFork },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label} className="rounded-2xl border-border/75 py-0 shadow-none">
            <CardContent className="flex items-start justify-between p-5">
              <div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div>
              <span className="grid size-10 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="size-5" /></span>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card className="gap-0 overflow-hidden rounded-3xl border-border/75 py-0 shadow-none">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between md:p-5">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="নাম, সম্পর্ক, পেশা বা রক্তের গ্রুপ" className="h-10 rounded-xl pl-10" />
          </div>
          <Badge variant="secondary" className="w-fit rounded-full px-3">{visibleMembers.length.toLocaleString("bn-BD")} জন</Badge>
        </div>
        {loading ? (
          <div className="flex min-h-72 items-center justify-center gap-3 text-muted-foreground"><LoaderCircle className="size-5 animate-spin" /> Directory load হচ্ছে</div>
        ) : visibleMembers.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow className="bg-muted/35"><TableHead className="pl-5">সদস্য</TableHead><TableHead>সম্পর্ক</TableHead><TableHead>রক্ত</TableHead><TableHead>পেশা</TableHead><TableHead>অবস্থান</TableHead><TableHead>যোগাযোগ</TableHead>{canManage ? <TableHead className="pr-5 text-right">Action</TableHead> : null}</TableRow></TableHeader>
              <TableBody>
                {visibleMembers.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell className="pl-5"><div className="flex items-center gap-3"><Avatar className="size-10"><AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">{member.name_bn.slice(0, 2)}</AvatarFallback></Avatar><div><p className="font-semibold">{member.name_bn}</p><p className="text-xs text-muted-foreground">{member.name_en || "—"}</p></div></div></TableCell>
                    <TableCell>{member.relationship_text || "—"}</TableCell>
                    <TableCell>{member.blood_group ? <Badge variant="outline">{member.blood_group}</Badge> : "—"}</TableCell>
                    <TableCell>{member.occupation || "—"}</TableCell>
                    <TableCell>{[member.city, member.country].filter(Boolean).join(", ") || "—"}</TableCell>
                    <TableCell><p>{member.phone || "—"}</p><p className="text-xs text-muted-foreground">{member.email || ""}</p></TableCell>
                    {canManage ? <TableCell className="pr-5 text-right"><Button variant="ghost" size="sm" className="gap-2 rounded-xl" onClick={() => openEditMember(member)}><Pencil className="size-4" /> Edit</Button></TableCell> : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex min-h-72 flex-col items-center justify-center px-6 text-center"><Users className="size-10 text-muted-foreground/50" /><h2 className="mt-4 text-lg font-bold">এখনও কোনো member profile নেই</h2><p className="mt-1 text-sm text-muted-foreground">প্রথম সদস্য যোগ করলে directory ও family tree তৈরি শুরু হবে।</p>{canManage ? <Button className="mt-5 gap-2 rounded-xl" onClick={openCreateMember}><Plus className="size-4" /> প্রথম সদস্য যোগ করুন</Button> : null}</div>
        )}
      </Card>

      <Card className="gap-0 overflow-hidden rounded-3xl border-border/75 py-0 shadow-none">
        <div className="flex items-center justify-between gap-3 border-b p-5"><div><h2 className="font-bold">Family relationships</h2><p className="mt-1 text-sm text-muted-foreground">Parent, spouse এবং guardian connections Family Tree-তে ব্যবহার হয়।</p></div>{canManage ? <Button variant="outline" className="gap-2 rounded-xl" disabled={members.length < 2} onClick={() => setRelationshipOpen(true)}><Link2 className="size-4" /> নতুন connection</Button> : null}</div>
        <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
          {relationships.map((item) => <div key={item.id} className="flex items-center gap-3 rounded-2xl border p-4"><div className="min-w-0 flex-1"><p className="truncate font-semibold">{memberById.get(item.from_member_id)?.name_bn ?? "Unknown"}</p><p className="my-1 text-xs font-bold uppercase tracking-wide text-primary">{item.relationship_type} →</p><p className="truncate font-semibold">{memberById.get(item.to_member_id)?.name_bn ?? "Unknown"}</p></div>{canManage ? <Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label="Remove relationship" onClick={() => void deleteRelationship(item.id).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Relationship সরানো যায়নি।"))}><Trash2 /></Button> : null}</div>)}
          {!relationships.length ? <div className="col-span-full rounded-2xl border border-dashed p-7 text-center text-sm text-muted-foreground">এখনও কোনো relationship connection নেই।</div> : null}
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingMember(null); setForm(emptyForm); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-3xl">
          <DialogHeader><DialogTitle>{editingMember ? "Member profile edit" : "নতুন member profile"}</DialogTitle><DialogDescription>{editingMember ? "সদস্যের directory information ও profile status update করুন।" : "প্রাথমিক profile ও প্রথম family connection একসাথে যোগ করুন।"}</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <Field label="নাম (বাংলা)" id="nameBn"><Input id="nameBn" value={form.nameBn} onChange={(event) => setForm({ ...form, nameBn: event.target.value })} /></Field>
            <Field label="Name (English)" id="nameEn"><Input id="nameEn" value={form.nameEn} onChange={(event) => setForm({ ...form, nameEn: event.target.value })} /></Field>
            <Field label="পারিবারিক সম্পর্ক" id="relationship"><Input id="relationship" placeholder="যেমন: বড় ছেলে, নাতনি" value={form.relationship} onChange={(event) => setForm({ ...form, relationship: event.target.value })} /></Field>
            <Field label="Gender" id="gender"><Select value={form.gender || "none"} onValueChange={(value) => setForm({ ...form, gender: value === "none" ? "" : value })}><SelectTrigger id="gender" className="h-10 w-full rounded-xl"><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger><SelectContent><SelectItem value="none">উল্লেখ নয়</SelectItem><SelectItem value="male">পুরুষ</SelectItem><SelectItem value="female">নারী</SelectItem><SelectItem value="other">অন্যান্য</SelectItem></SelectContent></Select></Field>
            <Field label="জন্মতারিখ" id="dateOfBirth"><Input id="dateOfBirth" type="date" value={form.dateOfBirth} onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })} /></Field>
            <Field label="রক্তের গ্রুপ" id="bloodGroup"><Input id="bloodGroup" placeholder="যেমন: B+" value={form.bloodGroup} onChange={(event) => setForm({ ...form, bloodGroup: event.target.value })} /></Field>
            <Field label="পেশা" id="occupation"><Input id="occupation" value={form.occupation} onChange={(event) => setForm({ ...form, occupation: event.target.value })} /></Field>
            {!editingMember ? <><Field label="Connection type" id="relationshipType"><Select value={form.relationshipType} onValueChange={(value) => setForm({ ...form, relationshipType: value as MemberForm["relationshipType"] })}><SelectTrigger id="relationshipType" className="h-10 w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="parent">Parent → নতুন সদস্য</SelectItem><SelectItem value="spouse">Spouse ↔ নতুন সদস্য</SelectItem><SelectItem value="guardian">Guardian → নতুন সদস্য</SelectItem></SelectContent></Select></Field><Field label="Related member" id="parentId"><Select value={form.parentId} onValueChange={(value) => setForm({ ...form, parentId: value })}><SelectTrigger id="parentId" className="h-10 w-full rounded-xl"><SelectValue placeholder="নির্বাচন করুন" /></SelectTrigger><SelectContent><SelectItem value="none">এখন যোগ নয়</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id}>{member.name_bn}</SelectItem>)}</SelectContent></Select></Field></> : null}
            <Field label="শহর" id="city"><Input id="city" value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></Field>
            <Field label="দেশ" id="country"><Input id="country" value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} /></Field>
            <Field label="ফোন" id="phone"><Input id="phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
            <Field label="ইমেইল" id="email"><Input id="email" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field>
            {editingMember ? <Field label="Profile status" id="profileStatus"><Select value={form.profileStatus} onValueChange={(value) => setForm({ ...form, profileStatus: value })}><SelectTrigger id="profileStatus" className="h-10 w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem><SelectItem value="deceased">Deceased</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent></Select></Field> : null}
          </div>
          <DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setDialogOpen(false)}>বাতিল</Button><Button className="gap-2 rounded-xl" disabled={saving || form.nameBn.trim().length < 2} onClick={() => void (editingMember ? updateMember(form) : createMember(form)).catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Member save হয়নি।"))}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : editingMember ? <Pencil className="size-4" /> : <UserRoundPlus className="size-4" />} {editingMember ? "Profile update" : "Profile সংরক্ষণ"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={relationshipOpen} onOpenChange={setRelationshipOpen}>
        <DialogContent className="rounded-3xl sm:max-w-lg">
          <DialogHeader><DialogTitle>Family relationship যোগ করুন</DialogTitle><DialogDescription>Connection-এর direction অনুযায়ী প্রথম ও দ্বিতীয় সদস্য নির্বাচন করুন।</DialogDescription></DialogHeader>
          <div className="grid gap-4 py-2">
            <Field label="Relationship type" id="newRelationshipType"><Select value={relationshipForm.relationshipType} onValueChange={(value) => setRelationshipForm((current) => ({ ...current, relationshipType: value as typeof current.relationshipType }))}><SelectTrigger id="newRelationshipType" className="w-full rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="parent">প্রথম সদস্য parent → দ্বিতীয় সদস্য child</SelectItem><SelectItem value="spouse">Spouse relationship</SelectItem><SelectItem value="guardian">প্রথম সদস্য guardian → দ্বিতীয় সদস্য</SelectItem></SelectContent></Select></Field>
            <Field label="প্রথম সদস্য" id="fromMemberId"><Select value={relationshipForm.fromMemberId} onValueChange={(value) => setRelationshipForm((current) => ({ ...current, fromMemberId: value }))}><SelectTrigger id="fromMemberId" className="w-full rounded-xl"><SelectValue placeholder="সদস্য নির্বাচন" /></SelectTrigger><SelectContent><SelectItem value="none">নির্বাচন করুন</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id} disabled={member.id === relationshipForm.toMemberId}>{member.name_bn}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="দ্বিতীয় সদস্য" id="toMemberId"><Select value={relationshipForm.toMemberId} onValueChange={(value) => setRelationshipForm((current) => ({ ...current, toMemberId: value }))}><SelectTrigger id="toMemberId" className="w-full rounded-xl"><SelectValue placeholder="সদস্য নির্বাচন" /></SelectTrigger><SelectContent><SelectItem value="none">নির্বাচন করুন</SelectItem>{members.map((member) => <SelectItem key={member.id} value={member.id} disabled={member.id === relationshipForm.fromMemberId}>{member.name_bn}</SelectItem>)}</SelectContent></Select></Field>
          </div>
          <DialogFooter><Button variant="outline" className="rounded-xl" onClick={() => setRelationshipOpen(false)}>বাতিল</Button><Button className="gap-2 rounded-xl" disabled={saving || relationshipForm.fromMemberId === "none" || relationshipForm.toMemberId === "none"} onClick={() => void createRelationship().catch((error: unknown) => setFeedback(error instanceof Error ? error.message : "Relationship save হয়নি।"))}>{saving ? <LoaderCircle className="size-4 animate-spin" /> : <Link2 className="size-4" />} Connection সংরক্ষণ</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}
