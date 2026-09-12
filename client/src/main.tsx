import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { supabaseClient } from "./lib/supabase-client";
import { goToSignIn } from "./const";
import { assertJsonResponse } from "./lib/api-response";
import { bootTheme } from "./lib/theme";
import "./index.css";
import { startHeaderScrollState, startRevealOnScroll } from "./lib/reveal-on-scroll";

const queryClient = new QueryClient();

/**
 * Sends an unauthorised caller to sign in.
 *
 * This used to call `startLogin()`, which built the Manus OAuth portal URL
 * unconditionally. That portal is not configured in this app — Supabase is the
 * authentication provider — so the URL was constructed from the literal string
 * "undefined" and threw. Because this runs from a react-query cache subscriber,
 * the throw escaped into whatever screen had just made a request, and an expired
 * token in the Course Builder read as "Failed to construct 'URL': Invalid URL".
 *
 * It now navigates to `/login`, which is the route this app actually has, and
 * cannot throw: every URL it touches goes through the safe-url layer.
 */
const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;
  if (error.message !== UNAUTHED_ERR_MSG) return;
  goToSignIn();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      async headers() {
        // Preview auto-login fallback: when the browser blocks iframe cookies
        // (Safari ITP / private browsing / WebView), the runtime mirrors the
        // session into sessionStorage so we can forward it as a Bearer token.
        // The regular OAuth cookie flow keeps working and takes priority server-side.
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) {
              return { Authorization: `Bearer ${token}` };
            }
          }
        } catch {
          // sessionStorage unavailable
        }
        try {
          const { data } = await supabaseClient?.auth.getSession() ?? { data: { session: null } };
          const token = data.session?.access_token;
          if (token) return { Authorization: `Bearer ${token}` };
        } catch {
          // Supabase session unavailable; public/demo mode remains usable.
        }
        return {};
      },
      // One guard for every procedure. A reply that is not JSON — an SPA fallback, a proxy error
      // page, a login redirect — is turned into a readable failure here rather than reaching
      // JSON.parse and surfacing as `Unexpected token '<'` with no route and no status.
      async fetch(input, init) {
        const response = await globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
        return assertJsonResponse(response, input);
      },
    }),
  ],
});

// Before the first paint: otherwise the page renders light and corrects itself,
// which is a flash seen worst by exactly the people who chose dark.
bootTheme();

// Presentation only: scroll reveal and the header glass state. Neither touches data,
// routing or state, and both no-op under prefers-reduced-motion.
startRevealOnScroll();
startHeaderScrollState();

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
