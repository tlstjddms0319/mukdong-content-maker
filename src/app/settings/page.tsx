import { WizardShell } from "@/components/wizard/WizardShell";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { InstagramConnectionCard } from "@/components/settings/InstagramConnectionCard";
import { readSettings } from "@/features/settings/repository";
import { requireOwnerPage } from "@/features/auth/guard";

export const dynamic = "force-dynamic";

export default async function SettingsPage(){await requireOwnerPage();const settings=await readSettings();return <WizardShell step="topic" section="settings"><p className="eyebrow">설정</p><h1>처음에는 그대로, 필요할 때만 바꿔요</h1><p className="lead">권장값으로 자동 진행되며 여기서 모든 세부 항목을 조정할 수 있어요.</p><InstagramConnectionCard/><SettingsForm initialSettings={settings} connections={{gemini:Boolean(process.env.GEMINI_API_KEY),cloudflare:Boolean(process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN),openai:Boolean(process.env.OPENAI_API_KEY)}}/></WizardShell>}
