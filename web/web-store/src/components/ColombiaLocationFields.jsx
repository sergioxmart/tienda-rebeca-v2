import React, { useMemo } from 'react';
import { useColombiaLocations } from '../locations/ColombiaLocationsContext.jsx';

export default function ColombiaLocationFields({ department, city, onChange, compact = false }) {
  const { departments, loading } = useColombiaLocations();
  const selected = useMemo(
    () => departments.find((item) => item.name === department),
    [departments, department],
  );
  const cities = selected?.cities || [];

  return (
    <div className={`form-row colombia-location-fields ${compact ? 'is-compact' : ''}`}>
      <div className="form-group">
        <label>Departamento *</label>
        <select
          className="input"
          required
          value={department || ''}
          onChange={(event) => onChange({ department: event.target.value, city: '' })}
          disabled={loading}
        >
          <option value="">{loading ? 'Cargando departamentos…' : 'Selecciona un departamento'}</option>
          {departments.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label>Ciudad / municipio *</label>
        <select
          className="input"
          required
          value={city || ''}
          onChange={(event) => onChange({ department, city: event.target.value })}
          disabled={loading || !department || cities.length === 0}
        >
          <option value="">{!department ? 'Selecciona primero el departamento' : 'Selecciona una ciudad'}</option>
          {cities.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
        </select>
      </div>
    </div>
  );
}

