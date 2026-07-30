"use client";

import { useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase/client";

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
  horodatage: number;
};

type Team = { id: string; name: string | null; category: string | null };

function excelSerialToISODate(serial: number): string {
  const utcDays = Math.floor(serial - 25569);
  return new Date(utcDays * 86400 * 1000).toISOString().slice(0, 10);
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

export default function ImportInscriptions({
  existingTeams,
}: {
  existingTeams: Team[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [season, setSeason] = useState("2026-2027");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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
        birthDate = birthRaw.toISOString().slice(0, 10);
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
        horodatage,
      });
    }

    // The registration form can be submitted more than once for the same
    // person (correction, duplicate submission). Keep only the most
    // recent submission per (nom, prénom, catégorie).
    const byKey = new Map<string, ParsedRow>();
    for (const row of parsed) {
      const key = `${row.firstName.toLowerCase()}|${row.lastName.toLowerCase()}|${row.category.toLowerCase()}`;
      const existing = byKey.get(key);
      if (!existing || row.horodatage >= existing.horodatage) {
        byKey.set(key, row);
      }
    }
    const deduped = Array.from(byKey.values());

    setDuplicateCount(parsed.length - deduped.length);
    setRows(deduped);
  }

  async function handleImport() {
    if (!rows) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();

    const categories = Array.from(new Set(rows.map((r) => r.category)));
    const teamIdByCategory = new Map<string, string>();
    existingTeams.forEach((t) => {
      if (t.category) teamIdByCategory.set(t.category, t.id);
    });

    const missingCategories = categories.filter(
      (c) => !teamIdByCategory.has(c)
    );
    if (missingCategories.length > 0) {
      const { data: newTeams, error: teamsError } = await supabase
        .from("teams")
        .insert(missingCategories.map((c) => ({ name: c, category: c })))
        .select("id, category");

      if (teamsError) {
        setLoading(false);
        setError(teamsError.message);
        return;
      }
      (newTeams ?? []).forEach((t) => {
        if (t.category) teamIdByCategory.set(t.category, t.id);
      });
    }

    // Client-generated ids so we can pair each row with its own player
    // without depending on database RETURNING order.
    const rowsWithIds = rows.map((r) => ({ ...r, id: crypto.randomUUID() }));

    const { error: playersError } = await supabase.from("players").insert(
      rowsWithIds.map((r) => ({
        id: r.id,
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
      }))
    );

    if (playersError) {
      setLoading(false);
      setError(playersError.message);
      return;
    }

    const teamPlayersRows = rowsWithIds
      .map((r) => {
        const teamId = teamIdByCategory.get(r.category);
        return teamId ? { team_id: teamId, player_id: r.id } : null;
      })
      .filter((r): r is { team_id: string; player_id: string } => Boolean(r));

    if (teamPlayersRows.length > 0) {
      const { error: teamPlayersError } = await supabase
        .from("team_players")
        .insert(teamPlayersRows);
      if (teamPlayersError) {
        setLoading(false);
        setError(teamPlayersError.message);
        return;
      }
    }

    const cotisationsRows = rowsWithIds.map((r) => ({
      player_id: r.id,
      saison: season,
      prix: r.prix,
      remise: r.remise,
      paiement: r.paiement,
      statut: normalizeStatut(r.statutClub),
      mode_paiement: r.modePaiement,
    }));

    const { error: cotisationsError } = await supabase
      .from("cotisations")
      .insert(cotisationsRows);

    setLoading(false);

    if (cotisationsError) {
      setError(cotisationsError.message);
      return;
    }

    setResult(
      `${rowsWithIds.length} joueurs importés dans ${teamIdByCategory.size} équipes pour la saison ${season}.`
    );
    setRows(null);
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
        Inscriptions&quot;. Récupère aussi les contacts, l&apos;adresse, la
        licence et les infos médicales pour la fiche complète de chaque
        membre.
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
          <input
            type="file"
            accept=".xlsx"
            onChange={handleFile}
            className="text-sm"
          />
        </div>
      </div>

      {rows && (
        <div className="rounded-xl bg-zinc-50 p-4">
          <p className="text-sm font-medium text-zinc-700">
            {rows.length} inscriptions détectées
            {duplicateCount > 0
              ? ` (${duplicateCount} doublon${duplicateCount > 1 ? "s" : ""} ignoré${duplicateCount > 1 ? "s" : ""}, la soumission la plus récente est gardée)`
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
          <button
            onClick={handleImport}
            disabled={loading}
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
