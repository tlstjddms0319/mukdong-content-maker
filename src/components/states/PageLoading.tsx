"use client";
import { usePathname } from "next/navigation";
import { WizardShell } from "@/components/wizard/WizardShell";
import { BrandLogo } from "@/components/brand/BrandLogo";

// 화면을 여는 동안(서버가 다음 화면을 준비하는 1~2초) 멈춘 것처럼 보이지 않게 띄우는 로딩 화면.
// 메뉴는 그대로 두고 본문 자리에 "불러오는 중"과 자리 표시 카드를 보여 준다. app/loading.tsx가 쓴다.
const SECTIONS:Record<string,"create"|"drafts"|"performance"|"settings"|"plan"|"library"|"images"|"help">={
  "/":"create","/drafts":"drafts","/performance":"performance","/settings":"settings",
  "/plan":"plan","/library":"library","/images":"images","/help":"help",
};

export function LoadingBody(){
  return <div className="page-loading" role="status" aria-live="polite">
    <div className="page-loading-head"><span className="loading-spinner" aria-hidden="true"/><strong>화면을 불러오는 중…</strong></div>
    <div className="page-loading-cards" aria-hidden="true">{[0,1,2].map(i=><span key={i} className="skeleton-card"><i/><i/><i/></span>)}</div>
  </div>;
}

export function PageLoading(){
  const pathname=usePathname()??"/";
  if(pathname.startsWith("/login"))return <div className="login-page"><div className="page-loading" role="status"><BrandLogo size={56}/><div className="page-loading-head"><span className="loading-spinner" aria-hidden="true"/><strong>불러오는 중…</strong></div></div></div>;
  return <WizardShell step="topic" section={SECTIONS[pathname]}><LoadingBody/></WizardShell>;
}
