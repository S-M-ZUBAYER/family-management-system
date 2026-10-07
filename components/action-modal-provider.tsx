"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { AlertTriangle, CheckCircle2, Info, ShieldQuestion, X, XCircle } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useLocale, type AppLocale } from "@/components/locale-provider";
import { feedbackResult, mutationResponseResult, repeatsMutationFeedback, resultTitleForLocale, type ResultState } from "@/lib/action-feedback";
import { householdActionCopy } from "@/lib/household-action-copy";
import { welfareActionCopy } from "@/lib/welfare-action-copy";
import { archiveActionCopy, archiveFileDeleteActionCopy, archiveUploadActionCopy } from "@/lib/archive-action-copy";
import { memberActionCopy, memberActionResult } from "@/lib/member-action-copy";
import { memberRequestActionCopy } from "@/lib/member-request-action-copy";
import { noticeActionCopy } from "@/lib/notice-action-copy";
import { eventActionCopy } from "@/lib/event-action-copy";
import { magazineActionCopy } from "@/lib/magazine-action-copy";
import { qurbaniErrorCopy, qurbaniRecordActionCopy, qurbaniStatusActionCopy } from "@/lib/qurbani-action-copy";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConfirmationState = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive: boolean;
  resolve: (confirmed: boolean) => void;
};

type ActionCopy = Omit<ConfirmationState, "resolve"> & {
  successMessage: string;
};

const feedbackEvent = "family-management:feedback";

const actionLabels: Record<string, string> = {
  create_collection: "archive collection তৈরি",
  create_story: "family story সংরক্ষণ",
  create_asset: "asset record সংরক্ষণ",
  create_capsule: "time capsule তৈরি",
  create_channel: "chat channel তৈরি",
  create_message: "message পাঠানো",
  send_message: "message পাঠানো",
  toggle_reaction: "reaction পরিবর্তন",
  update_notification: "notification setting পরিবর্তন",
  update_status: "status পরিবর্তন",
  update_profile: "member profile update",
  create_relationship: "family relationship যোগ",
  delete_relationship: "family relationship সরানো",
  create_proposal: "proposal জমা",
  review_proposal: "proposal review",
  cast_vote: "vote জমা",
  add_comment: "comment প্রকাশ",
  create_decision: "formal decision সংরক্ষণ",
  create_household: "household তৈরি",
  create_item: "shopping item যোগ",
  create_bill: "bill যোগ",
  create_task: "household task যোগ",
  create_maintenance: "maintenance record যোগ",
  create_service: "service contact যোগ",
  create_fund: "welfare fund তৈরি",
  create_contribution: "contribution সংরক্ষণ",
  create_pledge: "pledge সংরক্ষণ",
  create_request: "সহায়তার আবেদন জমা",
  review_request: "সহায়তার আবেদন review",
  create_expense: "expense সংরক্ষণ",
  create_profile: "health profile সংরক্ষণ",
  save_profile: "health profile সংরক্ষণ",
  create_medication: "medicine যোগ",
  create_appointment: "appointment যোগ",
  create_measurement: "health measurement যোগ",
  create_sos: "family SOS পাঠানো",
  respond_sos: "SOS response পাঠানো",
  update_sos: "SOS status পরিবর্তন",
  update_membership: "member role ও access পরিবর্তন",
  update_locale: "ভাষার পছন্দ পরিবর্তন",
  select_family: "পরিবারের ওয়ার্কস্পেস পরিবর্তন",
  create_notification: "ফ্যামিলি নোটিফিকেশন প্রকাশ",
  save_preferences: "নোটিফিকেশন পছন্দ সংরক্ষণ",
  mark_read: "নোটিফিকেশনটি পড়া হয়েছে হিসেবে চিহ্নিত",
  mark_unread: "নোটিফিকেশনটি না-পড়া হিসেবে চিহ্নিত",
  restore: "নোটিফিকেশনটি ফিরিয়ে আনা",
  save_consent: "Privacy পছন্দ সংরক্ষণ",
  save_policy: "Family privacy policy সংরক্ষণ",
  cancel_request: "Data-rights অনুরোধ বাতিল",
};

