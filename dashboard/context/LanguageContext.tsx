"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { fr } from "@/locales/fr";
import { en } from "@/locales/en";
import { es } from "@/locales/es";

export type Language = "fr" | "en" | "es";

type Translations = typeof fr;

interface LanguageContextType {
  currentLanguage: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  translations: Translations;
}

const LanguageContext = createContext<LanguageContextType>({
  currentLanguage: "fr",
  setLanguage: () => {},
  t: () => "",
  translations: fr,
});

const translationsMap: Record<Language, Translations> = {
  fr,
  en,
  es,
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [currentLanguage, setCurrentLanguage] = useState<Language>("fr");
  const [mounted, setMounted] = useState(false);

  // Load saved language from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const savedLanguage = localStorage.getItem("language") as Language;
    if (savedLanguage && (savedLanguage === "fr" || savedLanguage === "en" || savedLanguage === "es")) {
      setCurrentLanguage(savedLanguage);
    }
  }, []);

  // Save language to localStorage when it changes
  const setLanguage = (lang: Language) => {
    setCurrentLanguage(lang);
    if (mounted) {
      localStorage.setItem("language", lang);
    }
  };

  // Translation function with nested key support (e.g., "sidebar.dashboard")
  const t = (key: string): string => {
    const keys = key.split(".");
    let value: any = translationsMap[currentLanguage];

    for (const k of keys) {
      if (value && typeof value === "object" && k in value) {
        value = value[k];
      } else {
        // Fallback to French if translation not found
        value = translationsMap["fr"];
        for (const k of keys) {
          if (value && typeof value === "object" && k in value) {
            value = value[k];
          } else {
            return key; // Return key itself if not found
          }
        }
        break;
      }
    }

    return typeof value === "string" ? value : key;
  };

  return (
    <LanguageContext.Provider
      value={{
        currentLanguage,
        setLanguage,
        t,
        translations: translationsMap[currentLanguage],
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
