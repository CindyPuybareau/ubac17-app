"use client";

import { useState, type FormEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    // try/finally : un souci réseau fait échouer l'appel lui-même, pas
    // juste renvoyer { error } — sans filet, le bouton restait bloqué sur
    // "Envoi..." indéfiniment (même défaut que connexion/page.tsx).
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reinitialiser-mot-de-passe`,
      });

      if (error) {
        setError(error.message);
        return;
      }

      setMessage(
        "Si un compte existe avec cet email, un lien de réinitialisation vient de t'être envoyé."
      );
    } catch {
      setError("Un problème est survenu, réessaie dans quelques instants.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <Image src="/logo.png" alt="UBAC" width={48} height={48} className="mx-auto h-12 w-12 object-contain" priority />
          <h1 className="mt-3 text-xl font-bold text-zinc-900">
            Mot de passe oublié
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Reçois un lien pour en choisir un nouveau
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-ubac-blue focus:outline-none focus:ring-1 focus:ring-ubac-blue"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-full bg-ubac-yellow px-5 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
          >
            {loading ? "Envoi..." : "Envoyer le lien"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-zinc-500">
          <Link href="/connexion" className="font-semibold text-ubac-blue">
            Retour à la connexion
          </Link>
        </p>
      </div>
    </div>
  );
}
