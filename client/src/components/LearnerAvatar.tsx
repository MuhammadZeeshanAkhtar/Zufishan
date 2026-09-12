/**
 * The learner's avatar on the Find Students desk.
 *
 * A learner who uploaded a picture and made their person public gets that picture.
 * Otherwise the gender the learner saved chooses one of two drawn marks, and a
 * learner who saved no gender — or whose person is private — gets the neutral one
 * rather than a guess. Showing a male figure for an unknown learner would be a
 * fabricated detail, which is worse than showing nothing.
 *
 * The marks are inline SVG built from theme tokens, not image files: they inherit
 * `currentColor` and the ring token, so they carry no baked-in ivory or black and
 * stay legible in both themes without a second asset.
 */
import { UserRound } from "lucide-react";
import { displayableImageSrc } from "../lib/safe-url";

/** Head and shoulders, with a hijab silhouette for the female mark. */
function Figure({ gender }: { gender: "male" | "female" }) {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true" className="h-7 w-7" fill="currentColor">
      {gender === "female" ? (
        <>
          {/* Covered head and shoulders: one silhouette, no facial detail. */}
          <path d="M20 6c-6.2 0-10 4.4-10 10.6 0 4 1.2 7 2.6 9.1l-1.5 1.2C7.6 29.2 6 32.1 6 35.3V36h28v-.7c0-3.2-1.6-6.1-5.1-8.4l-1.5-1.2c1.4-2.1 2.6-5.1 2.6-9.1C30 10.4 26.2 6 20 6Z" />
          <ellipse cx="20" cy="18" rx="5.2" ry="6.4" opacity=".28" />
        </>
      ) : (
        <>
          <circle cx="20" cy="14.5" r="6.4" />
          <path d="M20 23.5c-6.3 0-11.4 3.9-11.4 8.7V36h22.8v-3.8c0-4.8-5.1-8.7-11.4-8.7Z" />
        </>
      )}
    </svg>
  );
}

export default function LearnerAvatar({ avatarUrl, gender, profilePublic }: {
  avatarUrl: string | null;
  gender: string | null;
  profilePublic: boolean;
}) {
  const src = profilePublic ? displayableImageSrc(avatarUrl) : null;
  const ring = "h-14 w-14 shrink-0 rounded-full border-2 border-[var(--ni-moss)]";

  if (src) return <img src={src} alt="" loading="lazy" className={`${ring} object-cover`} />;

  const known = profilePublic && (gender === "male" || gender === "female");
  return (
    <span aria-hidden="true" className={`${ring} grid place-items-center bg-[var(--ni-sage-soft)] ni-t-moss-deep`}>
      {known ? <Figure gender={gender as "male" | "female"} /> : <UserRound size={20} />}
    </span>
  );
}
