// Slot del logo + nombre. Si site_config tiene logo_url lo muestra; si no hay,
// o si el archivo falla, cae al recuadro con la inicial. Mismo comportamiento
// que el login: nunca un ícono roto.

import { useEffect, useState } from 'react';

export default function Brand() {
  const [site, setSite] = useState(null);
  const [logoBroken, setLogoBroken] = useState(false);

  useEffect(() => {
    fetch('/api/public/site-config')
      .then((r) => r.json())
      .then((d) => { if (d.ok) setSite(d.data); })
      .catch(() => {});
  }, []);

  const logo = site?.logo_url;
  const name = site?.site_name || 'Rebeca Andrade';
  const showLogo = logo && !logoBroken;

  return (
    <div className="brand">
      {showLogo ? (
        <img
          src={logo}
          alt={name}
          className="brand-logo"
          onError={() => setLogoBroken(true)}
        />
      ) : (
        <div className="brand-mark">{name[0]?.toUpperCase() || 'R'}</div>
      )}
      <span className="brand-name">{name}</span>
    </div>
  );
}
