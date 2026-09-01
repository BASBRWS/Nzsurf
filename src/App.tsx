/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, SurfSpot, ForecastData, SurfAdvice, SharedSpot } from './types';
import { INITIAL_USER, DEFAULT_SPOTS } from './constants';
import { getSurfAdvice, generateLocalSurfAdvice } from './services/geminiService';
import { fetchForecast } from './services/weatherService';
import { ForecastGrid } from './components/ForecastGrid';
import { ProfileSettings } from './components/ProfileSettings';
import { SurfTips } from './components/SurfTips';
import { AdviceModal } from './components/AdviceModal';
import { Logo } from './components/Logo';
import { SpotMap } from './components/SpotMap';
import { SpotManager } from './components/SpotManager';
import { SpotReport as SpotReportComponent } from './components/SpotReport';
import { WeatherPanel } from './components/WeatherPanel';
import { LocationPermissionModal } from './components/LocationPermissionModal';
import { BetaFeatures } from './components/BetaFeatures';
import { CommunitySection } from './components/CommunitySection';
import { FeedbackModal } from './components/FeedbackModal';
import { BetaNoticeModal } from './components/BetaNoticeModal';
import { CompactDailyForecast } from './components/CompactDailyForecast';
import { SurfReportCard } from './components/SurfReportCard';
import { ThemeSelector, ThemeStyle, normalizeThemeId } from './components/ThemeSelector';
import { Waves, Wind, Thermometer, Map as MapIcon, User as UserIcon, Settings, Info, LogOut, Navigation, Share2, Camera, Zap, ChevronDown, Cloud, Beaker, MessageSquare, Users, LayoutList, Grid } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { nl } from 'date-fns/locale';
import { cn } from './lib/utils';
import { 
  auth, 
  db, 
  googleProvider, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  doc, 
  getDoc,
  onSnapshot, 
  setDoc,
  updateDoc,
  collection,
  addDoc,
  query,
  where,
  handleFirestoreError,
  OperationType,
  User
} from './lib/firebase';

