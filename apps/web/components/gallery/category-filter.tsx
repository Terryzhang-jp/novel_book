import type { PhotoCategory, PhotoStats } from "@/types/storage";

interface CategoryFilterProps {
  stats: PhotoStats;
  selectedCategory: PhotoCategory | "all";
  onCategoryChange: (category: PhotoCategory | "all") => void;
}

interface FilterButtonProps {
  icon: string;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}

function FilterButton({ icon, label, count, active, onClick }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        px-4 py-2 rounded-lg border transition-all
        ${
          active
            ? "bg-primary text-primary-foreground border-primary"
            : "bg-background text-foreground border-border hover:bg-accent"
        }
      `}
    >
      <span className="mr-2">{icon}</span>
      <span className="font-medium">{label}</span>
      <span className="ml-2 opacity-70">({count})</span>
    </button>
  );
}

export function CategoryFilter({ stats, selectedCategory, onCategoryChange }: CategoryFilterProps) {
  return (
    <div className="flex gap-3 flex-wrap">
      <FilterButton
        icon="🌟"
        label="All"
        count={stats.total}
        active={selectedCategory === "all"}
        onClick={() => onCategoryChange("all")}
      />
      <FilterButton
        icon="📍⏰"
        label="Time + Location"
        count={stats.byCategory["time-location"]}
        active={selectedCategory === "time-location"}
        onClick={() => onCategoryChange("time-location")}
      />
      <FilterButton
        icon="⏰"
        label="Time Only"
        count={stats.byCategory["time-only"]}
        active={selectedCategory === "time-only"}
        onClick={() => onCategoryChange("time-only")}
      />
      <FilterButton
        icon="📍"
        label="Location Only"
        count={stats.byCategory["location-only"]}
        active={selectedCategory === "location-only"}
        onClick={() => onCategoryChange("location-only")}
      />
      <FilterButton
        icon="❓"
        label="No Info"
        count={stats.byCategory.neither}
        active={selectedCategory === "neither"}
        onClick={() => onCategoryChange("neither")}
      />
    </div>
  );
}
