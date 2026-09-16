// SPDX-License-Identifier: MPL-2.0
// The atlas (ADR 0015, issue 177): docs/factory/map.yaml, painted. Every region and tile position
// comes from the file; the only positions this component computes are (a) the pan/zoom transform
// d3-zoom drives, seeded once on load so a visitor lands on a legible view instead of the whole
// canvas shrunk to a speck, and (b) where a fogged region's contact tiles sit on that region's own
// edge, per ADR 0015's own "its contacts show on the region's edge" -- a rendering-time placement,
// not a second position recorded in the data file. A tile's state (lit / cleared for jump /
// contact) already arrives decided from /api/atlas (server/src/model/atlas.ts); a region with no
// lit tile paints fogged.
import { useEffect, useRef, type RefObject } from 'react';
import { select } from 'd3-selection';
import { zoom, zoomIdentity, type D3ZoomEvent } from 'd3-zoom';
import { useNavigate } from 'react-router-dom';
import { useAtlasQuery } from '../api/queries';
import type { Atlas, AtlasRegion, AtlasTile, TileState } from '../api/client';

const STATE_LABEL: Record<TileState, string> = {
  lit: 'Lit',
  'cleared-for-jump': 'Cleared for jump',
  contact: 'Contact',
};

// A user can zoom out far enough to see the whole hand-authored canvas, or in far enough that one
// tile among a crowded region is comfortably readable (checkpoint-4 finding: the default extent,
// [0.25, 4], left even a deliberate max-zoom tile at ~15px on a real 8-region canvas).
const SCALE_EXTENT: [number, number] = [0.08, 8];
// The scale the seeded initial transform frames one region at -- picked so a region's own 32px
// tiles land close to their authored size on screen once the outer SVG's own viewBox-to-frame
// scaling is applied, not so large that panning to a neighbour takes many drags.
const INITIAL_REGION_SCALE = 3.5;
const EDGE_GAP = 28;
const EDGE_STEP = 40;

type RenderTile = AtlasTile & { renderX: number; renderY: number };

/** Fog of war repositions a fogged region's contact tiles onto that region's own bottom edge,
 * evenly spaced (ADR 0015: "its contacts show on the region's edge") -- every other tile keeps
 * its literal `map.yaml` position untouched, lit or not. Pure function of the atlas response, so
 * it is exercised directly by AtlasRoom.test (no DOM needed). */
export function layoutTiles(tiles: AtlasTile[], regions: AtlasRegion[]): RenderTile[] {
  const regionsById = new Map(regions.map((r) => [r.id, r]));
  const byRegion = new Map<string, AtlasTile[]>();
  for (const tile of tiles) {
    const group = byRegion.get(tile.region) ?? [];
    group.push(tile);
    byRegion.set(tile.region, group);
  }

  const out: RenderTile[] = [];
  for (const [regionId, regionTiles] of byRegion) {
    const region = regionsById.get(regionId);
    if (!region || !region.fogged) {
      for (const tile of regionTiles) out.push({ ...tile, renderX: tile.x, renderY: tile.y });
      continue;
    }
    const contacts = regionTiles.filter((t) => t.state === 'contact');
    const others = regionTiles.filter((t) => t.state !== 'contact');
    for (const tile of others) out.push({ ...tile, renderX: tile.x, renderY: tile.y });

    const edgeY = region.y + region.size + EDGE_GAP;
    const step = contacts.length > 1 ? Math.min(EDGE_STEP, region.size / contacts.length) : 0;
    const startX = region.x + region.size / 2 - (step * (contacts.length - 1)) / 2;
    contacts.forEach((tile, i) => out.push({ ...tile, renderX: startX + i * step, renderY: edgeY }));
  }
  return out;
}

/** The region a first-time visitor lands framing: the last one in `map.yaml`'s own list order --
 * the newest milestone, and so the likeliest place work is actually happening. Falls back to the
 * first region when the atlas is otherwise empty, and to `null` only when it has no regions at
 * all (an empty/unreadable map.yaml), in which case the view seeds nothing and starts at identity. */
function landingRegion(regions: AtlasRegion[]): AtlasRegion | null {
  return regions.length > 0 ? regions[regions.length - 1] : null;
}

