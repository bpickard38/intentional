import { describe, expect, it } from "vitest";
import { createPathGeometry, rcx, Z0 } from "./geometry";

// Common phone widths and the SVG heights the Home and Insights screens derive from them.
const SCREENS = [
  { w: 360, h: Math.min(740 * 0.56, 400) },
  { w: 390, h: Math.min(844 * 0.56, 400) },
  { w: 430, h: Math.min(932 * 0.66, 510) },
];
const LABEL_ROOM = 75; // ~12 truncated characters at 11–12px

describe("rcx", () => {
  it("starts the road centered at the viewer's feet", () => {
    expect(rcx(Z0)).toBe(0);
  });
});

describe.each(SCREENS)("layoutStones on a $w px wide screen", ({ w, h }) => {
  const geom = createPathGeometry(w, h);
  const stones = geom.layoutStones(11);

  it("places at least five stones below the horizon", () => {
    expect(stones.length).toBeGreaterThanOrEqual(5);
    for (const s of stones) expect(s.y).toBeGreaterThan(geom.HY);
  });

  it("keeps every stone fully on screen", () => {
    for (const s of stones) {
      expect(s.x - s.r).toBeGreaterThanOrEqual(0);
      expect(s.x + s.r).toBeLessThanOrEqual(w);
    }
  });

  it("does not overlap neighboring stones", () => {
    for (let i = 1; i < stones.length; i++) {
      const gap = stones[i - 1].y - stones[i].y;
      expect(gap).toBeGreaterThanOrEqual(stones[i - 1].r + stones[i].r - 0.5);
    }
  });

  it("leaves room for a label on the side facing the screen center", () => {
    for (const s of stones.filter((s) => s.r >= 8)) {
      const room = s.x > geom.CX ? s.x - s.r - 8 : w - (s.x + s.r + 8);
      expect(room).toBeGreaterThanOrEqual(LABEL_ROOM);
    }
  });
});
