import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  showText?: boolean;
}

export function Logo({ className, showText = true }: LogoProps) {
  return (
    <div className={cn("flex items-center", className)}>
      <div className="w-1 self-stretch bg-primary rounded-sm mr-2" />
      <div className="flex flex-col">
        <span className="text-3xl font-black tracking-wide text-foreground leading-tight">
          FiberNorth
        </span>
        {showText && (
          <>
            <span className="text-sm font-bold tracking-[0.2em] text-primary leading-tight">
              UNDERGROUND
            </span>
            <div className="h-[1px] bg-primary/40 mt-0.5" />
          </>
        )}
      </div>
    </div>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center", className)}>
      <div className="w-1 h-8 bg-primary rounded-sm mr-1.5" />
      <span className="text-2xl font-black tracking-wide text-foreground">
        FiberNorth
      </span>
    </div>
  );
}
