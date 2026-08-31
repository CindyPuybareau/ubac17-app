"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { getCurrentSeasonLabel } from "@/lib/season";
import { suggestTeamCategory } from "@/lib/team-assignment";
import { formatFirstName, normalizeNameForMatching } from "@/lib/names";
import FilePickerButton from "./file-picker-button";

type ParsedRow = {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  category: string;
  parentEmail: string | null;
  prix: number | null;
  remise: number | null;
  paiement: number | null;
  statutClub: string | null;
  modePaiement: string | null;
  sex: string | null;
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
  licenseType: string | null;
  membershipType: string | null;
  fbiStatus: string | null;
  medicalNotes: string | null;
  otherNotes: string | null;
  imageRights: string | null;
  playerCharterAccepted: string | null;
  parentCharterAccepted: string | null;
  licenseNumber: string | null;
  horodatage: number;
};

// Arrondi au jour le plus proche plutôt qu'un floor : le fichier "Suivi
// des Inscriptions" (export Google Forms -> Google Sheets -> Excel) encode
// systématiquement chaque date de naissance avec un résidu de quelques
// dizaines de secondes avant minuit heure de Paris (23:59:39, sur les 92
// lignes vérifiées) au lieu d'un minuit propre — un artefact de la chaîne
// d'export, pas une vraie heure. Un floor prenait alors le jour précédent
// à chaque fois ; arrondir absorbe ce résidu sans jamais dépendre du
// fuseau d'exécution (le calcul reste en UTC de bout en bout).
function excelSerialToISODate(serial: number): string {
  const utcDays = Math.round(serial - 25569);
  return new Date(utcDays * 86400 * 1000).toISOString().slice(0, 10);
}

// Même correction pour les cellules déjà converties en Date par la lib
// xlsx (cellDates: true) — c'est en réalité le chemin emprunté pour la
// quasi-totalité des lignes de ce fichier.
function dateCellToISODate(d: Date): string {
  const dayMs = 86400000;
  const roundedMs = Math.round(d.getTime() / dayMs) * dayMs;
  return new Date(roundedMs).toISOString().slice(0, 10);
}

function normalizeStatut(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.includes("Payé")) return "PAYE";
  if (raw.toLowerCase().includes("attente")) return "EN_ATTENTE";
  if (raw.includes("Offerte")) return "OFFERT";
  return raw;
}

// French mobile numbers come through as a number with the leading 0
// stripped (Excel treats the "Licencié"/"Mère"/"Père" columns as
// numeric). Re-add it; leave genuinely free-text phone notes untouched.
function formatPhoneValue(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    const digits = String(Math.trunc(v));
    return digits.length === 9 ? `0${digits}` : digits;
  }
  return String(v).trim() || null;
}

function strOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

// Unique-member key used both to dedupe rows within the same file and to
// match a row against an already-imported player: nom + prénom + date de
// naissance, normalized. License number is preferred when available (see
// resolveMatch), but the source file doesn't always carry one.
// normalizeNameForMatching (audit du 31/08, bug remonté par Cindy sur un
// import réel : "Leonore"/"Léonore" traités comme deux personnes
// différentes) : un accent oublié ou perdu (saisie, export Excel...) ne
// doit jamais suffire à faire passer une correspondance pour un nouveau
// membre plutôt qu'une mise à jour.
function nameBirthKey(
  firstName: string,
  lastName: string,
  birthDate: string | null
) {
  return `${normalizeNameForMatching(firstName)}|${normalizeNameForMatching(lastName)}|${birthDate ?? ""}`;
}

// suggestedTeamCategory/suggestedTeamId (audit du 31/08) : calculés dès
// l'analyse, seulement pour un joueur qui n'a AUJOURD'HUI aucune équipe —
// jamais pour quelqu'un déjà affecté. Les deux restent null quand aucune
// équipe réelle du club ne correspond (voir suggestTeamCategory) : dans ce
// cas, rien n'est proposé, exactement le comportement d'avant.
type MatchedRow = ParsedRow & {
  id: string;
  suggestedTeamCategory: string | null;
  suggestedTeamId: string | null;
};

// Calculé dès l'analyse du fichier (pas seulement au clic "Confirmer") pour
// que le Bureau voie exactement qui sera créé vs mis à jour *avant*
// d'écrire quoi que ce soit — l'aperçu demandé après l'incident du
// 15/08/2026 (une importation ne doit plus jamais surprendre).
// toReview (audit du 31/08) : cas d'un seul homonyme existant mais dont la
// date de naissance ne correspond pas du tout — voir resolveExistingId.
// Jamais fusionné ni créé automatiquement, seulement listé pour une
// décision manuelle du Bureau.
type ImportPreview = {
  toInsert: MatchedRow[];
  toUpdate: MatchedRow[];
  toReview: MatchedRow[];
};

