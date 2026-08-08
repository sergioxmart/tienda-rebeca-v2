import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import { api } from '../api.js';

const DEFAULT_CENTER = [4.711, -74.0721];

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

function validPoint(value) {
  const lat = Number(value?.lat);
  const lon = Number(value?.lon);
  return Number.isFinite(lat) && lat >= -90 && lat <= 90
    && Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

export default function DeliveryLocationPicker({ address, city, value, onChange }) {
  const mapElement = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [geocoding, setGeocoding] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState('');

  const setPoint = (lat, lon, source = 'manual') => {
    const map = mapRef.current;
    if (!map) return;
    const point = [Number(lat), Number(lon)];
    if (!markerRef.current) {
      markerRef.current = L.marker(point, { draggable: true }).addTo(map);
      markerRef.current.on('dragend', () => {
        const position = markerRef.current.getLatLng();
        onChange({ lat: position.lat, lon: position.lng, source: 'drag' });
        setMessage('Pin ajustado manualmente.');
      });
    } else {
      markerRef.current.setLatLng(point);
    }
    map.setView(point, Math.max(map.getZoom(), 16), { animate: true });
    onChange({ lat: point[0], lon: point[1], source });
  };

  useEffect(() => {
    if (!mapElement.current || mapRef.current) return undefined;
    const initial = validPoint(value) ? [Number(value.lat), Number(value.lon)] : DEFAULT_CENTER;
    const map = L.map(mapElement.current, { scrollWheelZoom: true }).setView(initial, validPoint(value) ? 16 : 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    map.on('click', (event) => setPoint(event.latlng.lat, event.latlng.lng, 'map'));
    mapRef.current = map;
    if (validPoint(value)) setPoint(value.lat, value.lon, value.source || 'restored');
    window.setTimeout(() => map.invalidateSize(), 0);
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // El mapa se inicializa una sola vez; los cambios del punto se manejan
    // desde el efecto siguiente para no reconstruir los tiles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !validPoint(value)) return;
    const point = [Number(value.lat), Number(value.lon)];
    if (!markerRef.current) {
      markerRef.current = L.marker(point, { draggable: true }).addTo(mapRef.current);
      markerRef.current.on('dragend', () => {
        const position = markerRef.current.getLatLng();
        onChange({ lat: position.lat, lon: position.lng, source: 'drag' });
      });
    } else {
      markerRef.current.setLatLng(point);
    }
    mapRef.current.setView(point, Math.max(mapRef.current.getZoom(), 16));
  }, [value, onChange]);

  const locateAddress = async () => {
    if (!address?.trim()) {
      setMessage('Escribe primero la dirección.');
      return;
    }
    setGeocoding(true);
    setMessage('Buscando la dirección…');
    try {
      const point = await api.geocodeAddress(address, city);
      if (!point) {
        setMessage('No encontramos esa dirección. Puedes ubicar el pin manualmente.');
        return;
      }
      setPoint(point.lat, point.lon, 'address');
      setMessage('Dirección ubicada. Puedes arrastrar el pin hasta la entrada exacta.');
    } catch {
      setMessage('No pudimos ubicar la dirección. Puedes mover el pin manualmente.');
    } finally {
      setGeocoding(false);
    }
  };

  const locateCurrentPosition = () => {
    if (!navigator.geolocation) {
      setMessage('Tu navegador no permite obtener la ubicación actual.');
      return;
    }
    setLocating(true);
    setMessage('Solicitando tu ubicación…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPoint(coords.latitude, coords.longitude, 'browser');
        setMessage('Ubicación actual capturada. Puedes ajustar el pin.');
        setLocating(false);
      },
      () => {
        setMessage('No pudimos obtener tu ubicación. Revisa el permiso del navegador.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  return (
    <div className="delivery-location-picker">
      <div className="delivery-location-heading">
        <div>
          <strong>Ubicación exacta de entrega <span>(opcional)</span></strong>
          <p>Ayuda al repartidor a encontrar la entrada del conjunto o edificio.</p>
        </div>
        <span className="delivery-location-pin" aria-hidden="true">⌖</span>
      </div>
      <div className="delivery-location-actions">
        <button type="button" className="btn" onClick={locateCurrentPosition} disabled={locating}>
          {locating ? 'Ubicando…' : 'Usar mi ubicación'}
        </button>
        <button type="button" className="btn" onClick={locateAddress} disabled={geocoding}>
          {geocoding ? 'Buscando…' : 'Ubicar dirección'}
        </button>
      </div>
      <div className="delivery-location-map-wrap">
        <div ref={mapElement} className="delivery-location-map" aria-label="Mapa para seleccionar la ubicación de entrega" />
        {!validPoint(value) && <div className="delivery-location-map-hint">Haz clic en el mapa o usa uno de los botones para colocar el pin.</div>}
      </div>
      {message && <p className="delivery-location-message" role="status">{message}</p>}
      {validPoint(value) && <small className="delivery-location-coordinates">Pin: {Number(value.lat).toFixed(6)}, {Number(value.lon).toFixed(6)}</small>}
    </div>
  );
}
