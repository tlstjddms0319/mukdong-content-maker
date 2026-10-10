// 휴대폰 알림(웹 푸시)을 받아 보여 주고, 누르면 앱의 해당 화면을 연다.
// 화면 캐시는 하지 않는다(늘 서버의 최신 화면을 쓰게).
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",(event)=>event.waitUntil(self.clients.claim()));

self.addEventListener("push",(event)=>{
  let data={};
  try{data=event.data?event.data.json():{};}catch{data={body:event.data?event.data.text():""};}
  const title=data.title||"묵동 콘텐츠 메이커";
  event.waitUntil(self.registration.showNotification(title,{
    body:data.body||"",
    icon:"/brand/logo-192.png",
    tag:data.tag||undefined,
    data:{url:typeof data.url==="string"&&data.url.startsWith("/")?data.url:"/"},
  }));
});

self.addEventListener("notificationclick",(event)=>{
  event.notification.close();
  const url=new URL(event.notification.data?.url||"/",self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    const open=windows.find((client)=>new URL(client.url).origin===self.location.origin);
    if(open){await open.focus();if("navigate" in open)await open.navigate(url).catch(()=>{});return;}
    await self.clients.openWindow(url);
  })());
});
