// 결과물 점검 스크립트(scripts/eval-posts.mjs) 전용: 로그인 검사 대역. 이 PC에서 사장님 키로만 돌리는 도구라
// 앱 라우트를 그대로 부르되 관리자 세션 확인만 건너뛴다. 배포된 앱은 이 파일을 쓰지 않는다.
export const LOGIN_EXPIRED_MESSAGE="";
export async function ownerApiError(){return null;}
export async function requireOwnerPage(){}
