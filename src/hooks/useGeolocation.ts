import { useCallback, useState } from 'react';

type Coords = { lat: number; lng: number };

export function useGeolocation(options?: PositionOptions) {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setError('المتصفح لا يدعم تحديد الموقع');
      return;
    }
    setLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setError(null);
        setLoading(false);
      },
      (err) => {
        let msg = 'فشل تحديد الموقع';
        if (err.code === 1) msg = 'يرجى السماح بالوصول للموقع';
        if (err.code === 2) msg = 'لا يمكن تحديد الموقع حالياً';
        if (err.code === 3) msg = 'انتهت مهلة تحديد الموقع';
        setError(msg);
        setLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000, ...options },
    );
  }, [options]);

  return { coords, error, loading, requestLocation };
}

export default useGeolocation;
