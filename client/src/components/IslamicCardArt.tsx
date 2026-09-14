import { useState } from "react";

/**
 * The homepage card artwork: an Islamic composition, drawn rather than photographed.
 *
 * **Why it is inline SVG and not a pair of image files.** The brief asked for an
 * existing light asset and an existing dark asset, and `client/public/brand/` holds no
 * such pair — only four geometry SVGs. Referencing files that are not in the repository
 * would render two broken images, and generating a photographic asset would bake a
 * background and a fixed palette into the card. Drawing it here means every stroke and
 * fill is a theme token: one composition that is ivory-on-parchment in light and
 * gold-on-espresso in dark, with no second file to keep in step and nothing to crop.
 *
 * The composition is a night arch — a scalloped mihrab arch, a crescent and scattered
 * stars above a mosque silhouette with minarets, a hanging lantern either side, and a
 * girih star band along the base. No text, by design.
 *
 * `preserveAspectRatio="xMidYMid slice"` fills the card at any width without distorting
 * anything: the drawing is composed with its subject central and its margins expendable,
 * so a slice at the edges never cuts the arch, the crescent or the dome.
 */

/**
 * The homepage card's image.
 *
 * **Drop a file at `client/public/brand/noor-ilm-home-card.jpg` and it appears.** No code
 * change is needed; until the file exists the card shows the drawing below instead of a
 * blank frame.
 *
 * The dev server answers a missing asset with `200` and the SPA's index.html rather than
 * a 404, so the element receives HTML — but HTML does not decode as an image, and the
 * browser fires `error` regardless of the status code. That was measured against both a
 * missing and a real asset before relying on it. `naturalWidth === 0` on load is checked
 * too, for any host that manages to return a decodable-but-empty response.
 *
 * One file serves both themes: the gold border and per-theme shadow live on `.ni-works`,
 * so the photograph itself needs no light/dark variant.
 */
/**
 * Candidates, tried in order. Saving the file under any of these names works, so the
 * card does not depend on getting the extension right — `.png` from a browser's "Save
 * image as" is as good as `.jpg`.
 */
const PHOTOS = [
  "/brand/noor-ilm-home-card.jpg",
  "/brand/noor-ilm-home-card.jpeg",
  "/brand/noor-ilm-home-card.png",
  "/brand/noor-ilm-home-card.webp",
];

export function IslamicCardImage() {
  const [index, setIndex] = useState(0);
  // Past the end of the list means no file is present under any name.
  if (index >= PHOTOS.length) return <IslamicCardArt />;

  const advance = () => setIndex((current) => current + 1);
  return (
    <img
      key={PHOTOS[index]}
      src={PHOTOS[index]}
      alt=""
      decoding="async"
      onError={advance}
      onLoad={(event) => { if (event.currentTarget.naturalWidth === 0) advance(); }}
      // `cover` fills the card at every width. The composition is centred, so a crop
      // only ever takes the outer edges — the mosque, crescent and Quran stay whole.
      className="h-full w-full object-cover"
    />
  );
}

export default function IslamicCardArt() {
  return (
    <svg
      viewBox="0 0 600 400"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      aria-label=""
      aria-hidden="true"
      className="block h-full w-full"
    >
      <defs>
        {/* Sky: the card's own surface, deepened toward the top so the arch reads. */}
        <linearGradient id="ni-art-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ni-teal)" stopOpacity="0.95" />
          <stop offset="62%" stopColor="var(--ni-teal)" stopOpacity="0.72" />
          <stop offset="100%" stopColor="var(--ni-teal)" stopOpacity="0.88" />
        </linearGradient>
        <radialGradient id="ni-art-glow" cx="0.5" cy="0.34" r="0.55">
          <stop offset="0%" stopColor="var(--ni-gold-glow)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--ni-gold-glow)" stopOpacity="0" />
        </radialGradient>
        {/* One arch path, reused as the frame and as the clip for everything inside it. */}
        <path
          id="ni-art-arch"
          d="M300 44c-58 0-104 40-104 96v184h208V140c0-56-46-96-104-96Z"
        />
        <clipPath id="ni-art-inside"><use href="#ni-art-arch" /></clipPath>
      </defs>

      <rect width="600" height="400" fill="url(#ni-art-sky)" />

      <g clipPath="url(#ni-art-inside)">
        <rect width="600" height="400" fill="url(#ni-art-glow)" />

        {/* Crescent: a disc with a second disc lifted out of it, so the horns stay true. */}
        <g fill="var(--ni-gold-glow)">
          <path d="M300 92a52 52 0 1 0 30 94 42 42 0 1 1 0-84 52 52 0 0 0-30-10Z" opacity=".95" />
        </g>

        {/* Stars, scattered rather than placed on a grid. */}
        <g fill="var(--ni-gold-glow)" opacity=".75">
          {[
            [233, 118, 3.6], [364, 104, 2.8], [251, 168, 2.2], [352, 158, 3.2],
            [219, 205, 2.4], [381, 196, 2.6], [268, 92, 2.0], [330, 214, 2.2],
          ].map(([cx, cy, r]) => (
            <path
              key={`${cx}-${cy}`}
              d={`M${cx} ${cy - r * 2.6}l${r} ${r * 1.9}l${r * 2.6} ${r}l-${r * 2.6} ${r}l-${r} ${r * 1.9}l-${r} -${r * 1.9}l-${r * 2.6} -${r}l${r * 2.6} -${r}Z`}
            />
          ))}
        </g>

        {/* Mosque: one dome, two minarets, a low wall. Silhouette only. */}
        <g fill="var(--ni-moss-deep)" opacity=".92">
          <rect x="196" y="300" width="208" height="24" />
          <path d="M300 214c-26 0-44 20-44 42v44h88v-44c0-22-18-42-44-42Z" />
          <path d="M298 200h4v14h-4Z" />
          <circle cx="300" cy="196" r="4" />
          <path d="M228 244h16v56h-16Z" />
          <path d="M236 226c-7 0-12 6-12 12h24c0-6-5-12-12-12Z" />
          <path d="M356 244h16v56h-16Z" />
          <path d="M364 226c-7 0-12 6-12 12h24c0-6-5-12-12-12Z" />
        </g>

        {/* Lanterns, hung from the arch shoulders. */}
        <g stroke="var(--ni-gold-mid)" strokeWidth="1.6" fill="none" opacity=".85">
          <path d="M242 44v26M358 44v26" />
          <path d="M242 70h0M358 70h0" />
        </g>
        <g fill="var(--ni-gold-mid)" opacity=".8">
          <path d="M234 72h16l6 18-14 16h-0l-14-16Z" />
          <path d="M350 72h16l6 18-14 16h-0l-14-16Z" />
        </g>
      </g>

      {/* The arch outline, drawn over the scene so the frame stays crisp. */}
      <use href="#ni-art-arch" fill="none" stroke="var(--ni-gold-border)" strokeWidth="2.5" />

      {/* Girih band along the base: the same eight-point star the page already uses. */}
      <g stroke="var(--ni-gold-mid)" strokeWidth="1.4" fill="none" opacity=".6">
        <path d="M0 336h600M0 386h600" />
        {Array.from({ length: 13 }, (_, index) => {
          const cx = index * 50 + 25;
          return (
            <path
              key={cx}
              d={`M${cx} 344 l7 9 12-2 -2 12 9 7 -9 7 2 12 -12-2 -7 9 -7-9 -12 2 2-12 -9-7 9-7 -2-12 12 2Z`}
            />
          );
        })}
      </g>
    </svg>
  );
}
