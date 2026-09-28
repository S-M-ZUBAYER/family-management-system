"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import {
  Archive,
  Bell,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Download,
  GitFork,
  HandHeart,
  HeartPulse,
  Home,
  House,
  Languages,
  MapPin,
  Megaphone,
  MessageCircle,
  Moon,
  MoreHorizontal,
  Palette,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  UserCheck,
  Users,
  Vote,
  WalletCards,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { DashboardNoticeTicker } from "./notice-ticker";
import { useActionFeedback } from "@/components/action-modal-provider";
import type { DashboardPayload } from "@/lib/dashboard-types";

const MemberApprovals = lazy(() => import("./member-approvals").then((module) => ({ default: module.MemberApprovals })));
const MemberDirectory = lazy(() => import("./member-directory").then((module) => ({ default: module.MemberDirectory })));
const QurbaniSuite = lazy(() => import("./qurbani-suite").then((module) => ({ default: module.QurbaniSuite })));
const FamilyTreeView = lazy(() => import("./family-tree-view").then((module) => ({ default: module.FamilyTreeView })));
const NoticeCenter = lazy(() => import("./notice-center").then((module) => ({ default: module.NoticeCenter })));
const EventCenter = lazy(() => import("./event-center").then((module) => ({ default: module.EventCenter })));
const PersonalFinanceCenter = lazy(() => import("./personal-finance-center").then((module) => ({ default: module.PersonalFinanceCenter })));
const FamilyChat = lazy(() => import("./family-chat").then((module) => ({ default: module.FamilyChat })));
const HealthCenter = lazy(() => import("./health-center").then((module) => ({ default: module.HealthCenter })));
const WelfareCenter = lazy(() => import("./welfare-center").then((module) => ({ default: module.WelfareCenter })));
const HouseholdCenter = lazy(() => import("./household-center").then((module) => ({ default: module.HouseholdCenter })));
const ArchiveCenter = lazy(() => import("./archive-center").then((module) => ({ default: module.ArchiveCenter })));
const GovernanceCenter = lazy(() => import("./governance-center").then((module) => ({ default: module.GovernanceCenter })));

type ThemeId = "heritage" | "emerald" | "indigo" | "terracotta";

const themes: Array<{
  id: ThemeId;
  name: string;
  label: string;
  colors: [string, string, string, string];
}> = [
  {
    id: "heritage",
    name: "Heritage Navy",
    label: "ঐতিহ্য ও আস্থা",
    colors: ["#153A5B", "#147D73", "#D99A2B", "#F7F6F2"],
  },
  {
    id: "emerald",
    name: "Emerald Gold",
    label: "শান্ত ও ঐতিহ্যবাহী",
    colors: ["#185C4D", "#2F7D6D", "#C58B2A", "#F7F8F3"],
  },
  {
    id: "indigo",
    name: "Royal Indigo",
    label: "আধুনিক ও প্রিমিয়াম",
    colors: ["#3730A3", "#6D28D9", "#D97706", "#F8F7FC"],
  },
  {
    id: "terracotta",
    name: "Terracotta Olive",
    label: "উষ্ণ ও পারিবারিক",
    colors: ["#8A3F2D", "#596B3A", "#C28B2C", "#FBF7F2"],
  },
];

