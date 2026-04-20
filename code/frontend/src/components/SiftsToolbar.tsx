import { useEffect, useState } from "react";
import { ArrowUpDown, Check, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type SiftSort = "activity" | "alphabetical" | "docs" | "newest";

export const SIFT_SORT_VALUES: SiftSort[] = [
  "activity",
  "alphabetical",
  "docs",
  "newest",
];

const SORT_OPTIONS: { value: SiftSort; label: string }[] = [
  { value: "activity", label: "Recent activity" },
  { value: "alphabetical", label: "Alphabetical" },
  { value: "docs", label: "Most docs" },
  { value: "newest", label: "Newest" },
];

interface SiftsToolbarProps {
  query: string;
  onQueryChange: (q: string) => void;
  sort: SiftSort;
  onSortChange: (s: SiftSort) => void;
}

export function SiftsToolbar({
  query,
  onQueryChange,
  sort,
  onSortChange,
}: SiftsToolbarProps) {
  const [input, setInput] = useState(query);

  useEffect(() => {
    const t = setTimeout(() => {
      if (input !== query) onQueryChange(input);
    }, 120);
    return () => clearTimeout(t);
  }, [input, query, onQueryChange]);

  const activeSort = SORT_OPTIONS.find((o) => o.value === sort) ?? SORT_OPTIONS[0];

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60 pointer-events-none"
          aria-hidden
        />
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Search sifts…"
          className="pl-9 pr-9 h-9"
          aria-label="Search sifts"
        />
        {input && (
          <button
            type="button"
            onClick={() => {
              setInput("");
              onQueryChange("");
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground/60 hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0 h-9"
            aria-label="Sort sifts"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            <span className="text-xs">{activeSort.label}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {SORT_OPTIONS.map((o) => (
            <DropdownMenuItem
              key={o.value}
              onClick={() => onSortChange(o.value)}
              className="justify-between cursor-pointer"
            >
              <span>{o.label}</span>
              {o.value === sort && <Check className="h-3.5 w-3.5 text-primary" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
