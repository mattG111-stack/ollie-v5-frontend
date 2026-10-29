"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { stageOlieQuestion } from "@/lib/ollie-compose";

export default function TodayAskBar() {
  const {me} = useAuth();
  const router = useRouter();
  const [question,setQuestion] = useState("");
  const [moving,setMoving] = useState(false);
  const [error,setError] = useState("");
  const [speechSupported,setSpeechSupported] = useState(false);
  const [listening,setListening] = useState(false);
  const submitted = useRef(false);
  const recognition = useRef<any>(null);
  useEffect(()=>{
    setSpeechSupported("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
    return ()=>{try {recognition.current?.abort();} catch { /* already stopped */ }};
  },[]);
  function dictate() {
    if (listening) {recognition.current?.stop();return;}
    const speech = window as unknown as {SpeechRecognition?:any;webkitSpeechRecognition?:any};
    const Recognition = speech.SpeechRecognition || speech.webkitSpeechRecognition;
    if (!Recognition) return;
    const rec = new Recognition();
    rec.lang="en-NZ";rec.interimResults=true;rec.continuous=false;
    rec.onresult=(event:any)=>{
      let text="";
      for(let i=0;i<event.results.length;i++)text+=event.results[i][0].transcript;
      setQuestion(text.slice(0,2000));
    };
    rec.onend=()=>{setListening(false);recognition.current=null;};
    rec.onerror=()=>{setListening(false);recognition.current=null;setError("Voice input could not start. You can type your question instead.");};
    recognition.current=rec;setError("");
    try {rec.start();setListening(true);} catch {rec.onerror();}
  }
  function submit() {
    if (submitted.current || !me || !question.trim()) return;
    try {recognition.current?.stop();} catch { /* already stopped */ }
    if (!stageOlieQuestion(me.id,question)) {
      setError("This browser could not pass your question to Olie. Open Ask Olie to ask it there.");return;
    }
    submitted.current=true;setMoving(true);setError("");
    router.push("/ask");
  }
  return <section aria-label="Ask Olie from today's brief" className="mb-6">
    <form aria-label="Ask Olie from Today" onSubmit={event=>{event.preventDefault();submit();}}
      className="flex items-center gap-2 sm:gap-4 rounded-[24px] border border-line bg-white p-3 sm:p-4 shadow-soft">
      <span aria-hidden="true" className="hidden sm:block w-10 h-10 shrink-0 rounded-full bg-[radial-gradient(circle,#c7ddf8_0%,#eef5ff_45%,#fff_75%)]" />
      <label htmlFor="today-olie-question" className="sr-only">Ask Olie a property question</label>
      <input id="today-olie-question" value={question} onChange={event=>{setQuestion(event.target.value);setError("");}}
        placeholder="Ask Olie… e.g. Compare Riverhead and Kumeū" maxLength={2000} disabled={moving}
        className="min-w-0 flex-1 bg-transparent py-3 text-sm sm:text-base outline-none placeholder:text-gray-500 disabled:opacity-60" />
      <button type="button" onClick={dictate} disabled={!speechSupported||moving}
        aria-label={listening?"Stop dictation":"Speak your question"} aria-pressed={listening}
        title={speechSupported?(listening?"Stop dictation":"Speak your question"):"Voice input is unavailable in this browser"}
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line disabled:opacity-40 ${listening?"bg-red-50 text-red-600":"bg-white text-gray-700"}`}>
        <svg width="18" height="22" viewBox="0 0 16 20" fill="none" aria-hidden="true"><rect x="5" y="1" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.5"/><path d="M3 9.5a5 5 0 0 0 10 0M8 15v4M5.5 19h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </button>
      <button type="submit" aria-label="Send question to Olie" disabled={!question.trim()||moving||!me}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#16181A] text-white disabled:bg-gray-400">
        <svg width="21" height="21" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 16V4M4.5 9.5 10 4l5.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      </button>
    </form>
    {moving&&<p role="status" className="text-xs text-muted mt-2">Opening Ask Olie…</p>}
    {error&&<p role="alert" className="text-sm text-red-700 mt-2">{error} <Link href="/ask" className="underline">Open Ask Olie</Link></p>}
  </section>;
}
