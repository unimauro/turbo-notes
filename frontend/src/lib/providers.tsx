"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

import { makeQueryClient } from "@/lib/queryClient";

export default function Providers({ children }: { children: ReactNode }) {
  // useState keeps the client stable across re-renders without useMemo caveats.
  const [client] = useState(makeQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
