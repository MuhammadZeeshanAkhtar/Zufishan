export type ServiceState = "demo" | "setup_needed" | "forbidden" | "offline" | "not_enough_data" | "coming_soon";

const privatePrefixes = ["/dashboard", "/admin", "/messages", "/trial", "/enrol", "/settings", "/onboarding", "/login", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/logout"] as const;

export function isPrivateSurface(pathname: string) {
  return privatePrefixes.some((prefix) => pathname.startsWith(prefix));
}

export function isIndexablePublicPath(pathname: string, knownPublic: boolean) {
  return knownPublic && !isPrivateSurface(pathname);
}

export function getServiceStateCopy(state: ServiceState) {
  const copy: Record<ServiceState, string> = {
    demo: "Demo mode: this flow is local until the connected service is configured.",
    setup_needed: "Setup needed: the connected service is not available in this environment.",
    forbidden: "This area is protected and is not available to this account.",
    offline: "This action needs a connection. Nothing was changed locally.",
    not_enough_data: "Not enough connected data is available to show a reliable result.",
    coming_soon: "Coming soon: this boundary is reserved for a future connected service.",
  };
  return copy[state];
}
