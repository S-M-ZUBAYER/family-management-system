"use client";

import { useEffect, useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { useLocale } from "@/components/locale-provider";
import { useCurrentTime } from "@/components/use-current-time";

export type NoticeTickerItem = {
  id: string;
  title_bn: string;
  title_en?: string | null;
  priority: "normal" | "high" | "urgent";
  status: "draft" | "published" | "archived";
  publish_at: string | null;
  expires_at: string | null;
};

export function NoticeTicker({ notices }: { notices: NoticeTickerItem[] }) {
  const { locale, pick } = useLocale();
  const now = useCurrentTime();
  const activeNotices = useMemo(() => {
    return notices.filter((notice) => {
      const publishTime = notice.publish_at ? new Date(notice.publish_at).getTime() : 0;
      const expiryTime = notice.expires_at ? new Date(notice.expires_at).getTime() : null;
      return now !== null && notice.status === "published" && publishTime <= now && (!expiryTime || expiryTime > now);
    });
  }, [notices, now]);

  if (!activeNotices.length) return null;
  const repeated = [...activeNotices, ...activeNotices];

  return (
    <a
      href="/notices"
      aria-label={pick("সব পারিবারিক নোটিশ দেখুন", "View all family notices")}
      className="group flex min-h-12 overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.055]"
    >
      <span className="z-10 flex shrink-0 items-center gap-2 border-r border-primary/15 bg-primary px-4 text-sm font-bold text-primary-foreground">
        <Megaphone className="size-4" /> {pick("নোটিশ", "Notices")}
      </span>
      <span className="min-w-0 flex-1 overflow-hidden py-3">
        <span className="notice-ticker-track flex w-max items-center group-hover:[animation-play-state:paused]">
          {repeated.map((notice, index) => (
            <span key={`${notice.id}-${index}`} className="flex items-center gap-3 whitespace-nowrap px-5 text-sm font-medium">
              <span className={`size-2 rounded-full ${notice.priority === "urgent" ? "bg-destructive" : notice.priority === "high" ? "bg-amber-500" : "bg-primary"}`} />
              {locale === "en" && notice.title_en ? notice.title_en : notice.title_bn}
            </span>
          ))}
        </span>
      </span>
    </a>
  );
}

export function DashboardNoticeTicker() {
  const [notices, setNotices] = useState<NoticeTickerItem[]>([]);

  useEffect(() => {
    let active = true;
    let pending: AbortController | null = null;
    const refresh = () => {
      pending?.abort();
      pending = new AbortController();
      const signal = pending.signal;
      void fetch("/api/notices", { cache: "no-store", signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("Notice feed unavailable");
          const payload = (await response.json()) as { notices?: NoticeTickerItem[] };
          if (active && !signal.aborted) setNotices(payload.notices ?? []);
        })
        .catch(() => { if (active && !signal.aborted) setNotices([]); });
    };
    const refreshWhenVisible = () => { if (document.visibilityState === "visible") refresh(); };
    refresh();
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      pending?.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return <NoticeTicker notices={notices} />;
}
