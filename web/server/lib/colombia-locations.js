// Catálogo de departamentos y municipios para los formularios de envío.
// Se intenta refrescar desde API Colombia y se conserva un fallback local con
// las capitales y principales municipios para que el checkout no quede roto si
// el proveedor externo no está disponible.

const SOURCE_DEPARTMENTS = 'https://api-colombia.com/api/v1/Department';
const SOURCE_CITIES = 'https://api-colombia.com/api/v1/City';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cached = null;

const FALLBACK = [
  ['Amazonas', 'Leticia'], ['Antioquia', 'Medellín, Bello, Envigado, Itagüí, Rionegro, Apartadó'],
  ['Arauca', 'Arauca, Arauquita, Saravena, Tame'], ['Atlántico', 'Barranquilla, Soledad, Malambo, Sabanalarga, Puerto Colombia'],
  ['Bogotá D.C.', 'Bogotá'], ['Bolívar', 'Cartagena, Magangué, Turbaco, El Carmen de Bolívar, Santa Cruz de Mompox'],
  ['Boyacá', 'Tunja, Duitama, Sogamoso, Chiquinquirá, Paipa'], ['Caldas', 'Manizales, Chinchiná, La Dorada, Villamaría'],
  ['Caquetá', 'Florencia, San Vicente del Caguán'], ['Casanare', 'Yopal, Aguazul, Villanueva, Tauramena, Orocué'],
  ['Cauca', 'Popayán, Santander de Quilichao, Puerto Tejada, Patía'], ['Cesar', 'Valledupar, Aguachica, Agustín Codazzi, Bosconia'],
  ['Chocó', 'Quibdó, Istmina, Tadó, Condoto'], ['Córdoba', 'Montería, Cereté, Lorica, Sahagún, Montelíbano'],
  ['Cundinamarca', 'Soacha, Fusagasugá, Girardot, Zipaquirá, Chía, Facatativá, Cajicá'], ['Guainía', 'Inírida'],
  ['Guaviare', 'San José del Guaviare'], ['Huila', 'Neiva, Pitalito, Garzón, La Plata'],
  ['La Guajira', 'Riohacha, Maicao, Uribia, Fonseca, San Juan del Cesar'], ['Magdalena', 'Santa Marta, Ciénaga, Fundación, Plato'],
  ['Meta', 'Villavicencio, Acacías, Granada, Puerto López'], ['Nariño', 'Pasto, Tumaco, Ipiales, Túquerres'],
  ['Norte de Santander', 'Cúcuta, Ocaña, Villa del Rosario, Pamplona, Los Patios'], ['Putumayo', 'Mocoa, Puerto Asís, Orito, Villagarzón'],
  ['Quindío', 'Armenia, Calarcá, Montenegro, La Tebaida'], ['Risaralda', 'Pereira, Dosquebradas, Santa Rosa de Cabal, La Virginia'],
  ['San Andrés y Providencia', 'San Andrés, Providencia'], ['Santander', 'Bucaramanga, Floridablanca, Girón, Piedecuesta, Barrancabermeja, San Gil'],
  ['Sucre', 'Sincelejo, Corozal, Sincé, Santiago de Tolú'], ['Tolima', 'Ibagué, Espinal, Melgar, Honda, Mariquita'],
  ['Valle del Cauca', 'Cali, Buenaventura, Palmira, Buga, Tuluá, Cartago, Jamundí, Yumbo'], ['Vaupés', 'Mitú'],
  ['Vichada', 'Puerto Carreño, Cumaribo'],
];

function clean(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeCity(value) {
  const name = clean(value?.name || value?.Name || value?.municipality || value?.Municipality || value);
  return name ? { name } : null;
}

function normalizeDepartment(value) {
  const name = clean(value?.name || value?.Name || value?.department || value?.Department);
  if (!name) return null;
  const rawCitiesCandidate = value?.cities || value?.Cities || value?.municipalities || value?.Municipalities || [];
  const rawCities = Array.isArray(rawCitiesCandidate) ? rawCitiesCandidate : [];
  const cities = rawCities.map(normalizeCity).filter(Boolean);
  return { name, cities };
}

function fallbackLocations() {
  return FALLBACK.map(([name, cities]) => ({
    name,
    cities: cities.split(',').map((city) => ({ name: city.trim() })),
  }));
}

function mergeLocations(departments, cities) {
  const byId = new Map();
  for (const department of departments) {
    const normalized = normalizeDepartment(department);
    if (normalized) byId.set(String(department.id || department.Id || normalized.name).toLowerCase(), normalized);
  }
  const byName = new Map([...byId.values()].map((department) => [department.name.toLowerCase(), department]));
  for (const city of cities) {
    const departmentName = clean(city?.department?.name || city?.Department?.name || city?.departmentName || city?.DepartmentName);
    const departmentId = String(city?.departmentId || city?.DepartmentId || city?.department?.id || city?.Department?.id || '').toLowerCase();
    const target = byId.get(departmentId) || byName.get(departmentName.toLowerCase());
    const normalized = normalizeCity(city);
    if (target && normalized) target.cities.push(normalized);
  }
  return [...byId.values()];
}

async function fetchLocations() {
  try {
    const [departmentResponse, cityResponse] = await Promise.all([
      fetch(SOURCE_DEPARTMENTS, { signal: AbortSignal.timeout(5000) }),
      fetch(SOURCE_CITIES, { signal: AbortSignal.timeout(5000) }),
    ]);
    if (!departmentResponse.ok || !cityResponse.ok) throw new Error('locations_source_unavailable');
    const departments = await departmentResponse.json();
    const cities = await cityResponse.json();
    const result = mergeLocations(Array.isArray(departments) ? departments : [], Array.isArray(cities) ? cities : []);
    if (result.length > 0) return result;
  } catch {
    // Fallback local para que el checkout siga operativo sin Internet.
  }
  return fallbackLocations();
}

export async function getColombiaLocations() {
  if (!cached || cached.expiresAt <= Date.now()) {
    cached = { value: await fetchLocations(), expiresAt: Date.now() + CACHE_TTL_MS };
  }
  return cached.value;
}
