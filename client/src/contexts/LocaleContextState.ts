import { createContext, useContext } from "react";
import type { Locale, TranslationKey } from "@/i18n/catalog";

export type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: string) => void;
  dir: "ltr" | "rtl";
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
  formatDate: (value: Date | number | string, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (minorAmount: number, currency?: string) => string;
};

export const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used within LocaleProvider");
  return value;
}
