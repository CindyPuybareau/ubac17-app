"use client";

import { useState } from "react";
import { LayoutGrid, Shield, X } from "lucide-react";
import MembersTable from "./members-table";

type Person = { id: string; first_name: string | null; last_name: string | null };

export default function OverviewStats({
  teamsCount,
  members,
}: {
  teamsCount: number;
  members: Person[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3 rounded-2xl border border-zinc-100 bg-white p-5 shadow-sm">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ubac-yellow/15 text-ubac-yellow-dark">
            <LayoutGrid className="h-5 w-5" />
          </span>
          <div>
            <p className="text-2xl font-bold text-zinc-900">{teamsCount}</p>
            <p className="text-sm text-zinc-500">Équipes</p>
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-3 rounded-2xl border border-zinc-100 bg-white p-5 text-left shadow-sm transition-colors hover:border-ubac-yellow/50"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ubac-yellow/15 text-ubac-yellow-dark">
            <Shield className="h-5 w-5" />
          </span>
          <div>
            <p className="text-2xl font-bold text-zinc-900">{members.length}</p>
            <p className="text-sm text-zinc-500">Membres</p>
          </div>
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-lg sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold text-zinc-900">Membres du club</h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <MembersTable members={members} />
          </div>
        </div>
      )}
    </>
  );
}
