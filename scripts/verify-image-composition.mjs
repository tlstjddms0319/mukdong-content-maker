// No AI calls: render the production compositor with a synthetic background.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { composeSlideImage } from "../src/features/images/composeSlide.ts";

const directory="output/image-quality-check";
await mkdir(directory,{recursive:true});
const input=await sharp({create:{width:1080,height:1350,channels:3,background:"#495548"}}).png().toBuffer();
for(const [name,headline,textPosition] of [["korean-top","홍어가 처음이라면, 한 점부터 천천히","top"],["korean-long","홍어를 처음 만나는 날, 한 점부터 천천히 즐기는 방법을 알아볼까요?","bottom"],["korean-escape","홍어 <삼합> & 묵은지, 맛의 조합","top"]]){
  const image=await composeSlideImage(input,{role:"cover",headline,visualPrompt:"verification background",textPosition},1,5);
  await sharp(image).toFile(`${directory}/${name}.jpg`);
}
console.log(`Rendered 3 local font proofs in ${directory}; no paid API calls.`);
