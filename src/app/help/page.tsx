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
      <li><strong>주제를 고르세요.</strong> 추천에서 고르거나 직접 적을 수 있어요.</li>
      <li><strong>이미지를 선택하세요.</strong> 실제 사진을 올리거나 AI 이미지를 만들 수 있어요. 여러 장 슬라이드도 만들 수 있어요.</li>
      <li><strong>문안을 확인하세요.</strong> 만들어진 글을 읽고 직접 고쳐 주세요.</li>
      <li><strong>저장하거나 내려받으세요.</strong> 나중에 내 초안에서 다시 열 수 있어요.</li>
    </ol>
    <div className="state-card"><h2>알아두세요</h2>
      <p>AI 사용에는 계정 설정에 따라 비용이 들 수 있어요. 이미지 생성이 안 되면 직접 사진을 올려 진행하세요.</p>
      <p>Instagram 자동 게시와 실시간 인기 주제 수집은 기본 제작 기능에 포함되지 않아요.</p>
    </div>
    <div className="bottom-action"><Link className="button primary" href="/">새 초안 만들기</Link><Link className="button secondary" href="/drafts">내 초안 보기</Link><Link className="button secondary" href="/images">이미지 제작실</Link><Link className="button secondary" href="/settings">설정 보기</Link></div>
  </WizardShell>;
}