const actionLabelsEn: Record<string, string> = {
  create_collection: "create an archive collection",
  create_story: "save a family story",
  create_asset: "save an asset record",
  create_capsule: "create a time capsule",
  create_channel: "create a chat channel",
  create_message: "send a message",
  send_message: "send a message",
  toggle_reaction: "change a reaction",
  update_notification: "change notification settings",
  update_status: "change the status",
  update_profile: "update a member profile",
  create_relationship: "add a family relationship",
  delete_relationship: "remove a family relationship",
  create_proposal: "submit a proposal",
  review_proposal: "review a proposal",
  cast_vote: "submit a vote",
  add_comment: "publish a comment",
  create_decision: "save a formal decision",
  create_household: "create a household",
  create_item: "add a shopping item",
  create_bill: "add a bill",
  create_task: "add a household task",
  create_maintenance: "add a maintenance record",
  create_service: "add a service contact",
  create_fund: "create a welfare fund",
  create_contribution: "save a contribution",
  create_pledge: "save a pledge",
  create_request: "submit an assistance request",
  review_request: "review an assistance request",
  create_expense: "save an expense",
  create_profile: "save a health profile",
  save_profile: "save a health profile",
  create_medication: "add a medicine",
  create_appointment: "add an appointment",
  create_measurement: "add a health measurement",
  create_sos: "send a family SOS",
  respond_sos: "respond to an SOS",
  update_sos: "change the SOS status",
  update_membership: "change member role and access",
  update_locale: "change the language preference",
  select_family: "switch family workspace",
  create_notification: "publish a family notification",
  save_preferences: "save notification preferences",
  mark_read: "mark the notification as read",
  mark_unread: "mark the notification as unread",
  restore: "restore the notification",
  save_consent: "save privacy choices",
  save_policy: "save the family privacy policy",
  cancel_request: "cancel the data-rights request",
};

const privacyActionLabels = {
  bn: { create_request: "Data-rights অনুরোধ জমা", review_request: "Data-rights অনুরোধ পর্যালোচনা" },
  en: { create_request: "submit a data-rights request", review_request: "review the data-rights request" },
} as const;

const destructiveWords = [
  "delete",
  "remove",
  "reject",
  "cancel",
  "archive",
  "close",
  "revoke",
  "decline",
  "disputed",
  "sold",
];

function parseBody(body: BodyInit | null | undefined) {
  if (body instanceof FormData) return { mode: body.get("mode") } as Record<string, unknown>;
  if (typeof body !== "string") return {} as Record<string, unknown>;
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
}

function endpointLabel(pathname: string, locale: AppLocale) {
  const labels: Array<[string, string, string]> = [
    ["member-requests", "সদস্য অনুমোদন", "member approval"],
    ["members", "সদস্য প্রোফাইল", "member profile"],
    ["notices", "নোটিশ", "notice"], ["events", "ইভেন্ট বা RSVP", "event or RSVP"],
    ["qurbani", "কোরবানি রেকর্ড", "Qurbani record"], ["finance", "হিসাবের রেকর্ড", "finance record"],
    ["health", "স্বাস্থ্য রেকর্ড", "health record"], ["welfare", "কল্যাণ তহবিলের রেকর্ড", "welfare record"],
    ["household", "বাসা ব্যবস্থাপনার রেকর্ড", "household record"], ["archives", "আর্কাইভ রেকর্ড", "archive record"],
    ["governance", "ভোট বা সিদ্ধান্তের রেকর্ড", "governance record"], ["workspace", "পরিবারের preference", "family preference"],
    ["admin", "অ্যাডমিন সেটিং", "admin setting"], ["chat", "চ্যাট action", "chat action"],
    ["notifications", "নোটিফিকেশন", "notification"],
    ["privacy", "Privacy ও data-rights record", "privacy and data-rights record"],
    ["setup/family", "ফ্যামিলি workspace", "family workspace"],
  ];
  const match = labels.find(([part]) => pathname.includes(part));
  return match ? (locale === "bn" ? match[1] : match[2]) : (locale === "bn" ? "রেকর্ড" : "record");
}

