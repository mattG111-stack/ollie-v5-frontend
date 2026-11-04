import { readFileSync } from "node:fs";
import { join } from "node:path";

// One approved artwork source for every installed-app icon. Embedded locally
// so icon rendering never depends on authentication or an external image host.
const tealHouse = `data:image/png;base64,${readFileSync(
  join(process.cwd(), "public/brand/olie-teal-house.png"),
).toString("base64")}`;

/** Approved teal house and white highlight on an opaque charcoal tile. */
export function AppTile() {
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#252728" }}>
      <img src={tealHouse} width="100%" height="100%" alt="" />
    </div>
  );
}
