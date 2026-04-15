import { useState, useEffect, useCallback } from 'react';

export type AlertFrequency = 'instant' | 'daily' | 'weekly';

export interface SavedSearch {
  id: string;
  name: string;
  filters: Record<string, any>;
  createdAt: string;
  lastResultCount?: number;
  emailAlerts?: boolean;
  alertFrequency?: AlertFrequency;
}

const STORAGE_KEY = 'autopro_saved_searches';
const MIGRATED_FLAG = 'autopro_saved_searches_migrated';

function readLocal(): SavedSearch[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocal(list: SavedSearch[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch {}
}

function getAuthHeaders(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

export function useSavedSearches() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(false);
  const [isServerBacked, setIsServerBacked] = useState(false);

  const refresh = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    if (!token) {
      // Fall back to localStorage when the user is not logged in
      setSearches(readLocal());
      setIsServerBacked(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/saved-searches', { headers: getAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const serverList: SavedSearch[] = await res.json();

      // One-time migration: push existing localStorage searches up to the server
      try {
        const migrated = localStorage.getItem(MIGRATED_FLAG);
        if (!migrated) {
          const local = readLocal();
          if (local.length > 0) {
            for (const s of local) {
              await fetch('/api/saved-searches', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                  name: s.name,
                  filters: s.filters || {},
                  emailAlerts: true,
                  alertFrequency: 'instant',
                }),
              }).catch(() => {});
            }
            localStorage.setItem(MIGRATED_FLAG, '1');
            const res2 = await fetch('/api/saved-searches', { headers: getAuthHeaders() });
            if (res2.ok) {
              setSearches(await res2.json());
              setIsServerBacked(true);
              return;
            }
          } else {
            localStorage.setItem(MIGRATED_FLAG, '1');
          }
        }
      } catch {}

      setSearches(serverList);
      setIsServerBacked(true);
    } catch {
      // Server unreachable — gracefully fall back to local storage
      setSearches(readLocal());
      setIsServerBacked(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const save = useCallback(async (
    name: string,
    filters: Record<string, any>,
    opts?: { emailAlerts?: boolean; alertFrequency?: AlertFrequency }
  ): Promise<SavedSearch> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    const emailAlerts = opts?.emailAlerts !== false;
    const alertFrequency: AlertFrequency = opts?.alertFrequency || 'instant';

    if (token) {
      try {
        const res = await fetch('/api/saved-searches', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ name, filters, emailAlerts, alertFrequency }),
        });
        if (res.ok) {
          const created: SavedSearch = await res.json();
          setSearches(prev => [created, ...prev]);
          setIsServerBacked(true);
          return created;
        }
      } catch {}
    }

    // Fallback: localStorage-only
    const newSearch: SavedSearch = {
      id: `search-${Date.now()}`,
      name,
      filters,
      createdAt: new Date().toISOString(),
      emailAlerts,
      alertFrequency,
    };
    setSearches(prev => {
      const updated = [newSearch, ...prev].slice(0, 20);
      writeLocal(updated);
      return updated;
    });
    setIsServerBacked(false);
    return newSearch;
  }, []);

  const update = useCallback(async (
    id: string,
    patch: Partial<Pick<SavedSearch, 'name' | 'filters' | 'emailAlerts' | 'alertFrequency'>>
  ) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    if (token && isServerBacked) {
      try {
        await fetch(`/api/saved-searches/${id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify(patch),
        });
      } catch {}
    }
    setSearches(prev => {
      const updated = prev.map(s => s.id === id ? { ...s, ...patch } : s);
      if (!isServerBacked) writeLocal(updated);
      return updated;
    });
  }, [isServerBacked]);

  const remove = useCallback(async (id: string) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
    if (token && isServerBacked) {
      try {
        await fetch(`/api/saved-searches/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
      } catch {}
    }
    setSearches(prev => {
      const updated = prev.filter(s => s.id !== id);
      if (!isServerBacked) writeLocal(updated);
      return updated;
    });
  }, [isServerBacked]);

  return { searches, save, update, remove, refresh, loading, isServerBacked };
}
