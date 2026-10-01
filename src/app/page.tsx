import { DraftWizard } from "@/components/wizard/DraftWizard";
import { readSettings } from "@/features/settings/repository";
import { requireOwnerPage } from "@/features/auth/guard";
import { InstagramConnectPrompt } from "@/components/settings/InstagramConnectPrompt";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requireOwnerPage();
  const settings=await readSettings();
  return <><InstagramConnectPrompt/><DraftWizard slideCount={settings.carouselSlideCount} /></>;
}
