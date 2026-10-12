import Link from "next/link";
import { WizardShell } from "@/components/wizard/WizardShell";
import { requireOwnerPage } from "@/features/auth/guard";
import { createMetricsStore } from "@/features/metrics/store";
import { addDays,isDate,kstToday } from "@/features/metrics/dates";
import { getGa4Config } from "@/features/metrics/ga4";
import { createInstagramRepository,toPublicConnection } from "@/features/instagram/repository";
import { HomepageCard,InstagramCard,NaverCard } from "@/components/performance/ChannelCards";
import { CollectNowButton } from "@/components/performance/CollectNowButton";

export const dynamic="force-dynamic";
// 우리가 처음 만든 세 채널(인스타그램·홈페이지·네이버 플레이스)의 숫자를 모아 보는 화면. 보고서에 쓸 CSV도 여기서 받는다.
const OPENED="2026-08-25"; // 네이버 플레이스 유입이 처음 잡힌 날
export default async function PerformancePage({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  await requireOwnerPage();
  const params=await searchParams,today=kstToday(),month=today.slice(0,7);
  const lastMonthEnd=addDays(`${month}-01`,-1);
  const ranges={this:[`${month}-01`,today],last:[`${lastMonthEnd.slice(0,7)}-01`,lastMonthEnd],all:[OPENED,today]} as const;
  const preset=ranges[(params.range as keyof typeof ranges)??"all"]??ranges.all;
  const from=isDate(params.from??"")?params.from!:preset[0],to=isDate(params.to??"")?params.to!:preset[1];
  const store=createMetricsStore();
  const [instagram,ga4,naver,state,connection]=await Promise.all([store.listDays("instagram",from,to),store.listDays("ga4",from,to),store.readNaver(),store.readState(),createInstagramRepository().readConnection().catch(()=>null)]);
  const pub=toPublicConnection(connection);
  return <WizardShell step="topic" section="performance">
    <h1>성과</h1>
    <p className="lead">홈페이지·인스타그램·네이버 플레이스는 우리가 처음 만든 채널이에요. 여기 숫자는 모두 개설 뒤에 생긴 성과예요.</p>
    <nav className="metric-range" aria-label="기간">
      <Link href="/performance?range=this">이번 달</Link><Link href="/performance?range=last">지난 달</Link><Link href="/performance?range=all">개설 이후</Link>
      <form method="get"><label>시작<input type="date" name="from" defaultValue={from}/></label><label>끝<input type="date" name="to" defaultValue={to}/></label><button className="button secondary">보기</button></form>
    </nav>
    <p className="field-help">{from} ~ {to}</p>
    <div className="metric-grid">
      <InstagramCard days={instagram} state={state.instagram} insights={!!pub.insights} connected={pub.connected}/>
      <HomepageCard days={ga4} state={state.ga4} configured={!!getGa4Config()}/>
      <NaverCard periods={naver.filter(p=>p.end>=from&&p.start<=to)}/>
    </div>
    <div className="metric-actions">
      <a className="button primary" href={`/api/metrics/export?from=${from}&to=${to}`}>CSV 내려받기</a>
      <CollectNowButton/>
    </div>
  </WizardShell>;
}
