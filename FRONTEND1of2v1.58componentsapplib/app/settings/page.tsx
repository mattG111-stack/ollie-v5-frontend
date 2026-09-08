"use client";

import AppShell from "@/components/AppShell";
import AssistantKeySettings from "@/components/AssistantKeySettings";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";

export default function SettingsPage() {
  return (
    <AppShell>
      <Inner />
    </AppShell>
  );
}

function Inner() {
  const { me } = useAuth();
  const { t } = useT();
  return (
    <div className="px-7 py-6 max-w-4xl">
      <div className="mb-5">
        <h1 className="font-display text-2xl font-semibold">{t("settings.title")}</h1>
        <p className="text-sm text-muted">{t("settings.subtitle")}</p>
      </div>

      <div className="bg-white border border-line rounded-card shadow-soft p-6 mb-5">
        <h2 className="font-display font-semibold text-base mb-4">{t("settings.profile")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t("settings.fullName")} defaultValue={me?.full_name ?? ""} />
          <Field label={t("settings.company")} defaultValue={me?.company ?? ""} />
          <Field label={t("settings.email")} defaultValue={me?.email ?? ""} type="email" />
          <Field label={t("settings.phone")} defaultValue={me?.phone ?? ""} type="tel" />
        </div>
        <button className="bg-blue text-white hover:bg-blue-dark px-5 py-2.5 rounded-lg font-semibold mt-5 text-sm">
          {t("settings.saveProfile")}
        </button>
      </div>

      <div className="bg-white border border-line rounded-card shadow-soft p-6">
        <h2 className="font-display font-semibold text-base mb-4">{t("settings.password")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t("settings.currentPassword")} type="password" placeholder="••••••••" />
          <span />
          <Field label={t("settings.newPassword")} type="password" placeholder="••••••••" />
          <Field label={t("settings.confirmPassword")} type="password" placeholder="••••••••" />
        </div>
        <button className="bg-blue text-white hover:bg-blue-dark px-5 py-2.5 rounded-lg font-semibold mt-5 text-sm">
          {t("settings.updatePassword")}
        </button>
      </div>
      <AssistantKeySettings />
    </div>
  );
}

function Field({
  label,
  defaultValue,
  type = "text",
  placeholder,
}: {
  label: string;
  defaultValue?: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-faint font-semibold">{label}</span>
      <input
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="bg-paper border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue"
      />
    </label>
  );
}
