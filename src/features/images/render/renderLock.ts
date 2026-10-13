// 카드 그리기 순서 대기(프로세스 하나 기준).
// 화면은 장을 두 장씩 동시에 요청한다(generationStore SLIDE_CONCURRENCY=2). 이미지 AI를 기다리는 동안은 동시에 해도 되지만,
// 받은 그림을 카드로 그리는 순간(sharp 합성·검수·다시 그리기)은 장당 100MB 넘게 쓴다(로컬 측정: 두 장 동시 218MB).
// Render 무료 인스턴스(512MB)에서 두 장이 동시에 그려지면 메모리가 넘쳐 프로세스가 죽고 앞단이 520을 돌려줬다(2026-10-13).
// 그리는 단계만 한 번에 하나씩 차례로 한다. 기다리는 쪽은 앞 작업이 실패해도 이어서 돈다.
let tail:Promise<unknown>=Promise.resolve();
let waiting=0;

export function withRenderLock<T>(work:()=>Promise<T>):Promise<T> {
  waiting++;
  const run=tail.then(work,work);
  tail=run.then(()=>{waiting--;},()=>{waiting--;});
  return run;
}

// 지금 줄 서 있는(돌고 있는 것 포함) 그리기 작업 수. 로그·테스트용.
export const renderQueueSize=()=>waiting;
