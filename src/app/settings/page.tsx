import { WizardShell } from "@/components/wizard/WizardShell";
import { SettingsForm } from "@/components/settings/SettingsForm";
import { readSettings } from "@/features/settings/repository";

export default async function SettingsPage(){const settings=await readSettings();return <WizardShell step="topic"><p className="eyebrow">설정</p><h1>처음에는 그대로, 필요할 때만 바꿔요</h1><p className="lead">권장값으로 자동 진행되며 여기서 모든 세부 항목을 조정할 수 있어요.</p><SettingsForm initialSettings={settings} aiConnected={Boolean(process.env.OPENAI_API_KEY)}/></WizardShell>}
