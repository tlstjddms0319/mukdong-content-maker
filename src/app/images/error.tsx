"use client";

import Link from "next/link";

export default function ImagesError({retry}:{error:Error&{digest?:string};retry:()=>void}) {
  return <div className="state-card" role="alert"><h1>목록을 불러오지 못했어요</h1><p>잠시 뒤 ‘다시 시도’를 눌러 주세요.</p><button type="button" className="button secondary" onClick={retry}>다시 시도</button><Link className="button secondary" href="/">만들기로 돌아가기</Link></div>;
}
