// 로그아웃이 가끔 풀리던 문제 막기.
// Auth.js의 미들웨어(auth 래퍼)는 페이지 요청마다 로그인 쿠키(session-token)를 새로 구워 응답에 싣는다(만료 연장).
// 그런데 로그아웃 직전에 출발한 요청(링크 미리 불러오기 등)의 응답이 로그아웃 "뒤에" 도착하면
// 지운 쿠키를 다시 심어 로그아웃이 무효가 된다(e2e에서 10번 중 3번 재현).
// 이 앱의 로그인은 jwt 콜백의 ownerDeadline으로 로그인 후 8시간에 끝나므로 만료 연장은 의미가 없다.
// 그래서 프록시 응답에서 "값이 있는" 로그인 쿠키 설정만 뺀다. 쿠키를 지우는 응답(값이 빈 설정)은 그대로 둔다.

const SESSION_COOKIE=/^(?:__Secure-)?authjs\.session-token(?:\.\d+)?=([^;]*)/;

export const isSessionRefresh=(setCookie:string)=>{const match=SESSION_COOKIE.exec(setCookie);return !!match&&match[1]!=="";};

export function withoutSessionRefresh(response:Response):Response {
  const cookies=response.headers.getSetCookie();
  if(!cookies.some(isSessionRefresh))return response;
  const headers=new Headers(response.headers);
  headers.delete("set-cookie");
  for(const cookie of cookies)if(!isSessionRefresh(cookie))headers.append("set-cookie",cookie);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
