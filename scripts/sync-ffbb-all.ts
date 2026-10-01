// Synchro FFBB automatique, lancée depuis une tâche planifiée LOCALE
// (retour de Cindy du 01/10, "comment je synchroniserais ?") -- jamais
// depuis Vercel : la FFBB (BunnyCDN Shield) bloque les IP de datacenter,
// confirmé pour Vercel ET pour trois relais tiers indépendants testés sur
// des clouds différents (voir sync-ffbb/route.ts). Une IP résidentielle
// normale (celle de cet ordinateur) n'est elle jamais bloquée.
//
// Usage : node_modules\.bin\tsx.cmd scripts\sync-ffbb-all.ts
// (voir "Installation" dans la conversation pour la tâche planifiée
// Windows qui lance cette commande chaque lundi matin.)
//
// Lecture/écriture : voir src/lib/ffbb-sync.ts (même logique, UPSERT
// uniquement, jamais de suppression -- partagée avec le bouton
// "Synchroniser" de l'appli, qui reste cassé en production tant qu'il
// tourne sur Vercel).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createServiceClient } from "../src/lib/supabase/service";
import { syncFfbbMatchesForTeam, syncFfbbRankingForTeam } from "../src/lib/ffbb-sync";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Next.js charge .env.local tout seul au démarrage -- un script autonome
// lancé par Task Scheduler ne bénéficie pas de ça, donc chargement manuel
// ici. Pas de dépendance "dotenv" ajoutée pour ça seul : un parseur simple
// suffit (mêmes clés que celles déjà utilisées partout dans l'appli).
function loadEnvLocal() {
  const envPath = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env.local introuvable (${envPath}) -- requis pour NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.`);
  }
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();
  const supabase = createServiceClient();

  const { data: teams, error } = await supabase
    .from("teams")
    .select("id, name, ffbb_url")
    .not("ffbb_url", "is", null);

  if (error) {
    console.error("[sync-ffbb-all] lecture des équipes échouée:", error);
    process.exitCode = 1;
    return;
  }

  if (!teams || teams.length === 0) {
    console.log("[sync-ffbb-all] aucune équipe avec un lien FFBB -- rien à synchroniser.");
    return;
  }

  console.log(`[sync-ffbb-all] ${teams.length} équipe(s) à synchroniser : ${teams.map((t) => t.name).join(", ")}`);

  let totalImported = 0;
  let totalUpdated = 0;
  let hadError = false;

  // Séquentiel, jamais en parallèle (incident du 20/09, voir CLAUDE.md) --
  // chaque équipe fait déjà le minimum de requêtes groupées en interne
  // (voir ffbb-sync.ts), mais paralléliser plusieurs équipes à la fois
  // rouvrirait le même risque de saturation du pool de connexions.
  for (const team of teams) {
    if (!team.ffbb_url) continue;
    const result = await syncFfbbMatchesForTeam(supabase, team.id, team.ffbb_url);
    if (!result.ok) {
      console.error(`[sync-ffbb-all] ${team.name} : échec -- ${result.error}`);
      hadError = true;
    } else {
      totalImported += result.imported;
      totalUpdated += result.updated;
      console.log(
        `[sync-ffbb-all] ${team.name} : ${result.imported} nouveau(x), ${result.updated} mis à jour${result.message ? ` (${result.message})` : ""}`
      );
    }

    // Retour de Cindy du 01/10 ("ajouter le classement à la synchro
    // automatique") : même équipe, même page FFBB déjà récupérée pour les
    // matchs -- un second fetch distinct reste nécessaire (classement et
    // calendrier vivent dans des blocs HTML différents de la même fiche,
    // voir ffbb.ts), mais toujours depuis cette IP résidentielle.
    const rankingResult = await syncFfbbRankingForTeam(supabase, team.id, team.ffbb_url);
    if (!rankingResult.ok) {
      console.error(`[sync-ffbb-all] ${team.name} (classement) : échec -- ${rankingResult.error}`);
      hadError = true;
    } else {
      console.log(`[sync-ffbb-all] ${team.name} (classement) : ${rankingResult.count} équipe(s) au classement`);
    }
  }

  console.log(`[sync-ffbb-all] terminé : ${totalImported} nouveau(x) match(s), ${totalUpdated} mis à jour au total.`);
  if (hadError) process.exitCode = 1;
}

main().catch((e) => {
  console.error("[sync-ffbb-all] erreur inattendue:", e);
  process.exitCode = 1;
});
