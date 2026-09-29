"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type AppLocale = "bn" | "en";

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  pick: (bangla: string, english: string) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<AppLocale>(() => {
    if (typeof window === "undefined") return "bn";
    const saved = window.localStorage.getItem("family-locale");
    return saved === "en" ? "en" : "bn";
  });

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem("family-locale", locale);
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale,
    pick: (bangla, english) => locale === "bn" ? bangla : english,
  }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("useLocale must be used inside LocaleProvider");
  return value;
}
