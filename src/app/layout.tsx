import type { Metadata } from "next";
import { Nanum_Brush_Script } from "next/font/google";
import "./globals.css";
import { SessionExpiryNotice } from "@/components/states/SessionExpiryNotice";

// 화면 큰 제목과 앱 이름만 붓글씨(홈페이지 v0.21과 같은 나눔 붓글씨). 본문·버튼·숫자는 읽기 쉬운 기본 글꼴 그대로다.
// 한글 글꼴이라 미리 내려받지 않고(preload:false), 구글 폰트가 화면에 쓰인 글자 조각만 받아 온다.
const brush=Nanum_Brush_Script({weight:"400",variable:"--font-brush",preload:false,display:"swap",fallback:["Malgun Gothic","sans-serif"]});

// 저장해 둔 밝기·글씨 크기를 그리기 전에 붙여 밝은 화면이 번쩍이지 않게 한다(DisplayControls와 같은 키).
const DISPLAY_BOOT_SCRIPT=`try{var d=document.documentElement,t=localStorage.getItem("mukdong-theme");if(t==="light"||t==="dark")d.dataset.theme=t;if(localStorage.getItem("mukdong-bigfont")==="1")d.setAttribute("data-bigfont","")}catch(e){}`;

export const metadata: Metadata = {
  title: "묵동 콘텐츠 메이커",
  description: "묵동홍어마을 인스타그램 게시물 만들기",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={brush.variable} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{__html:DISPLAY_BOOT_SCRIPT}}/></head>
      <body>{children}<SessionExpiryNotice/></body>
    </html>
  );
}
