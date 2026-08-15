// Le hachage/la vérification du PIN vivent entièrement côté base (pgcrypto,
// voir la migration 20261008000000_child_pin_access.sql) — ce fichier ne
// sert qu'à valider le format immédiatement dans l'UI, avant l'appel
// réseau, pour un retour instantané. La vraie autorité reste la fonction
// SQL, qui revalide de toute façon.
export function isValidPinFormat(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
