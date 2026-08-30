"use client";

import { ExternalLink, Mail, Phone } from "lucide-react";
import { formatFirstName, formatLastName, sortByLastName } from "@/lib/names";
import { computePlayerYearStatus } from "@/lib/season";
import PlayerYearBadge from "./player-year-badge";
import WhatsAppDirectButton from "./whatsapp-direct-button";
import { categoryTheme } from "./team-card";

type Person = { id: string; first_name: string | null; last_name: string | null };
type CoachContact = Person & { phone: string | null; email: string | null };
type RosterMate = Person & { birthDate: string | null };

export type FamilyTeamCardData = {
  playerId: string;
  playerName: string;
  teamId: string;
  teamName: string | null;
  category: string | null;
  coaches: CoachContact[];
  // Named coaches assigned via a member's fiche (team_pending_coaches)
  // before they have a real account yet — same source as the Membres
  // table's amber "en attente" badge. Téléphone/e-mail viennent de cette
  // même fiche (family_pending_coach_contact, retour de Cindy du 30/08 :
  // ce coach n'a pas de compte, donc pas d'autre source possible).
  pendingCoaches: CoachContact[];
  roster: RosterMate[];
  ffbbUrl: string | null;
  sortOrder: number | null;
  pendingCoachNames: string | null;
};

// Même tableau que team-card.tsx (Nom/Prénom/Rôle/Statut/Catégorie, lignes
// d'en-tête de groupe COACHS/JOUEURS) — retour de Cindy du 2026-08-24,
// "mon équipe doit avoir les cartes ressemblante à celle des coachs et
// bureau au niveau du visuel". Plus léger que la version Coach/Bureau :
// pas d'actions de gestion (Retirer/Affecter, réservées au Bureau) —
// seulement l'habillage visuel.
// Retour de Cindy du 29/08 ("comme déjà vu côté coach, un icône whatsapp
// près des coachs, ajouter aussi téléphone et mail") : un coach a
// maintenant les mêmes colonnes Téléphone/E-mail (avec icône WhatsApp
// directe) que côté Coach/Bureau (team-card.tsx) — "—" pour un
// coéquipier/une famille de l'équipe, dont le contact reste non exposé
// ici.
function roleBadge(role: "COACH" | "COACH_PENDING" | "JOUEUR") {
  if (role === "COACH") return { label: "Coach", className: "bg-navy/10 text-navy" };
  // Libellé aligné sur "Coach" tout court (retour de Cindy du 2026-08-24) :
  // "en attente" faisait croire à la secrétaire du Bureau qu'il fallait
  // changer un statut à la main quand le coach avait confirmé par SMS,
  // alors que ça décrit uniquement l'absence de compte confirmé — une
  // information déjà portée par le repère de connexion du tableau
  // Membres (members-table.tsx), pas par ce badge-ci. Le fond ambre reste
  // pour garder le repère visuel utile en interne, sans le mot trompeur.
  if (role === "COACH_PENDING")
    return { label: "Coach", className: "bg-amber-100 text-amber-700" };
  return { label: "Joueur", className: "bg-emerald-100 text-emerald-700" };
}

