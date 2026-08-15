/**
 * Ask the listing CDN for a LARGER copy of a photo.
 *
 * The scrape stores whatever thumbnail the listing page used — often ~300px
 * wide. Cards and heroes are drawn at 130–400 CSS px, which on a retina screen
 * means 260–800 device px, so the stored thumbnail gets upscaled and looks soft.
 * Most image CDNs encode the width in the URL, so we can simply ask for more.
 *
 * Deliberately conservative: a URL is only rewritten when a size token we
 * RECOGNISE is present. Anything unfamiliar is returned untouched, so an
 * unexpected host can never end up with a broken src.
 */

/** Widths we'll request — capped so we never pull a needlessly huge original. */
const MAX_W = 1600;

export function hiRes(url: string | null | undefined, targetCssWidth: number): string {
  if (!url) return "";
  // Draw at 2x for retina, then clamp.
  const want = Math.min(Math.round(targetCssWidth * 2), MAX_W);
  try {
    // 1) Alibaba OSS / img-process style: ?x-oss-process=image/resize,w_400
    if (/x-oss-process=/i.test(url)) {
      return url.replace(/([?&]x-oss-process=image\/resize[^&]*?w_)(\d+)/i,
        (_m, head, w) => (Number(w) >= want ? `${head}${w}` : `${head}${want}`));
    }
    // 2) Explicit width query params: ?w=400 / &width=400 / &imageView2/2/w/400
    if (/[?&](w|width)=\d+/i.test(url)) {
      return url.replace(/([?&](?:w|width)=)(\d+)/i,
        (_m, head, w) => (Number(w) >= want ? `${head}${w}` : `${head}${want}`));
    }
    if (/imageView2\/\d+\/w\/\d+/i.test(url)) {
      return url.replace(/(imageView2\/\d+\/w\/)(\d+)/i,
        (_m, head, w) => (Number(w) >= want ? `${head}${w}` : `${head}${want}`));
    }
    // 3) Filename size suffix: .../photo_400x300.jpg  ->  .../photo_800x600.jpg
    const m = url.match(/_(\d{2,4})x(\d{2,4})(\.[a-z]{3,4})(\?.*)?$/i);
    if (m) {
      const [, w, h, ext, qs = ""] = m;
      const width = Number(w), height = Number(h);
      if (width >= want) return url;
      const scale = want / width;
      return url.replace(
        /_(\d{2,4})x(\d{2,4})(\.[a-z]{3,4})(\?.*)?$/i,
        `_${want}x${Math.round(height * scale)}${ext}${qs}`,
      );
    }
  } catch {
    /* fall through — never break an image over a formatting guess */
  }
  return url;
}
