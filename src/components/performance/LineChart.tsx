"use client";
import { useEffect,useId,useRef,useState,type PointerEvent } from "react";
import { formatCount,shortDate } from "./format";

// 성과 화면의 선 그래프(한 줄). 차트 패키지 없이 SVG로 그린다.
// 손가락·마우스를 올리면 그 날짜의 값을 보여 주고, 같은 값을 '표로 보기'로도 볼 수 있다.
export function LineChart({label,points,unit=""}:{label:string;points:{x:string;y:number}[];unit?:string}){
  const [active,setActive]=useState<number|null>(null);
  const [width,setWidth]=useState(640);
  const frame=useRef<HTMLDivElement>(null);
  const gradient=useId();
  // 실제 폭에 맞춰 다시 그린다(좁은 휴대폰에서 눈금 글자가 작아지지 않게).
  useEffect(()=>{
    const element=frame.current;
    if(!element||typeof ResizeObserver==="undefined")return;
    const observer=new ResizeObserver(([entry])=>{const next=Math.round(entry.contentRect.width);if(next>0)setWidth(next);});
    observer.observe(element);
    return ()=>observer.disconnect();
  },[]);
  if(points.length<2)return <p className="chart-empty">{label} 그래프는 기록이 이틀 이상 쌓이면 보여요.</p>;
  const W=Math.max(240,width),H=W<480?170:200,L=40,R=12,T=14,B=28;
  const values=points.map(p=>p.y);
  const top=niceMax(Math.max(...values)),bottom=Math.min(0,Math.min(...values));
  const x=(i:number)=>L+i*(W-L-R)/(points.length-1),y=(v:number)=>T+(1-(v-bottom)/(top-bottom||1))*(H-T-B);
  const line=points.map((p,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join("");
  const ticks=[bottom,(top+bottom)/2,top];
  const labelIndexes=[...new Set([0,Math.floor((points.length-1)/2),points.length-1])];
  const move=(event:PointerEvent<SVGSVGElement>)=>{
    const box=event.currentTarget.getBoundingClientRect();
    const px=(event.clientX-box.left)/box.width*W;
    setActive(Math.max(0,Math.min(points.length-1,Math.round((px-L)/((W-L-R)/(points.length-1))))));
  };
  const point=active===null?null:points[active];
  return <figure className="line-chart">
    <figcaption className="chart-title">{label}</figcaption>
    <div className="chart-frame" ref={frame}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}, ${shortDate(points[0].x)}부터 ${shortDate(points.at(-1)!.x)}까지. 마지막 값 ${formatCount(points.at(-1)!.y)}${unit}`}
        onPointerMove={move} onPointerDown={move} onPointerLeave={()=>setActive(null)}>
        <defs><linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" className="chart-area-top"/><stop offset="100%" className="chart-area-bottom"/></linearGradient></defs>
        {ticks.map(t=><g key={t}><line x1={L} x2={W-R} y1={y(t)} y2={y(t)} className="chart-grid"/><text x={L-8} y={y(t)+4} textAnchor="end" className="chart-tick">{formatCount(Math.round(t),{compact:true})}</text></g>)}
        <path d={`${line}L${x(points.length-1)},${y(bottom)}L${x(0)},${y(bottom)}Z`} fill={`url(#${gradient})`}/>
        <path d={line} className="chart-line"/>
        {labelIndexes.map(i=><text key={i} x={x(i)} y={H-8} textAnchor={i===0?"start":i===points.length-1?"end":"middle"} className="chart-tick">{shortDate(points[i].x)}</text>)}
        <circle cx={x(points.length-1)} cy={y(points.at(-1)!.y)} r={4} className="chart-dot"/>
        {point&&<g className="chart-cursor"><line x1={x(active!)} x2={x(active!)} y1={T} y2={H-B}/><circle cx={x(active!)} cy={y(point.y)} r={5}/></g>}
      </svg>
      {point&&<div className="chart-tooltip" style={{left:`${x(active!)/W*100}%`}} role="status"><span>{shortDate(point.x)}</span><strong>{formatCount(point.y)}{unit}</strong></div>}
    </div>
    <details className="chart-table"><summary>표로 보기</summary>
      <table className="metric-table"><thead><tr><th>날짜</th><td>{label}</td></tr></thead><tbody>{points.map(p=><tr key={p.x}><th scope="row">{p.x}</th><td>{formatCount(p.y)}{unit}</td></tr>)}</tbody></table>
    </details>
  </figure>;
}

// 눈금 맨 위를 보기 좋은 수(1·1.2·1.5·2·2.5·3·4·5·6·8×10ⁿ)로 올린다. 너무 크게 올려 선이 바닥에 붙지 않게.
function niceMax(value:number){
  if(value<=0)return 1;
  const power=10**Math.floor(Math.log10(value));
  return [1,1.2,1.5,2,2.5,3,4,5,6,8,10].map(step=>step*power).find(candidate=>candidate>=value)??value;
}
