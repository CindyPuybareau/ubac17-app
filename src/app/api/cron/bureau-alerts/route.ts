import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/send-email";
import {
  computeStatus,
  relanceTemplateKeyFor,
  renderRelanceTemplate,
  RELANCE_TEMPLATES,
} from "@/app/dashboard/cotisation-shared";
import type { AdminCotisation } from "@/app/dashboard/page";

// Une cotisation ou une pénalité encore due n'est jamais relancée plus
// souvent que ça — pas de date d'échéance propre à surveiller
// (contrairement à une licence), donc un cooldown plutôt qu'une fenêtre.
// Même délai pour les deux depuis que "Relance pénalités" (retour de
// Cindy du 2026-08-22) a fusionné les deux mécanismes sous un seul
// interrupteur.
const COTISATION_RELANCE_COOLDOWN_DAYS = 14;

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

type CotisationRow = {
  id: string;
  prix: number | null;
  remise: number | null;
  paiement: number | null;
  statut: string | null;
  player_id: string;
  last_auto_relance_sent_at: string | null;
  players: {
    first_name: string | null;
    last_name: string | null;
    registration_email: string | null;
    profile_id: string | null;
  } | null;
};

type PenaliteRow = {
  id: string;
  player_id: string;
  amount: number;
  notes: string | null;
  penalite_date: string | null;
  last_auto_relance_sent_at: string | null;
  players: {
    first_name: string | null;
    last_name: string | null;
    registration_email: string | null;
    profile_id: string | null;
  } | null;
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
  player: { id: string; registration_email: string | null; profile_id: string | null }
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

async function runExpiryAlerts(supabase: ReturnType<typeof createServiceClient>) {
  // Interrupteur Bureau (onglet Accueil) — désactivé par défaut : aucune
  // alerte n'est envoyée tant que le Bureau ne l'a pas explicitement
  // activée depuis l'appli.
  const { data: settings } = await supabase
    .from("club_settings")
    .select("expiry_alert_enabled")
    .eq("id", true)
    .maybeSingle();
  if (!settings?.expiry_alert_enabled) {
    return { sent: 0, skippedNoEmail: 0, checked: 0, paused: true };
  }

  // Retour de Cindy du 2026-08-22 : n'est plus une relance en continu toute
  // l'année (fenêtre glissante 30 jours) mais une seule campagne annuelle,
  // en avril, avant que la saison suivante démarre — le cron continue de
  // tourner tous les jours (voir vercel.json), mais ne fait rien en dehors
  // d'avril.
  const now = new Date();
  if (now.getMonth() !== 3 /* avril, 0-indexé */) {
    return { sent: 0, skippedNoEmail: 0, checked: 0, paused: true, reason: "hors campagne (avril uniquement)" };
  }

  // Fenêtre bornée au démarrage de la saison suivante (1er août de l'année
  // en cours, même convention "saison = août -> juillet" que le reste de
  // l'appli, voir src/lib/ffbb.ts) — pas de borne basse : une échéance déjà
  // dépassée mérite tout autant un rappel.
  const windowEndIso = `${now.getFullYear()}-08-01`;

  const { data: playersData, error } = await supabase
    .from("players")
    .select(
      "id, first_name, last_name, registration_email, profile_id, license_expires_at, license_expiry_alert_sent_at, medical_certificate_expires_at, medical_expiry_alert_sent_at"
    )
    .is("archived_at", null)
    .or("license_expires_at.not.is.null,medical_certificate_expires_at.not.is.null");

  if (error) return { sent: 0, skippedNoEmail: 0, checked: 0, error: "Erreur lors de la lecture des données." };

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
    if (dueLicense)
      lines.push(`- Licence FFBB : expire le ${formatDateFr(p.license_expires_at as string)}`);
    if (dueMedical)
      lines.push(
        `- Certificat médical : expire le ${formatDateFr(p.medical_certificate_expires_at as string)}`
      );

    const subject = `UBAC — Renouvellement à prévoir pour ${fullName}`;
    const body = `Bonjour,\n\nUn document arrive à échéance pour ${fullName} :\n${lines.join("\n")}\n\nMerci de vous rapprocher du Bureau pour le renouvellement.\n\nSportivement,\nL'UBAC`;

    const result = await sendEmail({ to: email, subject, body });
    // "simulated" (pas de fournisseur configuré, cas local) ne compte
    // jamais comme envoyé : sinon un prochain vrai passage en production
    // croirait l'alerte déjà partie alors qu'elle n'a jamais existé.
    if (result.ok && !result.simulated) {
      sent += 1;
      const update: Record<string, string> = {};
      if (dueLicense) update.license_expiry_alert_sent_at = new Date().toISOString();
      if (dueMedical) update.medical_expiry_alert_sent_at = new Date().toISOString();
      await supabase.from("players").update(update).eq("id", p.id);
    }
  }

  return { sent, skippedNoEmail, checked: (playersData ?? []).length };
}

