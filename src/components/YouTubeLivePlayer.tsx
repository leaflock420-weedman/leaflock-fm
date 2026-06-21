"use client";

type YouTubeLivePlayerProps = {
  videoId?: string;
  channelId?: string;
};

export default function YouTubeLivePlayer({ videoId, channelId }: YouTubeLivePlayerProps) {
  const embedSrc = videoId
    ? `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1`
    : channelId
      ? `https://www.youtube.com/embed/live_stream?channel=${channelId}&rel=0&modestbranding=1`
      : null;

  if (!embedSrc) {
    return (
      <div className="rounded-3xl border border-zinc-800 bg-zinc-950 p-8 text-center">
        <p className="text-lg font-semibold text-white">Studio live stream</p>
        <p className="mt-2 text-sm text-zinc-400">
          When you go live on YouTube, add your live video ID or channel ID in the private desk.
        </p>
        <p className="mt-4 text-xs text-zinc-500">
          Create a <strong className="text-zinc-300">Live Sessions</strong> playlist in YouTube for
          replays, then set it in the desk.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-zinc-800 bg-black shadow-2xl">
      <div className="relative w-full pb-[56.25%]">
        <iframe
          src={embedSrc}
          title="LeafLock Live Radio"
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
      <p className="border-t border-zinc-800 px-4 py-3 text-xs text-zinc-500">
        YouTube Live — audio/video from your studio stream.
      </p>
    </div>
  );
}