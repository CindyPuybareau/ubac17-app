// Extrait de cotisation-participants-table.tsx (audit du 2026-09-01, en
// ajoutant les comptes rendus) : le logo et les couleurs de marque servent
// maintenant à deux PDF différents (factures + comptes rendus) — un seul
// endroit à tenir à jour plutôt que deux copies qui pourraient un jour
// diverger (même principe que IosPushHint plus tôt cette session).

// Logo public/logo.png chargé une seule fois et mis en cache : jsPDF a
// besoin de l'image déjà en base64 pour l'insérer (doc.addImage), donc un
// fetch est nécessaire avant de construire le PDF — mémorisé pour ne pas
// re-télécharger le même fichier à chaque document généré dans la session.
let logoBase64Promise: Promise<string | null> | null = null;
export function getLogoBase64(): Promise<string | null> {
  if (!logoBase64Promise) {
    logoBase64Promise = fetch("/logo.png")
      .then((res) => {
        if (!res.ok) throw new Error(`logo.png: ${res.status}`);
        return res.blob();
      })
      .then(
        (blob) =>
          new Promise<string | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(blob);
          })
      )
      .catch((e) => {
        console.error("[pdf-brand] chargement du logo échoué:", e);
        return null;
      });
  }
  return logoBase64Promise;
}

// Couleurs de marque en RGB (jsPDF ne lit pas les variables CSS de l'appli)
// — reprises telles quelles de globals.css, pour que chaque PDF garde la
// même identité que son équivalent à l'écran. Un seul endroit à retoucher
// si la charte graphique change un jour.
export const PDF_COLORS = {
  navy: [32, 48, 144],
  navyDark: [22, 35, 101],
  gold: [244, 196, 48],
  white: [255, 255, 255],
  headerSubtext: [205, 210, 235],
  ink: [15, 23, 42],
  muted: [113, 113, 122],
  line: [228, 228, 231],
  rowAlt: [250, 250, 249],
} as const;
