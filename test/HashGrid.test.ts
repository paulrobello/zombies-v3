import { describe, it, expect } from 'vitest';
import { HashGrid, HashGridOptions } from '../src/grids/HashGrid';
import { vec2 } from '../src/math';
import { World } from '../src/World';

/**
 * Minimal stand-in entity for HashGrid<>. Implements exactly the structural
 * shape HashGridCellItem requires (IPositional & ICellIndexable & IGridQueryable)
 * without pulling in Boid/Human/Zombie and their World+WebGL dependencies.
 *
 * Used for QA-004 HashGrid integration coverage:
 *   - cache key correctness (incl. id-0 vs no-self)
 *   - layer masking
 *   - closest-only mode
 *   - wrap mode
 *   - cell-index edges
 *   - radius narrowing (Phase-2 QA-002 filter fix)
 *   - cache invalidation on removeCelDataByIndex (QA-021)
 *   - cell tracking through add/remove (ARC-001 regression)
 */
interface MockEntity {
  id: number;
  layer: number;
  p: vec2;
  lastCellIndex: number;
  cellIndex: number;
}

function makeEntity(id: number, x: number, y: number, layer: number = 1): MockEntity {
  return {
    id,
    layer,
    p: new vec2(x, y),
    lastCellIndex: -1,
    cellIndex: -1,
  };
}

/**
 * HashGrid reads `world.CurrentFrame` for cache frame accounting. A plain
 * object with a CurrentFrame getter is sufficient; cast through unknown to
 * satisfy the HashGridOptions `world: World` type without dragging WebGL in.
 */
function makeWorldMock(): { world: World; setFrame: (n: number) => void; advanceFrame: () => void } {
  let frame = 0;
  const world = {
    get CurrentFrame(): number {
      return frame;
    },
  } as unknown as World;
  return {
    world,
    setFrame: (n: number) => {
      frame = n;
    },
    advanceFrame: () => {
      frame++;
    },
  };
}

function makeGrid(overrides: Partial<HashGridOptions> = {}): {
  grid: HashGrid<MockEntity>;
  setFrame: (n: number) => void;
  advanceFrame: () => void;
} {
  const { world, setFrame, advanceFrame } = makeWorldMock();
  const options: HashGridOptions = {
    world,
    width: 100,
    height: 100,
    cellSize: 10,
    wrap: false,
    computeNeighborRadius: 2,
    maxQueryCacheFrames: 0,
    ...overrides,
  };
  return { grid: new HashGrid<MockEntity>(options), setFrame, advanceFrame };
}

