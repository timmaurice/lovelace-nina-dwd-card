import { MapData } from './map-data';

export interface PixelCoords {
  x: number;
  y: number;
}

/**
 * Converts latitude and longitude to pixel coordinates on the map image.
 *
 * @param lat Latitude
 * @param lon Longitude
 * @param mapData Map data containing bounds and padding
 * @param imgWidth Natural width of the image
 * @param imgHeight Natural height of the image
 * @returns Pixel coordinates {x, y} relative to the image top-left
 */
export function latLonToPixel(
  lat: number,
  lon: number,
  mapData: MapData,
  imgWidth: number,
  imgHeight: number,
): PixelCoords {
  const { bounds, padding } = mapData;

  const xNorm = (lon - bounds.minLon) / (bounds.maxLon - bounds.minLon);
  const yNorm = (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat);

  // Padding in Pixel
  const padLeftPx = (padding.left / 100) * imgWidth;
  const padRightPx = (padding.right / 100) * imgWidth;
  const padTopPx = (padding.top / 100) * imgHeight;
  const padBottomPx = (padding.bottom / 100) * imgHeight;

  const usableWidth = imgWidth - padLeftPx - padRightPx;
  const usableHeight = imgHeight - padTopPx - padBottomPx;

  const xPx = padLeftPx + xNorm * usableWidth;
  // y is inverted (higher lat is higher up, which is lower y pixel value)
  const yPx = padTopPx + (1 - yNorm) * usableHeight;

  return { x: xPx, y: yPx };
}
