"use client";

import { useEffect } from "react";
import { captureRef } from "@/lib/referral";

/**
 * Picks up ?ref= on whatever page the visitor lands on.
 *
 * Mounted in the root layout rather than on the sign-up page, because a
 * promoter's audience does not land on the sign-up form — they land on whatever
 * the promoter linked to, look around, and sign up later or not at all. Reading
 * the code only where the account is created would lose every one of those.
 *
 * Renders nothing.
 */
export default function ReferralCapture() {
  useEffect(() => { captureRef(); }, []);
  return null;
}
