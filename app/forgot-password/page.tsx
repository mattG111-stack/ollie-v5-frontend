"use client";
import Link from "next/link";
import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setMessage("");
    if (sent && password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/" + (sent ? "reset-password" : "forgot-password"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sent ? { email, code, password } : { email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Check your entries and try again.");
      setMessage(data.detail);
      if (sent) { setDone(true); setPassword(""); setConfirm(""); setCode(""); }
      else setSent(true);
    } catch (err: any) { setError(err.message || "Could not connect. Please try again."); }
    finally { setBusy(false); }
  }
  const input = "w-full bg-paper border border-line rounded-lg px-3 py-2";
  return <main className="min-h-screen bg-paper grid place-items-center px-6">
    <section className="w-full max-w-md bg-white border border-line rounded-card p-7">
      <h1 className="text-xl font-semibold mb-3">Reset your password</h1>
      {!done && <form onSubmit={submit} className="flex flex-col gap-4">
        <label>Email<input className={input} type="email" autoComplete="email" required value={email} disabled={sent || busy} onChange={e => setEmail(e.target.value)} /></label>
        {sent && <>
          <label>Email reset code<input className={input} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} /></label>
          <p className="text-sm">Use at least six letters, including one uppercase letter, and one number.</p>
          <label>New password<input className={input} type="password" autoComplete="new-password" minLength={7} maxLength={128} pattern="(?=(?:[^A-Za-z]*[A-Za-z]){6})(?=.*[A-Z])(?=.*[0-9]).*" required value={password} onChange={e => setPassword(e.target.value)} /></label>
          <label>Confirm new password<input className={input} type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
        </>}
        <button disabled={busy} className="bg-blue text-white rounded-lg py-3 disabled:opacity-50">{busy ? "Please wait…" : sent ? "Save new password" : "Send reset code"}</button>
        {sent && <button type="button" disabled={busy} className="text-blue" onClick={() => { setSent(false); setMessage(""); setError(""); }}>Request another code or change email</button>}
      </form>}
      {error && <p role="alert" className="text-red-700 mt-4">{error}</p>}
      {message && <p role="status" className="mt-4">{message}</p>}
      <Link href="/sign-in" className="block text-blue mt-5">Back to sign in</Link>
    </section>
  </main>;
}
