import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { emailProviderConfigured, sendEmail } from "@/lib/send-email";

// Lets the client know upfront whether automatic sending is available, so
// the relance modal can offer the right button (direct 1-click send vs
// guided manual draft) instead of only finding out after a failed POST —
// which would also mean opening Gmail after an async gap, i.e. straight
// into the browser's popup blocker.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const provider = emailProviderConfigured();
  return NextResponse.json({ configured: provider !== null, provider });
}

export async function POST(request: Request) {
  const { to, subject, body, attachmentBase64, attachmentFilename } = await request.json();

  if (!to || !subject || !body) {
    return NextResponse.json(
      { error: "Destinataire, objet et message sont requis." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  // Cette route envoie un email "au nom du club" via le provider configuré
  // (Resend/Gmail), sans aucune limite de destinataire ni de contenu — elle
  // n'est censée servir qu'à la relance de cotisation depuis les écrans
  // Bureau (email-template-modal.tsx, cotisation-participants-table.tsx).
  // Sans ce contrôle, n'importe quel compte connecté (un simple parent)
  // pouvait faire partir un email arbitraire vers n'importe quelle adresse
  // avec la légitimité du domaine d'envoi du club.
  const { data: adminRow } = await supabase
    .from("club_administrators")
    .select("email")
    .eq("email", (user.email ?? "").toLowerCase())
    .maybeSingle();

  if (!adminRow) {
    return NextResponse.json({ error: "Réservé au Bureau." }, { status: 403 });
  }

  const result = await sendEmail({ to, subject, body, attachmentBase64, attachmentFilename });

  if (!result.ok) {
    const status = result.error.startsWith("Service d'envoi") ? 503 : 502;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ success: true, simulated: result.simulated ?? false });
}
