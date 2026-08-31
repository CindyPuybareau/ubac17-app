import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeNameForMatching } from "./names";
import { suggestTeamCategory } from "./team-assignment";
import { notifyCoachesOfNewTeamMember } from "./member-notifications";

// Cœur de la correspondance/fusion d'une inscription — extrait le 31/08
// pour être appelé aussi bien par une soumission ponctuelle (webhook
// formulaire Google) que, plus tard si besoin, par l'import Excel groupé.
// Contrairement à import-inscriptions.tsx (qui traite tout un fichier à la
// fois et déduplique entre les lignes d'un même import), ceci traite UNE
// inscription isolée — pas de notion de "doublon dans le même lot" ici.

export type RegistrationInput = {
  firstName: string;
  lastName: string;
  birthDate: string | null; // "YYYY-MM-DD"
  sex: string | null;
  licenseType: string | null;
  parentEmail: string | null;
  registrationEmail: string | null;
  registrationPhone: string | null;
  address: string | null;
  postalCode: string | null;
  city: string | null;
  secondaryEmail: string | null;
  motherPhone: string | null;
  fatherPhone: string | null;
  otherPhones: string | null;
  secondaryAddress: string | null;
  licenseNumber: string | null;
  membershipType: string | null;
  fbiStatus: string | null;
  medicalNotes: string | null;
  otherNotes: string | null;
  imageRights: string | null;
  playerCharterAccepted: string | null;
  parentCharterAccepted: string | null;
};

// Champs bruts -> colonnes players. Même liste que playerFields() dans
// import-inscriptions.tsx (audit du 31/08) — category est calculée à part
// ici (voir suggestTeamCategory), jamais reprise d'un texte libre puisque
// le formulaire ne fournit pas de "Catégorie" pré-remplie comme le fichier
// Excel historique.
function toPlayerFields(input: RegistrationInput) {
  return {
    first_name: input.firstName,
    last_name: input.lastName,
    birth_date: input.birthDate,
    pending_parent_email: input.parentEmail,
    sex: input.sex,
    registration_email: input.registrationEmail,
    registration_phone: input.registrationPhone,
    address: input.address,
    postal_code: input.postalCode,
    city: input.city,
    secondary_email: input.secondaryEmail,
    mother_phone: input.motherPhone,
    father_phone: input.fatherPhone,
    other_phones: input.otherPhones,
    secondary_address: input.secondaryAddress,
    membership_type: input.membershipType,
    fbi_status: input.fbiStatus,
    medical_notes: input.medicalNotes,
    other_notes: input.otherNotes,
    image_rights: input.imageRights,
    player_charter_accepted: input.playerCharterAccepted,
    parent_charter_accepted: input.parentCharterAccepted,
    license_number: input.licenseNumber,
  };
}

// Même principe que mergedPlayerFields() dans import-inscriptions.tsx
// (audit du 31/08) : une valeur vide de la soumission ne doit jamais
// effacer un champ déjà rempli en base.
function mergeKeepingExisting<T extends Record<string, unknown>>(
  fresh: T,
  existing: Record<string, unknown> | null | undefined
): T {
  if (!existing) return fresh;
  const merged = { ...fresh } as Record<string, unknown>;
  Object.keys(merged).forEach((key) => {
    if (merged[key] === null && existing[key] != null) {
      merged[key] = existing[key];
    }
  });
  return merged as T;
}

export type MatchResult =
  | { kind: "inserted"; playerId: string; teamAssigned: string | null }
  | { kind: "updated"; playerId: string; teamAssigned: string | null }
  | { kind: "uncertain"; candidateId: string; candidateName: string }
  | { kind: "error"; message: string };

