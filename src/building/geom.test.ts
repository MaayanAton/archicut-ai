import { describe, expect, it } from 'vitest';
import { v2 } from '../geometry/vec';
import { polyArea } from '../site/poly';
import { faceAt, faceNet, graphFaces, grossOutlines, wallGraph, wallOutlines } from './geom';

const W = (id: string, ax: number, ay: number, bx: number, by: number, t = 200) => ({ id, a: v2(ax, ay), b: v2(bx, by), thickness: t });
const box = [W('s', 0, 0, 5000, 0), W('e', 5000, 0, 5000, 4000), W('n', 5000, 4000, 0, 4000), W('w', 0, 4000, 0, 0)];

describe('building geometry', () => {
  it('finds a closed room and its net and gross areas', () => {
    const faces = graphFaces(wallGraph(box));
    const f = faceAt(faces, v2(2500, 2000))!;
    expect(f).toBeTruthy();
    expect(polyArea(faceNet(f)) / 1e6).toBeCloseTo(4.8 * 3.8, 6);
    const g = grossOutlines(faces);
    expect(g.length).toBe(1);
    expect(polyArea(g[0]) / 1e6).toBeCloseTo(5.2 * 4.2, 6);
  });
  it('splits rooms with an interior wall (T-junctions) and keeps exact net areas', () => {
    const walls = [...box, W('i', 3000, 0, 3000, 4000, 100)];
    const faces = graphFaces(wallGraph(walls));
    const a = faceAt(faces, v2(1000, 1000))!, b = faceAt(faces, v2(4000, 1000))!;
    expect(polyArea(faceNet(a)) / 1e6).toBeCloseTo(((3000 - 100 - 50) * 3800) / 1e6, 6);
    expect(polyArea(faceNet(b)) / 1e6).toBeCloseTo(((2000 - 100 - 50) * 3800) / 1e6, 6);
  });
  it('reports no room when the walls do not close', () => {
    const faces = graphFaces(wallGraph(box.slice(0, 3)));
    expect(faceAt(faces, v2(2500, 2000))).toBeNull();
  });
  it('mitres corners: outlines of a closed box cover exactly the wall area', () => {
    const ol = wallOutlines(box);
    const total = [...ol.values()].reduce((s, p) => s + polyArea(p), 0);
    expect(total / 1e6).toBeCloseTo(5.2 * 4.2 - 4.8 * 3.8, 6);
  });
  it('trims a T-junction wall at the face of the other wall', () => {
    const walls = [...box, W('i', 3000, 0, 3000, 4000, 100)];
    const p = wallOutlines(walls).get('i')!;
    expect(polyArea(p)).toBeCloseTo(100 * 3800, 3);
  });
  it('handles crossing walls', () => {
    const walls = [...box, W('x', 0, 2000, 5000, 2000), W('y', 2500, 0, 2500, 4000)];
    const faces = graphFaces(wallGraph(walls)).filter((f) => f.area > 0);
    expect(faces.length).toBe(4);
  });
});
