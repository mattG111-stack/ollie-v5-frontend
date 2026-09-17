# Apex Property brand artwork

Drop your exported files in here. They are picked up automatically — no code
change, no rebuild of the logo component, no call sites to update. Every place
the logo appears (sidebar rail, sign-in, sign-up, onboarding, landing) reads
from these three names.

**SVG or PNG — either works.** Each slot is tried as `.svg` first, then `.png`,
so a transparent PNG you already have is fine and needs no re-export.

| File | Where it is used |
|---|---|
| `apex-logo.svg` *or* `apex-logo.png` | Landing, sign-in, sign-up, onboarding — the **black** artwork, on light backgrounds |
| `apex-logo-inverse.svg` *or* `apex-logo-inverse.png` | The sidebar rail — the **white** artwork, on the dark background |
| `apex-mark.svg` *or* `apex-mark.png` | The compact mark, where the wordmark won't fit. Optional. |

## If you are dropping in PNGs

- **Transparent background.** A baked-in white or black rectangle will show as a
  box against the surface behind it.
- **Export wide.** The lockup renders at a 36 px cap height on sign-in, which is
  72 real pixels on a retina screen; at the logo's ~10:1 proportions that is
  about 730 px of width. Anything from ~1500 px wide up is comfortable.

## If you have the vector

SVG is still preferable — sharp at every size and usually smaller — but only if
it is no trouble to export. A correct PNG beats a rushed SVG.

- **Convert text to outlines** before exporting. The font that sets the wordmark
  is almost certainly not installed on a customer's machine, and an SVG that
  references a missing font renders in whatever the browser substitutes.
- **No fixed width or height on the root `<svg>`** — keep the `viewBox` and let
  it scale. The component sets the height and derives the width.
- Trim the artboard to the artwork itself. Padding baked into the file becomes
  padding that cannot be removed in layout.

## Until they land

The app falls back to a hand-drawn approximation in `components/ApexLogo.tsx`.
It was redrawn by eye from a photograph of the logo, so it is close but not
correct, and it cannot be made correct by editing it further — the real artwork
is the only fix. Delete nothing; adding the files above is enough to retire it.
