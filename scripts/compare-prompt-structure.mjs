// scripts/compare-prompt-structure.mjs — 이미지 지시문 A/B(2026-10-20 계획서 0단계): 같은 장면을 예전 조립(한 줄)과
// 5칸 구조 조립(promptSlots.ts)으로 각각 만들어 나란히 저장한다. 사장님이 보고 고르는 게 기준이다.
//
// 사용법: npm run compare:prompt -- [--scenes=4] [--out=output/prompt-ab]
//   - 키는 .env.local에서 읽는다(HF_API_KEY_ID·HF_API_KEY_SECRET). 운영 저장소(Supabase)는 끈다.
//   - 비용: 장면마다 Higgsfield 2장(기본 4장면 = 8장). AI 글 호출은 없다(장면은 아래에 미리 적어 둠).
//   - 결과: <out>/NN-legacy.jpg, NN-structured.jpg, NN-prompts.txt, 전체 비교 시트 <out>/all.jpg
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, "").split("=")).map(([key, value]) => [key, value ?? "true"]));
const OUT = path.resolve(args.out ?? "output/prompt-ab");
const COUNT = Math.max(1, Math.min(6, Number(args.scenes ?? 4)));
try { process.loadEnvFile(".env.local"); } catch { console.warn(".env.local을 찾지 못했어요. 환경변수만 씁니다."); }
delete process.env.SUPABASE_URL; delete process.env.SUPABASE_SECRET_KEY;

const { generateHiggsfieldImages, isHiggsfieldConfigured } = await import("@/features/images/higgsfieldRequest");
const { buildImagePrompt } = await import("@/features/images/openaiRequest");
const { ImageBriefSchema } = await import("@/features/images/schema");
if (!isHiggsfieldConfigured()) { console.error("HF_API_KEY_ID·HF_API_KEY_SECRET이 필요해요."); process.exit(1); }

const slide = (over) => ({ role: "cover", layout: "fullscreen", subline: "", points: [], textPosition: "bottom", figure: "", titleFont: "auto", bodyFont: "auto", variant: 0, ...over });
// 메뉴 여섯 가지를 고루: 홍어회·삼합·과메기·홍어애탕·막걸리·미나리전. 장면 설명은 구성안 AI가 쓰는 한국어 한 줄과 같은 꼴.
const SCENES = [
  { topic: "홍어회는 왜 처음 먹을 때 코가 먼저 찡할까?", slide: slide({ headline: "홍어회는 왜 코가 찡할까?", visualPrompt: "검은 접시에 줄지어 담긴 홍어회 한 접시와 초장 종지, 옆에 막걸리 사발", keywords: ["홍어회"] }) },
  { topic: "과메기는 왜 김과 미역에 싸서 먹을까?", slide: slide({ headline: "과메기는 왜 김과 미역에 싸서 먹을까?", visualPrompt: "대나무 소쿠리에 담긴 과메기와 김, 물미역, 마늘, 쪽파가 둘러싼 한 상", keywords: ["과메기"] }) },
  { topic: "삼합에서 수육은 왜 홍어 향을 누그러뜨릴까?", slide: slide({ role: "detail", headline: "수육 지방이 향을 감싸요", points: ["홍어 한 점에 수육 한 조각, 묵은지를 겹쳐요"], visualPrompt: "홍어 한 점, 수육 한 조각, 묵은지를 겹친 한 입 조합을 가까이에서", keywords: ["삼합"] }) },
  { topic: "홍어애탕은 왜 맑은 생선탕과 달리 국물이 묵직할까?", slide: slide({ headline: "홍어애탕은 왜 국물이 묵직할까?", visualPrompt: "뚝배기에서 김이 오르는 홍어애탕, 보리 새순이 보이는 국물", keywords: ["홍어애탕"] }) },
  { topic: "막걸리는 왜 기름진 전과 함께 먹으면 더 개운할까?", slide: slide({ role: "overview", headline: "탄산이 기름기를 씻어요", visualPrompt: "미나리전 한 접시와 양은 주전자에서 사발로 따르는 막걸리를 바로 위에서", keywords: ["막걸리", "미나리전"] }) },
  { topic: "미나리전은 왜 비 오는 날 생각날까?", slide: slide({ headline: "미나리전은 왜 비 오는 날 생각날까?", visualPrompt: "창가 나무 테이블 위 노릇한 미나리전과 막걸리 사발, 빗방울 맺힌 창", keywords: ["미나리전"] }) },
].slice(0, COUNT);

await mkdir(OUT, { recursive: true });
const text = (value, size = 18) => sharp({ text: { text: `<span foreground="#222">${value.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</span>`, font: `Pretendard ${size}`, fontfile: "assets/fonts/Pretendard-Regular.otf", rgba: true, width: 700 } }).png().toBuffer();
const decode = (dataUrl) => Buffer.from(dataUrl.replace(/^data:image\/\w+;base64,/, ""), "base64");

const rows = [];
for (const [index, scene] of SCENES.entries()) {
  const base = ImageBriefSchema.parse({ topic: scene.topic, count: 1, slide: scene.slide, slideIndex: 1, slideTotal: 5, styleAnchor: "따뜻한 색온도, 검은 옹기와 놋그릇, 짙은 나무 테이블" });
  const name = String(index + 1).padStart(2, "0");
  const columns = [];
  const prompts = [];
  for (const layout of ["legacy", "structured"]) {
    const brief = { ...base, promptLayout: layout };
    const prompt = buildImagePrompt(brief);
    prompts.push(`### ${layout} (${prompt.length}자)\n${prompt}\n`);
    console.log(`[${name}] ${layout} 만드는 중… (지시문 ${prompt.length}자)`);
    try {
      const [image] = await generateHiggsfieldImages(brief);
      const jpeg = decode(image);
      await writeFile(path.join(OUT, `${name}-${layout}.jpg`), jpeg);
      columns.push({ label: layout === "legacy" ? "예전 조립" : "5칸 구조", image: await sharp(jpeg).resize(360, 450).png().toBuffer() });
    } catch (error) {
      console.warn(`[${name}] ${layout} 실패:`, error instanceof Error ? error.message : String(error));
      columns.push({ label: `${layout} 실패`, image: await sharp({ create: { width: 360, height: 450, channels: 3, background: "#ddd" } }).png().toBuffer() });
    }
  }
  await writeFile(path.join(OUT, `${name}-prompts.txt`), `# ${scene.topic}\n\n${prompts.join("\n")}`);
  const labels = await Promise.all(columns.map((column) => text(column.label, 17)));
  const row = await sharp({ create: { width: 2 * 372 + 12, height: 36 + 24 + 450 + 12, channels: 3, background: "#fff" } }).composite([
    { input: await text(`${name}. ${scene.topic}`, 20), left: 6, top: 4 },
    ...columns.flatMap((column, i) => [{ input: labels[i], left: i * 372 + 6, top: 34 }, { input: column.image, left: i * 372, top: 60 }]),
  ]).jpeg({ quality: 88 }).toBuffer();
  rows.push(row);
}
const metas = await Promise.all(rows.map((row) => sharp(row).metadata()));
let y = 0;
await sharp({ create: { width: metas[0].width, height: metas.reduce((h, m) => h + m.height + 10, 0), channels: 3, background: "#fff" } })
  .composite(rows.map((input, i) => { const top = y; y += metas[i].height + 10; return { input, left: 0, top }; })).jpeg({ quality: 88 }).toFile(path.join(OUT, "all.jpg"));
console.log(`비교 시트: ${path.join(OUT, "all.jpg")}`);
