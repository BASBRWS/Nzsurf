
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'pro';

export interface Board {
  id: string;
  name: string;
  type: 'shortboard' | 'fish' | 'hybrid' | 'funboard' | 'longboard' | 'softtop';
  volume: number; // in liters
  length: string; // e.g. "6'0"
}

export interface Wetsuit {
  id: string;
  thickness: string; // e.g. "5/4", "4/3", "3/2"
  hasHood: boolean;
  hasBoots: boolean;
  hasGloves: boolean;
}

export interface UserProfile {
  uid?: string;
  email?: string;
  displayName?: string;
  weight: number; // in kg
  skillLevel: SkillLevel;
  boards: Board[];
  selectedBoardId?: string;
  wetsuits: Wetsuit[];
  selectedWetsuitId?: string;
  savedSpots?: SurfSpot[];
  favoriteSpotId?: string;
  createdAt?: string; // ISO string
  lastActiveAt?: string; // ISO string
}

export interface SurfSpot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: 'beachbreak' | 'pointbreak' | 'reefbreak';
  bestWind: string[]; // e.g. ["O", "NO", "ZO"]
  bestSwell: string[]; // e.g. ["NW", "W"]
  coastlineAngle: number; // direction the beach faces (e.g. 305 for NW)
  tideStation?: string;
  isAtlantic?: boolean;
  bathymetryProfile?: 'deep_water_approach' | 'gentle_slope' | 'sandbanks' | 'default';
  correction?: {
    waveMultiplier?: number;
    windMultiplier?: number;
    lastUpdated?: string;
    updatedBy?: string;
  };
}

export interface SunscreenAdvice {
  uvIndex: number;
  level: 'low' | 'moderate' | 'high' | 'very_high' | 'extreme';
  levelLabel: string;
  spfRecommendation: string;
  shortAdvice: string;
  details: string;
  needsSunscreen: boolean;
}

export interface ForecastData {
  timestamp: string; // ISO string
  waveHeight: number; // in meters
  swellPeriod: number; // in seconds
  swellDirection: number; // in degrees
  windSpeed: number; // in knots
  windDirection: number; // in degrees
  waterTemp: number; // in Celsius
  airTemp: number; // in Celsius
  isDaylight: boolean;
  uvIndex?: number;
  sunscreenAdvice?: SunscreenAdvice;
  wavePower?: number; // North Sea specific power index (0-100)
  tideHeight?: number; // in meters
  precipitation?: number; // in mm
  conditionCode?: number; // WMO weather code
  windQuality?: number; // 0-100 (100 = perfect offshore)
  windType?: 'offshore' | 'onshore' | 'side-onshore' | 'side-offshore' | 'cross-shore';
  currentRisk?: {
    level: 'low' | 'medium' | 'high';
    description: string;
  };
}

export interface SpotReport {
  id?: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userSkillLevel?: SkillLevel;
  spotId: string;
  spotName: string;
  timestamp: string;
  location: {
    lat: number;
    lng: number;
  };
  forecastAtTime: ForecastData;
  analysis: {
    waveHeight: string;
    windCondition: string;
    matchScore: number; // 1-10
    interpretation: string;
    isMismatched: boolean;
  };
  userNote?: string;
}

export interface WeatherModel {
  id: string;
  name: string;
}

export interface ModelRanking {
  model: WeatherModel;
  rows: any[];
  days: number;
  maeTemp: number;
  biasTemp: number;
  maeWind: number;
  biasWind: number;
  rainHitRate: number;
  misses: number;
  falseAlarms: number;
  wetObserved: number;
  wetForecast: number;
  rainBias: number;
  tempScore: number;
  rainScore: number;
  windScore: number;
  totalScore: number;
}

export interface MixedForecastDay {
  date: string;
  tempModel: string;
  rainModel: string;
  windModel: string;
  temp: number;
  tempCorrected: number;
  rain: number;
  rainRaw: number;
  wind: number;
  windRaw: number;
  cloud: number;
  confidence: number;
}

export interface SharedSpot {
  id?: string;
  creatorId: string;
  creatorName?: string;
  name: string;
  lat: number;
  lng: number;
  type: SurfSpot['type'];
  bestWind: string[];
  bestSwell: string[];
  coastlineAngle: number;
  createdAt: string;
}

export interface SurfAdvice {
  score: number; // 1-10
  title: string;
  description: string;
  recommendedBoardId?: string;
  suitability: 'perfect' | 'good' | 'challenging' | 'dangerous' | 'flat';
  chanceOfSuccess?: number; // 0-100
}

export interface PostComment {
  id?: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: string;
}

export interface CommunityPost {
  id?: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userAvatar?: string;
  imageUrl: string;
  caption?: string;
  timestamp: string; // ISO format
  upvotes?: string[]; // Array of user UIDs
  downvotes?: string[]; // Array of user UIDs
}

export interface BlogPost {
  id?: string;
  title: string;
  excerpt: string;
  content: string;
  authorName: string;
  authorEmail?: string;
  authorAvatar?: string;
  timestamp: string; // ISO format
  imageUrl?: string;
  upvotes?: string[]; // Array of user UIDs
  downvotes?: string[]; // Array of user UIDs
}
