"use client";
/* Chat attachments are access-controlled API resources rather than public optimizer assets. */
/* eslint-disable @next/next/no-img-element */

import { useActionFeedback, useActionResult } from "@/components/action-modal-provider";
import { chatTextRecord, chatTextCopy, readChatTextChange, chatFeedSnapshot, reconcileChatMessages } from "@/lib/chat-text-management";
import { chatAttachmentInput, chatAttachmentCopy, readChatAttachmentChange } from "@/lib/chat-attachment-policy";
import { chatAttachmentDeleteInput, readChatAttachmentDeletion, chatAttachmentDeleteCopy } from "@/lib/chat-attachment-deletion";
import { chatSendInput, chatReactionInput, readChatFlow, chatFlowCopy } from "@/lib/chat-send-reaction";
import { chatCreateInput,chatPreferenceInput,readChatSetup,chatSetupCopy,chatSetupVerification,chatPreferenceAllowsNotification } from "@/lib/chat-setup-workflow";
import { useLocale } from "@/components/locale-provider";

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
  MessageCircle,
  MessageCircleMore,
  Mic,
  Paperclip,
  Plus,
  Pencil,
  Trash2,
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
  ownPreference: {membershipId:string;updatedAt:string}|null;
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
  is_mine?: boolean;
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
  const { locale, pick } = useLocale();
  const messageTime = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-BD", { hour: "numeric", minute: "2-digit" });
  const messageDate = new Intl.DateTimeFormat(locale === "bn" ? "bn-BD" : "en-BD", { day: "numeric", month: "short", year: "numeric" });
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
  const [feedback, setFeedback] = useActionFeedback();
  const [query, setQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | "group" | "direct">("all");
  const [draft, setDraft] = useState("");
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const showResult = useActionResult();
  const [textEdit, setTextEdit] = useState<{ original: ChatMessage; body: string } | null>(null);
  const [verifyChannel, setVerifyChannel] = useState<string | null>(null);
  const [verifyKind,setVerifyKind]=useState<"text"|"upload"|"attachment-delete"|"send"|"reaction">("text");
  const sendRequest=useRef<{fingerprint:string;id:string}|null>(null);
  const createRequest=useRef<{fingerprint:string;id:string}|null>(null);
  const notificationSettings=useRef<{channelId:string|null;level:ChatChannel["notificationLevel"];name:string}>({channelId:null,level:"muted",name:""});
  const [verifyWorkspace,setVerifyWorkspace]=useState<{input:ReturnType<typeof chatCreateInput>|ReturnType<typeof chatPreferenceInput>;familyId:string;actor:string;channelId:string|null}|null>(null);
  const textState = useRef({ busy: false, blocked: false, ready: false });
  const feedEpoch = useRef(0);
  const removedText = useRef(new Set<string>());
  const chatMounted = useRef(true);
  useEffect(() => { const generation=feedEpoch; chatMounted.current = true; return () => { chatMounted.current = false; generation.current++; }; }, []);
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
  const activeChannelIdRef = useRef<string | null>(null);
  const lastReadMessageIdRef = useRef(new Map<string, string>());

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
  useEffect(()=>{notificationSettings.current={channelId:selected?.id??null,level:selected?.notificationLevel??"muted",name:viewer?.name??""};},[selected?.id,selected?.notificationLevel,viewer?.name]);

  const loadMetadata = useCallback(async (preferredChannelId?: string) => {
    setFeedback(null);
    try {
      const response = await fetch("/api/chat", { cache: "no-store" });
      const payload = (await response.json()) as ChatPayload;
      if (payload.code === "FAMILY_SETUP_REQUIRED") {
        setSetupRequired(true);
        setFamily(undefined);
        setViewer(undefined);
        setMembers([]);
        setChannels([]);
        setMessages([]);
        setReactions([]);
        setAttachments([]);
        setSelectedId(null);
        setMigrationRequired(false);
        return false;
      }
      if (!response.ok) throw new Error(payload.error ?? "Family chat পাওয়া যায়নি।");
      const nextChannels = payload.channels ?? [];
      setFamily(payload.family);
      setViewer(payload.viewer);
      setMembers(payload.members ?? []);
      setChannels(nextChannels);
      setMigrationRequired(Boolean(payload.migrationRequired));
      setSetupRequired(false);
      setSelectedId((current) => {
        const candidate = preferredChannelId ?? current;
        if (candidate && nextChannels.some((channel) => channel.id === candidate)) return candidate;
        return nextChannels.find((channel) => channel.channelType === "general")?.id ?? nextChannels[0]?.id ?? null;
      });
      return true;
    } catch (error) {
      setFamily(undefined);
      setViewer(undefined);
      setMembers([]);
      setChannels([]);
      setMessages([]);
      setReactions([]);
      setAttachments([]);
      setSelectedId(null);
      setMigrationRequired(false);
      setFeedback(error instanceof Error ? error.message : pick("ফ্যামিলি চ্যাট পাওয়া যায়নি।", "Family chat could not be loaded."));
      return false;
    } finally {
      setLoading(false);
    }
  }, [pick, setFeedback]);

  const handleLostChatAccess = useCallback((channelId: string) => {
    if (activeChannelIdRef.current !== channelId) return;
    activeChannelIdRef.current = null;
    setSelectedId(null);
    setMessages([]);
    setReactions([]);
    setAttachments([]);
    setMessagesLoading(false);
    setLive(false);
    void loadMetadata().then((loaded) => {
      if (loaded) setFeedback(pick("এই চ্যাটে আপনার প্রবেশাধিকার বদলেছে। উপলব্ধ চ্যানেলগুলো আবার লোড করা হয়েছে।", "Your access to this chat changed. Available channels have been reloaded."));
    });
  }, [loadMetadata, pick, setFeedback]);

  const markRead = useCallback(async (channelId: string, lastMessageId: string) => {
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read", channelId, lastReadMessageId: lastMessageId }),
      });
      // Automatic read receipts are exempt from the confirmation dialog.
      if (!response.ok) throw new Error("Read state was not saved.");
      setChannels((current) => current.map((channel) =>
        channel.id === channelId ? { ...channel, unreadCount: 0 } : channel,
      ));
    } catch {
      // Read state is retried on the next successful channel load.
      if (lastReadMessageIdRef.current.get(channelId) === lastMessageId) {
        lastReadMessageIdRef.current.delete(channelId);
      }
    }
  }, []);

  const applyFeed = useCallback((payload: ChatPayload, channelId: string, notify = false, replace = false) => {
    if (activeChannelIdRef.current !== channelId || textState.current.busy || textState.current.blocked) return;
    const incomingMessages = (payload.messages ?? []).filter(message=>replace||!removedText.current.has(message.id));
    setMessages(current => reconcileChatMessages(current, incomingMessages, removedText.current, replace));
    if (replace) {
      setTextEdit(current => { if (!current) return null; const row=incomingMessages.find(r=>r.id===current.original.id);return row?.is_mine && row.body===current.original.body && row.edited_at===current.original.edited_at ? current : null; });
      setReplyingTo(current => current ? incomingMessages.find(r=>r.id===current.id) ?? null : null);
    }
    const refreshedMessageIds = new Set(incomingMessages.map((message) => message.id));
    setReactions((current) => mergeById(
      replace ? [] : current.filter((reaction) => !removedText.current.has(reaction.message_id) && !refreshedMessageIds.has(reaction.message_id)),
      (payload.reactions ?? []).filter(reaction=>refreshedMessageIds.has(reaction.message_id)),
    ));
    setAttachments((current) => mergeById(
      replace ? [] : current.filter((attachment) => !removedText.current.has(attachment.message_id) && !refreshedMessageIds.has(attachment.message_id)),
      (payload.attachments ?? []).filter(attachment=>refreshedMessageIds.has(attachment.message_id)),
    ));
    const newestIncoming = incomingMessages[incomingMessages.length - 1];
    const notificationMessage=[...incomingMessages].reverse().find(message=>!message.is_mine&&chatPreferenceAllowsNotification(notificationSettings.current.level,message.body,notificationSettings.current.name));
    if (newestIncoming && lastReadMessageIdRef.current.get(channelId) !== newestIncoming.id) {
      lastReadMessageIdRef.current.set(channelId, newestIncoming.id);
      void markRead(channelId, newestIncoming.id);
      if (
        notify
        &&
        !!notificationMessage
        && notificationSettings.current.channelId===channelId
        && document.hidden
        && typeof Notification !== "undefined"
        && Notification.permission === "granted"
      ) {
        new Notification("Family chat", {
          body: `${notificationMessage!.author_name}: ${notificationMessage!.body ?? pick("নতুন সংযুক্তি", "New attachment")}`,
        });
      }
    }
  }, [markRead, pick]);

  const loadMessages = useCallback(async (channelId: string, silent = false, verification = false) => {
    if (textState.current.busy || (textState.current.blocked && !verification)) return false;
    const epoch=++feedEpoch.current;
    if (!silent) setMessagesLoading(true);
    try {
      const response = await fetch(`/api/chat?channelId=${encodeURIComponent(channelId)}`, { cache: "no-store", signal: AbortSignal.timeout(25000) });
      if (!chatMounted.current || epoch!==feedEpoch.current || (!verification && activeChannelIdRef.current!==channelId)) return false;
      if ([401, 403, 404, 409].includes(response.status)) {
        handleLostChatAccess(channelId);
        return false;
      }
      const payload = (await response.json()) as ChatPayload;
      if (!response.ok) throw new Error(payload.error ?? "Messages পাওয়া যায়নি।");
      const snapshot=chatFeedSnapshot(payload,channelId);
      if (!snapshot) throw new Error(pick("সম্পূর্ণ chat snapshot সঠিক নয়।", "The complete chat snapshot is invalid."));
      if (!chatMounted.current || epoch!==feedEpoch.current || (!verification && activeChannelIdRef.current!==channelId)) return false;
      if (verification) {activeChannelIdRef.current=channelId;setSelectedId(channelId);textState.current.blocked=false;}
      textState.current.ready=true;
      applyFeed(snapshot, channelId, false, true);
      return true;
    } catch (error) {
      if (!silent && chatMounted.current && epoch===feedEpoch.current && (verification || activeChannelIdRef.current === channelId)) setFeedback(error instanceof Error ? error.message : pick("বার্তাগুলো পাওয়া যায়নি।", "Messages could not be loaded."));
      return false;
    } finally {
      if (!silent && chatMounted.current && epoch===feedEpoch.current && (verification || activeChannelIdRef.current === channelId)) setMessagesLoading(false);
    }
  }, [applyFeed, handleLostChatAccess, pick, setFeedback]);

  useEffect(() => {
    queueMicrotask(() => {
      if (typeof Notification === "undefined") setNotificationPermission("unsupported");
      else setNotificationPermission(Notification.permission);
      void loadMetadata();
    });
  }, [loadMetadata]);

  useEffect(() => {
    activeChannelIdRef.current = selectedId;
    feedEpoch.current++; textState.current.ready=false; removedText.current.clear();
    queueMicrotask(()=>setMessagesLoading(false));
    if (!selectedId || migrationRequired) {
      queueMicrotask(() => {
        setMessages([]);
        setReactions([]);
        setAttachments([]);
      });
      return;
    }
    queueMicrotask(() => {
      setMessages([]);
      setReactions([]);
      setAttachments([]);
      setReplyingTo(null);
      setTextEdit(null);
      setPendingFile(null);
      void loadMessages(selectedId);
    });
    const timer = window.setInterval(() => void loadMessages(selectedId, true), 15000);
    return () => window.clearInterval(timer);
  }, [loadMessages, migrationRequired, selectedId]);

  useEffect(() => {
    if (!selectedId || migrationRequired) return;
    // The snapshot request and stream overlap at this boundary, then message IDs deduplicate them.
    const cursor = new Date().toISOString();
    const source = new EventSource(
      `/api/chat/stream?channelId=${encodeURIComponent(selectedId)}&after=${encodeURIComponent(cursor)}`,
    );
    source.addEventListener("ready", () => setLive(true));
    source.addEventListener("heartbeat", () => setLive(true));
    source.addEventListener("messages", (event) => {
      try {
        const raw=JSON.parse((event as MessageEvent).data) as ChatPayload;
        const snapshot=chatFeedSnapshot({...raw,channel:{id:selectedId}},selectedId,200);
        if (!snapshot) {setLive(false);return;}
        setLive(true);applyFeed(snapshot,selectedId,true);
      } catch {setLive(false);}
    });
    source.addEventListener("recover", () => setLive(false));
    source.addEventListener("access_revoked", () => {
      source.close();
      handleLostChatAccess(selectedId);
    });
    source.onerror = () => setLive(false);
    return () => source.close();
  }, [applyFeed, handleLostChatAccess, migrationRequired, selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: messagesLoading ? "auto" : "smooth" });
  }, [messages.length, messagesLoading]);

  async function createChannel() {
    if(working||loading||textState.current.busy||textState.current.blocked||!family||!viewer||migrationRequired)return;
    let input:ReturnType<typeof chatCreateInput>;
    try{input=chatCreateInput({action:"create_channel",channelType:createType,name:createName,description:createDescription,visibility:createVisibility,memberIds:createMemberIds});
      const fingerprint=JSON.stringify([family.id,viewer.authUserId,input]);
      if(createRequest.current?.fingerprint!==fingerprint)createRequest.current={fingerprint,id:crypto.randomUUID()};
      input={...input,clientChannelId:createRequest.current.id};
    }catch{showResult({kind:"error",title:pick("Channel input যাচাই করুন","Check channel input"),message:chatSetupCopy("CHAT_CHANNEL_INPUT",locale)});return;}
    const actor=viewer.authUserId,familyId=family.id,epoch=++feedEpoch.current;
    textState.current.busy=true;setWorking(true);setMessagesLoading(false);setFeedback(null);
    try {
      const outcome=await readChatSetup(async()=>{
        const response=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json","X-Fms-Chat-Actor":actor},body:JSON.stringify(input)});
        if(response.status===499)return response;
        return response;
      },input,actor);
      if(!chatMounted.current||outcome.kind==="cancelled")return;
      if(outcome.kind==="unknown"||epoch!==feedEpoch.current){textState.current.blocked=true;textState.current.ready=false;setVerifyWorkspace({input,familyId,actor,channelId:outcome.kind==="unknown"?outcome.channelId??input.clientChannelId??null:input.clientChannelId??null});return;}
      if(outcome.kind==="rejected"){setFeedback(chatSetupCopy(outcome.code??"CHAT_SETUP_REJECTED",locale));return;}
      setCreateOpen(false);setCreateName("");setCreateDescription("");setCreateMemberIds([]);createRequest.current=null;
      if(await loadMetadata(outcome.channelId)){textState.current.busy=false;await loadMessages(outcome.channelId,false,true);}
    }finally{textState.current.busy=false;if(chatMounted.current)setWorking(false);}
  }

  async function sendMessage() {
    if (textState.current.busy || textState.current.blocked) return;
    if (!selected || (!draft.trim() && !pendingFile)) return;
    const channelId=selected.id;
    if(!textState.current.ready || messagesLoading || working)return;
    const epoch=++feedEpoch.current;
    textState.current.busy=true;setMessagesLoading(false);
    setWorking(true);
    setFeedback(null);
    try {
      if (pendingFile) {
        const body = new FormData();
        body.set("channelId", selected.id);
        body.set("file", pendingFile);
        body.set("caption", draft);
        if (replyingTo) body.set("replyToId", replyingTo.id);
        let input:ReturnType<typeof chatAttachmentInput>;
        try{input=chatAttachmentInput(body);}catch(error){showResult({kind:"error",title:pick("File যাচাই করুন","Check attachment"),message:chatAttachmentCopy(error instanceof Error&&"code" in error?error.code:"CHAT_FILE_INPUT",locale)});return;}
        const outcome=await readChatAttachmentChange(async()=>{
          const response=await fetch("/api/chat/upload",{method:"POST",body});
          if(response.status===499)return response;
          return response;
        },input);
        if(!chatMounted.current)return;
        if(outcome.kind==="cancelled")return;
        if(outcome.kind==="unknown"||epoch!==feedEpoch.current||activeChannelIdRef.current!==channelId){textState.current.blocked=true;textState.current.ready=false;setVerifyKind("upload");setVerifyChannel(channelId);return;}
        if(outcome.kind==="rejected"){setFeedback(chatAttachmentCopy(outcome.code,locale));return;}
        setMessages(current=>mergeById(current,[outcome.message]));
        setAttachments(current=>mergeById(current,[outcome.attachment]));
      } else {
        let input:ReturnType<typeof chatSendInput>;
        try{
          input=chatSendInput({action:"send_message",channelId,body:draft,replyToId:replyingTo?.id});
          // Keep the same ID when a reload changes only the reply reference.
          const fingerprint=JSON.stringify([channelId,input.body]);
          if(sendRequest.current?.fingerprint!==fingerprint)sendRequest.current={fingerprint,id:crypto.randomUUID()};
          input={...input,clientMessageId:sendRequest.current.id};
        }catch{showResult({kind:"error",title:pick("Message যাচাই করুন","Check message"),message:chatFlowCopy("CHAT_SEND_INPUT",locale)});return;}
        const outcome=await readChatFlow(async()=>{
          const response=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
          if(response.status===499)return response;
          return response;
        },input);
        if(!chatMounted.current||outcome.kind==="cancelled")return;
        if(outcome.kind==="unknown"||epoch!==feedEpoch.current||activeChannelIdRef.current!==channelId){textState.current.blocked=true;textState.current.ready=false;setVerifyKind("send");setVerifyChannel(channelId);return;}
        if(outcome.kind==="rejected"){setFeedback(chatFlowCopy(outcome.code??"CHAT_FLOW_REJECTED",locale));return;}
        if(!outcome.message)return;
        setMessages(current=>mergeById(current,[outcome.message!]));
        sendRequest.current=null;
      }
      sendRequest.current=null;
      setDraft("");
      setPendingFile(null);
      setReplyingTo(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadMetadata(selected.id);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : pick("বার্তা পাঠানো যায়নি।", "The message could not be sent."));
    } finally {
      textState.current.busy=false;
      if(chatMounted.current)setWorking(false);
    }
  }

  function openTextEditor(message: ChatMessage) {
    if (working || messagesLoading || textState.current.busy || textState.current.blocked || !textState.current.ready || !selected || message.channel_id!==selected.id || !message.is_mine || message.message_type!=="text") return;
    setTextEdit({original:message,body:message.body??""});
  }
  async function changeText(method: "PATCH"|"DELETE", message: ChatMessage, value?: string) {
    if (working || messagesLoading || textState.current.busy || textState.current.blocked || !textState.current.ready || !selected || message.channel_id!==selected.id || !message.is_mine || message.message_type!=="text") return;
    let body: ReturnType<typeof chatTextRecord>;
    try { body=chatTextRecord(method,{expectedBody:message.body,expectedEditedAt:message.edited_at,...(method==="PATCH"?{body:value}:{})}); }
    catch(error) { showResult({kind:"error",title:pick("Message-এর তথ্য যাচাই করুন","Check message input"),message:chatTextCopy(error instanceof Error && "code" in error ? error.code : "CHAT_TEXT_INVALID_INPUT",locale)!});return; }
    const channelId=selected.id, epoch=++feedEpoch.current;
    textState.current.busy=true;setWorking(true);setMessagesLoading(false);
    try {
      const outcome=await readChatTextChange(async()=>{
        const response=await fetch(`/api/chat-messages/${message.id}`,{method:method,headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
        if(response.status===499)return response;
        return response;
      },method,message.id,channelId,body);
      if(!chatMounted.current || outcome.kind==="cancelled")return;
      if(outcome.kind==="unknown" || epoch!==feedEpoch.current || activeChannelIdRef.current!==channelId) {
        setVerifyKind("text");
        textState.current.blocked=true;setVerifyChannel(channelId);
        showResult({kind:"info",title:pick("Message-এর অবস্থা যাচাই করুন","Review message state"),message:chatTextCopy("CHAT_TEXT_UNKNOWN",locale)!});return;
      }
      if(outcome.kind==="rejected") {showResult({kind:"error",title:pick("Message বদলানো হয়নি","Message was not changed"),message:chatTextCopy(outcome.payload.code,locale)??chatTextCopy("CHAT_TEXT_REJECTED",locale)!});return;}
      const saved=outcome.message;
      if(method==="DELETE") {
        removedText.current.add(message.id);
        setMessages(current=>current.filter(r=>r.id!==message.id).map(r=>r.reply_to_id===message.id?{...r,reply_to_id:null}:r));
        setReactions(current=>current.filter(r=>r.message_id!==message.id));
        setReplyingTo(current=>current?.id===message.id?null:current);
      }else if(saved){setMessages(current=>current.map(r=>r.id===message.id?saved:r));setReplyingTo(current=>current?.id===message.id?saved:current);}
      setTextEdit(current=>current?.original.id===message.id?null:current);
      if(!outcome.pending)setFeedback(method==="PATCH"?pick("Message আপডেট হয়েছে।","Message updated."):pick("Message মুছে ফেলা হয়েছে।","Message deleted."));
    }finally{textState.current.busy=false;if(chatMounted.current)setWorking(false);}
  }
  async function verifyTextOutcome() {
    if(!verifyChannel || textState.current.busy)return;
    if(await loadMessages(verifyChannel,false,true)) {setVerifyChannel(null);showResult({kind:"info",title:pick("Channel পুনরায় লোড হয়েছে","Channel reloaded"),message:pick("Message ও file-এর অবস্থা মিলিয়ে দেখুন। Reload অসম্পূর্ণ record, file cleanup বা audit ঠিক করে না এবং কোনো পরিবর্তন আবার পাঠায় না।","Review the message and file state. Reload does not repair incomplete records, file cleanup or audits, or resubmit changes.")});}
  }
  async function deleteAttachment(message:ChatMessage,file:ChatAttachment) {
    if(working||messagesLoading||textState.current.busy||textState.current.blocked||!textState.current.ready||!selected||message.channel_id!==selected.id||!message.is_mine||message.message_type!=="attachment"||file.is_mine!==true||file.message_id!==message.id||attachments.filter(a=>a.message_id===message.id).length!==1)return;
    let body:ReturnType<typeof chatAttachmentDeleteInput>;
    try{body=chatAttachmentDeleteInput({expectedMessageId:message.id,expectedBody:message.body,expectedEditedAt:message.edited_at,expectedCreatedAt:message.created_at,expectedFileCreatedAt:file.created_at});}
    catch{showResult({kind:"error",title:pick("File message যাচাই করুন","Check file message"),message:chatAttachmentDeleteCopy("CHAT_FILE_DELETE_INPUT",locale)});return;}
    const channelId=selected.id,epoch=++feedEpoch.current;
    textState.current.busy=true;setWorking(true);setMessagesLoading(false);
    try {
      const outcome=await readChatAttachmentDeletion(async()=>{
        const response=await fetch(`/api/chat-file/${file.id}`,{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
        if(response.status===499)return response;
        return response;
      },file.id,channelId,body);
      if(!chatMounted.current||outcome.kind==="cancelled")return;
      if(outcome.kind==="unknown"||epoch!==feedEpoch.current||activeChannelIdRef.current!==channelId){textState.current.blocked=true;textState.current.ready=false;setVerifyKind("attachment-delete");setVerifyChannel(channelId);return;}
      if(outcome.kind==="rejected"){setFeedback(chatAttachmentDeleteCopy(outcome.code,locale));return;}
      removedText.current.add(message.id);
      setMessages(current=>current.filter(r=>r.id!==message.id).map(r=>r.reply_to_id===message.id?{...r,reply_to_id:null}:r));
      setAttachments(current=>current.filter(r=>r.message_id!==message.id));
      setReactions(current=>current.filter(r=>r.message_id!==message.id));
      setReplyingTo(current=>current?.id===message.id?null:current);
      setTextEdit(current=>current?.original.id===message.id?null:current);
    }finally{textState.current.busy=false;if(chatMounted.current)setWorking(false);}
  }

  async function toggleReaction(messageId: string, emoji: string) {
    if(working||messagesLoading||textState.current.busy||textState.current.blocked||!textState.current.ready||!selected||!messages.some(m=>m.id===messageId&&m.channel_id===selected.id))return;
    const existing=reactions.find(r=>r.message_id===messageId&&r.emoji===emoji&&r.is_mine);
    let input:ReturnType<typeof chatReactionInput>;
    try{input=chatReactionInput({action:"toggle_reaction",channelId:selected.id,messageId,emoji,active:!existing,expectedReactionId:existing?.id??null});}
    catch{showResult({kind:"error",title:pick("Reaction যাচাই করুন","Check reaction"),message:chatFlowCopy("CHAT_REACTION_INPUT",locale)});return;}
    const channelId=selected.id,epoch=++feedEpoch.current;
    textState.current.busy=true;setWorking(true);setMessagesLoading(false);
    try {
      const outcome=await readChatFlow(async()=>{
        const response=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)});
        if(response.status===499)return response;
        return response;
      },input);
      if(!chatMounted.current||outcome.kind==="cancelled")return;
      if(outcome.kind==="unknown"||epoch!==feedEpoch.current||activeChannelIdRef.current!==channelId){textState.current.blocked=true;textState.current.ready=false;setVerifyKind("reaction");setVerifyChannel(channelId);return;}
      if(outcome.kind==="rejected"){setFeedback(chatFlowCopy(outcome.code??"CHAT_FLOW_REJECTED",locale));return;}
      setReactions(current=>[...current.filter(r=>!(r.message_id===messageId&&r.emoji===emoji&&r.is_mine)),...(outcome.reaction?[outcome.reaction]:[])]);
    }finally{textState.current.busy=false;if(chatMounted.current)setWorking(false);}
  }

  async function updateNotification(level: ChatChannel["notificationLevel"]) {
    if(working||messagesLoading||textState.current.busy||textState.current.blocked||!textState.current.ready||!selected||!family||!viewer)return;
    let input:ReturnType<typeof chatPreferenceInput>;
    try{input=chatPreferenceInput({action:"update_notification",channelId:selected.id,level,expectedLevel:selected.notificationLevel,expectedMembershipId:selected.ownPreference?.membershipId??null,expectedUpdatedAt:selected.ownPreference?.updatedAt??null});}
    catch{showResult({kind:"error",title:pick("Setting যাচাই করুন","Check setting"),message:chatSetupCopy("CHAT_PREFERENCE_INPUT",locale)});return;}
    const actor=viewer.authUserId,familyId=family.id,channelId=selected.id,epoch=++feedEpoch.current;
    textState.current.busy=true;setWorking(true);setMessagesLoading(false);
    try {
      const outcome=await readChatSetup(async()=>{
        const response=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json","X-Fms-Chat-Actor":actor},body:JSON.stringify(input)});
        if(response.status===499)return response;
        return response;
      },input,actor);
      if(!chatMounted.current||outcome.kind==="cancelled")return;
      if(outcome.kind==="unknown"||epoch!==feedEpoch.current||activeChannelIdRef.current!==channelId){textState.current.blocked=true;textState.current.ready=false;setVerifyWorkspace({input,familyId,actor,channelId});return;}
      if(outcome.kind==="rejected"){setFeedback(chatSetupCopy(outcome.code??"CHAT_SETUP_REJECTED",locale));return;}
      const p=outcome.preference;if(!p)return;
      notificationSettings.current={channelId,level:p.level,name:viewer.name};
      setChannels(current=>current.map(c=>c.id===channelId?{...c,notificationLevel:p.level,ownPreference:p.membershipId&&p.updatedAt?{membershipId:p.membershipId,updatedAt:p.updatedAt}:null}:c));
    }finally{textState.current.busy=false;if(chatMounted.current)setWorking(false);}
  }

  async function verifySetupOutcome() {
    if(!verifyWorkspace||working||textState.current.busy)return;
    const captured=verifyWorkspace,epoch=++feedEpoch.current;
    textState.current.busy=true;setWorking(true);
    try {
      const response=await fetch("/api/chat",{cache:"no-store",signal:AbortSignal.timeout(25000)});
      const raw:unknown=await response.json();
      if(!chatMounted.current||epoch!==feedEpoch.current)return;
      if(!response.ok){showResult({kind:"error",title:pick("বর্তমান অবস্থা পাওয়া যায়নি","Current state could not be loaded"),message:pick("Sign-in, প্রবেশাধিকার বা সংযোগ যাচাই করুন। আগের request আবার পাঠানো হয়নি।","Check sign-in, access or connection. The previous request was not resubmitted.")});return;}
      const target=chatSetupVerification(raw,captured.familyId,captured.actor,captured.input,captured.channelId);
      if(!target){showResult({kind:"info",title:pick("Setup এখনও যাচাই হয়নি","Setup still needs review"),message:chatSetupCopy("CHAT_SETUP_UNKNOWN",locale)});return;}
      if(!await loadMetadata(target)||!chatMounted.current)return;
      textState.current.busy=false;
      if(!await loadMessages(target,false,true))return;
      if(captured.input.action==="create_channel"){setCreateOpen(false);setCreateName("");setCreateDescription("");setCreateMemberIds([]);createRequest.current=null;}
      setVerifyWorkspace(null);showResult({kind:"info",title:pick("বর্তমান অবস্থা লোড হয়েছে","Current state loaded"),message:pick("Channel/preference মিলিয়ে দেখুন। Reload membership setup বা audit repair করে না; কোনো request আবার পাঠায় না।","Review channel/preference state. Reload does not repair membership setup or audits, or replay a request.")});
    }catch{if(chatMounted.current)showResult({kind:"info",title:pick("Setup যাচাই করা যায়নি","Setup could not be verified"),message:chatSetupCopy("CHAT_SETUP_UNKNOWN",locale)});}
    finally{textState.current.busy=false;if(chatMounted.current)setWorking(false);}
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
      setFeedback(pick("মাইক্রোফোনের অনুমতি পাওয়া যায়নি। চাইলে অডিও ফাইল সংযুক্ত করতে পারেন।", "Microphone permission was not granted. You can attach an audio file instead."));
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
    if (textState.current.busy || textState.current.blocked) return;
    if (!selected) return;
    setExporting(true);
    try {
      const response = await fetch(`/api/chat?channelId=${encodeURIComponent(selected.id)}&export=1`, { cache: "no-store" });
      const history = await response.json() as ChatPayload;
      if (!response.ok) throw new Error(history.error ?? pick("চ্যাট ইতিহাস লোড হয়নি।", "Chat history could not be loaded."));
      const exportMessages = history.messages ?? [];
      const exportReactions = history.reactions ?? [];
      const exportAttachments = history.attachments ?? [];
      const XLSX = await import("xlsx");
      const messageById = new Map(exportMessages.map((message) => [message.id, message]));
      const attachmentsByMessage = new Map<string, string[]>();
      for (const attachment of exportAttachments) {
        attachmentsByMessage.set(attachment.message_id, [...(attachmentsByMessage.get(attachment.message_id) ?? []), attachment.file_name]);
      }
      const reactionsByMessage = new Map<string, Record<string, number>>();
      for (const reaction of exportReactions) {
        const summary = reactionsByMessage.get(reaction.message_id) ?? {};
        summary[reaction.emoji] = (summary[reaction.emoji] ?? 0) + 1;
        reactionsByMessage.set(reaction.message_id, summary);
      }
      const messageRows = exportMessages.map((message, index) => {
        const reply = message.reply_to_id ? messageById.get(message.reply_to_id) : null;
        const messageAttachments = attachmentsByMessage.get(message.id) ?? [];
        const reactionSummary = reactionsByMessage.get(message.id) ?? {};
        return {
          [pick("ক্রমিক", "SL")]: index + 1,
          [pick("সময়", "Time")]: new Date(message.created_at).toLocaleString(locale === "bn" ? "bn-BD" : "en-BD"),
          [pick("প্রেরক", "Sender")]: message.author_name,
          [pick("ধরন", "Type")]: message.message_type,
          [pick("বার্তা", "Message")]: message.body ?? "",
          [pick("যার উত্তর", "Reply to")]: reply ? `${reply.author_name}: ${reply.body ?? pick("সংযুক্তি", "Attachment")}` : "",
          [pick("সংযুক্তি", "Attachment")]: messageAttachments.join(", "),
          [pick("প্রতিক্রিয়া", "Reactions")]: Object.entries(reactionSummary).map(([emoji, count]) => `${emoji} ${count}`).join(" · "),
        };
      });
      const memberRows = selectedMembers.map((member, index) => ({
        [pick("ক্রমিক", "SL")]: index + 1,
        [pick("সদস্য", "Member")]: member.name,
        [pick("ভূমিকা", "Role")]: member.role,
      }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(messageRows), pick("বার্তা", "Messages"));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(memberRows), pick("সদস্য", "Members"));
      const fileName = selected.name.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "family-chat";
      XLSX.writeFile(workbook, `${fileName}-chat.xlsx`);
      setFeedback(pick("পুরো চ্যাট XLSX তৈরি হয়েছে।", "The full chat XLSX was created."));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : pick("চ্যাট XLSX তৈরি হয়নি।", "The chat XLSX could not be created."));
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
    // Text-write verification is rendered before normal chat controls below.
    return (
      <main className="grid min-h-[calc(100vh-4rem)] place-items-center p-6">
        <div className="text-center">
          <LoaderCircle className="mx-auto size-7 animate-spin text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">{pick("ফ্যামিলি চ্যাট প্রস্তুত হচ্ছে…", "Family chat is getting ready…")}</p>
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
            <h1 className="mt-4 text-2xl font-bold">{pick("পরিবারে প্রবেশাধিকার সক্রিয় নয়", "Family access is not active")}</h1>
            <p className="mt-2 text-muted-foreground">{pick("যোগদানের কোড দিয়ে আবেদন করুন। অ্যাডমিনের অনুমোদনের পর ব্যক্তিগত চ্যাট ব্যবহার করা যাবে।", "Apply with a join code. Private chat will be available after admin approval.")}</p>
            <Button asChild className="mt-5 rounded-xl"><a href="/setup">{pick("পরিবারে যোগদান", "Family onboarding")}</a></Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  if(verifyWorkspace)return <main className="mx-auto max-w-3xl p-6"><Card><CardContent className="space-y-4 p-6"><h1 className="text-xl font-bold">{pick("Chat setup যাচাই প্রয়োজন","Chat setup needs verification")}</h1><p>{chatSetupCopy("CHAT_SETUP_UNKNOWN",locale)}</p><Button disabled={working} onClick={()=>void verifySetupOutcome()}>{pick("বর্তমান অবস্থা লোড করুন","Load current state")}</Button><Button variant="outline" asChild><a href="/contact">{pick("Support-এর সহায়তা নিন","Contact support")}</a></Button></CardContent></Card></main>;
  if (verifyChannel) return <main className="mx-auto max-w-3xl p-6"><Card><CardContent className="space-y-4 p-6"><h1 className="text-xl font-bold">{pick("Message-এর ফল যাচাই প্রয়োজন","Message outcome needs verification")}</h1><p>{verifyKind==="send"||verifyKind==="reaction"?chatFlowCopy("CHAT_FLOW_UNKNOWN",locale):verifyKind==="attachment-delete"?chatAttachmentDeleteCopy("CHAT_FILE_DELETE_UNKNOWN",locale):verifyKind==="upload"?chatAttachmentCopy("CHAT_FILE_UNKNOWN",locale):chatTextCopy("CHAT_TEXT_UNKNOWN",locale)}</p><Button disabled={messagesLoading || working} onClick={()=>void verifyTextOutcome()}>{pick("তালিকা লোড করে যাচাই করুন","Reload to verify")}</Button></CardContent></Card></main>;

  if (!family) return <main className="mx-auto max-w-3xl p-6 md:p-10"><Card className="rounded-3xl border-dashed"><CardContent className="p-8 text-center"><MessageCircle className="mx-auto size-10 text-muted-foreground" /><h1 className="mt-4 text-2xl font-bold">{pick("চ্যাটের তথ্য লোড হয়নি", "Chat data did not load")}</h1><p className="mt-2 text-muted-foreground">{pick("পুরোনো চ্যাট দেখানো হচ্ছে না। আবার চেষ্টা করুন।", "Previous chat data has been cleared. Please try again.")}</p><Button className="mt-5" onClick={() => void loadMetadata()}>{pick("আবার চেষ্টা করুন", "Retry")}</Button></CardContent></Card></main>;

  return (
    <main className="mx-auto w-full max-w-[1600px] p-3 sm:p-4 md:p-6">
      <fieldset disabled={working} className="contents">
      <section className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <span className={cn("size-2 rounded-full", live ? "bg-emerald-500" : "bg-amber-500")} />
            {live ? pick("লাইভ সংযোগ চালু", "Live connection active") : pick("লাইভ সংযোগ পুনরায় হচ্ছে", "Reconnecting live feed")}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight md:text-3xl">{pick("ফ্যামিলি চ্যাট", "Family Chat")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {locale === "en" ? family?.name_en || family?.name_bn || "Family" : family?.name_bn ?? "পরিবার"} · {pick("নিরাপদ গ্রুপ ও ব্যক্তিগত কথোপকথন", "Secure group and private conversations")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{pick("সর্বশেষ ১৫০টি message-এর window দেখানো হচ্ছে; পুরো history export-এ পাওয়া যাবে।","The latest 150-message window is shown; export includes the complete history.")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selected ? <Button variant="outline" disabled={messagesLoading || working} onClick={()=>void loadMessages(selected.id)}>{pick("Channel আবার লোড করুন","Reload channel")}</Button> : null}
          {notificationPermission !== "granted" && notificationPermission !== "unsupported" ? (
            <Button variant="outline" className="rounded-xl" onClick={() => void requestNotifications()}>
              <Bell className="size-4" /> {pick("নোটিফিকেশন চালু করুন", "Enable notifications")}
            </Button>
          ) : null}
          <Button variant="outline" className="rounded-xl" onClick={() => void exportXlsx()} disabled={!selected || exporting}>
            {exporting ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />} {pick("XLSX রপ্তানি", "Export XLSX")}
          </Button>
          <Button className="rounded-xl" onClick={() => setCreateOpen(true)} disabled={migrationRequired}>
            <Plus className="size-4" /> {pick("নতুন চ্যাট", "New chat")}
          </Button>
        </div>
      </section>

      {migrationRequired ? (
        <div className="mb-4 rounded-2xl border border-amber-300/70 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100">
          {pick("চ্যাট ডাটাবেস এখনো তৈরি হয়নি। Supabase SQL Editor-এ ", "The chat database has not been created. Run ")}<b>supabase/migrations/20260927_family_chat.sql</b>{pick(" চালালে সাধারণ চ্যাট, সরাসরি বার্তা ও লাইভ ইতিহাস সক্রিয় হবে।", " in the Supabase SQL Editor to enable general chat, direct messages, and live history.")}
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
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={pick("চ্যাট খুঁজুন", "Search chats")} className="rounded-xl pl-9" />
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
                  {filter === "all" ? pick("সব", "All") : filter === "group" ? pick("গ্রুপ", "Groups") : pick("সরাসরি", "Direct")}
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
                      {channel.description ?? pick(`${channel.memberCount} জন সদস্য`, `${channel.memberCount} members`)}
                    </p>
                  </div>
                </button>
              );
            })}
            {!visibleChannels.length ? (
              <div className="min-w-[250px] p-5 text-center text-sm text-muted-foreground lg:min-w-0">
                {migrationRequired ? pick("মাইগ্রেশন চালানো বাকি।", "Migration is still required.") : pick("কোনো চ্যাট পাওয়া যায়নি।", "No chats found.")}
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
                    {pick(`${selected.memberCount} জন`, `${selected.memberCount} members`)} · {selected.visibility === "family" ? pick("পরিবারের সবাই", "Everyone in the family") : selected.visibility === "admins" ? pick("শুধু অ্যাডমিন", "Admins only") : pick("ব্যক্তিগত গ্রুপ", "Private group")}
                  </p>
                </div>
                <Select value={selected.notificationLevel} onValueChange={(value) => void updateNotification(value as ChatChannel["notificationLevel"])}>
                  <SelectTrigger className="w-10 rounded-xl px-0 sm:w-[132px] sm:px-3" aria-label={pick("চ্যানেল নোটিফিকেশন", "Channel notifications")}>
                    <span className="sm:hidden">{selected.notificationLevel === "muted" ? <BellOff className="mx-auto size-4" /> : <Bell className="mx-auto size-4" />}</span>
                    <span className="hidden sm:inline"><SelectValue /></span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{pick("সব নোটিফিকেশন", "All notifications")}</SelectItem>
                    <SelectItem value="mentions">{pick("শুধু @[নাম] উল্লেখ", "Only @[name] mentions")}</SelectItem>
                    <SelectItem value="muted">{pick("নীরব", "Muted")}</SelectItem>
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
                      <h3 className="mt-4 font-bold">{pick("এই চ্যাট এখনো শান্ত", "This chat is quiet")}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">{pick("প্রথম বার্তাটি পাঠিয়ে আলোচনা শুরু করুন।", "Send the first message to start the conversation.")}</p>
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
                                <span className="text-[11px] font-semibold text-muted-foreground">{message.is_mine ? pick("আপনি", "You") : message.author_name}</span>
                                <span className="text-[10px] text-muted-foreground/70">{messageTime.format(new Date(message.created_at))}</span>
                              </div>
                              <div className={cn(
                                "relative rounded-2xl border px-3.5 py-2.5 text-sm leading-6 shadow-sm",
                                message.is_mine ? "rounded-br-md border-primary/10 bg-primary text-primary-foreground" : "rounded-bl-md bg-card",
                              )}>
                                {reply ? (
                                  <div className={cn("mb-2 rounded-lg border-l-2 px-2 py-1 text-xs", message.is_mine ? "border-primary-foreground/50 bg-primary-foreground/10" : "border-primary bg-muted") }>
                                    <p className="font-semibold">{reply.author_name}</p>
                                    <p className="line-clamp-1 opacity-80">{reply.body ?? pick("সংযুক্তি", "Attachment")}</p>
                                  </div>
                                ) : null}
                                {textEdit?.original.id===message.id ? <div className="space-y-2">
                                  <Label htmlFor={`chat-edit-${message.id}`}>{pick("নিজের message সম্পাদনা","Edit your message")}</Label>
                                  <Textarea id={`chat-edit-${message.id}`} maxLength={5000} rows={3} className="bg-background text-foreground" value={textEdit.body} onChange={event=>setTextEdit(current=>current?{...current,body:event.target.value}:null)} />
                                  <div className="flex gap-2"><Button size="sm" variant="secondary" disabled={!textEdit.body.trim() || textEdit.body.trim()===textEdit.original.body} onClick={()=>void changeText("PATCH",textEdit.original,textEdit.body)}>{pick("সংরক্ষণ","Save edit")}</Button><Button size="sm" variant="secondary" onClick={()=>setTextEdit(null)}>{pick("বাতিল","Cancel edit")}</Button><Button size="icon-sm" variant="secondary" aria-label={pick("Editor বন্ধ করুন","Close editor")} onClick={()=>setTextEdit(null)}><X /></Button></div>
                                </div> : message.body ? <p className="whitespace-pre-wrap break-words">{message.body}</p> : null}
                                {message.edited_at ? <p className="mt-1 text-[10px] opacity-75">{pick("সম্পাদিত","Edited")}</p> : null}
                                {messageAttachments.map((attachment) => {
                                  const AttachmentIcon = attachmentIcon(attachment.mime_type);
                                  const source = `/api/chat-file/${attachment.id}`;
                                  return (
                                    <div key={attachment.id} className={cn("mt-2 overflow-hidden rounded-xl border", message.is_mine ? "border-primary-foreground/25 bg-primary-foreground/10" : "bg-muted/55")}>
                                      {attachment.mime_type.startsWith("image/") ? (
                                        <a href={source} target="_blank" rel="noreferrer"><img src={source} alt={attachment.file_name} className="max-h-72 w-full object-cover" /></a>
                                      ) : attachment.mime_type.startsWith("audio/") ? (
                                         <div className="p-3"><audio controls preload="metadata" className="h-9 max-w-full" src={source}>{pick("অডিও চালানো যাচ্ছে না।", "Audio playback unavailable.")}</audio></div>
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
                                {message.is_mine && message.message_type==="text" && !messageAttachments.length ? <><Button size="icon-xs" variant="ghost" disabled={messagesLoading} aria-label={pick("নিজের message edit করুন","Edit your message")} onClick={()=>openTextEditor(message)}><Pencil /></Button><Button size="icon-xs" variant="ghost" disabled={messagesLoading} aria-label={pick("নিজের message মুছুন","Delete your message")} onClick={()=>void changeText("DELETE",message)}><Trash2 /></Button></> : null}
                                {message.is_mine && message.message_type==="attachment" && messageAttachments.length===1 && messageAttachments[0].is_mine===true ? <Button size="icon-xs" variant="ghost" disabled={messagesLoading} aria-label={pick("নিজের file message মুছুন","Delete your file message")} onClick={()=>void deleteAttachment(message,messageAttachments[0])}><Trash2 /></Button> : null}
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
                       <div className="min-w-0 flex-1"><b>{replyingTo.author_name}</b><p className="truncate text-muted-foreground">{replyingTo.body ?? pick("সংযুক্তি", "Attachment")}</p></div>
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
                     <Button type="button" size="icon" variant="ghost" className="shrink-0 rounded-xl" onClick={() => fileInputRef.current?.click()} aria-label={pick("ফাইল সংযুক্ত করুন", "Attach file")}><Paperclip /></Button>
                    <Textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void sendMessage();
                        }
                      }}
                       placeholder={dragActive ? pick("ফাইল এখানে ছাড়ুন", "Drop the file here") : pick("বার্তা লিখুন…  Shift+Enter নতুন লাইন", "Write a message… Shift+Enter for a new line")}
                      className="max-h-32 min-h-10 resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0"
                    />
                     <Button type="button" size="icon" variant={recording ? "destructive" : "ghost"} className="shrink-0 rounded-xl" onClick={() => void startRecording()} aria-label={recording ? pick("রেকর্ডিং বন্ধ করুন", "Stop recording") : pick("ভয়েস নোট রেকর্ড করুন", "Record voice note")}>
                      {recording ? <Square className="size-4 fill-current" /> : <Mic />}
                    </Button>
                     <Button type="button" size="icon" className="shrink-0 rounded-xl" onClick={() => void sendMessage()} disabled={working || (!draft.trim() && !pendingFile)} aria-label={pick("বার্তা পাঠান", "Send message")}>
                      {working ? <LoaderCircle className="animate-spin" /> : <SendHorizontal />}
                    </Button>
                  </div>
                   <p className="mt-1.5 px-2 text-[10px] text-muted-foreground">{pick("ব্যক্তিগত ফাইল পরিবারের অনুমতি ছাড়া খোলা যাবে না। ভয়েস নোট পাঠাতে মাইক্রোফোনের অনুমতি লাগবে।", "Private files require family permission. Microphone permission is required to send a voice note.")}</p>
                </div>
              </footer>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center">
               <div><MessageCircleMore className="mx-auto size-11 text-primary" /><h2 className="mt-4 text-xl font-bold">{pick("একটি চ্যাট নির্বাচন করুন", "Select a chat")}</h2><p className="mt-1 text-sm text-muted-foreground">{pick("সাধারণ গ্রুপ অথবা ব্যক্তিগত কথোপকথন খুলুন।", "Open a general group or a private conversation.")}</p></div>
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
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{selected.description ?? pick("পারিবারিক কথোপকথন", "Family conversation")}</p>
                <div className="mt-3 flex justify-center gap-2"><Badge variant="secondary">{pick(`${selected.memberCount} সদস্য`, `${selected.memberCount} members`)}</Badge><Badge variant="outline">{live ? pick("লাইভ", "Live") : pick("সিঙ্ক হচ্ছে", "Syncing")}</Badge></div>
              </div>
              <Separator className="my-5" />
              <div className="flex items-center justify-between"><p className="text-sm font-bold">{pick("সদস্য", "Members")}</p><span className="text-xs text-muted-foreground">{selectedMembers.length}</span></div>
              <div className="mt-3 space-y-2">
                {selectedMembers.slice(0, 12).map((member) => (
                  <div key={member.authUserId} className="flex items-center gap-3 rounded-xl p-2 hover:bg-muted">
                    <Avatar className="size-8"><AvatarFallback className="text-[10px] font-bold">{member.initials}</AvatarFallback></Avatar>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{member.authUserId === viewer?.authUserId ? `${member.name} (${pick("আপনি", "You")})` : member.name}</p><p className="text-[10px] capitalize text-muted-foreground">{member.role.replace("_", " ")}</p></div>
                  </div>
                ))}
              </div>
              {selectedMembers.length > 12 ? <p className="mt-2 text-center text-xs text-muted-foreground">{pick(`আরও ${selectedMembers.length - 12} জন`, `${selectedMembers.length - 12} more`)}</p> : null}
              <Separator className="my-5" />
              <div className="rounded-2xl border bg-card p-4">
                <p className="text-xs font-bold">{pick("গোপনীয়তা", "Privacy")}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{pick("বার্তা, প্রতিক্রিয়া ও ফাইল শুধু এই পরিবারের অনুমোদিত সদস্যরা দেখতে পারবেন।", "Messages, reactions, and files are visible only to approved members of this family.")}</p>
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
          <fieldset disabled={working} aria-busy={working} className="contents">
          <DialogHeader>
            <DialogTitle>{pick("নতুন চ্যাট তৈরি করুন", "Create a new chat")}</DialogTitle>
            <DialogDescription>{pick("গ্রুপ, অ্যাডমিন রুম অথবা একজনের সঙ্গে সরাসরি কথোপকথন খুলুন।", "Open a group, admin room, or one-to-one direct conversation.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              {(["custom", "admin", "direct"] as const).map((type) => (
                <button key={type} type="button" onClick={() => { setCreateType(type); setCreateMemberIds([]); }} className={cn("rounded-xl border p-3 text-xs font-semibold", createType === type && "border-primary bg-primary/10 text-primary")}>
                  {type === "custom" ? pick("গ্রুপ", "Group") : type === "admin" ? pick("অ্যাডমিন রুম", "Admin room") : pick("সরাসরি", "Direct")}
                </button>
              ))}
            </div>
            {createType !== "direct" ? (
              <>
                <div className="space-y-2"><Label htmlFor="chat-name">{pick("চ্যানেলের নাম", "Channel name")}</Label><Input id="chat-name" value={createName} onChange={(event) => setCreateName(event.target.value)} placeholder={pick("যেমন: কাজিনদের আড্ডা", "For example: Cousins Corner")} className="rounded-xl" /></div>
                <div className="space-y-2"><Label htmlFor="chat-description">{pick("বিবরণ", "Description")}</Label><Textarea id="chat-description" value={createDescription} onChange={(event) => setCreateDescription(event.target.value)} placeholder={pick("এই গ্রুপের উদ্দেশ্য", "Purpose of this group")} className="rounded-xl" /></div>
                {createType === "custom" ? (
                  <div className="space-y-2"><Label>{pick("কে দেখতে পারবে?", "Who can view it?")}</Label><Select value={createVisibility} onValueChange={(value) => setCreateVisibility(value as "family" | "invite_only")}><SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="family">{pick("পরিবারের সবাই", "Everyone in the family")}</SelectItem><SelectItem value="invite_only">{pick("শুধু নির্বাচিত সদস্য", "Selected members only")}</SelectItem></SelectContent></Select></div>
                ) : null}
              </>
            ) : null}
            {(createType === "direct" || (createType === "custom" && createVisibility === "invite_only")) ? (
              <div className="space-y-2">
                <Label>{createType === "direct" ? pick("কাকে বার্তা পাঠাবেন?", "Who do you want to message?") : pick("গ্রুপের সদস্য", "Group members")}</Label>
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
            <Button variant="outline" className="rounded-xl" onClick={() => setCreateOpen(false)}>{pick("বাতিল", "Cancel")}</Button>
            <Button className="rounded-xl" onClick={() => void createChannel()} disabled={working || (createType === "direct" ? !createMemberIds.length : createName.trim().length < 2)}>
              {working ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} {pick("তৈরি করুন", "Create")}
            </Button>
          </DialogFooter>
          </fieldset>
        </DialogContent>
      </Dialog>
      </fieldset>
    </main>
  );
}
