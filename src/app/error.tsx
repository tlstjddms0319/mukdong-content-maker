"use client";

import Link from "next/link";

// 앱 공통 오류 화면. 첫 화면(만들기)이 저장소 오류 등으로 열리지 않을 때도 무엇을 확인하면 되는지 알려 준다.
export default function AppError({retry}:{error:Error&{digest?:string};retry:()=>void}) {
  return <main className="state-page"><div className="state-card" role="alert">
    <h1>화면을 열지 못했어요</h1>
    <p>잠시 뒤 ‘다시 시도’를 눌러 주세요. 계속되면 설정 맨 아래 ‘관리자용 설정’에서 저장소를 확인해 달라고 관리하는 분께 알려 주세요.</p>
    <button type="button" className="button primary" onClick={retry}>다시 시도</button>
    <Link className="button secondary" href="/settings">설정 열기</Link>
  </div></main>;
}
