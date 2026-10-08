import type { Metadata } from "next";
import "./globals.css";
import { SessionExpiryNotice } from "@/components/states/SessionExpiryNotice";

export const metadata: Metadata = {
  title: "묵동 콘텐츠 메이커",
  description: "묵동홍어마을 인스타그램 게시물 만들기",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}<SessionExpiryNotice/></body>
    </html>
  );
}
