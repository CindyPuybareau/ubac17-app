// Mise en forme légère des comptes rendus (retour de Cindy du 02/09 :
// gras/italique/surlignage). Pas de HTML stocké en base — une micro-syntaxe
// texte façon Markdown à la place (**gras**, _italique_, ==surligné==) :
// - Aucun risque d'injection : le texte brut ne devient jamais du HTML
//   interprété, ni côté écran ni côté rendu serveur — pas de sanitisation
//   à maintenir.
// - Rétrocompatible gratuitement : un compte rendu déjà écrit en texte
//   brut ne contient (presque) jamais ces suites de caractères, donc se
//   parse tel quel, sans migration.
// - Un seul analyseur réutilisé pour les 3 rendus qui en ont besoin :
//   l'écran (club-reports-section.tsx, React), l'impression (même rendu
//   écran) et le PDF téléchargeable (jsPDF, qui ne comprend aucun HTML et
//   a besoin de ces mêmes segments pour dessiner le bon style).

export type ReportRun = {
  text: string;
  bold: boolean;
  italic: boolean;
  highlight: boolean;
};

// **gras** avant ==surligné== avant _italique_ : l'ordre ne change rien au
// résultat (les trois motifs ne peuvent pas s'amorcer au même endroit vu
// leurs délimiteurs différents), gardé simple volontairement.
const TOKEN_RE = /\*\*([\s\S]+?)\*\*|==([\s\S]+?)==|_([\s\S]+?)_/;

// Découpe un texte en une suite de segments {texte, gras, italique,
// surligné} — les marqueurs peuvent s'imbriquer (**_gras et italique_**),
// jamais se chevaucher (un simple bouton "appliquer" ne peut de toute
// façon pas produire de chevauchement). Un marqueur ouvert sans être
// refermé (faute de frappe, texte collé depuis ailleurs...) reste affiché
// tel quel, en texte brut — jamais d'erreur, jamais de disparition de
// contenu.
export function parseReportRuns(source: string): ReportRun[] {
  return parseWithStyle(source, { bold: false, italic: false, highlight: false });
}

function parseWithStyle(
  source: string,
  style: { bold: boolean; italic: boolean; highlight: boolean }
): ReportRun[] {
  const runs: ReportRun[] = [];
  let rest = source;
  while (rest.length > 0) {
    const match = TOKEN_RE.exec(rest);
    if (!match) {
      runs.push({ text: rest, ...style });
      break;
    }
    const before = rest.slice(0, match.index);
    if (before) runs.push({ text: before, ...style });
    if (match[1] !== undefined) {
      runs.push(...parseWithStyle(match[1], { ...style, bold: true }));
    } else if (match[2] !== undefined) {
      runs.push(...parseWithStyle(match[2], { ...style, highlight: true }));
    } else {
      runs.push(...parseWithStyle(match[3], { ...style, italic: true }));
    }
    rest = rest.slice(match.index + match[0].length);
  }
  return runs;
}

// --- Éditeur "wysiwyg" (retour de Cindy du 02/09 : "voir le visuel
// directement en direct dans le champ", pas dans un aperçu séparé) ---
// L'éditeur lui-même est un <div contentEditable> — l'utilisateur voit
// tout de suite le gras/italique/surligné, jamais les marqueurs bruts.
// Stockage inchangé : à chaque frappe, editableNodeToReportText()
// retranscrit le contenu affiché vers la même micro-syntaxe texte que
// ci-dessus, donc rien d'autre (base, PDF, impression) n'a besoin de
// changer. reportTextToHtml() fait le chemin inverse, une seule fois, au
// montage du champ (pour afficher un compte rendu déjà écrit).

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Classe Tailwind identique à celle du rendu final (détail/impression,
// voir FormattedReportText dans club-reports-section.tsx) : le surlignage
// a exactement le même aspect pendant la saisie qu'une fois enregistré.
const HTML_MARK_CLASS = "rounded bg-ubac-yellow/60 px-0.5";

export function reportTextToHtml(text: string): string {
  return parseReportRuns(text).map(runToHtml).join("");
}

function runToHtml(run: ReportRun): string {
  let html = run.text.split("\n").map(escapeHtml).join("<br>");
  if (run.bold) html = `<strong>${html}</strong>`;
  if (run.italic) html = `<em>${html}</em>`;
  if (run.highlight) html = `<mark class="${HTML_MARK_CLASS}">${html}</mark>`;
  return html;
}

// Relit le contenu réel du champ (après une frappe, un collage, un clic
// sur un bouton de la barre d'outils...) et le retranscrit en texte avec
// marqueurs. Chaque balise ajoute son propre marqueur autour de son
// contenu déjà transformé — un <strong> qui contient un <em> donne
// naturellement **_texte_**, sans avoir à suivre un état de style
// cumulé. <div>/<p> (une ligne, insérée par le navigateur après un
// Entrée) et <br> deviennent des retours à la ligne ; toute autre balise
// (un <span> ramené par un collage, par exemple) est ignorée, seul son
// contenu est gardé.
export function editableNodeToReportText(root: Node): string {
  return walkEditable(root, true);
}

function walkEditable(node: Node, isRoot: boolean): string {
  let out = "";
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      out += child.textContent ?? "";
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const el = child as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") {
      out += "\n";
      return;
    }
    if (tag === "div" || tag === "p") {
      // Saut de ligne avant CE bloc, sauf si c'est le tout premier
      // contenu du champ (sinon une ligne vide fantôme apparaîtrait en
      // haut du texte).
      if (!(isRoot && out === "")) out += "\n";
      out += walkEditable(el, false);
      return;
    }
    const inner = walkEditable(el, false);
    if (!inner) return; // balise vide (ex. <br> déjà compté au-dessus) : rien à ajouter
    if (tag === "strong" || tag === "b") out += `**${inner}**`;
    else if (tag === "em" || tag === "i") out += `_${inner}_`;
    else if (tag === "mark") out += `==${inner}==`;
    else out += inner;
  });
  return out;
}
