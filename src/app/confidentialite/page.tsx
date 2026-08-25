import type { Metadata } from "next";
import LegalPageLayout from "@/components/legal-page-layout";

export const metadata: Metadata = {
  title: "Politique de confidentialité — UBAC",
};

// Texte à faire relire/valider par Cindy avant publication (convenu lors de
// la demande initiale) — insiste volontairement sur le traitement des
// données des mineurs via le code PIN de l'Espace Enfant (voir
// src/lib/child-session.ts pour le détail technique réel derrière chaque
// affirmation de cette page : lien privé + PIN à 4 chiffres, pas d'email ni
// de mot de passe demandé à l'enfant, lecture seule, RLS par rôle).
export default function ConfidentialitePage() {
  return (
    <LegalPageLayout title="Politique de confidentialité" updated="25 août 2026">
      <p>
        L&apos;application UBAC (ci-après « l&apos;Application ») est un outil de gestion interne
        réservé aux membres du club Union Basket Angoulins Châtelaillon (UBAC). Cette page
        explique quelles données sont collectées, pourquoi, et comment elles sont protégées —
        en particulier celles concernant les enfants licenciés mineurs.
      </p>

      <section>
        <h2 className="font-semibold text-zinc-900">1. Qui est responsable du traitement</h2>
        <p className="mt-2">
          L&apos;UBAC (association loi 1901, voir nos{" "}
          <a href="/mentions-legales" className="text-ubac-blue underline underline-offset-2">
            mentions légales
          </a>
          ) est responsable du traitement des données de l&apos;Application. Pour toute
          question, contactez le Bureau à{" "}
          <a href="mailto:ubac17.basket@gmail.com" className="text-ubac-blue underline underline-offset-2">
            ubac17.basket@gmail.com
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-zinc-900">2. Quelles données sont collectées</h2>
        <ul className="mt-2 flex flex-col gap-1.5 list-disc pl-5">
          <li>
            <strong>Adultes</strong> (Bureau, coachs, parents) : nom, prénom, e-mail,
            téléphone, historique de licence et de cotisation.
          </li>
          <li>
            <strong>Enfants licenciés (mineurs)</strong> : prénom, nom, date de naissance,
            catégorie, équipe(s), historique de présence aux entraînements/matchs.
          </li>
          <li>Aucune donnée bancaire n&apos;est stockée dans l&apos;Application — les paiements passent par des services tiers (HelloAsso, virement, chèque...).</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-ubac-blue/15 bg-ubac-blue/5 p-5">
        <h2 className="font-semibold text-zinc-900">
          3. Accès des enfants à l&apos;Application — un traitement pensé pour eux
        </h2>
        <p className="mt-2">
          Certains enfants licenciés disposent d&apos;un accès autonome et volontairement
          restreint, l&apos;« Espace Enfant », via un lien privé propre à leur famille et un
          code PIN à 4 chiffres — sans e-mail ni mot de passe. Ce choix technique vise à
          demander le minimum de données possible à un mineur pour se connecter :
        </p>
        <ul className="mt-2 flex flex-col gap-1.5 list-disc pl-5">
          <li>Aucune adresse e-mail ni numéro de téléphone n&apos;est demandé à l&apos;enfant lui-même.</li>
          <li>
            Le code PIN sert uniquement à distinguer les enfants d&apos;une même famille
            partageant le même lien — jamais utilisé comme identifiant en dehors de ce
            contexte.
          </li>
          <li>
            L&apos;Espace Enfant est strictement en lecture seule sur les données du club
            (planning, équipe, résultats, consignes du coach) : aucune donnée
            supplémentaire n&apos;est collectée au-delà des actions explicitement prévues
            (ex. réponse « présent/absent » à une convocation).
          </li>
          <li>Le lien d&apos;accès est généré par le Bureau, jamais par l&apos;enfant lui-même.</li>
          <li>
            Les parents ou tuteurs légaux conservent à tout moment un accès complet aux
            données de leur enfant et peuvent en demander la modification ou la
            suppression.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-semibold text-zinc-900">4. Pourquoi ces données sont collectées</h2>
        <ul className="mt-2 flex flex-col gap-1.5 list-disc pl-5">
          <li>Gestion administrative de la licence FFBB et de la cotisation.</li>
          <li>Organisation des entraînements, matchs et convocations.</li>
          <li>Communication entre le club, les coachs et les familles.</li>
          <li>Suivi des présences, notamment pour la sécurité des enfants sur les créneaux.</li>
        </ul>
      </section>

      <section>
        <h2 className="font-semibold text-zinc-900">5. Qui a accès aux données</h2>
        <ul className="mt-2 flex flex-col gap-1.5 list-disc pl-5">
          <li><strong>Le Bureau</strong> : accès aux données administratives nécessaires à la gestion du club.</li>
          <li><strong>Les coachs</strong> : accès aux données des équipes qu&apos;ils encadrent uniquement.</li>
          <li><strong>Les parents</strong> : accès aux données de leurs propres enfants uniquement, jamais celles des autres familles.</li>
        </ul>
        <p className="mt-2">
          Aucune donnée n&apos;est vendue, louée, ni transmise à des tiers à des fins
          commerciales.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-zinc-900">6. Hébergement et sécurité</h2>
        <p className="mt-2">
          Les données sont hébergées par Supabase (Union européenne) et l&apos;application par
          Vercel Inc. Les accès sont protégés par des règles de sécurité au niveau de la
          base de données (Row Level Security), qui limitent strictement ce que chaque rôle
          peut consulter. Les sessions de l&apos;Espace Enfant sont protégées par un jeton
          signé cryptographiquement, propre à chaque famille.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-zinc-900">7. Durée de conservation</h2>
        <p className="mt-2">
          Les données sont conservées pendant la durée de l&apos;adhésion au club, puis
          archivées ou supprimées sur demande, sauf obligation légale de conservation
          (comptabilité, notamment).
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-zinc-900">8. Vos droits</h2>
        <p className="mt-2">
          Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès, de rectification,
          d&apos;effacement et de limitation du traitement de vos données (ou de celles de
          votre enfant mineur). Pour exercer ces droits, contactez le Bureau à{" "}
          <a href="mailto:ubac17.basket@gmail.com" className="text-ubac-blue underline underline-offset-2">
            ubac17.basket@gmail.com
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-zinc-900">9. Cookies</h2>
        <p className="mt-2">
          L&apos;Application utilise uniquement des cookies techniques strictement
          nécessaires à son fonctionnement (maintien de la connexion, session Espace
          Enfant). Aucun cookie publicitaire ni de traçage tiers n&apos;est utilisé.
        </p>
      </section>
    </LegalPageLayout>
  );
}
