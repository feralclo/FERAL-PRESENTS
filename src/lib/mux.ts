import Mux from "@mux/mux-node";

let muxClient: Mux | null = null;

/**
 * Get the singleton Mux API client.
 * Requires MUX_TOKEN_ID and MUX_TOKEN_SECRET env vars.
 */
export function getMuxClient(): Mux | null {
  if (muxClient) return muxClient;

  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;

  if (!tokenId || !tokenSecret) return null;

  muxClient = new Mux({ tokenId, tokenSecret });
  return muxClient;
}

/**
 * Construct a Mux HLS stream URL from a playback ID.
 * HLS is adaptive — quality adjusts to connection speed.
 */
export function getMuxStreamUrl(playbackId: string): string {
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

/**
 * Construct a Mux thumbnail URL from a playback ID.
 */
export function getMuxThumbnailUrl(playbackId: string): string {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=1`;
}

/**
 * Check if a video_url value is a Mux playback ID (vs a full URL).
 */
export function isMuxPlaybackId(value: string): boolean {
  return !!value && !value.startsWith("http");
}