function actionCopy(pathname: string, method: string, body: Record<string, unknown>, locale: AppLocale): ActionCopy | null {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method) || !pathname.startsWith("/api/")) return null;

  const action = typeof body.action === "string" ? body.action : "";
  if (pathname === "/api/chat" && action === "mark_read") return null;
  if (pathname === "/api/qurbani/records") {
    const recordCopy = qurbaniRecordActionCopy(body.kind, method, locale);
    if (recordCopy) return recordCopy;
  }
  if (pathname === "/api/qurbani/status") {
    const statusCopy = qurbaniStatusActionCopy(body.entity, body.status, method, locale);
    if (statusCopy) return statusCopy;
  }
  if (pathname === "/api/household/records") {
    const householdCopy = householdActionCopy(body, method, locale);
    if (householdCopy) return householdCopy;
  }
  if (pathname === "/api/welfare/records") {
    const welfareCopy = welfareActionCopy(body, method, locale);
    if (welfareCopy) return welfareCopy;
  }
  if (pathname === "/api/archives/records") {
    const archiveCopy = archiveActionCopy(body, method, locale);
    if (archiveCopy) return archiveCopy;
  }
  if (pathname === "/api/archives/upload" && method === "POST") {
    const archiveCopy = archiveUploadActionCopy(body.mode, locale);
    if (archiveCopy) return archiveCopy;
  }
  if (pathname.startsWith("/api/archive-file/") && method === "DELETE") return archiveFileDeleteActionCopy(locale);
  if (pathname === "/api/members" || pathname === "/api/members/photo") {
    const memberCopy = memberActionCopy(pathname, method, body, locale);
    if (memberCopy) return memberCopy;
  }
  if (pathname.startsWith("/api/member-requests/")) {
    const requestCopy = memberRequestActionCopy(pathname, method, body, locale);
    if (requestCopy) return requestCopy;
  }
  if (pathname === "/api/notices" || pathname.startsWith("/api/notices/")) {
    const noticeCopy = noticeActionCopy(pathname, method, body, locale);
    if (noticeCopy) return noticeCopy;
  }
  if (pathname === "/api/events" || pathname.startsWith("/api/events/") || pathname.startsWith("/api/event-media/")) {
    const eventCopy = eventActionCopy(pathname, method, body, locale);
    if (eventCopy) return eventCopy;
  }
  if (pathname === "/api/magazine/records" || pathname === "/api/magazine/upload") {
    const magazineCopy = magazineActionCopy(pathname, method, body, locale);
    if (magazineCopy) return magazineCopy;
  }

  const nested = typeof body.data === "object" && body.data ? body.data as Record<string, unknown> : {};
  const decision = typeof body.decision === "string" ? body.decision : "";
  const status = typeof body.status === "string" ? body.status : typeof nested.status === "string" ? nested.status : "";
  const intent = [action, decision, status, method].join(" ").toLowerCase();
  const destructive = destructiveWords.some((word) => intent.includes(word)) || method === "DELETE";
  const privacyLabel = pathname.includes("/api/privacy") ? privacyActionLabels[locale][action as keyof typeof privacyActionLabels.bn] : undefined;
  const label = privacyLabel ?? (locale === "bn" ? actionLabels[action] : actionLabelsEn[action]) ?? endpointLabel(pathname, locale);
  const familySwitch = pathname === "/api/workspace/select";

  return {
    title: locale === "bn" ? (destructive ? "গুরুত্বপূর্ণ action নিশ্চিত করুন" : "Action নিশ্চিত করুন") : (destructive ? "Confirm important action" : "Confirm action"),
    description: familySwitch
      ? locale === "bn" ? "আপনি কি সক্রিয় পরিবার পরিবর্তন করতে চান? এরপর এই ব্রাউজারে নির্বাচিত পরিবারের তথ্য দেখানো হবে।" : "Switch the active family? This browser will then show the selected family's data."
      : locale === "bn" ? `আপনি কি নিশ্চিতভাবে ${label} করতে চান? নিশ্চিত করার পর পরিবর্তনটি database-এ সংরক্ষিত হবে।` : `Are you sure you want to ${label}? The change will be saved after confirmation.`,
    confirmLabel: locale === "bn" ? (destructive ? "হ্যাঁ, নিশ্চিত করুন" : "নিশ্চিত করে এগিয়ে যান") : (destructive ? "Yes, confirm" : "Confirm and continue"),
    destructive,
    successMessage: locale === "bn" ? `${label} সফলভাবে সম্পন্ন হয়েছে।` : `${label.charAt(0).toUpperCase()}${label.slice(1)} completed successfully.`,
  };
}

async function responseMessage(response: Response, fallback: string, locale: AppLocale) {
  try {
    const payload = await response.clone().json() as Record<string, unknown>;
    const qurbaniMessage = qurbaniErrorCopy(payload.code, locale);
    if (!response.ok && qurbaniMessage) return qurbaniMessage;
    for (const key of ["message", "success", "warning", "error"]) {
      if (typeof payload[key] === "string" && payload[key]) return payload[key] as string;
    }
  } catch {
    // Some successful upload and stream responses do not have a JSON body.
  }
  return fallback;
}

export function useActionFeedback(): [string | null, Dispatch<SetStateAction<string | null>>] {
  const { locale } = useLocale();
  const setFeedback = useCallback<Dispatch<SetStateAction<string | null>>>((value) => {
    const message = typeof value === "function" ? value(null) : value;
    if (!message || typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<ResultState>(feedbackEvent, { detail: feedbackResult(message, locale) }));
  }, [locale]);

  return [null, setFeedback];
}

