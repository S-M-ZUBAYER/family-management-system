"use client";

import { useActionFeedback } from "@/components/action-modal-provider";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import {
  Bell,
  BellOff,
  CheckCheck,
  Download,
  FileSpreadsheet,
  FileText,
  Hash,
  Headphones,
  ImageIcon,
  LoaderCircle,
  LockKeyhole,
  MessageCircleMore,
  Mic,
  Paperclip,
  Plus,
  Reply,
  Search,
  SendHorizontal,
  ShieldCheck,
  SmilePlus,
  Square,
  UserRound,
  Users,
  X,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ChatChannel = {
  id: string;
  name: string;
  description: string | null;
  channelType: "general" | "custom" | "event" | "qurbani" | "admin" | "direct";
  visibility: "family" | "admins" | "invite_only";
  updatedAt: string;
  unreadCount: number;
  memberCount: number;
  memberIds: string[];
  notificationLevel: "all" | "mentions" | "muted";
};

type ChatMember = {
  authUserId: string;
  name: string;
  initials: string;
  role: "owner" | "family_admin" | "manager" | "member";
};

type ChatMessage = {
  id: string;
  channel_id: string;
  author_name: string;
  message_type: "text" | "attachment" | "system";
  body: string | null;
  reply_to_id: string | null;
  edited_at: string | null;
  created_at: string;
  is_mine: boolean;
};

type ChatReaction = {
  id: string;
  message_id: string;
  emoji: string;
  created_at: string;
  is_mine: boolean;
};

type ChatAttachment = {
  id: string;
  channel_id: string;
  message_id: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  created_at: string;
};

type ChatPayload = {
  family?: { id: string; name_bn: string; name_en: string };
  viewer?: { authUserId: string; name: string; role: ChatMember["role"] };
  members?: ChatMember[];
  channels?: ChatChannel[];
  messages?: ChatMessage[];
  reactions?: ChatReaction[];
  attachments?: ChatAttachment[];
  migrationRequired?: boolean;
  permissions?: { canManage: boolean };
  code?: string;
  error?: string;
};

const messageTime = new Intl.DateTimeFormat("bn-BD", {
  hour: "numeric",
  minute: "2-digit",
});
const messageDate = new Intl.DateTimeFormat("bn-BD", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const reactionOptions = ["❤️", "👍", "😂", "🤲", "🎉"];

function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const records = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => records.set(item.id, item));
  return [...records.values()];
}

function bytesLabel(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function channelIcon(channel: ChatChannel) {
  if (channel.channelType === "direct") return UserRound;
  if (channel.channelType === "admin") return ShieldCheck;
  if (channel.visibility === "invite_only") return LockKeyhole;
  return Hash;
}

function attachmentIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType.startsWith("audio/")) return Headphones;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel")) return FileSpreadsheet;
  return FileText;
}

