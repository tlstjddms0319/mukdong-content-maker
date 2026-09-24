"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { logout } from "@/features/auth/actions";

export type WizardStep = "topic" | "image" | "copy" | "review";

const steps: Array<{ id: WizardStep; label: string }> = [
  { id: "topic", label: "1 주제" },
  { id: "image", label: "2 이미지" },
  { id: "copy", label: "3 문안" },
  { id: "review", label: "4 확인" },
];

export function WizardShell({ step, children, canVisit=[], onStepChange, section="create" }: { step: WizardStep; children: ReactNode; canVisit?:WizardStep[]; onStepChange?:(step:WizardStep)=>void; section?:"create"|"drafts"|"images"|"library"|"settings"|"help" }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="묵동 콘텐츠 메이커 홈">
          <span className="brand-mark" aria-hidden="true" />
          묵동 콘텐츠 메이커
        </Link>
        <div className="topbar-actions">
          <Link className="button secondary" aria-current={section==="help"?"page":undefined} href="/help">도움말</Link>
          <form action={logout}><button className="button secondary" type="submit">로그아웃</button></form>
        </div>
      </header>
      <div className="shell-body">
        <nav className="side-nav" aria-label="주요 메뉴">
          <Link className={section==="create"?"active":undefined} aria-current={section==="create"?"page":undefined} href="/">새 초안</Link>
          <Link className={section==="drafts"?"active":undefined} aria-current={section==="drafts"?"page":undefined} href="/drafts">내 초안</Link>
          <Link className={section==="images"?"active":undefined} aria-current={section==="images"?"page":undefined} href="/images">이미지 제작실</Link>
          <Link className={section==="library"?"active":undefined} aria-current={section==="library"?"page":undefined} href="/library">콘텐츠 자료</Link>
          <Link className={section==="settings"?"active":undefined} aria-current={section==="settings"?"page":undefined} href="/settings">설정</Link>
        </nav>
        <main className="main-content">
          {section==="create"&&<ol className="step-list" aria-label="제작 단계">
            {steps.map((item) => (
              <li key={item.id} aria-current={item.id === step ? "step" : undefined}>
                <button type="button" disabled={!onStepChange||!canVisit.includes(item.id)} onClick={()=>onStepChange?.(item.id)}>{item.label}</button>
              </li>
            ))}
          </ol>}
          {children}
        </main>
      </div>
    </div>
  );
}
