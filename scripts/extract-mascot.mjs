// 캐릭터 스티커 시트(3열 × 4줄)에서 원하는 칸의 캐릭터만 투명 배경 webp로 오려 낸다.
// 사용법: node scripts/extract-mascot.mjs <시트 이미지> [출력 폴더]
// 원리: 캐릭터는 굵고 어두운 외곽선으로 둘러싸여 있다. 칸의 가장자리에서 시작해
// "밝은 픽셀"만 따라 번지는 flood fill로 배경(크림색 바탕·바닥 띠·무늬)을 지우고,
// 남은 덩어리 중 가장 큰 것(=캐릭터)만 남겨 말풍선·하트·글자 같은 조각을 버린다.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const [, , sheet, outDir = "assets/design/mascot"] = process.argv;
if (!sheet) { console.error("시트 이미지 경로가 필요합니다."); process.exit(1); }

// 시트 격자 경계(896×1200 기준, 칸 사이 흰 줄과 무지개 띠를 피한 안쪽 영역).
const COLS = [[4, 294], [302, 595], [603, 893]];
const ROWS = [[8, 300], [308, 602], [610, 903], [911, 1196]];
// 쓸 포즈만 고른다: [이름, 열, 줄, 위쪽 여백(px)]
// 위쪽을 자르면 손을 든 포즈의 외곽선이 끊겨 몸 안까지 지워지므로 기본은 0이다.
// 대사 글자는 캐릭터와 떨어져 있어 '가장 큰 덩어리만 남기기' 단계에서 자연히 버려진다.
const POSES = [
  ["hello", 0, 0, 0],    // 안녕! – 손 흔들기
  ["curious", 1, 0, 0],  // 궁금해? – 돋보기
  ["tip", 1, 1, 0],      // 정보 꿀팁! – 윙크
  ["wow", 2, 1, 0],      // 헉! 진짜? – 놀람
  ["love", 0, 2, 0],     // 사랑해요!
  ["bye", 2, 2, 0],      // 다음에 또 봐요!
];

const LIGHT = 105;       // 이보다 밝으면 배경 후보(외곽선은 대략 40~80)

const { data, info } = await sharp(sheet).removeAlpha().raw().toBuffer({ resolveWithObject: true });
await mkdir(outDir, { recursive: true });

for (const [name, col, row, skip] of POSES) {
  const [x0, x1] = COLS[col]; const [y0b, y1] = ROWS[row]; const y0 = y0b + skip;
  const w = x1 - x0, h = y1 - y0;
  const lum = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = ((y0 + y) * info.width + (x0 + x)) * 3;
    lum[y * w + x] = (data[i] * 299 + data[i + 1] * 587 + data[i + 2] * 114) / 1000;
  }
  // 1) 가장자리에서 밝은 픽셀을 따라 배경을 칠한다(BFS).
  const bg = new Uint8Array(w * h); const q = [];
  const push = (p) => { if (!bg[p] && lum[p] > LIGHT) { bg[p] = 1; q.push(p); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (q.length) {
    const p = q.pop(), x = p % w, y = (p / w) | 0;
    if (x > 0) push(p - 1); if (x < w - 1) push(p + 1); if (y > 0) push(p - w); if (y < h - 1) push(p + w);
  }
  // 2) 배경이 아닌 픽셀을 덩어리로 묶고 가장 큰 덩어리만 남긴다.
  const label = new Int32Array(w * h); let best = 0, bestSize = 0, next = 0;
  for (let s = 0; s < w * h; s++) {
    if (bg[s] || label[s]) continue;
    next++; let size = 0; const st = [s]; label[s] = next;
    while (st.length) {
      const p = st.pop(); size++; const x = p % w, y = (p / w) | 0;
      for (const n of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1])
        if (n >= 0 && !bg[n] && !label[n]) { label[n] = next; st.push(n); }
    }
    if (size > bestSize) { bestSize = size; best = next; }
  }
  // 3) RGBA로 만들고, 캐릭터 영역만 잘라 여백 없이 저장한다.
  const rgba = Buffer.alloc(w * h * 4); let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let p = 0; p < w * h; p++) {
    const i = ((y0 + ((p / w) | 0)) * info.width + (x0 + (p % w))) * 3;
    rgba[p * 4] = data[i]; rgba[p * 4 + 1] = data[i + 1]; rgba[p * 4 + 2] = data[i + 2];
    if (label[p] === best) {
      rgba[p * 4 + 3] = 255; const x = p % w, y = (p / w) | 0;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  const file = path.join(outDir, `${name}.webp`);
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    // 원본 칸이 작아서(약 220px) 카드에 쓸 크기로 키운다. lanczos로 외곽선이 뭉개지지 않게 한다.
    .resize({ height: 560, kernel: "lanczos3" })
    .webp({ quality: 92, alphaQuality: 100 })
    .toFile(file);
  console.log("saved", file, `${maxX - minX + 1}x${maxY - minY + 1}`);
}
