import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "@/i18n/en";
import { es } from "@/i18n/es";

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: "es",
  fallbackLng: "es",
  interpolation: { escapeValue: false },
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: import.meta.env.DEV
    ? (_lngs, _ns, key) => console.warn(`[i18n] missing translation key: ${key}`)
    : undefined,
});

export default i18n;
