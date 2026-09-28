"use client";

import { useEffect, useMemo, useState } from "react";
import { Megaphone } from "lucide-react";

export type NoticeTickerItem = {
  id: string;
  title_bn: string;
  priority: "normal" | "high" | "urgent";
  status: "draft" | "published" | "archived";
  publish_at: string | null;
  expires_at: string | null;
};

export function NoticeTicker({ notices }: { notices: NoticeTickerItem[] }) {
  const [now] = useState(Date.now);
  const activeNotices = useMemo(() => {
    return notices.filter((notice) => {
      const publishTime = notice.publish_at ? new Date(notice.publish_at).getTime() : 0;
      const expiryTime = notice.expires_at ? new Date(notice.expires_at).getTime() : null;
      return notice.status === "published" && publishTime <= now && (!expiryTime || expiryTime > now);
    });
  }, [notices, now]);

  if (!activeNotices.length) return null;
  const repeated = [...activeNotices, ...activeNotices];

  return (
    <a
      href="/notices"
      aria-label="সব পারিবারিক নোটিশ দেখুন"
      className="group flex min-h-12 overflow-hidden rounded-2xl border border-primary/20 bg-primary/[0.055]"
    >
      <span className="z-10 flex shrink-0 items-center gap-2 border-r border-primary/15 bg-primary px-4 text-sm font-bold text-primary-foreground">
        <Megaphone className="size-4" /> নোটিশ
      </span>
      <span className="min-w-0 flex-1 overflow-hidden py-3">
        <span className="notice-ticker-track flex w-max items-center group-hover:[animation-play-state:paused]">
          {repeated.map((notice, index) => (
            <span key={`${notice.id}-${index}`} className="flex items-center gap-3 whitespace-nowrap px-5 text-sm font-medium">
              <span className={`size-2 rounded-full ${notice.priority === "urgent" ? "bg-destructive" : notice.priority === "high" ? "bg-amber-500" : "bg-primary"}`} />
              {notice.title_bn}
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
    void fetch("/api/notices", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as { notices?: NoticeTickerItem[] };
        if (active) setNotices(payload.notices ?? []);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  return <NoticeTicker notices={notices} />;
}
