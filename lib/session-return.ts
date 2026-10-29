/** Keep re-authentication on this app and away from authentication loops. */
export function safeReturnPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || /[\\\x00-\x20]/.test(value)) return "/today";
  try {
    const target = new URL(value, "https://apex.invalid");
    if (target.origin !== "https://apex.invalid" || /^\/(?:sign-in|forgot-password|reset-password)(?:\/|$)/.test(target.pathname)) return "/today";
    return target.pathname + target.search + target.hash;
  } catch { return "/today"; }
}
