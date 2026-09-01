export type ProductionConfigEnv = Record<string, string | undefined>;

export type IntegrationStatus = {
  configured: boolean;
  requiredEnv: string[];
  note: string;
};

export type ProductionConfigReport = {
  mode: "production" | "development";
  fixturesEnabled: boolean;
  integrations: {
    supabaseAuth: IntegrationStatus;
    supabaseDatabase: IntegrationStatus;
    privateStorage: IntegrationStatus;
    realtime: IntegrationStatus;
    aiTutor: IntegrationStatus;
    classroom: IntegrationStatus;
    notifications: IntegrationStatus;
    payments: IntegrationStatus;
    payouts: IntegrationStatus;
  };
  productionBlockers: string[];
};

const present = (env: ProductionConfigEnv, keys: string[]) => keys.every((key) => Boolean(env[key]?.trim()));
const hasAny = (env: ProductionConfigEnv, keys: string[]) => keys.some((key) => Boolean(env[key]?.trim()));

export function getProductionConfigReport(env: ProductionConfigEnv = process.env): ProductionConfigReport {
  const supabaseServer = present(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  const supabaseBrowser = present(env, ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]);
  const supabase = supabaseServer && supabaseBrowser;
  const fixturesEnabled = !Boolean(env.NODE_ENV === "production") && env.VITE_ENABLE_TEST_FIXTURES === "true";
  const integrations = {
    supabaseAuth: { configured: supabase, requiredEnv: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"], note: "Supabase Auth is the only supported production identity source." },
    supabaseDatabase: { configured: supabaseServer, requiredEnv: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], note: "Server procedures must use the bearer-scoped user client for user data." },
    privateStorage: { configured: supabaseServer, requiredEnv: ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"], note: "Private buckets require signed access and policy checks." },
    realtime: { configured: supabase, requiredEnv: ["SUPABASE_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"], note: "Realtime is unavailable until channel authorization and subscriptions are verified." },
    // Reports the variables the Gemini adapter in ai-tutor-provider.ts actually reads, so a
    // configured provider is not reported as a blocker (and vice versa). Names only, never values.
    aiTutor: { configured: present(env, ["GEMINI_API_KEY", "GEMINI_MODEL"]), requiredEnv: ["GEMINI_API_KEY", "GEMINI_MODEL"], note: "Language-only AI Tutor requests require an approved server-side provider. Both variables are server-only and must never be exposed to the browser." },
    classroom: { configured: Boolean(env.CLASSROOM_PROVIDER?.trim()) && hasAny(env, ["CLASSROOM_PROVIDER_API_KEY", "CLASSROOM_PROVIDER_TOKEN"]), requiredEnv: ["CLASSROOM_PROVIDER", "CLASSROOM_PROVIDER_API_KEY"], note: "Video sessions remain blocked until a provider is configured and verified." },
    notifications: { configured: Boolean(env.NOTIFICATION_PROVIDER?.trim()) && hasAny(env, ["NOTIFICATION_PROVIDER_API_KEY", "RESEND_API_KEY", "SENDGRID_API_KEY"]), requiredEnv: ["NOTIFICATION_PROVIDER", "NOTIFICATION_PROVIDER_API_KEY"], note: "Email/push delivery must be idempotent and provider-backed." },
    payments: { configured: Boolean(env.PAYMENT_PROVIDER?.trim()) && Boolean(env.PAYMENT_PROVIDER_SECRET?.trim()), requiredEnv: ["PAYMENT_PROVIDER", "PAYMENT_PROVIDER_SECRET"], note: "USD display is allowed; payment success is blocked until an approved provider is connected." },
    payouts: { configured: Boolean(env.PAYOUT_PROVIDER?.trim()) && Boolean(env.PAYOUT_PROVIDER_SECRET?.trim()), requiredEnv: ["PAYOUT_PROVIDER", "PAYOUT_PROVIDER_SECRET"], note: "Withdrawals must remain unavailable until a secure payout provider is connected." },
  } satisfies ProductionConfigReport["integrations"];
  const productionBlockers = Object.entries(integrations).filter(([, status]) => !status.configured).map(([name]) => name);
  return { mode: env.NODE_ENV === "production" ? "production" : "development", fixturesEnabled, integrations, productionBlockers };
}

export function canUseClientFixtures(env: ProductionConfigEnv = process.env) {
  return env.NODE_ENV !== "production" && env.VITE_ENABLE_TEST_FIXTURES === "true";
}
