"use client";

import { cn } from "@/lib/utils";
import { Droplets, Container, Waves, Zap, TreePine, Route, Undo2, Trash2, MousePointer } from "lucide-react";

export type MarkerType = "well" | "septic-tank" | "septic-field" | "utility-line" | "tree-obstacle";
export type DrawMode = "select" | "marker" | "bore-path" | "existing-line";

interface MapToolbarProps {
  activeMode: DrawMode;
  activeMarkerType: MarkerType;
  onModeChange: (mode: DrawMode) => void;
  onMarkerTypeChange: (type: MarkerType) => void;
  onUndo: () => void;
  onClear: () => void;
  hasItems: boolean;
}

const markerTypes: { type: MarkerType; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { type: "well", label: "Well", icon: Droplets, color: "text-blue-400" },
  { type: "septic-tank", label: "Septic Tank", icon: Container, color: "text-gray-400" },
  { type: "septic-field", label: "Drain Field", icon: Waves, color: "text-gray-500" },
  { type: "utility-line", label: "Existing Line", icon: Zap, color: "text-yellow-400" },
  { type: "tree-obstacle", label: "Tree/Obstacle", icon: TreePine, color: "text-green-400" },
];

export function MapToolbar({
  activeMode,
  activeMarkerType,
  onModeChange,
  onMarkerTypeChange,
  onUndo,
  onClear,
  hasItems,
}: MapToolbarProps) {
  return (
    <div className="bg-card/95 backdrop-blur border border-border rounded-lg p-2 flex flex-wrap items-center gap-1">
      {/* Select mode */}
      <button
        type="button"
        onClick={() => onModeChange("select")}
        className={cn(
          "p-2 rounded text-xs flex items-center gap-1.5 transition-colors",
          activeMode === "select" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
        )}
        title="Select/Pan"
      >
        <MousePointer className="h-4 w-4" />
      </button>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Marker types */}
      {markerTypes.map(({ type, label, icon: Icon, color }) => (
        <button
          key={type}
          type="button"
          onClick={() => {
            onMarkerTypeChange(type);
            onModeChange("marker");
          }}
          className={cn(
            "p-2 rounded text-xs flex items-center gap-1.5 transition-colors",
            activeMode === "marker" && activeMarkerType === type
              ? "bg-primary text-primary-foreground"
              : "hover:bg-muted text-muted-foreground"
          )}
          title={label}
        >
          <Icon className={cn("h-4 w-4", activeMode === "marker" && activeMarkerType === type ? "" : color)} />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}

      <div className="w-px h-6 bg-border mx-1" />

      {/* Draw bore path */}
      <button
        type="button"
        onClick={() => onModeChange("bore-path")}
        className={cn(
          "p-2 rounded text-xs flex items-center gap-1.5 transition-colors",
          activeMode === "bore-path" ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"
        )}
        title="Draw Bore Path"
      >
        <Route className="h-4 w-4" />
        <span className="hidden sm:inline">Bore Path</span>
      </button>

      <div className="w-px h-6 bg-border mx-1" />

      {/* Undo / Clear */}
      <button
        type="button"
        onClick={onUndo}
        disabled={!hasItems}
        className="p-2 rounded text-xs text-muted-foreground hover:bg-muted transition-colors disabled:opacity-30"
        title="Undo"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={!hasItems}
        className="p-2 rounded text-xs text-muted-foreground hover:bg-muted hover:text-destructive transition-colors disabled:opacity-30"
        title="Clear All"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
