"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { AuthProvider } from "@/lib/auth-context";
import { makeQueryClient } from "@/lib/queryClient";

export default function Providers({ children }: { children: ReactNode }) {
  // useState keeps the client stable across re-renders without useMemo caveats.
  const [client] = useState(makeQueryClient);
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
