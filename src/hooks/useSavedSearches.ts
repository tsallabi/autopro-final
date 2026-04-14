import { useState, useEffect } from 'react';

export interface SavedSearch {
  id: string;
  name: string;
  filters: Record<string, any>;
  createdAt: string;
  lastResultCount?: number;
}

const STORAGE_KEY = 'autopro_saved_searches';

export function useSavedSearches() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSearches(JSON.parse(raw));
    } catch {}
  }, []);

  const save = (name: string, filters: Record<string, any>) => {
    const newSearch: SavedSearch = {
      id: `search-${Date.now()}`,
      name,
      filters,
      createdAt: new Date().toISOString(),
    };
    setSearches((prev) => {
      const updated = [newSearch, ...prev].slice(0, 20);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
    return newSearch;
  };

  const remove = (id: string) => {
    setSearches((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  return { searches, save, remove };
}
