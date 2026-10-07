import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { clientAddress, recordOwnerLogin } from "@/features/auth/attempts";
import { isOwnerConfigured } from "@/features/auth/config";
import { verifyOwnerPassword } from "@/features/auth/password";

const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;


export const ownerAuthConfig = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/login" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        if (user.id !== "owner") return null;
        token.ownerDeadline = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
      }
      if (token.sub !== "owner" || typeof token.ownerDeadline !== "number" || Date.now() >= token.ownerDeadline) return null;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub === "owner" && typeof token.ownerDeadline === "number") {
        session.user.id = "owner";
        session.expires = new Date(token.ownerDeadline).toISOString() as typeof session.expires;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      credentials: { password: {} },
      authorize: async (values, request) => {
        if (!isOwnerConfigured() || typeof values.password !== "string") return null;
        const accepted = await verifyOwnerPassword(values.password, process.env.OWNER_PASSWORD_HASH!);
        // 잠긴 경우는 "암호가 틀림"과 다른 안내를 보여 주도록 code를 붙여 던진다(로그인 화면이 error=locked로 받는다).
        if (recordOwnerLogin(clientAddress(request?.headers), accepted).blocked) {
          // next-auth 본체는 서버에서만 불러온다(이 설정 파일을 읽는 테스트 환경에서 next/server를 끌어오지 않게).
          const { CredentialsSignin } = await import("next-auth");
          const locked = new CredentialsSignin();
          locked.code = "locked";
          throw locked;
        }
        if (!accepted) return null;
        return { id: "owner", name: "관리자" };
      },
    }),
  ],
} satisfies NextAuthConfig;