export default function App() {
  const [user, setUser] = useState<UserProfile>(INITIAL_USER);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [allSpots, setAllSpots] = useState<SurfSpot[]>(DEFAULT_SPOTS);
  const [spotCorrections, setSpotCorrections] = useState<Record<string, SurfSpot['correction']>>({});
  const [selectedSpotId, setSelectedSpotId] = useState<string>(DEFAULT_SPOTS[0].id);
  const [forecast, setForecast] = useState<ForecastData[]>([]);
  const [isForecastLoading, setIsForecastLoading] = useState(false);
  const [selectedForecast, setSelectedForecast] = useState<ForecastData | null>(null);
  const [advice, setAdvice] = useState<SurfAdvice | null>(null);
  const [isAdviceLoading, setIsAdviceLoading] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isMapOpen, setIsMapOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'forecast' | 'map' | 'tips' | 'profile' | 'report' | 'weather' | 'community'>('forecast');
  const [userCoords, setUserCoords] = useState<{ lat: number, lng: number } | null>(null);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const [permissionReason, setPermissionReason] = useState('');
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isBetaNoticeOpen, setIsBetaNoticeOpen] = useState(() => {
    return localStorage.getItem('hasSeenBetaNotice_v1') !== 'true';
  });
  const [forecastViewMode, setForecastViewMode] = useState<'compact' | 'detailed'>(() => {
    return (localStorage.getItem('nzs_forecast_view_mode') as 'compact' | 'detailed') || 'compact';
  });
  const [themeStyle, setThemeStyle] = useState<ThemeStyle>(() => {
    return (localStorage.getItem('nzs_theme_style') as ThemeStyle) || 'light';
  });

  useEffect(() => {
    // Remove all possible theme classes from body
    const allThemeClasses = [
      'theme-light', 'theme-dark', 'theme-matrix', 'theme-cyberpunk', 'theme-synthwave',
      'theme-terminal', 'theme-win95', 'theme-macintosh', 'theme-y2k', 'theme-vaporwave',
      'theme-brutalist', 'theme-glass', 'theme-blueprint', 'theme-paper', 'theme-arcade',
      'theme-nes8bit', 'theme-hacker', 'theme-tron', 'theme-monochrome', 'theme-developer',
      // legacy classes
      'theme-oceanic', 'theme-8bit', 'theme-sunset80s', 'theme-nordic'
    ];
    document.body.classList.remove(...allThemeClasses);

    // Apply normalized active theme
    const normalized = normalizeThemeId(themeStyle);
    document.body.classList.add(`theme-${normalized}`);

    localStorage.setItem('nzs_theme_style', themeStyle);
  }, [themeStyle]);

  const handleToggleForecastViewMode = (mode: 'compact' | 'detailed') => {
    setForecastViewMode(mode);
    localStorage.setItem('nzs_forecast_view_mode', mode);
  };
  const [pendingTab, setPendingTab] = useState<'map' | 'report' | null>(null);

  const handleCloseBetaNotice = () => {
    localStorage.setItem('hasSeenBetaNotice_v1', 'true');
    setIsBetaNoticeOpen(false);
  };
  const [isLocationRequested, setIsLocationRequested] = useState(false);
  const [incomingSharedSpot, setIncomingSharedSpot] = useState<SharedSpot | null>(null);
  const [hasMismatchedReports, setHasMismatchedReports] = useState(false);

  const ADMIN_EMAILS = ['sebastiaan.boom2@gmail.com', 'sebastiaan.boom@gmail.com'];
  const isAdmin = authUser && ADMIN_EMAILS.includes(authUser.email || '');

  useEffect(() => {
    const handleSwitchTab = (e: any) => {
      const tab = e.detail;
      handleTabChange(tab);
      setIsProfileOpen(false);
    };
    window.addEventListener('switchTab', handleSwitchTab);
    return () => window.removeEventListener('switchTab', handleSwitchTab);
  }, []);

  // Detect shared spot from URL
  useEffect(() => {
    if (!authUser) {
      setHasMismatchedReports(false);
      return;
    }
    
    const q = query(
      collection(db, 'spotReports'),
      where('userId', '==', authUser.uid)
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const mismatched = snapshot.docs.some(doc => doc.data().analysis?.isMismatched === true);
      setHasMismatchedReports(mismatched);
    });
    
    return () => unsubscribe();
  }, [authUser]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('shareSpotId');
    
    if (shareId) {
      const fetchShared = async () => {
        try {
          const docRef = doc(db, 'sharedSpots', shareId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            setIncomingSharedSpot({ id: docSnap.id, ...docSnap.data() } as SharedSpot);
            const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
            window.history.pushState({ path: newUrl }, '', newUrl);
          }
        } catch (err) {
          console.error("Error fetching shared spot:", err);
        }
      };
      fetchShared();
    }
  }, []);

  const handleShareSpot = async (spot: SurfSpot) => {
    if (!authUser) return;

    try {
      const sharedSpotData: Omit<SharedSpot, 'id'> = {
        creatorId: authUser.uid,
        creatorName: authUser.displayName || 'Anoniem',
        name: spot.name,
        lat: spot.lat,
        lng: spot.lng,
        type: spot.type,
        bestWind: spot.bestWind,
        bestSwell: spot.bestSwell,
        coastlineAngle: spot.coastlineAngle,
        createdAt: new Date().toISOString()
      };

      const docRef = await addDoc(collection(db, 'sharedSpots'), sharedSpotData);
      const shareUrl = `${window.location.origin}/?shareSpotId=${docRef.id}`;
      await navigator.clipboard.writeText(shareUrl);
      alert(`NZS.pro\n\nLink gekopieerd! Deel deze spot:\n${shareUrl}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'sharedSpots');
    }
  };

  const handleAddSharedSpot = (shared: SharedSpot) => {
    const newSpot: SurfSpot = {
      id: `shared-${shared.id || Date.now()}`,
      name: shared.name,
      lat: shared.lat,
      lng: shared.lng,
      type: shared.type,
      bestWind: shared.bestWind,
      bestSwell: shared.bestSwell,
      coastlineAngle: shared.coastlineAngle
    };

    if (!allSpots.find(s => s.id === newSpot.id)) {
      setAllSpots(prev => [...prev, newSpot]);
      const updatedSavedSpots = [...(user.savedSpots === undefined ? DEFAULT_SPOTS : user.savedSpots), newSpot];
      handleUpdateProfile({ ...user, savedSpots: updatedSavedSpots });
    }
    setSelectedSpotId(newSpot.id);
    setIncomingSharedSpot(null);
    setActiveTab('forecast');
  };

  const selectedSpot = useMemo(() =>
    allSpots.find(s => s.id === selectedSpotId) || allSpots[0]
  , [selectedSpotId, allSpots]);

  // Score voor het report-blok: gebruik het live AI-advies zodra dat er is,
  // anders direct de offline adviesmotor zodat de gauge nooit op 0 blijft.
  const heroAdvice = useMemo(() => {
    if (advice) return advice;
    if (selectedSpot && forecast[0]) {
      try { return generateLocalSurfAdvice(user, selectedSpot, forecast[0], []); }
      catch { return null; }
    }
    return null;
  }, [advice, selectedSpot, forecast, user]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setAuthUser(firebaseUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser) {
      const localUserStr = localStorage.getItem('nzs_anon_user');
      if (localUserStr) {
        try {
          const parsed = JSON.parse(localUserStr);
          if (parsed.savedSpots && !parsed.savedSpots.some((s: SurfSpot) => s.id === 'ouddorp')) {
            parsed.savedSpots = [DEFAULT_SPOTS[0], ...parsed.savedSpots];
          }
          setUser(parsed);
        } catch (e) {
          setUser(INITIAL_USER);
        }
      } else {
        setUser(INITIAL_USER);
      }
      return;
    }

    const userDocRef = doc(db, 'users', authUser.uid);
    const unsubscribe = onSnapshot(userDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as UserProfile;
        
        // Auto-add default spots (Ouddorp, Lette Blanche & Soulac Plage) for all users if not already present
        const hasOuddorp = data.savedSpots?.some(s => s.id === 'ouddorp');
        const hasLetteBlanche = data.savedSpots?.some(s => s.id === 'lette-blanche');
        const hasSoulac = data.savedSpots?.some(s => s.id === 'soulac-sandaya');
        if (!hasOuddorp || !hasLetteBlanche || !hasSoulac) {
          const updatedSpots = [...(data.savedSpots || DEFAULT_SPOTS)];
          if (!hasOuddorp) {
            updatedSpots.unshift(DEFAULT_SPOTS[0]);
          }
          if (!hasLetteBlanche) {
            const lb = DEFAULT_SPOTS.find(s => s.id === 'lette-blanche');
            if (lb) updatedSpots.push(lb);
          }
          if (!hasSoulac) {
            const sc = DEFAULT_SPOTS.find(s => s.id === 'soulac-sandaya');
            if (sc) updatedSpots.push(sc);
          }
          updateDoc(userDocRef, { savedSpots: updatedSpots }).catch(console.error);
        }

        // Ensure user email and displayName are saved in document if missing
        if ((!data.email && authUser.email) || (!data.displayName && authUser.displayName) || !data.uid) {
          updateDoc(userDocRef, {
            uid: authUser.uid,
            email: authUser.email || '',
            displayName: authUser.displayName || ''
          }).catch(console.error);
        }

        setUser({
          ...data,
          uid: authUser.uid,
          email: data.email || authUser.email || undefined,
          displayName: data.displayName || authUser.displayName || undefined
        });
        
        // Load favorite spot if exists and not already set
        if (data.favoriteSpotId && !selectedSpotId) {
          const favoriteExists = (data.savedSpots || DEFAULT_SPOTS).some(s => s.id === data.favoriteSpotId);
          if (favoriteExists) {
            setSelectedSpotId(data.favoriteSpotId);
          }
        } else if (!selectedSpotId) {
          setSelectedSpotId(data.savedSpots?.[0]?.id || DEFAULT_SPOTS[0].id);
        }

        // Silently update lastActiveAt if it's been more than an hour or is missing
        const now = new Date();
        const lastActive = data.lastActiveAt ? new Date(data.lastActiveAt) : null;
        if (!lastActive || (now.getTime() - lastActive.getTime() > 3600000)) {
          updateDoc(userDocRef, { lastActiveAt: now.toISOString() }).catch(console.error);
        }
      } else {
        const newUser: UserProfile = { 
          ...INITIAL_USER, 
          uid: authUser.uid,
          email: authUser.email || '',
          displayName: authUser.displayName || '',
          savedSpots: [...DEFAULT_SPOTS],
          createdAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString() 
        };
        setDoc(userDocRef, newUser).catch(err => 
          handleFirestoreError(err, OperationType.WRITE, `users/${authUser.uid}`)
        );
      }
    }, (err) => {
      handleFirestoreError(err, OperationType.GET, `users/${authUser.uid}`);
    });

    return () => unsubscribe();
  }, [authUser]);

  const handleUpdateProfile = async (updatedUser: UserProfile) => {
    setUser(updatedUser);
    if (authUser) {
      try {
        await setDoc(doc(db, 'users', authUser.uid), updatedUser);
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${authUser.uid}`);
      }
    } else {
      localStorage.setItem('nzs_anon_user', JSON.stringify(updatedUser));
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  useEffect(() => {
    const loadForecast = async () => {
      if (!selectedSpot) return;
      setIsForecastLoading(true);
      try {
        const data = await fetchForecast(selectedSpot);
        setForecast(data);
      } catch (error) {
        console.error('Failed to load forecast:', error);
      } finally {
        setIsForecastLoading(false);
      }
    };
    loadForecast();
  }, [selectedSpot]);

  useEffect(() => {
    // Fallback to DEFAULT_SPOTS ONLY if user.savedSpots is strictly undefined (new user or guest)
    // If user.savedSpots is [] (empty array), it means they deleted all spots.
    const baseSpots = (user.savedSpots === undefined) ? DEFAULT_SPOTS : user.savedSpots;
    
    // Merge with corrections
    const merged = baseSpots.map(spot => ({
      ...spot,
      correction: spotCorrections[spot.id] || spot.correction
    }));
    
    setAllSpots(merged);
  }, [user.savedSpots, spotCorrections]);

  // Listen for spot-wide corrections (admin tweaks)
  useEffect(() => {
    const q = collection(db, 'spots');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const corrections: Record<string, SurfSpot['correction']> = {};
      snapshot.forEach(doc => {
        const data = doc.data();
        if (data.correction) {
          corrections[doc.id] = data.correction;
        }
      });
      setSpotCorrections(corrections);
    }, (err) => {
      console.warn('Optionele spots correcties listener mislukt (normaal indien ongetweakt):', err.message);
    });
    return () => unsubscribe();
  }, []);

  const handleCustomSpot = async (lat: number, lng: number) => {
    const newSpot: SurfSpot = {
      id: `custom-${Date.now()}`,
      name: 'Secret Spot',
      lat,
      lng,
      type: 'beachbreak',
      bestWind: ['O', 'ZO', 'NO'],
      bestSwell: ['NW', 'W'],
      coastlineAngle: 305 // Default for NL
    };
    
    setAllSpots(prev => [...prev, newSpot]);
    setSelectedSpotId(newSpot.id);

    const updatedSavedSpots = [...(user.savedSpots === undefined ? DEFAULT_SPOTS : user.savedSpots), newSpot];
    handleUpdateProfile({ ...user, savedSpots: updatedSavedSpots });
  };

  const handleRequestLocation = (reason: string, targetTab: 'map' | 'report') => {
    if (userCoords) {
      setActiveTab(targetTab);
      if (targetTab === 'map') setIsMapOpen(true);
      return;
    }
    setPermissionReason(reason);
    setPendingTab(targetTab);
    setIsPermissionModalOpen(true);
  };

  const grantLocation = () => {
    setIsPermissionModalOpen(false);
    if (!navigator.geolocation) return;
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (pendingTab) {
          setActiveTab(pendingTab);
          if (pendingTab === 'map') setIsMapOpen(true);
          setPendingTab(null);
        }
      },
      (err) => {
        console.error("Geolocation error:", err);
        // Still open the tab but without coordinates
        if (pendingTab) {
          setActiveTab(pendingTab);
          if (pendingTab === 'map') setIsMapOpen(true);
          setPendingTab(null);
        }
      }
    );
  };

  const handleTabChange = (tab: any) => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (tab === 'map') {
      setActiveTab('map');
      setIsMapOpen(true);
    } else if (tab === 'report') {
      handleRequestLocation("Locatiegegegevens zijn essentieel voor Spot Reports om te verifiëren dat je daadwerkelijk bij de spot bent.", 'report');
    } else {
      setActiveTab(tab);
    }
  };

  useEffect(() => {
    // Check if permission was already granted in a previous session
    if (navigator.permissions && !isLocationRequested) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        if (result.state === 'granted') {
          navigator.geolocation.getCurrentPosition(
            (pos) => setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          );
        }
        setIsLocationRequested(true);
      });
    }
  }, [isLocationRequested]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const handleCellClick = (data: ForecastData) => {
    setSelectedForecast(data);
    setAdvice(null);
    setIsAdviceLoading(false);
  };

  const handleRequestAdvice = async (targetData?: ForecastData) => {
    const dataToAnalyze = targetData || selectedForecast;
    if (!dataToAnalyze) return;

    setIsAdviceLoading(true);
    try {
      const nearbySpots = userCoords 
        ? allSpots.filter(s => calculateDistance(userCoords.lat, userCoords.lng, s.lat, s.lng) <= 5)
        : [];

      const result = await getSurfAdvice(user, selectedSpot, dataToAnalyze, nearbySpots);
      setAdvice(result);
    } catch (error) {
      console.error('Failed to get surf advice:', error);
    } finally {
      setIsAdviceLoading(false);
    }
  };

  const handleUpdateSpotLocation = async (id: string, lat: number, lng: number) => {
    if (!user) return;
    const updatedSpots = allSpots.map(s => 
      s.id === id ? { ...s, lat, lng } : s
    );
    const updatedUser = { ...user, savedSpots: updatedSpots };
    handleUpdateProfile(updatedUser);
  };

  const handleSetFavorite = async (id: string) => {
    if (!user) return;
    const updatedUser = { ...user, favoriteSpotId: id };
    handleUpdateProfile(updatedUser);
  };

  const handleDeleteSpot = async (id: string) => {
    if (!user) return;
    const updatedSpots = allSpots.filter(s => s.id !== id);
    const updatedUser = { ...user, savedSpots: updatedSpots };
    if (user.favoriteSpotId === id) {
      updatedUser.favoriteSpotId = undefined;
    }
    if (selectedSpotId === id) {
      const nextSpot = updatedSpots[0] || DEFAULT_SPOTS[0];
      setSelectedSpotId(nextSpot.id);
    }
    handleUpdateProfile(updatedUser);
  };

  const handleManualAddSpot = async (name: string, lat: number, lng: number) => {
    const newSpot: SurfSpot = {
      id: `custom-${Date.now()}`,
      name,
      lat,
      lng,
      type: 'beachbreak',
      bestWind: ['O', 'ZO', 'NO'],
      bestSwell: ['NW', 'W'],
      coastlineAngle: 305
    };
    
    setAllSpots(prev => [...prev, newSpot]);
    setSelectedSpotId(newSpot.id);

    const updatedSavedSpots = [...(user.savedSpots === undefined ? DEFAULT_SPOTS : user.savedSpots), newSpot];
    handleUpdateProfile({ ...user, savedSpots: updatedSavedSpots });
  };

  const spotForecasts = useMemo(() => {
    // This is a simplified version, in a real app you might fetch for all visible spots
    // For now we just pass the current forecast to the selected spot for display
    return { [selectedSpotId]: forecast[0] };
  }, [selectedSpotId, forecast]);

  const isSimplifiedHero = activeTab !== 'forecast';
  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden flex flex-col font-sans selection:bg-accent selection:text-white">
      {/* Editorial Header */}
      <nav className="fixed top-0 left-0 right-0 z-50 transition-colors duration-300 glass border-b border-white/5">
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 h-14 md:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-6 min-w-0">
            <ThemeSelector currentTheme={themeStyle} onSelectTheme={setThemeStyle} />
            <div className="h-4 w-px bg-white/10 hidden sm:block shrink-0" />
            <Logo />
            <div className="hidden lg:flex items-center gap-6">
              {['voorspelling', 'weer', 'kaart', 'community', 'report', ...(isAdmin ? ['beta'] : [])].map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab === 'voorspelling' ? 'forecast' : tab === 'weer' ? 'weather' : tab === 'kaart' ? 'map' : tab as any)}
                  className={`text-[11px] font-mono tracking-[0.2em] uppercase transition-all hover:text-accent ${activeTab === (tab === 'voorspelling' ? 'forecast' : tab === 'weer' ? 'weather' : tab === 'kaart' ? 'map' : tab) ? 'text-accent border-b border-accent pb-1' : 'text-sand-50/50'}`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <div className="hidden sm:flex items-center gap-3">
              <div className="h-4 w-px bg-white/10" />
              <div className="flex items-center gap-2 glass px-3 py-1.5 rounded-full border border-white/5">
                <Navigation className="w-3 h-3 text-accent" />
                <select 
                  value={selectedSpotId} 
                  onChange={(e) => setSelectedSpotId(e.target.value)}
                  className="bg-transparent border-none text-[11px] font-mono text-white/80 focus:ring-0 cursor-pointer outline-none w-[140px]"
                >
                  {allSpots.map(spot => (
                    <option key={spot.id} value={spot.id} className="bg-marine-900">{spot.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <button 
                onClick={() => setIsBetaNoticeOpen(true)}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-mono text-[9px] uppercase tracking-wider font-bold hover:bg-amber-500/20 transition-all cursor-pointer"
                title="Bèta Informatie"
              >
                <Beaker className="w-3 h-3 text-amber-400 animate-pulse" />
                <span>Beta</span>
              </button>

              <button 
                onClick={() => setIsFeedbackOpen(true)}
                className="p-2 glass rounded-full hover:bg-accent/20 hover:text-accent transition-colors group"
                title="Geef feedback"
              >
                <MessageSquare className="w-4 h-4 text-white/50 group-hover:text-accent transition-colors" />
              </button>
              {isAuthLoading ? (
                <div className="w-8 h-8 rounded-full glass animate-pulse" />
              ) : authUser ? (
                <div className="flex items-center gap-2 sm:gap-3 group relative">
                  <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="relative">
                    <img 
                      src={authUser.photoURL || `https://ui-avatars.com/api/?name=${authUser.displayName}`} 
                      alt="" 
                      className="w-8 h-8 rounded-full border border-white/20 transition-transform group-hover:scale-110"
                      referrerPolicy="no-referrer"
                    />
                    {hasMismatchedReports && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-marine-950 animate-pulse" />
                    )}
                  </button>
                  <button 
                    onClick={handleLogout}
                    className="p-2 glass rounded-full hover:bg-red-500/20 transition-colors"
                  >
                    <LogOut className="w-4 h-4 text-white/50" />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={handleLogin}
                  className="glass px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-[10px] sm:text-[11px] font-mono tracking-widest uppercase hover:bg-white/10 transition-all border border-white/10"
                >
                  Inloggen
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <header className={cn(
        "relative pt-24 sm:pt-32 pb-6 sm:pb-8 overflow-hidden transition-all duration-700",
        isSimplifiedHero ? "pb-3 sm:pb-4" : "pb-8 sm:pb-12"
      )}>
        {/* Coastal Pulse Visual */}
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-10">
          <svg className="w-full h-full" viewBox="0 0 1000 400">
            <path d="M0 200 Q 250 150 500 200 T 1000 200" fill="none" stroke="var(--color-accent)" strokeWidth="1">
              <animate attributeName="d" dur="10s" repeatCount="indefinite" values="M0 200 Q 250 150 500 200 T 1000 200; M0 200 Q 250 250 500 200 T 1000 200; M0 200 Q 250 150 500 200 T 1000 200" />
            </path>
          </svg>
        </div>
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6">
          <motion.div 
            initial={false}
            animate={{ 
              paddingBottom: isSimplifiedHero ? "0.5rem" : "2rem",
            }}
            transition={{ duration: 0.5 }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-6 md:gap-8 border-b border-white/10"
          >
            <div className="space-y-3 sm:space-y-4 min-w-0">
              <div className="flex items-center gap-3">
                <span className="flex h-2 w-2 rounded-full bg-accent animate-pulse" />
                <p className="text-[10px] font-mono tracking-[0.3em] uppercase text-accent">
                  {isSimplifiedHero ? activeTab : "Live Status"}
                </p>
              </div>
              <h1 className={cn(
                "font-black leading-[0.9] lg:leading-[0.8] mb-2 sm:mb-4 uppercase italic break-words tracking-tighter transition-all duration-700 max-w-full",
                isSimplifiedHero ? "text-2xl sm:text-4xl lg:text-6xl" : "text-3xl sm:text-6xl lg:text-[8rem]"
              )}>
                {selectedSpot?.name?.split(' ')[0]}<br/>
                <span className="text-accent">{selectedSpot?.name?.split(' ').slice(1).join(' ')}</span>
              </h1>
              {!isSimplifiedHero && (
                <motion.p 
                  initial={{ opacity: 0 }} 
                  animate={{ opacity: 1 }} 
                  className="text-sand-50/50 max-w-lg text-xs md:text-base font-medium"
                >
                  Professionele surf intelligence voor de Noordzee. Aangedreven door AI en sensoren om jouw window te vinden.
                </motion.p>
              )}
            </div>

            <div className={cn(
              "grid grid-cols-3 md:flex gap-3 sm:gap-4 md:gap-12 w-full md:w-auto transition-opacity duration-700",
              isSimplifiedHero ? "opacity-30" : "opacity-100"
            )}>
              <div className="space-y-1 md:space-y-2">
                <p className="text-[8px] md:text-[10px] font-mono uppercase text-white/30">Swell</p>
                <div className="flex items-end gap-1">
                  <span className={cn("font-bold transition-all", isSimplifiedHero ? "text-lg sm:text-xl md:text-2xl" : "text-xl sm:text-2xl md:text-4xl")}>
                    {forecast[0]?.waveHeight ?? '--'}
                  </span>
                  <span className="text-[8px] md:text-xs mb-1 text-white/40 font-mono">m</span>
                </div>
              </div>
              <div className="space-y-1 md:space-y-2">
                <p className="text-[8px] md:text-[10px] font-mono uppercase text-white/30">Wind</p>
                <div className="flex items-end gap-1 text-accent">
                  <span className={cn("font-bold transition-all", isSimplifiedHero ? "text-lg sm:text-xl md:text-2xl" : "text-xl sm:text-2xl md:text-4xl")}>
                    {forecast[0]?.windSpeed ?? '--'}
                  </span>
                  <span className="text-[8px] md:text-xs mb-1 font-mono uppercase">kn</span>
                </div>
              </div>
              <div className="space-y-1 md:space-y-2">
                <p className="text-[8px] md:text-[10px] font-mono uppercase text-white/30">Temp</p>
                <div className="flex items-end gap-1">
                  <span className={cn("font-bold transition-all", isSimplifiedHero ? "text-lg sm:text-xl md:text-2xl" : "text-xl sm:text-2xl md:text-4xl")}>
                    {forecast[0]?.airTemp ?? '--'}°
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </header>

      <main className="flex-1 max-w-screen-2xl mx-auto w-full px-3 sm:px-6 space-y-8 sm:space-y-12 pb-32 overflow-hidden">
        <AnimatePresence mode="wait">
          {/* Settings / Profile Drawer */}
          {isProfileOpen && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="glass rounded-3xl p-4 sm:p-8 mb-12">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5 text-accent" />
                    <h2 className="text-2xl font-black italic uppercase">Voorkeuren</h2>
                  </div>
                  <button 
                    onClick={() => setIsProfileOpen(false)}
                    className="text-xs font-mono uppercase text-white/40 hover:text-white"
                  >
                    Inklappen
                  </button>
                </div>
                <ProfileSettings 
                  user={user} 
                  onUpdate={handleUpdateProfile} 
                  allSpots={allSpots}
                  currentForecast={forecast[0] || null}
                  onShareSpot={handleShareSpot}
                />
              </div>
            </motion.div>
          )}

          {/* Map Section */}
          {activeTab === 'map' && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-8"
            >
              <div className="glass rounded-[2rem] overflow-hidden p-2 border border-white/5 ring-1 ring-white/10 shadow-2xl">
                <SpotMap 
                  spots={allSpots} 
                  selectedSpotId={selectedSpotId} 
                  onSelectSpot={(id) => {
                    setSelectedSpotId(id);
                    setIsMapOpen(false);
                    setActiveTab('forecast');
                  }}
                  onCustomSpot={handleCustomSpot}
                  onUpdateSpotLocation={handleUpdateSpotLocation}
                  forecasts={spotForecasts}
                  userCoords={userCoords}
                />
              </div>

              <SpotManager 
                spots={allSpots}
                favoriteSpotId={user?.favoriteSpotId}
                onDeleteSpot={handleDeleteSpot}
                onSetFavorite={handleSetFavorite}
                onSelectSpot={setSelectedSpotId}
                selectedSpotId={selectedSpotId}
                onAddSpot={handleManualAddSpot}
              />
            </motion.div>
          )}

          {activeTab === 'community' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <CommunitySection />
            </motion.div>
          )}

          {activeTab === 'report' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-xl mx-auto"
            >
              <div className="space-y-8">
                <header className="text-center space-y-2">
                  <h2 className="text-3xl font-black italic uppercase text-white">Spot Report</h2>
                  <p className="text-[10px] font-mono text-white/30 tracking-[0.3em] uppercase">Field Reconnaissance Protocol</p>
                </header>
                <SpotReportComponent 
                  spots={allSpots} 
                  currentForecasts={{ [selectedSpotId]: forecast[0] }} 
                  initialSpotId={selectedSpotId}
                  onComplete={() => setActiveTab('forecast')}
                  user={user}
                />
              </div>
            </motion.div>
          )}

          {activeTab === 'beta' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <BetaFeatures 
                spots={allSpots} 
                forecasts={spotForecasts as any} 
                userCoords={userCoords}
                userEmail={authUser?.email || ''}
                selectedSpotId={selectedSpotId}
                onSelectSpot={setSelectedSpotId}
              />
            </motion.div>
          )}

          {activeTab === 'tips' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-5xl mx-auto"
            >
              <SurfTips />
            </motion.div>
          )}

          {activeTab === 'weather' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-screen-2xl mx-auto w-full"
            >
              <WeatherPanel spot={selectedSpot} />
            </motion.div>
          )}

          {activeTab === 'forecast' && (
            <motion.div 
              key="forecast"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-8"
            >
              {/* Surf-report-blok in de stijl van een moderne weer-app */}
              <SurfReportCard
                spot={selectedSpot}
                forecast={forecast[0] || null}
                advice={heroAdvice}
                onDetails={forecast[0] ? () => handleCellClick(forecast[0]) : undefined}
              />

              {/* Spot Selector & View Mode Switcher Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass rounded-3xl p-4 sm:p-6 border border-white/10 shadow-lg">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent shrink-0">
                    <Waves className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Geselecteerde Spot</span>
                      {user?.favoriteSpotId === selectedSpotId && (
                        <span className="text-[9px] font-mono text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">Favoriet ★</span>
                      )}
                      {selectedSpot?.isAtlantic && (
                        <span className="text-[9px] font-mono text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded border border-cyan-400/20">Atlantisch (FR)</span>
                      )}
                    </div>
                    <div className="relative group/select inline-block mt-0.5">
                      <select 
                        value={selectedSpotId}
                        onChange={(e) => setSelectedSpotId(e.target.value)}
                        className="bg-transparent text-lg sm:text-2xl font-black uppercase tracking-tight text-white border-none focus:ring-0 cursor-pointer appearance-none pr-7 -ml-1 py-0"
                      >
                        {allSpots.map(spot => (
                          <option key={spot.id} value={spot.id} className="bg-marine-950 text-white font-sans text-sm">
                            {spot.name} {user?.favoriteSpotId === spot.id ? '★' : ''} {spot.isAtlantic ? '(FR)' : '(NL)'}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-accent absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none opacity-80" />
                    </div>
                  </div>
                </div>

                {/* Switcher Toggle: Korte weergave vs Uitgebreide weergave */}
                <div className="flex items-center bg-black/40 p-1.5 rounded-2xl border border-white/10 self-start md:self-auto shadow-inner">
                  <button
                    onClick={() => handleToggleForecastViewMode('compact')}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all",
                      forecastViewMode === 'compact'
                        ? "bg-accent text-white shadow-md shadow-accent/25"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <LayoutList className="w-4 h-4" />
                    <span>Korte weergave</span>
                  </button>
                  <button
                    onClick={() => handleToggleForecastViewMode('detailed')}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all",
                      forecastViewMode === 'detailed'
                        ? "bg-accent text-white shadow-md shadow-accent/25"
                        : "text-white/60 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <Grid className="w-4 h-4" />
                    <span>Uitgebreide weergave</span>
                  </button>
                </div>
              </div>

              {/* View Mode Content */}
              {forecastViewMode === 'compact' ? (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                  <div className="lg:col-span-3">
                    {isForecastLoading ? (
                      <div className="glass rounded-3xl flex flex-col items-center justify-center py-24 gap-4">
                        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Dag-samenvattingen genereren...</p>
                      </div>
                    ) : (
                      <CompactDailyForecast 
                        forecast={forecast}
                        spot={selectedSpot}
                        user={user}
                        isLoggedIn={!!authUser}
                        onSelectForecastHour={handleCellClick}
                        onOpenProfile={() => setIsProfileOpen(true)}
                      />
                    )}
                  </div>

                  {/* Sidebar with Setup & Spot Share */}
                  <div className="space-y-6">
                    {/* Active Gear Widget */}
                    <div className="glass rounded-[2rem] p-6 space-y-6 border border-white/5 shadow-xl">
                      <div className="flex items-center gap-3">
                        <UserIcon className="w-4 h-4 text-accent" />
                        <h4 className="text-sm font-bold uppercase tracking-wider">Mijn Setup</h4>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="flex justify-between items-center py-3 border-b border-white/5">
                          <span className="text-[10px] font-mono text-white/40 uppercase">Board</span>
                          <span className="text-xs font-bold">{user.boards?.find(b => b.id === user.selectedBoardId)?.name || 'Geen'}</span>
                        </div>
                        <div className="flex justify-between items-center py-3 border-b border-white/5">
                          <span className="text-[10px] font-mono text-white/40 uppercase">Pak</span>
                          <span className="text-xs font-bold">{user.wetsuits?.find(w => w.id === user.selectedWetsuitId)?.thickness || '---'}mm</span>
                        </div>
                        <div className="flex justify-between items-center py-3">
                          <span className="text-[10px] font-mono text-white/40 uppercase">Niveau</span>
                          <span className="text-xs font-bold uppercase text-accent tracking-tighter">{user.skillLevel}</span>
                        </div>
                      </div>

                      <button 
                        onClick={() => setIsProfileOpen(true)}
                        className="w-full py-3 glass rounded-2xl text-[10px] font-mono uppercase tracking-widest hover:bg-white/10 transition-all"
                      >
                        Setup Aanpassen
                      </button>
                    </div>

                    {/* Share Snippet */}
                    <div className="glass-dark rounded-[2rem] p-6 space-y-4 border border-accent/20">
                      <div className="flex items-center gap-3">
                        <Share2 className="w-4 h-4 text-accent" />
                        <h4 className="text-sm font-bold">Samenwerken</h4>
                      </div>
                      <p className="text-xs text-white/40 leading-relaxed">
                        Deel je geheime spots met andere surfers. Genereer een NZS.pro link om sessies te coördineren.
                      </p>
                      <button 
                        onClick={() => handleShareSpot(selectedSpot)}
                        className="w-full py-3 bg-accent text-white rounded-2xl text-[10px] font-mono uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-accent/20"
                      >
                        Deel Link Genereren
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Uitgebreide weergave (Detailed view with top 3 sessions + hour-by-hour Oceanic Pulse matrix) */
                <div className="space-y-12">
                  {/* Quick Check - Best Windows */}
                  <section className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full glass border border-accent/20 flex items-center justify-center">
                        <Zap className="w-5 h-5 text-accent" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold">Beste Sessies</h2>
                        <p className="text-[10px] font-mono text-white/30 uppercase tracking-[0.2em]">Top 3 momenten voor {selectedSpot?.name || 'deze spot'}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {forecast
                        .filter(f => {
                          const h = parseISO(f.timestamp).getHours();
                          return h >= 6 && h <= 21;
                        })
                        .sort((a,b) => (b.wavePower || 0) - (a.wavePower || 0))
                        .slice(0, 3)
                        .map((session, idx) => (
                          <motion.div
                            key={`${session.timestamp}-${idx}`}
                            onClick={() => handleCellClick(session)}
                            whileHover={{ scale: 1.02 }}
                            className="glass-dark p-6 rounded-[2rem] border border-white/5 hover:border-accent/30 transition-all cursor-pointer group relative overflow-hidden"
                          >
                            <div className="absolute top-0 right-0 p-4">
                              <div className="bg-accent/10 px-2 py-0.5 rounded-full text-[8px] font-mono text-accent">TOP MATCH</div>
                            </div>
                            <div className="space-y-4">
                              <div>
                                <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest">
                                  {format(parseISO(session.timestamp), 'EEEE d MMM', { locale: nl })}
                                </p>
                                <h4 className="text-3xl font-bold text-white">{format(parseISO(session.timestamp), 'HH:mm')}</h4>
                              </div>
                              <div className="flex items-center gap-6">
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-mono text-emerald-400/50 uppercase">Golven</span>
                                  <span className="text-xl font-bold">{session.waveHeight}m</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-mono text-accent/50 uppercase">Wind</span>
                                  <span className="text-xl font-bold">{session.windSpeed}kn</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-mono text-white/20 uppercase">Power</span>
                                  <span className="text-xl font-bold">{Math.round((session.wavePower || 0) / 10)}/10</span>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                    </div>
                  </section>

                  {/* Primary Data Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                    <div className="lg:col-span-3 space-y-4 sm:space-y-6">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2 sm:gap-4">
                          <h3 className="text-lg sm:text-xl font-bold">Oceanic Pulse</h3>
                          <div className="h-4 w-px bg-white/10" />
                          <span className="text-[10px] font-mono uppercase text-white/40">Uur-voor-uur matrix</span>
                        </div>
                      </div>

                      <div className="glass rounded-[2rem] sm:rounded-3xl p-4 sm:p-6 relative overflow-hidden group">
                        {isForecastLoading ? (
                          <div className="flex flex-col items-center justify-center py-24 gap-4">
                            <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-white/40">Data synchroniseren...</p>
                          </div>
                        ) : (
                          <ForecastGrid forecast={forecast} onCellClick={handleCellClick} />
                        )}
                        {/* Visual texture */}
                        <div className="absolute top-0 right-0 p-8 text-[12rem] opacity-[0.02] rotate-12 select-none pointer-events-none transition-transform group-hover:scale-110 duration-1000">
                          NZS
                        </div>
                      </div>
                    </div>

                    <div className="space-y-8">
                      {/* Active Gear Widget */}
                      <div className="glass rounded-[2rem] p-6 space-y-6 border border-white/5 shadow-xl">
                        <div className="flex items-center gap-3">
                          <UserIcon className="w-4 h-4 text-accent" />
                          <h4 className="text-sm font-bold uppercase tracking-wider">Mijn Setup</h4>
                        </div>
                        
                        <div className="space-y-4">
                          <div className="flex justify-between items-center py-3 border-b border-white/5">
                            <span className="text-[10px] font-mono text-white/40 uppercase">Board</span>
                            <span className="text-xs font-bold">{user.boards?.find(b => b.id === user.selectedBoardId)?.name || 'Geen'}</span>
                          </div>
                          <div className="flex justify-between items-center py-3 border-b border-white/5">
                            <span className="text-[10px] font-mono text-white/40 uppercase">Pak</span>
                            <span className="text-xs font-bold">{user.wetsuits?.find(w => w.id === user.selectedWetsuitId)?.thickness || '---'}mm</span>
                          </div>
                          <div className="flex justify-between items-center py-3">
                            <span className="text-[10px] font-mono text-white/40 uppercase">Niveau</span>
                            <span className="text-xs font-bold uppercase text-accent tracking-tighter">{user.skillLevel}</span>
                          </div>
                        </div>

                        <button 
                          onClick={() => setIsProfileOpen(true)}
                          className="w-full py-3 glass rounded-2xl text-[10px] font-mono uppercase tracking-widest hover:bg-white/10 transition-all"
                        >
                          Setup Aanpassen
                        </button>
                      </div>

                      {/* Share Snippet */}
                      <div className="glass-dark rounded-[2rem] p-6 space-y-4 border border-accent/20">
                        <div className="flex items-center gap-3">
                          <Share2 className="w-4 h-4 text-accent" />
                          <h4 className="text-sm font-bold">Samenwerken</h4>
                        </div>
                        <p className="text-xs text-white/40 leading-relaxed">
                          Deel je geheime spots met andere surfers. Genereer een NZS.pro link om sessies te coördineren.
                        </p>
                        <button 
                          onClick={() => handleShareSpot(selectedSpot)}
                          className="w-full py-3 bg-accent text-white rounded-2xl text-[10px] font-mono uppercase tracking-widest hover:opacity-90 transition-all shadow-lg shadow-accent/20"
                        >
                          Deel Link Genereren
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Global Interactive Modal */}
      <AdviceModal 
        isOpen={!!selectedForecast} 
        onClose={() => {
          setSelectedForecast(null);
          setAdvice(null);
        }}
        advice={advice}
        forecast={selectedForecast}
        allForecastData={forecast}
        loading={isAdviceLoading}
        spot={selectedSpot}
        user={user}
        onRequestAdvice={handleRequestAdvice}
        onSelectForecastHour={(hourData) => {
          setSelectedForecast(hourData);
          setAdvice(null);
        }}
      />

      {/* Share Notification Portal */}
      {incomingSharedSpot && (
        <div className="fixed bottom-8 right-8 z-[100] max-w-sm w-full glass rounded-3xl p-6 shadow-2xl border border-accent/30 animate-in slide-in-from-right-8 duration-500">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center text-white">
                <MapIcon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold">New Spot Sync</h3>
                <p className="text-[10px] font-mono uppercase text-accent">from {incomingSharedSpot.creatorName}</p>
              </div>
            </div>
            <p className="text-xs text-white/60">
              A private location <strong>{incomingSharedSpot?.name}</strong> has been shared. Add to your local node?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleAddSharedSpot(incomingSharedSpot)}
                className="flex-1 bg-accent text-white py-2 rounded-xl text-[10px] font-mono uppercase tracking-widest"
              >
                Sync Spot
              </button>
              <button
                onClick={() => setIncomingSharedSpot(null)}
                className="px-4 py-2 glass rounded-xl text-[10px] font-mono uppercase text-white/40"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Nav Rail */}
      <nav className="md:hidden fixed bottom-3 left-3 right-3 sm:bottom-6 sm:left-6 sm:right-6 z-50 glass-dark rounded-2xl sm:rounded-3xl px-2 py-2.5 sm:px-4 sm:py-4 flex items-center justify-between border border-white/10 shadow-2xl backdrop-blur-2xl">
        {[
          { id: 'forecast', icon: Waves, label: 'Swell' },
          { id: 'weather', icon: Cloud, label: 'Weer' },
          { id: 'map', icon: MapIcon, label: 'Spots' },
          { id: 'community', icon: Users, label: 'Community' },
          { id: 'report', icon: Camera, label: 'Post' },
          { id: 'profile', icon: UserIcon, label: 'Me' }
        ].map((item) => (
          <button 
            key={item.id}
            onClick={() => {
              if (item.id === 'profile') {
                setIsProfileOpen(true);
                setActiveTab('profile');
              } else {
                handleTabChange(item.id as any);
              }
            }}
            className={`flex flex-col items-center gap-1 transition-all duration-300 flex-1 min-w-0 ${activeTab === item.id ? 'text-accent' : 'text-white/40'}`}
          >
            <item.icon className={cn("w-4 h-4 sm:w-5 sm:h-5 transition-transform", activeTab === item.id && "scale-110")} />
            <span className="text-[7px] sm:text-[8px] font-black uppercase tracking-tighter truncate">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Location Permission Modal */}
      <LocationPermissionModal 
        isOpen={isPermissionModalOpen}
        onClose={() => setIsPermissionModalOpen(false)}
        onGrant={grantLocation}
        reason={permissionReason}
      />

      <FeedbackModal 
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />

      <BetaNoticeModal 
        isOpen={isBetaNoticeOpen}
        onClose={handleCloseBetaNotice}
      />

      <footer className="mt-24 border-t border-white/5 py-16 px-6">
        <div className="max-w-screen-2xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <Logo />
          <div className="flex gap-12 text-[10px] font-mono uppercase tracking-[0.2em] text-white/30">
            <span className="text-white/10">v2.4.0_Stable</span>
            <span>© 2026 NZS.pro Intelligence</span>
            <button className="hover:text-accent transition-colors">Safety Protocol</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
