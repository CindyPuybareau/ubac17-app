"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, HeartHandshake, MessageCircle, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { avatarColor } from "@/lib/avatar-color";
import ConfirmDialog from "./confirm-dialog";
import EmptyState from "./empty-state";
import { BRIQUE_GROUPS } from "./access-briques";
import { formatPersonName } from "@/lib/names";
import type { AdminAccessProfile, AdminBenevole, WhatsAppGroup } from "./page";

type BenevoleForm = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
  // [] = aucun accès supplémentaire (comportement historique : juste ses
  // événements/besoins de bénévolat habituels) -- voir accessProfileId sur
  // AdminBenevole. Cochées ici directement (retour de Cindy du 05/09,
  // "tout ça réuni") plutôt que choisies dans un catalogue de profils
  // séparé -- même mécanisme que le rôle "Comité directeur" côté fiche
  // membre (member-detail-modal.tsx) : un profil dédié à CE bénévole est
  // créé/mis à jour silencieusement derrière, jamais montré comme un choix.
  briques: string[];
  // [] = aucun groupe (retour de Cindy du 06/09, "quel groupe whatsapp lui
  // sera attribué", puis "un bénévole peut faire partie de plusieurs
  // groupes") -- simple attribution informative, voir whatsappGroupIds sur
  // AdminBenevole.
  whatsappGroupIds: string[];
};

const EMPTY_FORM: BenevoleForm = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  notes: "",
  // Retour de Cindy du 10/09 : ["calendrier", "tableau_de_bord"] par
  // défaut pour un NOUVEAU bénévole plutôt que [] -- toggleBrique reste la
  // seule façon d'en retirer un ensuite, même mécanisme que
  // member-detail-modal.tsx/commissions-manager.tsx. Sans effet sur un
  // bénévole déjà existant (toForm() reprend ses briques déjà
  // enregistrées, jamais EMPTY_FORM).
  briques: ["calendrier", "tableau_de_bord"],
  whatsappGroupIds: [],
};

function toForm(b: AdminBenevole, accessProfiles: AdminAccessProfile[]): BenevoleForm {
  return {
    firstName: b.firstName,
    lastName: b.lastName,
    phone: b.phone ?? "",
    email: b.email ?? "",
    notes: b.notes ?? "",
    briques: (b.accessProfileId && accessProfiles.find((p) => p.id === b.accessProfileId)?.briques) || [],
    whatsappGroupIds: b.whatsappGroupIds,
  };
}

