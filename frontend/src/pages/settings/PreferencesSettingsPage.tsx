import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/store/authStore";
import { useUpdateUser } from "@/hooks/useUsers";
import { ErrorMessage } from "@/components/common/ErrorMessage";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { formatDate } from "@/lib/dateFormat";
import type { DateFormat, Language } from "@/types/api";

const PREVIEW_DATE = "2026-12-31";

export function PreferencesSettingsPage() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const updateUserInStore = useAuthStore((s) => s.updateUser);
  const updateUser = useUpdateUser();

  const [language, setLanguage] = useState<Language>(user?.language ?? "es");
  const [dateFormat, setDateFormat] = useState<DateFormat>(user?.date_format ?? "dmy");
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  function handleSave() {
    updateUser.mutate(
      { id: user!.id, payload: { language, date_format: dateFormat } },
      {
        onSuccess: (updated) => {
          updateUserInStore(updated);
          void i18n.changeLanguage(updated.language);
          setSaved(true);
        },
      },
    );
  }

  return (
    <div className="max-w-lg">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-jira-text">{t("settings.preferences.title")}</h1>
        <p className="text-sm text-jira-textSub">{t("settings.preferences.subtitle")}</p>
      </div>

      <Card>
        <Card.Body className="space-y-4">
          <div>
            <label className="label" htmlFor="language">
              {t("settings.preferences.language")}
            </label>
            <select
              id="language"
              className="input"
              value={language}
              onChange={(e) => {
                setLanguage(e.target.value as Language);
                setSaved(false);
              }}
            >
              <option value="es">{t("settings.preferences.spanish")}</option>
              <option value="en">{t("settings.preferences.english")}</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="date_format">
              {t("settings.preferences.dateFormat")}
            </label>
            <select
              id="date_format"
              className="input"
              value={dateFormat}
              onChange={(e) => {
                setDateFormat(e.target.value as DateFormat);
                setSaved(false);
              }}
            >
              <option value="dmy">{t("settings.preferences.dateFormatDmy")}</option>
              <option value="iso">{t("settings.preferences.dateFormatIso")}</option>
            </select>
            <p className="mt-1 text-xs text-jira-textSub">
              {t("settings.preferences.preview")}: {formatDate(PREVIEW_DATE, dateFormat)}
            </p>
          </div>

          <ErrorMessage error={updateUser.error} />
          {saved && !updateUser.isPending && (
            <p className="text-sm text-jira-greenBadgeText">{t("settings.preferences.saved")}</p>
          )}

          <div className="flex justify-end">
            <Button variant="primary" onClick={handleSave} loading={updateUser.isPending}>
              {t("common.save")}
            </Button>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}
