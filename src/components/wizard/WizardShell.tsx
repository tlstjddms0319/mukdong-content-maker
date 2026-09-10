import type { ReactNode } from "react";

export type WizardStep = "topic" | "image" | "copy" | "review";

const steps: Array<{ id: WizardStep; label: string }> = [
  { id: "topic", label: "1 주제" },
  { id: "image", label: "2 이미지" },
  { id: "copy", label: "3 문안" },
  { id: "review", label: "4 확인" },
];

export function WizardShell({ step, children }: { step: WizardStep; children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="묵동 콘텐츠 메이커 홈">
          <span className="brand-mark" aria-hidden="true" />
          묵동 콘텐츠 메이커
        </a>
        <a className="button secondary" href="/help">도움말</a>
      </header>
      <div className="shell-body">
        <nav className="side-nav" aria-label="주요 메뉴">
          <a className="active" href="/">새 초안</a>
          <a href="/drafts">내 초안</a>
          <a href="/images">이미지 제작실</a>
          <a href="/library">콘텐츠 자료</a>
          <a href="/settings">설정</a>
        </nav>
        <main className="main-content">
          <ol className="step-list" aria-label="제작 단계">
            {steps.map((item) => (
              <li key={item.id} aria-current={item.id === step ? "step" : undefined}>
                {item.label}
              </li>
            ))}
          </ol>
          {children}
        </main>
      </div>
    </div>
  );
}
