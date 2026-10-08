import Image from "next/image";

// 가게 공용 원형 로고(묵동홍어마을). 화면용 파일은 scripts/build-brand-icons.mjs가 assets/brand/logo-round.png로 만든다.
// - size: 화면에 보일 지름(px). 화면 배율 2배를 생각해 지름의 2배 이상인 파일을 고른다.
// - alt: 옆에 앱·가게 이름 글자가 있으면 비워 둔다(화면 읽기 프로그램이 같은 이름을 두 번 읽지 않게).
// - unoptimized: 미리 줄여 둔 작은 PNG라 Next 이미지 변환(/_next/image)을 거치지 않고 public 파일을 그대로 내려준다.
//   /brand/*.png는 점(.)이 든 경로라 로그인 확인(proxy)을 거치지 않아 로그인 화면에서도 보인다.
const SOURCES=[{upTo:32,src:"/brand/logo-64.png"},{upTo:96,src:"/brand/logo-192.png"}] as const;

export function BrandLogo({size=32,alt="",className="brand-logo"}:{size?:number;alt?:string;className?:string}){
  const {src}=SOURCES.find(item=>size<=item.upTo)??SOURCES[SOURCES.length-1];
  return <Image src={src} width={size} height={size} alt={alt} className={className} unoptimized/>;
}
