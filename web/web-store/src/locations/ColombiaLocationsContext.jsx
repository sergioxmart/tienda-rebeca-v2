import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const ColombiaLocationsContext = createContext(null);

export function ColombiaLocationsProvider({ children }) {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.colombiaLocations()
      .then((items) => setDepartments(Array.isArray(items) ? items : []))
      .catch(() => setDepartments([]))
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({ departments, loading }), [departments, loading]);
  return <ColombiaLocationsContext.Provider value={value}>{children}</ColombiaLocationsContext.Provider>;
}

export function useColombiaLocations() {
  const context = useContext(ColombiaLocationsContext);
  if (!context) throw new Error('useColombiaLocations debe usarse dentro de ColombiaLocationsProvider');
  return context;
}

