// 사진 파일 이름이 사진 내용을 말해 주는지. 사진을 AI로 읽지 못했을 때(키 없음 등) 주제 추천에 이름을 대신 쓸지 정한다.
// "홍어무침.jpg"·"미나리전 한 접시.png"처럼 사람이 붙인 한글 이름만 쓰고, 휴대폰·카톡·화면 캡처가 자동으로 붙인 이름
// ("IMG_1234", "KakaoTalk_20261009_…", "스크린샷 2026-10-09 …", "사진 3")은 쓰지 않는다. 쓸 수 없으면 "".
const AUTO_NAME=/^(?:img|dsc|pxl|kakaotalk|screenshot|image|photo|사진|스크린샷|화면\s*캡처|캡처|카카오톡)(?:[\s_\-.(]|\d|$)/i;
export function meaningfulPhotoName(name:string):string {
  const base=name.replace(/\.[a-z0-9]{2,5}$/i,"").replace(/[_\-]+/g," ").replace(/\s+/g," ").trim();
  if(!/[가-힣]/.test(base)||AUTO_NAME.test(base))return "";
  return base.slice(0,80);
}
