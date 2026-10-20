import { SettingsCategoryPage } from "@/components/settings/SettingsCategoryPage";

/** 设置的一级（`/settings`）：手机上只露 layout 里的一级列表；电脑上右栏是档案，网址不变。 */
export default function SettingsHome() {
  return <SettingsCategoryPage category="profile" />;
}
