"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import PasswordInput from "@/components/password-input";
import AuthTabs from "@/components/auth-tabs";

// Selon la configuration Supabase du projet, un email déjà inscrit
// déclenche soit une vraie erreur ("User already registered"), soit une
// réponse "réussie" mais avec identities: [] (comportement anti-énumération
// volontaire de Supabase) — les deux doivent aboutir au même message
// bienveillant plutôt qu'un texte d'erreur brut ou un faux "vérifie tes
// emails" qui n'enverra jamais rien.
function isAlreadyRegistered(message: string) {
  return /already registered|already exists|user already/i.test(message);
}

export default function InscriptionPage() {
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    setAlreadyRegistered(false);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          phone,
        },
      },
    });

    setLoading(false);

    if (error) {
      if (isAlreadyRegistered(error.message)) {
        setAlreadyRegistered(true);
        return;
      }
      setError(error.message);
      return;
    }

    // Comportement anti-énumération de Supabase : un email déjà utilisé
    // renvoie un "succès" sans erreur, mais data.user.identities est un
    // tableau vide — aucun email de confirmation ne part réellement.
    if (data.user && data.user.identities?.length === 0) {
      setAlreadyRegistered(true);
      return;
    }

    if (data.session) {
      router.push("/dashboard");
      router.refresh();
      return;
    }

    setMessage(
      "Compte créé ! Vérifie tes emails pour confirmer ton inscription."
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm">
        <div className="mb-6 text-center">
          <Image src="/logo.png" alt="UBAC" width={48} height={48} className="mx-auto h-12 w-12 object-contain" priority />
          <h1 className="mt-3 text-xl font-bold text-zinc-900">
            Inscription
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Rejoins l&apos;espace UBAC
          </p>
        </div>

        <AuthTabs active="inscription" />

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Prénom
              </label>
              <input
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-ubac-blue focus:outline-none focus:ring-1 focus:ring-ubac-blue"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">
                Nom
              </label>
              <input
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-ubac-blue focus:outline-none focus:ring-1 focus:ring-ubac-blue"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Téléphone
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-ubac-blue focus:outline-none focus:ring-1 focus:ring-ubac-blue"
            />
          </div>

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
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Mot de passe
            </label>
            <PasswordInput
              required
              minLength={6}
              value={password}
              onChange={setPassword}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-ubac-blue focus:outline-none focus:ring-1 focus:ring-ubac-blue"
            />
          </div>

          {alreadyRegistered && (
            <p className="text-sm text-zinc-600">
              Un compte existe déjà avec cet email.{" "}
              <Link href="/connexion" className="font-semibold text-ubac-blue">
                Se connecter
              </Link>{" "}
              ou{" "}
              <Link href="/mot-de-passe-oublie" className="font-semibold text-ubac-blue">
                mot de passe oublié
              </Link>
              .
            </p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {message && <p className="text-sm text-green-600">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-full bg-ubac-yellow px-5 py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-ubac-yellow-dark disabled:opacity-60"
          >
            {loading ? "Création..." : "Créer mon compte"}
          </button>
        </form>
      </div>
    </div>
  );
}
