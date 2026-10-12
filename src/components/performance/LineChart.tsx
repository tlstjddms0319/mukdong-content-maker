// 성과 화면의 작은 선 그래프. 차트 패키지 없이 SVG로 그린다. 값은 화면 읽기용 표(sr-only)로도 남긴다.
export function LineChart({label,points}:{label:string;points:{x:string;y:number}[]}){
  if(points.length<2)return <p className="field-help">{label} 그래프는 기록이 이틀 이상 쌓이면 보여요.</p>;
  const W=600,H=160,P=28;
  const max=Math.max(...points.map(p=>p.y),1),min=Math.min(...points.map(p=>p.y),0);
  const x=(i:number)=>P+i*(W-2*P)/(points.length-1),y=(v:number)=>H-P-(v-min)/(max-min||1)*(H-2*P);
  const d=points.map((p,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join("");
  return <figure className="metric-chart">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} 추이, ${points[0].x}부터 ${points.at(-1)!.x}까지`}>
      <line x1={P} x2={W-P} y1={H-P} y2={H-P} className="metric-axis"/>
      <path d={d} className="metric-line"/>
      <text x={P} y={H-6} className="metric-tick">{points[0].x.slice(5)}</text>
      <text x={W-P} y={H-6} textAnchor="end" className="metric-tick">{points.at(-1)!.x.slice(5)}</text>
      <text x={P} y={14} className="metric-tick">{max.toLocaleString("ko-KR")}</text>
    </svg>
    <figcaption>{label}</figcaption>
  </figure>;
}
