"use client";

import type { ChangeEvent } from "react";
import { Upload } from "lucide-react";

// Bouton de sélection de fichier commun aux 3 imports (Inscriptions,
// Planning, Coachs) : ils utilisaient chacun une copie du même bloc
// (input natif invisible + <label> stylé qui fait office de bouton visible
// + nom du fichier choisi affiché en dessous). Factorisé ici pour n'avoir
// qu'un seul endroit à faire évoluer. Input caché via sr-only (pas
// display:none, qui empêcherait le clic) : le <label htmlFor> ci-dessous
// sert de bouton visible, stylé comme les autres actions de l'appli.
export default function FilePickerButton({
  id,
  fileName,
  onChange,
  accept = ".xlsx",
}: {
  id: string;
  fileName: string | null;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  accept?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="flex w-fit cursor-pointer items-center gap-1.5 rounded-full bg-ubac-yellow px-4 py-2 text-sm font-semibold text-navy shadow-sm transition-colors hover:bg-ubac-yellow-dark"
      >
        <Upload className="h-4 w-4 shrink-0" />
        Choisir un fichier
      </label>
      <input id={id} type="file" accept={accept} onChange={onChange} className="sr-only" />
      {fileName && <p className="mt-1.5 truncate text-xs text-zinc-500">{fileName}</p>}
    </div>
  );
}
