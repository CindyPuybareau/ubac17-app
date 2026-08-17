"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";
import { getCurrentSeasonLabel } from "@/lib/season";
import { formatFirstName } from "@/lib/names";

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
function nameBirthKey(
  firstName: string,
  lastName: string,
  birthDate: string | null
) {
  return `${firstName.trim().toLowerCase()}|${lastName.trim().toLowerCase()}|${birthDate ?? ""}`;
}

type MatchedRow = ParsedRow & { id: string };

// Calculé dès l'analyse du fichier (pas seulement au clic "Confirmer") pour
// que le Bureau voie exactement qui sera créé vs mis à jour *avant*
// d'écrire quoi que ce soit — l'aperçu demandé après l'incident du
// 15/08/2026 (une importation ne doit plus jamais surprendre).
type ImportPreview = {
  toInsert: MatchedRow[];
  toUpdate: MatchedRow[];
};

export default function ImportInscriptions() {
  const router = useRouter();
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [season, setSeason] = useState(() => getCurrentSeasonLabel());
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

      const numOrNull = (v: unknown) => (typeof v === "number" ? v : null);

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
    const { data: existingPlayers, error: existingError } = await supabase
      .from("players")
      .select("id, first_name, last_name, birth_date, license_number");

    if (existingError) {
      setError(existingError.message);
      return;
    }

    const existingByLicense = new Map<string, string>();
    const existingByNameBirth = new Map<string, string>();
    // Repli de dernier recours (voir resolveExistingId ci-dessous) : liste
    // des id par nom+prénom seuls, pour retrouver un membre même si sa
    // date de naissance stockée diffère de celle fraîchement relue du
    // fichier — incident du 16/08/2026, où une correction du parsing des
    // dates a changé la valeur calculée et fait perdre la correspondance
    // exacte nom+prénom+date pour tout membre sans n° de licence, créant
    // des doublons en masse. Un tableau (pas juste le dernier id) pour
    // détecter l'ambiguïté : deux homonymes ne doivent jamais fusionner.
    const existingByNameOnly = new Map<string, string[]>();
    (existingPlayers ?? []).forEach((p) => {
      if (p.license_number) existingByLicense.set(p.license_number, p.id);
      existingByNameBirth.set(
        nameBirthKey(p.first_name ?? "", p.last_name ?? "", p.birth_date),
        p.id
      );
      const nameKey = `${(p.first_name ?? "").trim().toLowerCase()}|${(p.last_name ?? "").trim().toLowerCase()}`;
      const list = existingByNameOnly.get(nameKey) ?? [];
      list.push(p.id);
      existingByNameOnly.set(nameKey, list);
    });

    function resolveExistingId(r: ParsedRow): string | null {
      if (r.licenseNumber && existingByLicense.has(r.licenseNumber)) {
        return existingByLicense.get(r.licenseNumber) ?? null;
      }
      const key = nameBirthKey(r.firstName, r.lastName, r.birthDate);
      const exact = existingByNameBirth.get(key);
      if (exact) return exact;
      // La date de naissance seule a changé (import précédent buggé,
      // correction manuelle...) : si un seul membre existant porte ce
      // nom+prénom, c'est très probablement lui — mieux vaut le mettre à
      // jour (et corriger sa date au passage) que le dupliquer. En cas
      // d'homonymie (plusieurs membres, ex. jumeaux), on refuse de
      // deviner : mieux vaut rater une mise à jour qu'en fusionner deux.
      const nameKey = `${r.firstName.trim().toLowerCase()}|${r.lastName.trim().toLowerCase()}`;
      const candidates = existingByNameOnly.get(nameKey);
      if (candidates && candidates.length === 1) return candidates[0];
      return null;
    }

    const toInsert: MatchedRow[] = [];
    const toUpdate: MatchedRow[] = [];
    for (const r of deduped) {
      const existingId = resolveExistingId(r);
      if (existingId) {
        toUpdate.push({ ...r, id: existingId });
      } else {
        toInsert.push({ ...r, id: crypto.randomUUID() });
      }
    }
    setPreview({ toInsert, toUpdate });
  }

  async function handleImport() {
    if (!rows || !preview) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
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

    // Overwrite the existing member's data with the file's values, and
    // un-archive them if they'd been archived (they're registering again).
    const updateResults = await Promise.all(
      toUpdate.map((r) =>
        supabase
          .from("players")
          .update({ ...playerFields(r), archived_at: null })
          .eq("id", r.id)
      )
    );
    const updateError = updateResults.find((res) => res.error)?.error;
    if (updateError) {
      setLoading(false);
      setError(updateError.message);
      return;
    }

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
      )
    );
    const cotisationsUpdateError = cotisationsUpdateResults.find(
      (res) => res.error
    )?.error;

    setLoading(false);

    if (cotisationsUpdateError) {
      setError(cotisationsUpdateError.message);
      return;
    }

    setResult(
      `${toInsert.length} nouveau${toInsert.length > 1 ? "x" : ""} membre${toInsert.length > 1 ? "s" : ""}, ${toUpdate.length} mis à jour, pour la saison ${season}.`
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
        Fichier Excel &quot;Suivi des inscriptions&quot;, feuille &quot;Suivi
        Inscriptions&quot;. Un membre déjà présent (même n° de licence, ou
        même nom + prénom + date de naissance) est mis à jour, jamais
        dupliqué. Met à jour la fiche membre et la cotisation de la saison
        uniquement — n&apos;affecte plus les joueurs à une équipe (à faire
        depuis l&apos;onglet Équipes ou Membres).
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Saison
          </label>
          <input
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="rounded-lg border border-zinc-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Fichier
          </label>
          {/* Input natif invisible mais toujours présent/cliquable (pas
              display:none, qui empêcherait le clic) : le <label> fait
              office de bouton visible, stylé comme les autres actions de
              l'appli — l'ancien input brut ne ressemblait à rien de
              cliquable et se confondait avec du texte. */}
          <label
            htmlFor="import-inscriptions-file"
            className="flex w-fit cursor-pointer items-center gap-1.5 rounded-full bg-ubac-yellow px-4 py-2 text-sm font-semibold text-navy shadow-sm transition-colors hover:bg-ubac-yellow-dark"
          >
            <Upload className="h-4 w-4 shrink-0" />
            Choisir un fichier
          </label>
          <input
            id="import-inscriptions-file"
            type="file"
            accept=".xlsx"
            onChange={handleFile}
            className="sr-only"
          />
          {fileName && (
            <p className="mt-1.5 truncate text-xs text-zinc-500">{fileName}</p>
          )}
        </div>
      </div>

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
                seront mises à jour. Aucune équipe ne sera modifiée.
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
                      </li>
                    ))}
                  </ul>
                </details>
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
