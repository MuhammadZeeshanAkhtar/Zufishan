/**
 * The Islamic panel beside the sign-in form.
 *
 * Drawn rather than photographed. An eight-point girih star (khatim) sits inside
 * a pointed arch, over a tessellating geometric field and a low lantern glow.
 * All of it is inline SVG and CSS gradients, which buys three things a hero
 * image cannot: it weighs nothing on a phone, it takes its colours from the
 * theme tokens so light and dark are each designed rather than one being a
 * washed-out version of the other, and there is no photograph of a person or a
 * place to be mistaken for a claim about either.
 *
 * Every colour is a token reference. Nothing here paints a literal hex, so the
 * panel follows the reader's theme — including a mid-session system change.
 *
 * The whole panel is `aria-hidden`: it is atmosphere, and repeating the page
 * heading to a screen reader would only add noise before the form.
 */
import { useLocale } from "../contexts/LocaleContextState";

export default function AuthPanel({ mode }: { mode: "login" | "signup" }) {
  const { t } = useLocale();

  return (
    <aside className="ni-auth__aside" data-auth-anim="aside">
      <div className="ni-auth__art" aria-hidden="true">
        {/* The tessellating field. A single tile, repeated by the CSS pattern. */}
        <svg className="ni-auth__field" viewBox="0 0 120 120" preserveAspectRatio="xMidYMid slice" focusable="false">
          <defs>
            <pattern id="ni-girih" width="60" height="60" patternUnits="userSpaceOnUse">
              <g fill="none" stroke="currentColor" strokeWidth="1">
                <path d="M30 2 L45 17 L45 43 L30 58 L15 43 L15 17 Z" />
                <path d="M30 14 L38 22 L38 38 L30 46 L22 38 L22 22 Z" />
                <path d="M0 30 L15 30 M45 30 L60 30 M30 0 L30 2 M30 58 L30 60" />
              </g>
            </pattern>
            <radialGradient id="ni-lantern" cx="50%" cy="38%" r="62%">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.55" />
              <stop offset="60%" stopColor="currentColor" stopOpacity="0.12" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
          </defs>
          <rect width="120" height="120" fill="url(#ni-girih)" />
        </svg>

        {/* The lantern glow, sitting behind the arch. */}
        <span className="ni-auth__lantern" />

        {/* The arch, with the khatim star centred inside it. */}
        <svg className="ni-auth__arch" viewBox="0 0 240 340" fill="none" focusable="false">
          <path
            d="M20 336 L20 150 C20 88 64 40 120 40 C176 40 220 88 220 150 L220 336"
            stroke="currentColor"
            strokeWidth="1.4"
            opacity="0.55"
          />
          <path
            d="M40 336 L40 152 C40 100 76 60 120 60 C164 60 200 100 200 152 L200 336"
            stroke="currentColor"
            strokeWidth="0.9"
            opacity="0.3"
          />
          <g className="ni-auth__star" transform="translate(120 168)">
            <path
              d="M0 -54 L14 -32 L40 -40 L32 -14 L54 0 L32 14 L40 40 L14 32 L0 54 L-14 32 L-40 40 L-32 14 L-54 0 L-32 -14 L-40 -40 L-14 -32 Z"
              stroke="currentColor"
              strokeWidth="1.3"
              opacity="0.85"
            />
            <path
              d="M0 -30 L8 -18 L22 -22 L18 -8 L30 0 L18 8 L22 22 L8 18 L0 30 L-8 18 L-22 22 L-18 8 L-30 0 L-18 -8 L-22 -22 L-8 -18 Z"
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.5"
            />
          </g>
        </svg>
      </div>

      {/* Readable overlay: the words sit on their own scrim, never straight on
          the pattern, so contrast holds in both themes. */}
      <div className="ni-auth__aside-copy">
        <p className="ni-auth__eyebrow">{t("brand.name")}</p>
        <p className="ni-auth__quote">{mode === "login" ? t("authPanel.loginLine") : t("authPanel.signupLine")}</p>
        <p className="ni-auth__quote-sub">{t("authPanel.support")}</p>
      </div>
    </aside>
  );
}
