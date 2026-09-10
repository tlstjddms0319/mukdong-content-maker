import { WizardShell } from "@/components/wizard/WizardShell";

export default function HomePage() {
  return (
    <WizardShell step="topic">
      <p className="eyebrow">새 게시물</p>
      <h1>오늘은 어떤 이야기로 가게를 소개할까요?</h1>
      <p className="lead">추천 주제를 고르거나 직접 입력해 주세요.</p>
    </WizardShell>
  );
}
