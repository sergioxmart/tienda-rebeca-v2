import { json } from '../../lib/json.js';
import { getColombiaLocations } from '../../lib/colombia-locations.js';

export async function listColombiaLocations(req, res) {
  const departments = await getColombiaLocations();
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return json(res, 200, { ok: true, country: 'CO', departments });
}

