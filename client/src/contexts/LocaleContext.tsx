import { useEffect, useMemo, useState } from "react";
import { catalogs, localeCodes, type Locale } from "@/i18n/catalog";
import { LocaleContext, type LocaleContextValue } from "./LocaleContextState";
import { supabaseClient } from "@/lib/supabase-client";

const STORAGE_KEY = "noor-ilm-locale";
const COOKIE_KEY = "noor_ilm_locale";
const rtlLocales: Locale[] = ["ur", "ar"];

const isLocale = (value: string | null): value is Locale => Boolean(value && (localeCodes as readonly string[]).includes(value));
const readInitialLocale = (): Locale => {
  if (typeof window === "undefined") return "en";
  const urlLocale = new URLSearchParams(window.location.search).get("lang");
  if (isLocale(urlLocale)) return urlLocale;
  const saved = window.localStorage.getItem(STORAGE_KEY);
  return isLocale(saved) ? saved : "en";
};

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);
  const dir = rtlLocales.includes(locale) ? "rtl" : "ltr";
  const setLocale = (value: string) => {
    const nextLocale = isLocale(value) ? value : "en";
    setLocaleState(nextLocale);
    const client = supabaseClient;
    if (!client) return;
    void client.auth.getUser().then(({ data }) => {
      const userId = data.user?.id;
      if (!userId) return;
      return client.from("profiles").update({ preferred_locale: nextLocale }).eq("id", userId);
    }).catch(() => undefined);
  };
  useEffect(() => {
    const previewRtl = new URLSearchParams(window.location.search).get("rtl") === "1";
    document.documentElement.lang = previewRtl ? (locale === "en" ? "ur" : locale) : locale;
    document.documentElement.dir = previewRtl ? "rtl" : dir;
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.cookie = `${COOKIE_KEY}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`;
  }, [locale, dir]);
  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale,
    dir,
    t: (key, values) => {
      const catalogue = catalogs[locale];
      let text = catalogue[key] || catalogs.en[key] || key;
      if (import.meta.env.DEV && !catalogue[key]) console.warn(`[i18n] Missing ${locale} translation: ${key}`);
      Object.entries(values || {}).forEach(([name, replacement]) => { text = text.replaceAll(`{${name}}`, String(replacement)); });
      return text;
    },
    formatDate: (value, options) => new Intl.DateTimeFormat(locale, options).format(new Date(value)),
    formatNumber: (value, options) => new Intl.NumberFormat(locale, options).format(value),
    formatCurrency: (minorAmount, currency = "USD") => new Intl.NumberFormat(locale, { style: "currency", currency, currencyDisplay: "code" }).format(minorAmount / 100),
  }), [locale, dir]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

