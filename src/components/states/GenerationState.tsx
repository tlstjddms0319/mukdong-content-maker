export function GenerationState({ state, message, onRetry }: { state:"loading"|"empty"|"error"; message?:string; onRetry?:()=>void }) {
  if(state==="loading") return <div className="image-skeleton" role="status">이미지를 준비하고 있어요…</div>;
  return <div className="state-card" role={state==="error"?"alert":"status"}><strong>{state==="error"?"작업을 마치지 못했어요":"아직 결과가 없어요"}</strong><p>{message??"완료된 내용은 그대로 보관했어요."}</p>{onRetry&&<button type="button" className="button primary" onClick={onRetry}>다시 시도</button>}</div>;
}
