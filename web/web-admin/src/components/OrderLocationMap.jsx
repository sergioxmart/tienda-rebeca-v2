import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function createDeliveryPinIcon() {
  return L.divIcon({
    className: 'leaflet-delivery-pin',
    html: `<svg width="40" height="52" viewBox="0 0 40 52" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M20 50S4 31.8 4 20a16 16 0 1 1 32 0c0 11.8-16 30-16 30Z" fill="#ff6b35" stroke="#fff" stroke-width="2.5"/>
      <circle cx="20" cy="20" r="6" fill="#fff"/>
      <circle cx="20" cy="20" r="3" fill="#0f2a47"/>
    </svg>`,
    iconSize: [40, 52],
    iconAnchor: [20, 50],
    popupAnchor: [0, -46],
  });
}

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
    L.marker([lat, lon], { icon: createDeliveryPinIcon() }).addTo(map).bindPopup(`Entrega ${orderNumber || ''}`).openPopup();
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => map.remove();
  }, [location?.lat, location?.lon, orderNumber]);

  return <div ref={mapElement} className="order-detail-map" aria-label={`Mapa de entrega del pedido ${orderNumber || ''}`} />;
}
