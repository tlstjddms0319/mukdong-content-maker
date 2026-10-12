import type { Performance } from "@/features/drafts/performance";
import type { MediaInsights } from "./metaClient";
import type { InstagramConnection, Publication } from "./schema";

// 반응 자동 가져오기(사장님 요청 2026-10-12: 반응 데이터로 배우기).
// 예전에는 게시 2~3일 뒤 인사이트 숫자를 사장님이 직접 옮겨 적어야 해서 성과가 거의 쌓이지 않았다.
// 앱이 올린 게시물(게시 기록에 미디어 번호가 있는 것)의 반응을 Instagram에서 읽어 초안 성과로 남긴다.
// 그러면 이미 있는 likedTopicTitles(performance.ts)가 반응 좋았던 주제를 주제 추천에 넘긴다.
// - 사장님이 직접 적은 숫자(source 없음·manual)는 덮어쓰지 않는다.
// - 게시 뒤 7일까지만 다시 가져온다(그 뒤로는 숫자가 거의 굳는다). 한 번 가져온 게시물은 6시간 뒤에 다시 본다.
export const INSIGHTS_SCOPE="instagram_business_manage_insights" as const;
export const INSIGHTS_WINDOW_MS=7*86_400_000;
export const INSIGHTS_REFRESH_MS=6*3_600_000;
export const canReadInsights=(connection:Pick<InstagramConnection,"scopes">)=>connection.scopes.includes(INSIGHTS_SCOPE);

type Deps={
  connection:InstagramConnection;
  listDrafts:()=>Promise<Array<{id:string;performance?:Performance}>>;
  readPublication:(draftId:string)=>Promise<Publication|null>;
  savePerformance:(draftId:string,performance:Performance)=>Promise<void>;
  client:{getMediaInsights(mediaId:string,accessToken:string):Promise<MediaInsights>};
  now?:Date;
};
export type InsightsRun={updated:string[];failed:string[];skipped?:"no-permission"};

export async function syncInstagramInsights(deps:Deps):Promise<InsightsRun> {
  if(!canReadInsights(deps.connection))return {updated:[],failed:[],skipped:"no-permission"};
  const now=deps.now??new Date(),at=now.toISOString();
  const run:InsightsRun={updated:[],failed:[]};
  for(const draft of await deps.listDrafts()){
    // 사장님이 직접 적은 숫자는 그대로 둔다. 자동으로 가져온 숫자는 6시간이 지났을 때만 다시 가져온다.
    const performance=draft.performance;
    if(performance&&performance.source!=="instagram")continue;
    if(performance?.fetched_at&&now.getTime()-Date.parse(performance.fetched_at)<INSIGHTS_REFRESH_MS)continue;
    const publication=await deps.readPublication(draft.id);
    if(publication?.status!=="published"||!publication.mediaId||!publication.publishedAt)continue;
    if(now.getTime()-Date.parse(publication.publishedAt)>INSIGHTS_WINDOW_MS)continue;
    try{
      const insights=await deps.client.getMediaInsights(publication.mediaId,deps.connection.accessToken);
      await deps.savePerformance(draft.id,{likes:insights.likes,comments:insights.comments,saves:insights.saves,shares:insights.shares,reach:insights.reach,...(insights.posted_on?{posted_on:insights.posted_on}:{}),recorded_at:at,source:"instagram",fetched_at:at});
      run.updated.push(draft.id);
    }catch{
      // 한 게시물이 실패해도(삭제된 게시물·권한 문제) 나머지는 계속 가져온다. 다음 점검 때 다시 시도한다.
      run.failed.push(draft.id);
    }
  }
  return run;
}
