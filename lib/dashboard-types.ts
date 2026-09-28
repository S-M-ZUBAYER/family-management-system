import type { FamilyRole } from "@/lib/family-access";

export type DashboardPayload = {
  family: {
    id: string;
    name_bn: string;
    name_en: string;
    theme: "heritage" | "emerald" | "indigo" | "terracotta";
  };
  viewer: {
    name: string;
    role: FamilyRole;
  };
  stats: {
    totalMembers: number;
    generations: number;
    pendingApprovals: number;
    pendingToday: number;
    upcomingEvents: number;
    eventsNextSevenDays: number;
    unreadMessages: number;
    unreadChannels: number;
  };
  approvals: Array<{
    id: string;
    name: string;
    relationship: string;
    createdAt: string;
  }>;
  qurbani: {
    id: string;
    title: string;
    year: number;
    status: string;
    targetShares: number;
    registeredShares: number;
    collected: number;
    due: number;
  } | null;
  nextEvent: {
    id: string;
    title: string;
    startAt: string;
    venue: string;
    city: string | null;
    goingCount: number;
  } | null;
};
