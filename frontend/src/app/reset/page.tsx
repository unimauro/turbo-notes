import type { Metadata } from "next";

import AuthScreen from "@/components/AuthScreen";

export const metadata: Metadata = { title: "Reset Password · Turbo Notes" };

export default function ResetPage() {
  return <AuthScreen mode="reset" />;
}
