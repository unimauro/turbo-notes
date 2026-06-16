/**
 * Kawaii illustrations from the official Figma design (cactus, sleeping cat,
 * boba cup), served as transparent PNGs from /public. Each keeps a simple
 * `{ className }` API so callers control the box; the image fits with
 * `object-contain` so the aspect ratio never distorts on the cream background.
 */

/* eslint-disable @next/next/no-img-element -- small static decorative assets;
   next/image's fixed width/height fights the responsive Tailwind sizing here. */

export function KawaiiCactus({ className }: { className?: string }) {
  return (
    <img
      src="/cactus.png"
      alt="A cheerful cactus in a pot"
      className={`${className ?? ""} object-contain`.trim()}
      draggable={false}
    />
  );
}

export function KawaiiCat({ className }: { className?: string }) {
  return (
    <img
      src="/cat.png"
      alt="A sleepy cat curled up"
      className={`${className ?? ""} object-contain`.trim()}
      draggable={false}
    />
  );
}

export function KawaiiBoba({ className }: { className?: string }) {
  return (
    <img
      src="/boba.png"
      alt="A happy cup of bubble tea"
      className={`${className ?? ""} object-contain`.trim()}
      draggable={false}
    />
  );
}
