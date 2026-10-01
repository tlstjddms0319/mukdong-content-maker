// 서버가 JSON 대신 HTML을 돌려주면(배포·재시작 중 Render가 보내는 502 페이지, 잠든 무료 서버가 깨어나는 중 등)
// response.json()은 "Unexpected token '<', "<!DOCTYPE "..." 같은 영어 오류를 던진다.
// 화면에서는 그 대신 상태 코드와 무엇을 하면 되는지를 담은 한국어 오류를 보여 준다.
export function serverUnavailableMessage(status:number):string {
  if(status>=500||status===0)return `서버가 잠시 응답하지 않았어요(상태 ${status}). 새 버전을 배포 중이거나 서버가 다시 켜지는 중일 수 있어요. 1~2분 뒤 다시 시도해 주세요.`;
  return `서버 응답을 읽지 못했어요(상태 ${status}). 페이지를 새로고침한 뒤 다시 시도해 주세요.`;
}

// Response.json()과 같은 자리에서 쓰는 대체 함수. JSON 해석 오류(SyntaxError)만 위 안내로 바꾸고, 다른 오류는 그대로 던진다.
// 반환 타입은 Response.json()과 같게 둔다(호출하는 쪽이 data.message처럼 바로 읽는다).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readJsonResponse(response:Response):Promise<any> {
  try{return await response.json();}
  catch(error){
    if(error instanceof SyntaxError)throw new Error(serverUnavailableMessage(response.status));
    throw error;
  }
}
