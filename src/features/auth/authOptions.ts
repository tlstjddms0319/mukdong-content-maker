import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { recordLoginAttempt } from "@/features/auth/attempts";
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
      authorize: async (values) => {
        if (!isOwnerConfigured() || typeof values.password !== "string") return null;
        const accepted = await verifyOwnerPassword(values.password, process.env.OWNER_PASSWORD_HASH!);
        if (recordLoginAttempt("owner", accepted).blocked || !accepted) return null;
        return { id: "owner", name: "관리자" };
      },
    }),
  ],
} satisfies NextAuthConfig;
