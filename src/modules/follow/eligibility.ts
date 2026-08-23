export type FollowEpisodeInterval = {
  activatedAt: Date;
  deactivatedAt: Date | null;
};

export function isFollowEpisodeEligibleAt(
  episode: FollowEpisodeInterval,
  signalPublishedAt: Date,
): boolean {
  return (
    episode.activatedAt.getTime() <= signalPublishedAt.getTime() &&
    (episode.deactivatedAt === null ||
      signalPublishedAt.getTime() < episode.deactivatedAt.getTime())
  );
}
