import Link from "next/link";
import { WizardShell } from "@/components/wizard/WizardShell";
import { requireOwnerPage } from "@/features/auth/guard";

export const dynamic = "force-dynamic";

export default async function HelpPage() {
  await requireOwnerPage();
  return <WizardShell step="topic" section="help">
    <p className="eyebrow">도움말</p>
    <h1>처음 사용한다면</h1>
    <p className="lead">주제부터 게시물 파일까지 순서대로 만들 수 있어요.</p>
    <ol className="help-steps">
      <li><strong>주제를 고르세요.</strong> 콘텐츠 자료의 4주 아이디어 12개에서 고르거나 직접 적을 수 있어요.</li>
      <li><strong>이미지를 선택하세요.</strong> 실제 사진을 올리거나 AI 이미지를 만들 수 있어요. 여러 장 슬라이드도 만들 수 있어요.</li>
      <li><strong>문안을 확인하세요.</strong> 만들어진 글을 읽고 직접 고쳐 주세요.</li>
      <li><strong>저장하거나 내려받으세요.</strong> 해시태그와 음악 검색어를 확인하고 ZIP을 받은 뒤 Instagram 앱에서 직접 게시하세요. 설정에서 Instagram을 연결했다면 최종 확인 화면에서 바로 게시하거나, 내 초안 달력에 게시 희망일시를 정해 자동으로 게시할 수도 있어요.</li>
    </ol>
    <div className="state-card"><h2>알아두세요</h2>
      <p>AI 사용에는 계정 설정에 따라 비용이 들 수 있어요. 이미지 생성이 안 되면 직접 사진을 올려 진행하세요.</p>
      <p>Instagram 연결 전에는 자동 게시되지 않아요. 추천 주제는 오늘 날짜의 계절과 명절·복날·김장철 같은 시기를 반영하지만, 실시간 검색 인기도는 아직 반영하지 않아요. 추천 음악은 Instagram 보관함에서 직접 검색하고 사용 가능 여부를 확인해 주세요.</p>
    </div>
    <div className="bottom-action"><Link className="button primary" href="/?new=1">새 초안 만들기</Link><Link className="button secondary" href="/drafts">내 초안 보기</Link><Link className="button secondary" href="/images">이미지 제작실</Link><Link className="button secondary" href="/settings">설정 보기</Link></div>
  </WizardShell>;
}
