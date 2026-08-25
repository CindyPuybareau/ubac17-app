import type { Metadata } from "next";
import LegalPageLayout from "@/components/legal-page-layout";

export const metadata: Metadata = {
  title: "Mentions légales — UBAC",
};

// Infos officielles fournies par Cindy le 2026-08-25 : registre national des
// associations (annuaire-entreprises.data.gouv.fr, SIREN 490 137 734) pour
// le statut/siège/SIRET, et à jour pour la présidence (le registre public
// n'était plus à jour sur ce point) — Thomas KORZEN (président), Julien
// RUSKE (vice-président). Hébergeur : uniquement celui de cette application
// (Vercel) — celui du site vitrine ubac17.fr n'est volontairement pas
// mentionné ici (retour de Cindy : "ça on ne stipule pas").
export default function MentionsLegalesPage() {
  return (
    <LegalPageLayout title="Mentions légales">
      <section>
        <h2 className="font-semibold text-zinc-900">Éditeur du site et de l&apos;application</h2>
        <p className="mt-2">
          Union Basket Angoulins Châtelaillon (UBAC)
          <br />
          Association loi 1901
          <br />
          Siège social : Club House, Chemin des Marais, 17690 Angoulins
          <br />
          SIREN : 490 137 734 — SIRET : 490 137 734 00011
          <br />
          N° RNA (Répertoire National des Associations) : W173 000 647
          <br />
          Président : Thomas KORZEN
          <br />
          Vice-président : Julien RUSKE
          <br />
          Contact : <a href="mailto:ubac17.basket@gmail.com" className="text-ubac-blue underline underline-offset-2">ubac17.basket@gmail.com</a>
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-zinc-900">Directeur de la publication</h2>
        <p className="mt-2">
          Thomas KORZEN, Président de l&apos;UBAC — contact :{" "}
          <a href="mailto:ubac17.basket@gmail.com" className="text-ubac-blue underline underline-offset-2">ubac17.basket@gmail.com</a>
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-zinc-900">Hébergement</h2>
        <p className="mt-2">
          Cette application est hébergée par :
          <br />
          Vercel Inc.
          <br />
          340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis
          <br />
          <a
            href="https://vercel.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-ubac-blue underline underline-offset-2"
          >
            vercel.com
          </a>
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-zinc-900">Propriété intellectuelle</h2>
        <p className="mt-2">
          L&apos;ensemble des éléments présents sur cette application (textes, logos, visuels) est
          la propriété de l&apos;UBAC ou de ses partenaires, sauf mention contraire. Toute
          reproduction sans autorisation préalable est interdite.
        </p>
      </section>

      <section>
        <h2 className="font-semibold text-zinc-900">Données personnelles</h2>
        <p className="mt-2">
          Le traitement des données personnelles, y compris celles des enfants licenciés
          mineurs, est détaillé dans notre{" "}
          <a href="/confidentialite" className="text-ubac-blue underline underline-offset-2">
            politique de confidentialité
          </a>
          .
        </p>
      </section>
    </LegalPageLayout>
  );
}
