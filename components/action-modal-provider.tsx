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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ResultKind = "success" | "error" | "info";

type ResultState = {
  kind: ResultKind;
  title: string;
  message: string;
};

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
  create_notification: "ফ্যামিলি নোটিফিকেশন প্রকাশ",
  save_preferences: "নোটিফিকেশন পছন্দ সংরক্ষণ",
  mark_read: "নোটিফিকেশনটি পড়া হয়েছে হিসেবে চিহ্নিত",
  mark_unread: "নোটিফিকেশনটি না-পড়া হিসেবে চিহ্নিত",
  restore: "নোটিফিকেশনটি ফিরিয়ে আনা",
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
  create_notification: "publish a family notification",
  save_preferences: "save notification preferences",
  mark_read: "mark the notification as read",
  mark_unread: "mark the notification as unread",
  restore: "restore the notification",
};

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
    ["setup/family", "ফ্যামিলি workspace", "family workspace"],
  ];
  const match = labels.find(([part]) => pathname.includes(part));
  return match ? (locale === "bn" ? match[1] : match[2]) : (locale === "bn" ? "রেকর্ড" : "record");
}

function actionCopy(pathname: string, method: string, body: Record<string, unknown>, locale: AppLocale): ActionCopy | null {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method) || !pathname.startsWith("/api/")) return null;

  const action = typeof body.action === "string" ? body.action : "";
  if (pathname === "/api/chat" && action === "mark_read") return null;

  const nested = typeof body.data === "object" && body.data ? body.data as Record<string, unknown> : {};
  const decision = typeof body.decision === "string" ? body.decision : "";
  const status = typeof body.status === "string" ? body.status : typeof nested.status === "string" ? nested.status : "";
  const intent = [action, decision, status, method].join(" ").toLowerCase();
  const destructive = destructiveWords.some((word) => intent.includes(word)) || method === "DELETE";
  const label = (locale === "bn" ? actionLabels[action] : actionLabelsEn[action]) ?? endpointLabel(pathname, locale);

  return {
    title: locale === "bn" ? (destructive ? "গুরুত্বপূর্ণ action নিশ্চিত করুন" : "Action নিশ্চিত করুন") : (destructive ? "Confirm important action" : "Confirm action"),
    description: locale === "bn" ? `আপনি কি নিশ্চিতভাবে ${label} করতে চান? নিশ্চিত করার পর পরিবর্তনটি database-এ সংরক্ষিত হবে।` : `Are you sure you want to ${label}? The change will be saved after confirmation.`,
    confirmLabel: locale === "bn" ? (destructive ? "হ্যাঁ, নিশ্চিত করুন" : "নিশ্চিত করে এগিয়ে যান") : (destructive ? "Yes, confirm" : "Confirm and continue"),
    destructive,
    successMessage: locale === "bn" ? `${label} সফলভাবে সম্পন্ন হয়েছে।` : `${label.charAt(0).toUpperCase()}${label.slice(1)} completed successfully.`,
  };
}

async function responseMessage(response: Response, fallback: string) {
  try {
    const payload = await response.clone().json() as Record<string, unknown>;
    for (const key of ["message", "success", "warning", "error"]) {
      if (typeof payload[key] === "string" && payload[key]) return payload[key] as string;
    }
  } catch {
    // Some successful upload and stream responses do not have a JSON body.
  }
  return fallback;
}

