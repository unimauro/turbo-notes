/**
 * Original kawaii illustrations, hand-drawn as inline SVG (no copied assets).
 * Simple flat shapes + blush cheeks, matching the cozy prototype style.
 */

const INK = "#6B5638";
const BLUSH = "#F2A99B";

export function KawaiiCactus({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 140"
      className={className}
      role="img"
      aria-label="A smiling cactus in a pot"
    >
      {/* arms */}
      <path
        d="M28 62 q-12 0 -12 -14 q0 -8 7 -8 q7 0 7 8 v6 q0 4 6 4 z"
        fill="#9BC6B5"
        stroke={INK}
        strokeWidth="2.5"
      />
      <path
        d="M92 70 q14 0 14 -18 q0 -9 -8 -9 q-8 0 -8 9 v8 q0 5 -7 5 z"
        fill="#9BC6B5"
        stroke={INK}
        strokeWidth="2.5"
      />
      {/* body */}
      <rect
        x="36"
        y="20"
        width="48"
        height="78"
        rx="24"
        fill="#A8CFBD"
        stroke={INK}
        strokeWidth="2.5"
      />
      {/* flower */}
      <circle cx="60" cy="16" r="7" fill="#F2A99B" stroke={INK} strokeWidth="2" />
      <circle cx="60" cy="16" r="2.5" fill="#F8E5A3" />
      {/* face */}
      <path d="M50 56 q3 4 6 0" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M64 56 q3 4 6 0" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M55 66 q5 5 10 0" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="46" cy="63" r="3.5" fill={BLUSH} opacity="0.85" />
      <circle cx="74" cy="63" r="3.5" fill={BLUSH} opacity="0.85" />
      {/* pot */}
      <path
        d="M34 98 h52 l-5 34 q-1 5 -6 5 h-30 q-5 0 -6 -5 z"
        fill="#D98E63"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect x="30" y="94" width="60" height="10" rx="5" fill="#E3A57E" stroke={INK} strokeWidth="2.5" />
    </svg>
  );
}

export function KawaiiCat({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 170 110"
      className={className}
      role="img"
      aria-label="A sleeping cat"
    >
      {/* zzz */}
      <text x="128" y="26" fontFamily="Georgia, serif" fontSize="16" fill={INK} fontStyle="italic">
        z
      </text>
      <text x="140" y="16" fontFamily="Georgia, serif" fontSize="12" fill={INK} fontStyle="italic">
        z
      </text>
      {/* tail */}
      <path
        d="M138 86 q22 2 20 -14 q-1 -8 -9 -8"
        fill="none"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* body */}
      <path
        d="M30 92 q-6 -38 28 -44 q40 -7 56 12 q14 16 8 32 q-46 6 -92 0 z"
        fill="#EAD9BF"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* ears */}
      <path d="M38 56 l-4 -14 l14 7 z" fill="#EAD9BF" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M66 50 l2 -14 l11 10 z" fill="#EAD9BF" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      {/* sleeping face */}
      <path d="M44 72 q4 4 8 0" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M62 72 q4 4 8 0" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M54 80 q3 3 6 0" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
      <circle cx="40" cy="79" r="3.5" fill={BLUSH} opacity="0.85" />
      <circle cx="74" cy="79" r="3.5" fill={BLUSH} opacity="0.85" />
      {/* ground line */}
      <path d="M22 93 h126" stroke={INK} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

export function KawaiiBoba({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 150"
      className={className}
      role="img"
      aria-label="A happy cup of bubble tea"
    >
      {/* straw */}
      <rect
        x="62"
        y="6"
        width="12"
        height="44"
        rx="5"
        transform="rotate(12 68 28)"
        fill="#C9ADE0"
        stroke={INK}
        strokeWidth="2.5"
      />
      {/* lid */}
      <rect x="28" y="40" width="64" height="12" rx="6" fill="#F7EFDC" stroke={INK} strokeWidth="2.5" />
      {/* cup */}
      <path
        d="M32 52 h56 l-7 86 q-0.5 7 -8 7 h-26 q-7.5 0 -8 -7 z"
        fill="#F4DDBE"
        stroke={INK}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* milk-tea line */}
      <path d="M35 70 h50" stroke={INK} strokeWidth="1.5" opacity="0.35" />
      {/* boba pearls */}
      <circle cx="46" cy="128" r="5" fill="#8B6B4F" />
      <circle cx="60" cy="132" r="5" fill="#8B6B4F" />
      <circle cx="74" cy="128" r="5" fill="#8B6B4F" />
      <circle cx="53" cy="118" r="5" fill="#8B6B4F" />
      <circle cx="68" cy="118" r="5" fill="#8B6B4F" />
      {/* face */}
      <path d="M46 88 q4 5 8 0" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M66 88 q4 5 8 0" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M54 98 q6 6 12 0" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="42" cy="96" r="4" fill={BLUSH} opacity="0.85" />
      <circle cx="78" cy="96" r="4" fill={BLUSH} opacity="0.85" />
    </svg>
  );
}
