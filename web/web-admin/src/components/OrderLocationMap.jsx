import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export default function OrderLocationMap({ location, orderNumber }) {
  const mapElement = useRef(null);

  useEffect(() => {
    const lat = Number(location?.lat);
    const lon = Number(location?.lon);
    if (!mapElement.current || !Number.isFinite(lat) || !Number.isFinite(lon)) return undefined;

    const map = L.map(mapElement.current, { scrollWheelZoom: true }).setView([lat, lon], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    L.marker([lat, lon]).addTo(map).bindPopup(`Entrega ${orderNumber || ''}`).openPopup();
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => map.remove();
  }, [location?.lat, location?.lon, orderNumber]);

  return <div ref={mapElement} className="order-detail-map" aria-label={`Mapa de entrega del pedido ${orderNumber || ''}`} />;
}
