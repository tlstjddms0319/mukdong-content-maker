import type { Metadata } from "next";
import "./globals.css";
import { SessionExpiryNotice } from "@/components/states/SessionExpiryNotice";

// 저장해 둔 밝기·글씨 크기를 그리기 전에 붙여 밝은 화면이 번쩍이지 않게 한다(DisplayControls와 같은 키).
const DISPLAY_BOOT_SCRIPT=`try{var d=document.documentElement,t=localStorage.getItem("mukdong-theme");if(t==="light"||t==="dark")d.dataset.theme=t;if(localStorage.getItem("mukdong-bigfont")==="1")d.setAttribute("data-bigfont","")}catch(e){}`;

export const metadata: Metadata = {
  title: "묵동 콘텐츠 메이커",
  description: "묵동홍어마을 인스타그램 게시물 만들기",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{__html:DISPLAY_BOOT_SCRIPT}}/></head>
      <body>{children}<SessionExpiryNotice/></body>
    </html>
  );
}
