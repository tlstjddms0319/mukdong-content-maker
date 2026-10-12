"use client";

import { useEffect,useRef,type ReactNode } from "react";
import Link from "next/link";
import { logout } from "@/features/auth/actions";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { GenerationBadge } from "./GenerationBadge";
import { NavIcon } from "./NavIcon";
import { DisplayControls } from "./DisplayControls";
import { NavPending } from "./NavPending";

// 만들기 3단계(간소화 계획 B). 예전 "3 문안" 단계는 없어졌다: 글은 자동으로 쓰이고 3단계에서 고친다.
// id "image"는 예전 이름 그대로 둔다(탭 세션·테스트가 쓰는 값). 화면에 보이는 이름만 "만들기"다.
export type WizardStep = "topic" | "image" | "review";

// short: 좁은 휴대폰(360px)에서 세 단계가 한 줄에 들어가게 쓰는 짧은 이름. 넓은 화면은 긴 이름 그대로.
// 버튼 이름(화면 읽기·시험)은 화면 폭과 상관없이 긴 이름 하나로 둔다(폭에 따라 이름이 바뀌지 않게).
const steps: Array<{ id: WizardStep; label: string; short: string }> = [
  { id: "topic", label: "1 무엇을 올릴까요", short: "1 주제" },
  { id: "image", label: "2 만들기", short: "2 만들기" },
  { id: "review", label: "3 확인하고 올리기", short: "3 올리기" },
];

type Section="create"|"drafts"|"images"|"library"|"settings"|"help"|"plan"|"performance";
// 자주 쓰는 메뉴 셋만 늘 보이게 두고, 가끔 쓰는 것은 "더보기" 안에 접어 둔다(사장님 결정: 고를 것을 줄인다).
const MAIN:Array<{section:Section;href:string;label:string}>=[
  {section:"create",href:"/",label:"만들기"},
  {section:"drafts",href:"/drafts",label:"내 게시물"},
  {section:"performance",href:"/performance",label:"성과"},
  {section:"settings",href:"/settings",label:"설정"},
];
const MORE:Array<{section:Section;href:string;label:string}>=[
  {section:"plan",href:"/plan",label:"한 달 계획"},
  {section:"library",href:"/library",label:"콘텐츠 자료"},
  {section:"images",href:"/images",label:"이미지 모음"},
  {section:"help",href:"/help",label:"도움말"},
];

// onCreateMenu: 만들기 화면 안에서 "만들기" 메뉴를 눌렀을 때 할 일. 같은 주소라 화면이 새로 열리지 않으므로,
// 만드는 중이면 위저드가 진행 화면으로 돌려보낼 수 있게 받는다(없으면 평소 링크).
export function WizardShell({ step, children, canVisit=[], onStepChange, onNewDraft, onCreateMenu, section="create" }: { step: WizardStep; children: ReactNode; canVisit?:WizardStep[]; onStepChange?:(step:WizardStep)=>void; onNewDraft?:()=>void; onCreateMenu?:()=>void; section?:Section }) {
  const more=useRef<HTMLDetailsElement>(null);
  const closeMore=()=>{if(more.current)more.current.open=false;};
  // 휴대폰의 더보기 판: Esc로도 닫는다(바깥 누르기는 아래 nav-more-backdrop이 맡는다).
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")closeMore();};
    window.addEventListener("keydown",onKey);
    return ()=>window.removeEventListener("keydown",onKey);
  },[]);
  const link=(item:{section:Section;href:string;label:string})=><Link key={item.href} className={section===item.section?"active":undefined} aria-current={section===item.section?"page":undefined} href={item.href} onClick={event=>{closeMore();if(item.section==="create"&&onCreateMenu){event.preventDefault();onCreateMenu();}}}><NavIcon name={item.section}/><span className="nav-label">{item.label}</span><NavPending/></Link>;
  const inMore=MORE.some(item=>item.section===section);
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="묵동 콘텐츠 메이커 홈">
          <BrandLogo size={36} />
          <span className="brand-name">묵동 콘텐츠 메이커</span>
        </Link>
        <div className="topbar-actions">
          <DisplayControls/>
          <form action={logout}><button className="button secondary" type="submit">로그아웃</button></form>
        </div>
      </header>
      <div className="shell-body">
        <nav className="side-nav" aria-label="주요 메뉴">
          {MAIN.slice(0,1).map(link)}
          <GenerationBadge />
          {MAIN.slice(1).map(link)}
          {/* 더보기: 지금 보고 있는 화면이 이 안에 있으면 "더보기"를 굵게 표시한다(휴대폰에서는 펼친 창이 화면을 가리므로 접어 둔다). */}
          <details className="nav-more" ref={more}>
            <summary className={inMore?"active":undefined} aria-current={inMore?"location":undefined}><NavIcon name="more"/><span className="nav-label">더보기</span></summary>
            <div className="nav-more-backdrop" aria-hidden="true" onClick={closeMore}/>
            <div className="nav-more-links">{MORE.map(link)}</div>
          </details>
        </nav>
        <main className="main-content">
          {section==="create"&&<div className="step-bar"><ol className="step-list" aria-label="만드는 순서">
            {steps.map((item) => (
              <li key={item.id} aria-current={item.id === step ? "step" : undefined}>
                <button type="button" aria-label={item.label} disabled={!onStepChange||!canVisit.includes(item.id)} onClick={()=>onStepChange?.(item.id)}><span className="step-full">{item.label}</span><span className="step-short" aria-hidden="true">{item.short}</span></button>
              </li>
            ))}
          </ol>{onNewDraft&&<button type="button" className="button secondary" onClick={onNewDraft}>새로 만들기</button>}</div>}
          {children}
        </main>
      </div>
    </div>
  );
}
