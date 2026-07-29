"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RsvpButtons({
  eventId,
  playerId,
  currentStatus,
}: {
  eventId: string;
  playerId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [loading, setLoading] = useState(false);

  async function respond(newStatus: "PRESENT" | "ABSENT") {
    setLoading(true);
    const supabase = createClient();

    const { data: existing } = await supabase
      .from("rsvps")
      .select("id")
      .eq("event_id", eventId)
      .eq("player_id", playerId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("rsvps")
        .update({ status: newStatus })
        .eq("id", existing.id);
    } else {
      await supabase
        .from("rsvps")
        .insert({ event_id: eventId, player_id: playerId, status: newStatus });
    }

    setStatus(newStatus);
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={loading}
        onClick={() => respond("PRESENT")}
        className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
          status === "PRESENT"
            ? "bg-ubac-yellow text-navy"
            : "border border-ubac-yellow text-ubac-yellow-dark hover:bg-ubac-yellow/10"
        }`}
      >
        ✅ Présent
      </button>
      <button
        disabled={loading}
        onClick={() => respond("ABSENT")}
        className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
          status === "ABSENT"
            ? "bg-red-600 text-white"
            : "border border-red-600 text-red-700 hover:bg-red-50"
        }`}
      >
        ❌ Absent
      </button>
    </div>
  );
}
