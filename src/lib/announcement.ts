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

/**
 * Determines whether an event should show the hype queue.
 * Queue is active when: queue_enabled && now >= tickets_live_at && now < tickets_live_at + queue_window_minutes.
 */
export function getQueueState(event: {
  tickets_live_at?: string | null;
  queue_enabled?: boolean | null;
  queue_duration_seconds?: number | null;
  queue_window_minutes?: number | null;
}): {
  isInQueueWindow: boolean;
  queueDurationSeconds: number;
  ticketsLiveAt: Date | null;
} {
  if (!event.queue_enabled || !event.tickets_live_at) {
    return { isInQueueWindow: false, queueDurationSeconds: 0, ticketsLiveAt: null };
  }

  const ticketsLiveAt = new Date(event.tickets_live_at);
  if (isNaN(ticketsLiveAt.getTime())) {
    return { isInQueueWindow: false, queueDurationSeconds: 0, ticketsLiveAt: null };
  }

  const now = Date.now();
  const liveAt = ticketsLiveAt.getTime();
  const windowMs = (event.queue_window_minutes ?? 60) * 60 * 1000;

  const isInQueueWindow = now >= liveAt && now < liveAt + windowMs;

  return {
    isInQueueWindow,
    queueDurationSeconds: event.queue_duration_seconds ?? 45,
    ticketsLiveAt,
  };
}
