import React, { createContext, useContext, useState, useEffect } from 'react';
import { Car, FeeEstimate, User, BranchConfig, Message, Notification, MarketEstimate } from '../types';
import { mockCars } from '../data';
import { io, Socket } from 'socket.io-client';
import { AlertModal } from '../components/AlertModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { ToastContainer, useToast } from '../components/ToastNotification';

interface StoreContextType {
  cars: Car[];
  addCar: (car: Car) => void;
  updateCar: (id: string, updates: Partial<Car>) => void;
  deleteCar: (id: string) => void;
  placeBid: (carId: string, amount: number, userId: string) => void;
  stats: {
    totalSales: number;
    activeAuctions: number;
    totalUsers: number;
  };
  users: User[];
  setUsers: (users: User[]) => void;
  addUser: (user: User) => void;
  currentUser: User | null;
  setCurrentUser: (user: User | null) => void;
  csvData: any[];
  setCsvData: (data: any[]) => void;
  socket: Socket | null;
  showAlert: (message: string, type?: 'error' | 'success' | 'info') => void;
  showConfirm: (message: string, onConfirm: () => void, title?: string) => void;
  toggleWatchlist: (carId: string) => void;
  watchlist: any[];
  branchConfig: BranchConfig | null;
  setBranchConfig: (config: BranchConfig) => void;
  notifications: Notification[];
  messages: Message[];
  unreadCounts: { messages: number; notifications: number };
  fetchUnreadCounts: () => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  markMessageAsRead: (id: string) => void;
  sendMessage: (data: { receiverId: string; subject: string; content: string; category: string }) => Promise<void>;
  marketEstimates: MarketEstimate[];
  fetchMarketEstimates: () => Promise<void>;
  addMarketEstimate: (estimate: Omit<MarketEstimate, 'id'>) => Promise<boolean>;
  updateMarketEstimate: (id: number, estimate: Partial<MarketEstimate>) => Promise<boolean>;
  deleteMarketEstimate: (id: number) => Promise<boolean>;
  exchangeRate: number;
  updateExchangeRate: (rate: number) => Promise<boolean>;
}

