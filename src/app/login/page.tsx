import { login } from "@/features/auth/actions";
import { isOwnerConfigured } from "@/features/auth/config";
import { safeReturnPath } from "@/features/auth/routes";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const configured = isOwnerConfigured();

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand"><span className="brand-mark" aria-hidden="true" />묵동 콘텐츠 메이커</div>
        <h1 id="login-title">관리자 로그인</h1>
        <p>이 앱을 사용하는 관리자 암호를 입력하세요.</p>
        {!configured ? (
          <p role="status">관리자 로그인 설정이 필요합니다. 서버 관리자에게 문의하세요.</p>
        ) : (
          <form action={login} className="login-form">
            <input type="hidden" name="next" value={safeReturnPath(next ?? null)} />
            <label htmlFor="owner-password">관리자 암호</label>
            <input id="owner-password" name="password" type="password" autoComplete="current-password" required />
            {error === "locked" ? <p role="alert">로그인 시도가 너무 많아 15분 동안 막았어요. 잠시 뒤 다시 시도해 주세요.</p>
              : error && <p role="alert">암호가 올바르지 않습니다. 다시 시도하세요.</p>}
            <button className="button login-submit" type="submit">로그인</button>
          </form>
        )}
        <p className="login-note">로그인 상태는 최대 8시간 유지되며 브라우저를 닫아도 유지될 수 있습니다.</p>
      </section>
    </main>
  );
}
