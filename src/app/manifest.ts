import type { MetadataRoute } from "next";

// 휴대폰 "홈 화면에 추가"용 정보. 홈 화면 앱으로 열면 알림이 더 안정적으로 오고, 누르면 앱처럼 열린다.
export default function manifest():MetadataRoute.Manifest {
  return {
    name:"묵동 콘텐츠 메이커",
    short_name:"묵동 콘텐츠",
    description:"묵동홍어마을 인스타그램 게시물 만들기",
    start_url:"/",
    display:"standalone",
    background_color:"#ffffff",
    theme_color:"#ffffff",
    lang:"ko",
    icons:[
      {src:"/brand/logo-192.png",sizes:"192x192",type:"image/png"},
      {src:"/brand/logo-512.png",sizes:"512x512",type:"image/png"},
    ],
  };
}
