// "다른 주제 보기" 간격 정하기(서버 전용 메모리, 프로세스 하나 기준).
// 무료 문안 AI(Gemini flash-lite)는 1분에 받을 수 있는 요청 수가 정해져 있다. 추천 한 번에 Gemini를 최대 두 번 부르므로
// (첫 모델이 한도에 걸리면 예비 모델로 한 번 더), 연달아 누르면 한도에 걸려 준비된 주제로 넘어가고 네이버 검색 말 반영도 빠졌다.
// 그래서 1분에 AI 추천을 TOPIC_REFRESH_PER_MINUTE번까지만 보내고, 화면에는 다음에 누를 수 있을 때까지 남은 초를 알려 준다.
//   - 평소: 앞 추천에서 TOPIC_REFRESH_GAP_SECONDS(10초)가 지나야 다음 추천.
//   - 1분 창이 꽉 차면: 가장 오래된 요청이 1분을 넘길 때까지.
//   - AI가 한도(429)에 걸렸으면: 1분(분당 한도가 풀리는 시간).
export const TOPIC_REFRESH_PER_MINUTE=6;
export const TOPIC_REFRESH_GAP_SECONDS=Math.ceil(60/TOPIC_REFRESH_PER_MINUTE);
export const RATE_LIMITED_COOLDOWN_SECONDS=60;
const WINDOW_MS=60_000;

// 개발 서버·여러 번들(라우트마다 따로 묶임)에서도 같은 기록을 보게 globalThis에 둔다.
type PaceStore={calls:number[]};
const holder=globalThis as typeof globalThis&{__mukdongTopicPace?:PaceStore};
const store=()=>holder.__mukdongTopicPace??={calls:[]};

const prune=(now:number)=>{const s=store();s.calls=s.calls.filter(at=>now-at<WINDOW_MS);return s.calls;};

// 지금 AI 추천을 보내도 되는지. 안 되면 몇 초 기다려야 하는지(올림).
export function topicRefreshWait(now=Date.now()):number {
  const calls=prune(now);
  const last=calls.at(-1);
  const gap=last===undefined?0:last+TOPIC_REFRESH_GAP_SECONDS*1000-now;
  const full=calls.length>=TOPIC_REFRESH_PER_MINUTE?calls[0]+WINDOW_MS-now:0;
  return Math.max(0,Math.ceil(Math.max(gap,full)/1000));
}

// AI 추천을 보냈다고 적는다.
export function recordTopicRefresh(now=Date.now()){prune(now);store().calls.push(now);}

// 응답과 함께 화면에 줄 "다음까지 기다릴 초". AI가 한도에 걸렸으면 1분을 쉰다.
export function topicCooldownSeconds(now=Date.now(),options:{rateLimited?:boolean}={}):number {
  return Math.max(topicRefreshWait(now),options.rateLimited?RATE_LIMITED_COOLDOWN_SECONDS:0);
}

// 테스트용: 기록 비우기.
export function resetTopicPace(){store().calls=[];}
