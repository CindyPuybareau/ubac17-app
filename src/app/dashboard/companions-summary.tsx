"use client";

// Total des personnes attendues sur un Événement club (retour de Cindy du
// 19/11, question du comptable pour le Noël de l'UBAC) -- Bureau seulement.
// Licenciés présents + accompagnants (comptés une fois par famille), avec
// le détail par famille et un export Excel pour le comptable.
import { useState } from "react";
import { ChevronDown, ChevronUp, Download, Users } from "lucide-react";
import type { CompanionsFamilyLine } from "@/lib/event-companions";

export default function CompanionsSummary({
  eventTitle,
  eventStart,
  presentCount,
  companionsTotal,
  families,
}: {
  eventTitle: string;
  eventStart: string;
  presentCount: number;
  companionsTotal: number;
  families: CompanionsFamilyLine[];
}) {
  const [open, setOpen] = useState(false);
  const total = presentCount + companionsTotal;
  const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

  async function exportExcel() {
    // xlsx chargé seulement au clic, comme les autres exports de l'appli.
    const XLSX = await import("xlsx");
    const header = ["Famille (licenciés présents)", "Équipe(s)", "Licenciés présents", "Accompagnants", "Total"];
    const rows = families.map((f) => [
      f.names.join(", "),
      f.teams.join(", "),
      f.present,
      f.companions,
      f.present + f.companions,
    ]);
    const totalRow = ["TOTAL", "", presentCount, companionsTotal, total];
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows, [], totalRow]);
    ws["!cols"] = [{ wch: 40 }, { wch: 22 }, { wch: 18 }, { wch: 15 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Personnes attendues");
    const day = eventStart.slice(0, 10);
    const safeTitle = eventTitle.replace(/[^\p{L}\p{N} -]+/gu, "").trim().slice(0, 40) || "evenement";
    XLSX.writeFile(wb, `personnes-attendues-${safeTitle}-${day}.xlsx`);
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-navy/[0.04] px-3 py-2">
      <p className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-700">
        <Users className="h-3.5 w-3.5 shrink-0 text-navy" />
        <span>
          <span className="font-semibold tabular-nums">{plural(presentCount, "présent")}</span> +{" "}
          <span className="font-semibold tabular-nums">{plural(companionsTotal, "accompagnant")}</span> ={" "}
          <span className="font-bold tabular-nums text-navy">
            {total} personne{total > 1 ? "s" : ""} attendue{total > 1 ? "s" : ""}
          </span>
        </span>
      </p>
      {families.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-navy hover:underline"
          >
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {open ? "Masquer le détail" : `Voir le détail (${plural(families.length, "famille")})`}
          </button>
          <button
            type="button"
            onClick={exportExcel}
            className="inline-flex items-center gap-1 rounded-full border border-navy/20 bg-white px-2.5 py-1 text-[11px] font-semibold text-navy hover:bg-navy/5"
          >
            <Download className="h-3 w-3" />
            Exporter (Excel)
          </button>
        </div>
      )}
      {open && (
        <ul className="flex flex-col divide-y divide-zinc-100 rounded-lg border border-zinc-100 bg-white">
          {families.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
              <span className="min-w-0">
                <span className="block font-semibold text-zinc-800">{f.names.join(", ")}</span>
                {f.teams.length > 0 && <span className="block text-[11px] text-zinc-400">{f.teams.join(", ")}</span>}
              </span>
              <span className="shrink-0 text-right tabular-nums text-zinc-600">
                {f.companions > 0 ? (
                  <>
                    + <span className="font-semibold text-zinc-900">{f.companions}</span>
                  </>
                ) : (
                  <span className="text-zinc-400">seul{f.present > 1 ? "s" : ""}</span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
