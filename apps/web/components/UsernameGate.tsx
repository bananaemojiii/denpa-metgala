"use client";

import { useState } from "react";
import { useUserStore } from "@/stores/user";

export function UsernameGate({ children }: { children: React.ReactNode }) {
  const { username, setUsername } = useUserStore();
  const [draft, setDraft] = useState("");
  const [err, setErr] = useState("");

  if (username) return <>{children}</>;

  function submit() {
    const trimmed = draft.trim();
    if (trimmed.length < 2) { setErr("at least 2 chars"); return; }
    setUsername(trimmed);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.85)" }}>
      <div className="w-full max-w-xs p-6 space-y-4 rounded-2xl"
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div>
          <p className="font-bold text-base tracking-tight">denpa · met gala 2026</p>
          <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
            pick a handle to track your paper trades
          </p>
        </div>
        <input
          autoFocus
          type="text"
          maxLength={24}
          placeholder="your handle"
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setErr(""); }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          className="w-full rounded-lg px-3 py-2 text-sm outline-none"
          style={{ background: "var(--border)", color: "var(--text)", border: "1px solid var(--border)" }}
        />
        {err && <p className="text-xs" style={{ color: "var(--no)" }}>{err}</p>}
        <button
          onClick={submit}
          className="w-full py-2.5 rounded-xl font-bold text-sm"
          style={{ background: "var(--text)", color: "var(--bg)" }}
        >
          enter
        </button>
      </div>
    </div>
  );
}
