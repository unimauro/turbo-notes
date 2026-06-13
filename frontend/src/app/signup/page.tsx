import type { Metadata } from "next";

import AuthScreen from "@/components/AuthScreen";

export const metadata: Metadata = { title: "Sign Up · Turbo Notes" };

export default function SignupPage() {
  return <AuthScreen mode="signup" />;
}
