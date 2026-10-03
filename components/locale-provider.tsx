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
  // The server and the first browser render must use the same language.
  const [locale, setLocale] = useState<AppLocale>("bn");
  const [preferenceLoaded, setPreferenceLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem("family-locale");
    } catch {
      // A blocked storage API must not prevent the language switcher from working.
    }
    queueMicrotask(() => {
      if (!active) return;
      if (saved === "en") setLocale("en");
      setPreferenceLoaded(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    if (!preferenceLoaded) return;
    try {
      window.localStorage.setItem("family-locale", locale);
    } catch {
      // The in-memory choice still applies when browser storage is unavailable.
    }
  }, [locale, preferenceLoaded]);

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
