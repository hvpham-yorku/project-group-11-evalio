"use client"

import React from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 5 * 60 * 1000,
      },
    },
  })
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(() => makeClient())
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
