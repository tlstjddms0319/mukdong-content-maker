import Link from "next/link";
import { WizardShell } from "@/components/wizard/WizardShell";
import { requireOwnerPage } from "@/features/auth/guard";
import { LIBRARY_TOPICS } from "@/features/topics/library";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  await requireOwnerPage();
  return <WizardShell step="topic" section="library">
    <p className="eyebrow">콘텐츠 자료</p>
    <h1>어떤 이야기로 시작할까요?</h1>
    <p className="lead">미리 준비한 아이디어예요. 실시간 인기 주제는 아니에요.</p>
    <div className="library-grid">{LIBRARY_TOPICS.map(card=><article className="library-card" key={card.title}>
      <h2>{card.title}</h2><p>{card.intent}</p>
      <dl><dt>사진 힌트</dt><dd>{card.imageHint}</dd><dt>게시 전 확인</dt><dd>{card.factCheck}</dd></dl>
      <Link className="button secondary" href={`/?topic=${encodeURIComponent(card.title)}`}>이 주제로 초안 시작</Link>
    </article>)}</div>
  </WizardShell>;
}
