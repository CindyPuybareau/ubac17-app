"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PasswordInput from "@/components/password-input";
import AuthTabs from "@/components/auth-tabs";

export default function ConnexionPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (error) {
      setError("Email ou mot de passe incorrect.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  // Même formulation "Si un compte existe..." que la page mot de passe
  // oublié : ne jamais confirmer/infirmer qu'un email est enregistré, que
  // le lien parte réellement ou non (shouldCreateUser: false empêche un
  // email mal tapé de créer un compte fantôme, mais son erreur "utilisateur
  // introuvable" ne doit pas fuiter côté UI).
  async function handleOtpSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/lien-de-connexion`,
      },
    });

    setLoading(false);
    // "Utilisateur introuvable" ne doit jamais fuiter (voir le commentaire
    // au-dessus) — mais un vrai échec technique (limite de débit Supabase,
    // panne réseau) mérite un vrai message : sans ce contrôle d'erreur, la
    // personne croyait un email parti alors qu'aucun n'était jamais
    // envoyé, sans aucun moyen de le savoir.
    if (error && error.code !== "user_not_found") {
      setError("Un problème est survenu, réessaie dans quelques instants.");
      return;
    }
    setMessage(
      "Si un compte existe avec cet email, un lien de connexion vient de t'être envoyé — vérifie ta boîte mail."
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <Image src="/logo.png" alt="UBAC" width={48} height={48} className="mx-auto h-12 w-12 object-contain" priority />
          <h1 className="mt-3 text-xl font-bold text-zinc-900">Connexion</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Accède à ton espace UBAC
          </p>
        </div>

        <AuthTabs active="connexion" />

        {mode === "password" ? (
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
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
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-sm font-medium text-zinc-700">
                  Mot de passe
                </label>
                <Link
                  href="/mot-de-passe-oublie"
                  className="text-xs font-medium text-ubac-blue"
                >
                  Mot de passe oublié ?
                </Link>
              </div>
              <PasswordInput
                required
                value={password}
                onChange={setPassword}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-ubac-blue focus:outline-none focus:ring-1 focus:ring-ubac-blue"
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-full bg-ubac-yellow px-5 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
            >
              {loading ? "Connexion..." : "Se connecter"}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("otp");
                setError(null);
                setMessage(null);
              }}
              className="text-center text-xs font-medium text-ubac-blue hover:underline"
            >
              Recevoir un code de connexion rapide par email
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} className="flex flex-col gap-4">
            <p className="text-sm text-zinc-500">
              Reçois un lien de connexion par email, sans mot de passe — utile si
              tu ne t&apos;en souviens plus.
            </p>
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

            {message && <p className="text-sm text-green-600">{message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="mt-2 w-full rounded-full bg-ubac-yellow px-5 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
            >
              {loading ? "Envoi..." : "Recevoir le lien de connexion"}
            </button>

            <button
              type="button"
              onClick={() => {
                setMode("password");
                setError(null);
                setMessage(null);
              }}
              className="text-center text-xs font-medium text-ubac-blue hover:underline"
            >
              Revenir à la connexion par mot de passe
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