// Champs de players relus avant l'écriture (audit du 31/08) : sert à ne
// jamais laisser une cellule vide du fichier effacer une valeur déjà
// renseignée en base — voir mergedPlayerFields dans handleImport.
type ExistingPlayerRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  birth_date: string | null;
  category: string | null;
  pending_parent_email: string | null;
  sex: string | null;
  registration_email: string | null;
  registration_phone: string | null;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  secondary_email: string | null;
  mother_phone: string | null;
  father_phone: string | null;
  other_phones: string | null;
  secondary_address: string | null;
  license_type: string | null;
  membership_type: string | null;
  fbi_status: string | null;
  medical_notes: string | null;
  other_notes: string | null;
  image_rights: string | null;
  player_charter_accepted: string | null;
  parent_charter_accepted: string | null;
  license_number: string | null;
};

export default function ImportInscriptions() {
  const router = useRouter();
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [existingById, setExistingById] = useState<Map<string, ExistingPlayerRow>>(new Map());
  const [duplicateCount, setDuplicateCount] = useState(0);
  // Coché par défaut (audit du 31/08) : applique les suggestions d'équipe
  // calculées ci-dessous à la confirmation de l'import — décochable pour
  // importer sans toucher aux équipes, comme avant cette fonctionnalité.
  const [applyTeamSuggestions, setApplyTeamSuggestions] = useState(true);
  // Plus de champ éditable : personne ne change jamais cette valeur à la
  // main, elle suit simplement la saison en cours.
  const season = getCurrentSeasonLabel();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);
    setResult(null);

    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: "array", cellDates: true });
    const ws = wb.Sheets["Suivi Inscriptions"];

    if (!ws) {
      setError("Feuille \"Suivi Inscriptions\" introuvable dans ce fichier.");
      return;
    }

    const raw = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: null,
    }) as unknown[][];

    const headerRow = (raw[0] ?? []).map((h) =>
      typeof h === "string" ? h : ""
    );
    const findExact = (name: string) =>
      headerRow.findIndex((h) => h.trim() === name);
    const findPrefix = (prefix: string) =>
      headerRow.findIndex((h) => h.startsWith(prefix));
    const findAny = (names: string[]) => {
      for (const name of names) {
        const i = findExact(name);
        if (i >= 0) return i;
      }
      return -1;
    };

    const idx = {
      horodatage: findExact("Horodatage"),
      email: findExact("Adresse e-mail"),
      nom: findExact("Nom"),
      prenom: findExact("Prénom"),
      naissance: findExact("Date de naissance"),
      categorie: findExact("Catégorie"),
      statutClub: findExact("Statut Club"),
      modePaiement: findExact("Mode Paiement"),
      prix: findPrefix("Prix à payer\n"),
      remise: findPrefix("Remise\n"),
      paiement: findPrefix("Paiement\n"),
      sexe: findExact("Sexe"),
      typeLicence: findExact("Type de Licence demandée"),
      adressePrincipale: findPrefix("Adresse principale"),
      codePostal: findExact("Code postal"),
      commune: findExact("Commune"),
      emailSecondaire: findExact("Adresse mail secondaire"),
      licencie: findExact("Licencié"),
      mere: findExact("Mère/conjointe"),
      pere: findExact("Père/conjoint"),
      particularitesMedicales: findExact("Particularités Médicales"),
      adresseSecondaire: findExact("Adresse secondaire"),
      autresTelephones: findExact("Autres Téléphones"),
      autresInfos: findPrefix("Autres informations utiles"),
      droitImage: findExact("Droit à l'image"),
      charteJoueur: findPrefix("Acceptation Charte Joueur"),
      charteParent: findPrefix("Acceptation Charte Parent"),
      typeAdhesion: findExact("Type Adhésion"),
      statutFbi: findExact("Statut FBI"),
      numeroLicence: findAny([
        "N° Licence",
        "Numéro de Licence",
        "Numero de Licence",
        "N Licence",
        "Licence N°",
        "Numero_Licence",
      ]),
    };

    // Garde-fou (audit du 31/08) : sans ça, une colonne renommée dans le
    // fichier (ex. "Catégorie" -> "Catégorie d'âge") faisait ignorer TOUTES
    // les lignes en silence (idx.categorie = -1, chaque ligne rejetée par
    // le "continue" plus bas) — l'écran affichait juste "0 inscriptions
    // détectées" sans jamais dire pourquoi.
    const missingColumns = [
      idx.categorie < 0 ? "Catégorie" : null,
      idx.nom < 0 ? "Nom" : null,
      idx.prenom < 0 ? "Prénom" : null,
    ].filter((c): c is string => c !== null);
    if (missingColumns.length > 0) {
      setError(
        `Colonne(s) introuvable(s) dans le fichier : ${missingColumns.join(", ")}. Vérifie les en-têtes de la feuille "Suivi Inscriptions".`
      );
      return;
    }

    const get = (r: unknown[], i: number) => (i >= 0 ? r[i] : null);

    const parsed: ParsedRow[] = [];
    for (let i = 1; i < raw.length; i++) {
      const r = raw[i];
      const category =
        idx.categorie >= 0 ? (r[idx.categorie] as string | null) : null;
      if (!category || !String(category).trim()) continue;

      const birthRaw = idx.naissance >= 0 ? r[idx.naissance] : null;
      let birthDate: string | null = null;
      if (birthRaw instanceof Date) {
        birthDate = dateCellToISODate(birthRaw);
      } else if (typeof birthRaw === "number") {
        birthDate = excelSerialToISODate(birthRaw);
      }

      const horodatageRaw = get(r, idx.horodatage);
      const horodatage =
        horodatageRaw instanceof Date
          ? horodatageRaw.getTime()
          : typeof horodatageRaw === "number"
            ? horodatageRaw
            : 0;

      // Une cellule Prix/Remise/Paiement formatée ou saisie en texte
      // ("150,00", "150 €") ne passait pas typeof v === "number" et
      // ressortait null — un montant réel effacé silencieusement au lieu
      // d'être importé. On accepte aussi le texte, en gérant la virgule
      // décimale française.
      const numOrNull = (v: unknown): number | null => {
        if (typeof v === "number") return Number.isFinite(v) ? v : null;
        if (typeof v === "string") {
          const cleaned = v.replace(/[^\d,.-]/g, "").replace(",", ".");
          if (!cleaned) return null;
          const parsed = Number(cleaned);
          return Number.isFinite(parsed) ? parsed : null;
        }
        return null;
      };

      parsed.push({
        firstName: String(r[idx.prenom] ?? "").trim(),
        lastName: String(r[idx.nom] ?? "").trim(),
        birthDate,
        category: String(category).trim(),
        parentEmail:
          idx.email >= 0 ? (r[idx.email] as string | null) : null,
        prix: idx.prix >= 0 ? numOrNull(r[idx.prix]) : null,
        remise: idx.remise >= 0 ? numOrNull(r[idx.remise]) : null,
        paiement: idx.paiement >= 0 ? numOrNull(r[idx.paiement]) : null,
        statutClub:
          idx.statutClub >= 0 ? (r[idx.statutClub] as string | null) : null,
        modePaiement:
          idx.modePaiement >= 0
            ? (r[idx.modePaiement] as string | null)
            : null,
        sex: strOrNull(get(r, idx.sexe)),
        registrationEmail: strOrNull(get(r, idx.email)),
        registrationPhone: formatPhoneValue(get(r, idx.licencie)),
        address: strOrNull(get(r, idx.adressePrincipale)),
        postalCode: strOrNull(get(r, idx.codePostal)),
        city: strOrNull(get(r, idx.commune)),
        secondaryEmail: strOrNull(get(r, idx.emailSecondaire)),
        motherPhone: formatPhoneValue(get(r, idx.mere)),
        fatherPhone: formatPhoneValue(get(r, idx.pere)),
        otherPhones: strOrNull(get(r, idx.autresTelephones)),
        secondaryAddress: strOrNull(get(r, idx.adresseSecondaire)),
        licenseType: strOrNull(get(r, idx.typeLicence)),
        membershipType: strOrNull(get(r, idx.typeAdhesion)),
        fbiStatus: strOrNull(get(r, idx.statutFbi)),
        medicalNotes: strOrNull(get(r, idx.particularitesMedicales)),
        otherNotes: strOrNull(get(r, idx.autresInfos)),
        imageRights: strOrNull(get(r, idx.droitImage)),
        playerCharterAccepted: strOrNull(get(r, idx.charteJoueur)),
        parentCharterAccepted: strOrNull(get(r, idx.charteParent)),
        licenseNumber: strOrNull(get(r, idx.numeroLicence)),
        horodatage,
      });
    }

    // The registration form can be submitted more than once for the same
    // person (correction, duplicate submission). Keep only the most
    // recent submission per (nom, prénom, date de naissance).
    const byKey = new Map<string, ParsedRow>();
    for (const row of parsed) {
      const key = row.licenseNumber
        ? `license:${row.licenseNumber}`
        : nameBirthKey(row.firstName, row.lastName, row.birthDate);
      const existing = byKey.get(key);
      if (!existing || row.horodatage >= existing.horodatage) {
        byKey.set(key, row);
      }
    }
    const deduped = Array.from(byKey.values());

    setDuplicateCount(parsed.length - deduped.length);
    setRows(deduped);
    setResult(null);
    setPreview(null);
    setError(null);

    // Match every row against players already in the club (upsert, never
    // duplicate): prefer the license number when the file has one, else
    // fall back to nom + prénom + date de naissance. Fait ici, dès
    // l'analyse, pour pouvoir montrer "X nouveaux / Y mis à jour" avant
    // que le Bureau ne clique sur "Confirmer l'import".
    const supabase = createClient();
    // Sélection élargie (audit du 31/08, cf. mergedPlayerFields dans
    // handleImport) : toutes les colonnes qu'une mise à jour pourrait
    // toucher, pas seulement celles qui servent au matching — pour pouvoir
    // garder une valeur déjà en base quand la cellule correspondante du
    // fichier est vide, au lieu de l'effacer.
    const { data: existingPlayers, error: existingError } = await supabase
      .from("players")
      .select(
        "id, first_name, last_name, birth_date, category, pending_parent_email, sex, registration_email, registration_phone, address, postal_code, city, secondary_email, mother_phone, father_phone, other_phones, secondary_address, license_type, membership_type, fbi_status, medical_notes, other_notes, image_rights, player_charter_accepted, parent_charter_accepted, license_number"
      );

    if (existingError) {
      setError(existingError.message);
      return;
    }

    const existingByLicense = new Map<string, string>();
    const existingByNameBirth = new Map<string, string>();
    // Repli de dernier recours (voir resolveExistingId ci-dessous) : liste
    // des candidats par nom+prénom seuls (id + date de naissance connue),
    // pour retrouver un membre même si sa date de naissance stockée diffère
    // de celle fraîchement relue du fichier — incident du 16/08/2026, où
    // une correction du parsing des dates a changé la valeur calculée et
    // fait perdre la correspondance exacte nom+prénom+date pour tout membre
    // sans n° de licence, créant des doublons en masse. Un tableau (pas
    // juste le dernier id) pour détecter l'ambiguïté : deux homonymes ne
    // doivent jamais fusionner.
    const existingByNameOnly = new Map<
      string,
      { id: string; birthDate: string | null }[]
    >();
    const byId = new Map<string, ExistingPlayerRow>();
    (existingPlayers ?? []).forEach((p) => {
      byId.set(p.id, p);
      if (p.license_number) existingByLicense.set(p.license_number, p.id);
      existingByNameBirth.set(
        nameBirthKey(p.first_name ?? "", p.last_name ?? "", p.birth_date),
        p.id
      );
      const nameKey = `${normalizeNameForMatching(p.first_name)}|${normalizeNameForMatching(p.last_name)}`;
      const list = existingByNameOnly.get(nameKey) ?? [];
      list.push({ id: p.id, birthDate: p.birth_date });
      existingByNameOnly.set(nameKey, list);
    });
    setExistingById(byId);

    // uncertain: vrai quand le repli nom-seul (ci-dessous) a trouvé un
    // candidat unique, mais dont l'année de naissance connue ne correspond
    // pas du tout à celle du fichier (audit du 31/08) — un frère/soeur
    // homonyme qui s'inscrit pour la première fois serait sinon fusionné
    // avec l'aîné(e) déjà en base. Comparaison par ANNÉE seulement (pas la
    // date exacte) pour rester tolérant au même genre d'écart de parsing
    // que l'incident du 16/08, sans jamais avaler un vrai homonyme différent.
    function resolveExistingId(
      r: ParsedRow
    ): { id: string; uncertain: boolean } | null {
      if (r.licenseNumber && existingByLicense.has(r.licenseNumber)) {
        return { id: existingByLicense.get(r.licenseNumber)!, uncertain: false };
      }
      const key = nameBirthKey(r.firstName, r.lastName, r.birthDate);
      const exact = existingByNameBirth.get(key);
      if (exact) return { id: exact, uncertain: false };
      // La date de naissance seule a changé (import précédent buggé,
      // correction manuelle...) : si un seul membre existant porte ce
      // nom+prénom, c'est très probablement lui — mieux vaut le mettre à
      // jour (et corriger sa date au passage) que le dupliquer. En cas
      // d'homonymie (plusieurs membres, ex. jumeaux), on refuse de
      // deviner : mieux vaut rater une mise à jour qu'en fusionner deux.
      const nameKey = `${normalizeNameForMatching(r.firstName)}|${normalizeNameForMatching(r.lastName)}`;
      const candidates = existingByNameOnly.get(nameKey);
      if (candidates && candidates.length === 1) {
        const candidate = candidates[0];
        const sameYear =
          !r.birthDate || !candidate.birthDate
            ? true
            : r.birthDate.slice(0, 4) === candidate.birthDate.slice(0, 4);
        return { id: candidate.id, uncertain: !sameYear };
      }
      return null;
    }

    // Suggestion automatique d'équipe (audit du 31/08, retour de Cindy) :
    // seulement pour un joueur qui n'a AUJOURD'HUI aucune équipe — jamais
    // pour quelqu'un déjà affecté (toujours additif, jamais de retrait/
    // déplacement). Les deux requêtes ci-dessous restent légères : les
    // équipes du club se comptent en dizaines, pas en centaines.
    const [{ data: teamsData, error: teamsError }, { data: existingLinks, error: linksError }] =
      await Promise.all([
        supabase.from("teams").select("id, category"),
        supabase.from("team_players").select("player_id"),
      ]);
    if (teamsError) {
      setError(teamsError.message);
      return;
    }
    if (linksError) {
      setError(linksError.message);
      return;
    }
    const teamIdByCategory = new Map<string, string>();
    (teamsData ?? []).forEach((t) => {
      if (t.category) teamIdByCategory.set(t.category.trim().toLowerCase(), t.id);
    });
    const playersWithTeam = new Set((existingLinks ?? []).map((l) => l.player_id));

    function computeSuggestion(playerId: string, r: ParsedRow) {
      if (playersWithTeam.has(playerId)) return { category: null, teamId: null };
      const category = suggestTeamCategory({
        birthDate: r.birthDate,
        sex: r.sex,
        licenseType: r.licenseType,
      });
      const teamId = category ? (teamIdByCategory.get(category.toLowerCase()) ?? null) : null;
      // Ne montrer une suggestion que si une équipe réelle y correspond
      // vraiment — sinon silence total, comme avant cette fonctionnalité.
      return teamId ? { category, teamId } : { category: null, teamId: null };
    }

    const toInsert: MatchedRow[] = [];
    const toUpdate: MatchedRow[] = [];
    const toReview: MatchedRow[] = [];
    for (const r of deduped) {
      const resolved = resolveExistingId(r);
      if (!resolved) {
        const id = crypto.randomUUID();
        const suggestion = computeSuggestion(id, r);
        toInsert.push({
          ...r,
          id,
          suggestedTeamCategory: suggestion.category,
          suggestedTeamId: suggestion.teamId,
        });
      } else if (resolved.uncertain) {
        toReview.push({ ...r, id: resolved.id, suggestedTeamCategory: null, suggestedTeamId: null });
      } else {
        const suggestion = computeSuggestion(resolved.id, r);
        toUpdate.push({
          ...r,
          id: resolved.id,
          suggestedTeamCategory: suggestion.category,
          suggestedTeamId: suggestion.teamId,
        });
      }
    }
    setPreview({ toInsert, toUpdate, toReview });
  }

  async function handleImport() {
    if (!rows || !preview) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    // toReview n'est jamais écrit ici, ni en insert ni en update — voir le
    // commentaire sur ImportPreview plus haut.
    const { toInsert, toUpdate } = preview;

    const playerFields = (r: ParsedRow) => ({
      first_name: r.firstName,
      last_name: r.lastName,
      birth_date: r.birthDate,
      category: r.category,
      pending_parent_email: r.parentEmail,
      sex: r.sex,
      registration_email: r.registrationEmail,
      registration_phone: r.registrationPhone,
      address: r.address,
      postal_code: r.postalCode,
      city: r.city,
      secondary_email: r.secondaryEmail,
      mother_phone: r.motherPhone,
      father_phone: r.fatherPhone,
      other_phones: r.otherPhones,
      secondary_address: r.secondaryAddress,
      license_type: r.licenseType,
      membership_type: r.membershipType,
      fbi_status: r.fbiStatus,
      medical_notes: r.medicalNotes,
      other_notes: r.otherNotes,
      image_rights: r.imageRights,
      player_charter_accepted: r.playerCharterAccepted,
      parent_charter_accepted: r.parentCharterAccepted,
      license_number: r.licenseNumber,
    });

    // Audit du 31/08 : sans ceci, une cellule vide du fichier (le Bureau
    // n'a pas eu à retaper ce qu'il avait déjà donné l'an dernier, ou un
    // champ facultatif jamais rempli) effaçait silencieusement une valeur
    // déjà en base — notes médicales, n° de licence, téléphone d'un
    // parent... Ne remplace un champ que si le fichier apporte une vraie
    // valeur ; sinon garde ce qui est déjà enregistré.
    function mergedPlayerFields(r: MatchedRow) {
      const fresh = playerFields(r);
      const existing = existingById.get(r.id);
      if (!existing) return fresh;
      const merged = { ...fresh } as Record<string, unknown>;
      (Object.keys(merged) as (keyof typeof fresh)[]).forEach((key) => {
        if (merged[key] === null && existing[key] != null) {
          merged[key] = existing[key];
        }
      });
      return merged as ReturnType<typeof playerFields>;
    }

    if (toInsert.length > 0) {
      const { error: insertError } = await supabase.from("players").insert(
        toInsert.map((r) => ({ id: r.id, ...playerFields(r) }))
      );
      if (insertError) {
        setLoading(false);
        setError(insertError.message);
        return;
      }
    }

    // Complète les champs vides avec le fichier (mergedPlayerFields), et
    // un-archive le membre (il se réinscrit). .select("id") + vérification
    // du nombre de lignes (audit du 31/08) : RLS peut bloquer une écriture
    // sans erreur — sans ce contrôle, l'écran affichait "mis à jour" même
    // quand rien n'avait changé en base.
    const updateResults = await Promise.all(
      toUpdate.map((r) =>
        supabase
          .from("players")
          .update({ ...mergedPlayerFields(r), archived_at: null })
          .eq("id", r.id)
          .select("id")
      )
    );
    const updateError = updateResults.find((res) => res.error)?.error;
    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }
    const blockedUpdates = updateResults.filter((res) => (res.data?.length ?? 0) === 0).length;

    const allRows = [...toInsert, ...toUpdate];
    const allIds = allRows.map((r) => r.id);

    // L'affectation aux équipes n'est plus touchée par cet import : la
    // "Catégorie" du fichier n'est qu'une tranche d'âge large (U13, U18,
    // z.Sénior...), pas le numéro d'équipe précis (U13F/U13M-1/U13M-2,
    // Séniors 1/2/M...). La réappliquer en masse écrasait silencieusement
    // la répartition fine déjà faite à la main, et créait des équipes en
    // double dès que le libellé du fichier ne collait pas mot pour mot à
    // l'existant (incident du 15/08/2026). L'affectation reste du ressort
    // exclusif de l'onglet Équipes / "Affecter à une équipe" côté Membres,
    // volontairement additive et jamais automatique.

    // Cotisations: one row per player per season. Update this season's row
    // if it already exists (re-import correcting the same season) instead
    // of adding a duplicate; insert a new one otherwise.
    const { data: existingCotisations, error: cotisationsFetchError } =
      allIds.length > 0
        ? await supabase
            .from("cotisations")
            .select("id, player_id")
            .eq("saison", season)
            .in("player_id", allIds)
        : { data: [] as { id: string; player_id: string }[], error: null };

    if (cotisationsFetchError) {
      setLoading(false);
      setError(cotisationsFetchError.message);
      return;
    }

    const cotisationIdByPlayerId = new Map(
      (existingCotisations ?? []).map((c) => [c.player_id, c.id])
    );

    const cotisationFields = (r: ParsedRow & { id: string }) => ({
      prix: r.prix,
      remise: r.remise,
      paiement: r.paiement,
      statut: normalizeStatut(r.statutClub),
      mode_paiement: r.modePaiement,
    });

    const cotisationsToInsert = allRows.filter(
      (r) => !cotisationIdByPlayerId.has(r.id)
    );
    const cotisationsToUpdate = allRows.filter((r) =>
      cotisationIdByPlayerId.has(r.id)
    );

    if (cotisationsToInsert.length > 0) {
      const { error: cotisationsInsertError } = await supabase
        .from("cotisations")
        .insert(
          cotisationsToInsert.map((r) => ({
            player_id: r.id,
            saison: season,
            ...cotisationFields(r),
          }))
        );
      if (cotisationsInsertError) {
        setLoading(false);
        setError(cotisationsInsertError.message);
        return;
      }
    }

    const cotisationsUpdateResults = await Promise.all(
      cotisationsToUpdate.map((r) =>
        supabase
          .from("cotisations")
          .update(cotisationFields(r))
          .eq("id", cotisationIdByPlayerId.get(r.id))
          .select("id")
      )
    );
    const cotisationsUpdateError = cotisationsUpdateResults.find(
      (res) => res.error
    )?.error;
    if (cotisationsUpdateError) {
      setLoading(false);
      setError(cotisationsUpdateError.message);
      return;
    }
    const blockedCotisations = cotisationsUpdateResults.filter(
      (res) => (res.data?.length ?? 0) === 0
    ).length;

    // Affectation d'équipe suggérée (audit du 31/08, retour de Cindy) :
    // toujours additive — un insert dans team_players, jamais un retrait
    // ni un déplacement d'une affectation existante (déjà garanti par
    // computeSuggestion, qui ignore tout joueur ayant déjà une équipe).
    let teamAssignedCount = 0;
    let blockedTeamAssignments = 0;
    if (applyTeamSuggestions) {
      const teamLinksToInsert = allRows
        .filter((r) => r.suggestedTeamId)
        .map((r) => ({ team_id: r.suggestedTeamId as string, player_id: r.id }));
      if (teamLinksToInsert.length > 0) {
        const { error: teamLinksError, data: insertedTeamLinks } = await supabase
          .from("team_players")
          .insert(teamLinksToInsert)
          .select("player_id");
        if (teamLinksError) {
          setLoading(false);
          setError(teamLinksError.message);
          return;
        }
        teamAssignedCount = insertedTeamLinks?.length ?? 0;
        blockedTeamAssignments = teamLinksToInsert.length - teamAssignedCount;
      }
    }

    setLoading(false);

    const blockedTotal = blockedUpdates + blockedCotisations + blockedTeamAssignments;
    const reviewNote =
      preview.toReview.length > 0
        ? ` ${preview.toReview.length} fiche${preview.toReview.length > 1 ? "s" : ""} ignorée${preview.toReview.length > 1 ? "s" : ""} (nom identique à un membre existant, mais date de naissance différente — à vérifier à la main dans l'onglet Membres).`
        : "";
    const blockedNote =
      blockedTotal > 0
        ? ` Attention : ${blockedTotal} écriture${blockedTotal > 1 ? "s" : ""} bloquée${blockedTotal > 1 ? "s" : ""} par les droits d'accès (RLS) — rien n'a changé pour ces lignes-là, réessaie.`
        : "";
    const teamNote =
      applyTeamSuggestions && teamAssignedCount > 0
        ? ` ${teamAssignedCount} affecté${teamAssignedCount > 1 ? "s" : ""} automatiquement à leur équipe.`
        : "";
    setResult(
      `${toInsert.length} nouveau${toInsert.length > 1 ? "x" : ""} membre${toInsert.length > 1 ? "s" : ""}, ${toUpdate.length} mis à jour, pour la saison ${season}.${teamNote}${reviewNote}${blockedNote}`
    );
    setRows(null);
    setPreview(null);
    router.refresh();
  }

  const categoryCounts = rows
    ? Object.entries(
        rows.reduce<Record<string, number>>((acc, r) => {
          acc[r.category] = (acc[r.category] ?? 0) + 1;
          return acc;
        }, {})
      )
    : [];

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-zinc-900">
        Importer les inscriptions (fichier officiel)
      </h3>
      <p className="text-sm text-zinc-500">
        Fichier Excel &quot;Suivi des inscriptions&quot;
      </p>

      {/* Pas de label "Fichier" ni de champ Saison visible : la saison suit
          automatiquement la date du jour (voir season plus haut), personne
          ne la change à la main — même minimalisme que l'import Coachs. */}
      <FilePickerButton id="import-inscriptions-file" fileName={fileName} onChange={handleFile} />

      {rows && (
        <div className="rounded-xl bg-zinc-50 p-4">
          <p className="text-sm font-medium text-zinc-700">
            {rows.length} inscriptions détectées
            {duplicateCount > 0
              ? ` (${duplicateCount} doublon${duplicateCount > 1 ? "s" : ""} ignoré${duplicateCount > 1 ? "s" : ""} dans le fichier, la soumission la plus récente est gardée)`
              : ""}
            :
          </p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {categoryCounts.map(([cat, count]) => (
              <li
                key={cat}
                className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-600 shadow-sm"
              >
                {cat} · {count}
              </li>
            ))}
          </ul>

          {preview ? (
            <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-3">
              <p className="text-sm text-zinc-700">
                <span className="font-semibold text-emerald-700">
                  {preview.toInsert.length} nouveau
                  {preview.toInsert.length > 1 ? "x" : ""} membre
                  {preview.toInsert.length > 1 ? "s" : ""}
                </span>{" "}
                seront créés,{" "}
                <span className="font-semibold text-amber-700">
                  {preview.toUpdate.length} fiche{preview.toUpdate.length > 1 ? "s" : ""} existante
                  {preview.toUpdate.length > 1 ? "s" : ""}
                </span>{" "}
                seront mises à jour. Une équipe existante n&apos;est jamais retirée ni changée —
                seule une fiche sans aucune équipe peut en recevoir une nouvelle, en plus (jamais
                à la place) des équipes déjà affectées.
              </p>
              {preview.toInsert.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-700">
                    Voir les {preview.toInsert.length} nouveaux membres
                  </summary>
                  <ul className="mt-1.5 flex max-h-40 flex-col gap-0.5 overflow-y-auto text-xs text-zinc-500">
                    {preview.toInsert.map((r, i) => (
                      <li key={i}>
                        {formatFirstName(r.firstName)} {r.lastName} · {r.category}
                        {r.suggestedTeamCategory && (
                          <span className="ml-1 font-medium text-emerald-700">
                            → {r.suggestedTeamCategory}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {preview.toUpdate.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-zinc-500 hover:text-zinc-700">
                    Voir les {preview.toUpdate.length} fiches mises à jour
                  </summary>
                  <ul className="mt-1.5 flex max-h-40 flex-col gap-0.5 overflow-y-auto text-xs text-zinc-500">
                    {preview.toUpdate.map((r, i) => (
                      <li key={i}>
                        {formatFirstName(r.firstName)} {r.lastName} · {r.category}
                        {r.suggestedTeamCategory && (
                          <span className="ml-1 font-medium text-emerald-700">
                            → {r.suggestedTeamCategory}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {preview.toInsert.some((r) => r.suggestedTeamCategory) ||
              preview.toUpdate.some((r) => r.suggestedTeamCategory) ? (
                <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
                  <input
                    type="checkbox"
                    checked={applyTeamSuggestions}
                    onChange={(e) => setApplyTeamSuggestions(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                  />
                  Affecter automatiquement les équipes suggérées ci-dessus (
                  {[...preview.toInsert, ...preview.toUpdate].filter((r) => r.suggestedTeamCategory)
                    .length}{" "}
                  fiche
                  {[...preview.toInsert, ...preview.toUpdate].filter((r) => r.suggestedTeamCategory)
                    .length > 1
                    ? "s"
                    : ""}{" "}
                  concernée
                  {[...preview.toInsert, ...preview.toUpdate].filter((r) => r.suggestedTeamCategory)
                    .length > 1
                    ? "s"
                    : ""}
                  )
                </label>
              ) : null}
              {preview.toReview.length > 0 && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                  <p className="text-xs font-semibold text-amber-800">
                    {preview.toReview.length} fiche{preview.toReview.length > 1 ? "s" : ""} à
                    vérifier à la main — ne sera{preview.toReview.length > 1 ? "ont" : ""} pas
                    importée{preview.toReview.length > 1 ? "s" : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-amber-700">
                    Un membre du même nom existe déjà, mais sa date de naissance ne correspond
                    pas à celle du fichier — pour ne jamais fusionner deux personnes différentes
                    par erreur (ex. un frère/une sœur homonyme), rien n&apos;est écrit
                    automatiquement pour ces lignes-là.
                  </p>
                  <ul className="mt-1.5 flex max-h-32 flex-col gap-0.5 overflow-y-auto text-xs text-amber-700">
                    {preview.toReview.map((r, i) => (
                      <li key={i}>
                        {formatFirstName(r.firstName)} {r.lastName} · {r.category} · né(e) le{" "}
                        {r.birthDate ?? "date inconnue"}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            !error && <p className="mt-3 text-xs text-zinc-400">Vérification des membres existants...</p>
          )}

          <button
            onClick={handleImport}
            disabled={loading || !preview}
            className="mt-3 rounded-full bg-ubac-yellow px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
          >
            {loading ? "Import en cours..." : "Confirmer l'import"}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && <p className="text-sm text-green-600">{result}</p>}
    </div>
  );
}
