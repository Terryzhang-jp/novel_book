import type { Location } from "@/types/storage";

interface LocationFilterProps {
  locations: Location[];
  selectedLocationId: string | "all";
  onLocationChange: (locationId: string | "all") => void;
  photoCountByLocation: Record<string, number>;
}

interface FilterButtonProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

function FilterButton({ label, count, active, onClick }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        px-3 py-1.5 rounded-lg border transition-all text-sm
        ${
          active
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background text-foreground border-border hover:bg-accent"
        }
      `}
    >
      <span className="font-medium">{label}</span>
      <span className="ml-2 opacity-70">({count})</span>
    </button>
  );
}

export function LocationFilter({
  locations,
  selectedLocationId,
  onLocationChange,
  photoCountByLocation,
}: LocationFilterProps) {
  // 计算总数
  const totalCount = Object.values(photoCountByLocation).reduce((sum, count) => sum + count, 0);

  // 按使用次数排序
  const sortedLocations = [...locations].sort((a, b) => {
    const countA = photoCountByLocation[a.id] || 0;
    const countB = photoCountByLocation[b.id] || 0;
    return countB - countA;
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">📍 Filter by Location:</span>
      </div>
      <div className="flex gap-2 flex-wrap">
        <FilterButton
          label="All Locations"
          count={totalCount}
          active={selectedLocationId === "all"}
          onClick={() => onLocationChange("all")}
        />
        {sortedLocations.map((location) => {
          const count = photoCountByLocation[location.id] || 0;
          if (count === 0) return null;

          return (
            <FilterButton
              key={location.id}
              label={location.name}
              count={count}
              active={selectedLocationId === location.id}
              onClick={() => onLocationChange(location.id)}
            />
          );
        })}
      </div>
    </div>
  );
}
