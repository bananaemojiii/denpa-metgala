"use client";

import MuxPlayer from "@mux/mux-player-react";

interface Props {
  playbackId: string;
}

export function StreamPlayer({ playbackId }: Props) {
  return (
    <div className="relative w-full h-full bg-black">
      <MuxPlayer
        playbackId={playbackId}
        streamType="ll-live"
        envKey={process.env.NEXT_PUBLIC_MUX_ENV_KEY}
        style={{ width: "100%", height: "100%" }}
        autoPlay
        muted={false}
        preferPlayback="mse"
        metadata={{
          video_title: "Denpa · Met Gala 2026",
          viewer_user_id: "anonymous",
        }}
      />
    </div>
  );
}
