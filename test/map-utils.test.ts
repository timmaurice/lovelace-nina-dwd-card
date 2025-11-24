import { describe, it, expect } from 'vitest';
import { latLonToPixel } from '../src/map-utils';
import { MAP_DATA } from '../src/map-data';

describe('latLonToPixel', () => {
  it('should calculate correct pixel coordinates for Frankfurt example', () => {
    // Frankfurt example from user: 50.1109, 8.6821
    // Expected result depends on the map data and image size.
    // Let's use the same logic as the user's script to verify our implementation matches.

    const lat = 50.1109;
    const lon = 8.6821;
    const mapData = MAP_DATA['hes'];

    // Assume a 1000x1000 image for easy calculation
    const imgWidth = 1000;
    const imgHeight = 1000;

    const result = latLonToPixel(lat, lon, mapData, imgWidth, imgHeight);

    // Manual calculation based on user script logic:
    // bounds: minLat: 49.3948, maxLat: 51.654, minLon: 7.7732, maxLon: 10.234
    // padding: top: 11.8, bottom: 6.5, left: 11.7, right: 13.5

    const minLat = 49.3948;
    const maxLat = 51.654;
    const minLon = 7.7732;
    const maxLon = 10.234;

    const xNorm = (lon - minLon) / (maxLon - minLon);
    const yNorm = (lat - minLat) / (maxLat - minLat);

    const padLeftPx = (11.7 / 100) * imgWidth;
    const padRightPx = (13.5 / 100) * imgWidth;
    const padTopPx = (11.8 / 100) * imgHeight;
    const padBottomPx = (6.5 / 100) * imgHeight;

    const usableWidth = imgWidth - padLeftPx - padRightPx;
    const usableHeight = imgHeight - padTopPx - padBottomPx;

    const expectedX = padLeftPx + xNorm * usableWidth;
    const expectedY = padTopPx + (1 - yNorm) * usableHeight;

    expect(result.x).toBeCloseTo(expectedX, 4);
    expect(result.y).toBeCloseTo(expectedY, 4);
  });

  it('should handle percentage calculation correctly (width/height = 100)', () => {
    const lat = 50.1109;
    const lon = 8.6821;
    const mapData = MAP_DATA['hes'];

    const result = latLonToPixel(lat, lon, mapData, 100, 100);

    // Expected values roughly based on where Frankfurt is in Hessen
    // Frankfurt is roughly in the middle-south
    expect(result.x).toBeGreaterThan(0);
    expect(result.x).toBeLessThan(100);
    expect(result.y).toBeGreaterThan(0);
    expect(result.y).toBeLessThan(100);
  });
});
