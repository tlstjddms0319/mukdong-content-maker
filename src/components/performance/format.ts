// 성과 화면의 숫자 표기. 1만 이상은 "1.2만"처럼 줄이고, 없는 값은 0이 아니라 "—"로 둔다.
export function formatCount(value:number|undefined,{compact=false}:{compact?:boolean}={}){
  if(value===undefined||Number.isNaN(value))return "—";
  if(compact&&Math.abs(value)>=10_000)return new Intl.NumberFormat("ko-KR",{notation:"compact",maximumFractionDigits:1}).format(value);
  return value.toLocaleString("ko-KR",{maximumFractionDigits:1});
}

export const sumOf=<T,>(list:T[],pick:(item:T)=>number|undefined)=>{
  const values=list.map(pick).filter((v):v is number=>v!==undefined);
  return values.length?values.reduce((a,b)=>a+b,0):undefined;
};

export type Delta={value:number;unit?:string;caption:string;percent?:boolean};
// 변화 표시: 화살표와 부호를 함께 써서 색만으로 구분하지 않는다.
export function formatDelta(delta:Delta){
  const sign=delta.value>0?"+":delta.value<0?"−":"±";
  const abs=Math.abs(delta.value);
  return `${sign}${delta.percent?`${Math.round(abs)}%`:`${formatCount(abs)}${delta.unit??""}`}`;
}
export const percentChange=(now:number|undefined,before:number|undefined)=>now===undefined||before===undefined||before===0?undefined:(now-before)/before*100;

const DAY_LABEL=new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",month:"numeric",day:"numeric"});
export const shortDate=(isoOrDate:string)=>DAY_LABEL.format(new Date(isoOrDate.length===10?`${isoOrDate}T12:00:00+09:00`:isoOrDate)).replace(/\s/g,"").replace(/\.$/,"");
