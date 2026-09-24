/**
 * The two values the browser needs to reach Supabase, under either name.
 *
 * Supabase renamed the anonymous key: what its dashboard used to call the **anon key** it now
 * calls the **publishable key**. It is one value with two names, and which one you meet depends on
 * how old the project is and which page of the dashboard you copied it from.
 *
 * This project reads `VITE_SUPABASE_PUBLISHABLE_KEY`. A deployment configured with
 * `VITE_SUPABASE_ANON_KEY` — which is what most guides still say, and what the Supabase docs said
 * until recently — therefore produced no client at all, and the whole application fell back to its
 * "Supabase is not configured" path: every sign-in refused, with nothing on screen to suggest the
 * cause was a variable name.
 *
 * So both names are accepted, with the current one preferred when both are set. This changes
 * nothing about what is sent or stored; it only means the same key works whichever name it arrived
 * under.
 *
 * ONLY THESE TWO. The publishable key is designed to be public — it identifies the project and
 * every request it makes is still subject to RLS. The service-role key is not, it bypasses RLS
 * entirely, and `import.meta.env` inlines whatever it touches into a file anybody can read. So no
 * `VITE_`-prefixed secret is read here, and nothing else in the client reads one either.
 */
type ViteEnv = Record<string, unknown>;

const read = (env: ViteEnv, name: string) => {
  const value = env[name];
  return typeof value === "string" ? value.trim() : "";
};

/** The project URL. One name; it was never renamed. */
export function supabaseUrlFrom(env: ViteEnv = import.meta.env as unknown as ViteEnv): string {
  return read(env, "VITE_SUPABASE_URL");
}

/**
 * The publishable (formerly anon) key.
 *
 * The current name wins when both are set, so a deployment that has been migrated is not dragged
 * back to whatever the old variable still holds.
 */
export function supabasePublishableKeyFrom(env: ViteEnv = import.meta.env as unknown as ViteEnv): string {
  return read(env, "VITE_SUPABASE_PUBLISHABLE_KEY") || read(env, "VITE_SUPABASE_ANON_KEY");
}
