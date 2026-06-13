import type { Metadata } from "next";

import AuthScreen from "@/components/AuthScreen";

export const metadata: Metadata = { title: "Login · Turbo Notes" };

export default function LoginPage() {
  return <AuthScreen mode="login" />;
}
