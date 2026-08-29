"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Landmark, MessageCircle, Settings, Shirt, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { teamLabel } from "@/lib/teams";
import type { WhatsAppGroup } from "./page";

type TeamRef = { id: string; name: string | null; category: string | null };

// Ordre explicite demandé par Cindy pour cet écran : du plus grand au plus
// petit gabarit — ni le sort_order des équipes (pensé pour "équipe mère
// puis déclinaisons", pas pour l'âge) ni celui des commissions en base
// (ordre de saisie du seed initial) ne correspondaient. Comparé au nom
// canonique de l'équipe (teams.name), pas au group.name saisonnier.
const TEAM_ORDER = [
  "Séniors 1",
  "Séniors 2",
  "Loisirs F",
  "Loisirs Mixtes",
  "U18M-1",
  "U18M-2",
  "U15M",
  "U13F",
  "U13M-1",
  "U13M-2",
  "U13M",
  "U11 Mixte",
  "U9 Mixte",
  "Babys",
];

// Les group.name réels sont saisis au seed avec le millésime ("Comité
// directeur 2026/27") — pas pensés pour tenir sur une carte épurée. Un nom
// d'affichage court est associé ici, avec le même ordre que demandé.
const COMMISSION_LABELS: { match: string; label: string }[] = [
  { match: "Bureau", label: "Bureau" },
  { match: "Comité directeur", label: "Comité Directeur" },
  { match: "Team communication", label: "Team Communication" },
  { match: "Coachs UBAC", label: "Coachs" },
  { match: "Salariés", label: "Salariés" },
  { match: "Animations et événements", label: "Animation & Événements" },
  { match: "Buvette", label: "Buvette" },
  { match: "Commission sponsors", label: "Sponsor" },
  { match: "Calendrier et dates à retenir", label: "Calendrier et dates à retenir" },
];

function commissionMeta(name: string) {
  const idx = COMMISSION_LABELS.findIndex((c) => name.startsWith(c.match));
  return { label: idx === -1 ? name : COMMISSION_LABELS[idx].label, rank: idx === -1 ? COMMISSION_LABELS.length : idx };
}

// Carte épurée, un seul geste : ouvrir le groupe. Pas de champ pré-rempli
// ni de bouton copier-coller — juste le lien direct, et une roue crantée
// discrète pour le Bureau quand ce lien doit être corrigé.
function GroupCard({ title, group }: { title: string; group: WhatsAppGroup }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [linkInput, setLinkInput] = useState(group.inviteLink ?? "");
  const [saving, setSaving] = useState(false);

  async function saveLink() {
    setSaving(true);
    const supabase = createClient();
    await supabase
      .from("whatsapp_groups")
      .update({ invite_link: linkInput || null })
      .eq("id", group.id);
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-zinc-900">
          <MessageCircle className="h-4 w-4 shrink-0 text-emerald-600" />
          <span className="truncate">{title}</span>
        </span>
        {group.canManage && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            title="Modifier le lien d'invitation"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
      </div>

      {group.inviteLink ? (
        <a
          href={group.inviteLink}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
        >
          <ExternalLink className="h-4 w-4" />
          Ouvrir sur WhatsApp
        </a>
      ) : (
        <span className="rounded-full bg-zinc-50 px-3.5 py-2 text-center text-xs font-medium text-zinc-400">
          Lien non renseigné
        </span>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 font-semibold text-zinc-900">
                <Settings className="h-4 w-4 shrink-0 text-zinc-500" />
                {title}
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="mb-1 block text-xs font-medium text-zinc-600">
              Lien d&apos;invitation
            </label>
            <input
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder="https://chat.whatsapp.com/..."
              className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
            />
            <button
              onClick={saveLink}
              disabled={saving || linkInput === (group.inviteLink ?? "")}
              className="mt-3 w-full rounded-full bg-ubac-yellow px-3 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-50"
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Hub d'accès rapide : deux grilles de cartes, un seul but par carte
// (rejoindre le bon groupe en un tap) — plus le formulaire/liste de
// membres de l'ancien écran, qui demandait plusieurs clics pour l'usage
// le plus fréquent (juste ouvrir WhatsApp).
export default function WhatsAppGroupsManager({
  groups,
  teams,
  // Retour de Cindy du 29/08 : côté Famille, "Mon équipe"/"Mon enfant"
  // affiche déjà LE groupe de l'équipe concernée — pas besoin d'y
  // remontrer tous les groupes de toutes les équipes du club en plus des
  // commissions ici. Désactivé uniquement pour cet appelant-là ;
  // Bureau/Coach gardent les deux sections.
  showTeamGroups = true,
}: {
  groups: WhatsAppGroup[];
  teams?: TeamRef[];
  showTeamGroups?: boolean;
}) {
  const teamById = new Map((teams ?? []).map((t) => [t.id, t]));

  const equipeCards = showTeamGroups
    ? groups
        .filter((g) => g.category === "EQUIPE")
        .map((g) => {
          const team = g.teamId ? teamById.get(g.teamId) : undefined;
          const rank = team?.name ? TEAM_ORDER.indexOf(team.name) : -1;
          return {
            group: g,
            title: team ? teamLabel(team) : g.name,
            rank: rank === -1 ? TEAM_ORDER.length : rank,
          };
        })
        .sort((a, b) => a.rank - b.rank)
    : [];

  const commissionCards = groups
    .filter((g) => g.category === "COMMISSION")
    .map((g) => {
      const { label, rank } = commissionMeta(g.name);
      return { group: g, title: label, rank };
    })
    .sort((a, b) => a.rank - b.rank);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          <Landmark className="h-3.5 w-3.5" />
          Commissions &amp; Administration
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {commissionCards.map(({ group, title }) => (
            <GroupCard key={group.id} title={title} group={group} />
          ))}
          {commissionCards.length === 0 && (
            <p className="text-sm text-zinc-400">Aucun groupe.</p>
          )}
        </div>
      </div>

      {showTeamGroups && (
        <div className="flex flex-col gap-3">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            <Shirt className="h-3.5 w-3.5" />
            Équipes du Club
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {equipeCards.map(({ group, title }) => (
              <GroupCard key={group.id} title={title} group={group} />
            ))}
            {equipeCards.length === 0 && <p className="text-sm text-zinc-400">Aucun groupe.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
