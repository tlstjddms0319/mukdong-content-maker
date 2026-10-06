// 카드 질감 자산을 한 번 구워 assets/design/textures/*.webp로 저장한다(계획서 B6).
// 실행: node scripts/bake-textures.mjs [이름...]   (이름을 빼면 전부)
//
// 왜 미리 굽나: feTurbulence·feDiffuseLighting 같은 SVG 필터는 1080×1350에서 0.4~3.5초 걸린다.
// 카드마다 다시 돌리면 Render 무료 서버에서 카드 한 장이 3초를 넘는다. 같은 질감은 파일 한 장을 읽어 blend로 얹으면 수십 ms다.
//
// 쓰는 법(blend)
// - multiply용(hanji·brick·wood·kraft·linen): 흰색에 가까운 바탕 위에 어두운 결. 흰 곳은 아래 그림을 바꾸지 않는다.
// - screen용(chalkdust·filmdust): 검은 바탕 위에 밝은 가루·먼지. 검은 곳은 아래 그림을 바꾸지 않는다.
// - soft-light용(velvet): 회색 128 근처를 오가는 결. 밝기는 거의 그대로 두고 결만 생긴다.
// 인스타그램 재압축에서 살아남도록 결의 밝기 차이를 ±6% 이상, 주파수를 너무 촘촘하지 않게 잡았다.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const W = 1080, H = 1350, OUT = "assets/design/textures";
const svg = body => Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`);
// 간단한 결정적 난수(같은 실행이면 같은 질감).
const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const TEXTURES = {
  // 닥종이: 가로·세로 두 방향 섬유(길게 늘인 잡음 두 겹)를 조명 필터로 도드라지게 하고 잔 섬유 점을 뿌린다.
  // 한 방향만 쓰면 '헤어라인 금속'처럼 보여서 두 방향을 교차한다.
  hanji: () => svg(`<filter id="f" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.006 0.045" numOctaves="3" seed="11" result="a"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.05 0.008" numOctaves="3" seed="23" result="b"/>
      <feComposite in="a" in2="b" operator="arithmetic" k2=".55" k3=".55" result="fiber"/>
      <feColorMatrix in="fiber" type="luminanceToAlpha" result="height"/>
      <feDiffuseLighting in="height" surfaceScale="2.4" diffuseConstant="1.05" lighting-color="#fffaf0"><feDistantLight azimuth="235" elevation="58"/></feDiffuseLighting>
    </filter><rect width="${W}" height="${H}" filter="url(#f)"/>
    <filter id="s"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="1" seed="5"/><feColorMatrix type="matrix" values="0 0 0 0 .55  0 0 0 0 .5  0 0 0 0 .42  0 0 0 -2.6 1.55"/></filter>
    <rect width="${W}" height="${H}" filter="url(#s)" opacity=".5"/>`),
  // 벽돌: 줄눈(어두운 선)과 벽돌마다 다른 밝기·아래쪽 그늘, 그 위에 거친 표면 잡음.
  brick: () => {
    const random = rng(42), BW = 180, BH = 66, GAP = 8;
    let bricks = "";
    for (let row = 0, y = 0; y < H; row++, y += BH + GAP) {
      for (let x = row % 2 ? -BW / 2 : 0; x < W; x += BW + GAP) {
        const tone = Math.round(190 + random() * 50);
        bricks += `<rect x="${x}" y="${y}" width="${BW}" height="${BH}" rx="3" fill="rgb(${tone},${tone},${tone})"/>`
          + `<rect x="${x}" y="${y + BH - 12}" width="${BW}" height="12" fill="#000" fill-opacity=".10"/>`
          + `<rect x="${x}" y="${y}" width="${BW}" height="5" fill="#fff" fill-opacity=".18"/>`;
      }
    }
    return svg(`<rect width="${W}" height="${H}" fill="#6e6e6e"/>${bricks}
      <filter id="r" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".35" numOctaves="3" seed="9"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept=".22"/></feComponentTransfer></filter>
      <rect width="${W}" height="${H}" filter="url(#r)" style="mix-blend-mode:multiply"/>`);
  },
  // 나무: 세로로 길게 늘인 잡음을 나뭇결 띠로 바꾸고 따뜻한 갈색을 입힌다(칠판 틀).
  wood: () => svg(`<filter id="w" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.0025 0.09" numOctaves="4" seed="3"/>
      <feColorMatrix type="matrix" values="0 0 0 .55 .45  0 0 0 .5 .3  0 0 0 .42 .18  0 0 0 0 1"/>
    </filter><rect width="${W}" height="${H}" filter="url(#w)"/>
    <filter id="k"><feTurbulence type="turbulence" baseFrequency="0.004 0.15" numOctaves="2" seed="8"/><feColorMatrix type="matrix" values="0 0 0 0 .2  0 0 0 0 .12  0 0 0 0 .06  -1.6 0 0 0 .9"/></filter>
    <rect width="${W}" height="${H}" filter="url(#k)" opacity=".55"/>`),
  // 크라프트지: 갈색 바탕 대신 밝은 바탕에 갈색 섬유(multiply로 얹으면 아래 색이 크라프트 쪽으로 물든다).
  kraft: () => svg(`<rect width="${W}" height="${H}" fill="#f3e6cf"/>
    <filter id="k" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.25" numOctaves="3" seed="17"/>
      <feColorMatrix type="matrix" values="0 0 0 0 .55  0 0 0 0 .4  0 0 0 0 .25  -2.2 0 0 0 1.25"/></filter>
    <rect width="${W}" height="${H}" filter="url(#k)" opacity=".7"/>
    <filter id="d"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="1" seed="2"/><feColorMatrix type="matrix" values="0 0 0 0 .4  0 0 0 0 .3  0 0 0 0 .2  0 0 0 -3 1.9"/></filter>
    <rect width="${W}" height="${H}" filter="url(#d)" opacity=".6"/>`),
  // 분필 가루: 검은 바탕에 지운 자국처럼 번진 흰 구름 + 잔 가루(screen).
  chalkdust: () => svg(`<rect width="${W}" height="${H}" fill="#000"/>
    <filter id="c" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.004 0.012" numOctaves="4" seed="31"/>
      <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.6 0 0 0 -.62"/></filter>
    <rect width="${W}" height="${H}" filter="url(#c)" opacity=".55"/>
    <filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="1" seed="4"/><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  3.4 0 0 0 -2.1"/></filter>
    <rect width="${W}" height="${H}" filter="url(#g)" opacity=".5"/>`),
  // 리넨: 가로·세로 가는 실이 엇갈리는 직물 결(multiply, 아주 옅게).
  linen: () => svg(`<rect width="${W}" height="${H}" fill="#fff"/>
    <filter id="x" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.9 0.012" numOctaves="2" seed="13" result="h"/>
      <feTurbulence type="fractalNoise" baseFrequency="0.012 0.9" numOctaves="2" seed="29" result="v"/>
      <feComposite in="h" in2="v" operator="arithmetic" k2=".5" k3=".5"/>
      <feColorMatrix type="matrix" values="0 0 0 0 .45  0 0 0 0 .42  0 0 0 0 .38  -2 0 0 0 1.3"/></filter>
    <rect width="${W}" height="${H}" filter="url(#x)" opacity=".75"/>`),
  // 필름 먼지: 검은 바탕에 흰 점·짧은 털·긁힘(screen). 흔한 위치를 피하려고 고정 난수로 흩뿌린다.
  filmdust: () => {
    const random = rng(77);
    let marks = "";
    for (let i = 0; i < 140; i++) marks += `<circle cx="${(random() * W).toFixed(0)}" cy="${(random() * H).toFixed(0)}" r="${(0.8 + random() * 2.2).toFixed(1)}" fill="#fff" fill-opacity="${(0.35 + random() * .5).toFixed(2)}"/>`;
    for (let i = 0; i < 18; i++) {
      const x = random() * W, y = random() * H, dx = (random() - .5) * 60, dy = (random() - .5) * 60;
      marks += `<path d="M${x.toFixed(0)} ${y.toFixed(0)}q${(dx / 2 + 10).toFixed(0)} ${(dy / 2 - 8).toFixed(0)} ${dx.toFixed(0)} ${dy.toFixed(0)}" stroke="#fff" stroke-opacity=".55" stroke-width="1.4" fill="none"/>`;
    }
    for (let i = 0; i < 4; i++) { const x = (random() * W).toFixed(0); marks += `<path d="M${x} 0V${H}" stroke="#fff" stroke-opacity=".12" stroke-width="1.2"/>`; }
    return svg(`<rect width="${W}" height="${H}" fill="#000"/>${marks}`);
  },
  // 벨벳: 128 근처 회색이 부드럽게 일렁이는 결(soft-light). 골드 계열 검은 바탕에 깊이를 준다.
  velvet: () => svg(`<filter id="v" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.008 0.02" numOctaves="3" seed="19"/>
      <feColorMatrix type="matrix" values=".5 0 0 0 .25  .5 0 0 0 .25  .5 0 0 0 .25  0 0 0 0 1"/></filter>
    <rect width="${W}" height="${H}" filter="url(#v)"/>
    <filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".6" numOctaves="1" seed="6"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope="0" intercept=".25"/></feComponentTransfer></filter>
    <rect width="${W}" height="${H}" filter="url(#n)"/>`),
};

const only = process.argv.slice(2);
await mkdir(OUT, { recursive: true });
const lines = ["# 카드 질감 자산", "", "scripts/bake-textures.mjs가 SVG 필터(feTurbulence·feDiffuseLighting)로 직접 구운 그림이다. 외부 이미지나 생성 AI를 쓰지 않았다.", ""];
for (const [name, make] of Object.entries(TEXTURES)) {
  if (only.length && !only.includes(name)) continue;
  const started = performance.now();
  const output = await sharp(make()).flatten({ background: "#ffffff" }).webp({ quality: 80 }).toBuffer();
  await writeFile(`${OUT}/${name}.webp`, output);
  const stats = await sharp(output).stats();
  const mean = stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3;
  const spread = stats.channels.slice(0, 3).reduce((sum, channel) => sum + channel.stdev, 0) / 3;
  console.log(`${name}: ${(output.length / 1024).toFixed(0)}KB, 평균 밝기 ${mean.toFixed(0)}, 결 세기(표준편차) ${spread.toFixed(1)}, ${Math.round(performance.now() - started)}ms`);
  lines.push(`- ${name}.webp`);
}
if (!only.length) await writeFile(`${OUT}/SOURCES.md`, lines.join("\n") + "\n");
