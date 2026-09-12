/**
 * What a signed-in account sees when it holds no public role.
 *
 * Before migration 0023, the signup trigger inserted `learner` for every account
 * regardless of what was asked for, and the client turned a missing role into
 * "learner" as well. Both of those guesses are gone, which means a real third
 * state now exists and has to be shown: the account authenticated, but nothing
 * in `user_roles` says what it is.
 *
 * That is a data problem, not a routing problem. Sending such an account to a
 * learner dashboard would recreate the bug in a different place, so this states
 * the situation, gives the account id an operator can act on, and stops.
 */
import { Link } from "wouter";
import { UserX } from "lucide-react";
import { useLocale } from "../contexts/LocaleContextState";

export default function RoleNotice({ userId }: { userId?: string }) {
  const { t } = useLocale();
  return (
    <main className="flex min-h-screen items-center bg-[var(--ni-bg)] px-5 py-16">
      <div className="mx-auto w-full max-w-xl ni-ed-card p-8">
        <div aria-hidden="true" className="ni-stripe -mx-8 -mt-8 mb-7" />
        <UserX size={26} className="ni-t-clay-ink" aria-hidden="true" />
        <p className="ni-label mt-5">{t("auth.roleNoticeEyebrow")}</p>
        <h1 className="mt-3 font-display text-3xl leading-tight ni-t-ink" role="alert">{t("auth.roleNotAssignedTitle")}</h1>
        <p className="mt-4 text-sm leading-6 ni-t-muted">{t("auth.roleNotAssignedCopy")}</p>
        {userId && (
          <p className="mt-4 rounded-[7px] border border-[var(--ni-sage-line)] bg-[var(--ni-field)] px-3 py-2.5 text-xs ni-t-muted">
            <span className="ni-label block">{t("auth.roleNoticeReference")}</span>
            <span className="mt-1 block ltr-embed">{userId}</span>
          </p>
        )}
        <Link href="/" className="ni-btn ni-btn--primary mt-7">{t("auth.roleNoticeHome")}</Link>
      </div>
    </main>
  );
}
