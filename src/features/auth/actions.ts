"use server";

import { redirect } from "next/navigation";
import { isOwnerConfigured } from "@/features/auth/config";
import { safeReturnPath } from "@/features/auth/routes";

export async function login(formData: FormData): Promise<void> {
  const destination = safeReturnPath(String(formData.get("next") ?? "/"));
  if (!isOwnerConfigured()) redirect("/login?error=setup");
  const [{ AuthError }, { signIn }] = await Promise.all([import("next-auth"), import("@/auth")]);

  try {
    await signIn("credentials", {
      password: formData.get("password"),
      redirectTo: destination,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // 틀린 암호(invalid)와, 시도가 너무 많아 잠시 막힌 경우(locked)를 나눠 알린다.
      const locked = (error as { code?: unknown }).code === "locked";
      redirect(`/login?error=${locked ? "locked" : "invalid"}&next=${encodeURIComponent(destination)}`);
    }
    throw error;
  }
}

export async function logout(): Promise<void> {
  const { signOut } = await import("@/auth");
  await signOut({ redirectTo: "/login" });
}
