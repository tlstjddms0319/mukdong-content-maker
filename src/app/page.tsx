import { DraftWizard } from "@/components/wizard/DraftWizard";
import { readSettings } from "@/features/settings/repository";
import { requireOwnerPage } from "@/features/auth/guard";
import { InstagramConnectPrompt } from "@/components/settings/InstagramConnectPrompt";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";
import { StorageWarning } from "@/components/states/StorageWarning";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requireOwnerPage();
  // 설정을 못 읽어도(저장소 오류) 만들기 화면은 기본 설정으로 연다.
  const settings=await readSettings().catch(error=>{console.warn("[settings] 설정을 읽지 못해 기본값으로 엽니다:",error instanceof Error?error.message:String(error));return DEFAULT_SETTINGS;});
  return <><StorageWarning/><InstagramConnectPrompt/><DraftWizard slideCount={settings.carouselSlideCount} /></>;
}
