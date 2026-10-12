import { formatCount,formatDelta,type Delta } from "./format";

// 숫자 하나를 크게 보여 주는 칸: 이름 · 값 · 변화(화살표+부호) · 작은 추이선.
export function Sparkline({values,label}:{values:number[];label:string}){
  if(values.length<2)return null;
  const W=120,H=32,P=3,max=Math.max(...values),min=Math.min(...values),span=max-min||1;
  const x=(i:number)=>P+i*(W-2*P)/(values.length-1),y=(v:number)=>H-P-(v-min)/span*(H-2*P);
  const d=values.map((v,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return <svg className="sparkline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} 추이`} preserveAspectRatio="none">
    <path d={`${d}L${x(values.length-1).toFixed(1)},${H}L${x(0).toFixed(1)},${H}Z`} className="sparkline-area"/>
    <path d={d} className="sparkline-line"/>
    <circle cx={x(values.length-1)} cy={y(values.at(-1)!)} r={3} className="sparkline-dot"/>
  </svg>;
}

export function StatTile({label,value,unit,delta,spark,hint,compact,display}:{label:string;value:number|undefined;unit?:string;delta?:Delta;spark?:number[];hint?:string;compact?:boolean;display?:string}){
  const direction=delta?(delta.value>0?"up":delta.value<0?"down":"flat"):undefined;
  return <div className="stat-tile">
    <span className="stat-label">{label}</span>
    <strong className="stat-value">{display??formatCount(value,{compact})}{unit&&value!==undefined&&<small>{unit}</small>}</strong>
    {delta&&<span className={`stat-delta ${direction}`}><span aria-hidden="true">{direction==="up"?"▲":direction==="down"?"▼":"■"}</span> {formatDelta(delta)} <span className="stat-delta-caption">{delta.caption}</span></span>}
    {spark&&<Sparkline values={spark} label={label}/>}
    {hint&&<span className="stat-hint">{hint}</span>}
  </div>;
}
