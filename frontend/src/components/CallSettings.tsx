"use client";

import { useEffect, useId, useState } from "react";

import { SettingsSection } from "@/components/app/SettingsSection";
import { useSettingsValues } from "@/components/settings/SettingsValues";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { copy } from "@/i18n";
import {
  loadCallPreferences,
  QUALITY_LABELS,
  saveCallPreferences,
  type CallPreferences,
  type Quality,
} from "@/lib/callPreferences";
import { listMicrophones } from "@/lib/microphone";

const t = copy.settings.call;

/** 「系统默认」的麦克风在选择框里用这个值代表（选择框的值不用空字符串），存下来仍是空白。 */
const SYSTEM_DEFAULT = "system-default";

/**
 * 默认麦克风、通话音质和电话质感，记在这台设备上。通话中切换麦克风也会改掉这里的默认。改了就告诉设置的 layout，一级「通话」的摘要跟着变。
 * 选择框里当前的一项铺中性的 bg-muted（在 ui/select 里），不用她的颜色。
 */
export function CallSettings() {
  const [preferences, setPreferences] = useState<CallPreferences | null>(null);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  const [micError, setMicError] = useState("");
  const id = useId();
  const { callChanged } = useSettingsValues();

  useEffect(() => {
    setPreferences(loadCallPreferences());
    if (!navigator.mediaDevices?.enumerateDevices) return;
    listMicrophones().then(setMics, () => {});
  }, []);

  // 页面获准使用麦克风之前，浏览器不给出麦克风的名称。
  const unnamed = mics.length > 0 && mics.every((m) => !m.label);
  // 默认麦克风现在没有连接：仍然留着它，插回去下次通话就用它；这之前通话用系统默认。
  const missing =
    !!preferences?.micId && mics.length > 0 && !unnamed && !mics.some((m) => m.deviceId === preferences.micId);

  async function allowMicrophone() {
    setMicError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      setMics(await listMicrophones());
    } catch {
      setMicError(t.micDenied);
    }
  }

  function update(change: Partial<CallPreferences>) {
    const next = saveCallPreferences(change);
    setPreferences(next);
    callChanged(next);
  }

  if (!preferences) return null;

  const micOptions = [
    { value: SYSTEM_DEFAULT, label: t.micDefault },
    ...mics.map((mic, i) => ({ value: mic.deviceId, label: mic.label || t.micNumbered(i + 1) })),
    ...(missing ? [{ value: preferences.micId, label: t.micMissing }] : []),
  ];
  const qualityOptions = (Object.keys(QUALITY_LABELS) as Quality[]).map((value) => ({
    value,
    label: t.qualities[value],
  }));

  return (
    <SettingsSection>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`${id}-mic`}>{t.mic}</FieldLabel>
          <Select
            items={micOptions}
            value={preferences.micId || SYSTEM_DEFAULT}
            onValueChange={(value) => update({ micId: value === SYSTEM_DEFAULT || !value ? "" : value })}
          >
            <SelectTrigger id={`${id}-mic`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {micOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{t.micHint}</FieldDescription>
          {(unnamed || micError) && (
            <div className="flex flex-col items-start gap-2">
              <p className="text-subtitle text-muted-foreground" role={micError ? "alert" : undefined}>
                {micError || t.micUnnamed}
              </p>
              <Button size="sm" onClick={allowMicrophone}>
                {t.micAllow}
              </Button>
            </div>
          )}
        </Field>

        <Field>
          <FieldLabel htmlFor={`${id}-quality`}>{t.quality}</FieldLabel>
          <Select
            items={qualityOptions}
            value={preferences.quality}
            onValueChange={(value) => value && update({ quality: value as Quality })}
          >
            <SelectTrigger id={`${id}-quality`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {qualityOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{t.qualityHint}</FieldDescription>
        </Field>

        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={`${id}-texture`}>{t.phoneTexture}</FieldLabel>
            <FieldDescription>{t.phoneTextureHint}</FieldDescription>
          </FieldContent>
          <Switch
            id={`${id}-texture`}
            checked={preferences.phoneTexture}
            onCheckedChange={(phoneTexture) => update({ phoneTexture })}
          />
        </Field>
      </FieldGroup>
    </SettingsSection>
  );
}
