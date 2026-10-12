"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Runs the full pipeline for this subscriber. Starts automatically right after sign-up. */
export default function RunNow({ token, autoStart }: { token: string; autoStart: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const started = useRef(false);

  async function run(trigger: "manual" | "signup") {
    setBusy(true);
    setMessage(null);
    setSeconds(0);
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, trigger }),
      });
      const data = await res.json();
      if (!res.ok) setMessage({ kind: "error", text: data.error ?? "Run failed." });
      else if (data.status === "failed") setMessage({ kind: "error", text: `Run failed: ${data.error}` });
      else if (data.status === "empty")
        setMessage({ kind: "ok", text: "The search ran but found no matching events. Try adding cities or focus areas." });
      else
        setMessage({
          kind: data.email_status === "sent" ? "ok" : "error",
          text:
            data.email_status === "sent"
              ? `Found ${data.events} events and emailed your digest.`
              : `Found ${data.events} events (shown below). Email ${data.email_status}.`,
        });
      router.refresh();
    } catch {
      setMessage({ kind: "error", text: "The run took too long or the network dropped. Refresh to see if it finished." });
    } finally {
      clearInterval(timer);
      setBusy(false);
    }
  }

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      router.replace(`/manage/${token}`);
      run("signup");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="run-now">
      <button type="button" onClick={() => run("manual")} disabled={busy}>
        {busy ? `Collecting and ranking events… ${seconds}s` : "Send my digest now"}
      </button>
      {busy && <p className="hint">Fetching live sources and ranking usually takes one to two minutes. Keep this tab open.</p>}
      {message && <p className={`msg ${message.kind}`}>{message.text}</p>}
    </div>
  );
}