const mainNavigation = [
  { id: "dashboard", href: "/", label: "ড্যাশবোর্ড", english: "Overview", icon: Home },
  { id: "directory", href: "/directory", label: "সদস্য ডিরেক্টরি", english: "Directory", icon: Users, badge: "48" },
  { id: "tree", href: "/family-tree", label: "ফ্যামিলি ট্রি", english: "Family tree", icon: GitFork },
  { id: "members", href: "/members", label: "সদস্য অনুমোদন", english: "Approvals", icon: UserCheck, badge: "3" },
  { id: "notices", href: "/notices", label: "নোটিশ", english: "Notices", icon: Megaphone },
  { id: "events", href: "/events", label: "ইভেন্ট ও ট্যুর", english: "Events", icon: CalendarDays },
  { id: "qurbani", href: "/qurbani", label: "কোরবানি", english: "Qurbani", icon: CircleDollarSign },
  { id: "finance", href: "/finance", label: "ব্যক্তিগত হিসাব", english: "Private finance", icon: WalletCards },
  { id: "chat", href: "/chat", label: "চ্যাট", english: "Messages", icon: MessageCircle },
  { id: "health", href: "/health", label: "স্বাস্থ্য ও SOS", english: "Health", icon: HeartPulse },
  { id: "welfare", href: "/welfare", label: "কল্যাণ তহবিল", english: "Welfare fund", icon: HandHeart },
  { id: "household", href: "/household", label: "বাসা ব্যবস্থাপনা", english: "Household", icon: House },
  { id: "archives", href: "/archives", label: "আর্কাইভ ও ভল্ট", english: "Archives", icon: Archive },
  { id: "governance", href: "/governance", label: "ভোট ও সিদ্ধান্ত", english: "Polls & decisions", icon: Vote },
];

