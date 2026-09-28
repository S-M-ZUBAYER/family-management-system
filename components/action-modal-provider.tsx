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

function endpointLabel(pathname: string) {
  if (pathname.includes("member-requests")) return "member approval";
  if (pathname.includes("members")) return "member profile";
  if (pathname.includes("notices")) return "notice";
  if (pathname.includes("events")) return "event বা RSVP";
  if (pathname.includes("qurbani")) return "Qurbani record";
  if (pathname.includes("finance")) return "finance record";
  if (pathname.includes("health")) return "health record";
  if (pathname.includes("welfare")) return "welfare record";
  if (pathname.includes("household")) return "household record";
  if (pathname.includes("archives")) return "archive record";
  if (pathname.includes("governance")) return "governance record";
  if (pathname.includes("workspace")) return "family theme";
  if (pathname.includes("chat")) return "chat action";
  if (pathname.includes("setup/family")) return "family workspace";
  return "record";
}

function actionCopy(pathname: string, method: string, body: Record<string, unknown>): ActionCopy | null {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method) || !pathname.startsWith("/api/")) return null;

  const action = typeof body.action === "string" ? body.action : "";
  if (pathname === "/api/chat" && action === "mark_read") return null;

  const nested = typeof body.data === "object" && body.data ? body.data as Record<string, unknown> : {};
  const decision = typeof body.decision === "string" ? body.decision : "";
  const status = typeof body.status === "string" ? body.status : typeof nested.status === "string" ? nested.status : "";
  const intent = [action, decision, status, method].join(" ").toLowerCase();
  const destructive = destructiveWords.some((word) => intent.includes(word)) || method === "DELETE";
  const label = actionLabels[action] ?? endpointLabel(pathname);

  return {
    title: destructive ? "গুরুত্বপূর্ণ action নিশ্চিত করুন" : "Action নিশ্চিত করুন",
    description: `আপনি কি নিশ্চিতভাবে ${label} করতে চান? নিশ্চিত করার পর পরিবর্তনটি database-এ সংরক্ষিত হবে।`,
    confirmLabel: destructive ? "হ্যাঁ, নিশ্চিত করুন" : "Confirm ও continue",
    destructive,
    successMessage: `${label.charAt(0).toUpperCase()}${label.slice(1)} সফলভাবে সম্পন্ন হয়েছে।`,
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

function feedbackResult(message: string): ResultState {
  const normalized = message.toLowerCase();
  const failed = ["হয়নি", "যায়নি", "পাওয়া যায়নি", "error", "failed", "invalid", "required", "denied", "unable", "cannot"]
    .some((word) => normalized.includes(word));
  const successful = ["হয়েছে", "সংরক্ষিত", "যোগ হয়েছে", "তৈরি হয়েছে", "সম্পন্ন", "success"]
    .some((word) => normalized.includes(word));

  if (failed) return { kind: "error", title: "Action সম্পন্ন হয়নি", message };
  if (successful) return { kind: "success", title: "সফল হয়েছে", message };
  return { kind: "info", title: "গুরুত্বপূর্ণ তথ্য", message };
}

export function useActionFeedback(): [string | null, Dispatch<SetStateAction<string | null>>] {
  const setFeedback = useCallback<Dispatch<SetStateAction<string | null>>>((value) => {
    const message = typeof value === "function" ? value(null) : value;
    if (!message || typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent<ResultState>(feedbackEvent, { detail: feedbackResult(message) }));
  }, []);

  return [null, setFeedback];
}

export function ActionModalProvider({ children }: { children: React.ReactNode }) {
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
      const copy = url.origin === window.location.origin ? actionCopy(url.pathname, method, parseBody(init?.body)) : null;

      if (!copy) return originalFetch(input, init);

      const confirmed = await requestConfirmation(copy);
      if (!confirmed) {
        if (mounted.current) setResult({ kind: "info", title: "Action বাতিল হয়েছে", message: "কোনো পরিবর্তন সংরক্ষণ করা হয়নি।" });
        return new Response(JSON.stringify({ error: "Action বাতিল হয়েছে।" }), {
          status: 499,
          headers: { "Content-Type": "application/json" },
        });
      }

      try {
        const response = await originalFetch(input, init);
        if (mounted.current) {
          const message = await responseMessage(response, response.ok ? copy.successMessage : "Action সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।");
          setResult({
            kind: response.ok ? "success" : "error",
            title: response.ok ? "সফল হয়েছে" : "Action ব্যর্থ হয়েছে",
            message,
          });
        }
        return response;
      } catch (error) {
        if (mounted.current) {
          setResult({
            kind: "error",
            title: "সংযোগজনিত error",
            message: error instanceof Error ? error.message : "Server-এর সাথে যোগাযোগ করা যায়নি। আবার চেষ্টা করুন।",
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
  }, [requestConfirmation]);

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
              aria-label="Close confirmation"
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
            <AlertDialogCancel onClick={() => settleConfirmation(false)}>না, ফিরে যান</AlertDialogCancel>
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
              <Button className="min-w-32 rounded-xl">বন্ধ করুন</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
