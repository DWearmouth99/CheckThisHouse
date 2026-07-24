/**
 * Maximum radii for "nearest" local amenity selection.
 * Beyond cap → omit the row; empty tables get an honest within-cap message.
 */

export const DISTANCE_CAPS_MILES = {
  schools: 10,
  bus: 2,
  stations: 30,
  /** A-roads already use A_ROAD_RADIUS_MILES in naptanTransport */
  aRoads: 12,
} as const;

export function emptyWithinCapMessage(category: string, capMiles: number): string {
  return `No ${category} found within ${capMiles} miles of this address`;
}
