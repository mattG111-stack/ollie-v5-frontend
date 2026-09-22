"use client";
import OllieOrb from "@/components/OllieOrb";

export default function OrbPreview() {
  const states = ["idle", "listening", "thinking", "speaking"] as const;
  return (
    <div style={{ background: "#070B14", minHeight: "100vh", display: "flex",
                  alignItems: "center", justifyContent: "center", gap: 6, padding: 24 }}>
      {states.map((s) => (
        <OllieOrb key={s} state={s} size={300}
                  caption={s[0].toUpperCase() + s.slice(1)} />
      ))}
    </div>
  );
}
