import { formatCount } from "./format";

// 가로 막대 목록: 이름 · 막대(가장 큰 값=100%) · 값. 값과 비율은 글자로도 적어 막대 길이만으로 읽지 않게 한다.
export type BarItem={key:string;label:string;value:number;note?:string;badge?:string};
export function BarList({items,label,unit=""}:{items:BarItem[];label:string;unit?:string}){
  if(!items.length)return null;
  const max=Math.max(...items.map(item=>item.value),1);
  return <ul className="bar-list" aria-label={label}>
    {items.map(item=><li key={item.key}>
      <span className="bar-name">{item.label}{item.badge&&<span className="bar-badge">{item.badge}</span>}</span>
      <span className="bar-track" aria-hidden="true"><span className="bar-fill" style={{width:`${Math.max(2,item.value/max*100)}%`}}/></span>
      <span className="bar-value">{formatCount(item.value)}{unit}{item.note&&<small>{item.note}</small>}</span>
    </li>)}
  </ul>;
}