// Retour de Cindy du 2026-08-25 : des personnes qui aident le Bureau sur
// l'organisation d'un événement sans être joueur, ni Bureau, ni forcément
// parent d'un joueur du club — jamais de lien avec les cotisations ni
// l'effectif d'une équipe (voir la migration 20261027000000_benevoles.sql).
// Même famille de composant que sponsors-manager.tsx (formulaire modal
// réutilisé pour créer ET modifier), avec en plus le lien privé d'accès
// (voir /benevole/[token]/route.ts) à copier-coller pour l'envoyer par
// SMS/e-mail — jamais affiché nulle part ailleurs que sur cette fiche,
// aucun autre moyen de le retrouver si perdu (il faudrait le régénérer).
export default function BenevolesManager({
  benevoles,
  accessProfiles,
  whatsappGroups,
}: {
  benevoles: AdminBenevole[];
  // Retour de Cindy du 05/09 ("profil et bénévoles doivent être
  // fusionnés") : un bénévole peut recevoir le même profil sur-mesure
  // qu'un compte Bureau, pour voir en plus (toujours en lecture seule) les
  // briques cochées sur son lien privé -- voir /benevole/view.
  accessProfiles: AdminAccessProfile[];
  // Retour de Cindy du 06/09 : pour choisir à quel groupe WhatsApp
  // "Commissions & Administration" ce bénévole est rattaché -- jamais un
  // groupe d'équipe, qui n'a pas de sens pour lui.
  whatsappGroups: WhatsAppGroup[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<AdminBenevole | "new" | null>(null);
  const [form, setForm] = useState<BenevoleForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AdminBenevole | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // Retour de Cindy du 06/09 ("Jimmy Pouplard apparaît 5 fois") : la fiche
  // est créée AVANT l'étape suivante (le profil d'accès), en deux appels
  // séparés -- si cette deuxième étape échoue, "Enregistrer" ressayé sur
  // la même modale (toujours en mode "new") recréait une fiche entière à
  // chaque fois plutôt que de continuer sur celle déjà créée. Mémorise cet
  // id dès la création pour que tout ressai ultérieur mette à jour cette
  // même fiche au lieu d'en insérer une nouvelle -- remis à zéro seulement
  // à l'ouverture d'un VRAI nouveau formulaire (openNew) ou une fois
  // l'enregistrement complet réussi.
  const [pendingNewBenevoleId, setPendingNewBenevoleId] = useState<string | null>(null);

  const visible = benevoles.filter((b) => showArchived || !b.archivedAt);

  function openNew() {
    setForm(EMPTY_FORM);
    setError(null);
    setPendingNewBenevoleId(null);
    setEditing("new");
  }

  function openEdit(b: AdminBenevole) {
    setForm(toForm(b, accessProfiles));
    setError(null);
    setEditing(b);
  }

  function toggleBrique(key: string) {
    setForm((f) =>
      f.briques.includes(key)
        ? { ...f, briques: f.briques.filter((b) => b !== key) }
        : { ...f, briques: [...f.briques, key] }
    );
  }

  function toggleWhatsappGroup(id: string) {
    setForm((f) =>
      f.whatsappGroupIds.includes(id)
        ? { ...f, whatsappGroupIds: f.whatsappGroupIds.filter((g) => g !== id) }
        : { ...f, whatsappGroupIds: [...f.whatsappGroupIds, id] }
    );
  }

  async function save() {
    if (!form.firstName.trim() || !form.lastName.trim()) {
      setError("Prénom et nom sont obligatoires.");
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const payload = {
      first_name: form.firstName.trim(),
      last_name: form.lastName.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      notes: form.notes.trim() || null,
    };

    let benevoleId: string;
    if (editing !== "new" && editing) {
      const { error: writeError } = await supabase.from("benevoles").update(payload).eq("id", editing.id);
      if (writeError) {
        setSaving(false);
        setError("Enregistrement impossible, réessaie.");
        return;
      }
      benevoleId = editing.id;
    } else if (pendingNewBenevoleId) {
      // Ressai après l'échec d'une étape suivante (voir pendingNewBenevoleId
      // plus haut) : on met à jour la fiche déjà créée au lieu d'en insérer
      // une nouvelle.
      const { error: writeError } = await supabase
        .from("benevoles")
        .update(payload)
        .eq("id", pendingNewBenevoleId);
      if (writeError) {
        setSaving(false);
        setError("Enregistrement impossible, réessaie.");
        return;
      }
      benevoleId = pendingNewBenevoleId;
    } else {
      const { data: created, error: writeError } = await supabase
        .from("benevoles")
        .insert(payload)
        .select("id")
        .single();
      if (writeError || !created) {
        setSaving(false);
        setError("Enregistrement impossible, réessaie.");
        return;
      }
      benevoleId = created.id;
      setPendingNewBenevoleId(benevoleId);
    }

    // Accès supplémentaire (retour de Cindy du 05/09, "tout ça réuni") :
    // même mécanisme que le rôle "Comité directeur" (member-detail-
    // modal.tsx) -- un profil dédié à CE bénévole créé/mis à jour ici,
    // jamais choisi dans un catalogue séparé. Contrairement à Comité
    // directeur, [] (aucune brique) est un état valide en soi (= aucun
    // accès supplémentaire, comportement historique) : pas besoin de
    // profil du tout dans ce cas, à la différence d'un rôle Bureau où
    // null signifierait à tort "Bureau complet".
    const initialProfileId = editing !== "new" && editing ? editing.accessProfileId : null;
    const initialBriques =
      (initialProfileId && accessProfiles.find((p) => p.id === initialProfileId)?.briques) || [];
    const briquesChanged =
      [...form.briques].sort().join(",") !== [...initialBriques].sort().join(",");

    if (briquesChanged) {
      if (form.briques.length === 0) {
        if (initialProfileId) {
          const { error: detachError } = await supabase
            .from("benevoles")
            .update({ access_profile_id: null })
            .eq("id", benevoleId);
          if (detachError) {
            setSaving(false);
            setError(`Accès supplémentaire non mis à jour : ${detachError.message}`);
            return;
          }
        }
      } else if (initialProfileId) {
        const { error: clearBriquesError } = await supabase
          .from("access_profile_briques")
          .delete()
          .eq("profile_id", initialProfileId);
        if (clearBriquesError) {
          setSaving(false);
          setError(`Accès supplémentaire non mis à jour : ${clearBriquesError.message}`);
          return;
        }
        const { error: insertBriquesError } = await supabase
          .from("access_profile_briques")
          .insert(form.briques.map((brique) => ({ profile_id: initialProfileId, brique })));
        if (insertBriquesError) {
          setSaving(false);
          setError(`Accès supplémentaire non mis à jour : ${insertBriquesError.message}`);
          return;
        }
      } else {
        // Nom garanti unique (access_profiles.name est UNIQUE) via l'id du
        // bénévole, jamais affiché comme un choix nulle part.
        const profileName = `Bénévole — ${formatPersonName(
          form.firstName,
          form.lastName,
          "Bénévole"
        )} (${benevoleId.slice(0, 8)})`;
        const { data: createdProfile, error: createProfileError } = await supabase
          .from("access_profiles")
          .insert({ name: profileName })
          .select("id")
          .single();
        if (createProfileError || !createdProfile) {
          setSaving(false);
          setError(`Accès supplémentaire non créé : ${createProfileError?.message ?? ""}`);
          return;
        }
        const { error: insertBriquesError } = await supabase
          .from("access_profile_briques")
          .insert(form.briques.map((brique) => ({ profile_id: createdProfile.id, brique })));
        if (insertBriquesError) {
          setSaving(false);
          setError(`Accès supplémentaire non mis à jour : ${insertBriquesError.message}`);
          return;
        }
        const { error: attachError } = await supabase
          .from("benevoles")
          .update({ access_profile_id: createdProfile.id })
          .eq("id", benevoleId);
        if (attachError) {
          setSaving(false);
          setError(`Accès supplémentaire non mis à jour : ${attachError.message}`);
          return;
        }
      }
    }

    // Groupes WhatsApp (retour de Cindy du 06/09, "un bénévole peut faire
    // partie de plusieurs groupes") : relation à part (benevole_whatsapp_
    // groups), synchronisée en diff comme les invitations de bénévoles à
    // un événement -- plus simple qu'un vider-puis-réinsérer vu le faible
    // volume (quelques groupes tout au plus), et ça évite une suppression
    // suivie d'une réinsertion pour un groupe resté coché.
    const initialGroupIds = editing !== "new" && editing ? editing.whatsappGroupIds : [];
    const groupsToAdd = form.whatsappGroupIds.filter((id) => !initialGroupIds.includes(id));
    const groupsToRemove = initialGroupIds.filter((id) => !form.whatsappGroupIds.includes(id));
    if (groupsToAdd.length > 0) {
      const { error: addGroupsError } = await supabase
        .from("benevole_whatsapp_groups")
        .insert(groupsToAdd.map((whatsapp_group_id) => ({ benevole_id: benevoleId, whatsapp_group_id })));
      if (addGroupsError) {
        setSaving(false);
        setError(`Groupes WhatsApp non mis à jour : ${addGroupsError.message}`);
        return;
      }
    }
    if (groupsToRemove.length > 0) {
      const { error: removeGroupsError } = await supabase
        .from("benevole_whatsapp_groups")
        .delete()
        .eq("benevole_id", benevoleId)
        .in("whatsapp_group_id", groupsToRemove);
      if (removeGroupsError) {
        setSaving(false);
        setError(`Groupes WhatsApp non mis à jour : ${removeGroupsError.message}`);
        return;
      }
    }

    setSaving(false);
    setEditing(null);
    setPendingNewBenevoleId(null);
    router.refresh();
  }

  async function confirmArchive() {
    if (!archiveTarget) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    // Audit du 31/08 : ni erreur ni ligne affectée n'étaient vérifiées.
    const { error: writeError, data } = await supabase
      .from("benevoles")
      .update({ archived_at: archiveTarget.archivedAt ? null : new Date().toISOString() })
      .eq("id", archiveTarget.id)
      .select("id");
    setSaving(false);
    if (writeError) {
      setError(`Action impossible : ${writeError.message}`);
      return;
    }
    if ((data?.length ?? 0) === 0) {
      setError("Action bloquée par les droits d'accès (RLS). Réessaie.");
      return;
    }
    setArchiveTarget(null);
    router.refresh();
  }

  async function copyLink(b: AdminBenevole) {
    const link = `${window.location.origin}/benevole/${b.accessToken}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(b.id);
      setTimeout(() => setCopiedId((id) => (id === b.id ? null : id)), 2000);
    } catch {
      setError("Copie impossible, copie le lien à la main.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Action principale à gauche, avant le reste (retour de Cindy du
          2026-08-22 sur "Créer un événement" — même convention reprise
          ici : le bouton d'ajout passe avant les filtres/compteur, pas
          après). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-1.5 rounded-full bg-ubac-yellow px-3.5 py-1.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark"
        >
          <HeartHandshake className="h-4 w-4" />
          Ajouter un bénévole
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
            />
            Afficher les retirés
          </label>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            <HeartHandshake className="h-3.5 w-3.5" />
            {visible.length} bénévole{visible.length > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={HeartHandshake} message="Aucun bénévole enregistré pour le moment." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((b) => {
            const contact = [b.phone, b.email].filter(Boolean).join(" · ");
            // Retour de Cindy du 06/09 ("plus sexy... voir en un clin
            // d'œil de quel groupe whatsapp il fait partie") : avatar-
            // initiale coloré (même principe que child-team-tab.tsx) et
            // ses groupes en pastilles WhatsApp, visibles sans ouvrir la
            // fiche.
            const groupNames = b.whatsappGroupIds
              .map((id) => whatsappGroups.find((g) => g.id === id)?.name)
              .filter((name): name is string => Boolean(name));
            return (
              // Retour de Cindy du 06/09 ("liséré à gauche, même finesse
              // que les autres cartes") : border-l-4, comme les cartes
              // d'événement (calendar-view.tsx) ou de coach/joueur (team-
              // card.tsx) -- la barre en dégradé en haut essayée d'abord
              // ne suivait pas cette convention.
              <div
                key={b.id}
                className={`flex flex-col gap-3 rounded-2xl border border-zinc-100 border-l-4 border-l-ubac-yellow bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
                  b.archivedAt ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${avatarColor(b.id)}`}
                      >
                        {(b.firstName || "?").charAt(0).toUpperCase()}
                      </span>
                      <span className="min-w-0 truncate text-sm font-semibold text-zinc-900">
                        {b.firstName} {b.lastName}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(b)}
                        title="Modifier"
                        className="flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setArchiveTarget(b)}
                        title={b.archivedAt ? "Réactiver" : "Retirer"}
                        className={`flex h-7 w-7 items-center justify-center rounded-full ${
                          b.archivedAt
                            ? "text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700"
                            : "text-red-400 hover:bg-red-50 hover:text-red-600"
                        }`}
                      >
                        {b.archivedAt ? (
                          <RotateCcw className="h-3.5 w-3.5" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                  {contact && <p className="text-xs text-zinc-500">{contact}</p>}
                  {b.notes && <p className="text-xs text-zinc-400">{b.notes}</p>}
                  {groupNames.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {groupNames.map((name) => (
                        <span
                          key={name}
                          className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                        >
                          <MessageCircle className="h-3 w-3 shrink-0" />
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => copyLink(b)}
                    className="mt-1 flex w-fit items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
                  >
                    {copiedId === b.id ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        Lien copié
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copier son lien privé
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !saving && setEditing(null)}
        >
          {/* Retour de Cindy du 06/09 ("je ne peux pas enregistrer") : les
              briques ajoutées ont fait dépasser cette carte de la hauteur
              de l'écran, avec le bouton "Enregistrer" hors champ et aucun
              moyen d'y accéder — même gabarit qu'add-member-modal.tsx
              (Ajouter un membre) : hauteur plafonnée, en-tête et pied de
              page fixes, seul le contenu du milieu défile. */}
          <div
            className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <h3 className="flex items-center gap-1.5 font-semibold text-zinc-900">
                <HeartHandshake className="h-4 w-4 shrink-0 text-zinc-500" />
                {editing === "new" ? "Ajouter un bénévole" : "Modifier le bénévole"}
              </h3>
              <button
                onClick={() => setEditing(null)}
                className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
            <div className="flex flex-col gap-2.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Prénom</label>
                <input
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Nom</label>
                <input
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Téléphone</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Notes</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Ex. disponible le week-end seulement"
                  className="w-full rounded-lg border border-zinc-200 px-2.5 py-1.5 text-sm"
                />
              </div>
              {/* Retour de Cindy du 06/09 ("quel groupe whatsapp lui sera
                  attribué", puis "peut faire partie de plusieurs groupes,
                  merci de créer des cases à cocher") : parmi les groupes
                  "Commissions & Administration" seulement -- jamais un
                  groupe d'équipe, qui n'a pas de sens pour un bénévole.
                  Simple attribution informative, ne le rattache pas
                  réellement au groupe (whatsapp_group_members reste
                  réservé aux joueurs). */}
              <div className="flex flex-col gap-1 border-t border-zinc-100 pt-2.5">
                <label className="mb-1 block text-xs font-medium text-zinc-600">
                  Groupes WhatsApp
                </label>
                {whatsappGroups.filter((g) => g.category === "COMMISSION").length === 0 ? (
                  <p className="text-xs text-zinc-400">
                    Aucun groupe « Commissions » créé pour l&apos;instant.
                  </p>
                ) : (
                  whatsappGroups
                    .filter((g) => g.category === "COMMISSION")
                    .map((g) => (
                      <label key={g.id} className="flex items-center gap-2 text-sm text-zinc-700">
                        <input
                          type="checkbox"
                          checked={form.whatsappGroupIds.includes(g.id)}
                          onChange={() => toggleWhatsappGroup(g.id)}
                          className="h-3.5 w-3.5 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                        />
                        {g.name}
                      </label>
                    ))
                )}
              </div>
              {/* Retour de Cindy du 05/09 ("tout ça réuni") : en plus de ses
                  événements/besoins habituels, un bénévole peut voir
                  (toujours en lecture seule) les briques cochées ici même
                  -- plus de catalogue de profils séparé, même principe que
                  le rôle "Comité directeur" côté fiche membre. */}
              <div className="flex flex-col gap-3 border-t border-zinc-100 pt-2.5">
                <label className="block text-xs font-medium text-zinc-600">
                  Accès supplémentaire sur son lien (lecture seule)
                </label>
                {BRIQUE_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                      {group.label}
                    </p>
                    <div className="flex flex-col gap-1">
                      {group.briques.map((b) => (
                        <label key={b.key} className="flex items-center gap-2 text-sm text-zinc-700">
                          <input
                            type="checkbox"
                            checked={form.briques.includes(b.key)}
                            onChange={() => toggleBrique(b.key)}
                            className="h-3.5 w-3.5 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                          />
                          {b.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </div>
            <div className="border-t border-zinc-100 px-5 py-3">
              {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setEditing(null)}
                  disabled={saving}
                  className="rounded-full border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-60"
                >
                  Annuler
                </button>
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex-1 rounded-full bg-ubac-yellow px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
                >
                  {saving ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ConfirmDialog (audit du 31/08) au lieu d'une modale maison
          recopiant la même structure que confirmDelete/archiveTarget
          ailleurs dans l'appli — voir confirm-dialog.tsx. */}
      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title={archiveTarget?.archivedAt ? "Réactiver ce bénévole ?" : "Retirer ce bénévole ?"}
        message={
          archiveTarget?.archivedAt
            ? `${archiveTarget.firstName} ${archiveTarget.lastName} réapparaîtra dans la liste et pourra à nouveau être invité(e) à un événement.`
            : `${archiveTarget?.firstName} ${archiveTarget?.lastName} ne sera plus invité(e) à de nouveaux événements. Son lien cessera de fonctionner, mais son historique reste conservé.`
        }
        confirmLabel={archiveTarget?.archivedAt ? "Réactiver" : "Retirer"}
        pending={saving}
        pendingLabel="..."
        destructive={!archiveTarget?.archivedAt}
        error={archiveTarget ? error : null}
        onConfirm={confirmArchive}
        onCancel={() => {
          setArchiveTarget(null);
          setError(null);
        }}
      />
    </div>
  );
}
