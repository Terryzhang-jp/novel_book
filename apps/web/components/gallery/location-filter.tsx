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
        flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all whitespace-nowrap text-xs font-medium
        ${active
          ? "bg-primary text-primary-foreground border-primary shadow-md"
          : "bg-background/50 text-muted-foreground border-border hover:bg-accent hover:text-foreground backdrop-blur-sm"
        }
      `}
    >
      <span>{label}</span>
      <span className="opacity-70 text-[10px]">({count})</span>
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
    <div className="flex items-center gap-2">
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
  );
}
