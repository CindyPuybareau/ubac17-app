"use client";

import { useState, type FormEvent } from "react";
import { Link2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Retour de Cindy du 12/11 ("pourquoi les comptes ne pourraient pas se
// relier automatiquement ?") : sur l'écran "Ton espace n'est pas encore
// relié" (page.tsx, compte relié à rien), la personne se relie elle-même à
// sa fiche ou à celle de son enfant -- prénom + nom + date de naissance du
// joueur, vérifiés en base par claim_player_by_birthdate (migration
// 20261112140000) : une seule fiche doit correspondre exactement, 5 essais
// par jour, le Bureau est prévenu. Le nom seul ne suffit jamais.
const MESSAGES: Record<string, string> = {
  not_found:
    "Aucune fiche ne correspond exactement. Vérifie l'orthographe du prénom, du nom et la date de naissance (celle du joueur).",
  already_linked: "Cette fiche est déjà reliée à un compte. Contacte le Bureau.",
  too_many_attempts: "Trop d'essais aujourd'hui. Réessaie demain ou contacte le Bureau.",
  invalid: "Remplis tous les champs.",
};

export default function SelfLinkForm() {
  const [role, setRole] = useState<"self" | "parent">("parent");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("claim_player_by_birthdate", {
        p_first_name: firstName,
        p_last_name: lastName,
        p_birth_date: birthDate,
        p_role: role,
      });
      if (rpcError) {
        setError("Un problème est survenu, réessaie dans quelques instants.");
        return;
      }
      if (data === "linked_self" || data === "linked_parent") {
        // Rechargement complet : les onglets (Mon équipe / Mes enfants) sont
        // calculés côté serveur au chargement de la page.
        window.location.href = "/dashboard";
        return;
      }
      setError(MESSAGES[data as string] ?? "Un problème est survenu, réessaie dans quelques instants.");
    } catch {
      setError("Connexion impossible, vérifie ta connexion et réessaie.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-ubac-blue focus:outline-none focus:ring-1 focus:ring-ubac-blue";

  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3 border-t border-zinc-100 pt-4">
      <p className="flex items-center gap-1.5 font-semibold text-zinc-900">
        <Link2 className="h-4 w-4 shrink-0 text-navy" />
        Relier mon compte moi-même
      </p>
      <div className="flex flex-wrap gap-2">
        {(
          [
            { value: "parent", label: "Je suis parent" },
            { value: "self", label: "C'est ma propre fiche (joueur, coach, dirigeant)" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setRole(opt.value)}
            aria-pressed={role === opt.value}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              role === opt.value ? "bg-navy text-white" : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          {role === "parent" ? "Prénom de l'enfant" : "Ton prénom"}
          <input required value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          {role === "parent" ? "Nom de l'enfant" : "Ton nom"}
          <input required value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600">
          {role === "parent" ? "Date de naissance de l'enfant" : "Ta date de naissance"}
          <input
            required
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="flex w-fit items-center gap-1.5 rounded-full bg-ubac-yellow px-4 py-2 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {loading ? "Vérification..." : "Relier mon compte"}
      </button>
    </form>
  );
}