async function runCotisationRelances(supabase: ReturnType<typeof createServiceClient>) {
  // Interrupteur Bureau (onglet Cotisations & Licences) — désactivé par
  // défaut : personne ne doit recevoir de relance automatique tant que le
  // Bureau n'a pas explicitement choisi d'activer le mécanisme.
  const { data: settings } = await supabase
    .from("club_settings")
    .select("cotisation_relance_enabled")
    .eq("id", true)
    .maybeSingle();
  if (!settings?.cotisation_relance_enabled) {
    return { sent: 0, skippedNoEmail: 0, checked: 0, paused: true };
  }

  const cooldownStart = new Date();
  cooldownStart.setDate(cooldownStart.getDate() - COTISATION_RELANCE_COOLDOWN_DAYS);
  const cooldownStartIso = cooldownStart.toISOString();

  // Même périmètre que le tableau de bord/l'onglet Cotisations & Licences :
  // seulement la cotisation saison (collecte_id nul), jamais les
  // stages/événements/boutique, qui ont leur propre suivi séparé.
  const { data: cotisationsData, error } = await supabase
    .from("cotisations")
    .select(
      "id, prix, remise, paiement, statut, player_id, last_auto_relance_sent_at, players(first_name, last_name, registration_email, profile_id)"
    )
    .is("collecte_id", null)
    .or(`last_auto_relance_sent_at.is.null,last_auto_relance_sent_at.lt.${cooldownStartIso}`);

  if (error) return { sent: 0, skippedNoEmail: 0, checked: 0, error: "Erreur lors de la lecture des données." };

  let sent = 0;
  let skippedNoEmail = 0;
  let checked = 0;

  for (const row of (cotisationsData ?? []) as unknown as CotisationRow[]) {
    const player = row.players;
    if (!player) continue;

    // AdminCotisation minimal : seuls les champs que computeStatus /
    // balanceDue / renderRelanceTemplate lisent réellement sont
    // significatifs ici, le reste est renseigné à vide.
    const cotisation: AdminCotisation = {
      id: row.id,
      saison: "",
      prix: row.prix,
      remise: row.remise,
      paiement: row.paiement,
      statut: row.statut,
      mode_paiement: null,
      playerName: [player.first_name, player.last_name].filter(Boolean).join(" ") || "ce membre",
      firstName: player.first_name,
      lastName: player.last_name,
      category: null,
      playerId: row.player_id,
      membershipType: null,
      fbiStatus: null,
      collecteId: null,
      collecteType: null,
      collecteName: null,
      payments: [],
    };

    const status = computeStatus(cotisation);
    if (status !== "EN_ATTENTE" && status !== "PARTIEL") continue;
    checked += 1;

    const email = await resolveContactEmail(supabase, {
      id: row.player_id,
      registration_email: player.registration_email,
      profile_id: player.profile_id,
    });
    if (!email) {
      skippedNoEmail += 1;
      continue;
    }

    const tpl = RELANCE_TEMPLATES[relanceTemplateKeyFor(cotisation)];
    const subject = renderRelanceTemplate(tpl.subject, cotisation);
    const body = renderRelanceTemplate(tpl.body, cotisation);

    const result = await sendEmail({ to: email, subject, body });
    // Même garde-fou que runExpiryAlerts : un envoi simulé (pas de
    // fournisseur configuré) ne doit jamais poser last_auto_relance_sent_at.
    if (result.ok && !result.simulated) {
      sent += 1;
      await supabase
        .from("cotisations")
        .update({ last_auto_relance_sent_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  return { sent, skippedNoEmail, checked };
}

// Retour de Cindy du 2026-08-22 : "Relance pénalités" — même interrupteur
// que les cotisations (cotisation_relance_enabled), même cooldown, mais un
// message simple plutôt que le système de templates par saison/tarif de
// RELANCE_TEMPLATES (pensé pour les cotisations, sans rapport avec une
// pénalité ponctuelle).
async function runPenaliteRelances(supabase: ReturnType<typeof createServiceClient>) {
  const { data: settings } = await supabase
    .from("club_settings")
    .select("cotisation_relance_enabled")
    .eq("id", true)
    .maybeSingle();
  if (!settings?.cotisation_relance_enabled) {
    return { sent: 0, skippedNoEmail: 0, checked: 0, paused: true };
  }

  const cooldownStart = new Date();
  cooldownStart.setDate(cooldownStart.getDate() - COTISATION_RELANCE_COOLDOWN_DAYS);
  const cooldownStartIso = cooldownStart.toISOString();

  const { data: penalitesData, error } = await supabase
    .from("penalites")
    .select(
      "id, player_id, amount, notes, penalite_date, last_auto_relance_sent_at, players(first_name, last_name, registration_email, profile_id)"
    )
    .eq("statut", "EN_ATTENTE")
    .or(`last_auto_relance_sent_at.is.null,last_auto_relance_sent_at.lt.${cooldownStartIso}`);

  if (error) return { sent: 0, skippedNoEmail: 0, checked: 0, error: "Erreur lors de la lecture des données." };

  let sent = 0;
  let skippedNoEmail = 0;
  let checked = 0;

  for (const row of (penalitesData ?? []) as unknown as PenaliteRow[]) {
    const player = row.players;
    if (!player) continue;
    checked += 1;

    const fullName = [player.first_name, player.last_name].filter(Boolean).join(" ") || "ce membre";
    const email = await resolveContactEmail(supabase, {
      id: row.player_id,
      registration_email: player.registration_email,
      profile_id: player.profile_id,
    });
    if (!email) {
      skippedNoEmail += 1;
      continue;
    }

    const amountFr = row.amount.toLocaleString("fr-FR", { minimumFractionDigits: 2 });
    const dateLine = row.penalite_date ? ` (${formatDateFr(row.penalite_date)})` : "";
    const notesLine = row.notes ? `\nMotif : ${row.notes}` : "";
    const subject = `UBAC — Pénalité à régler pour ${fullName}`;
    const body = `Bonjour,\n\nUne pénalité de ${amountFr} €${dateLine} reste à régler pour ${fullName}.${notesLine}\n\nMerci de vous rapprocher du Bureau pour le règlement.\n\nSportivement,\nL'UBAC`;

    const result = await sendEmail({ to: email, subject, body });
    if (result.ok && !result.simulated) {
      sent += 1;
      await supabase
        .from("penalites")
        .update({ last_auto_relance_sent_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  return { sent, skippedNoEmail, checked };
}

// Rappels Bureau automatiques, tous regroupés dans une seule tâche
// planifiée (le plan Vercel Hobby plafonne à 2 crons — /api/cron/match-
// reminders occupe déjà le premier) : échéances (licence FFBB, certificat
// médical) + relance des cotisations encore impayées. Déclenché une fois
// par jour (voir vercel.json), protégé par CRON_SECRET. Fermé par défaut
// (fail closed) : sans la variable posée côté Vercel, la route refuse
// tout appel plutôt que de rester ouverte à qui la devine.
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET non configuré." }, { status: 500 });
  }
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  let supabase: ReturnType<typeof createServiceClient>;
  try {
    supabase = createServiceClient();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  const [expiry, cotisations, penalites] = await Promise.all([
    runExpiryAlerts(supabase),
    runCotisationRelances(supabase),
    runPenaliteRelances(supabase),
  ]);

  return NextResponse.json({ expiry, cotisations, penalites });
}
