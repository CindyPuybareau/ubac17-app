"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// La clé publique voyage jusqu'au navigateur, mais l'API Push la veut en
// octets bruts et non en base64url.
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalized);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type State = "checking" | "unsupported" | "denied" | "off" | "on";

export default function PushSubscribe() {
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Safari sur iOS n'expose l'API Push que si l'app a été ajoutée à
    // l'écran d'accueil : dans un onglet classique, il n'y a rien à
    // proposer, et un bouton qui échoue vaut moins que pas de bouton.
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    ) {
      setState("unsupported");
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
      .catch(() => setState("unsupported"));
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
      {state === "on" && (
        <span className="text-xs text-zinc-400">
          Tu seras prévenu quand le coach attend une réponse.
        </span>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
