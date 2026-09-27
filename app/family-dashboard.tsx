"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Download,
  GitFork,
  HandHeart,
  HeartPulse,
  Home,
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
import { MemberApprovals } from "./member-approvals";
import { MemberDirectory } from "./member-directory";
import { QurbaniSuite } from "./qurbani-suite";
import { FamilyTreeView } from "./family-tree-view";
import { NoticeCenter } from "./notice-center";
import { DashboardNoticeTicker } from "./notice-ticker";
import { EventCenter } from "./event-center";
import { PersonalFinanceCenter } from "./personal-finance-center";
import { FamilyChat } from "./family-chat";
import { HealthCenter } from "./health-center";
import { WelfareCenter } from "./welfare-center";

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
];

const approvals = [
  { name: "মেহেদী হাসান", relation: "রাশেদের ছেলে", initials: "মে", time: "১২ মিনিট আগে" },
  { name: "নাজিয়া রহমান", relation: "নাসরিনের মেয়ে", initials: "না", time: "১ ঘণ্টা আগে" },
  { name: "তানভীর মনছুফ", relation: "পরিবারের আমন্ত্রণ", initials: "তা", time: "গতকাল" },
];

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
  view?: "dashboard" | "directory" | "tree" | "members" | "notices" | "events" | "qurbani" | "finance" | "chat" | "health" | "welfare";
}) {
  const [theme, setTheme] = useState<ThemeId>("heritage");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("family-theme") as ThemeId | null;
    const savedMode = window.localStorage.getItem("family-mode");
    if (savedTheme && themes.some((item) => item.id === savedTheme)) setTheme(savedTheme);
    if (savedMode === "dark") setDark(true);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", dark);
    window.localStorage.setItem("family-theme", theme);
    window.localStorage.setItem("family-mode", dark ? "dark" : "light");
  }, [theme, dark]);

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
              <p className="truncate text-xs text-sidebar-foreground/60">শেখ মনছুফ পরিবার</p>
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
                    {item.badge ? <SidebarMenuBadge>{item.badge}</SidebarMenuBadge> : null}
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
              <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">SA</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-semibold">সাইফুল আহমেদ</p>
              <p className="truncate text-xs text-sidebar-foreground/55">Family Admin</p>
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

        {view === "directory" ? <MemberDirectory /> : view === "tree" ? <FamilyTreeView /> : view === "members" ? <MemberApprovals /> : view === "notices" ? <NoticeCenter /> : view === "events" ? <EventCenter /> : view === "qurbani" ? <QurbaniSuite /> : view === "finance" ? <PersonalFinanceCenter /> : view === "chat" ? <FamilyChat /> : view === "health" ? <HealthCenter /> : view === "welfare" ? <WelfareCenter /> : <main className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 md:px-7 md:py-8">
          <section className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
                <span className="size-2 rounded-full bg-emerald-500" />
                বৃহস্পতিবার, ২৪ সেপ্টেম্বর
              </div>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                আসসালামু আলাইকুম, সাইফুল
              </h1>
              <p className="mt-1 text-muted-foreground">
                পরিবারের আজকের গুরুত্বপূর্ণ আপডেটগুলো এক নজরে দেখুন।
              </p>
            </div>
            <Button className="gap-2 self-start rounded-xl md:self-auto">
              <Download className="size-4" />
              রিপোর্ট এক্সপোর্ট
            </Button>
          </section>

          <DashboardNoticeTicker />

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { title: "মোট সদস্য", value: "৪৮", detail: "৫টি প্রজন্ম", icon: Users },
              { title: "অনুমোদনের অপেক্ষায়", value: "৩", detail: "আজ ২টি নতুন", icon: UserCheck },
              { title: "আসন্ন ইভেন্ট", value: "৪", detail: "পরবর্তী ৭ দিনে", icon: CalendarDays },
              { title: "অপঠিত বার্তা", value: "১২", detail: "৩টি চ্যানেলে", icon: MessageCircle },
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
                  <CardTitle className="text-xl">কোরবানি ২০২৭</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">রেজিস্ট্রেশন ও প্রস্তুতির সারসংক্ষেপ</p>
                </div>
                <Badge variant="secondary" className="rounded-full bg-amber-500/12 px-3 text-amber-700 dark:text-amber-300">
                  প্রস্তুতি চলছে
                </Badge>
              </CardHeader>
              <CardContent className="space-y-6 p-5 md:p-6">
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["নিবন্ধিত শেয়ার", "২৬ / ৩৫"],
                    ["সংগৃহীত অর্থ", "৳ ৯,৮৭,৫০০"],
                    ["বকেয়া", "৳ ২,১২,৫০০"],
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
                    <span className="font-semibold text-primary">৭৪%</span>
                  </div>
                  <Progress value={74} className="h-2.5" />
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
                <Button variant="ghost" size="icon" className="rounded-xl">
                  <ChevronRight className="size-5" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-1 p-3 pt-1 md:px-4 md:pb-4">
                {approvals.map((person) => (
                  <button
                    type="button"
                    key={person.name}
                    className="flex w-full items-center gap-3 rounded-2xl p-3 text-left transition hover:bg-muted/70"
                  >
                    <Avatar className="size-10">
                      <AvatarFallback className="bg-primary/10 text-sm font-bold text-primary">
                        {person.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{person.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{person.relation}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{person.time}</span>
                  </button>
                ))}
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
                <Badge variant="outline" className="rounded-full">১২ দিন বাকি</Badge>
              </CardHeader>
              <CardContent className="px-5 pb-6 md:px-6">
                <div className="flex flex-col gap-5 rounded-2xl bg-primary px-5 py-6 text-primary-foreground sm:flex-row sm:items-center">
                  <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/12 text-center">
                    <span className="text-xs font-semibold uppercase tracking-widest">Oct</span>
                    <span className="-mt-2 text-2xl font-bold">০৬</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-bold">বার্ষিক পারিবারিক মিলনমেলা ২০২৬</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-primary-foreground/75">
                      <span className="flex items-center gap-1.5"><MapPin className="size-4" /> পূর্বাচল, ঢাকা</span>
                      <span className="flex items-center gap-1.5"><Users className="size-4" /> ৩৬ জন যাচ্ছেন</span>
                    </div>
                  </div>
                  <Button variant="secondary" className="rounded-xl">বিস্তারিত দেখুন</Button>
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
                    <p className="text-sm font-semibold">Tenant isolation সক্রিয়</p>
                    <p className="text-xs text-muted-foreground">শেখ মনছুফ পরিবারের ডেটা সুরক্ষিত</p>
                  </div>
                </div>
                <div className="rounded-2xl border p-4">
                  <p className="text-xs text-muted-foreground">সর্বশেষ সিকিউরিটি যাচাই</p>
                  <p className="mt-1 text-sm font-semibold">আজ, সকাল ৯:৩০</p>
                </div>
              </CardContent>
            </Card>
          </section>
        </main>}
      </SidebarInset>
    </SidebarProvider>
  );
}
