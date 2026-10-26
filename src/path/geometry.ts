// Perspective geometry for the "path" visual shared by the Home and Insights screens.
// World space: x is lateral (road units), z is depth from the viewer. Screen space is
// the SVG's pixel grid, with the horizon at HY and the vanishing point at CX.

export const Z0 = 1.5; // z-near (viewer's feet)
export const EH = 1.5; // eye height
export const Z_FAR = 30;
export const RHW = 1.05; // road half-width in world units

/**
 * Road center S-curve. Starts centered at the viewer's feet, swings right, then
 * back left toward the horizon. Starting at 0 keeps the near (widest) part of the
 * road on screen at phone widths.
 */
export function rcx(z: number): number {
  return Math.sin((z - Z0) * 0.3) * 2.6;
}

export type StonePosition = { x: number; y: number; r: number; z: number };

export type PathGeometry = {
  SVG_W: number;
  SVG_H: number;
  HY: number;
  CX: number;
  FL: number;
  ROAD_D: string;
  proj: (wx: number, wz: number) => { x: number; y: number };
  /** Screen positions for up to `count` stones along the road, nearest first. */
  layoutStones: (count: number) => StonePosition[];
};

export function createPathGeometry(width: number, height: number): PathGeometry {
  const SVG_W = width;
  const SVG_H = height;
  const HY = SVG_H * 0.38;
  const CX = SVG_W / 2;
  const FL = SVG_H - HY;

  function proj(wx: number, wz: number) {
    const s = FL / wz;
    return { x: CX + wx * s, y: HY + EH * s };
  }

  function buildRoadD(N = 90): string {
    const left: string[] = [], right: string[] = [];
    for (let i = 0; i <= N; i++) {
      // Log-spaced z: dense near the viewer, sparse at the horizon
      const t = i / N;
      const wz = Z0 * Math.pow(Z_FAR / Z0, t);
      const cx = rcx(wz);
      const lp = proj(cx - RHW, wz);
      const rp = proj(cx + RHW, wz);
      left.push(`${lp.x.toFixed(1)} ${lp.y.toFixed(1)}`);
      right.push(`${rp.x.toFixed(1)} ${rp.y.toFixed(1)}`);
    }
    // Left edge near→far, then right edge far→near
    return `M ${left[0]} ` + left.slice(1).map(p => `L ${p}`).join(" ")
         + ` L ${right[N]} ` + right.slice(0, N).reverse().map(p => `L ${p}`).join(" ")
         + " Z";
  }

  function layoutStones(count: number): StonePosition[] {
    const result: StonePosition[] = [];
    let sy = SVG_H * 0.91; // nearest stone sits just above the viewer's feet
    for (let i = 0; i < count; i++) {
      if (sy <= HY + 6) break; // nothing at or above the horizon
      const wz = EH * FL / (sy - HY);
      const r = Math.max(5, 20 * (Z0 / wz)); // min 5px so far stones stay visible
      result.push({ x: proj(rcx(wz), wz).x, y: sy, r, z: wz });
      // Step by the stone's own size so near (large) stones never overlap.
      sy -= Math.max(14, r * 2 + 6);
    }
    return result;
  }

  return { SVG_W, SVG_H, HY, CX, FL, ROAD_D: buildRoadD(), proj, layoutStones };
}
