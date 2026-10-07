"use client";

import Link from "next/link";

// 앱 공통 오류 화면. 첫 화면(만들기)이 저장소 오류 등으로 열리지 않을 때도 무엇을 확인하면 되는지 알려 준다.
export default function AppError({retry}:{error:Error&{digest?:string};retry:()=>void}) {
  return <main className="state-page"><div className="state-card" role="alert">
    <h1>화면을 열지 못했어요</h1>
    <p>잠시 뒤 다시 시도해 주세요. 계속되면 설정 → 저장소 연결 확인에서 Supabase 연결을 확인해 주세요(프로젝트가 일시정지됐거나 키가 하나만 들어가 있을 수 있어요).</p>
    <button type="button" className="button secondary" onClick={retry}>다시 시도</button>
    <Link className="button secondary" href="/settings">설정 열기</Link>
  </div></main>;
}
