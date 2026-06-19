"use client";

// Presentation-agnostic chat body: scrolling message list + composer.
// Fills its parent (a flex column). Used inline on desktop and inside a
// full-height sheet on mobile. All colors come from the existing design tokens.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useUserStore } from "@/stores/user";
import { useMarketChat, type UiMessage } from "@/lib/useMarketChat";

interface Props {
  ticker: string;
  active: boolean; // whether this chat is the visible/selected surface (gates polling)
}

const NEAR_BOTTOM_PX = 80;

function initials(name: string): string {
  const parts = name.replace(/[_-]+/g, " ").trim().split(/\s+/);
  const a = parts[0]?.[0] ?? name[0] ?? "?";
  const b = parts.length > 1 ? parts[1][0] : "";
  return (a + b).toUpperCase();
}

function timeLabel(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

// Insert a light divider when a gap > 10min separates consecutive messages.
function showDivider(prev: UiMessage | undefined, cur: UiMessage): boolean {
  if (!prev) return true;
  return cur.createdAt - prev.createdAt > 10 * 60 * 1000;
}

export function MarketChat({ ticker, active }: Props) {
  const username = useUserStore((s) => s.username);
  const setUsername = useUserStore((s) => s.setUsername);
  const { messages, load, hasMore, send, retry, loadOlder, canSend } = useMarketChat(
    ticker,
    active
  );

  const [draft, setDraft] = useState("");
  const [handleDraft, setHandleDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const prevCountRef = useRef(0);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
  }

  // Auto-scroll to newest only when the user is already near the bottom, so we
  // never yank someone who's reading older messages. useLayoutEffect avoids a
  // visible jump.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = messages.length > prevCountRef.current;
    prevCountRef.current = messages.length;
    if (grew && nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  // Snap to bottom on first successful load for a given ticker.
  useEffect(() => {
    if (load === "ready" && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      nearBottomRef.current = true;
    }
  }, [load, ticker]);

  function submit() {
    if (send(draft)) setDraft("");
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2 space-y-1.5"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {load === "loading" && (
          <p className="text-xs py-6 text-center" style={{ color: "var(--muted)" }}>
            loading chat…
          </p>
        )}

        {load === "error" && (
          <p className="text-xs py-6 text-center" style={{ color: "var(--no)" }}>
            couldn’t load chat — it’ll retry shortly
          </p>
        )}

        {load === "ready" && messages.length === 0 && (
          <p className="text-xs py-6 text-center" style={{ color: "var(--muted)" }}>
            no messages yet — start the conversation
          </p>
        )}

        {load === "ready" && hasMore && (
          <button
            onClick={loadOlder}
            className="block mx-auto text-xs py-1.5"
            style={{ color: "var(--muted)" }}
          >
            load earlier messages
          </button>
        )}

        {messages.map((m, i) => {
          const mine = !!username && m.username === username;
          const divider = showDivider(messages[i - 1], m);
          return (
            <div key={m.clientId || m.id}>
              {divider && (
                <div
                  className="text-center text-[10px] py-1 select-none"
                  style={{ color: "var(--muted)" }}
                >
                  {timeLabel(m.createdAt)}
                </div>
              )}
              <div className="flex items-start gap-2">
                {/* Initials avatar */}
                <div
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5"
                  style={{
                    background: mine ? "var(--text)" : "var(--border)",
                    color: mine ? "var(--bg)" : "var(--muted)",
                  }}
                >
                  {initials(m.username)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="text-xs font-bold truncate"
                      style={{ color: mine ? "var(--text)" : "var(--muted)" }}
                    >
                      {mine ? "you" : m.username}
                    </span>
                    <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                      {timeLabel(m.createdAt)}
                    </span>
                    {m.status === "sending" && (
                      <span className="text-[10px]" style={{ color: "var(--muted)" }}>
                        sending…
                      </span>
                    )}
                    {m.status === "failed" && (
                      <button
                        onClick={() => retry(m.clientId)}
                        className="text-[10px] font-bold"
                        style={{ color: "var(--no)" }}
                      >
                        failed · retry
                      </button>
                    )}
                  </div>
                  {/* break long words / URLs so layout never overflows */}
                  <p
                    className="text-sm leading-snug whitespace-pre-wrap break-words"
                    style={{
                      overflowWrap: "anywhere",
                      opacity: m.status === "sending" ? 0.6 : 1,
                    }}
                  >
                    {m.body}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer / auth CTA — non-scrolling footer pinned above the keyboard */}
      <div
        className="shrink-0 px-3 py-2"
        style={{
          borderTop: "1px solid var(--border)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)",
        }}
      >
        {canSend ? (
          <div className="flex items-end gap-2">
            <textarea
              rows={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="message…"
              maxLength={1000}
              className="flex-1 resize-none rounded-lg px-3 py-2 text-sm outline-none max-h-24"
              style={{
                background: "var(--border)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
            />
            <button
              onClick={submit}
              disabled={!draft.trim()}
              className="shrink-0 px-4 py-2 rounded-lg font-bold text-sm transition-opacity disabled:opacity-40"
              style={{ background: "var(--text)", color: "var(--bg)" }}
            >
              send
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              pick a handle to chat
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                maxLength={24}
                value={handleDraft}
                onChange={(e) => setHandleDraft(e.target.value)}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  handleDraft.trim().length >= 2 &&
                  setUsername(handleDraft)
                }
                placeholder="your handle"
                className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
                style={{
                  background: "var(--border)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                }}
              />
              <button
                onClick={() => handleDraft.trim().length >= 2 && setUsername(handleDraft)}
                disabled={handleDraft.trim().length < 2}
                className="shrink-0 px-4 py-2 rounded-lg font-bold text-sm transition-opacity disabled:opacity-40"
                style={{ background: "var(--text)", color: "var(--bg)" }}
              >
                set
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
