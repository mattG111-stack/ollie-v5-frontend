/** Olie's O / house mark, inside the safe area of an opaque app tile. */
export function AppTile() {
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#16181A", alignItems: "center", justifyContent: "center" }}>
      <svg width="59%" height="61%" viewBox="0 0 100 104" xmlns="http://www.w3.org/2000/svg">
        <path d="M50 5C23 5 7 24 7 51s16 46 43 46 43-19 43-46S77 5 50 5ZM50 30 72 49V77H28V49Z" fill="#FFFFFF" fillRule="evenodd" />
        <rect x="44" y="57" width="12" height="20" rx="2" fill="#E4002B" />
      </svg>
    </div>
  );
}
