import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import Image from "next/image";
import ChildLoginForm from "./child-login-form";
import { CHILD_SESSION_COOKIE, verifyChildSession } from "@/lib/child-session";

// Route délibérément anonyme, même famille de solution que
// /api/calendar/[token] : c'est family_access_children() qui fait office
// de contrôle d'accès, donc le client anonyme habituel suffit — jamais de
// clé de service ici.
export default async function ChildLoginPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  // Un enfant qui a ajouté ce lien à son écran d'accueil (PWA) le
  // rouvrira ici à chaque fois, jamais directement sur /enfant/view — le
  // cookie de session (400 jours, voir child-session.ts) doit donc être
  // revérifié à cette entrée-là aussi, pas seulement sur /enfant/view.
  const cookieStore = await cookies();
  if (verifyChildSession(cookieStore.get(CHILD_SESSION_COOKIE)?.value)) {
    redirect("/enfant/view");
  }

  const { code } = await params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data } = await supabase.rpc("family_access_children", { p_code: code });
  const children = (data ?? []) as { id: string; first_name: string | null }[];

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <Image
            src="/logo.png"
            alt="UBAC"
            width={48}
            height={48}
            className="mx-auto h-12 w-12 object-contain"
            priority
          />
          <h1 className="mt-3 text-xl font-bold text-zinc-900">Espace enfant</h1>
          <p className="mt-1 text-sm text-zinc-500">Choisis ton prénom</p>
        </div>

        {children.length === 0 ? (
          <p className="text-center text-sm text-zinc-500">
            Ce lien n&apos;a plus aucun enfant avec un code configuré. Demande à
            un parent de vérifier dans son espace UBAC.
          </p>
        ) : (
          <ChildLoginForm code={code} children={children} />
        )}
      </div>
    </div>
  );
}
