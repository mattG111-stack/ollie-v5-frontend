"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api, Preferences, PreferencePreview, SuburbTrend } from "@/lib/api";
import { fmtMoneyShort } from "@/lib/format";
import PriceChangeBadge from "./PriceChangeBadge";

type SavedSearch = { id:number; name:string; match_count:number; new_count:number };
type Area = { name:string; data:SuburbTrend|null };

/** All reads use the existing customer-visible APIs. Nothing asks the model,
 * changes preferences, marks searches seen, or publishes data on arrival. */
export default function PersonalBrief() {
  const [prefs,setPrefs]=useState<Preferences|null>(null);
  const [preview,setPreview]=useState<PreferencePreview|null>(null);
  const [searches,setSearches]=useState<SavedSearch[]|null>(null);
  const [areas,setAreas]=useState<Area[]>([]);
  const [prefError,setPrefError]=useState(false);
  const [previewError,setPreviewError]=useState(false);
  const [searchError,setSearchError]=useState(false);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{
    let alive=true;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15000);
    setPrefError(false);setPreviewError(false);setSearchError(false);
    const get=<T,>(url:string)=>api<T>(url,{signal:controller.signal},{background:true});
    get<SavedSearch[]>('/api/wishlists').then(r=>{if(alive)setSearches(r);}).catch(()=>{if(alive)setSearchError(true);});
    get<Preferences>('/api/preferences').then(async p=>{
      if(!alive)return;
      setPrefs(p);setPreview(null);
      const names=[...new Set(p.suburbs)].slice(0,2);
      setAreas(names.map(name=>({name,data:null})));
      // Area figures and the personalised preview do not wait for each other.
      for(const name of names) void get<SuburbTrend>(`/api/dashboards/suburb-trend?${new URLSearchParams({suburb:name})}`)
        .then(data=>{if(alive)setAreas(old=>old.map(a=>a.name===name?{name,data}:a));}).catch(()=>{});
      if(p.state==='unset')return;
      try {
        const r=await api<PreferencePreview>('/api/preferences/preview',{method:'POST',signal:controller.signal,
          body:JSON.stringify({goals:p.goals,suburbs:p.suburbs,districts:p.districts,min_price:p.min_price,max_price:p.max_price,min_beds:p.min_beds})},{background:true});
        if(alive)setPreview(r);
      } catch {if(alive)setPreviewError(true);}
    }).catch(()=>{if(alive)setPrefError(true);});
    return ()=>{alive=false;clearTimeout(timer);controller.abort();};
  },[retry]);
  const priced=(preview?.rows??[]).filter(p=>p.margin_dollars!=null&&p.margin_dollars>0);
  const places=prefs?[...prefs.suburbs,...prefs.districts].join(', '):'';
  return <section aria-label="Your daily brief" className="mb-7">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
      <h2 className="font-display text-lg font-semibold">For you</h2>
      <Link href="/ask?preferences=1" className="text-sm text-blue underline">{prefs?.state==='due'?'Review your criteria':'Your areas and budget'}</Link>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="bg-white border border-line rounded-card p-5" aria-label="Your opportunities">
        <h3 className="font-semibold mb-2">Your opportunities</h3>
        {prefError?<Retry text="Your saved criteria could not load." retry={()=>setRetry(n=>n+1)}/>:!prefs?<p className="text-sm text-muted">Loading your criteria…</p>:prefs.state==='unset'?<p className="text-sm text-muted">Tell Olie your preferred areas and budget to personalise this brief. <Link className="underline" href="/ask?preferences=1">Set your criteria</Link></p>:<>
          <p className="text-xs text-muted mb-3">{places||'Across Auckland'}{prefs.max_price!=null?` · up to ${fmtMoneyShort(prefs.max_price)}`:''}{prefs.min_beds!=null?` · ${prefs.min_beds}+ beds`:''}. Based on your saved areas, budget, bedrooms and goals.</p>
          {previewError?<Retry text="Matching listings could not load." retry={()=>setRetry(n=>n+1)}/>:!preview?<p className="text-sm text-muted">Finding matching listings…</p>:<>
            <p className="text-sm mb-3">{preview.matches.toLocaleString()} matching listings · {preview.underpriced.toLocaleString()} flagged underpriced · {preview.subdividable.toLocaleString()} with subdivision potential</p>
            <div className="space-y-3">{priced.map(p=><Link key={p.id} href={`/property/${p.id}`} className="block rounded-xl border border-line p-3 hover:border-gray-400">
              <div className="font-semibold text-sm">{p.address||'View property'}</div>
              <div className="text-xs text-muted mt-1">{p.suburb}{p.can_subdivide?' · Subdivision potential':''}</div>
              <div className="text-sm mt-2">Asking {fmtMoneyShort(p.asking_price)} · Apex estimate {fmtMoneyShort(p.fair_value)}</div>
              <div className="text-xs mt-1">Estimated asking-price gap {fmtMoneyShort(p.margin_dollars)}</div>
              <PriceChangeBadge change={p.asking_price_change}/>
            </Link>)}</div>
            {priced.length===0&&<p className="text-sm text-muted">No positive asking-price gaps in this preview. You can review the matching listings with Olie.</p>}
            <p className="text-xs text-muted mt-3">Estimated gaps are not development profit. Open a property to review its evidence.</p>
          </>}
        </>}
      </section>
      <section aria-label="Ask Olie" className="rounded-card bg-[#16181A] text-white p-6 flex flex-col items-start justify-center">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="w-10 h-10 mb-5 text-[#EF8F82]"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-3 3V11.5a10 10 0 0 1 20 0Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M7 10h8M7 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
        <h3 className="font-display text-2xl font-semibold mb-3">Ask Olie</h3>
        <p className="text-sm leading-relaxed text-white/75 max-w-sm mb-6">Ask about a property, compare suburbs or explore opportunities. Olie brings your property questions together in one place.</p>
        <Link href="/ask" className="inline-flex items-center rounded-xl bg-white text-[#16181A] px-5 py-3 text-sm font-semibold hover:bg-gray-100">Open Ask Olie →</Link>
      </section>
    </div>
      <section className="bg-white border border-line rounded-card p-5 mt-4" aria-label="Your watchlist">
        <h3 className="font-semibold mb-2">Your watchlist</h3>
        <p className="text-xs text-muted mb-3">Updates to your saved searches.</p>
        {searchError?<Retry text="Your saved searches could not load." retry={()=>setRetry(n=>n+1)}/>:!searches?<p className="text-sm text-muted">Loading saved searches…</p>:searches.length===0?<p className="text-sm text-muted">Save a search to keep track of matching properties.</p>:<div className="space-y-2">{searches.slice(0,3).map(s=><Link href="/wishlists" key={s.id} className="block rounded-xl border border-line p-3 hover:border-gray-400">
          <div className="font-semibold text-sm">{s.name}</div><div className="text-xs text-muted mt-1">{s.match_count.toLocaleString()} matches · {s.new_count.toLocaleString()} new matches since you last checked</div>
        </Link>)}</div>}
        <Link href="/wishlists" className="inline-block text-sm text-blue underline mt-3">Open wish lists →</Link>
      </section>
    <section aria-label="Your areas" className="bg-white border border-line rounded-card p-5 mt-4">
      <h3 className="font-semibold mb-2">Your areas</h3>
      {areas.length?<div className="grid gap-3 sm:grid-cols-2">{areas.map(a=><Link key={a.name} href={`/trends?${new URLSearchParams({suburb:a.name})}`} className="block border border-line rounded-xl p-3 hover:border-gray-400">
        <div className="font-semibold text-sm">{a.name}</div>
        {a.data&&<p className="text-xs text-muted mt-1">{a.data.listing_count==null?'Live count unavailable':`${a.data.listing_count.toLocaleString()} current listings`}{a.data.median_asking_current!=null?` · median asking ${fmtMoneyShort(a.data.median_asking_current)}`:''}</p>}
        <div className="text-sm text-blue mt-2">View sales and suburb trends →</div>
      </Link>)}</div>:<p className="text-sm text-muted">Choose specific suburbs in <Link href="/ask?preferences=1" className="underline">your criteria</Link> to put their sales and trends here.</p>}
    </section>
  </section>;
}
function Retry({text,retry}:{text:string;retry:()=>void}) {
  return <p role="status" className="text-sm text-muted">{text} <button type="button" onClick={retry} className="underline text-blue">Retry</button></p>;
}
