"use client";
import Link from "next/link";
import { useT } from "@/lib/i18n";

/** Page navigation stays visible even when the assistant folds away the rail. */
export default function HomeTabs({ active }: { active: string }) {
  const { t } = useT();
  return <nav aria-label="Today and Ask Olie" className="flex gap-2 px-4 sm:px-7 pt-4 pb-2">
    {[{href:"/today",label:t("nav.today")},{href:"/ask",label:t("nav.askApex")}].map(tab =>
      <Link key={tab.href} href={tab.href} aria-current={active === tab.href ? "page" : undefined}
        className={`rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${active === tab.href ? "bg-[#16181A] border-[#16181A] text-white" : "bg-white border-line text-text hover:border-gray-400"}`}>
        {tab.label}
      </Link>)}
  </nav>;
}
