// 성과 기록은 한국 날짜(YYYY-MM-DD)로 묶는다. 서버(Render)는 UTC라 직접 바꾼다.
const DAY=86_400_000;
const at=(date:string)=>Date.parse(`${date}T00:00:00Z`);
const fmt=(ms:number)=>new Date(ms).toISOString().slice(0,10);
export const kstDateOf=(iso:string|Date)=>fmt(new Date(iso).getTime()+9*3_600_000);
export const kstToday=(now=new Date())=>kstDateOf(now);
export const addDays=(date:string,n:number)=>fmt(at(date)+n*DAY);
export const diffDays=(a:string,b:string)=>Math.round((at(b)-at(a))/DAY);
export function dateRange(from:string,to:string){const out:string[]=[];for(let d=from;d<=to;d=addDays(d,1))out.push(d);return out;}
export function daysInMonth(date:string){const [y,m]=date.split("-").map(Number);return new Date(Date.UTC(y,m,0)).getUTCDate();}
// 한국 0시의 유닉스 초. Meta 인사이트 since/until에 쓴다.
export const kstStartSeconds=(date:string)=>Math.floor(Date.parse(`${date}T00:00:00+09:00`)/1000);
export const isDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(at(value));
