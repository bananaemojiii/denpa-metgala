"use client";

// Shared market-chat hook, keyed by ticker. One source of truth for the chat
// UI: loads history, polls for new messages (paused when the tab is hidden),
// and sends optimistically with clientId-based dedupe + retry.
//
// Polling mirrors lib/fill-sync.ts (setTimeout loop, cleared on unmount).
import { useCallback, useEffect, useRef, useState } from "react";
import { useUserStore } from "@/stores/user";
import type { ChatMessage } from "@/app/api/chat/route";

const POLL_MS = 5_000;
const PAGE = 50;

// Local send-state lives alongside server fields. Confirmed messages have no
// pending/error flag; optimistic ones carry status until the POST resolves.
export type SendStatus = "sending" | "failed";
export interface UiMessage extends ChatMessage {
  status?: SendStatus;
}

export type LoadState = "loading" | "ready" | "error";

// Stable client id without external deps (crypto.randomUUID when available).
function newClientId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `c-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

// Merge server messages into existing list, deduped by clientId (preferred) and
// id. Optimistic entries are replaced by their confirmed server twin.
function mergeMessages(existing: UiMessage[], incoming: ChatMessage[]): UiMessage[] {
  if (incoming.length === 0) return existing;
  const byKey = new Map<string, UiMessage>();
  const keyOf = (m: { clientId?: string; id: string }) => m.clientId || m.id;
  for (const m of existing) byKey.set(keyOf(m), m);
  for (const m of incoming) byKey.set(keyOf(m), m); // server wins → drops status
  return Array.from(byKey.values()).sort((a, b) => a.seq - b.seq);
}

export function useMarketChat(ticker: string | null, active: boolean) {
  const username = useUserStore((s) => s.username);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [load, setLoad] = useState<LoadState>("loading");
  const [hasMore, setHasMore] = useState(false);

  // Latest confirmed seq drives incremental polling. Ref avoids re-subscribing.
  const lastSeqRef = useRef(0);
  const messagesRef = useRef<UiMessage[]>([]);
  messagesRef.current = messages;

  const maxSeq = (list: UiMessage[]) =>
    list.reduce((mx, m) => (m.seq > mx ? m.seq : mx), 0);

  // Initial / on-ticker-change load.
  useEffect(() => {
    if (!ticker) return;
    let cancelled = false;
    setLoad("loading");
    setMessages([]);
    setHasMore(false);
    lastSeqRef.current = 0;

    (async () => {
      try {
        const res = await fetch(`/api/chat?ticker=${encodeURIComponent(ticker)}&limit=${PAGE}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { messages: ChatMessage[]; hasMore: boolean };
        if (cancelled) return;
        setMessages(data.messages);
        setHasMore(data.hasMore);
        lastSeqRef.current = maxSeq(data.messages);
        setLoad("ready");
      } catch {
        if (!cancelled) setLoad("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticker]);

  // Incremental polling — only while mounted, active, and the tab is visible.
  useEffect(() => {
    if (!ticker || !active) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    async function tick() {
      if (stopped) return;
      if (typeof document !== "undefined" && document.hidden) {
        timer = setTimeout(tick, POLL_MS);
        return;
      }
      try {
        const res = await fetch(
          `/api/chat?ticker=${encodeURIComponent(ticker!)}&afterSeq=${lastSeqRef.current}`
        );
        if (res.ok) {
          const data = (await res.json()) as { messages: ChatMessage[] };
          if (!stopped && data.messages.length > 0) {
            const merged = mergeMessages(messagesRef.current, data.messages);
            setMessages(merged);
            lastSeqRef.current = maxSeq(merged);
          }
        }
      } catch {
        /* transient — retry next tick */
      } finally {
        if (!stopped) timer = setTimeout(tick, POLL_MS);
      }
    }

    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [ticker, active]);

  // POST a message body. Used for both first send and retry (same clientId).
  const postMessage = useCallback(
    async (clientId: string, body: string) => {
      if (!ticker || !username) return;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticker, username, body, clientId }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { message: ChatMessage };
        setMessages((prev) => {
          const merged = mergeMessages(prev, [data.message]);
          lastSeqRef.current = maxSeq(merged);
          return merged;
        });
      } catch {
        // Mark the optimistic entry failed so the user can retry.
        setMessages((prev) =>
          prev.map((m) => (m.clientId === clientId ? { ...m, status: "failed" } : m))
        );
      }
    },
    [ticker, username]
  );

  // Send new text. Returns false if blocked (no auth / empty / no ticker).
  const send = useCallback(
    (text: string) => {
      const body = text.trim();
      if (!ticker || !username || !body) return false;
      const clientId = newClientId();
      const optimistic: UiMessage = {
        id: clientId,
        clientId,
        ticker,
        username,
        body,
        createdAt: Date.now(),
        // Sort optimistic messages after everything confirmed so far.
        seq: Math.max(lastSeqRef.current, maxSeq(messagesRef.current)) + 0.5,
        status: "sending",
      };
      setMessages((prev) => [...prev, optimistic]);
      void postMessage(clientId, body);
      return true;
    },
    [ticker, username, postMessage]
  );

  // Retry a previously failed optimistic message.
  const retry = useCallback(
    (clientId: string) => {
      const target = messagesRef.current.find((m) => m.clientId === clientId);
      if (!target) return;
      setMessages((prev) =>
        prev.map((m) => (m.clientId === clientId ? { ...m, status: "sending" } : m))
      );
      void postMessage(clientId, target.body);
    },
    [postMessage]
  );

  // Prepend an older page using the oldest known seq as the cursor.
  const loadOlder = useCallback(async () => {
    if (!ticker || messagesRef.current.length === 0) return;
    const oldest = messagesRef.current.reduce(
      (mn, m) => (m.seq < mn ? m.seq : mn),
      Infinity
    );
    try {
      const res = await fetch(
        `/api/chat?ticker=${encodeURIComponent(ticker)}&beforeSeq=${oldest}&limit=${PAGE}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as { messages: ChatMessage[]; hasMore: boolean };
      if (data.messages.length > 0) {
        setMessages((prev) => mergeMessages(prev, data.messages));
      }
      setHasMore(data.hasMore);
    } catch {
      /* ignore */
    }
  }, [ticker]);

  return { messages, load, hasMore, send, retry, loadOlder, canSend: !!username };
}
