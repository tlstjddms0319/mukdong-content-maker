import { WizardShell } from "@/components/wizard/WizardShell";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { InstagramConnectionCard } from "@/components/settings/InstagramConnectionCard";
import { StorageCheckCard } from "@/components/settings/StorageCheckCard";
import { DEFAULT_SETTINGS } from "@/features/settings/defaults";
import { AppSettingsSchema } from "@/features/settings/schema";
import { readSettings } from "@/features/settings/repository";
import { requireOwnerPage } from "@/features/auth/guard";

export const dynamic = "force-dynamic";

export default async function SettingsPage(){await requireOwnerPage();const settings=await readSettings().catch(()=>AppSettingsSchema.parse(DEFAULT_SETTINGS));return <WizardShell step="topic" section="settings"><p className="eyebrow">설정</p><h1>처음에는 그대로, 필요할 때만 바꿔요</h1><p className="lead">지금 실제로 적용되는 설정만 바꿀 수 있어요.</p><InstagramConnectionCard/><StorageCheckCard/><SettingsForm initialSettings={settings} connections={{gemini:Boolean(process.env.GEMINI_API_KEY),groq:Boolean(process.env.GROQ_API_KEY),cloudflare:Boolean(process.env.CLOUDFLARE_ACCOUNT_ID&&process.env.CLOUDFLARE_API_TOKEN),openai:Boolean(process.env.OPENAI_API_KEY),higgsfield:Boolean(process.env.HF_API_KEY_ID?.trim()&&process.env.HF_API_KEY_SECRET?.trim())}}/></WizardShell>}
