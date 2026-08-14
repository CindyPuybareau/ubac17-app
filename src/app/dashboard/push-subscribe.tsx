"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Share } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// La clé publique voyage jusqu'au navigateur, mais l'API Push la veut en
// octets bruts et non en base64url.
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

// Safari sur iOS n'expose l'API Push que si l'app a été ajoutée à l'écran
// d'accueil — une contrainte d'Apple, pas un choix du club. Sans cette
// détection, un parent sur iPhone dans un onglet Safari classique ne
// voyait ni bouton ni explication : rien ne lui disait qu'il lui manquait
// une étape.
function isIosNotInstalled() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isStandalone =
    (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  return isIos && !isStandalone;
}

type State = "checking" | "unsupported" | "ios-not-installed" | "denied" | "off" | "on";

export default function PushSubscribe() {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    ) {
      setState(isIosNotInstalled() ? "ios-not-installed" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? "on" : "off"))
      .catch(() => setState(isIosNotInstalled() ? "ios-not-installed" : "unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string
        ),
      });

      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("no session");

      const { error: writeError } = await supabase.from("push_subscriptions").upsert(
        {
          profile_id: userData.user.id,
          endpoint: json.endpoint,
          p256dh: json.keys?.p256dh,
          auth: json.keys?.auth,
        },
        { onConflict: "endpoint" }
      );
      if (writeError) throw writeError;
      setState("on");
    } catch {
      setError("Activation impossible sur cet appareil.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        const supabase = createClient();
        await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
      }
      setState("off");
    } catch {
      setError("Désactivation impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (state === "checking" || state === "unsupported") return null;

  if (state === "ios-not-installed") {
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-ubac-yellow/40 bg-ubac-yellow/10 px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-navy">
          <BellRing className="h-3.5 w-3.5 shrink-0" />
          Reçois les notifications sur iPhone
        </p>
        <p className="flex flex-wrap items-center gap-1 text-xs text-zinc-600">
          Ajoute UBAC à ton écran d&apos;accueil : appuie sur{" "}
          <Share className="h-3.5 w-3.5 shrink-0" aria-label="Partager" /> en bas de Safari, puis
          « Sur l&apos;écran d&apos;accueil ». Ouvre ensuite l&apos;appli depuis cette icône pour
          activer les notifications.
        </p>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-zinc-400">
        <BellOff className="h-3.5 w-3.5 shrink-0" />
        Notifications bloquées dans les réglages de ce navigateur.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={state === "on" ? disable : enable}
        disabled={busy}
        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
          state === "on"
            ? "border border-zinc-200 text-zinc-500 hover:bg-zinc-50"
            : "bg-navy text-white hover:brightness-110"
        }`}
      >
        {state === "on" ? (
          <BellOff className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <BellRing className="h-3.5 w-3.5 shrink-0" />
        )}
        {busy
          ? "..."
          : state === "on"
            ? "Désactiver les notifications"
            : "Activer les notifications"}
      </button>
      {/* Formulation volontairement neutre : le même composant est monté
          côté Famille (demande de présence, changement d'horaire) et
          côté Coach (changement fait par un co-coach ou le Bureau sur sa
          propre équipe) — jamais "le coach attend ta réponse", qui n'a
          de sens que pour la moitié des lecteurs. */}
      {state === "on" && (
        <span className="text-xs text-zinc-400">
          Tu seras prévenu des changements sur tes événements.
        </span>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
