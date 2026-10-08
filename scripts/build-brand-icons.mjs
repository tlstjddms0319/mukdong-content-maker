// 가게 공용 로고(assets/brand/logo-round.png, 원 바깥 투명)로 앱 아이콘과 화면용 작은 로고를 만든다.
// 로고를 바꾸면 이 스크립트만 다시 돌리면 된다: node scripts/build-brand-icons.mjs
//
// 만드는 파일
// - src/app/favicon.ico      : 브라우저 탭(16·32·48px). Next가 <link rel="icon" href="/favicon.ico">를 자동으로 붙인다.
// - src/app/icon.png         : 고해상도 탭·안드로이드(192px, 투명 원). Next 파일 규칙(app-icons)으로 자동 연결.
// - src/app/apple-icon.png   : 아이폰 "홈 화면에 추가"(180px). iOS는 투명 부분을 검게 칠하므로 앱 배경색 정사각 위에 둔다.
// - public/brand/logo-64.png : 상단 막대 로고(32px 자리, 화면 배율 2배).
// - public/brand/logo-192.png: 로그인·설정 화면 로고(96px 자리, 2배).
// - public/brand/logo-512.png: 릴스 끝 화면 로고(녹화 캔버스에 560px 안팎으로 그린다).
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const project = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = path.join(project, "assets", "brand", "logo-round.png");
// 앱 배경(globals.css --background). 아이폰 아이콘의 바탕으로 쓴다.
const BACKGROUND = "#faf9f5";

// 투명 원 로고를 size×size PNG로. palette로 줄여 파일을 가볍게 한다(작은 크기라 색 손실이 눈에 띄지 않는다).
const roundPng = (size) => sharp(source).resize(size, size, { kernel: "lanczos3" }).png({ compressionLevel: 9, palette: size <= 64, effort: 10 }).toBuffer();

// ICO 파일: 머리(6바이트) + 크기마다 목록 한 줄(16바이트) + PNG 본문들. 요즘 브라우저는 ICO 안의 PNG를 그대로 읽는다.
function icoOf(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // 예약
  header.writeUInt16LE(1, 2); // 1 = 아이콘
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // 너비(256은 0으로 적는다)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // 높이
    entry.writeUInt8(0, 2); // 팔레트 색 수(없음)
    entry.writeUInt8(0, 3); // 예약
    entry.writeUInt16LE(1, 4); // 색 평면
    entry.writeUInt16LE(32, 6); // 픽셀당 비트
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(({ png }) => png)]);
}

const favicon = icoOf(await Promise.all([16, 32, 48].map(async (size) => ({ size, png: await roundPng(size) }))));
// 아이폰 아이콘: 둥근 사각형으로 잘리므로 로고를 88% 크기로 가운데 둔다(가장자리 글씨가 잘리지 않게).
const appleLogo = await sharp(source).resize(158, 158, { kernel: "lanczos3" }).png().toBuffer();
const appleIcon = await sharp({ create: { width: 180, height: 180, channels: 3, background: BACKGROUND } })
  .composite([{ input: appleLogo, left: 11, top: 11 }])
  .png({ compressionLevel: 9 })
  .toBuffer();

await mkdir(path.join(project, "public", "brand"), { recursive: true });
const outputs = [
  ["src/app/favicon.ico", favicon],
  ["src/app/icon.png", await roundPng(192)],
  ["src/app/apple-icon.png", appleIcon],
  ["public/brand/logo-64.png", await roundPng(64)],
  ["public/brand/logo-192.png", await roundPng(192)],
  ["public/brand/logo-512.png", await roundPng(512)],
];
for (const [file, data] of outputs) {
  await writeFile(path.join(project, file), data);
  console.log(`${file} ${(data.length / 1024).toFixed(1)}KB`);
}
