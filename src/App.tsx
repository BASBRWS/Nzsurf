/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { UserProfile, SurfSpot, ForecastData, SurfAdvice, SharedSpot } from './types';
import { INITIAL_USER, DEFAULT_SPOTS } from './constants';
import { getSurfAdvice } from './services/geminiService';
import { fetchForecast } from './services/weatherService';
import { SpotMap } from './components/SpotMap';
import { TacticalDashboard } from './components/TacticalDashboard';
import { TacticalSessionWindow } from './components/TacticalSessionWindow';
import { TacticalAICoach } from './components/TacticalAICoach';
import { ProfileSettings } from './components/ProfileSettings';
import { TacticalBottomNav, TacticalTab } from './components/TacticalBottomNav';
import { WeatherPanel } from './components/WeatherPanel';
import { SpotReport as SpotReportComponent } from './components/SpotReport';
import { CommunitySection } from './components/CommunitySection';
import { LocationPermissionModal } from './components/LocationPermissionModal';
import { FeedbackModal } from './components/FeedbackModal';
import { BetaNoticeModal } from './components/BetaNoticeModal';
import { AdviceModal } from './components/AdviceModal';
import { AddSpotModal } from './components/AddSpotModal';
import { RegionalSeoGuide } from './components/RegionalSeoGuide';
import { 
  Waves, 
  Wind, 
  MapPin, 
  User as UserIcon, 
  Settings, 
  LogOut, 
  Navigation, 
  Share2, 
  ChevronDown, 
  Sparkles,
  Compass,
  Radio,
  Clock,
  MessageSquare,
  Users,
  Maximize2,
  Plus
} from 'lucide-react';
import { cn } from './lib/utils';
import { 
  auth, 
  db, 
  googleProvider,
  signInWithPopup,
  signInWithGoogleSmart,
  signOut,
  onAuthStateChanged, 
  doc, 
  getDoc,
  onSnapshot, 
  setDoc, 
  updateDoc, 
  deleteDoc,
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
  const [sharedSpots, setSharedSpots] = useState<SurfSpot[]>([]);
  const [selectedSpotId, setSelectedSpotId] = useState<string>(DEFAULT_SPOTS[0].id);
  const [forecast, setForecast] = useState<ForecastData[]>([]);
  const [isForecastLoading, setIsForecastLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TacticalTab | 'community' | 'report'>('forecast');
  const [advice, setAdvice] = useState<SurfAdvice | null>(null);
  const [selectedForecastHour, setSelectedForecastHour] = useState<ForecastData | null>(null);
  const [isAdviceLoading, setIsAdviceLoading] = useState(false);
  const [isAdviceModalOpen, setIsAdviceModalOpen] = useState(false);
  const [isAddSpotModalOpen, setIsAddSpotModalOpen] = useState(false);
  const [newSpotInitialCoords, setNewSpotInitialCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number, lng: number } | null>(null);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const [permissionReason, setPermissionReason] = useState('');
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isBetaNoticeOpen, setIsBetaNoticeOpen] = useState(false);

  // Combine default system spots, user's saved/custom spots, and public shared spots
  const allSpots = useMemo<SurfSpot[]>(() => {
    const spotMap = new Map<string, SurfSpot>();
    // 1. Default system spots
    DEFAULT_SPOTS.forEach(s => spotMap.set(s.id, s));
    // 2. User's saved / custom spots from profile or localStorage
    (user.savedSpots || []).forEach(s => spotMap.set(s.id, s));
    // 3. Shared community spots from Firestore
    sharedSpots.forEach(s => spotMap.set(s.id, s));
    return Array.from(spotMap.values());
  }, [user.savedSpots, sharedSpots]);

  // Selected Surf Spot
  const selectedSpot = useMemo(() => 
    allSpots.find(s => s.id === selectedSpotId) || allSpots[0]
  , [selectedSpotId, allSpots]);

  // Listen to community shared spots in Firestore
  useEffect(() => {
    try {
      const qShared = query(collection(db, 'sharedSpots'));
      const unsubscribe = onSnapshot(qShared, (snapshot) => {
        const spotsFromDb: SurfSpot[] = snapshot.docs.map(docSnap => {
          const d = docSnap.data();
          return {
            id: `shared-${docSnap.id}`,
            name: d.name,
            lat: d.lat,
            lng: d.lng,
            type: d.type || 'beachbreak',
            bestWind: d.bestWind || ['O', 'ZO'],
            bestSwell: d.bestSwell || ['NW', 'WNW'],
            coastlineAngle: d.coastlineAngle || 300,
            tideStation: d.tideStation
          };
        });
        setSharedSpots(spotsFromDb);
      }, (err) => {
        console.warn('Could not listen to sharedSpots:', err);
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn('Error setting up sharedSpots listener:', e);
    }
  }, []);

  // Handle URL query parameter (?spot=...) for SEO and direct links
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlSpot = params.get('spot');
      if (urlSpot) {
        const found = allSpots.find(s => s.id === urlSpot);
        if (found) {
          setSelectedSpotId(found.id);
        }
      }
    } catch (e) {
      // Ignore URL parsing errors
    }
  }, [allSpots]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setAuthUser(firebaseUser);
      setIsAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Sync user profile from Firestore or local storage
  useEffect(() => {
    if (!authUser) {
      const localUserStr = localStorage.getItem('nzs_tactical_user');
      if (localUserStr) {
        try {
          setUser(JSON.parse(localUserStr));
        } catch (e) {
          setUser(INITIAL_USER);
        }
      }
      return;
    }

    const userDocRef = doc(db, 'users', authUser.uid);
    const unsubscribe = onSnapshot(userDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data() as UserProfile;
        setUser({
          ...data,
          uid: authUser.uid,
          email: data.email || authUser.email || undefined,
          displayName: data.displayName || authUser.displayName || undefined
        });
      } else {
        const newUser: UserProfile = { 
          ...INITIAL_USER, 
          uid: authUser.uid,
          email: authUser.email || '',
          displayName: authUser.displayName || 'Selmeen_205s',
          savedSpots: [...DEFAULT_SPOTS],
          createdAt: new Date().toISOString()
        };
        setDoc(userDocRef, newUser).catch(console.error);
      }
    });

    return () => unsubscribe();
  }, [authUser]);

  // Fetch live surf forecast data for selected spot
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

  const handleUpdateProfile = async (updatedUser: UserProfile) => {
    setUser(updatedUser);
    if (authUser) {
      try {
        await setDoc(doc(db, 'users', authUser.uid), updatedUser);
      } catch (err) {
        console.error("Error updating user:", err);
      }
    } else {
      localStorage.setItem('nzs_tactical_user', JSON.stringify(updatedUser));
    }
  };

  const handleAddSpot = async (spotData: {
    name: string;
    lat: number;
    lng: number;
    type: 'beachbreak' | 'pointbreak' | 'reefbreak';
    bestWind: string[];
    bestSwell: string[];
    coastlineAngle: number;
    isPublic: boolean;
  }) => {
    const newId = `custom-${Date.now()}`;
    const newSpot: SurfSpot = {
      id: newId,
      name: spotData.name.trim(),
      lat: spotData.lat,
      lng: spotData.lng,
      type: spotData.type,
      bestWind: spotData.bestWind && spotData.bestWind.length > 0 ? spotData.bestWind : ['O', 'ZO', 'NO'],
      bestSwell: spotData.bestSwell && spotData.bestSwell.length > 0 ? spotData.bestSwell : ['NW', 'WNW', 'W'],
      coastlineAngle: spotData.coastlineAngle || 300,
      bathymetryProfile: 'sandbanks'
    };

    // Save into user profile's savedSpots
    const existingSaved = user.savedSpots || [];
    const updatedSaved = [...existingSaved.filter(s => s.id !== newId), newSpot];
    const updatedUser = { 
      ...user, 
      savedSpots: updatedSaved,
      favoriteSpotId: user.favoriteSpotId || newId
    };
    await handleUpdateProfile(updatedUser);

    // If marked public and user is authenticated, also share to sharedSpots in Firestore
    if (spotData.isPublic && authUser) {
      try {
        await addDoc(collection(db, 'sharedSpots'), {
          creatorId: authUser.uid,
          creatorName: authUser.displayName || 'Surfer',
          name: newSpot.name,
          lat: newSpot.lat,
          lng: newSpot.lng,
          type: newSpot.type,
          bestWind: newSpot.bestWind,
          bestSwell: newSpot.bestSwell,
          coastlineAngle: newSpot.coastlineAngle,
          createdAt: new Date().toISOString()
        });
      } catch (err) {
        console.error("Fout bij opslaan van gedeelde spot in Firestore:", err);
      }
    }

    // Automatically select the newly created spot
    setSelectedSpotId(newId);
    setIsAddSpotModalOpen(false);
    setNewSpotInitialCoords(null);
  };

  const handleDeleteSpot = async (spotId: string) => {
    // Prevent deletion of default core North Sea spots
    if (DEFAULT_SPOTS.some(s => s.id === spotId)) {
      alert("Standaard Noordzee spots kunnen niet worden verwijderd.");
      return;
    }

    // Remove from user saved spots
    const existingSaved = user.savedSpots || [];
    const updatedSaved = existingSaved.filter(s => s.id !== spotId);
    await handleUpdateProfile({ ...user, savedSpots: updatedSaved });

    // If it's a shared spot from Firestore, delete document if creator or admin
    if (spotId.startsWith('shared-')) {
      const rawDbId = spotId.replace('shared-', '');
      try {
        await deleteDoc(doc(db, 'sharedSpots', rawDbId));
      } catch (err) {
        console.error("Fout bij verwijderen van gedeelde spot:", err);
      }
    }

    // If currently selected, revert to default spot
    if (selectedSpotId === spotId) {
      setSelectedSpotId(DEFAULT_SPOTS[0].id);
    }
  };

  const handleUpdateSpotLocation = async (spotId: string, lat: number, lng: number) => {
    const existingSaved = user.savedSpots || [];
    const target = existingSaved.find(s => s.id === spotId);
    if (target) {
      const updatedSaved = existingSaved.map(s => s.id === spotId ? { ...s, lat, lng } : s);
      await handleUpdateProfile({ ...user, savedSpots: updatedSaved });
    }
  };

  const handleLogin = async () => {
    try {
      await signInWithGoogleSmart();
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const handleTriggerQuickAction = async () => {
    // Quick action: switch to AI Tactical Coach and run live analysis
    setActiveTab('ai');
    if (!forecast[0]) return;
    setIsAdviceLoading(true);
    try {
      const res = await getSurfAdvice(user, selectedSpot, forecast[0], []);
      setAdvice(res);
    } catch (e) {
      console.error(e);
    } finally {
      setIsAdviceLoading(false);
    }
  };

  const currentForecastData = forecast[0] || null;

  return (
    <div className="min-h-screen bg-[#F0F4F8] text-slate-800 font-sans antialiased overflow-x-hidden selection:bg-cyan-500 selection:text-slate-950">
      
      {/* Background Soft Coastal Atmospheric Gradients */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-cyan-100/60 rounded-full blur-3xl" />
        <div className="absolute bottom-10 right-1/4 w-[500px] h-[500px] bg-blue-100/60 rounded-full blur-3xl" />
      </div>

      {/* Main Responsive App Container */}
      <div className="relative z-10 w-full max-w-4xl lg:max-w-5xl mx-auto px-2 sm:px-4 py-2 sm:py-5 pb-28">
        
        {/* Tactical App Top Bar in Crisp Light Theme */}
        <header className="sticky top-2 z-40 bg-white/90 backdrop-blur-xl border border-slate-200/90 rounded-2xl px-4 py-3 mb-4 flex items-center justify-between shadow-xs">
          
          {/* Logo & Spot Quick Selector */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 p-0.5 shadow-sm">
              <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center text-cyan-600 font-tactical font-black text-sm">
                NZ
              </div>
            </div>

            <div className="relative group flex items-center gap-1.5">
              <div className="flex items-center gap-1.5 cursor-pointer">
                <span className="text-sm font-black font-tactical uppercase tracking-wider text-slate-900 truncate max-w-[140px] sm:max-w-none">
                  {selectedSpot.name}
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-cyan-600 group-hover:translate-y-0.5 transition-transform" />
              </div>
              <select
                value={selectedSpotId}
                onChange={(e) => {
                  if (e.target.value === '__NEW_SPOT__') {
                    setNewSpotInitialCoords(null);
                    setIsAddSpotModalOpen(true);
                  } else {
                    setSelectedSpotId(e.target.value);
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full"
                aria-label="Kies Noordzee surfspot"
              >
                {allSpots.map((spot) => {
                  const isCustom = spot.id.startsWith('custom-') || spot.id.startsWith('shared-');
                  return (
                    <option key={spot.id} value={spot.id} className="bg-white text-slate-900 font-sans text-xs">
                      {spot.name} {isCustom ? '★ (Eigen Spot)' : ''}
                    </option>
                  );
                })}
                <option value="__NEW_SPOT__" className="bg-cyan-50 text-cyan-900 font-bold text-xs">
                  ➕ Nieuwe spot aanmaken...
                </option>
              </select>
            </div>

            <h1 className="sr-only">nzsurf - Noordzee Surf Voorspelling & Live Golfhoogte</h1>
          </div>

          {/* Top Right Quick Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setNewSpotInitialCoords(null);
                setIsAddSpotModalOpen(true);
              }}
              className="px-2.5 py-1 rounded-full text-[10px] font-tactical font-black uppercase tracking-wider bg-slate-900 hover:bg-cyan-600 text-white flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
              title="Nieuwe surfspot toevoegen"
            >
              <Plus className="w-3 h-3 text-cyan-400 stroke-[3]" />
              <span className="hidden sm:inline">Spot</span>
            </button>

            <button
              onClick={() => setActiveTab('spots')}
              className={`
                px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-widest border transition-all flex items-center gap-1.5 cursor-pointer
                ${activeTab === 'spots' 
                  ? 'bg-cyan-50 text-cyan-800 border-cyan-300 shadow-xs' 
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}
              `}
            >
              <Radio className="w-3 h-3 text-cyan-600" />
              <span>KAART</span>
            </button>

            {authUser ? (
              <button 
                onClick={() => setActiveTab('profile')}
                className="w-7 h-7 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center text-cyan-600 overflow-hidden cursor-pointer"
              >
                {authUser.photoURL ? (
                  <img src={authUser.photoURL} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <UserIcon className="w-4 h-4 text-slate-700" />
                )}
              </button>
            ) : (
              <button
                onClick={handleLogin}
                className="px-3 py-1 rounded-full bg-slate-900 text-white font-tactical font-black text-xs uppercase tracking-wider shadow-sm hover:bg-cyan-600 transition-colors cursor-pointer"
              >
                INLOGGEN
              </button>
            )}
          </div>
        </header>

        {/* Main Content View Switcher */}
        <main className="space-y-5">
          <AnimatePresence mode="wait">
            {/* View 1: Tactical Dashboard / Swell (Frame 00:00 in Light Theme) */}
            {activeTab === 'forecast' && (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <TacticalDashboard 
                  spot={selectedSpot}
                  currentForecast={currentForecastData}
                  forecasts={forecast}
                  user={user}
                  isLoggedIn={!!authUser}
                  onSelectForecastHour={async (selectedHourData) => {
                    setSelectedForecastHour(selectedHourData);
                    setIsAdviceModalOpen(true);
                    setIsAdviceLoading(true);
                    try {
                      const nearby = allSpots.filter(s => s.id !== selectedSpot.id);
                      const res = await getSurfAdvice(user, selectedSpot, selectedHourData, nearby);
                      setAdvice(res);
                    } catch (e) {
                      console.error(e);
                    } finally {
                      setIsAdviceLoading(false);
                    }
                  }}
                  onOpenSessionWindow={() => setActiveTab('window')}
                  onOpenAICoach={() => setActiveTab('ai')}
                  onOpenMap={() => setActiveTab('spots')}
                  onOpenProfile={() => setActiveTab('profile')}
                />
              </motion.div>
            )}

            {/* View 2: Real Interactive OpenStreetMap Coastline Map (SPOTS) */}
            {activeTab === 'spots' && (
              <motion.div
                key="map"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                <SpotMap 
                  spots={allSpots}
                  selectedSpotId={selectedSpotId}
                  onSelectSpot={(id) => {
                    setSelectedSpotId(id);
                  }}
                  onCustomSpot={(lat, lng) => {
                    setNewSpotInitialCoords({ lat, lng });
                    setIsAddSpotModalOpen(true);
                  }}
                  onOpenAddSpot={() => {
                    setNewSpotInitialCoords(null);
                    setIsAddSpotModalOpen(true);
                  }}
                  onUpdateSpotLocation={handleUpdateSpotLocation}
                  onDeleteSpot={handleDeleteSpot}
                  forecasts={{ [selectedSpotId]: forecast[0] }}
                  userCoords={userCoords}
                />
              </motion.div>
            )}

            {/* View 3: Best Session Window Matcher (Frame 00:03 in Light Theme) */}
            {activeTab === 'window' && (
              <motion.div
                key="window"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <TacticalSessionWindow 
                  spot={selectedSpot}
                  currentForecast={currentForecastData}
                  user={user}
                  onOpenAICoach={() => setActiveTab('ai')}
                  onOpenQuiver={() => setActiveTab('profile')}
                />
              </motion.div>
            )}

            {/* View 4: AI Tactical Coach & Hour-by-Hour Analysis (Frame 00:05 in Light Theme) */}
            {activeTab === 'ai' && (
              <motion.div
                key="ai"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <TacticalAICoach 
                  spot={selectedSpot}
                  currentForecast={currentForecastData}
                  user={user}
                  onOpenQuiver={() => setActiveTab('profile')}
                />
              </motion.div>
            )}

            {/* View 5: Rider Profile & Quiver (Frame 00:02 in Light Theme) */}
            {activeTab === 'profile' && (
              <motion.div
                key="profile"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <ProfileSettings 
                  user={user}
                  onUpdate={handleUpdateProfile}
                  allSpots={allSpots}
                  currentForecast={currentForecastData || forecast[0]}
                  onShareSpot={(spot) => console.log('Share spot', spot)}
                  onOpenAddSpot={() => {
                    setNewSpotInitialCoords(null);
                    setIsAddSpotModalOpen(true);
                  }}
                  onDeleteSpot={handleDeleteSpot}
                  onSelectSpot={(id) => setSelectedSpotId(id)}
                  selectedSpotId={selectedSpotId}
                />
              </motion.div>
            )}

            {/* View 6: Weather Atmosphere Models */}
            {activeTab === 'weather' && (
              <motion.div
                key="weather"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <WeatherPanel spot={selectedSpot} />
              </motion.div>
            )}

            {/* View 7: Community Feed */}
            {activeTab === 'community' && (
              <motion.div
                key="community"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <CommunitySection />
              </motion.div>
            )}

            {/* View 8: Spot Report */}
            {activeTab === 'report' && (
              <motion.div
                key="report"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <SpotReportComponent 
                  spots={allSpots}
                  currentForecasts={{ [selectedSpotId]: forecast[0] }}
                  initialSpotId={selectedSpotId}
                  onComplete={() => setActiveTab('forecast')}
                  user={user}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Regional SEO Guide & Spot Navigation */}
        <RegionalSeoGuide 
          spots={allSpots}
          selectedSpotId={selectedSpotId}
          onSelectSpot={(spotId) => setSelectedSpotId(spotId)}
        />

        {/* Tactical Bottom Navigation with (+) Quick Action Button */}
        <TacticalBottomNav 
          activeTab={activeTab as TacticalTab}
          onSelectTab={(tab) => setActiveTab(tab)}
          onQuickAction={handleTriggerQuickAction}
        />
      </div>

      {/* Auxiliary Modals */}
      <LocationPermissionModal 
        isOpen={isPermissionModalOpen}
        onClose={() => setIsPermissionModalOpen(false)}
        onGrant={() => setIsPermissionModalOpen(false)}
        reason={permissionReason}
      />

      <FeedbackModal 
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />

      <BetaNoticeModal 
        isOpen={isBetaNoticeOpen}
        onClose={() => setIsBetaNoticeOpen(false)}
      />

      <AdviceModal 
        advice={advice}
        isOpen={isAdviceModalOpen}
        onClose={() => {
          setIsAdviceModalOpen(false);
          setAdvice(null);
          setSelectedForecastHour(null);
        }}
        spot={selectedSpot}
        user={user}
        forecast={selectedForecastHour || currentForecastData}
        allForecastData={forecast}
        loading={isAdviceLoading}
        onSelectForecastHour={async (h) => {
          setSelectedForecastHour(h);
          setAdvice(null);
          setIsAdviceLoading(true);
          try {
            const nearby = allSpots.filter(s => s.id !== selectedSpot.id);
            const res = await getSurfAdvice(user, selectedSpot, h, nearby);
            setAdvice(res);
          } catch (e) {
            console.error(e);
          } finally {
            setIsAdviceLoading(false);
          }
        }}
        onRequestAdvice={async (hourData) => {
          if (!hourData && !selectedForecastHour && !currentForecastData) return;
          setIsAdviceLoading(true);
          try {
            const targetHour = hourData || selectedForecastHour || currentForecastData!;
            const nearby = allSpots.filter(s => s.id !== selectedSpot.id);
            const res = await getSurfAdvice(user, selectedSpot, targetHour, nearby);
            setAdvice(res);
          } catch (e) {
            console.error(e);
          } finally {
            setIsAdviceLoading(false);
          }
        }}
      />

      <AddSpotModal
        isOpen={isAddSpotModalOpen}
        onClose={() => {
          setIsAddSpotModalOpen(false);
          setNewSpotInitialCoords(null);
        }}
        onAddSpot={handleAddSpot}
        initialCoords={newSpotInitialCoords}
        isLoggedIn={!!authUser}
      />
    </div>
  );
}
