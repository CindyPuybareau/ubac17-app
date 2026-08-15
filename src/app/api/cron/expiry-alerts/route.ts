import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/send-email";

type PlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  registration_email: string | null;
  profile_id: string | null;
  license_expires_at: string | null;
  license_expiry_alert_sent_at: string | null;
  medical_certificate_expires_at: string | null;
  medical_expiry_alert_sent_at: string | null;
};

function formatDateFr(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Même priorité que memberEmail dans page.tsx (registration_email de la
// fiche d'abord, sinon l'email du compte lié — le sien s'il en a un,
// sinon celui d'un parent) : reconstruite ici en requêtes directes,
// service_role oblige (pas de session à faire porter la RLS).
async function resolveContactEmail(
  supabase: ReturnType<typeof createServiceClient>,
  player: PlayerRow
): Promise<string | null> {
  if (player.registration_email) return player.registration_email;

  if (player.profile_id) {
    const { data } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", player.profile_id)
      .maybeSingle();
    if (data?.email) return data.email;
  }

  const { data: parentRow } = await supabase
    .from("parent_player")
    .select("profiles(email)")
    .eq("player_id", player.id)
    .limit(1)
    .maybeSingle();
  const parentProfile = parentRow?.profiles as unknown as { email: string | null } | null;
  return parentProfile?.email ?? null;
}

// Rappel automatique d'échéance (licence FFBB, certificat médical) — même
// principe que /api/cron/match-reminders : personne n'a à y penser.
// Déclenché une fois par jour par Vercel Cron (voir vercel.json), protégé
// par CRON_SECRET.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
    }
  }

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // Fenêtre large (30 jours), bornée seulement en haut : une échéance déjà
  // dépassée mérite tout autant un rappel qu'une échéance à venir — pas de
  // borne basse.
  const windowEnd = new Date();
  windowEnd.setDate(windowEnd.getDate() + 30);
  const windowEndIso = windowEnd.toISOString().slice(0, 10);

  const { data: playersData, error } = await supabase
    .from("players")
    .select(
      "id, first_name, last_name, registration_email, profile_id, license_expires_at, license_expiry_alert_sent_at, medical_certificate_expires_at, medical_expiry_alert_sent_at"
    )
    .is("archived_at", null)
    .or("license_expires_at.not.is.null,medical_certificate_expires_at.not.is.null");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;
  let skippedNoEmail = 0;

  for (const p of (playersData ?? []) as PlayerRow[]) {
    const dueLicense = Boolean(
      p.license_expires_at &&
        !p.license_expiry_alert_sent_at &&
        p.license_expires_at <= windowEndIso
    );
    const dueMedical = Boolean(
      p.medical_certificate_expires_at &&
        !p.medical_expiry_alert_sent_at &&
        p.medical_certificate_expires_at <= windowEndIso
    );
    if (!dueLicense && !dueMedical) continue;

    const email = await resolveContactEmail(supabase, p);
    const fullName = [p.first_name, p.last_name].filter(Boolean).join(" ") || "ce membre";

    // Pas d'email trouvé : ni envoyé ni marqué "alerté" — si un email est
    // ajouté plus tard sur la fiche, le prochain passage du cron enverra
    // normalement le rappel au lieu de rester bloqué indéfiniment.
    if (!email) {
      skippedNoEmail += 1;
      continue;
    }

    const lines: string[] = [];
    if (dueLicense) lines.push(`- Licence FFBB : expire le ${formatDateFr(p.license_expires_at as string)}`);
    if (dueMedical)
      lines.push(
        `- Certificat médical : expire le ${formatDateFr(p.medical_certificate_expires_at as string)}`
      );

    const subject = `UBAC — Renouvellement à prévoir pour ${fullName}`;
    const body = `Bonjour,\n\nUn document arrive à échéance pour ${fullName} :\n${lines.join("\n")}\n\nMerci de vous rapprocher du Bureau pour le renouvellement.\n\nSportivement,\nL'UBAC`;

    const result = await sendEmail({ to: email, subject, body });
    if (result.ok) {
      sent += 1;
      const update: Record<string, string> = {};
      if (dueLicense) update.license_expiry_alert_sent_at = new Date().toISOString();
      if (dueMedical) update.medical_expiry_alert_sent_at = new Date().toISOString();
      await supabase.from("players").update(update).eq("id", p.id);
    }
  }

  return NextResponse.json({ sent, skippedNoEmail, checked: (playersData ?? []).length });
}
