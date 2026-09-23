import NextAuth from "next-auth";
import { ownerAuthConfig } from "@/features/auth/authOptions";

export const { auth, handlers, signIn, signOut } = NextAuth(ownerAuthConfig);
