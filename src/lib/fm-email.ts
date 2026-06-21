import { getTopLikes, type TrackLike } from "@/lib/fm-store";

function ownerEmail() {
  return process.env.FM_OWNER_EMAIL?.trim() ?? "";
}

function resendKey() {
  return process.env.RESEND_API_KEY?.trim() ?? "";
}

function fromAddress() {
  return process.env.FM_EMAIL_FROM?.trim() || "LeafLock FM <onboarding@resend.dev>";
}

export async function sendOwnerEmail(subject: string, text: string) {
  const to = ownerEmail();
  const apiKey = resendKey();

  if (!to) {
    return { sent: false, reason: "FM_OWNER_EMAIL is not configured" };
  }

  if (!apiKey) {
    return { sent: false, reason: "RESEND_API_KEY is not configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromAddress(),
      to: [to],
      subject,
      text
    })
  });

  if (!response.ok) {
    const body = await response.text();
    return { sent: false, reason: `Email failed: ${response.status} ${body}` };
  }

  return { sent: true };
}

export async function emailTopLovedDigest(limit = 15) {
  const top = await getTopLikes(limit);
  if (top.length === 0) {
    return sendOwnerEmail("LeafLock FM — no loves yet", "No track loves recorded yet.");
  }

  const lines = top.map(
    (track, index) =>
      `${index + 1}. ${track.title}${track.artist ? ` — ${track.artist}` : ""} (${track.count} loves)`
  );

  return sendOwnerEmail(
    `LeafLock FM — top ${top.length} loved tracks`,
    ["Most loved / requests:", "", ...lines].join("\n")
  );
}

export async function emailTrackLove(like: TrackLike) {
  return sendOwnerEmail(
    `LeafLock FM love: ${like.title}`,
    [
      "A listener loved a track:",
      "",
      `Title: ${like.title}`,
      like.artist ? `Artist: ${like.artist}` : null,
      `Total loves: ${like.count}`,
      `Source: ${like.source}`,
      `Track ID: ${like.trackId}`
    ]
      .filter(Boolean)
      .join("\n")
  );
}