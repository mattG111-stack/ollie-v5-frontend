"use client";

import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { C, Card, CardTitle, MONO, Note } from "./apex";

/**
 * Ollie buyer's-agent contact for a specific property.
 *
 * Deliberately shows OUR agent, not the listing agent. The scrape carries
 * agent1_name / agent1_phone / agent1_email on 99.8% of listings, but surfacing
 * those would send a user straight to the vendor's agent and around the
 * business — so those fields stay internal.
 *
 * Details come from env so they are set once, not hardcoded per deploy:
 *   NEXT_PUBLIC_AGENT_NAME / _PHONE / _EMAIL
 * With none set the card explains what to configure rather than showing a
 * plausible-looking fake contact.
 */

const NAME = process.env.NEXT_PUBLIC_AGENT_NAME || "";
const PHONE = process.env.NEXT_PUBLIC_AGENT_PHONE || "";
const EMAIL = process.env.NEXT_PUBLIC_AGENT_EMAIL || "";

export default function BuyersAgent({
  propertyId,
  address,
  suburb,
  askingPrice,
  buyPrice,
}: {
  propertyId?: number;
  address: string | null;
  suburb: string | null;
  askingPrice: number | null;
  buyPrice: number | null;
}) {
  const { t } = useT();
  const configured = Boolean(PHONE || EMAIL);

  // Record the enquiry for the admin dashboard. Fire-and-forget — never blocks
  // the mailto/tel link or surfaces an error to the user.
  const logContact = (channel: "email" | "phone") => {
    if (propertyId == null) return;
    api(`/api/properties/${propertyId}/agent-contact`, {
      method: "POST",
      body: JSON.stringify({ channel }),
    }).catch(() => null);
  };

  const subject = `Enquiry: ${address ?? "property"}${suburb ? `, ${suburb}` : ""}`;
  const body = [
    `I'd like to talk about ${address ?? "this property"}${suburb ? `, ${suburb}` : ""}.`,
    askingPrice ? `Listed at $${Math.round(askingPrice).toLocaleString()}.` : null,
    buyPrice ? `Ollie buy price $${Math.round(buyPrice).toLocaleString()}.` : null,
    "",
    "Please get in touch.",
  ]
    .filter(Boolean)
    .join("\n");

  const mailto = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <Card style={{ marginTop: 16 }}>
<CardTitle sub={t("agent.sub")}>{t("agent.title")}</CardTitle>

      {configured ? (
        <>
          {NAME && (
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  background: C.accent,
                  color: "#fff",
                  display: "grid",
                  placeItems: "center",
                  fontWeight: 800,
                  fontSize: 14,
                  flexShrink: 0,
                }}
              >
                {NAME.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{NAME}</div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: C.faint, letterSpacing: ".1em" }}>
                  {t("agent.role")}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
            {PHONE && (
              <a
                href={`tel:${PHONE.replace(/\s/g, "")}`}
                onClick={() => logContact("phone")}
                style={{
                  flex: "1 1 140px",
                  textAlign: "center",
                  background: C.accent,
                  color: "#fff",
                  borderRadius: 11,
                  padding: "12px 16px",
                  fontWeight: 700,
                  fontSize: 14,
                  whiteSpace: "nowrap",
                }}
              >
                {t("agent.call", { phone: PHONE })}
              </a>
            )}
            {EMAIL && (
              <a
                href={mailto}
                onClick={() => logContact("email")}
                style={{
                  flex: "1 1 140px",
                  textAlign: "center",
                  background: C.card,
                  color: C.accent,
                  border: `1px solid ${C.border}`,
                  borderRadius: 11,
                  padding: "12px 16px",
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                {t("agent.email")}
              </a>
            )}
          </div>

<Note>{t("agent.emailNote")}</Note>
        </>
      ) : (
        <Note warn>{t("agent.notConfigured")}</Note>
      )}
    </Card>
  );
}
