"use client";
import { useEffect } from "react";
import { api, isPreview } from "@/lib/api";

export default function usePropertyInterest(propertyId?: number) {
  useEffect(() => {
    if (!propertyId || isPreview()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    api<{enabled:boolean}>("/api/activity/interests", undefined, {background:true}).then(memory => {
      if (cancelled || !memory.enabled) return;
      timer = setTimeout(() => {
        if (!cancelled && document.visibilityState === "visible") {
          void api("/api/activity/property", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({property_id:propertyId})}, {background:true}).catch(() => {});
        }
      }, 8000);
    }).catch(() => {});
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [propertyId]);
}
