// src/app/page.tsx
// Placeholder — replaced in Phase 5.
// proxy.ts redirects all unauthenticated requests to /login,
// so this root page is only reached by authenticated users.
// In Phase 5 this will redirect to /dashboard.

import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/dashboard");
}