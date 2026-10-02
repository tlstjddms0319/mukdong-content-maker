import sharp, { type OverlayOptions } from "sharp";
import { croppedPhoto, mascotLayer, svgLayer, textLayer, type CardRenderer } from "../render/primitives";
import type { MascotPose } from "../decor";
import { STYLE_FONTS, contentOf, fitText, outlinedText } from "./shared";

// 웹툰·만화 컷: 두꺼운 검은 테두리로 화면을 두 칸으로 나눈다. 위 칸은 음식 장면(또는 큰 제목)과 노란 해설 상자,
// 아래 칸은 집중선 앞에서 마스코트가 과장된 표정으로 반응하고, 말풍선 꼬리가 마스코트 입 쪽을 가리킨다.
// 장을 넘길 때마다 마스코트 표정과 효과음(톡!·두둥! 등)이 바뀌어 만화책을 넘기는 느낌을 준다.
const LINE="#111111",PAPER="#FFFFFF",NARRATION="#FFE14D";
const REACTIONS:MascotPose[]=["wow","love","tip","curious","hello"];
const SOUNDS=["톡!","두둥!","쫀득!","캬~","오잉?","짠!"];

// 한 점을 향해 모이는 집중선. 가운데는 비워 두고 바깥쪽에만 가는 삼각형을 촘촘히 그린다.
function speedLines(x:number,y:number,w:number,h:number,cx:number,cy:number,count=70):string {
  const R=Math.hypot(w,h);
  let d="";
  for(let i=0;i<count;i++){
    const a=(Math.PI*2*i)/count+((i*37)%7)*.01;
    const inner=R*(.26+((i*13)%5)*.03),spread=.012+((i*7)%3)*.004;
    const p=(r:number,da:number)=>`${Math.round(cx+Math.cos(a+da)*r)} ${Math.round(cy+Math.sin(a+da)*r)}`;
    d+=`M${p(inner,0)}L${p(R,-spread)}L${p(R,spread)}Z`;
  }
  return `<clipPath id="panel${x}${y}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath><path d="${d}" fill="${LINE}" fill-opacity=".85" clip-path="url(#panel${x}${y})"/>`;
}

