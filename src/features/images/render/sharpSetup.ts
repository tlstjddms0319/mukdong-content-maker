import sharp from "sharp";

// 서버가 카드를 그릴 때 쓰는 libvips(sharp) 메모리·스레드 한도.
// Render 무료 인스턴스(512MB, CPU 0.1)에서 "사진을 다 만들지 못했어요 … 상태 520"이 한 번씩 났다(사장님 제보 2026-10-13).
// 520은 앞단(Cloudflare)이 "서버가 응답 없이 끊겼다"고 알리는 번호로, 서버 프로세스가 메모리 초과로 죽었다가 다시 켜질 때 난다
// (보관함 사진 때문에 메모리가 넘친 전례 #117). sharp는 기본으로 CPU 수만큼(이 PC는 12) 스레드를 띄우고 캐시를 50MB까지 쓰는데,
// 무료 인스턴스에는 CPU가 0.1뿐이라 스레드는 메모리만 먹는다. 스레드 1개, 캐시 32MB로 묶는다(환경 변수로 바꿀 수 있다).
// 로컬 측정(2026-10-13, 카드 16장): 스레드 2→1에 그린 뒤 rss 172→147MB, 피크 204→196MB(시간은 약 20% 늘지만 무료 서버 CPU는 어차피 0.1).
// 카드를 그리는 모듈(composeSlide.ts·storeCard.ts)이 이 파일을 불러오면 한 번만 적용된다.
const concurrency=Number(process.env.SHARP_CONCURRENCY??"")||1;
const cacheMb=Number(process.env.SHARP_CACHE_MB??"")||32;
sharp.concurrency(Math.max(1,Math.min(8,concurrency)));
sharp.cache({memory:Math.max(0,cacheMb),files:0,items:100});

export const sharpLimits=()=>({concurrency:sharp.concurrency(),cacheMemoryMb:sharp.cache().memory.max});
