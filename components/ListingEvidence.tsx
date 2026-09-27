"use client";

import { useState } from "react";

const labels: Record<string, string> = {
  zoning: "Zoning", type_of_title: "Title type", building_age: "Build year / era",
  condition: "Condition", building_condition: "Building condition", sale_method: "Sale method",
  days_on_market: "Days on market", prior_sale_price: "Prior sale price", prior_sale_date: "Prior sale date",
  last_sold_price: "Last recorded sale price", last_sold_date: "Last recorded sale date",
  estimate_low: "Source estimate — low", estimate_high: "Source estimate — high",
  land_slope_contour: "Contour", view_type: "View", title_reference: "Title reference",
  rates_annual: "Annual rates", lounges: "Lounges", has_swimming_pool: "Pool", garage_area_m2: "Garage area m²",
};

export default function ListingEvidence({ listing }: { listing: {
  address: string | null; image_url: string | null; photos?: string[];
  property_type: string | null; details?: Record<string, string | number | boolean | null>;
} }) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<string | null>(null);
  const photos = [...new Set([listing.image_url, ...(listing.photos ?? [])])]
    .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u));
  const details = listing.details ?? {};
  const photo = photos[index % (photos.length || 1)];
  return <div className="rounded-lg bg-paper p-3">
    <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
      className="flex items-center gap-3 text-left text-sm font-semibold">
      {photos[0] ? <img src={photos[0]} alt={`Preview of ${listing.address ?? "property"}`} loading="lazy"
        className="w-20 h-14 rounded object-cover" /> : <span className="text-xs text-muted">No photos supplied</span>}
      <span>{open ? "Hide" : "View"} photos &amp; property details · {photos.length} photos</span>
    </button>
    {open && <div className="mt-3 grid gap-4 lg:grid-cols-2">
      <div>
        {photo && failed !== photo ? <img src={photo} alt={`${listing.address ?? "Property"} — photo ${index + 1}`}
          loading="lazy" onError={() => setFailed(photo)} className="w-full h-64 object-contain rounded bg-white" />
          : <p className="p-6 text-sm text-muted">{photo ? "Source photo unavailable. Try another photo or open the source listing." : "No photos supplied by the source."}</p>}
        {photos.length > 1 && <div className="flex items-center justify-between mt-2">
          <button type="button" className="border rounded px-3 py-2" aria-label="Previous listing photo"
            onClick={() => setIndex((index - 1 + photos.length) % photos.length)}>Previous</button>
          <span>{index + 1} / {photos.length}</span>
          <button type="button" className="border rounded px-3 py-2" aria-label="Next listing photo"
            onClick={() => setIndex((index + 1) % photos.length)}>Next</button>
        </div>}
      </div>
      <div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <dt className="text-muted">Property type</dt><dd>{listing.property_type || "Not supplied"}</dd>
          {Object.entries(labels).map(([key, label]) => {
            const v = details[key];
            const value = v == null || v === "" ? "Not supplied" : typeof v === "boolean" ? (v ? "Yes" : "No")
              : typeof v === "number" && /price|estimate|rates/.test(key) ? new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(v) : String(v);
            return <div key={key} className="contents"><dt className="text-muted">{label}</dt><dd className="break-words">{value}</dd></div>;
          })}
        </dl>
        {details.description && <p className="mt-4 text-sm whitespace-pre-wrap">{String(details.description)}</p>}
        <p className="mt-3 text-xs text-muted">Source-reported details. Missing fields are not assumed; source estimates are not Apex valuations.</p>
      </div>
    </div>}
  </div>;
}
