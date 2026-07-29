type Person = { id: string; first_name: string | null; last_name: string | null };

export default function MembersTable({ members }: { members: Person[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-semibold">Prénom</th>
              <th className="px-4 py-3 font-semibold">Nom</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {members.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-2.5 text-zinc-900">
                  {m.first_name ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-zinc-500">
                  {m.last_name ?? "—"}
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-6 text-center text-zinc-400">
                  Aucun membre pour le moment.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
