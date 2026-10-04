export type AnswerMapData = { suburb: string };
export function parseAnswerMap(raw: string): AnswerMapData | null {
  if (raw.length > 2000) return null;
  try {
    const m = JSON.parse(raw);
    if (!m || typeof m.suburb !== "string" || !m.suburb.trim()
        || m.suburb.length > 100 || /[<>\u0000-\u001f]/.test(m.suburb)) return null;
    return {suburb:m.suburb.trim()};
  } catch { return null; }
}
