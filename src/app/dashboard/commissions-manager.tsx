"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Landmark,
  RotateCcw,
  Settings,
  X,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { BRIQUE_GROUPS } from "./access-briques";
import { commissionMeta } from "@/lib/commission-labels";
import BenevolesManager from "./benevoles-manager";
import CopyLinkButton, { IconActionButton } from "./link-share-controls";
import type { AdminAccessProfile, AdminBenevole, WhatsAppGroup } from "./page";

// Génère un jeton équivalent à celui posé côté base par défaut
// (encode(gen_random_bytes(24),'hex') -> 48 caractères hexadécimaux) —
// nécessaire ici puisqu'une régénération est une UPDATE, pas une INSERT
// (le DEFAULT de la colonne ne joue que sur la ligne déjà existante à la
// création du groupe).
function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function CommissionCard({
  group,
  title,
  accessProfiles,
}: {
  group: WhatsAppGroup;
  title: string;
  accessProfiles: AdminAccessProfile[];
}) {
  const router = useRouter();
  // Retour de Cindy du 10/09 : ["calendrier", "tableau_de_bord"] plutôt que
  // [] pour une commission qui n'a JAMAIS encore été configurée (aucun
  // profil d'accès existant) -- une commission déjà réglée, même avec zéro
  // brique cochée, garde exactement sa sélection actuelle (accessProfileId
  // non nul, voir la condition ci-dessous).
  const initialBriques = group.accessProfileId
    ? accessProfiles.find((p) => p.id === group.accessProfileId)?.briques ?? []
    : ["calendrier", "tableau_de_bord"];
  const [open, setOpen] = useState(false);
  const [briques, setBriques] = useState<string[]>(initialBriques);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setBriques(initialBriques));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.accessProfileId]);

  function toggleBrique(key: string) {
    setBriques((b) => (b.includes(key) ? b.filter((x) => x !== key) : [...b, key]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const initialProfileId = group.accessProfileId;
    // Retour de Cindy du 10/09 : pour une commission jamais configurée,
    // initialBriques vaut déjà ["calendrier", "tableau_de_bord"] (défaut
    // pré-coché, voir plus haut) -- sans ce cas particulier, cliquer
    // "Enregistrer" sans rien toucher aurait laissé "changed" à false et
    // n'aurait donc jamais créé le profil, malgré des cases visiblement
    // cochées à l'écran.
    const changed = !initialProfileId
      ? briques.length > 0
      : [...briques].sort().join(",") !== [...initialBriques].sort().join(",");

    if (changed) {
      if (briques.length === 0) {
        if (initialProfileId) {
          const { error: detachError } = await supabase
            .from("whatsapp_groups")
            .update({ access_profile_id: null })
            .eq("id", group.id);
          if (detachError) {
            setSaving(false);
            setError(`Accès non mis à jour : ${detachError.message}`);
            return;
          }
        }
      } else if (initialProfileId) {
        const { error: clearError } = await supabase
          .from("access_profile_briques")
          .delete()
          .eq("profile_id", initialProfileId);
        if (clearError) {
          setSaving(false);
          setError(`Accès non mis à jour : ${clearError.message}`);
          return;
        }
        const { error: insertError } = await supabase
          .from("access_profile_briques")
          .insert(briques.map((brique) => ({ profile_id: initialProfileId, brique })));
        if (insertError) {
          setSaving(false);
          setError(`Accès non mis à jour : ${insertError.message}`);
          return;
        }
      } else {
        // Nom garanti unique (access_profiles.name est UNIQUE) via l'id du
        // groupe, jamais affiché comme un choix nulle part — même
        // mécanisme que benevoles-manager.tsx/member-detail-modal.tsx
        // ("Comité directeur").
        const profileName = `Commission — ${title} (${group.id.slice(0, 8)})`;
        const { data: createdProfile, error: createError } = await supabase
          .from("access_profiles")
          .insert({ name: profileName })
          .select("id")
          .single();
        if (createError || !createdProfile) {
          setSaving(false);
          setError(`Accès non créé : ${createError?.message ?? ""}`);
          return;
        }
        const { error: insertError } = await supabase
          .from("access_profile_briques")
          .insert(briques.map((brique) => ({ profile_id: createdProfile.id, brique })));
        if (insertError) {
          setSaving(false);
          setError(`Accès non mis à jour : ${insertError.message}`);
          return;
        }
        const { error: attachError } = await supabase
          .from("whatsapp_groups")
          .update({ access_profile_id: createdProfile.id })
          .eq("id", group.id);
        if (attachError) {
          setSaving(false);
          setError(`Accès non mis à jour : ${attachError.message}`);
          return;
        }
      }
    }

    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  async function regenerateToken() {
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("whatsapp_groups")
      .update({ access_token: randomToken() })
      .eq("id", group.id);
    setSaving(false);
    if (updateError) {
      setError(`Régénération impossible : ${updateError.message}`);
      return;
    }
    setConfirmRegenerate(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-100 border-l-4 border-l-ubac-yellow bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-zinc-900">{title}</span>
        {/* Retour de Cindy du 11/09 ("l'icône rouage est trop peu visible") :
            IconActionButton (link-share-controls.tsx) -- cercle plus grand,
            fond navy discret, hover marqué, info-bulle au survol -- plutôt
            qu'un simple trait gris sans zone de clic perceptible. */}
        <IconActionButton icon={Settings} label="Configurer les accès" onClick={() => setOpen((v) => !v)} />
      </div>
      {briques.length > 0 && (
        <p className="text-xs text-zinc-400">
          {briques.length} accès en lecture seule
        </p>
      )}
      {/* Retour de Cindy du 11/09 ("le bouton copier doit être identique
          partout") : CopyLinkButton (link-share-controls.tsx), même
          composant que "Copier le lien d'accès enfant" -- le lien d'une
          commission existe toujours déjà (posé à la création du groupe),
          getLink n'a donc jamais besoin de le créer, juste de le renvoyer. */}
      <CopyLinkButton
        label="Copier son lien"
        disabled={!group.accessToken}
        getLink={() => `${window.location.origin}/commission/${group.accessToken}`}
      />

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !saving && setOpen(false)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-sm flex-col rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
              <h3 className="flex items-center gap-1.5 font-semibold text-zinc-900">
                <Settings className="h-4 w-4 shrink-0 text-zinc-500" />
                {title}
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex flex-col gap-3">
                <p className="text-xs text-zinc-500">
                  Tout le monde utilisant le lien de cette commission voit ces sections en
                  lecture seule — aucune configuration par personne.
                </p>
                {BRIQUE_GROUPS.map((group2) => (
                  <div key={group2.label}>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                      {group2.label}
                    </p>
                    <div className="flex flex-col gap-1">
                      {group2.briques.map((b) => (
                        <label key={b.key} className="flex items-center gap-2 text-sm text-zinc-700">
                          <input
                            type="checkbox"
                            checked={briques.includes(b.key)}
                            onChange={() => toggleBrique(b.key)}
                            className="h-3.5 w-3.5 rounded border-zinc-300 text-ubac-yellow-dark focus:ring-ubac-yellow"
                          />
                          {b.label}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Retour de Cindy du 10/09 ("conserver la possibilité de
                    régénérer/révoquer le lien... en cas de besoin de
                    sécurité") : même principe que le lien d'invitation
                    WhatsApp existant (whatsapp-groups-manager.tsx) --
                    l'ancien lien cesse aussitôt de fonctionner. */}
                <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
                  <label className="block text-xs font-medium text-zinc-600">Lien public</label>
                  {confirmRegenerate ? (
                    <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5">
                      <p className="text-xs text-red-700">
                        L&apos;ancien lien cessera aussitôt de fonctionner pour tout le monde.
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmRegenerate(false)}
                          className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-white"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={regenerateToken}
                          className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                        >
                          {saving ? "..." : "Régénérer le lien"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRegenerate(true)}
                      className="flex w-fit items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Régénérer le lien
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="border-t border-zinc-100 px-5 py-3">
              {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setOpen(false)}
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
    </div>
  );
}

// Remplace benevoles-manager.tsx comme mode de fonctionnement PRINCIPAL
// (retour de Cindy du 10/09, "Accès Commissions & Administration") : les
// accès en lecture seule se gèrent désormais par commission entière (même
// liste que whatsapp-groups-manager.tsx, category='COMMISSION') plutôt
// que personne par personne. L'accès individuel (BenevolesManager) reste
// disponible mais replié par défaut, en option secondaire — voir son
// propre commentaire plus bas.
export default function CommissionsManager({
  whatsappGroups,
  accessProfiles,
  benevoles,
}: {
  whatsappGroups: WhatsAppGroup[];
  accessProfiles: AdminAccessProfile[];
  benevoles: AdminBenevole[];
}) {
  const [individualOpen, setIndividualOpen] = useState(false);

  const commissions = whatsappGroups
    .filter((g) => g.category === "COMMISSION")
    .map((g) => ({ group: g, ...commissionMeta(g.name) }))
    .sort((a, b) => a.rank - b.rank);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">
          <Landmark className="h-3.5 w-3.5" />
          {commissions.length} commission{commissions.length > 1 ? "s" : ""}
        </p>
        {/* Retour de Cindy du 11/09 ("changer le texte... faire concis") :
            reformulé pour préciser à qui ce lien s'adresse (les personnes
            hors du club, sans compte) plutôt qu'une description générale
            du fonctionnement. */}
        <p className="mb-3 text-sm text-zinc-500">
          À partager une seule fois aux personnes « non membres du club »
          (message épinglé dans son groupe WhatsApp). Toute personne l&apos;utilisant voit
          automatiquement les mêmes sections en lecture seule et les besoins en bénévoles qui la
          concernent — aucune connexion, aucune fiche à créer.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {commissions.map(({ group, label }) => (
            <CommissionCard key={group.id} group={group} title={label} accessProfiles={accessProfiles} />
          ))}
        </div>
      </div>

      {/* Option secondaire (retour de Cindy du 10/09, point 7) : un accès
          individuel reste utile pour inviter quelqu'un à un événement
          précis (event_benevole_invites, RSVP, notifications) — ce que le
          lien d'une commission, partagé et sans identité, ne sait pas
          faire. Repliée par défaut : ce n'est plus le mode de
          fonctionnement principal. */}
      <div className="border-t border-zinc-100 pt-4">
        <button
          type="button"
          onClick={() => setIndividualOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 text-left"
        >
          <span className="text-sm font-semibold text-zinc-700">
            Ajouter un accès individuel
          </span>
          {individualOpen ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-zinc-400" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
          )}
        </button>
        <p className="mt-1 text-xs text-zinc-400">
          Pour inviter une personne précise à un événement (buvette d&apos;un match, table de
          marque...) plutôt que tout le monde d&apos;une commission.
        </p>
        {individualOpen && (
          <div className="mt-4">
            <BenevolesManager
              benevoles={benevoles}
              accessProfiles={accessProfiles}
              whatsappGroups={whatsappGroups}
            />
          </div>
        )}
      </div>
    </div>
  );
}