export function AtlasRoom() {
  const { data, isLoading, error } = useAtlasQuery();
  const navigate = useNavigate();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const viewRef = useRef<SVGGElement | null>(null);

  // d3-zoom owns the pan/zoom transform; React owns everything the transform is applied to. The
  // effect re-attaches on every fresh atlas response so a resized region set never leaves a stale
  // transform bound to nodes that no longer exist, and re-seeds the initial framing only once per
  // mount (a poll refresh must never yank a visitor's own pan/zoom back to the landing region).
  const seededRef = useRef(false);
  useEffect(() => {
    if (!svgRef.current || !viewRef.current || !data) return;
    const svgSel = select(svgRef.current);
    const viewSel = select(viewRef.current);
    const behaviour = zoom<SVGSVGElement, unknown>()
      .scaleExtent(SCALE_EXTENT)
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        viewSel.attr('transform', event.transform.toString());
      });
    svgSel.call(behaviour);

    if (!seededRef.current) {
      seededRef.current = true;
      const target = landingRegion(data.regions);
      if (target) {
        const scale = Math.min(SCALE_EXTENT[1], Math.max(SCALE_EXTENT[0], INITIAL_REGION_SCALE));
        const cx = target.x + target.size / 2;
        const cy = target.y + target.size / 2;
        const maxX = Math.max(600, ...data.regions.map((r) => r.x + r.size));
        const maxY = Math.max(600, ...data.regions.map((r) => r.y + r.size));
        const transform = zoomIdentity.translate(maxX / 2 - scale * cx, maxY / 2 - scale * cy).scale(scale);
        svgSel.call(behaviour.transform, transform);
      }
    }
    return () => {
      svgSel.on('.zoom', null);
    };
  }, [data]);

  if (error) return <p className="muted">Could not load the atlas.</p>;
  if (isLoading || !data) return <p className="muted">Loading the atlas…</p>;

  return <AtlasCanvas data={data} svgRef={svgRef} viewRef={viewRef} navigate={navigate} />;
}

function AtlasCanvas({
  data,
  svgRef,
  viewRef,
  navigate,
}: {
  data: Atlas;
  svgRef: RefObject<SVGSVGElement | null>;
  viewRef: RefObject<SVGGElement | null>;
  navigate: (path: string) => void;
}) {
  const clearedCount = data.tiles.filter((t) => t.state === 'cleared-for-jump').length;
  // EDGE_GAP + one row of edge-pinned contacts: a fogged region in the bottom row can paint
  // below its own y + size, so the viewBox needs the same margin layoutTiles() reaches for.
  const maxX = Math.max(600, ...data.regions.map((r) => r.x + r.size));
  const maxY = Math.max(600, ...data.regions.map((r) => r.y + r.size + EDGE_GAP + EDGE_STEP));
  const renderTiles = layoutTiles(data.tiles, data.regions);

  return (
    <section>
      <p className="altitude__band">Atlas</p>
      <h1 className="headline">Known space, painted from the map</h1>
      <p className="lede">
        Regions are PLAN.md §7&apos;s milestones. Tiles are quests, one per issue prefix. A region with no lit tile sits under fog; its contacts
        show on the region&apos;s edge. Scroll or pinch to zoom, drag to pan.
      </p>

      <p
        className={`panel__ctx status-chip${data.githubReachable ? ' status-chip--ok' : ' status-chip--lost'}`}
        data-testid="atlas-github-chip"
      >
        {data.githubReachable ? `cleared for jump: ${clearedCount}` : 'comms-lost — cleared for jump unavailable'}
      </p>

      <ul className="atlas-legend">
        <li className="atlas-legend__item">
          <span className="atlas-swatch atlas-swatch--lit" aria-hidden="true" /> Lit
        </li>
        <li className="atlas-legend__item">
          <span className="atlas-swatch atlas-swatch--cleared-for-jump" aria-hidden="true" /> Cleared for jump
        </li>
        <li className="atlas-legend__item">
          <span className="atlas-swatch atlas-swatch--contact" aria-hidden="true" /> Contact
        </li>
        <li className="atlas-legend__item">
          <span className="atlas-swatch atlas-swatch--fogged" aria-hidden="true" /> Fogged region
        </li>
      </ul>

      <div className="atlas-frame">
        <svg
          ref={svgRef}
          data-testid="atlas-svg"
          viewBox={`0 0 ${maxX} ${maxY}`}
          role="img"
          aria-label="The atlas: regions and tiles from docs/factory/map.yaml"
        >
          <g ref={viewRef}>
            {data.regions.map((region) => (
              <g key={region.id} data-testid="atlas-region" data-region={region.id} data-fogged={region.fogged}>
                <rect
                  x={region.x}
                  y={region.y}
                  width={region.size}
                  height={region.size}
                  className={`atlas-region${region.fogged ? ' atlas-region--fogged' : ''}`}
                />
                <text x={region.x + 16} y={region.y + 32} className="atlas-region__name">
                  {region.name}
                </text>
              </g>
            ))}
            {renderTiles.map((tile) => (
              <circle
                key={tile.id}
                data-testid="atlas-tile"
                data-tile={tile.id}
                data-state={tile.state}
                cx={tile.renderX}
                cy={tile.renderY}
                r={tile.size / 2}
                className={`atlas-tile atlas-tile--${tile.state}`}
                role="link"
                tabIndex={0}
                aria-label={`#${tile.id} ${tile.title}, ${STATE_LABEL[tile.state]}. Open its codex entry.`}
                onClick={() => navigate(`/codex/${String(tile.issueN).padStart(2, '0')}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') navigate(`/codex/${String(tile.issueN).padStart(2, '0')}`);
                }}
              >
                <title>{`#${tile.id} ${tile.title} — ${STATE_LABEL[tile.state]}`}</title>
              </circle>
            ))}
          </g>
        </svg>
      </div>
    </section>
  );
}
