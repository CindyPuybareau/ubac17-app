"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Link2, Search, UserRound, Users, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPersonName, normalizeNameForMatching } from "@/lib/names";
import { isMinor, type UnlinkedAccount } from "@/lib/unlinked-accounts";
import { formatLocalDateFr } from "@/lib/local-date";
import ConfirmDialog from "./confirm-dialog";
import { useToast } from "./toast-context";
import type { AdminMember } from "./page";

type PendingLink = {
  account: UnlinkedAccount;
  playerId: string;
  playerName: string;
  kind: "self" | "parent";
};

function birthYear(birthDate: string | null) {
  return birthDate ? birthDate.slice(0, 4) : null;
}

// Écran "Comptes à rattacher" (audit des connexions du 12/11, demande de
// Cindy) : en tête de l'onglet Membres, uniquement s'il reste au moins un
// compte relié à rien. Part du COMPTE (la personne qui attend devant un
// espace vide) plutôt que de la fiche -- l'inverse de parent-link-manager
// (fiche -> compte), qui reste en place dans la fiche membre.
//
// Deux gestes, les mêmes que ceux déjà faits à la main depuis la fiche :
//  - "C'est sa fiche"  -> players.profile_id (le membre lui-même)
//  - "Parent de"       -> parent_player (espace "Mes enfants")
// Toujours confirmés (ConfirmDialog), jamais appliqués automatiquement.
export default function UnlinkedAccountsPanel({
  accounts,
  members,
}: {
  accounts: UnlinkedAccount[];
  members: AdminMember[];
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [searchFor, setSearchFor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<PendingLink | null>(null);
  // Compte en double à supprimer (retour de Cindy du 12/11, "une croix") --
  // voir /api/delete-duplicate-account pour les garde-fous serveur.
  const [deleteTarget, setDeleteTarget] = useState<UnlinkedAccount | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchResults = useMemo(() => {
    const q = normalizeNameForMatching(query);
    if (q.length < 2) return [];
    return members
      .filter((m) => !m.archivedAt)
      .filter((m) =>
        normalizeNameForMatching(`${m.firstName ?? ""} ${m.lastName ?? ""}`).includes(q) ||
        normalizeNameForMatching(`${m.lastName ?? ""} ${m.firstName ?? ""}`).includes(q)
      )
      .slice(0, 6);
  }, [members, query]);

  if (accounts.length === 0) return null;
  const duplicateCount = accounts.filter((a) => a.duplicateOf).length;
  const toLinkCount = accounts.length - duplicateCount;

  async function confirmLink() {
    if (!pending) return;
    setSaving(true);
    setError(null);
    const supabase = createClient();
    if (pending.kind === "self") {
      // .is("profile_id", null) : ne remplace jamais le compte déjà relié à
      // cette fiche (si quelqu'un l'a relié entre-temps).
      const { data, error: updateError } = await supabase
        .from("players")
        .update({ profile_id: pending.account.profileId })
        .eq("id", pending.playerId)
        .is("profile_id", null)
        .select("id");
      setSaving(false);
      if (updateError) {
        setError("Rattachement impossible, réessaie.");
        return;
      }
      if (!data || data.length === 0) {
        setError("Cette fiche est déjà reliée à un autre compte.");
        return;
      }
    } else {
      const { error: insertError } = await supabase
        .from("parent_player")
        .insert({ parent_id: pending.account.profileId, player_id: pending.playerId });
      setSaving(false);
      if (insertError && insertError.code !== "23505") {
        setError("Rattachement impossible, réessaie.");
        return;
      }
    }
    const accountName = formatPersonName(pending.account.firstName, pending.account.lastName) || "Le compte";
    showToast(
      pending.kind === "self"
        ? `${accountName} est relié à sa fiche.`
        : `${accountName} est relié comme parent de ${pending.playerName}.`
    );
    setPending(null);
    setSearchFor(null);
    setQuery("");
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/delete-duplicate-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: deleteTarget.profileId,
          reason: deleteTarget.duplicateOf ? "duplicate" : "not-member",
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "Suppression impossible, réessaie.");
        return;
      }
    } catch {
      setError("Suppression impossible, vérifie ta connexion et réessaie.");
      return;
    } finally {
      setSaving(false);
    }
    showToast(`Compte ${deleteTarget.email ?? ""} supprimé.`);
    setDeleteTarget(null);
    router.refresh();
  }

  function askLink(account: UnlinkedAccount, playerId: string, playerName: string, kind: "self" | "parent") {
    setError(null);
    setPending({ account, playerId, playerName, kind });
  }

  return (
    <div className="rounded-2xl border border-ubac-yellow/40 bg-ubac-yellow/10 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <Link2 className="h-4 w-4 shrink-0 text-navy" />
          <span className="text-sm font-semibold text-zinc-900">
            {toLinkCount} compte{toLinkCount > 1 ? "s" : ""} à rattacher
            {duplicateCount > 0 && (
              <span className="font-normal text-zinc-500">
                {" "}
                · {duplicateCount} doublon{duplicateCount > 1 ? "s" : ""} possible{duplicateCount > 1 ? "s" : ""}
              </span>
            )}
          </span>
        </span>
        <span className="flex items-center gap-1 text-xs font-medium text-navy">
          {open ? "Masquer" : "Voir"}
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </span>
      </button>
      <p className="mt-1 text-xs text-zinc-600">
        Ces personnes ont créé un compte avec une adresse e-mail qui ne figure sur aucune fiche : elles voient
        un espace vide. Choisis leur fiche (ou celle de leur enfant) pour les relier.
      </p>

      {open && (
        <ul className="mt-3 flex flex-col gap-2">
          {accounts.map((account) => {
            const name = formatPersonName(account.firstName, account.lastName) || "Sans nom";
            const searching = searchFor === account.profileId;
            return (
              <li key={account.profileId} className="rounded-xl border border-zinc-100 bg-white p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-sm font-semibold text-zinc-900">{name}</p>
                    <p className="text-xs text-zinc-500">
                      {account.lastLoginAt
                        ? `Dernière connexion le ${formatLocalDateFr(account.lastLoginAt.slice(0, 10))}`
                        : "Jamais connecté"}
                    </p>
                  </div>
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setDeleteTarget(account);
                      }}
                      aria-label={
                        account.duplicateOf
                          ? `Supprimer le compte en double ${account.email ?? name}`
                          : `Supprimer le compte ${account.email ?? name} (ne fait pas partie du club)`
                      }
                      title={
                        account.duplicateOf
                          ? "Supprimer ce compte en double"
                          : "Supprimer ce compte (ne fait pas partie du club)"
                      }
                      className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                </div>
                <p className="break-all text-xs text-zinc-500">
                  {account.email}
                  {account.phone ? ` · ${account.phone}` : ""}
                </p>

                {account.duplicateOf && (
                  <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                    <span className="font-semibold text-zinc-800">
                      {account.duplicateOf.childFiche ? "Doublon ou parent ?" : "Compte en double :"}
                    </span>{" "}
                    {account.duplicateOf.playerName} a déjà un compte relié à sa fiche
                    {account.duplicateOf.email ? ` (${account.duplicateOf.email})` : ""}.{" "}
                    {account.duplicateOf.childFiche
                      ? "Si ce compte est celui d'un parent qui a tapé le nom de son enfant (regarde l'adresse e-mail), relie-le comme parent ci-dessous. Sinon, la croix supprime ce compte en double."
                      : "La personne peut se connecter avec cette autre adresse : la croix supprime ce compte en double."}
                  </p>
                )}

                {account.suggestions.length > 0 && (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Suggestions</p>
                    {account.suggestions.map((s) => {
                      const playerName = formatPersonName(s.firstName, s.lastName);
                      const year = birthYear(s.birthDate);
                      return (
                        <button
                          key={`${s.kind}-${s.playerId}`}
                          type="button"
                          onClick={() => askLink(account, s.playerId, playerName, s.kind)}
                          className="flex items-center justify-between gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm transition-colors hover:border-navy/40 hover:bg-navy/5"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            {s.kind === "self" ? (
                              <UserRound className="h-4 w-4 shrink-0 text-navy" />
                            ) : (
                              <Users className="h-4 w-4 shrink-0 text-navy" />
                            )}
                            <span className="min-w-0">
                              <span className="font-medium text-zinc-900">
                                {s.kind === "self" ? "C'est sa fiche : " : "Parent de "}
                                {playerName}
                                {year ? ` (${year})` : ""}
                              </span>
                              <span className="block text-xs text-zinc-500">{s.reason}</span>
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-navy">Rattacher</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {searching ? (
                  <div className="mt-2 flex flex-col gap-1.5">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                      <input
                        autoFocus
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Nom ou prénom d'une fiche..."
                        className="w-full rounded-lg border border-zinc-200 py-2 pl-8 pr-3 text-sm focus:border-ubac-blue focus:outline-none focus:ring-1 focus:ring-ubac-blue"
                      />
                    </div>
                    {searchResults.map((m) => {
                      const playerName = formatPersonName(m.firstName, m.lastName);
                      const year = birthYear(m.birthDate);
                      const minor = isMinor(m.birthDate);
                      return (
                        <div
                          key={m.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-100 px-3 py-2 text-sm"
                        >
                          <span className="font-medium text-zinc-900">
                            {playerName}
                            {year ? <span className="font-normal text-zinc-500"> ({year})</span> : null}
                          </span>
                          <span className="flex gap-1.5">
                            {!m.profileId && (
                              <button
                                type="button"
                                onClick={() => askLink(account, m.id, playerName, "self")}
                                className="rounded-full border border-navy/30 px-2.5 py-1 text-xs font-semibold text-navy hover:bg-navy/5"
                              >
                                C&apos;est sa fiche
                              </button>
                            )}
                            {minor && (
                              <button
                                type="button"
                                onClick={() => askLink(account, m.id, playerName, "parent")}
                                className="rounded-full border border-navy/30 px-2.5 py-1 text-xs font-semibold text-navy hover:bg-navy/5"
                              >
                                Parent de
                              </button>
                            )}
                          </span>
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => {
                        setSearchFor(null);
                        setQuery("");
                      }}
                      className="self-start text-xs font-medium text-zinc-500 hover:text-zinc-700"
                    >
                      Fermer la recherche
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchFor(account.profileId);
                      setQuery("");
                    }}
                    className="mt-2 flex items-center gap-1 text-xs font-medium text-navy hover:underline"
                  >
                    <Search className="h-3 w-3" />
                    {account.suggestions.length > 0 ? "Chercher une autre fiche" : "Chercher sa fiche"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={pending !== null}
        title="Confirmer le rattachement"
        destructive={false}
        message={
          pending ? (
            pending.kind === "self" ? (
              <>
                Le compte <strong>{formatPersonName(pending.account.firstName, pending.account.lastName)}</strong> (
                {pending.account.email}) devient le compte de <strong>{pending.playerName}</strong> : il verra son
                propre espace joueur.
              </>
            ) : (
              <>
                Le compte <strong>{formatPersonName(pending.account.firstName, pending.account.lastName)}</strong> (
                {pending.account.email}) devient parent de <strong>{pending.playerName}</strong> : il le verra dans
                &laquo;&nbsp;Mes enfants&nbsp;&raquo;.
              </>
            )
          ) : null
        }
        confirmLabel="Rattacher"
        pending={saving}
        pendingLabel="Rattachement..."
        error={error}
        onConfirm={confirmLink}
        onCancel={() => {
          setPending(null);
          setError(null);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget?.duplicateOf ? "Supprimer ce compte en double ?" : "Supprimer ce compte ?"}
        message={
          deleteTarget ? (
            <>
              Le compte <strong>{deleteTarget.email}</strong> sera supprimé définitivement : on ne pourra plus se
              connecter avec cette adresse.
              {!deleteTarget.duplicateOf && (
                <> À faire uniquement si cette personne ne fait pas partie du club (ni membre, ni parent).</>
              )}
              {deleteTarget.duplicateOf && (
                <>
                  {" "}
                  {deleteTarget.duplicateOf.playerName} garde son compte
                  {deleteTarget.duplicateOf.email ? (
                    <>
                      {" "}
                      <strong>{deleteTarget.duplicateOf.email}</strong>
                    </>
                  ) : null}
                  , relié à sa fiche.
                  {deleteTarget.duplicateOf.childFiche && (
                    <span className="mt-2 block font-medium text-red-700">
                      Vérifie l&apos;adresse : si c&apos;est celle d&apos;un parent, annule et relie-le plutôt
                      comme parent.
                    </span>
                  )}
                </>
              )}
            </>
          ) : null
        }
        confirmLabel="Supprimer"
        pending={saving}
        pendingLabel="Suppression..."
        error={error}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteTarget(null);
          setError(null);
        }}
      />
    </div>
  );
}
