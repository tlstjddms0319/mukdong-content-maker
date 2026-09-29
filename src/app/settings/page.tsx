import { WizardShell } from "@/components/wizard/WizardShell";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { readSettings } from "@/features/settings/repository";
import { requireOwnerPage } from "@/features/auth/guard";

export const dynamic = "force-dynamic";

export default async function SettingsPage(){await requireOwnerPage();const settings=await readSettings();return <WizardShell step="topic" section="settings"><p className="eyebrow">설정</p><h1>처음에는 그대로, 필요할 때만 바꿔요</h1><p className="lead">지금 실제로 적용되는 설정만 바꿀 수 있어요.</p><div className="state-card"><strong>Instagram 앱에서 직접 게시해요.</strong><p>최종 화면에서 해시태그·음악 검색어·게시 순서를 확인하고 파일을 내려받을 수 있어요.</p></div><SettingsForm initialSettings={settings} connections={{gemini:Boolean(process.env.GEMINI_API_KEY),groq:Boolean(process.env.GROQ_API_KEY),cloudflare:Boolean(process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN),openai:Boolean(process.env.OPENAI_API_KEY)}}/></WizardShell>}