export const renderWebtoon:CardRenderer=async(inputs,slide,index,total)=>{
  const content=contentOf(slide,inputs,index,total);
  const M=40,GUTTER=26,B=8;
  const W=1080-M*2;
  const TOP_H=Math.round((1350-M*2-GUTTER-60)*.5),BOTTOM_Y=M+TOP_H+GUTTER,BOTTOM_H=1350-M-60-BOTTOM_Y;
  const layers:OverlayOptions[]=[];
  let frames="";
  // 위 칸: 사진이 있으면 사진, 없으면 집중선 위 큰 외곽선 제목.
  if(inputs.length){
    layers.push({input:await croppedPhoto(inputs[0],W,TOP_H,0),left:M,top:M});
  }else{
    frames+=`<rect x="${M}" y="${M}" width="${W}" height="${TOP_H}" fill="${NARRATION}"/>`+speedLines(M,M,W,TOP_H,M+W/2,M+TOP_H/2,90);
  }
  // 해설 상자(노란 네모)에 제목. 표지는 큰 외곽선 글자로 칸 가운데에.
  if(content.cover||!inputs.length){
    const title=await outlinedText(content.headline,{size:content.cover?92:78,width:W-120,font:STYLE_FONTS.heavy,fill:content.cover?NARRATION:PAPER,stroke:LINE,strokeWidth:9,align:"centre",shadow:LINE});
    const top=inputs.length?M+TOP_H-title.info.height-30:M+Math.round((TOP_H-title.info.height)/2);
    layers.push({input:title.data,left:Math.round((1080-title.info.width)/2),top});
  }else{
    // 오른쪽 위 효과음(약 330px)과 겹치지 않도록 해설 상자는 왼쪽에 좁게 둔다.
    const box=await fitText(content.headline,{sizes:[44,40,36],width:W-430,maxHeight:170,color:LINE,font:STYLE_FONTS.comic,spacing:6});
    frames+=`<rect x="${M+24}" y="${M+24}" width="${box.info.width+44}" height="${box.info.height+32}" fill="${NARRATION}" stroke="${LINE}" stroke-width="5"/>`;
    layers.push({input:box.data,left:M+46,top:M+40});
  }
  // 아래 칸: 집중선, 마스코트 반응, 말풍선, 효과음.
  frames+=`<rect x="${M}" y="${BOTTOM_Y}" width="${W}" height="${BOTTOM_H}" fill="${PAPER}"/>`;
  const pose:MascotPose=content.last?"bye":REACTIONS[(index-1)%REACTIONS.length];
  const mascot=await mascotLayer({width:340,pose,left:M+30,top:BOTTOM_Y+BOTTOM_H-10,anchor:"bottom-left",maxHeight:BOTTOM_H-40});
  const focusX=mascot?mascot.left+mascot.width/2:M+200,focusY=mascot?mascot.top+mascot.height*.35:BOTTOM_Y+BOTTOM_H/2;
  frames+=speedLines(M,BOTTOM_Y,W,BOTTOM_H,focusX,focusY);
  // 말풍선에는 요점 앞쪽 두 줄. 꼬리는 마스코트 얼굴을 향한다.
  // 표지는 요점이 없으니 제목을 되풀이하지 않고 다음 장으로 이끄는 짧은 대사를 쓴다.
  const said=content.points.slice(0,2).join("\n")||(content.cover?"오늘 이야기,\n같이 볼래요?":content.headline);
  const bubbleX=mascot?mascot.left+mascot.width+10:M+80,bubbleW=1080-M-30-bubbleX;
  const speech=await fitText(said,{sizes:[40,36,34],width:bubbleW-90,maxHeight:BOTTOM_H-200,color:LINE,font:STYLE_FONTS.comic,align:"centre",spacing:8});
  const bw=Math.max(speech.info.width+110,300),bh=speech.info.height+90;
  const bx=bubbleX+Math.round((bubbleW-bw)/2),by=BOTTOM_Y+50;
  const tailTip=`${Math.round(focusX+60)} ${Math.round(focusY)}`;
  frames+=`<path d="M${bx+bw*.22} ${by+bh*.78}L${tailTip}L${bx+bw*.36} ${by+bh*.88}Z" fill="${PAPER}" stroke="${LINE}" stroke-width="6" stroke-linejoin="round"/>`
    +`<ellipse cx="${bx+bw/2}" cy="${by+bh/2}" rx="${bw/2}" ry="${bh/2}" fill="${PAPER}" stroke="${LINE}" stroke-width="6"/>`
    +`<path d="M${bx+bw*.22+8} ${by+bh*.78-4}L${bx+bw*.36-4} ${by+bh*.88-6}" stroke="${PAPER}" stroke-width="10"/>`;
  // 칸 틀·집중선·말풍선(frames)은 사진 바로 위, 제목·해설 글자보다 아래에 깔아야 글자가 가려지지 않는다.
  layers.splice(inputs.length?1:0,0,svgLayer(frames));
  if(mascot)layers.push(mascot);
  layers.push({input:speech.data,left:bx+Math.round((bw-speech.info.width)/2),top:by+Math.round((bh-speech.info.height)/2)});
  // 남은 요점은 아래 칸 오른쪽 아래 해설 상자에.
  const rest=content.points.slice(2).join(" ");
  if(rest){
    const note=await textLayer(rest,{size:34,color:LINE,width:Math.min(560,bubbleW),height:140,font:STYLE_FONTS.comic,spacing:6});
    const nx=1080-M-30-note.info.width-36,ny=BOTTOM_Y+BOTTOM_H-note.info.height-60;
    layers.push(svgLayer(`<rect x="${nx}" y="${ny}" width="${note.info.width+36}" height="${note.info.height+28}" fill="${NARRATION}" stroke="${LINE}" stroke-width="5"/>`),{input:note.data,left:nx+18,top:ny+14});
  }
  // 효과음: 위 칸 오른쪽 위에 기울어진 외곽선 글자.
  const sound=await outlinedText(SOUNDS[(index-1)%SOUNDS.length],{size:96,width:400,font:STYLE_FONTS.heavy,fill:"#FF3B30",stroke:PAPER,strokeWidth:8,shadow:LINE});
  const tilted=await sharp(sound.data).rotate(-12,{background:{r:0,g:0,b:0,alpha:0}}).png().toBuffer({resolveWithObject:true});
  layers.push({input:tilted.data,left:1080-M-tilted.info.width+10,top:M+10});
  // 칸 테두리는 맨 위에 다시 그려 사진·글자가 칸 밖으로 넘치지 않은 것처럼 보이게 한다.
  layers.push(svgLayer(`<rect x="${M}" y="${M}" width="${W}" height="${TOP_H}" fill="none" stroke="${LINE}" stroke-width="${B}"/><rect x="${M}" y="${BOTTOM_Y}" width="${W}" height="${BOTTOM_H}" fill="none" stroke="${LINE}" stroke-width="${B}"/>`));
  const page=await textLayer(`묵동홍어마을 웹툰  ·  ${index}화 / ${total}`,{size:26,color:LINE,width:900,height:40,font:STYLE_FONTS.comic,align:"centre"});
  layers.push({input:page.data,left:Math.round((1080-page.info.width)/2),top:1350-M-page.info.height+4});
  return sharp({create:{width:1080,height:1350,channels:3,background:"#F7F5F0"}}).composite(layers).jpeg({quality:92}).toBuffer();
};