export async function matchAndUpsertPlayer(
  supabase: SupabaseClient,
  input: RegistrationInput
): Promise<MatchResult> {
  if (!input.firstName.trim() || !input.lastName.trim()) {
    return { kind: "error", message: "Nom ou prénom manquant." };
  }

  // 1. Numéro de licence — correspondance la plus fiable quand elle existe.
  let existing: Record<string, unknown> | null = null;
  if (input.licenseNumber) {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .eq("license_number", input.licenseNumber)
      .maybeSingle();
    if (error) return { kind: "error", message: error.message };
    existing = data;
  }

  // 2. Nom + prénom + date de naissance exacts.
  if (!existing && input.birthDate) {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .eq("birth_date", input.birthDate)
      .ilike("first_name", input.firstName.trim())
      .ilike("last_name", input.lastName.trim());
    if (error) return { kind: "error", message: error.message };
    // ilike n'ignore pas les accents — filtré ensuite en mémoire avec la
    // même normalisation que l'import Excel pour rester cohérent (retour
    // de Cindy du 31/08 : "Leonore"/"Léonore").
    const exact = (data ?? []).find(
      (p) =>
        normalizeNameForMatching(p.first_name as string) === normalizeNameForMatching(input.firstName) &&
        normalizeNameForMatching(p.last_name as string) === normalizeNameForMatching(input.lastName)
    );
    if (exact) existing = exact;
  }

  // 3. Repli nom seul (homonyme unique) — même garde-fou que l'import
  // Excel : jamais de fusion automatique si l'année de naissance connue ne
  // correspond pas du tout.
  if (!existing) {
    const { data, error } = await supabase.from("players").select("*");
    if (error) return { kind: "error", message: error.message };
    const candidates = (data ?? []).filter(
      (p) =>
        normalizeNameForMatching(p.first_name as string) === normalizeNameForMatching(input.firstName) &&
        normalizeNameForMatching(p.last_name as string) === normalizeNameForMatching(input.lastName)
    );
    if (candidates.length === 1) {
      const candidate = candidates[0];
      const candidateBirth = candidate.birth_date as string | null;
      const sameYear =
        !input.birthDate || !candidateBirth
          ? true
          : input.birthDate.slice(0, 4) === candidateBirth.slice(0, 4);
      if (!sameYear) {
        return {
          kind: "uncertain",
          candidateId: candidate.id as string,
          candidateName: `${candidate.first_name} ${candidate.last_name}`,
        };
      }
      existing = candidate;
    } else if (candidates.length > 1) {
      // Plusieurs homonymes : jamais deviner lequel.
      return {
        kind: "uncertain",
        candidateId: candidates[0].id as string,
        candidateName: `${input.firstName} ${input.lastName} (plusieurs homonymes)`,
      };
    }
  }

  const fresh = toPlayerFields(input);

  if (existing) {
    const playerId = existing.id as string;
    const merged = mergeKeepingExisting(fresh, existing);
    const { error, data } = await supabase
      .from("players")
      .update({ ...merged, archived_at: null })
      .eq("id", playerId)
      .select("id");
    if (error) return { kind: "error", message: error.message };
    if ((data?.length ?? 0) === 0) {
      return { kind: "error", message: "Mise à jour bloquée par les droits d'accès (RLS)." };
    }
    const teamAssigned = await maybeAssignTeam(supabase, playerId, input);
    return { kind: "updated", playerId, teamAssigned };
  }

  const playerId = crypto.randomUUID();
  const { error, data } = await supabase
    .from("players")
    .insert({ id: playerId, ...fresh })
    .select("id");
  if (error) return { kind: "error", message: error.message };
  if ((data?.length ?? 0) === 0) {
    return { kind: "error", message: "Création bloquée par les droits d'accès (RLS)." };
  }
  const teamAssigned = await maybeAssignTeam(supabase, playerId, input);
  return { kind: "inserted", playerId, teamAssigned };
}

// Additif uniquement (audit du 31/08) : ne touche jamais un joueur qui a
// déjà au moins une équipe.
async function maybeAssignTeam(
  supabase: SupabaseClient,
  playerId: string,
  input: RegistrationInput
): Promise<string | null> {
  const { data: links, error: linksError } = await supabase
    .from("team_players")
    .select("team_id")
    .eq("player_id", playerId)
    .limit(1);
  if (linksError) {
    console.error("[inscription-matching] lecture team_players échouée:", linksError);
    return null;
  }
  if ((links?.length ?? 0) > 0) return null;

  const category = suggestTeamCategory({
    birthDate: input.birthDate,
    sex: input.sex,
    licenseType: input.licenseType,
  });
  if (!category) return null;

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id")
    .ilike("category", category)
    .maybeSingle();
  if (teamError || !team) {
    if (teamError) console.error("[inscription-matching] recherche d'équipe échouée:", teamError);
    return null;
  }

  const { error: insertError, data: inserted } = await supabase
    .from("team_players")
    .insert({ team_id: team.id, player_id: playerId })
    .select("team_id");
  if (insertError) {
    console.error("[inscription-matching] affectation d'équipe échouée:", insertError);
    return null;
  }
  if ((inserted?.length ?? 0) === 0) return null;

  await notifyCoachesOfNewTeamMember(
    supabase,
    team.id,
    `${input.firstName} ${input.lastName} vient d'être affecté(e) à ${category} (inscription via le formulaire).`
  );
  return category;
}
