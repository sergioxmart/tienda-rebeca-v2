import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

const CustomerContext = createContext(null);

export function CustomerProvider({ children }) {
  const [customer, setCustomer] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const result = await api.customerMe();
      setCustomer(result.customer);
      setAddresses(result.addresses || []);
      return result;
    } catch {
      setCustomer(null);
      setAddresses([]);
      return { customer: null, addresses: [] };
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback((result) => {
    setCustomer(result.customer || null);
    setAddresses(result.addresses || []);
  }, []);

  const logout = useCallback(async () => {
    try { await api.customerLogout(); }
    finally {
      setCustomer(null);
      setAddresses([]);
    }
  }, []);

  const value = useMemo(() => ({
    customer, addresses, loading, refresh, login, logout, setAddresses,
  }), [customer, addresses, loading, refresh, login, logout]);

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}

export function useCustomer() {
  const context = useContext(CustomerContext);
  if (!context) throw new Error('useCustomer debe usarse dentro de CustomerProvider');
  return context;
}
