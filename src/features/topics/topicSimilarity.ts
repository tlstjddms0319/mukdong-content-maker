// 두 주제 제목이 얼마나 비슷한지(0~1). 글자 두 개씩 묶은 조각이 얼마나 겹치는지 보는 방식(Dice 계수)이다.
// 띄어쓰기·문장부호는 빼고 본다. "과메기는 왜 찬바람이 불면 찾을까?"와 "과메기는 왜 겨울에 찾을까?"처럼 몇 단어만 고친 제목은 높게,
// "추천 주제"와 "막걸리와 즐기는 저녁 한 상"처럼 다른 이야기는 낮게 나온다.
// 만들기 화면에서 "직접 주제를 고쳤을 때 같은 초안을 이어 갈지, 새 초안으로 볼지"를 가르는 데 쓴다.
const bigrams=(text:string)=>{
  const plain=text.replace(/[\s?!.,~·'"“”‘’()\[\]-]/g,"");
  const grams:string[]=[];
  for(let i=0;i<plain.length-1;i++)grams.push(plain.slice(i,i+2));
  return {plain,grams};
};

export function topicSimilarity(a:string,b:string):number {
  const x=bigrams(a),y=bigrams(b);
  if(!x.grams.length||!y.grams.length)return x.plain===y.plain?1:0;
  const pool=[...y.grams];
  let shared=0;
  for(const gram of x.grams){const at=pool.indexOf(gram);if(at>=0){shared++;pool.splice(at,1);}}
  return 2*shared/(x.grams.length+y.grams.length);
}

// 이만큼 이상 비슷하면 "같은 주제를 다듬는 중"으로 본다.
export const SAME_TOPIC_SIMILARITY=0.5;
