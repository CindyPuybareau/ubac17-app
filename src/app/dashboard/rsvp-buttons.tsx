"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  SEGMENT_ABSENT_ON,
  SEGMENT_BUTTON,
  SEGMENT_GROUP,
  SEGMENT_OFF,
  SEGMENT_PRESENT_ON,
} from "./rsvp-segment";

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
    <div className={SEGMENT_GROUP}>
      <button
        disabled={loading}
        onClick={() => respond("PRESENT")}
        className={`${SEGMENT_BUTTON} ${
          status === "PRESENT" ? SEGMENT_PRESENT_ON : SEGMENT_OFF
        }`}
      >
        <Check className="h-3.5 w-3.5 shrink-0" />
        Présent
      </button>
      <button
        disabled={loading}
        onClick={() => respond("ABSENT")}
        className={`${SEGMENT_BUTTON} ${
          status === "ABSENT" ? SEGMENT_ABSENT_ON : SEGMENT_OFF
        }`}
      >
        <X className="h-3.5 w-3.5 shrink-0" />
        Absent
      </button>
    </div>
  );
}
