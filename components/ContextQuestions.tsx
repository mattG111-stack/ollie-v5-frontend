"use client";
import {useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {useAuth} from "@/lib/auth";
import {api, AskStarted} from "@/lib/api";
import {contextQuestions, QuestionContext} from "@/lib/context-questions";

export default function ContextQuestions({context}: {context: QuestionContext}) {
  const router=useRouter();
  const {me}=useAuth();
  const locked=useRef(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{router.prefetch('/ask');},[router]);
  async function ask(question:string,title:string) {
    if (!me || locked.current) return;
    locked.current=true;setBusy(true);setError("");
    const key=`apex:ask:${me.id}`;
    try {
      if(sessionStorage.getItem(key)) throw new Error('An answer is already in progress. Open Olie to continue it first.');
      // Check recovery storage before starting a billable request.
      sessionStorage.setItem('apex:ask-storage-check','1');sessionStorage.removeItem('apex:ask-storage-check');
      const {ask_id}=await api<AskStarted>('/api/assistant/ask',{method:'POST',body:JSON.stringify({question,history:[]})});
      sessionStorage.setItem(key,JSON.stringify({id:ask_id,question:title,modelContent:question,history:[]}));
      router.push('/ask');
    } catch(e:any) {
      setError(e?.detail || e?.message || 'Could not start the question.');
      locked.current=false;setBusy(false);
    }
  }
  return <section aria-label="Questions for this page" className="no-print my-5 rounded-xl border border-line bg-white p-4">
    <h2 className="font-semibold">Ask Olie about this</h2>
    <div className="flex flex-wrap gap-2 mt-3">{contextQuestions(context).map(action=><button key={action.title} type="button" disabled={!me || busy} onClick={()=>ask(action.question,action.title)} className="rounded-lg border border-line px-3 py-2 text-sm text-left hover:border-blue disabled:opacity-50">{action.title}</button>)}</div>
    <p className="text-xs text-muted mt-2">{busy ? 'Opening your answer…' : 'Selecting a question uses your normal Olie allowance. No answers run until you choose.'}</p>
    {error && <p role="alert" className="text-sm mt-2">{error} <Link href="/ask" className="underline">Open Olie</Link></p>}
  </section>;
}
