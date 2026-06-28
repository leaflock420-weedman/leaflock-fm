const VIDEO_ID_PATTERN = /^[\w-]{11}$/;

export function parseYouTubeVideoId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  if (VIDEO_ID_PATTERN.test(value)) {
    return value;
  }

  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id && VIDEO_ID_PATTERN.test(id) ? id : null;
    }

    if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
      const fromQuery = url.searchParams.get("v");
      if (fromQuery && VIDEO_ID_PATTERN.test(fromQuery)) {
        return fromQuery;
      }

      const parts = url.pathname.split("/").filter(Boolean);
      const embedIndex = parts.indexOf("embed");
      if (embedIndex >= 0 && parts[embedIndex + 1] && VIDEO_ID_PATTERN.test(parts[embedIndex + 1])) {
        return parts[embedIndex + 1];
      }

      const shortsIndex = parts.indexOf("shorts");
      if (shortsIndex >= 0 && parts[shortsIndex + 1] && VIDEO_ID_PATTERN.test(parts[shortsIndex + 1])) {
        return parts[shortsIndex + 1];
      }
    }
  } catch {
    return null;
  }

  return null;
}