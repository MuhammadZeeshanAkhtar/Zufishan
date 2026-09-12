/**
 * Instructor Dashboard → Find Students.
 *
 * The page that was missing. `DiscoverableLearners` and the server procedure
 * behind it both already existed and were already correct — the list had simply
 * never been given a route, so the "Find Students" links pointed at the
 * requirements desk to avoid a dead link. This gives them somewhere real to go.
 *
 * All this file adds is the shell: the route guard, the heading, and the human
 * check. The list, the cards, the search and the result states are the existing
 * component, unchanged in behaviour.
 *
 * ACCESS IS DECIDED TWICE, IN TWO PLACES. `ProtectedRoute role="instructor"`
 * keeps the interface away from anyone else, and that is a convenience, not a
 * boundary — `listDiscoverableLearners` independently refuses any caller who
 * does not hold the instructor role, and RLS policy 0025 independently refuses
 * to return an unpublished learner row to anyone at all. A learner who typed this
 * URL would get the guard; a learner who called the procedure directly would get
 * the refusal; a learner who somehow got past both would still read nothing.
 */
import { useRef } from "react";
import { useLocale } from "../contexts/LocaleContextState";
import { useGsapReveal } from "../lib/use-gsap-reveal";
import DiscoverableLearners from "./DiscoverableLearners";
import HumanVerificationGate from "./HumanVerificationGate";

export default function FindStudentsPage() {
  const { t } = useLocale();
  const reveal = useRef<HTMLDivElement | null>(null);
  useGsapReveal(reveal);

  return (
    <div className="mx-auto max-w-6xl px-5 py-6 lg:px-6 lg:py-8">
      <div ref={reveal} data-anim="section">

        {/* The token this yields is sent with the query and checked on the server.
            When no provider is configured it yields undefined and says so. */}
        <HumanVerificationGate>
          {(token) => <DiscoverableLearners humanToken={token} />}
        </HumanVerificationGate>
      </div>
    </div>
  );
}
