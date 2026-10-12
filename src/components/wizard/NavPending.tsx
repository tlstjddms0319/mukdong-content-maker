"use client";
import { useLinkStatus } from "next/link";

// 메뉴를 누른 순간부터 다음 화면이 뜰 때까지: 누른 메뉴 옆 작은 회전 표시 + 화면 맨 위 진행 막대.
// (Link 안에서만 쓸 수 있다. 미리 받아 둔 화면이면 바로 넘어가 표시되지 않는다.)
export function NavPending(){
  const {pending}=useLinkStatus();
  if(!pending)return null;
  return <><span className="nav-pending-spinner" aria-hidden="true"/><span className="nav-progress" role="status" aria-label="화면을 여는 중"/></>;
}
