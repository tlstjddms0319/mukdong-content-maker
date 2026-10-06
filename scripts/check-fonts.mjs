// 글꼴마다 한글 완성형 11,172음절과 숫자·기본 기호를 얼마나 갖고 있는지 잰다(fontconfig fc-query 사용).
// 실행: node scripts/check-fonts.mjs
// 빠진 글자는 카드에서 Pretendard로 대체되지만(render/primitives.ts fontDescription), 제목에 대체 글자가 섞이면 어색하므로
// 손글씨·디스플레이 글꼴은 짧은 제목에만 쓰고, 요점처럼 아무 낱말이나 오는 글에는 지원 범위가 넓은 글꼴을 쓴다.
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";

const DIR="assets/fonts";
const HANGUL=[0xAC00,0xD7A3];
const EXTRA=[..."0123456789·→▸✓%,.?!"].map(c=>c.codePointAt(0));
// fc-query의 charset은 "시작-끝" 16진 범위 목록이다. 그 범위들과 한글 범위의 겹침을 센다.
const ranges=file=>execFileSync("fc-query",["-f","%{charset}\n",file],{encoding:"utf8"}).split("\n")[0].trim().split(/\s+/).filter(Boolean).map(part=>{const [a,b]=part.split("-");return [parseInt(a,16),parseInt(b??a,16)];});
const covers=(list,code)=>list.some(([a,b])=>code>=a&&code<=b);
const rows=[];
for(const file of readdirSync(DIR).filter(name=>/\.(ttf|otf)$/i.test(name)).sort()){
  const list=ranges(path.join(DIR,file));
  let hangul=0;
  for(const [a,b] of list)hangul+=Math.max(0,Math.min(b,HANGUL[1])-Math.max(a,HANGUL[0])+1);
  const missing=EXTRA.filter(code=>!covers(list,code)).map(code=>String.fromCodePoint(code)).join("");
  rows.push([file,hangul,missing]);
}
const total=HANGUL[1]-HANGUL[0]+1;
for(const [file,hangul,missing] of rows)console.log(`${file.padEnd(34)} 한글 ${String(hangul).padStart(5)}/${total} (${Math.round(hangul/total*100)}%)${missing?`  빠진 기호: ${missing}`:""}`);
