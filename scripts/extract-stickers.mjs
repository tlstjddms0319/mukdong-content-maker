// 흰 바탕 스티커 시트(마스코트 포즈·소품)에서 그림을 하나씩 투명 webp로 오려 낸다(계획서 B10).
// 사용법: node scripts/extract-stickers.mjs <시트 이미지> <출력 폴더> <이름1,이름2,...>
//   예) node scripts/extract-stickers.mjs mascot-sheet.png assets/design/mascot eating,cheers,point,think,rain,ok
// 이름은 왼쪽 위부터 줄 순서(위 줄 왼→오, 다음 줄 왼→오)로 붙는다.
//
// 원리
// 1) 시트 가장자리에서 시작해 "밝은 픽셀"만 따라 번지는 flood fill로 바깥 흰 바탕을 지운다.
//    그림은 굵고 어두운 외곽선으로 닫혀 있으므로 눈 흰자·배 같은 안쪽 밝은 곳은 지워지지 않는다.
// 2) 남은 픽셀을 이웃끼리 묶어(연결 요소) 큰 덩어리만 그림으로 인정한다. 빗방울 같은 작은 조각은
//    가장 가까운 큰 덩어리에 붙여 함께 오린다(포즈 주변 효과선·물방울).
// 3) 덩어리마다 경계 상자를 잘라 가장자리를 1px 부드럽게 하고 긴 변 1200px 이하 webp로 저장한다.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const [, , sheet, outDir, namesArg] = process.argv;
if (!sheet || !outDir || !namesArg) { console.error("사용법: extract-stickers.mjs <시트> <출력 폴더> <이름,...>"); process.exit(1); }
const names = namesArg.split(",").map(name => name.trim()).filter(Boolean);

const LIGHT = 232;         // 이보다 밝고 채도가 낮으면 바탕 후보(흰 바탕은 보통 245 이상)
const PAD = 12;            // 오린 그림 둘레 여백(px)
const { data, info } = await sharp(sheet).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const isBackgroundColor = index => {
  const r = data[index * 3], g = data[index * 3 + 1], b = data[index * 3 + 2];
  return Math.min(r, g, b) >= LIGHT && Math.max(r, g, b) - Math.min(r, g, b) < 18;
};

// 1) 가장자리에서 바탕 flood fill (스택으로 돌려 재귀 깊이 문제를 피한다)
const background = new Uint8Array(W * H);
const stack = [];
const push = index => { if (!background[index] && isBackgroundColor(index)) { background[index] = 1; stack.push(index); } };
for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
while (stack.length) {
  const index = stack.pop(), x = index % W, y = (index - x) / W;
  if (x > 0) push(index - 1); if (x < W - 1) push(index + 1);
  if (y > 0) push(index - W); if (y < H - 1) push(index + W);
}

// 2) 바탕이 아닌 픽셀의 연결 요소
const label = new Int32Array(W * H).fill(-1);
const parts = [];
for (let start = 0; start < W * H; start++) {
  if (background[start] || label[start] >= 0) continue;
  const id = parts.length, part = { id, area: 0, x0: W, y0: H, x1: 0, y1: 0 };
  label[start] = id; stack.push(start);
  while (stack.length) {
    const index = stack.pop(), x = index % W, y = (index - x) / W;
    part.area++; part.x0 = Math.min(part.x0, x); part.x1 = Math.max(part.x1, x); part.y0 = Math.min(part.y0, y); part.y1 = Math.max(part.y1, y);
    for (const next of [x > 0 ? index - 1 : -1, x < W - 1 ? index + 1 : -1, y > 0 ? index - W : -1, y < H - 1 ? index + W : -1]) {
      if (next >= 0 && !background[next] && label[next] < 0) { label[next] = id; stack.push(next); }
    }
  }
  parts.push(part);
}
// 가장 큰 덩어리의 2% 이상이면 그림, 그보다 작으면 가장 가까운 그림에 딸린 조각으로 본다.
const biggest = Math.max(...parts.map(part => part.area));
const figures = parts.filter(part => part.area >= biggest * .02);
const center = part => [(part.x0 + part.x1) / 2, (part.y0 + part.y1) / 2];
const owner = new Map(figures.map(figure => [figure.id, figure.id]));
for (const part of parts) {
  if (owner.has(part.id) || part.area < 30) continue;
  const [cx, cy] = center(part);
  const nearest = figures.reduce((best, figure) => {
    const [fx, fy] = center(figure), distance = Math.hypot(fx - cx, fy - cy);
    return distance < best.distance ? { figure, distance } : best;
  }, { figure: figures[0], distance: Infinity }).figure;
  owner.set(part.id, nearest.id);
  nearest.x0 = Math.min(nearest.x0, part.x0); nearest.x1 = Math.max(nearest.x1, part.x1);
  nearest.y0 = Math.min(nearest.y0, part.y0); nearest.y1 = Math.max(nearest.y1, part.y1);
}

// 줄 순서로 정렬: 세로 중심이 비슷한(그림 높이의 절반 이내) 것끼리 한 줄로 묶고 줄 안에서는 왼쪽부터.
figures.sort((a, b) => center(a)[1] - center(b)[1]);
const rows = [];
for (const figure of figures) {
  const row = rows.find(items => Math.abs(center(items[0])[1] - center(figure)[1]) < (figure.y1 - figure.y0) / 2);
  if (row) row.push(figure); else rows.push([figure]);
}
const ordered = rows.flatMap(row => row.sort((a, b) => a.x0 - b.x0));
if (ordered.length !== names.length) console.warn(`그림 ${ordered.length}개를 찾았고 이름은 ${names.length}개입니다. 앞에서부터 짝짓습니다.`);

await mkdir(outDir, { recursive: true });
for (const [i, figure] of ordered.entries()) {
  const name = names[i]; if (!name) break;
  const x0 = Math.max(0, figure.x0 - PAD), y0 = Math.max(0, figure.y0 - PAD);
  const w = Math.min(W, figure.x1 + PAD + 1) - x0, h = Math.min(H, figure.y1 + PAD + 1) - y0;
  // 알파: 이 그림(과 딸린 조각)에 속한 픽셀만 불투명. 바탕과 다른 그림은 투명.
  const rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const src = (y0 + y) * W + (x0 + x), dst = (y * w + x) * 4;
    rgba[dst] = data[src * 3]; rgba[dst + 1] = data[src * 3 + 1]; rgba[dst + 2] = data[src * 3 + 2];
    rgba[dst + 3] = !background[src] && label[src] >= 0 && owner.get(label[src]) === figure.id ? 255 : 0;
  }
  // 알파만 살짝 흐리게 해 계단진 가장자리를 부드럽게 한다(색은 그대로).
  const alpha = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).extractChannel(3).blur(.6).raw().toBuffer();
  for (let p = 0; p < w * h; p++) rgba[p * 4 + 3] = alpha[p];
  const file = path.join(outDir, `${name}.webp`);
  await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 100 }).toFile(file);
  console.log(`${file}: ${w}×${h}`);
}
