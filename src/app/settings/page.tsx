import { WizardShell } from "@/components/wizard/WizardShell";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { readSettings } from "@/features/settings/repository";
import { requireOwnerPage } from "@/features/auth/guard";

export const dynamic = "force-dynamic";

export default async function SettingsPage(){await requireOwnerPage();const settings=await readSettings();return <WizardShell step="topic" section="settings"><p className="eyebrow">설정</p><h1>처음에는 그대로, 필요할 때만 바꿔요</h1><p className="lead">지금 실제로 적용되는 설정만 바꿀 수 있어요.</p><div className="state-card"><strong>게시 연동은 추후 단계에서 설정해요.</strong><p>초안을 만들고 내려받는 기능은 계정 연결 없이 사용할 수 있어요.</p></div><SettingsForm initialSettings={settings} connections={{gemini:Boolean(process.env.GEMINI_API_KEY),cloudflare:Boolean(process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN),openai:Boolean(process.env.OPENAI_API_KEY)}}/></WizardShell>}
