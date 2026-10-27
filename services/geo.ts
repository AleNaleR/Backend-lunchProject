// ระยะทางเส้นตรง (Haversine) หน่วย กม. ต้องส่งพารามิเตอร์ [lat, lat, lng] ตามลำดับ
export const DISTANCE_KM_SQL = (latCol: string, lngCol: string) => `
  (6371 * 2 * ASIN(SQRT(
    POWER(SIN(RADIANS(${latCol} - ?) / 2), 2) +
    COS(RADIANS(?)) * COS(RADIANS(${latCol})) *
    POWER(SIN(RADIANS(${lngCol} - ?) / 2), 2)
  )))`;

export function parseNearby(q: any, defaultRadius: number) {
  const lat = Number(q.lat);
  const lng = Number(q.lng);
  const radius = q.radius === undefined ? defaultRadius : Number(q.radius);
  
  if (q.lat === undefined || q.lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng))
    return "lat and lng are required numbers";
  if (!Number.isFinite(radius) || radius <= 0)
    return "radius must be a positive number (km)";

  return { lat, lng, radius };
}

