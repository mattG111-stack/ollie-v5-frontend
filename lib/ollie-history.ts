/** Recover only conversation text from this tab's pending question. */
export function savedHistory(value: unknown): { role: "user" | "assistant"; content: string }[] | null {
  if (!Array.isArray(value) || value.length > 20) return null;
  if (!value.every(t => t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string" && t.content.length <= 4000)) return null;
  return value.map(t => ({ role: t.role, content: t.content }));
}
export const MISSING_HISTORY_NOTICE = "This saved answer does not include the earlier conversation. Include your budget, area and must-haves in your next question so Ollie can apply them.";
export const LIMITED_HISTORY_NOTICE = "This conversation is getting long. Ollie uses the latest 20 messages; repeat your budget, area and must-haves if they were set earlier.";
