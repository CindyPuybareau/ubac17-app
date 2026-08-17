"use client";

import { useState } from "react";
import { Delete } from "lucide-react";

type Child = { id: string; first_name: string | null };

const KEYPAD = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

// Clavier numérique tactile plutôt qu'un champ + clavier du téléphone :
// plus simple à manipuler au pouce pour un enfant, et le clavier natif ne
// vient jamais recouvrir l'écran (même esprit que le sélecteur bottom-sheet
// du DateTimePicker).
export default function ChildLoginForm({ code, children }: { code: string; children: Child[] }) {
  const [selected, setSelected] = useState<Child | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function pressKey(key: (typeof KEYPAD)[number]) {
    if (loading || key === "") return;
    setError(null);
    if (key === "back") {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) submitPin(next);
  }

  async function submitPin(fullPin: string) {
    if (!selected) return;
    setLoading(true);
    setError(null);

    // Le clavier entier reste désactivé tant que loading est vrai — sans
    // try/catch, une simple coupure réseau (wifi de gymnase capricieux)
    // faisait rejeter fetch() et bloquait l'écran de connexion pour de
    // bon, sans message ni moyen de réessayer autrement qu'en rechargeant
    // la page à la main.
    let res: Response;
    try {
      res = await fetch("/api/child-login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, playerId: selected.id, pin: fullPin }),
      });
    } catch {
      setLoading(false);
      setPin("");
      setError("Connexion impossible, réessaie.");
      return;
    }
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      setLoading(false);
      setPin("");
      setError(data.error || "Code incorrect.");
      return;
    }

    // Navigation complète plutôt que router.push : certains navigateurs
    // intégrés (WhatsApp, Instagram...) ne relisent pas de façon fiable un
    // cookie tout juste posé lors d'une transition "douce" côté client —
    // un vrai rechargement de page repart toujours du cookie réellement
    // stocké par le navigateur.
    window.location.href = "/enfant/view";
  }

  // Sélection du prénom : grille de puces, pas de saisie.
  if (!selected) {
    return (
      <div className="flex flex-wrap justify-center gap-2.5">
        {children.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected(c)}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 shadow-sm transition-colors hover:border-ubac-blue hover:bg-blue-50"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-ubac-yellow text-base font-bold text-navy">
              {(c.first_name ?? "?").charAt(0).toUpperCase()}
            </span>
            {c.first_name ?? "Joueur"}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="text-center">
        <p className="text-sm text-zinc-500">Salut {selected.first_name} !</p>
        <p className="text-sm font-medium text-zinc-700">Entre ton code à 4 chiffres</p>
      </div>

      <div className="flex gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <span
            key={i}
            className={`h-3.5 w-3.5 rounded-full border-2 transition-colors ${
              i < pin.length ? "border-navy bg-navy" : "border-zinc-300 bg-white"
            }`}
          />
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid w-full max-w-[220px] grid-cols-3 gap-2.5">
        {KEYPAD.map((key, i) =>
          key === "" ? (
            <div key={i} />
          ) : (
            <button
              key={i}
              type="button"
              disabled={loading}
              onClick={() => pressKey(key)}
              className="flex h-14 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-xl font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 disabled:opacity-50"
            >
              {key === "back" ? <Delete className="h-5 w-5" /> : key}
            </button>
          )
        )}
      </div>

      <button
        type="button"
        onClick={() => {
          setSelected(null);
          setPin("");
          setError(null);
        }}
        className="text-xs font-medium text-ubac-blue hover:underline"
      >
        Ce n&apos;est pas moi
      </button>
    </div>
  );
}