export function FamilyChat() {
  const [family, setFamily] = useState<ChatPayload["family"]>();
  const [viewer, setViewer] = useState<ChatPayload["viewer"]>();
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reactions, setReactions] = useState<ChatReaction[]>([]);
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [live, setLive] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [feedback, setFeedback] = useActionFeedback();
  const [query, setQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | "group" | "direct">("all");
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<"custom" | "admin" | "direct">("custom");
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createVisibility, setCreateVisibility] = useState<"family" | "invite_only">("family");
  const [createMemberIds, setCreateMemberIds] = useState<string[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recorderStreamRef = useRef<MediaStream | null>(null);

  const selected = useMemo(
    () => channels.find((channel) => channel.id === selectedId) ?? null,
    [channels, selectedId],
  );

  const visibleChannels = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return channels.filter((channel) => {
      const matchesType = channelFilter === "all"
        || (channelFilter === "direct" && channel.channelType === "direct")
        || (channelFilter === "group" && channel.channelType !== "direct");
      return matchesType && (!needle || `${channel.name} ${channel.description ?? ""}`.toLowerCase().includes(needle));
    });
  }, [channelFilter, channels, query]);

  const selectedMembers = useMemo(() => {
    if (!selected) return [];
    if (selected.visibility === "family") return members;
    if (selected.visibility === "admins") return members.filter((member) => member.role !== "member");
    return members.filter((member) => selected.memberIds.includes(member.authUserId));
  }, [members, selected]);

  const loadMetadata = useCallback(async (preferredChannelId?: string) => {
    setFeedback(null);
    try {
      const response = await fetch("/api/chat", { cache: "no-store" });
      const payload = (await response.json()) as ChatPayload;
      if (payload.code === "FAMILY_SETUP_REQUIRED") {
        setSetupRequired(true);
        setChannels([]);
        return;
      }
      if (!response.ok) throw new Error(payload.error ?? "Family chat পাওয়া যায়নি।");
      const nextChannels = payload.channels ?? [];
      setFamily(payload.family);
      setViewer(payload.viewer);
      setMembers(payload.members ?? []);
      setChannels(nextChannels);
      setMigrationRequired(Boolean(payload.migrationRequired));
      setCanManage(Boolean(payload.permissions?.canManage));
      setSetupRequired(false);
      setSelectedId((current) => {
        const candidate = preferredChannelId ?? current;
        if (candidate && nextChannels.some((channel) => channel.id === candidate)) return candidate;
        return nextChannels.find((channel) => channel.channelType === "general")?.id ?? nextChannels[0]?.id ?? null;
      });
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Family chat পাওয়া যায়নি।");
    } finally {
      setLoading(false);
    }
  }, []);

  const markRead = useCallback(async (channelId: string, lastMessageId: string) => {
    try {
      await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read", channelId, lastReadMessageId: lastMessageId }),
      });
      setChannels((current) => current.map((channel) =>
        channel.id === channelId ? { ...channel, unreadCount: 0 } : channel,
      ));
    } catch {
      // Read state is retried on the next successful channel load.
    }
  }, []);

  const applyFeed = useCallback((payload: ChatPayload, replace = false) => {
    const incomingMessages = payload.messages ?? [];
    setMessages((current) => replace ? incomingMessages : mergeById(current, incomingMessages));
    setReactions((current) => replace ? (payload.reactions ?? []) : mergeById(current, payload.reactions ?? []));
    setAttachments((current) => replace ? (payload.attachments ?? []) : mergeById(current, payload.attachments ?? []));
    const newestIncoming = incomingMessages[incomingMessages.length - 1];
    if (newestIncoming && selectedId) {
      void markRead(selectedId, newestIncoming.id);
      if (
        !newestIncoming.is_mine
        && document.hidden
        && typeof Notification !== "undefined"
        && Notification.permission === "granted"
      ) {
        new Notification(selected?.name ?? "Family chat", {
          body: `${newestIncoming.author_name}: ${newestIncoming.body ?? "নতুন attachment"}`,
        });
      }
    }
  }, [markRead, selected?.name, selectedId]);

  const loadMessages = useCallback(async (channelId: string, silent = false) => {
    if (!silent) setMessagesLoading(true);
    try {
      const response = await fetch(`/api/chat?channelId=${encodeURIComponent(channelId)}`, { cache: "no-store" });
      const payload = (await response.json()) as ChatPayload;
      if (!response.ok) throw new Error(payload.error ?? "Messages পাওয়া যায়নি।");
      applyFeed(payload, true);
    } catch (error) {
      if (!silent) setFeedback(error instanceof Error ? error.message : "Messages পাওয়া যায়নি।");
    } finally {
      if (!silent) setMessagesLoading(false);
    }
  }, [applyFeed]);

  useEffect(() => {
    if (typeof Notification === "undefined") setNotificationPermission("unsupported");
    else setNotificationPermission(Notification.permission);
    void loadMetadata();
  }, [loadMetadata]);

  useEffect(() => {
    if (!selectedId || migrationRequired) {
      setMessages([]);
      setReactions([]);
      setAttachments([]);
      return;
    }
    setMessages([]);
    setReactions([]);
    setAttachments([]);
    setReplyingTo(null);
    setPendingFile(null);
    void loadMessages(selectedId);
    const timer = window.setInterval(() => void loadMessages(selectedId, true), 15000);
    return () => window.clearInterval(timer);
  }, [loadMessages, migrationRequired, selectedId]);

  const latestCreatedAt = messages[messages.length - 1]?.created_at;
  useEffect(() => {
    if (!selectedId || migrationRequired) return;
    const cursor = latestCreatedAt ?? new Date().toISOString();
    const source = new EventSource(
      `/api/chat/stream?channelId=${encodeURIComponent(selectedId)}&after=${encodeURIComponent(cursor)}`,
    );
    source.addEventListener("ready", () => setLive(true));
    source.addEventListener("heartbeat", () => setLive(true));
    source.addEventListener("messages", (event) => {
      setLive(true);
      applyFeed(JSON.parse((event as MessageEvent).data) as ChatPayload);
    });
    source.addEventListener("recover", () => setLive(false));
    source.onerror = () => setLive(false);
    return () => source.close();
  }, [applyFeed, latestCreatedAt, migrationRequired, selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: messagesLoading ? "auto" : "smooth" });
  }, [messages.length, messagesLoading]);

  async function createChannel() {
    if (createType === "direct" && !createMemberIds.length) return;
    if (createType !== "direct" && createName.trim().length < 2) return;
    setWorking(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_channel",
          channelType: createType,
          name: createName,
          description: createDescription,
          visibility: createVisibility,
          memberIds: createMemberIds,
        }),
      });
      const payload = (await response.json()) as { channelId?: string; existing?: boolean; error?: string };
      if (!response.ok || !payload.channelId) throw new Error(payload.error ?? "Channel তৈরি হয়নি।");
      setCreateOpen(false);
      setCreateName("");
      setCreateDescription("");
      setCreateMemberIds([]);
      await loadMetadata(payload.channelId);
      setFeedback(payload.existing ? "আগের private conversation খোলা হয়েছে।" : "নতুন chat channel তৈরি হয়েছে।");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Channel তৈরি হয়নি।");
    } finally {
      setWorking(false);
    }
  }

  async function sendMessage() {
    if (!selected || (!draft.trim() && !pendingFile)) return;
    setWorking(true);
    setFeedback(null);
    try {
      if (pendingFile) {
        const body = new FormData();
        body.set("channelId", selected.id);
        body.set("file", pendingFile);
        body.set("caption", draft);
        if (replyingTo) body.set("replyToId", replyingTo.id);
        const response = await fetch("/api/chat/upload", { method: "POST", body });
        const payload = (await response.json()) as { message?: ChatMessage; attachment?: ChatAttachment; error?: string };
        if (!response.ok || !payload.message || !payload.attachment) throw new Error(payload.error ?? "Attachment পাঠানো যায়নি।");
        setMessages((current) => mergeById(current, [payload.message!]));
        setAttachments((current) => mergeById(current, [payload.attachment!]));
      } else {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "send_message",
            channelId: selected.id,
            body: draft,
            replyToId: replyingTo?.id,
          }),
        });
        const payload = (await response.json()) as { message?: ChatMessage; error?: string };
        if (!response.ok || !payload.message) throw new Error(payload.error ?? "Message পাঠানো যায়নি।");
        setMessages((current) => mergeById(current, [payload.message!]));
      }
      setDraft("");
      setPendingFile(null);
      setReplyingTo(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadMetadata(selected.id);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Message পাঠানো যায়নি।");
    } finally {
      setWorking(false);
    }
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if (!selected) return;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle_reaction", channelId: selected.id, messageId, emoji }),
      });
      const payload = (await response.json()) as { active?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Reaction update হয়নি।");
      await loadMessages(selected.id, true);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Reaction update হয়নি।");
    }
  }

  async function updateNotification(level: ChatChannel["notificationLevel"]) {
    if (!selected) return;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_notification", channelId: selected.id, level }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Notification update হয়নি।");
      setChannels((current) => current.map((channel) => channel.id === selected.id
        ? { ...channel, notificationLevel: level }
        : channel));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Notification update হয়নি।");
    }
  }

  async function requestNotifications() {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
  }

  async function startRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recorderStreamRef.current = stream;
      recorderChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) recorderChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const extension = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const blob = new Blob(recorderChunksRef.current, { type });
        setPendingFile(new File([blob], `voice-note-${Date.now()}.${extension}`, { type }));
        recorderStreamRef.current?.getTracks().forEach((track) => track.stop());
        recorderStreamRef.current = null;
        setRecording(false);
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setFeedback("Microphone permission পাওয়া যায়নি। চাইলে audio file attach করতে পারেন।");
    }
  }

  function chooseFile(file?: File) {
    if (!file) return;
    setPendingFile(file);
    setFeedback(null);
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    chooseFile(event.target.files?.[0]);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    chooseFile(event.dataTransfer.files?.[0]);
  }

  async function exportXlsx() {
    if (!selected) return;
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const messageRows = messages.map((message, index) => {
        const reply = message.reply_to_id ? messages.find((item) => item.id === message.reply_to_id) : null;
        const messageAttachments = attachments.filter((item) => item.message_id === message.id);
        const reactionSummary = reactions
          .filter((item) => item.message_id === message.id)
          .reduce<Record<string, number>>((summary, reaction) => ({
            ...summary,
            [reaction.emoji]: (summary[reaction.emoji] ?? 0) + 1,
          }), {});
        return {
          "ক্রমিক": index + 1,
          "সময়": new Date(message.created_at).toLocaleString("bn-BD"),
          "প্রেরক": message.author_name,
          "ধরন": message.message_type,
          "বার্তা": message.body ?? "",
          "Reply to": reply ? `${reply.author_name}: ${reply.body ?? "Attachment"}` : "",
          "Attachment": messageAttachments.map((item) => item.file_name).join(", "),
          "Reactions": Object.entries(reactionSummary).map(([emoji, count]) => `${emoji} ${count}`).join(" · "),
        };
      });
      const memberRows = selectedMembers.map((member, index) => ({
        "ক্রমিক": index + 1,
        "সদস্য": member.name,
        "ভূমিকা": member.role,
      }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(messageRows), "Messages");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(memberRows), "Members");
      const fileName = selected.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "family-chat";
      XLSX.writeFile(workbook, `${fileName}-chat.xlsx`);
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
    void Promise.resolve(modelContext.registerTool({
      name: "get_current_family_chat_summary",
      title: "Get current family chat summary",
      description: "Read the currently selected family chat channel, participants, unread count and recent message summary.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute(input: unknown) {
        if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input as object).length) {
          throw new Error("This tool does not accept any input fields.");
        }
        return {
          channel: selected ? { id: selected.id, name: selected.name, type: selected.channelType } : null,
          memberCount: selected?.memberCount ?? 0,
          unreadCount: selected?.unreadCount ?? 0,
          recentMessages: messages.slice(-20).map((message) => ({
            sender: message.author_name,
            body: message.body,
            type: message.message_type,
            createdAt: message.created_at,
          })),
        };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [messages, selected]);

  if (loading) {
    return (
      <main className="grid min-h-[calc(100vh-4rem)] place-items-center p-6">
        <div className="text-center">
          <LoaderCircle className="mx-auto size-7 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Family chat প্রস্তুত হচ্ছে…</p>
        </div>
      </main>
    );
  }

  if (setupRequired) {
    return (
      <main className="mx-auto max-w-3xl p-6 md:p-10">
        <Card className="rounded-3xl border-dashed">
          <CardContent className="p-8 text-center">
            <Users className="mx-auto size-10 text-primary" />
            <h1 className="mt-4 text-2xl font-bold">আগে family setup সম্পন্ন করুন</h1>
            <p className="mt-2 text-muted-foreground">Approved family member হওয়ার পর private chat ব্যবহার করা যাবে।</p>
            <Button asChild className="mt-5 rounded-xl"><a href="/setup">Family setup</a></Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] p-3 sm:p-4 md:p-6">
      <section className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <span className={cn("size-2 rounded-full", live ? "bg-emerald-500" : "bg-amber-500")} />
            {live ? "লাইভ সংযোগ চালু" : "লাইভ সংযোগ পুনরায় হচ্ছে"}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">Family Chat</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {family?.name_bn ?? "পরিবার"} · নিরাপদ group ও private conversation
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {notificationPermission !== "granted" && notificationPermission !== "unsupported" ? (
            <Button variant="outline" className="rounded-xl" onClick={() => void requestNotifications()}>
              <Bell className="size-4" /> Notification চালু করুন
            </Button>
          ) : null}
          <Button variant="outline" className="rounded-xl" onClick={() => void exportXlsx()} disabled={!selected || exporting}>
            {exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} XLSX
          </Button>
          <Button className="rounded-xl" onClick={() => setCreateOpen(true)} disabled={migrationRequired}>
            <Plus className="size-4" /> নতুন chat
          </Button>
        </div>
      </section>

      {migrationRequired ? (
        <div className="mb-4 rounded-2xl border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100">
          Chat database এখনো তৈরি হয়নি। Supabase SQL Editor-এ <b>supabase/migrations/20260927_family_chat.sql</b> চালালে General chat, direct message ও live history সক্রিয় হবে।
        </div>
      ) : null}
      {feedback ? (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-2xl border bg-card px-4 py-3 text-sm shadow-sm">
          <span>{feedback}</span>
          <Button size="icon-xs" variant="ghost" onClick={() => setFeedback(null)}><X /></Button>
        </div>
      ) : null}

      <div className="grid min-h-[690px] overflow-hidden rounded-3xl border bg-card shadow-[0_18px_55px_-36px_rgba(15,23,42,0.55)] lg:h-[calc(100vh-9.5rem)] lg:grid-cols-[290px_minmax(0,1fr)] xl:grid-cols-[290px_minmax(0,1fr)_280px]">
        <aside className="border-b bg-muted/20 lg:border-b-0 lg:border-r">
          <div className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Chat খুঁজুন" className="rounded-xl pl-9" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-muted p-1">
              {(["all", "group", "direct"] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setChannelFilter(filter)}
                  className={cn(
                    "rounded-lg px-2 py-1.5 text-xs font-semibold transition",
                    channelFilter === filter ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {filter === "all" ? "সব" : filter === "group" ? "Group" : "Direct"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto px-3 pb-4 lg:block lg:h-[calc(100%-104px)] lg:space-y-1 lg:overflow-y-auto">
            {visibleChannels.map((channel) => {
              const Icon = channelIcon(channel);
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => setSelectedId(channel.id)}
                  className={cn(
                    "flex min-w-[230px] items-center gap-3 rounded-2xl border border-transparent p-3 text-left transition lg:w-full lg:min-w-0",
                    selectedId === channel.id ? "border-primary/15 bg-primary/10" : "hover:bg-muted/70",
                  )}
                >
                  <div className={cn(
                    "grid size-10 shrink-0 place-items-center rounded-xl",
                    channel.channelType === "direct" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" : "bg-primary/10 text-primary",
                  )}>
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{channel.name}</p>
                      {channel.unreadCount ? <Badge className="h-5 min-w-5 rounded-full px-1.5 text-[10px]">{channel.unreadCount}</Badge> : null}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {channel.description ?? `${channel.memberCount} জন সদস্য`}
                    </p>
                  </div>
                </button>
              );
            })}
            {!visibleChannels.length ? (
              <div className="min-w-[250px] p-5 text-center text-sm text-muted-foreground lg:min-w-0">
                {migrationRequired ? "Migration চালানো বাকি।" : "কোনো chat পাওয়া যায়নি।"}
              </div>
            ) : null}
          </div>
        </aside>

        <section className="flex min-h-[600px] min-w-0 flex-col bg-background">
          {selected ? (
            <>
              <header className="flex h-[72px] shrink-0 items-center gap-3 border-b px-4 md:px-5">
                <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  {selected.channelType === "direct" ? <UserRound className="size-4" /> : <Hash className="size-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-bold">{selected.name}</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {selected.memberCount} জন · {selected.visibility === "family" ? "পরিবারের সবাই" : selected.visibility === "admins" ? "Admin only" : "Private group"}
                  </p>
                </div>
                <Select value={selected.notificationLevel} onValueChange={(value) => void updateNotification(value as ChatChannel["notificationLevel"])}>
                  <SelectTrigger className="w-10 rounded-xl px-0 sm:w-[132px] sm:px-3" aria-label="Channel notifications">
                    <span className="sm:hidden">{selected.notificationLevel === "muted" ? <BellOff className="mx-auto size-4" /> : <Bell className="mx-auto size-4" />}</span>
                    <span className="hidden sm:inline"><SelectValue /></span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">সব notification</SelectItem>
                    <SelectItem value="mentions">শুধু mention</SelectItem>
                    <SelectItem value="muted">Muted</SelectItem>
                  </SelectContent>
                </Select>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,_var(--color-muted)_0,_transparent_38%)] px-3 py-5 md:px-6">
                {messagesLoading ? (
                  <div className="grid h-full place-items-center"><LoaderCircle className="size-6 animate-spin text-primary" /></div>
                ) : !messages.length ? (
                  <div className="grid h-full place-items-center text-center">
                    <div>
                      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><MessageCircleMore /></div>
                      <h3 className="mt-4 font-bold">এই chat এখনো শান্ত</h3>
                      <p className="mt-1 text-sm text-muted-foreground">প্রথম বার্তাটি পাঠিয়ে আলোচনা শুরু করুন।</p>
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto max-w-3xl space-y-4">
                    {messages.map((message, index) => {
                      const previous = messages[index - 1];
                      const showDate = !previous || new Date(previous.created_at).toDateString() !== new Date(message.created_at).toDateString();
                      const reply = message.reply_to_id ? messages.find((item) => item.id === message.reply_to_id) : null;
                      const messageAttachments = attachments.filter((item) => item.message_id === message.id);
                      const groupedReactions = reactions
                        .filter((item) => item.message_id === message.id)
                        .reduce<Record<string, { count: number; mine: boolean }>>((summary, reaction) => {
                          const current = summary[reaction.emoji] ?? { count: 0, mine: false };
                          summary[reaction.emoji] = { count: current.count + 1, mine: current.mine || reaction.is_mine };
                          return summary;
                        }, {});
                      return (
                        <div key={message.id}>
                          {showDate ? (
                            <div className="my-5 flex items-center gap-3 text-[11px] font-semibold text-muted-foreground">
                              <Separator className="flex-1" /><span>{messageDate.format(new Date(message.created_at))}</span><Separator className="flex-1" />
                            </div>
                          ) : null}
                          <article className={cn("group flex gap-2.5", message.is_mine && "flex-row-reverse")}>
                            <Avatar className="mt-auto size-8 border">
                              <AvatarFallback className="text-[10px] font-bold">{message.author_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className={cn("max-w-[82%] md:max-w-[72%]", message.is_mine && "items-end")}>
                              <div className={cn("mb-1 flex items-center gap-2 px-1", message.is_mine && "justify-end")}>
                                <span className="text-[11px] font-semibold text-muted-foreground">{message.is_mine ? "আপনি" : message.author_name}</span>
                                <span className="text-[10px] text-muted-foreground/70">{messageTime.format(new Date(message.created_at))}</span>
                              </div>
                              <div className={cn(
                                "relative rounded-2xl border px-3.5 py-2.5 text-sm leading-6 shadow-sm",
                                message.is_mine ? "rounded-br-md border-primary/10 bg-primary text-primary-foreground" : "rounded-bl-md bg-card",
                              )}>
                                {reply ? (
                                  <div className={cn("mb-2 rounded-lg border-l-2 px-2 py-1 text-xs", message.is_mine ? "border-primary-foreground/50 bg-primary-foreground/10" : "border-primary bg-muted") }>
                                    <p className="font-semibold">{reply.author_name}</p>
                                    <p className="line-clamp-1 opacity-80">{reply.body ?? "Attachment"}</p>
                                  </div>
                                ) : null}
                                {message.body ? <p className="whitespace-pre-wrap break-words">{message.body}</p> : null}
                                {messageAttachments.map((attachment) => {
                                  const AttachmentIcon = attachmentIcon(attachment.mime_type);
                                  const source = `/api/chat-file/${attachment.id}`;
                                  return (
                                    <div key={attachment.id} className={cn("mt-2 overflow-hidden rounded-xl border", message.is_mine ? "border-primary-foreground/25 bg-primary-foreground/10" : "bg-muted/55")}>
                                      {attachment.mime_type.startsWith("image/") ? (
                                        <a href={source} target="_blank" rel="noreferrer"><img src={source} alt={attachment.file_name} className="max-h-72 w-full object-cover" /></a>
                                      ) : attachment.mime_type.startsWith("audio/") ? (
                                        <div className="p-3"><audio controls preload="metadata" className="h-9 max-w-full" src={source}>Audio playback unavailable.</audio></div>
                                      ) : (
                                        <a href={source} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-3">
                                          <AttachmentIcon className="size-5 shrink-0" />
                                          <span className="min-w-0 flex-1"><b className="block truncate text-xs">{attachment.file_name}</b><small className="opacity-75">{bytesLabel(attachment.file_size)}</small></span>
                                          <Download className="size-4" />
                                        </a>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              <div className={cn("mt-1.5 flex min-h-7 flex-wrap items-center gap-1", message.is_mine && "justify-end")}>
                                {Object.entries(groupedReactions).map(([emoji, value]) => (
                                  <button key={emoji} type="button" onClick={() => void toggleReaction(message.id, emoji)} className={cn("rounded-full border bg-card px-2 py-0.5 text-xs shadow-sm", value.mine && "border-primary bg-primary/10")}>
                                    {emoji} {value.count}
                                  </button>
                                ))}
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button size="icon-xs" variant="ghost" className="opacity-50 transition group-hover:opacity-100"><SmilePlus /></Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align={message.is_mine ? "end" : "start"} className="flex min-w-0 gap-1 p-1.5">
                                    {reactionOptions.map((emoji) => <DropdownMenuItem key={emoji} onClick={() => void toggleReaction(message.id, emoji)} className="cursor-pointer px-2 text-lg">{emoji}</DropdownMenuItem>)}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                                <Button size="icon-xs" variant="ghost" className="opacity-50 transition group-hover:opacity-100" onClick={() => setReplyingTo(message)}><Reply /></Button>
                                {message.is_mine ? <CheckCheck className="ml-1 size-3.5 text-primary" /> : null}
                              </div>
                            </div>
                          </article>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </div>

              <footer
                className={cn("shrink-0 border-t bg-card p-3 md:p-4", dragActive && "bg-primary/5")}
                onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
              >
                <div className="mx-auto max-w-3xl">
                  {replyingTo ? (
                    <div className="mb-2 flex items-center gap-3 rounded-xl border-l-4 border-primary bg-muted/60 px-3 py-2 text-xs">
                      <Reply className="size-3.5" />
                      <div className="min-w-0 flex-1"><b>{replyingTo.author_name}</b><p className="truncate text-muted-foreground">{replyingTo.body ?? "Attachment"}</p></div>
                      <Button size="icon-xs" variant="ghost" onClick={() => setReplyingTo(null)}><X /></Button>
                    </div>
                  ) : null}
                  {pendingFile ? (
                    <div className="mb-2 flex items-center gap-3 rounded-xl border bg-muted/50 px-3 py-2 text-xs">
                      {pendingFile.type.startsWith("audio/") ? <Headphones className="size-4" /> : <Paperclip className="size-4" />}
                      <div className="min-w-0 flex-1"><b className="block truncate">{pendingFile.name}</b><span className="text-muted-foreground">{bytesLabel(pendingFile.size)}</span></div>
                      <Button size="icon-xs" variant="ghost" onClick={() => setPendingFile(null)}><X /></Button>
                    </div>
                  ) : null}
                  <div className="flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileInput} accept="image/*,audio/*,video/mp4,video/webm,.pdf,.doc,.docx,.xls,.xlsx" />
                    <Button type="button" size="icon" variant="ghost" className="shrink-0 rounded-xl" onClick={() => fileInputRef.current?.click()} aria-label="Attach file"><Paperclip /></Button>
                    <Textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendMessage();
                        }
                      }}
                      placeholder={dragActive ? "File এখানে ছাড়ুন" : "বার্তা লিখুন…  Shift+Enter নতুন লাইন"}
                      className="max-h-32 min-h-10 resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
                    />
                    <Button type="button" size="icon" variant={recording ? "destructive" : "ghost"} className="shrink-0 rounded-xl" onClick={() => void startRecording()} aria-label={recording ? "Stop recording" : "Record voice note"}>
                      {recording ? <Square className="size-4 fill-current" /> : <Mic />}
                    </Button>
                    <Button type="button" size="icon" className="shrink-0 rounded-xl" onClick={() => void sendMessage()} disabled={working || (!draft.trim() && !pendingFile)} aria-label="Send message">
                      {working ? <LoaderCircle className="animate-spin" /> : <SendHorizontal />}
                    </Button>
                  </div>
                  <p className="mt-1.5 px-2 text-[10px] text-muted-foreground">Private files family permission ছাড়া খোলা যাবে না। Voice note পাঠাতে microphone permission লাগবে।</p>
                </div>
              </footer>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div><MessageCircleMore className="mx-auto size-11 text-primary" /><h2 className="mt-4 text-xl font-bold">একটি chat নির্বাচন করুন</h2><p className="mt-1 text-sm text-muted-foreground">General group অথবা private conversation খুলুন।</p></div>
            </div>
          )}
        </section>

        <aside className="hidden border-l bg-muted/20 xl:block">
          {selected ? (
            <div className="h-full overflow-y-auto p-5">
              <div className="text-center">
                <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
                  {selected.channelType === "direct" ? <UserRound className="size-7" /> : <Hash className="size-7" />}
                </div>
                <h3 className="mt-3 font-bold">{selected.name}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{selected.description ?? "Family conversation"}</p>
                <div className="mt-3 flex justify-center gap-2"><Badge variant="secondary">{selected.memberCount} সদস্য</Badge><Badge variant="outline">{live ? "Live" : "Syncing"}</Badge></div>
              </div>
              <Separator className="my-5" />
              <div className="flex items-center justify-between"><p className="text-sm font-bold">সদস্য</p><span className="text-xs text-muted-foreground">{selectedMembers.length}</span></div>
              <div className="mt-3 space-y-2">
                {selectedMembers.slice(0, 12).map((member) => (
                  <div key={member.authUserId} className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted">
                    <Avatar className="size-8"><AvatarFallback className="text-[10px] font-bold">{member.initials}</AvatarFallback></Avatar>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{member.authUserId === viewer?.authUserId ? `${member.name} (আপনি)` : member.name}</p><p className="text-[10px] capitalize text-muted-foreground">{member.role.replace("_", " ")}</p></div>
                  </div>
                ))}
              </div>
              {selectedMembers.length > 12 ? <p className="mt-2 text-center text-xs text-muted-foreground">আরও {selectedMembers.length - 12} জন</p> : null}
              <Separator className="my-5" />
              <div className="rounded-2xl border bg-card p-4">
                <p className="text-xs font-bold">Privacy</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Messages, reactions ও files শুধু এই পরিবারের অনুমোদিত সদস্যরা দেখতে পারবেন।</p>
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>নতুন chat তৈরি করুন</DialogTitle>
            <DialogDescription>Group, Admin room অথবা one-to-one direct conversation খুলুন।</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {(["custom", "admin", "direct"] as const).map((type) => (
                <button key={type} type="button" onClick={() => { setCreateType(type); setCreateMemberIds([]); }} className={cn("rounded-xl border p-3 text-xs font-semibold", createType === type && "border-primary bg-primary/10 text-primary")}>
                  {type === "custom" ? "Group" : type === "admin" ? "Admin room" : "Direct"}
                </button>
              ))}
            </div>
            {createType !== "direct" ? (
              <>
                <div className="space-y-2"><Label htmlFor="chat-name">Channel name</Label><Input id="chat-name" value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder="যেমন: Cousins Corner" className="rounded-xl" /></div>
                <div className="space-y-2"><Label htmlFor="chat-description">বিবরণ</Label><Textarea id="chat-description" value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} placeholder="এই group-এর উদ্দেশ্য" className="rounded-xl" /></div>
                {createType === "custom" ? (
                  <div className="space-y-2"><Label>কে দেখতে পারবে?</Label><Select value={createVisibility} onValueChange={(value) => setCreateVisibility(value as "family" | "invite_only")}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="family">পরিবারের সবাই</SelectItem><SelectItem value="invite_only">শুধু নির্বাচিত সদস্য</SelectItem></SelectContent></Select></div>
                ) : null}
              </>
            ) : null}
            {(createType === "direct" || (createType === "custom" && createVisibility === "invite_only")) ? (
              <div className="space-y-2">
                <Label>{createType === "direct" ? "কাকে message করবেন?" : "Group members"}</Label>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-2xl border p-2">
                  {members.filter((member) => member.authUserId !== viewer?.authUserId).map((member) => {
                    const checked = createMemberIds.includes(member.authUserId);
                    return (
                      <button key={member.authUserId} type="button" onClick={() => setCreateMemberIds((current) => createType === "direct" ? [member.authUserId] : checked ? current.filter((id) => id !== member.authUserId) : [...current, member.authUserId])} className={cn("flex w-full items-center gap-3 rounded-xl p-2 text-left", checked ? "bg-primary/10" : "hover:bg-muted") }>
                        <Avatar className="size-8"><AvatarFallback className="text-[10px]">{member.initials}</AvatarFallback></Avatar>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{member.name}</span>
                        <span className={cn("grid size-5 place-items-center rounded-full border text-[10px]", checked && "border-primary bg-primary text-primary-foreground")}>{checked ? "✓" : ""}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setCreateOpen(false)}>বাতিল</Button>
            <Button className="rounded-xl" onClick={() => void createChannel()} disabled={working || (createType === "direct" ? !createMemberIds.length : createName.trim().length < 2)}>
              {working ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} তৈরি করুন
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
