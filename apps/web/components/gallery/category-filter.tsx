import type { PhotoCategory, PhotoStats } from "@/types/storage";

interface CategoryFilterProps {
  stats: PhotoStats;
  selectedCategory: PhotoCategory | "all";
  onCategoryChange: (category: PhotoCategory | "all") => void;
  variant?: "default" | "pill";
}

interface FilterButtonProps {
  icon: string;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  variant?: "default" | "pill";
}

function FilterButton({ icon, label, count, active, onClick, variant = "default" }: FilterButtonProps) {
  const baseStyles = "flex items-center gap-1.5 transition-all whitespace-nowrap font-medium";

  const variants = {
    default: `
      px-3 py-1.5 rounded-full border text-xs
      ${active
        ? "bg-primary text-primary-foreground border-primary shadow-md"
        : "bg-background/50 text-muted-foreground border-border hover:bg-accent hover:text-foreground backdrop-blur-sm"
      }
    `,
    pill: `
      px-4 py-2 rounded-full text-sm border-0
      ${active
        ? "bg-primary text-primary-foreground shadow-md"
        : "bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      }
    `
  };

  return (
    <button
      onClick={onClick}
      className={`${baseStyles} ${variants[variant]}`}
    >
      <span>{icon}</span>
      <span className={variant === "pill" && !active ? "hidden sm:inline" : ""}>{label}</span>
      <span className="opacity-70 text-[10px] ml-0.5">({count})</span>
    </button>
  );
}

export function CategoryFilter({ stats, selectedCategory, onCategoryChange, variant = "default" }: CategoryFilterProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide p-1">
      <FilterButton
        icon="🌟"
        label="All"
        count={stats.total}
        active={selectedCategory === "all"}
        onClick={() => onCategoryChange("all")}
        variant={variant}
      />
      <FilterButton
        icon="📍⏰"
        label="Time + Location"
        count={stats.byCategory["time-location"]}
        active={selectedCategory === "time-location"}
        onClick={() => onCategoryChange("time-location")}
        variant={variant}
      />
      <FilterButton
        icon="⏰"
        label="Time Only"
        count={stats.byCategory["time-only"]}
        active={selectedCategory === "time-only"}
        onClick={() => onCategoryChange("time-only")}
        variant={variant}
      />
      <FilterButton
        icon="📍"
        label="Location Only"
        count={stats.byCategory["location-only"]}
        active={selectedCategory === "location-only"}
        onClick={() => onCategoryChange("location-only")}
        variant={variant}
      />
      <FilterButton
        icon="❓"
        label="No Info"
        count={stats.byCategory.neither}
        active={selectedCategory === "neither"}
        onClick={() => onCategoryChange("neither")}
        variant={variant}
      />
    </div>
  );
}