function feedbackResult(message: string, locale: AppLocale): ResultState {
  const normalized = message.toLowerCase();
  const failed = ["হয়নি", "যায়নি", "পাওয়া যায়নি", "error", "failed", "invalid", "required", "denied", "unable", "cannot"]
    .some((word) => normalized.includes(word));
  const informational = ["সম্পন্ন করুন", "অনুমোদনের অপেক্ষায়", "approval-এর অপেক্ষায়", "যোগ দিন"]
    .some((word) => normalized.includes(word));
  const successful = ["হয়েছে", "সংরক্ষিত", "যোগ হয়েছে", "তৈরি হয়েছে", "সম্পন্ন", "success"]
    .some((word) => normalized.includes(word));

  if (failed) return { kind: "error", title: locale === "bn" ? "Action সম্পন্ন হয়নি" : "Action not completed", message };
  if (informational) return { kind: "info", title: locale === "bn" ? "পরবর্তী ধাপ প্রয়োজন" : "Next step required", message };
  if (successful) return { kind: "success", title: locale === "bn" ? "সফল হয়েছে" : "Completed successfully", message };
  return { kind: "info", title: locale === "bn" ? "গুরুত্বপূর্ণ তথ্য" : "Important information", message };
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

  const requestConfirmation = useCallback((copy: ActionCopy) => new Promise<boolean>((resolve) => {
    setConfirmation({ ...copy, resolve });
  }), []);

  const settleConfirmation = useCallback((confirmed: boolean) => {
    setConfirmation((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  useEffect(() => {
    mounted.current = true;
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(rawUrl, window.location.origin);
      const copy = url.origin === window.location.origin ? actionCopy(url.pathname, method, parseBody(init?.body), locale) : null;

      if (!copy) return originalFetch(input, init);

      const confirmed = await requestConfirmation(copy);
      if (!confirmed) {
        if (mounted.current) setResult({ kind: "info", title: locale === "bn" ? "Action বাতিল হয়েছে" : "Action cancelled", message: locale === "bn" ? "কোনো পরিবর্তন সংরক্ষণ করা হয়নি।" : "No changes were saved." });
        return new Response(JSON.stringify({ error: locale === "bn" ? "Action বাতিল হয়েছে।" : "Action cancelled." }), {
          status: 499,
          headers: { "Content-Type": "application/json" },
        });
      }

      try {
        const response = await originalFetch(input, init);
        if (mounted.current) {
          const message = await responseMessage(response, response.ok ? copy.successMessage : (locale === "bn" ? "Action সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।" : "The action could not be completed. Please try again."));
          setResult({
            kind: response.ok ? "success" : "error",
            title: response.ok ? (locale === "bn" ? "সফল হয়েছে" : "Completed successfully") : (locale === "bn" ? "Action ব্যর্থ হয়েছে" : "Action failed"),
            message,
          });
        }
        return response;
      } catch (error) {
        if (mounted.current) {
          setResult({
            kind: "error",
            title: locale === "bn" ? "সংযোগজনিত error" : "Connection error",
            message: error instanceof Error ? error.message : (locale === "bn" ? "Server-এর সাথে যোগাযোগ করা যায়নি। আবার চেষ্টা করুন।" : "Could not contact the server. Please try again."),
          });
        }
        throw error;
      }
    };

    return () => {
      mounted.current = false;
      window.fetch = originalFetch;
      setConfirmation((current) => {
        current?.resolve(false);
        return null;
      });
    };
  }, [locale, requestConfirmation]);

  useEffect(() => {
    const handleFeedback = (event: Event) => setResult((event as CustomEvent<ResultState>).detail);
    window.addEventListener(feedbackEvent, handleFeedback);
    return () => window.removeEventListener(feedbackEvent, handleFeedback);
  }, []);

  const resultStyle = useMemo(() => {
    if (result?.kind === "success") return { icon: CheckCircle2, className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300" };
    if (result?.kind === "error") return { icon: XCircle, className: "bg-rose-500/12 text-rose-700 dark:text-rose-300" };
    return { icon: Info, className: "bg-sky-500/12 text-sky-700 dark:text-sky-300" };
  }, [result?.kind]);
  const ResultIcon = resultStyle.icon;

  return (
    <>
      {children}

      <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => !open && settleConfirmation(false)}>
        <AlertDialogContent className="rounded-3xl sm:max-w-md">
          <AlertDialogCancel asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="absolute right-4 top-4 rounded-full"
              aria-label={locale === "bn" ? "নিশ্চিতকরণ বন্ধ করুন" : "Close confirmation"}
              onClick={() => settleConfirmation(false)}
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
            <AlertDialogCancel onClick={() => settleConfirmation(false)}>{locale === "bn" ? "না, ফিরে যান" : "No, go back"}</AlertDialogCancel>
            <AlertDialogAction
              variant={confirmation?.destructive ? "destructive" : "default"}
              onClick={() => settleConfirmation(true)}
            >
              {confirmation?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(result)} onOpenChange={(open) => !open && setResult(null)}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader className="items-center text-center sm:items-center sm:text-center">
            <div className={`grid size-16 place-items-center rounded-2xl ${resultStyle.className}`}>
              <ResultIcon className="size-8" />
            </div>
            <DialogTitle className="pt-2 text-xl">{result?.title}</DialogTitle>
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
