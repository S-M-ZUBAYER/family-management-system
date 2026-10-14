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
import { welfareErrorCopy } from "@/lib/welfare-error-copy";
import { welfareDocumentActionCopy, welfareDocumentErrorCopy, welfareDocumentResultCopy } from "@/lib/welfare-document-action-copy";
import { welfareRecordFeedback } from "@/lib/welfare-write-outcome";
import { archiveActionCopy, archiveFileDeleteActionCopy, archiveUploadActionCopy } from "@/lib/archive-action-copy";
import { memberActionCopy, memberActionResult } from "@/lib/member-action-copy";
import { memberRequestActionCopy } from "@/lib/member-request-action-copy";
import { noticeActionCopy } from "@/lib/notice-action-copy";
import { noticeErrorCopy } from "@/lib/notice-validation";
import { noticeWriteFeedback } from "@/lib/notice-write-outcome";
import { eventActionCopy } from "@/lib/event-action-copy";
import { eventErrorCopy } from "@/lib/event-validation";
import { eventWriteFeedback } from "@/lib/event-write-outcome";
import { eventMediaFeedback } from "@/lib/event-media-workflow";
import { eventParticipationFeedback } from "@/lib/event-participation";
import { eventCommentChangeFeedback } from "@/lib/event-comment-management";
import { chatTextActionCopy, chatTextFeedback } from "@/lib/chat-text-management";
import { chatAttachmentFeedback, chatAttachmentActionCopy } from "@/lib/chat-attachment-policy";
import { chatAttachmentDeleteFeedback, chatAttachmentDeleteActionCopy } from "@/lib/chat-attachment-deletion";
import { chatFlowFeedback, chatFlowActionCopy } from "@/lib/chat-send-reaction";
import { chatSetupFeedback, chatSetupActionCopy } from "@/lib/chat-setup-workflow";
import { chatLifecycleFeedback, chatLifecycleActionCopy } from "@/lib/chat-channel-lifecycle";
import { chatMembershipFeedback, chatMembershipActionCopy } from "@/lib/chat-membership-workflow";
import { magazineActionCopy } from "@/lib/magazine-action-copy";
import { magazineErrorCopy } from "@/lib/magazine-validation";
import { magazineWriteFeedback } from "@/lib/magazine-cover-write";
import { qurbaniErrorCopy, qurbaniRecordActionCopy, qurbaniStatusActionCopy } from "@/lib/qurbani-action-copy";
import { financeErrorCopy, financeRecordActionCopy, financeStatusActionCopy } from "@/lib/finance-action-copy";
import { healthActionCopy, healthErrorCopy } from "@/lib/health-action-copy";
import { healthRecordFeedback } from "@/lib/health-record-write";
import { healthDocumentActionCopy, healthDocumentFeedback } from "@/lib/health-document-workflow";
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
  const healthDocumentCopy=healthDocumentActionCopy(pathname,method,locale);
  if(healthDocumentCopy)return healthDocumentCopy;
  const membershipCopy = chatMembershipActionCopy(pathname, method, body, locale);
  if (membershipCopy) return membershipCopy;
  const lifecycleCopy = chatLifecycleActionCopy(pathname, method, body, locale);
  if (lifecycleCopy) return lifecycleCopy;
  if (pathname === "/api/chat" && action === "mark_read") return null;
  if (pathname === "/api/qurbani/records") {
    const recordCopy = qurbaniRecordActionCopy(body.kind, method, locale);
    if (recordCopy) return recordCopy;
  }
  if (pathname === "/api/qurbani/status") {
    const statusCopy = qurbaniStatusActionCopy(body.entity, body.status, method, locale);
    if (statusCopy) return statusCopy;
  }
  if (pathname === "/api/finance/records") {
    const financeCopy = financeRecordActionCopy(body.kind, method, locale);
    if (financeCopy) return financeCopy;
  }
  if (pathname === "/api/finance/status") {
    const financeCopy = financeStatusActionCopy(body, method, locale);
    if (financeCopy) return financeCopy;
  }
  if (pathname === "/api/health/records") {
    const healthCopy = healthActionCopy(body, method, locale);
    if (healthCopy) return healthCopy;
  }
  if (pathname === "/api/household/records") {
    const householdCopy = householdActionCopy(body, method, locale);
    if (householdCopy) return householdCopy;
  }
  if (pathname === "/api/welfare/records") {
    const welfareCopy = welfareActionCopy(body, method, locale);
    if (welfareCopy) return welfareCopy;
  }
  const welfareDocumentCopy = welfareDocumentActionCopy(pathname, method, locale);
  if (welfareDocumentCopy) return welfareDocumentCopy;
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
  const chatTextCopy = chatTextActionCopy(pathname, method, locale);
  if (chatTextCopy) return chatTextCopy;
  const attachmentCopy=chatAttachmentActionCopy(pathname,method,locale);
  if(attachmentCopy)return attachmentCopy;
  const attachmentDeleteCopy=chatAttachmentDeleteActionCopy(pathname,method,locale);
  if(attachmentDeleteCopy)return attachmentDeleteCopy;
  const flowCopy=chatFlowActionCopy(pathname,method,body,locale);
  if(flowCopy)return flowCopy;
  const setupCopy=chatSetupActionCopy(pathname,method,body,locale);
  if(setupCopy)return setupCopy;
  if (pathname === "/api/events" || pathname.startsWith("/api/events/") || pathname.startsWith("/api/event-media/") || pathname.startsWith("/api/event-comments/")) {
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
    const magazineMessage = magazineErrorCopy(payload.code, locale);
    if (!response.ok && magazineMessage) return magazineMessage;
    const noticeMessage = noticeErrorCopy(payload.code, locale);
    if (!response.ok && noticeMessage) return noticeMessage;
    const eventMessage = eventErrorCopy(payload.code, locale);
    if (!response.ok && eventMessage) return eventMessage;
    const qurbaniMessage = qurbaniErrorCopy(payload.code, locale);
    if (!response.ok && qurbaniMessage) return qurbaniMessage;
    const financeMessage = financeErrorCopy(payload.code, locale);
    if (!response.ok && financeMessage) return financeMessage;
    const healthMessage = healthErrorCopy(payload.code, locale);
    if (!response.ok && healthMessage) return healthMessage;
    const welfareDocumentMessage = welfareDocumentErrorCopy(payload.code, locale);
    if (!response.ok && welfareDocumentMessage) return welfareDocumentMessage;
    const welfareMessage = welfareErrorCopy(payload.code, locale);
    if (!response.ok && welfareMessage) return welfareMessage;
    const welfarePath = new URL(response.url, "http://localhost").pathname;
    if (response.ok && (welfarePath === "/api/welfare/upload" || welfarePath.startsWith("/api/welfare-document/"))) {
      const pending = welfareDocumentResultCopy(welfarePath, payload, locale);
      return pending ?? fallback;
    }
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

// Explicit outcomes avoid guessing success/failure from a partial-save message.
export function useActionResult() {
  return useCallback((result: ResultState) => {
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<ResultState>(feedbackEvent, { detail: result }));
  }, []);
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
          const welfarePayload = url.pathname === "/api/welfare/records" ? await response.clone().json().catch(() => ({})) as Record<string, unknown> : null;
          const welfareResult = welfarePayload ? welfareRecordFeedback(response.status, welfarePayload, locale) : null;
          const magazinePayload = ["/api/magazine/records", "/api/magazine/upload"].includes(url.pathname)
            ? await response.clone().json().then((value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}).catch(() => ({})) : null;
          const magazineResult = magazinePayload ? magazineWriteFeedback(url.pathname, response.status, magazinePayload, locale, method, parseBody(init?.body)) : null;
          const noticePayload = /^\/api\/notices(?:\/[^/]+)?$/.test(url.pathname)
            ? await response.clone().json().then((value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}).catch(() => ({})) : null;
          const noticeResult = noticePayload ? noticeWriteFeedback(url.pathname, response.status, noticePayload, locale, method, parseBody(init?.body)) : null;
          const eventPayload = /^\/api\/events(?:\/[^/]+)?$/.test(url.pathname)
            ? await response.clone().json().then((value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}).catch(() => ({})) : null;
          const eventResult = eventPayload ? eventWriteFeedback(url.pathname, response.status, eventPayload, locale, method, parseBody(init?.body)) : null;
          const participationPayload = /^\/api\/events\/[^/]+\/(rsvp|comments)$/.test(url.pathname)
            ? await response.clone().json().then((value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}).catch(() => ({})) : null;
          const participationResult = participationPayload ? eventParticipationFeedback(url.pathname, response.status, participationPayload, locale, method, parseBody(init?.body)) : null;
          const commentChangePayload = /^\/api\/event-comments\/[^/]+$/.test(url.pathname)
            ? await response.clone().json().then((value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}).catch(() => ({})) : null;
          const commentChangeResult = commentChangePayload ? eventCommentChangeFeedback(url.pathname, response.status, commentChangePayload, locale, method, parseBody(init?.body)) : null;
          const chatTextPayload = /^\/api\/chat-messages\/[^/]+$/.test(url.pathname)
            ? await response.clone().json().then((value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}).catch(() => ({})) : null;
          const chatTextResult = chatTextPayload ? chatTextFeedback(url.pathname, response.status, chatTextPayload, locale, method, parseBody(init?.body)) : null;
          const attachmentPayload=url.pathname==="/api/chat/upload"?await response.clone().json().then((v:unknown)=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{}).catch(()=>({})):null;
          const attachmentResult=attachmentPayload?chatAttachmentFeedback(url.pathname,response.status,attachmentPayload,locale,init?.body):null;
          const attachmentDeletePayload=/^\/api\/chat-file\/[^/]+$/.test(url.pathname)&&method==="DELETE"?await response.clone().json().then((v:unknown)=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{}).catch(()=>({})):null;
          const attachmentDeleteResult=attachmentDeletePayload?chatAttachmentDeleteFeedback(url.pathname,response.status,attachmentDeletePayload,locale,method,parseBody(init?.body)):null;
          const flowBody=parseBody(init?.body);
          const healthPayload=url.pathname==="/api/health/records"?await response.clone().json().catch(()=>null):null;
          const healthResult=healthRecordFeedback(url.pathname,response.status,healthPayload,locale,method,flowBody);
          const healthDocumentPayload=url.pathname==="/api/health/upload"||/^\/api\/health-document\/[^/]+$/.test(url.pathname)&&method==="DELETE"?await response.clone().json().catch(()=>null):null;
          const healthDocumentResult=healthDocumentFeedback(url.pathname,response.status,healthDocumentPayload,locale,method,init?.body instanceof FormData?init.body:flowBody);
          const membershipPayload=/^\/api\/chat-channels\/[^/]+\/members$/.test(url.pathname)?await response.clone().json().catch(()=>null):null;
          const membershipResult=chatMembershipFeedback(url.pathname,response.status,membershipPayload,locale,method,flowBody);
          const lifecyclePayload=/^\/api\/chat-channels\/[^/]+$/.test(url.pathname)?await response.clone().json().catch(()=>null):null;
          const lifecycleResult=chatLifecycleFeedback(url.pathname,response.status,lifecyclePayload,locale,method,flowBody);
          const flowPayload=url.pathname==="/api/chat"&&["send_message","toggle_reaction"].includes(flowBody.action as string)?await response.clone().json().then((v:unknown)=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{}).catch(()=>({})):null;
          const flowResult=flowPayload?chatFlowFeedback(url.pathname,response.status,flowPayload,locale,method,flowBody):null;
          const setupPayload=url.pathname==="/api/chat"&&["create_channel","update_notification"].includes(flowBody.action as string)?await response.clone().json().then((v:unknown)=>v&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:{}).catch(()=>({})):null;
          // Display-only request context; API authorization never trusts this hint.
          const setupActor=new Headers(init?.headers).get("X-Fms-Chat-Actor")??"";
          const setupResult=setupPayload?chatSetupFeedback(url.pathname,response.status,setupPayload,locale,method,flowBody,setupActor):null;
          const mediaPayload = /^\/api\/events\/[^/]+\/media$|^\/api\/event-media\/[^/]+$/.test(url.pathname)
            ? await response.clone().json().then((value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}).catch(() => ({})) : null;
          const mediaResult = mediaPayload ? eventMediaFeedback(url.pathname, response.status, mediaPayload, locale, method, init?.body) : null;
          const message = memberResult ? memberResult.message : response.ok && response.status !== 202 && (url.pathname === "/api/notices" || url.pathname.startsWith("/api/notices/") || url.pathname === "/api/events" || url.pathname.startsWith("/api/events/") || url.pathname.startsWith("/api/event-media/") || url.pathname.startsWith("/api/event-comments/") || ["/api/magazine/records", "/api/magazine/upload", "/api/qurbani/records", "/api/household/records", "/api/welfare/records", "/api/archives/records", "/api/archives/upload"].includes(url.pathname))
            ? copy.successMessage
            : response.ok && ["/api/finance/records", "/api/finance/status", "/api/health/records"].includes(url.pathname) ? copy.successMessage
            : await responseMessage(response, response.ok ? copy.successMessage : (locale === "bn" ? "Action সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।" : "The action could not be completed. Please try again."), locale);
          const nextResult = noticeResult ?? healthResult ?? healthDocumentResult ?? membershipResult ?? lifecycleResult ?? eventResult ?? participationResult ?? commentChangeResult ?? chatTextResult ?? attachmentResult ?? attachmentDeleteResult ?? flowResult ?? setupResult ?? mediaResult ?? magazineResult ?? welfareResult ?? (memberResult?.noChange
            ? { kind: "info" as const, title: locale === "bn" ? "পরিবর্তন প্রয়োজন নেই" : "No change needed", message }
            : mutationResponseResult(memberResult?.status ?? response.status, message, locale));
          lastMutationResult.current = { kind: nextResult.kind, message: nextResult.message, at: Date.now() };
          showResult(nextResult);
        }
        return response;
      } catch (error) {
        // A browser transport failure after sending a Welfare mutation cannot
        // prove rollback. Do not invite another potentially duplicate write.
        const welfareFailure = url.pathname === "/api/welfare/records"
          ? welfareRecordFeedback(503, { code: "WELFARE_WRITE_OUTCOME_UNKNOWN", outcomeUnknown: true }, locale) : null;
        const magazineFailure = magazineWriteFeedback(url.pathname, 503, { code: "MAGAZINE_COVER_OUTCOME_UNKNOWN", outcomeUnknown: true }, locale);
        const noticeFailure = noticeWriteFeedback(url.pathname, 503, { outcomeUnknown: true }, locale);
        const healthFailure=healthRecordFeedback(url.pathname,503,{outcomeUnknown:true},locale,method,parseBody(init?.body));
        const healthDocumentFailure=healthDocumentFeedback(url.pathname,503,{outcomeUnknown:true},locale,method,init?.body instanceof FormData?init.body:parseBody(init?.body));
        const eventFailure = eventWriteFeedback(url.pathname, 503, { outcomeUnknown: true }, locale);
        const participationFailure = eventParticipationFeedback(url.pathname, 503, { outcomeUnknown: true }, locale);
        const commentChangeFailure = eventCommentChangeFeedback(url.pathname, 503, { outcomeUnknown: true }, locale);
        const chatTextFailure = chatTextFeedback(url.pathname, 503, { outcomeUnknown: true }, locale);
        const attachmentFailure=chatAttachmentFeedback(url.pathname,503,{outcomeUnknown:true},locale);
        const attachmentDeleteFailure=chatAttachmentDeleteFeedback(url.pathname,503,{outcomeUnknown:true},locale,method);
        const flowFailure=chatFlowFeedback(url.pathname,503,{outcomeUnknown:true},locale,method,parseBody(init?.body));
        const setupFailure=chatSetupFeedback(url.pathname,503,{outcomeUnknown:true},locale,method,parseBody(init?.body),new Headers(init?.headers).get("X-Fms-Chat-Actor")??"");
        const lifecycleFailure=chatLifecycleFeedback(url.pathname,503,{outcomeUnknown:true},locale,method,parseBody(init?.body));
        const membershipFailure=chatMembershipFeedback(url.pathname,503,{outcomeUnknown:true},locale,method,parseBody(init?.body));
        const mediaFailure = eventMediaFeedback(url.pathname, 503, { outcomeUnknown: true }, locale);
        const propagatedError = membershipFailure ? new Error(membershipFailure.message) : lifecycleFailure ? new Error(lifecycleFailure.message) : setupFailure ? new Error(setupFailure.message) : flowFailure ? new Error(flowFailure.message) : attachmentDeleteFailure ? new Error(attachmentDeleteFailure.message) : attachmentFailure ? new Error(attachmentFailure.message) : chatTextFailure ? new Error(chatTextFailure.message) : commentChangeFailure ? new Error(commentChangeFailure.message) : mediaFailure ? new Error(mediaFailure.message) : participationFailure ? new Error(participationFailure.message) : eventFailure ? new Error(eventFailure.message) : noticeFailure ? new Error(noticeFailure.message) : magazineFailure ? new Error(magazineFailure.message) : welfareFailure ? new Error(welfareFailure.message) : error;
        if (mounted.current) {
          const nextResult: ResultState = healthFailure ?? healthDocumentFailure ?? membershipFailure ?? lifecycleFailure ?? setupFailure ?? flowFailure ?? attachmentDeleteFailure ?? attachmentFailure ?? chatTextFailure ?? noticeFailure ?? eventFailure ?? participationFailure ?? commentChangeFailure ?? mediaFailure ?? magazineFailure ?? welfareFailure ?? {
            kind: "error",
            title: locale === "bn" ? "সংযোগজনিত error" : "Connection error",
            message: error instanceof Error ? error.message : (locale === "bn" ? "Server-এর সাথে যোগাযোগ করা যায়নি। আবার চেষ্টা করুন।" : "Could not contact the server. Please try again."),
          };
          lastMutationResult.current = { kind: nextResult.kind, message: nextResult.message, at: Date.now() };
          showResult(nextResult);
        }
        throw propagatedError;
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
