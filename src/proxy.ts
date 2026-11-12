import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // api/version : simple constante lue par version-watcher.tsx, aucun
    // besoin de session -- exclue pour ne coûter aucun appel d'auth.
    "/((?!_next/static|_next/image|favicon.ico|api/version|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
