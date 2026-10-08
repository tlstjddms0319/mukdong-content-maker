import { WizardShell } from "@/components/wizard/WizardShell";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { InstagramConnectionCard } from "@/components/settings/InstagramConnectionCard";
import { AiCheckCard } from "@/components/settings/AiCheckCard";
import { AiUsageCard } from "@/components/settings/AiUsageCard";
import { PosterCard } from "@/components/settings/PosterCard";
import { naverConfigured } from "@/features/topics/naverTrend";
import { StorageCheckCard } from "@/components/settings/StorageCheckCard";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";
import { AppSettingsSchema } from "@/features/settings/schema";
import { readSettings } from "@/features/settings/repository";
import { requireOwnerPage } from "@/features/auth/guard";

export const dynamic = "force-dynamic";

// 설정: 사장님에게는 인스타그램 연결과 브랜드 키트만 보인다. 저장소·AI 점검·사용량·포스터·게시 서버 같은 기술 항목은
// SettingsForm의 접힌 "관리자용 설정" 안에 넣는다(간소화 계획 B).
export default async function SettingsPage(){
  await requireOwnerPage();
  const settings=await readSettings().catch(()=>AppSettingsSchema.parse(DEFAULT_SETTINGS));
  const keys={gemini:Boolean(process.env.GEMINI_API_KEY),groq:Boolean(process.env.GROQ_API_KEY),cloudflare:Boolean(process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN),openai:Boolean(process.env.OPENAI_API_KEY),higgsfield:Boolean(process.env.HF_API_KEY_ID?.trim()&&process.env.HF_API_KEY_SECRET?.trim())};
  return <WizardShell step="topic" section="settings">
    <h1>설정</h1>
    <p className="lead">인스타그램 연결과 가게 계정만 확인하면 돼요.</p>
    <InstagramConnectionCard/>
    <SettingsForm initialSettings={settings} connections={{...keys,naver:naverConfigured()}} adminCards={<><InstagramConnectionCard part="server"/><StorageCheckCard/><AiCheckCard/><AiUsageCard connections={keys}/><PosterCard/></>}/>
  </WizardShell>;
}
