import { DraftWizard } from "@/components/wizard/DraftWizard";
import { requireOwnerPage } from "@/features/auth/guard";
import { InstagramConnectPrompt } from "@/components/settings/InstagramConnectPrompt";
import { StorageWarning } from "@/components/states/StorageWarning";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requireOwnerPage();
  // 장 수는 갈래가 정하므로(5장) 만들기 화면은 설정을 읽지 않는다.
  return <><StorageWarning/><InstagramConnectPrompt/><DraftWizard /></>;
}
