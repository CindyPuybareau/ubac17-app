// Turns a French phone number in any common local formatting (spaces,
// dots, dashes, leading 0, or already-international) into the digits-only
// international form wa.me expects (e.g. "33612345678"). Returns null when
// there isn't enough left to dial (wrong length after stripping).
export function formatPhoneForWhatsApp(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d+]/g, "");

  if (digits.startsWith("+")) {
    const rest = digits.slice(1);
    return rest.length >= 8 ? rest : null;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return `33${digits.slice(1)}`;
  }
  if (digits.startsWith("33") && digits.length === 11) {
    return digits;
  }
  return digits.length >= 8 ? digits : null;
}

// wa.me links only ever address one recipient — there's no bulk/group
// equivalent, which is why team-wide "contact" features fall back to a
// list of individual links (see WhatsAppBulkModal) unless a real
// WhatsApp group invite link has been configured for the team.
export function buildWhatsAppLink(
  phone: string | null | undefined,
  message: string
): string | null {
  const formatted = formatPhoneForWhatsApp(phone);
  if (!formatted) return null;
  return `https://wa.me/${formatted}?text=${encodeURIComponent(message)}`;
}

// A WhatsApp group invite link (chat.whatsapp.com/...) can't carry a
// pre-filled message — that query param only exists on the single-contact
// wa.me/<phone> form. Omitting the phone number instead opens WhatsApp's
// own forward/share picker with the text ready to go, letting the user
// pick the target group themselves and hit send with one tap — the
// closest honest equivalent to "prefilled 1-click send to a group".
export function buildWhatsAppForwardLink(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
