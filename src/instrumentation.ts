// Next.js가 서버 인스턴스를 시작할 때 한 번 부른다. 여기서 예약 게시 타이머를 켠다.
// INSTAGRAM_AUTOPUBLISH=off여도 타이머는 켠다: 그때는 게시하지 않고 장기 토큰 갱신만 해서 연결이 60일 뒤 끊기지 않게 한다.
// Render처럼 오래 떠 있는 Node 서버에서는 이것만으로 충분하고, 무료 인스턴스가 잠들었을 때를 대비해
// 외부 크론이 POST /api/instagram/scheduler 를 주기적으로 호출하도록 안내한다(docs/INSTAGRAM_AUTOPUBLISH.ko.md).
export async function register() {
  if(process.env.NEXT_RUNTIME!=="nodejs")return;
  if(!process.env.INSTAGRAM_APP_ID)return;
  const { startPublishSchedulerLoop }=await import("@/features/instagram/schedulerRuntime");
  startPublishSchedulerLoop();
}
