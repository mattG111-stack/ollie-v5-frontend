/** Existing Apex house mark on an opaque home-screen tile. */
export function AppTile() {
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#16181A", alignItems: "center", justifyContent: "center" }}>
      <svg width="72%" height="66%" viewBox="0 0 118 108" xmlns="http://www.w3.org/2000/svg">
        <path d="M59 4 L118 52 L100 52 L100 100 L18 100 L18 52 L0 52 Z" fill="#FFFFFF" />
        <rect x="83" y="16" width="13" height="26" fill="#FFFFFF" />
        <rect x="43" y="62" width="24" height="38" fill="#E4002B" />
      </svg>
    </div>
  );
}