describe('HashGrid', () => {
  describe('addCelDataByIndex / removeCelDataByIndex — cell tracking (ARC-001 regression)', () => {
    it('addCelDataByIndex sets cellIndex and lastCellIndex correctly across moves', () => {
      const { grid } = makeGrid();
      const e = makeEntity(0, 5, 5);

      // First add: cellIndex goes from -1 → cell-of-(5,5), lastCellIndex follows.
      grid.addCelData(5, 5, true, e);
      expect(e.cellIndex).toBe(grid.getCellIndex(5, 5, true));
      expect(e.lastCellIndex).toBe(e.cellIndex);

      // Move: remove from current, add to new. cellIndex/lastCellIndex update
      // such that the entity lives in exactly one cell.
      const firstIndex = e.cellIndex;
      grid.removeCelDataByIndex(firstIndex, e);
      expect(e.cellIndex).toBe(-1);
      grid.addCelData(55, 55, true, e);
      const secondIndex = e.cellIndex;
      expect(secondIndex).not.toBe(firstIndex);
      // Entity must NOT still be present in the first cell.
      const firstCell = grid.getCell(5, 5, true);
      expect(firstCell?.items.includes(e)).toBe(false);
      const secondCell = grid.getCell(55, 55, true);
      expect(secondCell?.items.includes(e)).toBe(true);
    });

    it('an entity exists in exactly one cell across many moves (no phantom-cell leak)', () => {
      const { grid } = makeGrid();
      const e = makeEntity(1, 5, 5);
      grid.addCelData(5, 5, true, e);

      // Move through several cells.
      const positions = [[15, 15], [25, 35], [85, 75], [5, 5]];
      for (const [x, y] of positions) {
        const prevIndex = e.cellIndex;
        grid.removeCelDataByIndex(prevIndex, e);
        grid.addCelData(x, y, true, e);
      }

      // Count occurrences across ALL cells — must be exactly 1.
      let occurrences = 0;
      for (const cell of grid.cells) {
        if (cell.items.includes(e)) occurrences++;
      }
      expect(occurrences).toBe(1);
    });

    it('removeCelDataByIndex returns false for a missing entity', () => {
      const { grid } = makeGrid();
      const e = makeEntity(2, 5, 5);
      grid.addCelData(5, 5, true, e);
      // Wrong cell index — indexOf returns -1, remove returns false.
      expect(grid.removeCelDataByIndex(grid.getCellIndex(95, 95, true)!, e)).toBe(false);
      // Out-of-range cell index — returns false without throwing.
      expect(grid.removeCelDataByIndex(9999, e)).toBe(false);
    });
  });

  describe('getDataRadius — closest-only mode', () => {
    it('returns the single nearest entity within radius when closest=true', () => {
      const { grid } = makeGrid();
      // Note: `near` is offset from the query point so dist2 > 0. The original
      // closest-mode `!nearest` check treats dist2===0 (entity exactly at the
      // query point) as "no match" — a latent bug the QA-018 refactor
      // deliberately preserves; this test avoids that edge case.
      const near = makeEntity(10, 52, 50);
      const far = makeEntity(11, 55, 50);
      grid.addCelData(near.p.x, near.p.y, true, near);
      grid.addCelData(far.p.x, far.p.y, true, far);

      const result = grid.getDataRadius(50, 50, 20, true, undefined, true, 0);
      expect(result).toHaveLength(1);
      expect(result[0].data).toBe(near);
    });

    it('excludes self from the closest result', () => {
      const { grid } = makeGrid();
      const self = makeEntity(20, 50, 50);
      const other = makeEntity(21, 52, 50);
      grid.addCelData(self.p.x, self.p.y, true, self);
      grid.addCelData(other.p.x, other.p.y, true, other);

      const result = grid.getDataRadius(50, 50, 20, true, self, true, 0);
      expect(result).toHaveLength(1);
      expect(result[0].data).toBe(other);
    });

    it('returns empty when no entity is within radius (closest)', () => {
      const { grid } = makeGrid();
      const far = makeEntity(30, 90, 90);
      grid.addCelData(far.p.x, far.p.y, true, far);
      const result = grid.getDataRadius(10, 10, 5, true, undefined, true, 0);
      expect(result).toHaveLength(0);
    });
  });

  describe('getDataRadius — findAll mode', () => {
    it('returns all entities within radius, sorted by distance ascending', () => {
      const { grid } = makeGrid();
      const a = makeEntity(1, 50, 50);
      const b = makeEntity(2, 53, 50);
      const c = makeEntity(3, 58, 50);
      grid.addCelData(a.p.x, a.p.y, true, a);
      grid.addCelData(b.p.x, b.p.y, true, b);
      grid.addCelData(c.p.x, c.p.y, true, c);

      const result = grid.getDataRadius(50, 50, 20, true, undefined, false, 0);
      expect(result.map(r => r.data)).toEqual([a, b, c]);
      // Sorted ascending by dist2.
      for (let i = 1; i < result.length; i++) {
        expect(result[i].dist2).toBeGreaterThanOrEqual(result[i - 1].dist2);
      }
    });

    it('excludes entities outside the radius', () => {
      const { grid } = makeGrid();
      const in_ = makeEntity(1, 50, 50);
      const out = makeEntity(2, 95, 95);
      grid.addCelData(in_.p.x, in_.p.y, true, in_);
      grid.addCelData(out.p.x, out.p.y, true, out);

      const result = grid.getDataRadius(50, 50, 15, true, undefined, false, 0);
      expect(result.map(r => r.data)).toEqual([in_]);
    });
  });

  describe('getDataRadius — layer masking', () => {
    it('mask=0 returns entities from all layers', () => {
      const { grid } = makeGrid();
      const a = makeEntity(1, 50, 50, 2);
      const b = makeEntity(2, 51, 50, 4);
      grid.addCelData(a.p.x, a.p.y, true, a);
      grid.addCelData(b.p.x, b.p.y, true, b);

      const result = grid.getDataRadius(50, 50, 20, true, undefined, false, 0);
      expect(result).toHaveLength(2);
    });

    it('non-zero mask filters to entities whose layer bit intersects', () => {
      const { grid } = makeGrid();
      const a = makeEntity(1, 50, 50, 2); // layer 2 (binary 0010)
      const b = makeEntity(2, 51, 50, 4); // layer 4 (binary 0100)
      const c = makeEntity(3, 52, 50, 6); // layer 6 (binary 0110, intersects both)
      grid.addCelData(a.p.x, a.p.y, true, a);
      grid.addCelData(b.p.x, b.p.y, true, b);
      grid.addCelData(c.p.x, c.p.y, true, c);

      // mask 2 → a and c (both have bit 2 set).
      const r2 = grid.getDataRadius(50, 50, 20, true, undefined, false, 2);
      expect(r2.map(r => r.data).sort(byId)).toEqual([a, c]);
      // mask 4 → b and c.
      const r4 = grid.getDataRadius(50, 50, 20, true, undefined, false, 4);
      expect(r4.map(r => r.data).sort(byId)).toEqual([b, c]);
      // mask 8 → none.
      const r8 = grid.getDataRadius(50, 50, 20, true, undefined, false, 8);
      expect(r8).toHaveLength(0);
    });

    function byId(x: MockEntity, y: MockEntity): number {
      return x.id - y.id;
    }
  });

  describe('getDataRadius — wrap mode', () => {
    it('wrap=false returns undefined cell index outside the grid', () => {
      const { grid } = makeGrid({ wrap: false });
      // Note: getCellIndex truncates with `~~` which rounds toward zero, so
      // small-negative world coords (e.g. -5/10 = -0.5) clamp to 0 (in-grid).
      // Only fully-out-of-range cells return undefined.
      expect(grid.getCellIndex(-100, -100, true)).toBeUndefined();
      expect(grid.getCellIndex(200, 200, true)).toBeUndefined();
    });

    it('wrap=true returns a valid cell index for out-of-bounds coordinates', () => {
      const { grid } = makeGrid({ wrap: true });
      // A wrapping grid never returns undefined for world coordinates: -5
      // wraps into a real cell. Sanity: index is in range.
      const idx = grid.getCellIndex(-5, -5, true);
      expect(idx).not.toBeUndefined();
      expect(idx!).toBeGreaterThanOrEqual(0);
      expect(idx!).toBeLessThan(grid.cells.length);
    });

    it('wrap=true places an entity added off-grid into a wrapped cell', () => {
      const { grid } = makeGrid({ wrap: true });
      const e = makeEntity(1, -5, -5);
      grid.addCelData(-5, -5, true, e);
      expect(e.cellIndex).toBeGreaterThanOrEqual(0);
      // The entity is reachable through the wrapped cell.
      const cell = grid.cells[e.cellIndex];
      expect(cell.items.includes(e)).toBe(true);
    });
  });

  describe('getDataRadius — cell-index edges', () => {
    it('querying exactly at the world origin returns in-grid entities', () => {
      const { grid } = makeGrid();
      const e = makeEntity(1, 5, 5);
      grid.addCelData(5, 5, true, e);
      const r = grid.getDataRadius(0, 0, 15, true, undefined, false, 0);
      expect(r.map(x => x.data)).toContain(e);
    });

    it('querying outside the grid returns an empty list (no cell)', () => {
      const { grid } = makeGrid();
      const r = grid.getDataRadius(-100, -100, 5, true, undefined, false, 0);
      expect(r).toHaveLength(0);
    });

    it('query at the top-right corner is bounded by grid dimensions', () => {
      const { grid } = makeGrid();
      const e = makeEntity(1, 95, 95);
      grid.addCelData(95, 95, true, e);
      // (100, 100) is just past the grid edge (width=height=100, cellSize=10).
      const r = grid.getDataRadius(100, 100, 20, true, undefined, false, 0);
      // Behaviour: query at (100,100) is out-of-grid → no cell → empty list.
      // Documenting current behaviour as a regression pin.
      expect(r).toHaveLength(0);
    });
  });

  describe('getDataRadius — cache key correctness (QA-006)', () => {
    // The cache is disabled in production (maxQueryCacheFrames: 0); these
    // tests opt in to exercise the cache-key logic.

    /**
     * Setup: place a real id-0 entity and a separate entity in the same cell.
     * A no-self query should see BOTH; a self={id:0} query should exclude
     * only the id-0 entity. Under the old `${self?.id || 0}` key, the two
     * queries collided and one would serve the other's cached result.
     */
    it('id-0 entity does not collide with no-self query', () => {
      const { grid, setFrame } = makeGrid({ maxQueryCacheFrames: 10 });
      const idZero = makeEntity(0, 50, 50);
      const other = makeEntity(1, 50, 50);
      grid.addCelData(idZero.p.x, idZero.p.y, true, idZero);
      grid.addCelData(other.p.x, other.p.y, true, other);

      // Frame 0: no-self query — caches a 2-entity result.
      setFrame(0);
      const noSelf = grid.getDataRadius(50, 50, 15, true, undefined, false, 0);
      expect(noSelf.map(r => r.data).sort(byId)).toEqual([idZero, other]);

      // Same frame: query as idZero (self). Must see only `other`, not the
      // stale 2-entity cache entry the no-self query just wrote. Without the
      // sentinel these would share a key and this would return [idZero, other].
      const asIdZero = grid.getDataRadius(50, 50, 15, true, idZero, false, 0);
      expect(asIdZero.map(r => r.data)).toEqual([other]);

      // And the inverse: querying as `other` excludes only `other`.
      const asOther = grid.getDataRadius(50, 50, 15, true, other, false, 0);
      expect(asOther.map(r => r.data)).toEqual([idZero]);

      function byId(x: MockEntity, y: MockEntity): number {
        return x.id - y.id;
      }
    });

    it('closest=true falls back to the non-closest cache entry and returns its first item', () => {
      const { grid, setFrame } = makeGrid({ maxQueryCacheFrames: 10 });
      const a = makeEntity(0, 50, 50);
      const b = makeEntity(1, 53, 50);
      grid.addCelData(a.p.x, a.p.y, true, a);
      grid.addCelData(b.p.x, b.p.y, true, b);

      setFrame(0);
      // Prime the cache with a non-closest query.
      grid.getDataRadius(50, 50, 15, true, undefined, false, 0);
      // Now ask for closest — should reuse the sorted non-closest cache and
      // return the first (nearest) item, without recomputing.
      const closest = grid.getDataRadius(50, 50, 15, true, undefined, true, 0);
      expect(closest).toHaveLength(1);
      expect(closest[0].data).toBe(a);
    });
  });

  describe('getDataRadius — radius narrowing (QA-002 Phase-2 filter fix)', () => {
    /**
     * Setup: cache a wide-radius query, then issue a narrower-radius query
     * against the same key. The Phase-2 fix reassigns the filtered array
     * (previously `.filter()` was discarded and the wider cached set was
     * returned, leaking far-away entities into the narrower query).
     */
    it('a narrower-radius cache read filters out entries beyond the new radius', () => {
      const { grid, setFrame } = makeGrid({ maxQueryCacheFrames: 10 });
      const near = makeEntity(0, 50, 50);
      const mid = makeEntity(1, 53, 50); // dist=3
      const far = makeEntity(2, 58, 50); // dist=8
      grid.addCelData(near.p.x, near.p.y, true, near);
      grid.addCelData(mid.p.x, mid.p.y, true, mid);
      grid.addCelData(far.p.x, far.p.y, true, far);

      setFrame(0);
      // Prime cache with radius 20 (includes near, mid, far).
      const wide = grid.getDataRadius(50, 50, 20, true, undefined, false, 0);
      expect(wide.map(r => r.data)).toEqual([near, mid, far]);

      // Narrow the radius on the cached entry. radius 5 keeps near + mid,
      // drops far. If the filter were discarded we'd see all three here.
      const narrow = grid.getDataRadius(50, 50, 5, true, undefined, false, 0);
      expect(narrow.map(r => r.data)).toEqual([near, mid]);
      // dist2 sanity: every returned entry is within the new radius.
      for (const r of narrow) {
        expect(r.dist2).toBeLessThanOrEqual(5 * 5);
      }
    });

    it('a narrower closest read still returns a result within the narrowed radius', () => {
      const { grid, setFrame } = makeGrid({ maxQueryCacheFrames: 10 });
      const near = makeEntity(0, 50, 50);
      grid.addCelData(near.p.x, near.p.y, true, near);

      setFrame(0);
      grid.getDataRadius(50, 50, 20, true, undefined, false, 0);
      const narrow = grid.getDataRadius(50, 50, 5, true, undefined, true, 0);
      expect(narrow).toHaveLength(1);
      expect(narrow[0].data).toBe(near);
    });
  });

  describe('getDataRadius — cache expiry', () => {
    it('an expired cache entry is recomputed on the next query', () => {
      const { grid, setFrame } = makeGrid({ maxQueryCacheFrames: 5 });
      const a = makeEntity(0, 50, 50);
      grid.addCelData(a.p.x, a.p.y, true, a);

      setFrame(0);
      const first = grid.getDataRadius(50, 50, 15, true, undefined, false, 0);
      expect(first.map(r => r.data)).toEqual([a]);

      // Add a second entity at the same cell, then advance past maxQueryCacheFrames.
      const b = makeEntity(1, 50, 50);
      grid.addCelData(b.p.x, b.p.y, true, b);
      setFrame(10); // 10 - 0 = 10 >= 5 → entry is expired.
      const second = grid.getDataRadius(50, 50, 15, true, undefined, false, 0);
      expect(second.map(r => r.data).sort(byId)).toEqual([a, b]);

      function byId(x: MockEntity, y: MockEntity): number {
        return x.id - y.id;
      }
    });
  });

  describe('getDataRadius — cache invalidation on remove (QA-021)', () => {
    /**
     * Regression for ConvertHumanBehavior-style mutation-during-query: a
     * cached neighbour list must not survive a `removeCelDataByIndex` that
     * changes the cell's contents.
     */
    it('removeCelDataByIndex drops cached entries for that cell', () => {
      const { grid, setFrame } = makeGrid({ maxQueryCacheFrames: 100 });
      const a = makeEntity(0, 50, 50);
      const b = makeEntity(1, 50, 50);
      grid.addCelData(a.p.x, a.p.y, true, a);
      grid.addCelData(b.p.x, b.p.y, true, b);

      setFrame(0);
      // Prime the cache: both entities returned.
      const before = grid.getDataRadius(50, 50, 15, true, undefined, false, 0);
      expect(before).toHaveLength(2);

      // Remove `a` — the cache entry for this cell must be invalidated so
      // the next query (same frame) does not return `a` as a stale neighbour.
      grid.removeCelDataByIndex(a.cellIndex, a);

      const after = grid.getDataRadius(50, 50, 15, true, undefined, false, 0);
      expect(after.map(r => r.data)).toEqual([b]);
    });

    it('removeCelDataByIndex does NOT invalidate cache entries for other cells', () => {
      const { grid, setFrame } = makeGrid({ maxQueryCacheFrames: 100 });
      const cellA = makeEntity(0, 5, 5);
      const cellB = makeEntity(1, 85, 85);
      grid.addCelData(cellA.p.x, cellA.p.y, true, cellA);
      grid.addCelData(cellB.p.x, cellB.p.y, true, cellB);

      setFrame(0);
      // Prime both cells' caches.
      grid.getDataRadius(5, 5, 15, true, undefined, false, 0);
      grid.getDataRadius(85, 85, 15, true, undefined, false, 0);

      // Remove cellA — the cache for cellB's cell must remain intact.
      grid.removeCelDataByIndex(cellA.cellIndex, cellA);

      const stillCached = grid.getDataRadius(85, 85, 15, true, undefined, false, 0);
      expect(stillCached.map(r => r.data)).toEqual([cellB]);
    });
  });
});
