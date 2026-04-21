import type { DashboardTile, TileLayout } from "@/api/cloud";

const KIND_DEFAULTS: Record<
  DashboardTile["kind"],
  { w: number; h: number; minW: number; minH: number }
> = {
  kpi:        { w: 3,  h: 4, minW: 2, minH: 3 },
  bar_chart:  { w: 6,  h: 5, minW: 4, minH: 4 },
  line_chart: { w: 12, h: 5, minW: 6, minH: 4 },
  table:      { w: 12, h: 6, minW: 6, minH: 4 },
};

type LayoutItem = TileLayout & { i: string };

function greedyLayout(tiles: DashboardTile[], cols: number): LayoutItem[] {
  const out: LayoutItem[] = [];
  let curX = 0;
  let curY = 0;
  let rowH = 0;

  for (const tile of tiles) {
    const def = KIND_DEFAULTS[tile.kind] ?? KIND_DEFAULTS.kpi;
    const w = Math.min(def.w, cols);

    if (curX + w > cols) {
      curX = 0;
      curY += rowH;
      rowH = 0;
    }

    out.push({
      i: tile.id,
      x: curX,
      y: curY,
      w,
      h: def.h,
      minW: def.minW,
      minH: def.minH,
    });

    curX += w;
    rowH = Math.max(rowH, def.h);
  }

  return out;
}

function savedLayoutsAreValid(tiles: DashboardTile[]): boolean {
  const seen = new Set<string>();
  for (const t of tiles) {
    if (!t.layout) return false;
    const key = `${t.layout.x},${t.layout.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

/**
 * Returns the lg (12-col) layout for a set of tiles.
 * Uses saved layout verbatim when all tiles have valid, non-overlapping positions.
 * Falls back to greedy packing otherwise.
 */
export function deriveLgLayout(tiles: DashboardTile[]): LayoutItem[] {
  if (tiles.length > 0 && savedLayoutsAreValid(tiles)) {
    return tiles.map((t) => ({ i: t.id, ...(t.layout as TileLayout) }));
  }
  return greedyLayout(tiles, 12);
}

/**
 * Returns a layout for a non-lg breakpoint (md, sm) by always repacking with
 * the greedy algorithm for the given column count.
 *
 * Saved layouts are in 12-col space and must NOT be reused at smaller breakpoints
 * because items like line_chart (w:12) would overflow an 8-col grid.
 */
export function deriveBreakpointLayout(tiles: DashboardTile[], cols: number): LayoutItem[] {
  return greedyLayout(tiles, cols);
}
