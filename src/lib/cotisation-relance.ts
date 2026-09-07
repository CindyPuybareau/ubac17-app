import { createServiceClient } from "@/lib/supabase/service";
import { sendEmail } from "@/lib/send-email";
import {
  computeStatus,
  relanceTemplateKeyFor,
  renderRelanceTemplate,
  RELANCE_TEMPLATES,
} from "@/app/dashboard/cotisation-shared";
import type { AdminCotisation } from "@/app/dashboard/page";

// Extrait de /api/cron/bureau-alerts (retour de Cindy du 07/09, bouton
// "Relancer" à la demande sur la carte KPI Bureau) : la logique d'envoi
// elle-même ne dépend pas de QUI l'a déclenchée (le cron quotidien, ou un
// clic Bureau) -- seul l'appelant décide s'il respecte l'interrupteur
// "Relances automatiques" (le cron, oui ; un clic manuel explicite, non :
// voir relance-now/route.ts).
export const COTISATION_RELANCE_COOLDOWN_DAYS = 14;

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

// Même priorité que memberEmail dans page.tsx (registration_email de la
// fiche d'abord, sinon l'email du compte lié — le sien s'il en a un,
// sinon celui d'un parent) : reconstruite ici en requêtes directes,
// service_role oblige (pas de session à faire porter la RLS).
export async function resolveContactEmail(
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

export type CotisationRelanceResult = {
  sent: number;
  skippedNoEmail: number;
  checked: number;
  error?: string;
};

// `respectCooldown` : true pour le cron quotidien (jamais plus d'une
// relance tous les 14 jours par cotisation) ; le bouton manuel (retour de
// Cindy du 07/09 : "respecter les 14 jours") le passe aussi à true --
// prévu à false pour une éventuelle relance forcée future, jamais utilisé
// aujourd'hui.
export async function sendCotisationRelances(
  supabase: ReturnType<typeof createServiceClient>,
  { respectCooldown = true }: { respectCooldown?: boolean } = {}
): Promise<CotisationRelanceResult> {
  let query = supabase
    .from("cotisations")
    .select(
      "id, prix, remise, paiement, statut, player_id, last_auto_relance_sent_at, players(first_name, last_name, registration_email, profile_id)"
    )
    // Même périmètre que le tableau de bord/l'onglet Cotisations &
    // Licences : seulement la cotisation saison (collecte_id nul), jamais
    // les stages/événements/boutique, qui ont leur propre suivi séparé.
    .is("collecte_id", null);

  if (respectCooldown) {
    const cooldownStart = new Date();
    cooldownStart.setDate(cooldownStart.getDate() - COTISATION_RELANCE_COOLDOWN_DAYS);
    query = query.or(`last_auto_relance_sent_at.is.null,last_auto_relance_sent_at.lt.${cooldownStart.toISOString()}`);
  }

  const { data: cotisationsData, error } = await query;
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
      createdAt: null,
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
    // Un envoi simulé (pas de fournisseur configuré, cas local) ne doit
    // jamais poser last_auto_relance_sent_at, ni compter comme envoyé --
    // sinon un prochain vrai passage croirait la relance déjà partie.
    if (result.ok && !result.simulated) {
      sent += 1;
      const { error: markSentError } = await supabase
        .from("cotisations")
        .update({ last_auto_relance_sent_at: new Date().toISOString() })
        .eq("id", row.id);
      if (markSentError) {
        console.error("[cotisation-relance] marquage relance cotisation échoué:", markSentError);
      }
    }
  }

  return { sent, skippedNoEmail, checked };
}
