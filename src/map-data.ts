export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface MapPadding {
  top: number; // Percentage
  bottom: number; // Percentage
  left: number; // Percentage
  right: number; // Percentage
}

export interface MapData {
  bounds: MapBounds;
  padding: MapPadding;
}

// Source of bounds: http://osmtipps.lefty1963.de/2008/10/api-und-bounding-box.html
export const MAP_DATA: Record<string, MapData> = {
  hes: {
    bounds: {
      minLat: 49.3948,
      maxLat: 51.654,
      minLon: 7.7732,
      maxLon: 10.234,
    },
    padding: {
      top: 11.8,
      bottom: 6.5,
      left: 11.7,
      right: 13.5,
    },
  },
  nrw: {
    bounds: {
      minLat: 50.3227,
      maxLat: 52.531,
      minLon: 5.866,
      maxLon: 9.4477,
    },
    padding: {
      top: 22.2,
      bottom: 19.0,
      left: 10.7,
      right: 10.3,
    },
  },
  shh: {
    bounds: {
      minLat: 53.3591,
      maxLat: 55.0574,
      minLon: 7.8685,
      maxLon: 11.3132,
    },
    padding: {
      top: 23,
      bottom: 20,
      left: 8.5,
      right: 5.5,
    },
  },
  nib: {
    bounds: {
      minLat: 51.2954,
      maxLat: 53.8942,
      minLon: 6.6546,
      maxLon: 11.5977,
    },
    padding: {
      top: 22.1,
      bottom: 19.4,
      left: 5.5,
      right: 5.5,
    },
  },
  sac: {
    bounds: {
      minLat: 50.1715,
      maxLat: 51.6831,
      minLon: 11.8723,
      maxLon: 15.0377,
    },
    padding: {
      top: 27.8,
      bottom: 21.2,
      left: 5.8,
      right: 4.9,
    },
  },
  saa: {
    bounds: {
      minLat: 50.938,
      maxLat: 53.0421,
      minLon: 10.5615,
      maxLon: 13.1866,
    },
    padding: {
      top: 12.8,
      bottom: 10.7,
      left: 10.5,
      right: 10.6,
    },
  },
  thu: {
    bounds: {
      minLat: 50.2042,
      maxLat: 51.6491,
      minLon: 9.8778,
      maxLon: 12.6532,
    },
    padding: {
      top: 25.5,
      bottom: 22.0,
      left: 8.2,
      right: 7.8,
    },
  },
  bay: {
    bounds: {
      minLat: 47.2704,
      maxLat: 50.5645,
      minLon: 8.9772,
      maxLon: 13.835,
    },
    padding: {
      top: 11.4,
      bottom: 12.8,
      left: 4,
      right: 3,
    },
  },
  rps: {
    bounds: {
      minLat: 48.9663,
      maxLat: 50.9404,
      minLon: 6.1174,
      maxLon: 8.5085,
    },
    padding: {
      top: 10.9,
      bottom: 14.8,
      left: 10.5,
      right: 14.8,
    },
  },
  bbb: {
    bounds: {
      minLat: 51.3607,
      maxLat: 53.558,
      minLon: 11.2682,
      maxLon: 14.7647,
    },
    padding: {
      top: 16,
      bottom: 17.2,
      left: 5,
      right: 6.5,
    },
  },
  mvp: {
    bounds: {
      minLat: 53.1159,
      maxLat: 54.685,
      minLon: 10.5932,
      maxLon: 14.4123,
    },
    padding: {
      top: 27.8,
      bottom: 30.0,
      left: 6.5,
      right: 8.5,
    },
  },
  baw: {
    bounds: {
      minLat: 47.5338,
      maxLat: 49.7914,
      minLon: 7.5114,
      maxLon: 10.4918,
    },
    padding: {
      top: 11.4,
      bottom: 11.8,
      left: 8.8,
      right: 7,
    },
  },
  de: {
    bounds: {
      minLat: 47.2,
      maxLat: 55.1,
      minLon: 5.8,
      maxLon: 15.1,
    },
    padding: {
      top: 8.8,
      bottom: 2,
      left: 5.2,
      right: 7.0,
    },
  },
};
