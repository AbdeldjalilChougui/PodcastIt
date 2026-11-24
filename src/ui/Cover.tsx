/** Generative cover art: a gradient and sound bars seeded by the episode title (no image credits spent). */

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PALETTES = [
  ["#FF6A3D", "#7B5CFF"],
  ["#FF8A5B", "#E2407A"],
  ["#14B8A6", "#3B5BDB"],
  ["#F59F00", "#E8590C"],
  ["#7B5CFF", "#22B8CF"],
  ["#2F9E44", "#1C7ED6"],
  ["#D6336C", "#7048E8"],
];

export function Cover({ title, size = 96 }: { title: string; size?: number }) {
  const h = hash(title || "PodcastIt");
  const [c1, c2] = PALETTES[h % PALETTES.length];
  const bars = Array.from({ length: 7 }, (_, i) => 16 + ((h >>> (i * 3)) % 30));
  const initial = (title.trim()[0] ?? "P").toUpperCase();
  const id = `cv${h.toString(36)}`;
  return (
    <svg class="cover" width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="Episode cover">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color={c1} />
          <stop offset="1" stop-color={c2} />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="18" fill={`url(#${id})`} />
      <text x="14" y="38" font-size="30" font-weight="700" fill="#fff" opacity="0.95" font-family="Georgia, 'Iowan Old Style', serif">
        {initial}
      </text>
      <g fill="#fff" opacity="0.85">
        {bars.map((b, i) => (
          <rect x={14 + i * 11} y={88 - b} width="6" height={b} rx="3" />
        ))}
      </g>
    </svg>
  );
}
