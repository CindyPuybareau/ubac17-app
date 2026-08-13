// Service worker de l'app UBAC. Son seul rôle est de recevoir les
// notifications push et de les afficher : il ne met rien en cache, la PWA
// reste servie normalement par le réseau.

self.addEventListener("push", (event) => {
  // Un push sans données ne devrait pas arriver, mais un service de push
  // peut en envoyer un de contrôle : mieux vaut un texte générique qu'une
  // notification vide ou une erreur silencieuse.
  let payload = {
    title: "UBAC",
    body: "Nouvelle information de ton club.",
    url: "/dashboard",
  };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/logo.png",
      badge: "/logo.png",
      data: { url: payload.url },
      // Un même événement ne doit pas empiler trois notifications si le
      // coach relance : la plus récente remplace la précédente.
      tag: payload.tag || "ubac",
      renotify: true,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";

  // Si l'app est déjà ouverte quelque part, on la ramène au premier plan
  // plutôt que d'ouvrir un deuxième onglet.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
