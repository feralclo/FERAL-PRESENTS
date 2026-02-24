/**
 * Determines whether an event is in "announcement" (coming soon) mode.
 * Returns isAnnouncement: true if tickets_live_at exists and is in the future.
 */
export function getAnnouncementState(event: { tickets_live_at?: string | null }): {
  isAnnouncement: boolean;
  ticketsLiveAt: Date | null;
} {
  if (!event.tickets_live_at) {
    return { isAnnouncement: false, ticketsLiveAt: null };
  }

  const ticketsLiveAt = new Date(event.tickets_live_at);
  if (isNaN(ticketsLiveAt.getTime())) {
    return { isAnnouncement: false, ticketsLiveAt: null };
  }

  return {
    isAnnouncement: ticketsLiveAt > new Date(),
    ticketsLiveAt,
  };
}