export function ActionModalProvider({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [result, setResult] = useState<ResultState | null>(null);
  const mounted = useRef(true);
  const activeConfirmation = useRef<ConfirmationState | null>(null);
  const pendingConfirmations = useRef<ConfirmationState[]>([]);
  const activeResult = useRef<ResultState | null>(null);
  const pendingResults = useRef<ResultState[]>([]);
  const lastMutationResult = useRef<{ kind: ResultState["kind"]; message: string; at: number } | null>(null);

  const showNextDialog = useCallback(() => {
    if (!mounted.current || activeConfirmation.current || activeResult.current) return;

    const nextConfirmation = pendingConfirmations.current.shift();
    if (nextConfirmation) {
      activeConfirmation.current = nextConfirmation;
      setConfirmation(nextConfirmation);
      return;
    }

    const nextResult = pendingResults.current.shift();
    if (nextResult) {
      activeResult.current = nextResult;
      setResult(nextResult);
    }
  }, []);

  const requestConfirmation = useCallback((copy: ActionCopy) => new Promise<boolean>((resolve) => {
    if (!mounted.current) {
      resolve(false);
      return;
    }
    pendingConfirmations.current.push({ ...copy, resolve });
    showNextDialog();
  }), [showNextDialog]);

  const settleConfirmation = useCallback((confirmed: boolean, expected: ConfirmationState | null) => {
    const current = activeConfirmation.current;
    if (!current || current !== expected) return;
    activeConfirmation.current = null;
    setConfirmation(null);
    current.resolve(confirmed);
    // Radix can emit onOpenChange after a button click. Advance after that event
    // so a second close callback cannot accidentally dismiss the next action.
    queueMicrotask(showNextDialog);
  }, [showNextDialog]);

  const showResult = useCallback((state: ResultState) => {
    if (!mounted.current) return;
    pendingResults.current.push(state);
    showNextDialog();
  }, [showNextDialog]);

  const dismissResult = useCallback((expected: ResultState | null) => {
    if (!expected || activeResult.current !== expected) return;
    activeResult.current = null;
    setResult(null);
    queueMicrotask(showNextDialog);
  }, [showNextDialog]);

  useEffect(() => {
    mounted.current = true;
    // Fast Refresh reruns effects but can preserve their old state. Cleanup
    // clears dialog refs, so resync visible state to avoid an uncloseable modal.
    queueMicrotask(() => {
      if (!mounted.current) return;
      setConfirmation(activeConfirmation.current);
      setResult(activeResult.current);
    });
    const confirmations = pendingConfirmations.current;
    const results = pendingResults.current;
    return () => {
      mounted.current = false;
      activeConfirmation.current?.resolve(false);
      activeConfirmation.current = null;
      activeResult.current = null;
      for (const pending of confirmations.splice(0)) pending.resolve(false);
      results.length = 0;
    };
  }, []);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(rawUrl, window.location.origin);
      const copy = url.origin === window.location.origin ? actionCopy(url.pathname, method, parseBody(init?.body), locale) : null;

      if (!copy) return originalFetch(input, init);

      const confirmed = await requestConfirmation(copy);
      if (!confirmed) {
        showResult({ kind: "info", title: locale === "bn" ? "Action বাতিল হয়েছে" : "Action cancelled", message: locale === "bn" ? "বাতিল করা কাজটি পাঠানো হয়নি। আগে নিশ্চিত করা পরিবর্তন থাকলে তা সংরক্ষিত আছে।" : "The cancelled action was not sent. Any earlier confirmed changes remain saved." });
        return new Response(JSON.stringify({ error: locale === "bn" ? "Action বাতিল হয়েছে।" : "Action cancelled." }), {
          status: 499,
          headers: { "Content-Type": "application/json" },
        });
      }

      try {
        const response = await originalFetch(input, init);
        if (mounted.current) {
          const memberPayload = response.ok && ["/api/members", "/api/members/photo"].includes(url.pathname)
            ? await response.clone().json().catch(() => ({})) as Record<string, unknown> : null;
          const memberResult = memberPayload ? memberActionResult(url.pathname, method, parseBody(init?.body), memberPayload, locale, copy.successMessage, response.status) : null;
          const message = memberResult ? memberResult.message : response.ok && response.status !== 202 && (url.pathname === "/api/notices" || url.pathname.startsWith("/api/notices/") || url.pathname === "/api/events" || url.pathname.startsWith("/api/events/") || url.pathname.startsWith("/api/event-media/") || ["/api/magazine/records", "/api/magazine/upload", "/api/qurbani/records", "/api/household/records", "/api/welfare/records", "/api/archives/records", "/api/archives/upload"].includes(url.pathname))
            ? copy.successMessage
            : await responseMessage(response, response.ok ? copy.successMessage : (locale === "bn" ? "Action সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।" : "The action could not be completed. Please try again."), locale);
          const nextResult = memberResult?.noChange
            ? { kind: "info" as const, title: locale === "bn" ? "পরিবর্তন প্রয়োজন নেই" : "No change needed", message }
            : mutationResponseResult(memberResult?.status ?? response.status, message, locale);
          lastMutationResult.current = { kind: nextResult.kind, message: nextResult.message, at: Date.now() };
          showResult(nextResult);
        }
        return response;
      } catch (error) {
        if (mounted.current) {
          const nextResult: ResultState = {
            kind: "error",
            title: locale === "bn" ? "সংযোগজনিত error" : "Connection error",
            message: error instanceof Error ? error.message : (locale === "bn" ? "Server-এর সাথে যোগাযোগ করা যায়নি। আবার চেষ্টা করুন।" : "Could not contact the server. Please try again."),
          };
          lastMutationResult.current = { kind: nextResult.kind, message: nextResult.message, at: Date.now() };
          showResult(nextResult);
        }
        throw error;
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [locale, requestConfirmation, showResult]);

  useEffect(() => {
    const handleFeedback = (event: Event) => {
      const nextResult = (event as CustomEvent<ResultState>).detail;
      const lastMutation = lastMutationResult.current;
      // Route handlers may repeat the mutation outcome through useActionFeedback.
      // An identical message must not queue again even if its classifier picked a
      // different kind. Keep distinct follow-up warnings/errors visible.
      if (repeatsMutationFeedback(lastMutation, nextResult, Date.now())) return;
      showResult(nextResult);
    };
    window.addEventListener(feedbackEvent, handleFeedback);
    return () => window.removeEventListener(feedbackEvent, handleFeedback);
  }, [showResult]);

  const resultStyle = useMemo(() => {
    if (result?.kind === "success") return { icon: CheckCircle2, className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" };
    if (result?.kind === "error") return { icon: XCircle, className: "bg-rose-500/12 text-rose-700 dark:text-rose-300" };
    return { icon: Info, className: "bg-sky-500/12 text-sky-700 dark:text-sky-300" };
  }, [result?.kind]);
  const ResultIcon = resultStyle.icon;

  return (
    <>
      {children}

      <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => !open && settleConfirmation(false, confirmation)}>
        <AlertDialogContent className="rounded-3xl sm:max-w-md">
          <AlertDialogCancel asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-4 top-4 rounded-full"
              aria-label={locale === "bn" ? "নিশ্চিতকরণ বন্ধ করুন" : "Close confirmation"}
              onClick={() => settleConfirmation(false, confirmation)}
            >
              <X className="size-4" />
            </Button>
          </AlertDialogCancel>
          <AlertDialogHeader>
            <AlertDialogMedia className={confirmation?.destructive ? "bg-rose-500/12 text-rose-700" : "bg-primary/10 text-primary"}>
              {confirmation?.destructive ? <AlertTriangle /> : <ShieldQuestion />}
            </AlertDialogMedia>
            <AlertDialogTitle>{confirmation?.title}</AlertDialogTitle>
            <AlertDialogDescription className="leading-6">{confirmation?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settleConfirmation(false, confirmation)}>{locale === "bn" ? "না, ফিরে যান" : "No, go back"}</AlertDialogCancel>
            <AlertDialogAction
              variant={confirmation?.destructive ? "destructive" : "default"}
              onClick={() => settleConfirmation(true, confirmation)}
            >
              {confirmation?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(result)} onOpenChange={(open) => !open && dismissResult(result)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader className="items-center text-center sm:items-center sm:text-center">
            <div className={`grid size-16 place-items-center rounded-2xl ${resultStyle.className}`}>
              <ResultIcon className="size-8" />
            </div>
            <DialogTitle className="pt-2 text-xl">{resultTitleForLocale(result, locale)}</DialogTitle>
            <DialogDescription className="max-w-sm text-pretty leading-6">{result?.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:justify-center">
            <DialogClose asChild>
              <Button className="min-w-32 rounded-xl">{locale === "bn" ? "বন্ধ করুন" : "Close"}</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
