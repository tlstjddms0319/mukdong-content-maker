// Render에서 영구 저장소(Supabase) 없이 돌고 있으면, 서버가 재시작될 때(무료 서버는 자주 잠들고 깬다) 초안·설정·연결이 지워진다.
// 만드는 화면과 내 초안 위에 늘 보이게 알린다. 로컬 개발·테스트에서는 보이지 않는다(RENDER 환경변수가 없음).
export function storageIsEphemeral(env:Record<string,string|undefined>=process.env):boolean {
  return Boolean(env.RENDER)&&!(env.SUPABASE_URL?.trim()&&env.SUPABASE_SECRET_KEY?.trim());
}

export function StorageWarning(){
  if(!storageIsEphemeral())return null;
  return <p className="storage-warning" role="status">지금은 영구 저장소(Supabase)가 연결되지 않아, 서버가 다시 켜지면 초안이 지워질 수 있어요. 다 만든 게시물은 ‘전체 묶음 받기’로 꼭 내려받아 두세요. 연결 방법은 설정 → 저장소 연결 확인에 있어요.</p>;
}
