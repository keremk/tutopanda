import { getProjectSettings } from "@/data/project";
import { getSession } from "@/lib/session";
import { SettingsPageContent } from "@/components/settings-page-content";

export default async function SettingsPage() {
  const { user } = await getSession();
  const settings = await getProjectSettings(user.id);

  return <SettingsPageContent settings={settings} />;
}
