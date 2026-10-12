import Link from "next/link";
import { WizardShell } from "@/components/wizard/WizardShell";
import { requireOwnerPage } from "@/features/auth/guard";
import { MoreInfo,StepGuide,WherePath } from "@/components/states/Guide";

export const dynamic = "force-dynamic";

// 도움말: 사장님이 처음 쓸 때 볼 순서(3단계)와, 가끔 쓰는 기능이 어디 있는지를 짧게 안내한다.
// 자세한 동작 설명은 docs/APP_OPERATION_GUIDE.ko.md에 있고, 여기에는 화면에서 바로 찾을 수 있는 이름만 쓴다.
// 기술 이름(AI 회사·저장소)은 쓰지 않는다. 문제가 생기면 "관리자용 설정"을 관리하는 분께 알리도록 한다.
const TIPS:Array<{title:string;where:string;short:string;body:string}>=[
  {title:"내 사진으로 만들기",where:"만들기 → 2 만들기 → 사진 올리기",short:"올린 사진으로 만들어요. 첫 사진이 첫 장이 돼요.",body:"가게에서 찍은 사진을 올리면 그 사진으로 만들어요. 첫 번째 사진이 첫 장이 돼요. 사진 중심은 장마다 사진 한 장, 글 중심은 첫 장에만 사진이 들어가요. 전에 올린 사진은 ‘전에 올린 사진에서 고르기’로 다시 쓸 수 있어요."},
  {title:"AI 그림 없이 내 사진만 쓰기",where:"2 만들기 → 사진 중심 → 사진 고르기(1~4장) → 사진이 모자란 장은",short:"‘내 사진만 쓰기’를 누르면 AI 그림 없이 만들어요(비용 없음).",body:"사진이 장 수(내용에 맞춰 4~9장)보다 적으면 모자란 장을 AI가 그림으로 채워요. AI 그림이 싫으면 ‘내 사진만 쓰기’를 누르세요. 같은 사진을 가까이 보여 주거나 큰 글씨 장으로 채워요(AI 비용 없음). 고른 것은 다음에도 기억해요."},
  {title:"한 장만 고치기",where:"3 확인하고 올리기 → N번 장 고치기",short:"고칠 장을 띄우고 버튼을 누르거나 직접 적어 다시 만들어요.",body:"마음에 안 드는 장을 화면에 띄우고 '그림'이나 '글'을 고른 뒤, '음식을 더 크게'·'더 짧게' 같은 버튼을 누르거나 원하는 걸 직접 적고 다시 만들어요. 글은 무료, AI 그림은 그림 AI 비용이 들어요. 내 사진으로 만든 장은 다른 사진으로 바꿔 줘요. 다 되면 저절로 저장돼요."},
  {title:"글 고치기",where:"3 확인하고 올리기 → 올릴 글",short:"글 칸을 눌러 고치면 저절로 저장돼요.",body:"글 칸을 눌러 바로 고치면 잠시 뒤 저절로 저장돼요. 처음부터 새로 쓰고 싶으면 ‘글 다시 쓰기’를 누르세요."},
  {title:"카드 글자 고치기·장 넣고 빼기",where:"3 확인하고 올리기 → 더보기",short:"글자 하나 고치기, 장 빼고 넣기, 홍보 카드 켜고 끄기.",body:"카드에 적힌 글자 하나를 고치거나(글자 고치기), 장을 빼거나 새로 넣을 수 있어요(장 고치기). 맨 뒤 가게 홍보 카드도 여기서 끄고 켜요."},
  {title:"게시물은 30일 뒤 지워져요",where:"내 게시물 → 카드의 더보기 → 보관함에 넣기",short:"남기고 싶으면 ‘보관함에 넣기’를 눌러요.",body:"저장 공간을 아끼려고, 만든 지 30일이 지난 게시물은 저절로 지워져요(예약이 걸려 있어도). 계속 남기고 싶은 게시물은 보관함에 넣어 두면 지워지지 않아요. 지워지기 7일 전부터 카드에 ‘며칠 뒤 지워져요’가 보여요."},
  {title:"지난 게시물 다시 쓰기",where:"내 게시물 → 카드의 더보기 → 복제해서 고치기",short:"반응 좋던 게시물을 그대로 복제해 고쳐요.",body:"반응 좋던 게시물을 사진·글 그대로 복제해 고쳐서 올려요. 주제만 이어받으려면 ‘같은 주제로 새로’를 누르세요."},
  {title:"올릴 날짜 정해 두기",where:"내 게시물 → 올릴 날짜 · 반응 적기",short:"날짜를 정하고 ‘최종 확인 완료’를 켜면 그 시각에 올라가요.",body:"날짜와 시각을 정하고 ‘최종 확인 완료’를 켜 두면, 인스타그램을 연결한 경우 그 시각에 저절로 올라가요. 조금 늦어질 수 있고, 6시간 넘게 지나면 올리지 않아요."},
  {title:"반응 적어 두기",where:"내 게시물 → 올릴 날짜 · 반응 적기 → 성과 기록",short:"올리고 2~3일 뒤 숫자를 적으면 다음 추천에 반영돼요.",body:"올리고 2~3일 뒤 좋아요·저장·공유 수를 적으면, 어떤 주제가 잘 됐는지 ‘한 달 계획’ 화면 아래에 모이고 다음 추천에도 참고해요."},
  {title:"한 달 치 미리 정하기",where:"더보기 → 한 달 계획",short:"화·금에 올릴 주제를 계절에 맞춰 채워 둬요.",body:"매주 화·금에 올릴 주제를 계절에 맞춰 채워 둬요. 칸마다 ‘이 주제로 만들기’를 누르면 그날 저녁 6시에 올릴 게시물로 시작해요."},
  {title:"휴대폰으로 알림 받기",where:"설정 → 휴대폰 알림 → 이 휴대폰으로 알림 받기",short:"올리는 날과 예약 결과를 휴대폰 알림으로 받아요.",body:"휴대폰 크롬에서 버튼을 누르고 ‘허용’을 누르면, 올리는 날(기본 화·금 오전 10시)과 예약 글이 올라갔는지를 휴대폰 알림으로 알려 줘요. 알림을 누르면 바로 만들기 화면이 열려요. 요일·시각은 같은 곳에서 바꿔요."},
  {title:"맨 뒤 홍보 포스터 바꾸기",where:"설정 → 관리자용 설정 → 맨 뒤 홍보 포스터",short:"계절 메뉴가 바뀌면 맨 뒤 홍보 카드 그림을 바꿔요.",body:"모든 게시물 맨 뒤에 가게 이름·메뉴·주소·전화가 담긴 카드가 붙어요. 계절 메뉴가 바뀌면 새 그림을 올려 바꿔요."},
];

