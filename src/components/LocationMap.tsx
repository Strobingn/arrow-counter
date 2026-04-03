import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import { Icon } from 'leaflet';
import { Geolocation } from '@capacitor/geolocation';
import type { Location, ArrowSession } from '@/types';
import 'leaflet/dist/leaflet.css';

// Fix default icon issue in Leaflet with bundlers
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// @ts-ignore
delete Icon.Default.prototype._getIconUrl;
Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface LocationMapProps {
  mode: 'picker' | 'viewer';
  sessions?: ArrowSession[];
  initialLocation?: Location;
  onLocationSelect?: (loc: Location) => void;
  height?: string;
}

function LocationPicker({ onSelect }: { onSelect: (loc: Location) => void }) {
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);

  useMapEvents({
    click(e) {
      setPosition(e.latlng);
      onSelect({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });

  return position ? <Marker position={position} /> : null;
}

export function LocationMap({
  mode,
  sessions = [],
  initialLocation,
  onLocationSelect,
  height = '300px',
}: LocationMapProps) {
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    Geolocation.getCurrentPosition({ enableHighAccuracy: false })
      .then((pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      })
      .catch(() => {
        // ignore error
      });
  }, []);

  const defaultCenter = useMemo(() => {
    if (initialLocation) return [initialLocation.lat, initialLocation.lng] as [number, number];
    if (userLocation) return [userLocation.lat, userLocation.lng] as [number, number];
    if (sessions.length > 0 && sessions[0].location) {
      return [sessions[0].location.lat, sessions[0].location.lng] as [number, number];
    }
    return [39.8283, -98.5795] as [number, number]; // Center of US
  }, [initialLocation, userLocation, sessions]);

  const groupedByLocation = useMemo(() => {
    const map = new Map<string, ArrowSession[]>();
    sessions.forEach((s) => {
      if (!s.location) return;
      const key = `${s.location.lat.toFixed(4)},${s.location.lng.toFixed(4)}`;
      const existing = map.get(key) || [];
      existing.push(s);
      map.set(key, existing);
    });
    return Array.from(map.entries()).map(([key, sess]) => ({
      key,
      lat: sess[0].location!.lat,
      lng: sess[0].location!.lng,
      sessions: sess,
      totalArrows: sess.reduce((sum, s) => sum + s.arrowCount, 0),
    }));
  }, [sessions]);

  return (
    <MapContainer
      center={defaultCenter}
      zoom={13}
      scrollWheelZoom={false}
      style={{ height, width: '100%', borderRadius: '0.75rem', zIndex: 1 }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {mode === 'picker' && onLocationSelect && (
        <LocationPicker onSelect={onLocationSelect} />
      )}
      {mode === 'viewer' &&
        groupedByLocation.map((group) => (
          <Marker key={group.key} position={[group.lat, group.lng]}>
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{group.totalArrows} arrows</p>
                <p className="text-muted-foreground">{group.sessions.length} session(s)</p>
                {group.sessions[0].location?.name && (
                  <p className="text-muted-foreground">{group.sessions[0].location.name}</p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
    </MapContainer>
  );
}
