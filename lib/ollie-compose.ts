/** A question explicitly submitted in this tab, scoped to the signed-in account. */
export function stageOlieQuestion(accountId: number, question: string): boolean {
  const q = question.trim();
  if (!Number.isSafeInteger(accountId) || accountId <= 0 || !q || q.length > 2000) return false;
  try {
    sessionStorage.setItem(`apex:ask:${accountId}:compose`, JSON.stringify({question:q, at:Date.now()}));
    return true;
  } catch { return false; }
}

/** Consume before starting a job, so reload/back/Strict Mode cannot submit it twice. */
export function takeOlieQuestion(accountKey: string): string | null {
  try {
    const raw = sessionStorage.getItem(`${accountKey}:compose`);
    if (!raw) return null;
    sessionStorage.removeItem(`${accountKey}:compose`);
    const value = JSON.parse(raw);
    if (typeof value.question !== "string" || !value.question.trim() || value.question.length > 2000 ||
        !Number.isFinite(value.at) || Date.now()-value.at < 0 || Date.now()-value.at > 600000) return null;
    return value.question.trim();
  } catch { return null; }
}
