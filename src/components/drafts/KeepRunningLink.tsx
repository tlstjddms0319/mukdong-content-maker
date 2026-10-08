"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { confirmStopGeneration } from "@/features/images/generationStore";

// 내 게시물에서 다른 게시물을 열거나 새로 시작하는 링크. 만드는 중인 게시물이 있으면 먼저 묻는다
// ("지금 만드는 게시물이 있어요. 그만두고 새로 시작할까요?"). 취소하면 이 화면에 그대로 있고 만들기도 계속된다.
// draftId: 이 링크가 여는 게시물. 만드는 중인 게시물과 같으면 묻지 않는다.
export function KeepRunningLink({draftId,onClick,...props}:ComponentProps<typeof Link>&{draftId?:string}){
  return <Link {...props} onClick={event=>{if(!confirmStopGeneration(draftId)){event.preventDefault();return;}onClick?.(event);}}/>;
}
