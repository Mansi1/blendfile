// Polygon faces to triangles. Quads and n-gons may be concave (Blender allows it), so faces with more than
// three corners are ear-clipped in the plane of their Newell normal.

/** A face's corners as vertex indices into a flat xyz position array. */
export function triangulatePolygon(positions: ArrayLike<number>, cornerVertices: ArrayLike<number>): number[] {
  return triangulatePolygonCorners(positions, cornerVertices).map((corner) => cornerVertices[corner]!);
}

/** Like triangulatePolygon, but gives positions within `cornerVertices` (0 … n − 1), so callers can look up per-corner data such as UVs. */
export function triangulatePolygonCorners(positions: ArrayLike<number>, cornerVertices: ArrayLike<number>): number[] {
  const cornerCount = cornerVertices.length;
  if (cornerCount < 3) return [];
  if (cornerCount === 3) return [0, 1, 2];
  const points = projectToFacePlane(positions, cornerVertices);
  const remaining = Array.from({ length: cornerCount }, (_, index) => index);
  const triangles: number[] = [];
  let guard = cornerCount * cornerCount;
  while (remaining.length > 3 && guard-- > 0) {
    const earPosition = remaining.findIndex((_, position) => isEar(points, remaining, position));
    // Degenerate input (collinear or self-intersecting corners): fall back to cutting the first corner.
    const cutPosition = earPosition === -1 ? 0 : earPosition;
    const previous = remaining[(cutPosition + remaining.length - 1) % remaining.length]!;
    const next = remaining[(cutPosition + 1) % remaining.length]!;
    triangles.push(previous, remaining[cutPosition]!, next);
    remaining.splice(cutPosition, 1);
  }
  triangles.push(...remaining);
  return triangles;
}

/** 2D coordinates of the corners, in the plane perpendicular to the face's Newell normal, counter-clockwise. */
function projectToFacePlane(positions: ArrayLike<number>, cornerVertices: ArrayLike<number>): [number, number][] {
  const corner = (index: number) => {
    const vertex = cornerVertices[index]! * 3;
    return [positions[vertex]!, positions[vertex + 1]!, positions[vertex + 2]!] as const;
  };
  const normal = [0, 0, 0];
  for (let index = 0; index < cornerVertices.length; index += 1) {
    const current = corner(index);
    const next = corner((index + 1) % cornerVertices.length);
    normal[0]! += (current[1] - next[1]) * (current[2] + next[2]);
    normal[1]! += (current[2] - next[2]) * (current[0] + next[0]);
    normal[2]! += (current[0] - next[0]) * (current[1] + next[1]);
  }
  // Drop the dominant normal axis; flip the other two when the normal points the negative way so winding stays CCW.
  const absolute = normal.map(Math.abs);
  const dominantAxis = absolute[0]! > absolute[1]! && absolute[0]! > absolute[2]! ? 0 : absolute[1]! > absolute[2]! ? 1 : 2;
  const [uAxis, vAxis] = ([[1, 2], [2, 0], [0, 1]] as const)[dominantAxis];
  const flip = normal[dominantAxis]! < 0 ? -1 : 1;
  return Array.from({ length: cornerVertices.length }, (_, index) => {
    const point = corner(index);
    return [point[uAxis], point[vAxis] * flip];
  });
}

const cross = (origin: [number, number], first: [number, number], second: [number, number]) =>
  (first[0] - origin[0]) * (second[1] - origin[1]) - (first[1] - origin[1]) * (second[0] - origin[0]);

function isEar(points: [number, number][], remaining: number[], position: number): boolean {
  const previous = points[remaining[(position + remaining.length - 1) % remaining.length]!]!;
  const current = points[remaining[position]!]!;
  const next = points[remaining[(position + 1) % remaining.length]!]!;
  if (cross(previous, current, next) <= 0) return false; // reflex or degenerate corner
  return remaining.every((index) => {
    const point = points[index]!;
    if (point === previous || point === current || point === next) return true;
    return !(cross(previous, current, point) >= 0 && cross(current, next, point) >= 0 && cross(next, previous, point) >= 0);
  });
}