export default function FamilyTeamCard({ card }: { card: FamilyTeamCardData }) {
  const theme = categoryTheme(card.category ?? card.teamName);
  const categoryLabel = card.category ?? card.teamName;

  const coachRows = [
    ...sortByLastName(card.coaches, (c) => c.last_name).map((c) => ({
      key: c.id,
      person: c as Person,
      phone: c.phone,
      email: c.email,
      role: "COACH" as const,
    })),
    ...sortByLastName(card.pendingCoaches, (c) => c.last_name).map((c) => ({
      key: `pending-${c.id}`,
      person: c as Person,
      phone: c.phone,
      email: c.email,
      role: "COACH_PENDING" as const,
    })),
  ];
  const playerRows = sortByLastName(card.roster, (p) => p.last_name);

  function renderRow(
    key: string,
    person: Person,
    role: "COACH" | "COACH_PENDING" | "JOUEUR",
    birthDate: string | null,
    phone: string | null = null,
    email: string | null = null
  ) {
    const badge = roleBadge(role);
    const yearStatus = role === "JOUEUR" ? computePlayerYearStatus(birthDate, card.category) : null;
    return (
      <tr key={key} className="border-b border-zinc-50 last:border-0">
        <td className="whitespace-nowrap px-3 py-2.5 font-semibold text-zinc-900">
          {formatLastName(person.last_name) || "—"}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5 text-zinc-700">
          {person.first_name ? formatFirstName(person.first_name) : "—"}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5">
          <span
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${badge.className}`}
          >
            {badge.label}
          </span>
        </td>
        <td className="whitespace-nowrap px-3 py-2.5">
          {/* Retour de Cindy du 29/08 ("on peut enlever le statut des
              coach") : rien du tout pour un coach, même pas un tiret. */}
          {role === "JOUEUR" ? (
            yearStatus ? (
              <PlayerYearBadge birthDate={birthDate} category={card.category} />
            ) : (
              <span className="text-zinc-300">—</span>
            )
          ) : null}
        </td>
        <td className="whitespace-nowrap px-3 py-2.5">
          {categoryLabel ? (
            <span
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${theme.badge}`}
            >
              {categoryLabel}
            </span>
          ) : (
            <span className="text-zinc-400">—</span>
          )}
        </td>
        {/* Retour de Cindy du 29/08 : mêmes colonnes Téléphone/E-mail que
            côté Coach/Bureau (team-card.tsx), mais réservées aux coachs —
            "—" pour un coéquipier, dont le contact reste non exposé ici. */}
        <td className="whitespace-nowrap px-3 py-2.5">
          {phone ? (
            <span className="flex items-center gap-1">
              <a
                href={`tel:${phone}`}
                title="Appeler"
                className="inline-flex items-center gap-1.5 text-zinc-600 hover:text-navy hover:underline"
              >
                <Phone className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                {phone}
              </a>
              <WhatsAppDirectButton
                phone={phone}
                message={`Bonjour, ici ${card.playerName}, de l'équipe ${categoryLabel ?? ""}.`}
              />
            </span>
          ) : (
            <span className="text-zinc-400">—</span>
          )}
        </td>
        <td className="w-auto px-3 py-2.5">
          {email ? (
            <a
              href={`mailto:${email}`}
              title={email}
              className="flex min-w-0 items-center gap-1.5 text-zinc-600 hover:text-navy hover:underline"
            >
              <Mail className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <span className="truncate">{email}</span>
            </a>
          ) : (
            <span className="text-zinc-400">—</span>
          )}
        </td>
      </tr>
    );
  }

  // Carte mobile (<640px, retour de Cindy du 2026-08-24 : "sur mon profil
  // parent mon tableau des équipes est toujours en tableau et pas en
  // cartes") — même contenu que renderRow, juste réagencé verticalement ;
  // pas d'actions ici (carte Famille en lecture seule, voir plus haut).
  function renderCard(
    key: string,
    person: Person,
    role: "COACH" | "COACH_PENDING" | "JOUEUR",
    birthDate: string | null,
    isStaff: boolean,
    phone: string | null = null,
    email: string | null = null
  ) {
    const badge = roleBadge(role);
    const yearStatus = role === "JOUEUR" ? computePlayerYearStatus(birthDate, card.category) : null;
    return (
      <div
        key={key}
        className={`rounded-2xl border border-l-4 border-zinc-100 bg-white p-3.5 shadow-sm ${
          isStaff ? "border-l-navy" : "border-l-emerald-400"
        }`}
      >
        <p className="font-semibold text-zinc-900">
          {formatLastName(person.last_name) || "—"}{" "}
          {person.first_name ? formatFirstName(person.first_name) : ""}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${badge.className}`}
          >
            {badge.label}
          </span>
          {yearStatus && <PlayerYearBadge birthDate={birthDate} category={card.category} />}
          {categoryLabel && (
            <span
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold leading-none ${theme.badge}`}
            >
              {categoryLabel}
            </span>
          )}
        </div>

        {(phone || email) && (
          <div className="mt-2 flex flex-col gap-1 border-t border-zinc-50 pt-2 text-xs text-zinc-600">
            {phone && (
              <span className="flex items-center gap-1">
                <a
                  href={`tel:${phone}`}
                  className="inline-flex items-center gap-1.5 hover:text-navy hover:underline"
                >
                  <Phone className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  {phone}
                </a>
                <WhatsAppDirectButton
                  phone={phone}
                  message={`Bonjour, ici ${card.playerName}, de l'équipe ${categoryLabel ?? ""}.`}
                />
              </span>
            )}
            {email && (
              <a
                href={`mailto:${email}`}
                className="flex min-w-0 items-center gap-1.5 hover:text-navy hover:underline"
              >
                <Mail className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <span className="truncate">{email}</span>
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-l-4 border-zinc-100 border-l-ubac-yellow bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ubac-blue">
          Équipe de {card.playerName}
        </p>
        {categoryLabel && (
          <span
            className={`inline-flex w-fit items-center justify-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold leading-none ${theme.badge}`}
          >
            {categoryLabel}
          </span>
        )}
      </div>

      {/* Tableau classique à partir de 640px (sm) ; en dessous, cartes
          empilées (voir plus bas) — retour de Cindy du 2026-08-24 : "sur
          mon profil parent mon tableau des équipes est toujours en
          tableau et pas en cartes" (même correctif que team-card.tsx,
          appliqué ici aussi). */}
      <div className="mt-3 hidden w-full overflow-x-auto rounded-xl border border-zinc-100 sm:block">
        <table className="w-full table-auto border-collapse text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50 text-left text-xs font-semibold uppercase tracking-wide text-zinc-400">
              <th className="whitespace-nowrap px-3 py-2.5">Nom</th>
              <th className="whitespace-nowrap px-3 py-2.5">Prénom</th>
              <th className="whitespace-nowrap px-3 py-2.5">Rôle</th>
              <th className="whitespace-nowrap px-3 py-2.5">Statut</th>
              <th className="whitespace-nowrap px-3 py-2.5">Catégorie</th>
              <th className="whitespace-nowrap px-3 py-2.5">Téléphone</th>
              <th className="whitespace-nowrap px-3 py-2.5">E-mail</th>
            </tr>
          </thead>
          <tbody>
            {coachRows.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={7}
                    className="border-b border-navy/10 bg-navy/[0.07] px-3 py-2 text-xs font-bold uppercase tracking-wide text-navy"
                  >
                    Coachs ({coachRows.length})
                  </td>
                </tr>
                {coachRows.map((r) => renderRow(r.key, r.person, r.role, null, r.phone, r.email))}
              </>
            )}
            {card.coaches.length === 0 &&
              card.pendingCoaches.length === 0 &&
              card.pendingCoachNames && (
                <tr>
                  <td colSpan={7} className="px-3 py-2.5 text-sm text-blue-950">
                    {card.pendingCoachNames}
                  </td>
                </tr>
              )}
            {playerRows.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={7}
                    className="border-b border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-emerald-700"
                  >
                    Joueurs ({playerRows.length})
                  </td>
                </tr>
                {playerRows.map((p) => renderRow(p.id, p, "JOUEUR", p.birthDate))}
              </>
            )}
            {coachRows.length === 0 &&
              !card.pendingCoachNames &&
              playerRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-sm text-zinc-400">
                    Aucun membre pour le moment.
                  </td>
                </tr>
              )}
          </tbody>
        </table>
      </div>

      {/* Cartes empilées en dessous de 640px (sm) — même contenu que le
          tableau ci-dessus (renderCard réutilise roleBadge/PlayerYearBadge
          comme renderRow), groupées Coachs/Joueurs à l'identique. */}
      <div className="mt-3 flex flex-col gap-4 sm:hidden">
        {coachRows.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-navy">
              Coachs ({coachRows.length})
            </p>
            <div className="flex flex-col gap-2">
              {coachRows.map((r) => renderCard(r.key, r.person, r.role, null, true, r.phone, r.email))}
            </div>
          </div>
        )}
        {card.coaches.length === 0 && card.pendingCoaches.length === 0 && card.pendingCoachNames && (
          <p className="rounded-2xl border border-zinc-100 bg-white p-3.5 text-sm text-blue-950 shadow-sm">
            {card.pendingCoachNames}
          </p>
        )}
        {playerRows.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
              Joueurs ({playerRows.length})
            </p>
            <div className="flex flex-col gap-2">
              {playerRows.map((p) => renderCard(p.id, p, "JOUEUR", p.birthDate, false))}
            </div>
          </div>
        )}
        {coachRows.length === 0 && !card.pendingCoachNames && playerRows.length === 0 && (
          <p className="px-3 py-4 text-center text-sm text-zinc-400">Aucun membre pour le moment.</p>
        )}
      </div>

      {card.ffbbUrl && (
        <a
          href={card.ffbbUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-ubac-blue hover:underline"
        >
          <ExternalLink className="h-4 w-4" />
          Voir la fiche équipe FFBB
        </a>
      )}
    </div>
  );
}