const numberBn = new Intl.NumberFormat("bn-BD", { maximumFractionDigits: 2 });
const moneyBn = new Intl.NumberFormat("bn-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 });
const dateBn = new Intl.DateTimeFormat("bn-BD", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const eventDateBn = new Intl.DateTimeFormat("bn-BD", { day: "2-digit", month: "short" });
const relativeBn = new Intl.RelativeTimeFormat("bn-BD", { numeric: "auto" });

function relativeTime(value: string, reference: number) {
  const difference = new Date(value).getTime() - reference;
  const minutes = Math.round(difference / 60000);
  if (Math.abs(minutes) < 60) return relativeBn.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relativeBn.format(hours, "hour");
  return relativeBn.format(Math.round(hours / 24), "day");
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function ThemeSelector({
  value,
  onChange,
}: {
  value: ThemeId;
  onChange: (theme: ThemeId) => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 rounded-xl bg-card">
          <Palette className="size-4" />
          <span className="hidden sm:inline">থিম</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl rounded-3xl p-0">
        <DialogHeader className="border-b px-6 py-5 text-left">
          <DialogTitle className="text-xl">পরিবারের রঙ নির্বাচন করুন</DialogTitle>
          <DialogDescription>
            Family Admin-এর নির্বাচিত theme পুরো family workspace-এ ব্যবহার হবে।
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 p-6 sm:grid-cols-2">
          {themes.map((theme) => {
            const selected = value === theme.id;
            return (
              <button
                type="button"
                key={theme.id}
                onClick={() => onChange(theme.id)}
                className={`rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selected
                    ? "border-primary bg-primary/5 shadow-[0_8px_30px_rgb(15_23_42/8%)]"
                    : "border-border hover:border-primary/40 hover:bg-muted/40"
                }`}
              >
                <div className="mb-4 flex gap-2">
                  {theme.colors.map((color) => (
                    <span
                      key={color}
                      className="h-11 flex-1 rounded-xl border border-black/5"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{theme.name}</p>
                    <p className="text-sm text-muted-foreground">{theme.label}</p>
                  </div>
                  <span
                    className={`grid size-5 place-items-center rounded-full border ${
                      selected ? "border-primary bg-primary" : "border-border"
                    }`}
                  >
                    {selected ? <span className="size-1.5 rounded-full bg-primary-foreground" /> : null}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FamilyDashboard({
  view = "dashboard",
}: {
  view?: "dashboard" | "directory" | "tree" | "members" | "notices" | "events" | "qurbani" | "finance" | "chat" | "health" | "welfare" | "household" | "archives" | "governance";
}) {
  const [theme, setTheme] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return "heritage";
    const saved = window.localStorage.getItem("family-theme") as ThemeId | null;
    return saved && themes.some((item) => item.id === saved) ? saved : "heritage";
  });
  const [dark, setDark] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("family-mode") === "dark");
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(view === "dashboard");
  const [dashboardNow] = useState(() => Date.now());
  const [, setFeedback] = useActionFeedback();

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", dark);
    window.localStorage.setItem("family-theme", theme);
    window.localStorage.setItem("family-mode", dark ? "dark" : "light");
  }, [theme, dark]);

  useEffect(() => {
    if (view !== "dashboard") return;
    let active = true;
    void fetch("/api/dashboard", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as DashboardPayload & { error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Dashboard data পাওয়া যায়নি।");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        setDashboard(payload);
        setTheme(payload.family.theme);
      })
      .catch((error: unknown) => {
        if (active) setFeedback(error instanceof Error ? error.message : "Dashboard data পাওয়া যায়নি।");
      })
      .finally(() => {
        if (active) setDashboardLoading(false);
      });
    return () => { active = false; };
  }, [setFeedback, view]);

  async function exportDashboard() {
    if (!dashboard) return;
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([
        { Metric: "Total members", Value: dashboard.stats.totalMembers },
        { Metric: "Generations", Value: dashboard.stats.generations },
        { Metric: "Pending approvals", Value: dashboard.stats.pendingApprovals },
        { Metric: "Upcoming events", Value: dashboard.stats.upcomingEvents },
        { Metric: "Unread messages", Value: dashboard.stats.unreadMessages },
        { Metric: "Unread channels", Value: dashboard.stats.unreadChannels },
      ]), "Overview");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(dashboard.approvals.map((item) => ({ Name: item.name, Relationship: item.relationship, Requested: item.createdAt }))), "Pending Approvals");
      if (dashboard.qurbani) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([dashboard.qurbani]), "Qurbani");
      if (dashboard.nextEvent) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([dashboard.nextEvent]), "Next Event");
      XLSX.writeFile(workbook, `${dashboard.family.name_en.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-dashboard.xlsx`);
      setFeedback("Dashboard XLSX সফলভাবে তৈরি হয়েছে।");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Dashboard XLSX তৈরি হয়নি।");
    }
  }

  const viewerName = dashboard?.viewer.name ?? "পরিবারের সদস্য";
  const viewerFirstName = viewerName.split(/\s+/)[0] || viewerName;
  const viewerRole = dashboard?.viewer.role.replaceAll("_", " ") ?? "Member";
  const qurbaniProgress = dashboard?.qurbani?.targetShares
    ? Math.min(100, (dashboard.qurbani.registeredShares / dashboard.qurbani.targetShares) * 100)
    : 0;
  const nextEventDays = dashboard?.nextEvent
    ? Math.max(0, Math.ceil((new Date(dashboard.nextEvent.startAt).getTime() - dashboardNow) / 86400000))
    : 0;

  return (
    <SidebarProvider defaultOpen>
      <Sidebar collapsible="icon" className="border-r-0">
        <SidebarHeader className="px-3 py-4">
          <div className="flex items-center gap-3 rounded-2xl px-2 py-1.5">
            <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
              <GitFork className="size-5" />
            </div>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-bold tracking-tight">Family Management</p>
              <p className="truncate text-xs text-sidebar-foreground/60">{dashboard?.family.name_bn ?? "Family workspace"}</p>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>পরিবার পরিচালনা</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainNavigation.map((item) => (
                  <SidebarMenuItem key={item.english}>
                    <SidebarMenuButton
                      asChild
                      isActive={item.id === view}
                      tooltip={`${item.label} · ${item.english}`}
                      className="h-11 rounded-xl"
                    >
                      <a href={item.href}>
                        <item.icon />
                        <span>{item.label}</span>
                      </a>
                    </SidebarMenuButton>
                    {item.id === "directory" && dashboard ? <SidebarMenuBadge>{numberBn.format(dashboard.stats.totalMembers)}</SidebarMenuBadge>
                      : item.id === "members" && dashboard?.stats.pendingApprovals ? <SidebarMenuBadge>{numberBn.format(dashboard.stats.pendingApprovals)}</SidebarMenuBadge>
                        : null}
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="p-3">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="h-11 rounded-xl" tooltip="Settings">
                <a href="/setup">
                  <Settings />
                  <span>সেটিংস</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <div className="mt-2 flex items-center gap-3 rounded-2xl border border-sidebar-border bg-sidebar-accent/60 p-2 group-data-[collapsible=icon]:justify-center">
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">{initials(viewerName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold">{viewerName}</p>
              <p className="truncate text-xs capitalize text-sidebar-foreground/55">{viewerRole}</p>
            </div>
            <MoreHorizontal className="size-4 group-data-[collapsible=icon]:hidden" />
          </div>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset className="min-w-0 bg-background">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur-xl md:px-7">
          <SidebarTrigger className="rounded-xl" />
          <div className="relative hidden max-w-md flex-1 md:block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              aria-label="Search family management system"
              placeholder="সদস্য, ইভেন্ট বা নোটিশ খুঁজুন"
              className="h-10 w-full rounded-xl border bg-muted/45 pl-10 pr-4 text-sm outline-none transition focus:border-primary/50 focus:bg-card focus:ring-2 focus:ring-primary/10"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeSelector value={theme} onChange={setTheme} />
            <Button
              aria-label={dark ? "Use light mode" : "Use dark mode"}
              variant="outline"
              size="icon"
              className="rounded-xl bg-card"
              onClick={() => setDark((value) => !value)}
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button variant="outline" size="icon" className="rounded-xl bg-card">
              <Languages className="size-4" />
              <span className="sr-only">Change language</span>
            </Button>
            <Button variant="outline" size="icon" className="relative rounded-xl bg-card">
              <Bell className="size-4" />
              <span className="absolute right-2 top-2 size-2 rounded-full bg-destructive ring-2 ring-card" />
              <span className="sr-only">Notifications</span>
            </Button>
          </div>
        </header>

        <Suspense fallback={<main className="grid min-h-[calc(100vh-4rem)] place-items-center text-sm text-muted-foreground">Module loading…</main>}>
        {view === "directory" ? <MemberDirectory /> : view === "tree" ? <FamilyTreeView /> : view === "members" ? <MemberApprovals /> : view === "notices" ? <NoticeCenter /> : view === "events" ? <EventCenter /> : view === "qurbani" ? <QurbaniSuite /> : view === "finance" ? <PersonalFinanceCenter /> : view === "chat" ? <FamilyChat /> : view === "health" ? <HealthCenter /> : view === "welfare" ? <WelfareCenter /> : view === "household" ? <HouseholdCenter /> : view === "archives" ? <ArchiveCenter /> : view === "governance" ? <GovernanceCenter /> : <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 md:px-7 md:py-8">
          <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
                <span className="size-2 rounded-full bg-emerald-500" />
                {dateBn.format(new Date(dashboardNow))}
              </div>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                আসসালামু আলাইকুম, {viewerFirstName}
              </h1>
              <p className="mt-1 text-muted-foreground">
                পরিবারের আজকের গুরুত্বপূর্ণ আপডেটগুলো এক নজরে দেখুন।
              </p>
            </div>
            <Button className="gap-2 self-start rounded-xl md:self-auto" disabled={!dashboard || dashboardLoading} onClick={() => void exportDashboard()}>
              <Download className="size-4" />
              রিপোর্ট এক্সপোর্ট
            </Button>
          </section>

          <DashboardNoticeTicker />

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { title: "মোট সদস্য", value: dashboardLoading ? "…" : numberBn.format(dashboard?.stats.totalMembers ?? 0), detail: `${numberBn.format(dashboard?.stats.generations ?? 0)}টি প্রজন্ম`, icon: Users },
              { title: "অনুমোদনের অপেক্ষায়", value: dashboardLoading ? "…" : numberBn.format(dashboard?.stats.pendingApprovals ?? 0), detail: `আজ ${numberBn.format(dashboard?.stats.pendingToday ?? 0)}টি নতুন`, icon: UserCheck },
              { title: "আসন্ন ইভেন্ট", value: dashboardLoading ? "…" : numberBn.format(dashboard?.stats.upcomingEvents ?? 0), detail: `পরবর্তী ৭ দিনে ${numberBn.format(dashboard?.stats.eventsNextSevenDays ?? 0)}টি`, icon: CalendarDays },
              { title: "অপঠিত বার্তা", value: dashboardLoading ? "…" : numberBn.format(dashboard?.stats.unreadMessages ?? 0), detail: `${numberBn.format(dashboard?.stats.unreadChannels ?? 0)}টি চ্যানেলে`, icon: MessageCircle },
            ].map((stat) => (
              <Card key={stat.title} className="rounded-2xl border-border/75 py-0 shadow-none">
                <CardContent className="flex items-start justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.title}</p>
                    <p className="mt-2 text-3xl font-bold tracking-tight">{stat.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{stat.detail}</p>
                  </div>
                  <span className="grid size-11 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <stat.icon className="size-5" />
                  </span>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="grid gap-5 xl:grid-cols-[1.35fr_.85fr]">
            <Card className="gap-0 overflow-hidden rounded-3xl border-border/75 py-0 shadow-none">
              <CardHeader className="flex-row items-center justify-between border-b bg-muted/20 p-5 md:p-6">
                <div>
                  <CardTitle className="text-xl">{dashboard?.qurbani ? `${dashboard.qurbani.title} ${numberBn.format(dashboard.qurbani.year)}` : "কোরবানি পরিকল্পনা"}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">রেজিস্ট্রেশন ও প্রস্তুতির সারসংক্ষেপ</p>
                </div>
                <Badge variant="secondary" className="rounded-full bg-amber-500/12 px-3 text-amber-700 dark:text-amber-300">
                  {dashboard?.qurbani?.status.replaceAll("_", " ") ?? "Campaign নেই"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-6 p-5 md:p-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["নিবন্ধিত শেয়ার", dashboard?.qurbani ? `${numberBn.format(dashboard.qurbani.registeredShares)} / ${numberBn.format(dashboard.qurbani.targetShares)}` : "০ / ০"],
                    ["সংগৃহীত অর্থ", moneyBn.format(dashboard?.qurbani?.collected ?? 0)],
                    ["বকেয়া", moneyBn.format(dashboard?.qurbani?.due ?? 0)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border bg-card p-4">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 text-lg font-bold">{value}</p>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium">শেয়ার পূরণের অগ্রগতি</span>
                    <span className="font-semibold text-primary">{numberBn.format(Math.round(qurbaniProgress))}%</span>
                  </div>
                  <Progress value={qurbaniProgress} className="h-2.5" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button className="rounded-xl" asChild>
                    <a href="/qurbani">কোরবানি ড্যাশবোর্ড</a>
                  </Button>
                  <Button variant="outline" className="gap-2 rounded-xl" asChild>
                    <a href="/qurbani"><Download className="size-4" /> XLSX</a>
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="gap-0 rounded-3xl border-border/75 py-0 shadow-none">
              <CardHeader className="flex-row items-start justify-between p-5 pb-3 md:p-6 md:pb-3">
                <div>
                  <CardTitle className="text-xl">সদস্য অনুমোদন</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">আপনার পরিবারের অপেক্ষমাণ আবেদন</p>
                </div>
                 <Button variant="ghost" size="icon" className="rounded-xl" asChild>
                   <a href="/members" aria-label="সব member request দেখুন"><ChevronRight className="size-5" /></a>
                 </Button>
              </CardHeader>
              <CardContent className="space-y-1 p-3 pt-1 md:px-4 md:pb-4">
                 {dashboard?.approvals.map((person) => (
                  <button
                    type="button"
                    key={person.id}
                    className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-muted/70"
                  >
                    <Avatar className="size-10">
                      <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
                         {initials(person.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{person.name}</p>
                       <p className="truncate text-xs text-muted-foreground">{person.relationship}</p>
                    </div>
                     <span className="text-[11px] text-muted-foreground">{relativeTime(person.createdAt, dashboardNow)}</span>
                  </button>
                 ))}
                 {!dashboardLoading && !dashboard?.approvals.length ? <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">কোনো pending member request নেই।</div> : null}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-5 lg:grid-cols-3">
            <Card className="gap-0 rounded-3xl border-border/75 py-0 shadow-none lg:col-span-2">
              <CardHeader className="flex-row items-center justify-between p-5 md:p-6">
                <div>
                  <CardTitle className="text-xl">পরবর্তী পারিবারিক আয়োজন</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">সবার জন্য উন্মুক্ত</p>
                </div>
                 <Badge variant="outline" className="rounded-full">{dashboard?.nextEvent ? `${numberBn.format(nextEventDays)} দিন বাকি` : "Event নেই"}</Badge>
              </CardHeader>
              <CardContent className="px-5 pb-6 md:px-6">
                <div className="flex flex-col gap-5 rounded-2xl bg-primary px-5 py-6 text-primary-foreground sm:flex-row sm:items-center">
                  <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/12 text-center">
                    <span className="text-center text-xs font-semibold uppercase tracking-widest">{dashboard?.nextEvent ? eventDateBn.format(new Date(dashboard.nextEvent.startAt)).split(" ")[1] : "—"}</span>
                    <span className="-mt-2 text-2xl font-bold">{dashboard?.nextEvent ? eventDateBn.format(new Date(dashboard.nextEvent.startAt)).split(" ")[0] : "—"}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                     <p className="text-lg font-bold">{dashboard?.nextEvent?.title ?? "কোনো upcoming event নেই"}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-primary-foreground/75">
                       <span className="flex items-center gap-1.5"><MapPin className="size-4" /> {dashboard?.nextEvent ? [dashboard.nextEvent.venue, dashboard.nextEvent.city].filter(Boolean).join(", ") : "স্থান নির্ধারিত নয়"}</span>
                       <span className="flex items-center gap-1.5"><Users className="size-4" /> {numberBn.format(dashboard?.nextEvent?.goingCount ?? 0)} জন যাচ্ছেন</span>
                    </div>
                  </div>
                   <Button variant="secondary" className="rounded-xl" asChild><a href="/events">বিস্তারিত দেখুন</a></Button>
                </div>
              </CardContent>
            </Card>

            <Card className="gap-0 rounded-3xl border-border/75 py-0 shadow-none">
              <CardHeader className="p-5 pb-3 md:p-6 md:pb-3">
                <CardTitle className="text-xl">নিরাপত্তা অবস্থা</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 p-5 pt-2 md:px-6">
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-2xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="size-5" />
                  </span>
                  <div>
                     <p className="text-sm font-semibold">Family-scoped access সক্রিয়</p>
                     <p className="text-xs text-muted-foreground">{dashboard?.family.name_bn ?? "Family"} workspace অনুযায়ী API data filter করা হচ্ছে</p>
                  </div>
                </div>
                <div className="rounded-2xl border p-4">
                  <p className="text-xs text-muted-foreground">সর্বশেষ সিকিউরিটি যাচাই</p>
                   <p className="mt-1 text-sm font-semibold">Live dashboard data verified</p>
                </div>
              </CardContent>
            </Card>
          </section>
        </main>}
        </Suspense>
      </SidebarInset>
    </SidebarProvider>
  );
}
