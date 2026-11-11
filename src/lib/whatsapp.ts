// Restauré le 11/11 (retour de Cindy, la secrétaire redemande le bouton
// WhatsApp direct dans Membres) -- retiré le 19/10 avec le reste de
// "Groupes WhatsApp" (3eba096), mais ces deux fonctions n'ont jamais eu de
// rapport avec les groupes : juste le lien wa.me/<numéro> à un seul
// destinataire, utilisé par whatsapp-direct-button.tsx.

// Turns a French phone number in any common local formatting (spaces,
// dots, dashes, leading 0, or already-international) into the digits-only
// international form wa.me expects (e.g. "33612345678"). Returns null when
// there isn't enough left to dial (wrong length after stripping).
export function formatPhoneForWhatsApp(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/[^\d+]/g, "");

  // "00" est l'équivalent international de "+" (convention très courante
  // en France, ex. "0033612345678") : sans cette étape, ces numéros
  // ressortaient tels quels ("0033...") au lieu d'être ramenés à "33...".
  if (!digits.startsWith("+") && digits.startsWith("00")) {
    digits = `+${digits.slice(2)}`;
  }

  if (digits.startsWith("+")) {
    let rest = digits.slice(1);
    // Format international "officiel" français : "+33 (0)6 12 34 56 78"
    // — le zéro entre parenthèses (déjà réduit à un simple "0" par le
    // strip regex ci-dessus) ne fait PAS partie du numéro, il ne s'utilise
    // qu'en local. Sans ce retrait, "+33 (0)6..." devenait "330612345678"
    // (un chiffre de trop) au lieu de "33612345678".
    if (rest.startsWith("330")) {
      rest = `33${rest.slice(3)}`;
    }
    return rest.length >= 8 ? rest : null;
  }
  // Audit du 31/08 : ces deux formats ne vérifiaient la longueur que pour
  // ACCEPTER le cas correct (10/11 chiffres) — un numéro français mal saisi
  // (un chiffre en trop ou en moins, ex. "061234567") retombait sur le
  // repli générique juste en dessous, qui ne retire jamais le "0" de tête
  // ni n'ajoute "33" : un lien wa.me/061234567 invalide (jamais un format
  // E.164 valide) partait quand même au lieu d'être rejeté comme les
  // numéros vraiment trop courts (< 8 chiffres) le sont déjà.
  if (digits.startsWith("0")) {
    return digits.length === 10 ? `33${digits.slice(1)}` : null;
  }
  if (digits.startsWith("33")) {
    return digits.length === 11 ? digits : null;
  }
  return digits.length >= 8 ? digits : null;
}

// wa.me links only ever address one recipient.
export function buildWhatsAppLink(
  phone: string | null | undefined,
  message: string
): string | null {
  const formatted = formatPhoneForWhatsApp(phone);
  if (!formatted) return null;
  return `https://wa.me/${formatted}?text=${encodeURIComponent(message)}`;
}
