import type { PhotoStats } from "@/types/storage";

interface PhotoStatsProps {
  stats: PhotoStats;
}

export function PhotoStatsComponent({ stats }: PhotoStatsProps) {
  return (
    <div className="flex gap-4 text-sm text-muted-foreground">
      <div>
        <span className="font-medium">Total:</span> {stats.total}
      </div>
      <div>
        <span className="font-medium">📍⏰:</span> {stats.byCategory["time-location"]}
      </div>
      <div>
        <span className="font-medium">⏰:</span> {stats.byCategory["time-only"]}
      </div>
      <div>
        <span className="font-medium">📍:</span> {stats.byCategory["location-only"]}
      </div>
      <div>
        <span className="font-medium">❓:</span> {stats.byCategory.neither}
      </div>
    </div>
  );
}