// Authenticated fetch helper — injects JWT token from localStorage
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('authToken');
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  }
  const res = await fetch(url, { ...options, headers });
  // Auto-logout on expired token (401)
  if (res.status === 401 && token) {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    window.location.href = '/auth';
  }
  return res;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cars, setCars] = useState<Car[]>([]);
  const [currentUser, setCurrentUserState] = useState<User | null>(() => {
    const saved = localStorage.getItem('currentUser');
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved);
      // Reject if it's an error object or missing required fields
      if (parsed.error || !parsed.id || !parsed.role) return null;
      return parsed;
    } catch { return null; }
  });
  const setCurrentUser = (user: User | null) => {
    if (user && (user as any).error) return; // Never store error responses
    setCurrentUserState(user);
    if (user) localStorage.setItem('currentUser', JSON.stringify(user));
    else localStorage.removeItem('currentUser');
  };
  const [socket, setSocket] = useState<Socket | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; message: string; type: 'error' | 'success' | 'info' }>({
    isOpen: false,
    message: '',
    type: 'error'
  });

  const [confirmConfig, setConfirmConfig] = useState<{ isOpen: boolean; message: string; title?: string; onConfirm: () => void }>({
    isOpen: false,
    message: '',
    onConfirm: () => { }
  });

  const [watchlist, setWatchlist] = useState<any[]>([]);
  const [branchConfig, setBranchConfig] = useState<BranchConfig | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCounts, setUnreadCounts] = useState({ messages: 0, notifications: 0 });
  const [marketEstimates, setMarketEstimates] = useState<MarketEstimate[]>([]);
  const [exchangeRate, setExchangeRate] = useState<number>(7.0);

  const showAlert = (message: string, type: 'error' | 'success' | 'info' = 'error') => {
    setAlertConfig({ isOpen: true, message, type });
    // Auto-dismiss after 5 seconds to prevent blocking the UI
    setTimeout(() => setAlertConfig(prev => prev.isOpen ? { ...prev, isOpen: false } : prev), 5000);
  };

  const showConfirm = (message: string, onConfirm: () => void, title?: string) => {
    setConfirmConfig({ isOpen: true, message, title, onConfirm });
  };

  const { toasts, removeToast, toast } = useToast();


  const closeAlert = () => {
    setAlertConfig(prev => ({ ...prev, isOpen: false }));
  };

  // Initialize Socket
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const newSocket = io(window.location.origin, {
      auth: { token: token || undefined },
    });
    setSocket(newSocket);

    newSocket.on('global_bid_update', ({ carId, currentBid }) => {
      setCars(prev => prev.map(car => car.id === carId ? { ...car, currentBid } : car));
    });

    newSocket.on('auction_started', ({ carId }) => {
      setCars(prev => prev.map(car => car.id === carId ? { ...car, status: 'live' } : car));
    });

    newSocket.on('car_updated', (updates) => {
      if (!updates.id) return;
      setCars(prev => prev.map(car => car.id === updates.id ? { ...car, ...updates } : car));
    });

    newSocket.on('auction_closed', ({ carId, winnerId }) => {
      setCars(prev => prev.map(car => {
        if (car.id === carId) {
          // If there is no winner, the car automatically moves to the offer market
          return { ...car, status: winnerId ? 'closed' : 'offer_market', winnerId };
        }
        return car;
      }));
    });

    newSocket.on('bid_error', ({ message }) => {
      showAlert(message, 'error');
    });

    newSocket.on('new_message', (message: Message) => {
      setMessages(prev => [message, ...prev]);
      setUnreadCounts(prev => ({ ...prev, messages: prev.messages + 1 }));
    });

    newSocket.on('new_notification', (notif: Notification) => {
      setNotifications(prev => [notif, ...prev]);
      setUnreadCounts(prev => ({ ...prev, notifications: prev.notifications + 1 }));

      // Play a short notification sound (like a phone text tone)
      try {
        const tone = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
        tone.volume = 0.5;
        tone.play().catch(e => console.log('Audio autoplay blocked', e));
      } catch (e) { }

      // Show elegant toast instead of blocking modal
      const toastType = notif.type === 'success' ? 'success'
        : notif.type === 'alert' ? 'error'
          : notif.type === 'bid' ? 'bid'
            : 'info';
      toast[toastType](notif.title, notif.message);
    });


    newSocket.on('user_update', (data) => {
      setCurrentUser(prev => {
        if (prev && prev.id === data.id) {
          const updated = { ...prev, ...data };
          localStorage.setItem('currentUser', JSON.stringify(updated));
          return updated;
        }
        return prev;
      });
    });

    // Handle live auction audio
    newSocket.on('play_audio', (data) => {
      if ('speechSynthesis' in window) {
        const msg = new SpeechSynthesisUtterance(data.text);
        msg.lang = 'ar-SA';
        msg.rate = 1.1; // Slightly faster for auction energy
        msg.pitch = 1.2; // Higher pitch for excitement
        window.speechSynthesis.speak(msg);
      }
    });

    return () => {
      newSocket.close();
    };
  }, []);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/cars');
        const data = await res.json();
        setCars(data.length > 0 ? data : mockCars);
      } catch (e) {
        setCars(mockCars);
      }

      try {
        const res = await authFetch('/api/users');
        if (res.ok) {
          const data = await res.json();
          setUsers(Array.isArray(data) ? data : []);
        }
      } catch (e) {
        console.error("Failed to fetch users", e);
      }
      try {
        const hostname = window.location.hostname;
        let branchId = 'main';
        if (hostname.includes('ly.')) branchId = 'ly';
        else if (hostname.includes('eg.')) branchId = 'eg';
        else if (hostname.includes('ae.')) branchId = 'ae';
        else if (hostname.includes('sa.')) branchId = 'sa';

        const res = await fetch(`/api/config?branch=${branchId}`);
        if (res.ok) {
          const config = await res.json();
          setBranchConfig(config);
        }
      } catch (e) {
        console.error("Failed to fetch branch config", e);
      }

      try {
        const res = await authFetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (data.usd_lyd_rate) setExchangeRate(Number(data.usd_lyd_rate));
        }
      } catch (e) {
        console.error("Failed to fetch settings", e);
      }
    };

    fetchData();
    fetchMarketEstimates();
  }, []);

  const fetchMarketEstimates = async () => {
    try {
      const res = await authFetch('/api/admin/market-estimates');
      if (res.ok) {
        const data = await res.json();
        setMarketEstimates(Array.isArray(data) ? data : []);
      }
    } catch (e) { console.error('Failed to fetch market estimates', e); }
  };

  const addMarketEstimate = async (estimate: Omit<MarketEstimate, 'id'>) => {
    try {
      const res = await authFetch('/api/admin/market-estimates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(estimate)
      });
      if (res.ok) {
        await fetchMarketEstimates();
        return true;
      }
    } catch (e) { console.error(e); }
    return false;
  };

  const updateExchangeRate = async (rate: number) => {
    try {
      const res = await authFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usd_lyd_rate: rate })
      });
      if (res.ok) {
        setExchangeRate(rate);
        return true;
      }
    } catch (e) { console.error("Failed to update exchange rate", e); }
    return false;
  };

  const updateMarketEstimate = async (id: number, estimate: Partial<MarketEstimate>) => {
    try {
      const res = await authFetch(`/api/admin/market-estimates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(estimate)
      });
      if (res.ok) {
        await fetchMarketEstimates();
        return true;
      }
    } catch (e) { console.error(e); }
    return false;
  };

  const deleteMarketEstimate = async (id: number) => {
    try {
      const res = await authFetch(`/api/admin/market-estimates/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setMarketEstimates(prev => prev.filter(e => e.id !== id));
        return true;
      }
    } catch (e) { console.error(e); }
    return false;
  };

  // Removed buggy useEffect that synced currentUser with stale users array

  useEffect(() => {
    if (branchConfig) {
      document.title = `${branchConfig.name} | ${branchConfig.englishName} - منصة المزادات الأقوى`;
    }
  }, [branchConfig]);

  // Fetch watchlist and unread counts when user changes
  useEffect(() => {
    if (currentUser) {
      authFetch(`/api/watchlist/user/${currentUser.id}`)
        .then(res => res.ok ? res.json() : [])
        .then(data => setWatchlist(Array.isArray(data) ? data : []))
        .catch(() => setWatchlist([]));

      fetchUnreadCounts();

      authFetch(`/api/notifications/${currentUser.id}`)
        .then(res => res.ok ? res.json() : [])
        .then(data => setNotifications(Array.isArray(data) ? data : []))
        .catch(() => setNotifications([]));

      authFetch(`/api/messages/user/${currentUser.id}`)
        .then(res => res.ok ? res.json() : [])
        .then(data => setMessages(Array.isArray(data) ? data : []))
        .catch(() => setMessages([]));
    } else {
      setWatchlist([]);
      setNotifications([]);
      setMessages([]);
      setUnreadCounts({ messages: 0, notifications: 0 });
    }
  }, [currentUser]);

  const fetchUnreadCounts = async () => {
    if (!currentUser) return;
    try {
      const res = await authFetch(`/api/unread-counts/${currentUser.id}`);
      if (res.ok) {
        const counts = await res.json();
        setUnreadCounts(counts);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const markNotificationAsRead = async (id: string) => {
    try {
      await authFetch(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: 1 } : n));
      fetchUnreadCounts();
    } catch (e) {
      console.error(e);
    }
  };

  const markAllNotificationsAsRead = async () => {
    if (!currentUser) return;
    try {
      await authFetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id })
      });
      setNotifications(prev => prev.map(n => ({ ...n, isRead: 1 })));
      setUnreadCounts(prev => ({ ...prev, notifications: 0 }));
    } catch (e) {
      console.error(e);
    }
  };

  const markMessageAsRead = async (id: string) => {
    try {
      await authFetch(`/api/messages/${id}/read`, { method: 'POST' });
      setMessages(prev => prev.map(m => m.id === id ? { ...m, isRead: 1 } : m));
      fetchUnreadCounts();
    } catch (e) {
      console.error(e);
    }
  };

  const sendMessage = async (data: { receiverId: string; subject: string; content: string; category: string }) => {
    if (!currentUser) return;
    try {
      const res = await authFetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, senderId: currentUser.id })
      });
      if (!res.ok) throw new Error('Failed to send message');
    } catch (e) {
      console.error(e);
      showAlert('فشل إرسال الرسالة', 'error');
    }
  };

  const toggleWatchlist = async (carId: string) => {
    if (!currentUser) {
      showAlert('يرجى تسجيل الدخول أولاً', 'info');
      return;
    }

    const isExisting = watchlist.find(w => w.carId === carId);

    try {
      if (isExisting) {
        // Remove
        const res = await authFetch(`/api/watchlist/${isExisting.id}`, { method: 'DELETE' });
        if (res.ok) {
          setWatchlist(prev => prev.filter(w => w.carId !== carId));
        }
      } else {
        // Add
        const res = await authFetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id, carId })
        });
        const data = await res.json();
        if (res.ok) {
          setWatchlist(prev => [...prev, data]);
        }
      }
    } catch (e) {
      console.error(e);
      showAlert('فشل تحديث قائمة المفضلة', 'error');
    }
  };

  const [stats, setStats] = useState({
    totalSales: 1250000,
    activeAuctions: 124,
    totalUsers: 3842
  });

  const addCar = async (car: Car) => {
    try {
      const res = await authFetch('/api/cars', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(car)
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to add car');
      }
      const savedCar = await res.json();
      setCars(prev => [savedCar, ...prev]);
    } catch (e) {
      console.error('Failed to add car:', e);
      throw e;
    }
    setStats(prev => ({ ...prev, activeAuctions: prev.activeAuctions + 1 }));
  };

  const updateCar = async (id: string, updates: Partial<Car>) => {
    const res = await authFetch(`/api/cars/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'فشل تحديث السيارة على الخادم');
    }

    setCars(prev => prev.map(car => car.id === id ? { ...car, ...updates } : car));
  };

  const deleteCar = async (id: string) => {
    try {
      const res = await authFetch(`/api/cars/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setCars(prev => prev.filter(car => car.id !== id));
        setStats(prev => ({ ...prev, activeAuctions: prev.activeAuctions - 1 }));
      }
    } catch (e) {
      console.error('Failed to delete car:', e);
    }
  };

  const placeBid = (carId: string, amount: number, userId: string) => {
    if (!socket) return;

    const user = currentUser; // Use currentUser instead of searching users array

    if (!user || user.id !== userId) {
      showAlert("User not found or not logged in.");
      return;
    }

    if (user.status !== 'active') {
      showAlert("Permission Denied: Your account is inactive. You cannot place a bid.");
      return;
    }

    if (amount > user.buyingPower) {
      showAlert(`Permission Denied: Your bid amount ($${amount}) exceeds your buying power ($${user.buyingPower}).`);
      return;
    }

    socket.emit('place_bid', { carId, userId, amount });
  };

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('currentUser');
      localStorage.removeItem('authToken'); // ✅ Clear JWT on logout
    }
  }, [currentUser]);

  const addUser = async (user: User) => {
    try {
      const res = await authFetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });
      if (res.ok) {
        const savedUser = await res.json();
        setUsers(prev => [savedUser, ...prev]);
        setStats(prev => ({ ...prev, totalUsers: prev.totalUsers + 1 }));
      } else {
        setUsers(prev => [user, ...prev]);
      }
    } catch (e) {
      console.error('Failed to add user', e);
      setUsers(prev => [user, ...prev]);
    }
  };

  return (
    <StoreContext.Provider value={{
      cars, addCar, updateCar, deleteCar, placeBid,
      stats: {
        totalSales: 1240,
        activeAuctions: cars.filter(c => c.status === 'live').length,
        totalUsers: users.length
      },
      users, setUsers, addUser,
      currentUser, setCurrentUser,
      csvData, setCsvData,
      socket,
      showAlert,
      showConfirm,
      watchlist,
      toggleWatchlist,
      branchConfig,
      setBranchConfig,
      notifications,
      messages,
      unreadCounts,
      fetchUnreadCounts,
      markNotificationAsRead,
      markAllNotificationsAsRead,
      markMessageAsRead,
      sendMessage,
      marketEstimates,
      fetchMarketEstimates,
      addMarketEstimate,
      updateMarketEstimate,
      deleteMarketEstimate,
      exchangeRate,
      updateExchangeRate
    }}>
      {children}
      <AlertModal
        isOpen={alertConfig.isOpen}
        message={alertConfig.message}
        type={alertConfig.type}
        onClose={closeAlert}
      />
      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (context === undefined) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return context;
};
