import Link from "next/link";
import { WizardShell } from "@/components/wizard/WizardShell";
import { requireOwnerPage } from "@/features/auth/guard";

export const dynamic = "force-dynamic";

// 도움말: 사장님이 처음 쓸 때 볼 순서와, 자주 쓰는 기능이 어디 있는지를 짧게 안내한다.
// 자세한 동작 설명은 docs/APP_OPERATION_GUIDE.ko.md에 있고, 여기에는 화면에서 바로 찾을 수 있는 이름만 쓴다.
const TIPS:Array<{title:string;where:string;body:string}>=[
  {title:"한 달 치 미리 기획하기",where:"내 초안 → 한 달 콘텐츠 기획",body:"매주 화·금 게시일에 계절·명절에 맞는 주제와 디자인을 채워 둬요. 칸마다 '이 주제로 초안 시작'을 누르면 그 날짜 저녁 6시 게시 예정으로 초안이 만들어지고, 칸에 진행 상태가 표시돼요."},
  {title:"내 사진으로 캐러셀",where:"새 초안 → 이미지 → 실제 사진 사용",body:"사진을 최대 10장 올리면 첫 사진을 표지로 카드를 그려요. AI 이미지 비용이 들지 않아요. 사진은 장마다 한 장씩 먼저 넣고, 남으면 한 장에 여러 컷으로 넣어요. 못 넣은 사진은 알려 주니 장마다 사진을 바꿔 넣으세요."},
  {title:"장 빼기·새 장 넣기",where:"이미지 단계 → 장 고치기",body:"완성된 캐러셀에서 지금 보는 장을 빼거나, 그 뒤에 사진·글자 카드 장을 넣을 수 있어요(최대 10장). 장 번호는 자동으로 다시 그려요(무료). 고친 뒤 '이 캐러셀 사용'을 다시 눌러 저장하세요."},
  {title:"카드 글자 바로 고치기",where:"이미지 단계 → N번 장 글자 고치기",body:"오타나 표현 하나 때문에 다시 만들 필요 없어요. 제목·요점을 고치고 '글자만 다시 그리기'를 누르면 그 장만 바뀌어요(무료)."},
  {title:"지난 글 다시 쓰기",where:"내 초안 → 복제해서 고치기",body:"반응 좋던 글을 사진·문안 그대로 복제해 디자인이나 문안만 바꿔 올려요. 주제만 이어받으려면 '같은 주제로 새로'를 누르세요."},
  {title:"성과 적어 두기",where:"내 초안 → 성과 기록",body:"올리고 2~3일 뒤 인사이트의 좋아요·저장·공유 수를 적으면, 어떤 주제·디자인·요일이 잘 됐는지 '성과 돌아보기'에 모이고 다음 주제 추천에도 참고돼요."},
  {title:"맨 뒤 가게 홍보 포스터",where:"이미지 단계 → 장 고치기",body:"모든 캐러셀 맨 뒤에 가게 이름·메뉴·주소·전화가 담긴 포스터가 붙어요. 필요 없으면 '맨 뒤에 가게 홍보 카드 붙이기'를 꺼요. 계절 메뉴가 바뀌면 설정 → '맨 뒤 홍보 포스터'에서 새 그림을 올려 바꾸고, '기본 포스터로 되돌리기'로 원래대로 돌려요."},
  {title:"계절 소품·파노라마",where:"이미지 단계 → 디자인 고르기",body:"'계절 소품'으로 빗줄기·보름달·색동 띠 같은 장식을 고르거나 끌 수 있어요. 표지 사진이 가로로 길면 표지와 2번째 장을 한 장의 사진으로 이을 수 있어요."},
  {title:"사진이 글과 맞는지",where:"실제 사진 사용 → 고른 사진",body:"과메기 글에 삼합 사진처럼 메뉴가 다르면 '메뉴 다름'이 떠요. 보관함 사진에 '과메기'·'삼합'처럼 메뉴 이름 태그를 달아 두면 더 정확해요."},
  {title:"AI 사용량 보기",where:"설정 → AI 사용량",body:"AI별로 오늘·이번 달 얼마나 썼는지, 언제 한도에 걸렸는지 보여 줘요. 정확한 남은 양은 카드의 대시보드 링크에서 확인해요."},
  {title:"AI가 잘 되는지 확인",where:"설정 → AI 연결 실제 점검",body:"추천·문안·이미지가 이상하면 이 버튼으로 각 AI가 실제로 답하는지 확인하세요. 키 값은 화면에 나오지 않아요."},
];

export default async function HelpPage() {
  await requireOwnerPage();
  return <WizardShell step="topic" section="help">
    <p className="eyebrow">도움말</p>
    <h1>처음 사용한다면</h1>
    <p className="lead">주제부터 게시까지 네 단계면 돼요. 휴대폰으로도 똑같이 쓸 수 있어요.</p>
    <ol className="help-steps">
      <li><strong>주제를 고르세요.</strong> 이번 계절에 맞춘 추천 3개 중에 고르거나 직접 적어요. 콘텐츠 자료의 아이디어나 한 달 기획에서 시작해도 돼요.</li>
      <li><strong>이미지를 만드세요.</strong> 내 사진으로 캐러셀을 만들거나(무료), AI 이미지·무료 카드 편집을 쓸 수 있어요. 디자인 계열을 골라 분위기를 바꿀 수 있어요.</li>
      <li><strong>문안을 확인하세요.</strong> 첫 문장 후보 중에 고르고, 가격·영업시간·효능처럼 확인이 필요한 내용은 직접 고쳐 주세요.</li>
      <li><strong>올리거나 내려받으세요.</strong> 최종 확인 화면에서 ZIP을 받아 Instagram 앱에서 올리거나, Instagram을 연결했다면 바로 게시해요. 내 초안에서 게시 희망일시를 정하고 ‘최종 확인 완료’를 켜 두면 그 시각에 자동으로 올라가요.</li>
    </ol>
    <section className="help-tips" aria-label="자주 쓰는 기능">
      <h2>자주 쓰는 기능</h2>
      <ul>{TIPS.map(tip=><li key={tip.title}><strong>{tip.title}</strong><small>{tip.where}</small><p>{tip.body}</p></li>)}</ul>
    </section>
    <div className="state-card"><h2>알아두세요</h2>
      <p>AI 사용에는 계정 설정에 따라 비용이 들 수 있어요. 이미지 생성이 안 되면 내 사진으로 진행하세요. AI 이미지는 실제 메뉴와 다를 수 있으니 올리기 전에 꼭 확인해 주세요.</p>
      <p>Instagram 연결 전에는 자동 게시되지 않아요. 추천 주제는 계절·명절, 내가 적은 성과, 그리고 네이버 키를 넣었다면 요즘 검색이 늘어난 음식 말을 참고해요. 추천 음악은 Instagram 보관함에서 직접 검색하고 사용 가능 여부를 확인해 주세요.</p>
    </div>
    <div className="bottom-action"><Link className="button primary" href="/?new=1">새 초안 만들기</Link><Link className="button secondary" href="/drafts">내 초안 보기</Link><Link className="button secondary" href="/images">이미지 제작실</Link><Link className="button secondary" href="/settings">설정 보기</Link></div>
  </WizardShell>;
}
