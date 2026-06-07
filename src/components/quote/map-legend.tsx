import { Droplets, Container, Waves, Zap, TreePine, Route } from "lucide-react";

export function MapLegend() {
  const items = [
    { icon: Droplets, color: "text-blue-400", label: "Well" },
    { icon: Container, color: "text-gray-400", label: "Septic Tank" },
    { icon: Waves, color: "text-gray-500", label: "Drain Field" },
    { icon: Zap, color: "text-yellow-400", label: "Existing Utility" },
    { icon: TreePine, color: "text-green-400", label: "Tree/Obstacle" },
    { icon: Route, color: "text-primary", label: "Desired Bore Path" },
  ];

  return (
    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      {items.map(({ icon: Icon, color, label }) => (
        <span key={label} className="flex items-center gap-1">
          <Icon className={`h-3.5 w-3.5 ${color}`} />
          {label}
        </span>
      ))}
    </div>
  );
}
