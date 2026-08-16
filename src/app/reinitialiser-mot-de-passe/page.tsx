"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PasswordInput from "@/components/password-input";

export default function ReinitialiserMotDePassePage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // undefined = encore en train de vérifier le lien, true/false une fois
  // tranché. Vérifié dès l'arrivée sur la page plutôt qu'au clic sur
  // "Valider" : un lien expiré doit se voir tout de suite, pas après avoir
  // fait saisir un mot de passe pour rien.
  const [linkValid, setLinkValid] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!cancelled) setLinkValid(Boolean(data.session));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (password !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage("Mot de passe mis à jour ! Redirection...");
    setTimeout(() => {
      router.push("/dashboard");
      router.refresh();
    }, 1200);
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <Image src="/logo.png" alt="UBAC" width={48} height={48} className="mx-auto h-12 w-12 object-contain" priority />
          <h1 className="mt-3 text-xl font-bold text-zinc-900">
            Nouveau mot de passe
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Choisis ton nouveau mot de passe
          </p>
        </div>

        {linkValid === false ? (
          <div className="text-center">
            <p className="text-sm text-zinc-600">
              Ce lien de réinitialisation a expiré ou a déjà été utilisé.
            </p>
            <Link
              href="/mot-de-passe-oublie"
              className="mt-3 inline-block font-semibold text-ubac-blue"
            >
              Redemander un lien
            </Link>
          </div>
        ) : linkValid === undefined ? (
          <p className="text-center text-sm text-zinc-400">Vérification du lien...</p>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Nouveau mot de passe
              </label>
              <PasswordInput
                required
                minLength={6}
                value={password}
                onChange={setPassword}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-ubac-blue focus:outline-none focus:ring-1 focus:ring-ubac-blue"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Confirme le mot de passe
              </label>
              <PasswordInput
                required
                minLength={6}
                value={confirm}
                onChange={setConfirm}
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
              {loading ? "Mise à jour..." : "Valider"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
