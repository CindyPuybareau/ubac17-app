// Retour d'audit du 2026-08-25 (P2, "format d'avatar non optimisé") :
// avatar-upload.tsx et child-avatar-upload.tsx envoyaient le fichier choisi
// par l'utilisateur tel quel — n'importe quel format, n'importe quel poids
// (une photo de téléphone moderne pèse facilement plusieurs Mo). Un avatar
// ne s'affiche jamais à plus de 96px dans l'appli (voir dimensionClass des
// deux composants), donc au lieu d'ajouter une conversion côté serveur
// (nouvelle dépendance type "sharp", plus de code à faire tourner sur
// Vercel), on redécoupe et recompresse l'image directement dans le
// navigateur avant l'envoi — même résultat, sans rien ajouter côté serveur.

// 2-3x la taille d'affichage max réelle (96px), marge pour les écrans
// HiDPI/Retina sans conserver la pleine résolution d'origine.
const MAX_DIMENSION = 256;
const QUALITY = 0.85;

export type ResizedImage = { blob: Blob; ext: string };

// Un logo de sponsor est rarement carré (bannières, logos tout en
// largeur...) — contrairement à resizeImageForAvatar, pas de recadrage :
// juste une mise à l'échelle si l'image dépasse ces dimensions, en gardant
// ses proportions d'origine. Affiché au plus à 96px de haut dans l'appli
// (voir sponsors-display.tsx), cette marge HiDPI/Retina suffit largement.
const MAX_LOGO_WIDTH = 480;
const MAX_LOGO_HEIGHT = 240;

// Recadre en carré (centré) et réencode en WebP, avec repli JPEG si le
// navigateur ne sait pas produire de WebP (rare aujourd'hui, mais
// canvas.toBlob() retombe silencieusement sur un autre format dans ce
// cas plutôt que d'échouer). Si le fichier ne peut pas être décodé comme
// image (format exotique que le navigateur ne reconnaît pas), on renvoie
// le fichier d'origine tel quel plutôt que de bloquer l'envoi — un avatar
// non optimisé reste préférable à aucun avatar du tout.
export async function resizeImageForAvatar(file: File): Promise<ResizedImage> {
  const fallback: ResizedImage = {
    blob: file,
    ext: file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg",
  };

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return fallback;

  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const targetSize = Math.min(MAX_DIMENSION, side);

  const canvas = document.createElement("canvas");
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return fallback;
  }
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, targetSize, targetSize);
  bitmap.close();

  const webpBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", QUALITY)
  );
  if (webpBlob && webpBlob.type === "image/webp") {
    return { blob: webpBlob, ext: "webp" };
  }

  const jpegBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY)
  );
  if (jpegBlob) {
    return { blob: jpegBlob, ext: "jpg" };
  }

  return fallback;
}

// Même principe que resizeImageForAvatar (WebP avec repli JPEG, fichier
// d'origine renvoyé tel quel si indécodable) mais sans recadrage carré —
// voir MAX_LOGO_WIDTH/HEIGHT ci-dessus.
export async function resizeImageForLogo(file: File): Promise<ResizedImage> {
  const fallback: ResizedImage = {
    blob: file,
    ext: file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg",
  };

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return fallback;

  const scale = Math.min(1, MAX_LOGO_WIDTH / bitmap.width, MAX_LOGO_HEIGHT / bitmap.height);
  const targetWidth = Math.round(bitmap.width * scale);
  const targetHeight = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return fallback;
  }
  ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  const webpBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", QUALITY)
  );
  if (webpBlob && webpBlob.type === "image/webp") {
    return { blob: webpBlob, ext: "webp" };
  }

  const jpegBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY)
  );
  if (jpegBlob) {
    return { blob: jpegBlob, ext: "jpg" };
  }

  return fallback;
}