export default async function HelpPage() {
  await requireOwnerPage();
  return <WizardShell step="topic" section="help">
    <h1>도움말</h1>
    <p className="lead">세 번만 누르면 돼요.</p>
    <StepGuide label="만드는 순서" steps={[
      {icon:"✏️",title:"1 무엇을 올릴까요",text:"추천 주제를 누르고 ‘다음’"},
      {icon:"📷",title:"2 만들기",text:"사진 중심 또는 글 중심을 고르고 ‘만들기’"},
      {icon:"✅",title:"3 확인하고 올리기",text:"‘인스타그램에 바로 올리기’ 또는 ‘휴대폰에 저장하기’"},
    ]}/>
    <MoreInfo summary="단계별 자세한 설명">
      <p><strong>2 만들기</strong> 사진이 있으면 올려 주세요(없으면 AI가 그려요). 사진과 글이 저절로 만들어져요. 사진 없이 사진 중심을 고르면 10분쯤 걸려요.</p>
      <p><strong>3 확인하고 올리기</strong> 바로 올리기는 설정에서 인스타그램을 연결해야 쓸 수 있어요. 휴대폰에 저장하면 글도 복사돼 있으니 인스타그램 앱에서 붙여 넣으면 돼요.</p>
    </MoreInfo>
    <section className="help-tips" aria-label="가끔 쓰는 기능">
      <h2>가끔 쓰는 기능</h2>
      <ul>{TIPS.map(tip=><li key={tip.title}><strong>{tip.title}</strong><WherePath path={tip.where}/><p>{tip.short}</p><MoreInfo><p>{tip.body}</p></MoreInfo></li>)}</ul>
    </section>
    <section className="state-card notes-card" aria-label="알아두세요"><h2>알아두세요</h2>
      <ul className="icon-list">
        <li><span aria-hidden="true">🖼️</span><span>AI 그림은 실제 음식과 다를 수 있어요. 가격·영업시간은 올리기 전에 확인해요.</span></li>
        <li><span aria-hidden="true">⏳</span><span>만드는 동안 다른 메뉴에 다녀와도 계속 만들어요.</span></li>
        <li><span aria-hidden="true">🔗</span><span>인스타그램을 연결하기 전에는 저절로 올라가지 않아요.</span></li>
        <li><span aria-hidden="true">🛠️</span><span>이상하면 ‘다시 해 보기’, 계속되면 ‘관리자용 설정’을 관리하는 분께 보여 주세요.</span></li>
      </ul>
      <MoreInfo><p>‘만들기’를 누르면 만드는 화면으로 돌아와요. 만드는 중에 다른 게시물을 열거나 새로 시작하려 하면 한 번 물어요(‘취소’를 누르면 만들던 것이 그대로 이어져요).</p></MoreInfo>
    </section>
    <div className="bottom-action"><Link className="button secondary" href="/drafts">내 게시물 보기</Link><Link className="button primary big" href="/?new=1">새로 만들기</Link></div>
  </WizardShell>;
}
