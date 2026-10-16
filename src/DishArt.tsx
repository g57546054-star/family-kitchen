export default function DishArt({
  kind,
  hero = false,
}: {
  kind: string;
  hero?: boolean;
}) {
  const palettes: Record<string, string[]> = {
    tomato: ["#cc4e31", "#ef7450", "#efd280", "#f2dba2"],
    green: ["#53824c", "#78a45a", "#edb9a3", "#efa989"],
    stew: ["#a3673c", "#c38242", "#ebba64", "#d78949"],
    leaves: ["#438350", "#659c60", "#98b36c", "#9dc279"],
    soup: ["#f7e7bf", "#ede0b9", "#a48a68", "#c4ac86"],
    rice: ["#dfbe74", "#f4dba0", "#e68a4d", "#7b9d64"],
  };
  const colors = palettes[kind] ?? palettes.tomato;
  return (
    <svg
      className={`dish-art ${hero ? "hero-dish" : ""}`}
      viewBox="0 0 400 260"
      role="img"
      aria-label="家常菜插画"
    >
      <ellipse cx="203" cy="223" rx="131" ry="15" fill="#435a3c" opacity=".1" />
      <circle cx="200" cy="133" r="111" fill="#fdfbf6" />
      <circle
        cx="200"
        cy="133"
        r="99"
        fill="none"
        stroke="#ddd9cd"
        strokeWidth="1.5"
      />
      <circle
        cx="200"
        cy="133"
        r="87"
        fill={kind === "soup" ? "#ded0a7" : "#ded9c1"}
      />
      {Array.from({ length: 30 }, (_, i) => {
        const angle = i * 2.399;
        const radius = Math.sqrt(i / 30) * 72;
        const x = 200 + Math.cos(angle) * radius;
        const y = 133 + Math.sin(angle) * radius;
        return (
          <g key={i} transform={`translate(${x} ${y}) rotate(${i * 41})`}>
            <ellipse
              rx={kind === "leaves" ? 23 : 17}
              ry={kind === "leaves" ? 12 : 11}
              fill={colors[i % colors.length]}
            />
            <path
              d="M-9 -3 Q0 -7 9 -3"
              fill="none"
              stroke="#fff"
              opacity=".19"
              strokeWidth="2"
            />
          </g>
        );
      })}
      {[
        [-45, -28],
        [27, -48],
        [49, 15],
        [-23, 38],
        [7, 5],
        [-60, 6],
        [13, 53],
      ].map(([x, y], i) => (
        <g
          key={i}
          transform={`translate(${200 + x} ${133 + y}) rotate(${i * 62})`}
        >
          <ellipse rx="12" ry="5" fill="#426e40" />
          <path d="M-8 0h16" stroke="#90aa67" strokeWidth=".8" />
        </g>
      ))}
      <g stroke="#976e45" strokeWidth="5" strokeLinecap="round">
        <path d="m330 41-15 179m28-176-15 180" />
      </g>
      {hero && (
        <>
          <path d="M67 36q-16 20 3 32Q91 48 67 36" fill="#75906a" />
          <path d="M46 65q-19 1-15 20 23 0 15-20" fill="#9bae7a" />
          <circle cx="358" cy="195" r="15" fill="#c96343" />
          <path
            d="m354 181 5 9 6-7"
            fill="none"
            stroke="#547048"
            strokeWidth="3"
          />
        </>
      )}
    </svg>
  );
}
