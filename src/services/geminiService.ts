import { UserProfile, SurfSpot, ForecastData, SurfAdvice, SpotReport } from "../types";
import { logAppError } from "./loggerService";
import { isOuddorpNoordwegKiteZone, getKiteAlert } from "../utils/kiteAlertUtils";
import { apiUrl } from "../lib/api";

async function callGenerateContent(options: { model: string; contents: any; config?: any }) {
  const url = apiUrl('/api/gemini/generateContent');
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options)
  });

  const rawText = await response.text();
  let data: any;
  try {
    data = JSON.parse(rawText);
  } catch {
    throw new Error(`Server endpoint gaf geen JSON terug (HTTP ${response.status}): ${rawText.slice(0, 120)}`);
  }

  if (!response.ok) {
    throw new Error(data?.error || `API request failed with status ${response.status}`);
  }
  return data;
}

/**
 * Fallback local advisory engine to calculate highly accurate and personalized
 * Noordzee surf advice entirely offline if Gemini APIs are throttled or down.
 */
export function generateLocalSurfAdvice(
  user: UserProfile,
  spot: SurfSpot,
  forecast: ForecastData,
  nearbySpots: SurfSpot[] = []
): SurfAdvice {
  const userBoards = user.boards || [];
  const userWetsuits = user.wetsuits || [];
  const waveHeight = forecast?.waveHeight || 0;
  const swellPeriod = forecast?.swellPeriod || 0;
  const windSpeed = forecast?.windSpeed || 0;
  const waterTemp = forecast?.waterTemp || 12;
  const skill = user?.skillLevel || 'beginner';
  const weight = user?.weight > 0 ? user.weight : 75;

  let suitability: 'perfect' | 'good' | 'challenging' | 'dangerous' | 'flat' = 'good';
  let title = "Sessie Beoordeling: Redelijk";
  let thoughts: string[] = [
    "⚠️ *Let op: Dit advies is berekend o.b.v. jouw profiel en geregistreerde gear.*"
  ];

  // Basis = dezelfde conditie-score als de live telemetrie (surf-kwaliteit, los
  // van persoon/gear), zodat het advies niet wild afwijkt van die getoonde score.
  let base = 5.0;
  if (waveHeight >= 0.7 && waveHeight <= 2.2) base += 2.0;
  else if (waveHeight >= 0.4 && waveHeight < 0.7) base += 1.0;
  else if (waveHeight < 0.3) base -= 2.5;
  else if (waveHeight > 2.5) base -= 1.0;

  if (swellPeriod >= 8) base += 1.5;
  else if (swellPeriod >= 6) base += 0.5;
  else if (swellPeriod <= 4) base -= 1.0;

  if (forecast?.windType === 'offshore') base += 2.0;
  else if (forecast?.windType === 'side-offshore') base += 1.0;
  else if (forecast?.windType === 'side-onshore') base -= 0.5;
  else if (forecast?.windType === 'onshore') base += windSpeed > 16 ? -2.0 : -1.0;

  base = Math.max(1, Math.min(10, base));

  // Beschrijvende thoughts (wind & periode)
  if (waveHeight < 0.25) {
    thoughts.push("De golven zijn nagenoeg nihil of te klein voor een fatsoenlijke rit. Perfecte dag voor suppen of peddel-training!");
  } else {
    if (forecast?.windType === 'offshore') thoughts.push("Geweldig! Er waait een cleane offshore wind, wat de golven mooi open houdt en ritsen creëert.");
    else if (forecast?.windType === 'side-offshore') thoughts.push("De side-offshore wind zorgt voor redelijk georganiseerde en goed berijdbare golven.");
    else if (forecast?.windType === 'side-onshore') thoughts.push(windSpeed > 16 ? `Stevige side-onshore wind (${windSpeed} kn) maakt de zee rommelig en vraagt kracht om positie te houden.` : "Lichte side-onshore wind; nog redelijk berijdbaar.");
    else if (forecast?.windType === 'onshore') thoughts.push(windSpeed > 15 ? "Er staat een stevige onshore wind wat de zee erg rommelig (choppy) maakt." : "Lichte onshore wind zorgt voor wat kabbel, maar is nog wel berijdbaar.");

    if (swellPeriod >= 8) thoughts.push(`Goede swellperiode van ${swellPeriod}s zorgt voor krachtigere en beter gevormde golven.`);
    else if (swellPeriod <= 5) thoughts.push(`Korte periode (${swellPeriod}s). De golven hebben weinig kracht en volgen elkaar erg snel op.`);
  }

  // Getij (thought + lichte aanpassing)
  let tideAdj = 0;
  const tideHeight = forecast?.tideHeight || 0;
  if (spot.isAtlantic) {
    if (tideHeight >= 3.0) { tideAdj = -1.5; thoughts.push(`🌊 **Getijden Advies (Vloed):** Vrijwel volle vloed (${tideHeight}m). Op Atlantische beachbreaks leidt dit tot volle/dichtklappende golven of een zware shorebreak. Mid-tide opkomend is veruit beter.`); }
    else if (tideHeight >= 1.5) { tideAdj = 1; thoughts.push(`🌊 **Getijden Advies (Mid-tide):** Gunstige getijdenfase (${tideHeight}m)! Mid-tide opkomend water laat de Atlantische swell het mooist breken op de buitenste zandbanken.`); }
    else { thoughts.push(`🌊 **Getijden Advies (Laagtij / Eb):** Rond laagtij (${tideHeight}m) kunnen golven snel en hol dichtklappen op het ondiepe zand. Wees alert op de baïnes (muistromen).`); }
  } else {
    if (tideHeight >= 1.8) { tideAdj = -1; thoughts.push(`🌊 **Getijden Advies (Hoogtij):** Bij hoogtij (${tideHeight}m) kunnen golven wat dikker worden en korter op het strand breken.`); }
    else if (tideHeight >= 0.5) { tideAdj = 1; thoughts.push(`🌊 **Getijden Advies (Mid-tide):** Uitstekend getijde-venster (${tideHeight}m) voor de Nederlandse Noordzeekust.`); }
  }

  // Niveau-afstemming (persoonlijk, begrensd)
  let skillAdj = 0;
  if (skill === 'beginner') {
    if (waveHeight >= 0.4 && waveHeight <= 1.0) { skillAdj = 0.8; thoughts.push("De golfhoogte is ideaal voor jouw beginnersniveau om balans en bochten te oefenen."); }
    else if (waveHeight > 1.2) { skillAdj = -1.8; thoughts.push("De golven zijn aan de hoge en krachtige kant voor een beginner. Ga alleen als je je 100% comfortabel voelt, liefst met begeleiding."); }
  } else if (skill === 'intermediate') {
    if (waveHeight >= 0.6 && waveHeight <= 1.5) { skillAdj = 0.6; thoughts.push("Heerlijke condities voor een intermediate surfer om ritten te verlengen en bochten in te zetten."); }
    else if (waveHeight > 1.8) { skillAdj = -0.8; thoughts.push("De golven zijn aan de flinke kant. Een mooie uitdaging, maar let goed op stromingen."); }
  } else {
    if (waveHeight >= 0.8 && waveHeight <= 2.0) { skillAdj = 0.8; thoughts.push("Uitstekende condities voor jouw niveau! Genoeg muur en secties om manoeuvres uit te voeren."); }
  }

  // Veiligheid: gebruik de ECHTE risicobeschrijving (geen onterechte "extreem hoge golven").
  let riskAdj = 0;
  if (forecast?.currentRisk?.level === 'high') {
    riskAdj = -1.5;
    thoughts.push(`⚠️ **Veiligheid:** ${forecast.currentRisk.description} Houd extra marge en ga bij voorkeur niet alleen het water op.`);
  } else if (forecast?.currentRisk?.level === 'medium') {
    riskAdj = -0.5;
    thoughts.push(`⚠️ **Let op:** ${forecast.currentRisk.description}`);
  }

  let score = base + tideAdj + skillAdj + riskAdj;

  // Harde gevaar-cap uitsluitend bij écht zware condities (niet bij matige golven).
  if (waveHeight > 2.5 || (forecast?.currentRisk?.level === 'high' && waveHeight > 2.0)) {
    suitability = 'dangerous';
    score = Math.min(score, 3);
    thoughts.push(`🛑 **Zware condities:** golven van ${waveHeight.toFixed(1)}m${forecast?.currentRisk?.level === 'high' ? ' met sterke stroming' : ''}. Alleen voor zeer ervaren surfers; twijfel je, blijf dan aan wal.`);
  }

  score = Math.max(1, Math.min(10, Math.round(score)));

  // Setup & Board evaluation (evaluate all boards in user's possession)
  let bestBoard = userBoards.find(b => b.id === user.selectedBoardId) || userBoards[0];
  let quiverScoreBonus = 0;

  if (userBoards.length > 0) {
    // Score all boards in setup
    const evaluated = userBoards.map(b => {
      const vol = b.volume || 35;
      let match = 70;
      if (waveHeight < 0.5) {
        if (b.type === 'longboard' || b.type === 'softtop' || vol >= 50) match = 95;
        else if (b.type === 'fish' || vol >= 38) match = 80;
        else match = 40;
      } else if (waveHeight <= 1.4) {
        if (b.type === 'fish' || b.type === 'hybrid' || b.type === 'shortboard') match = 95;
        else if (b.type === 'funboard') match = 88;
        else match = 80;
      } else {
        if (b.type === 'shortboard' || b.type === 'hybrid') match = 96;
        else if (b.type === 'fish') match = 82;
        else match = 50;
      }
      return { board: b, match };
    });

    evaluated.sort((a, b) => b.match - a.match);
    bestBoard = evaluated[0].board;
    const topMatch = evaluated[0].match;

    if (topMatch >= 90) {
      quiverScoreBonus = 1;
      thoughts.push(`🏄 **Setup Match (Uitstekend):** Jouw **${bestBoard.name}** (${bestBoard.type}, ${bestBoard.volume}L) is de ideale keuze uit je setup voor deze ${waveHeight}m golven!`);
    } else if (topMatch >= 75) {
      thoughts.push(`🏄 **Setup Keuze:** Uit jouw setup raden we de **${bestBoard.name}** (${bestBoard.type}, ${bestBoard.volume}L) aan voor deze sessie.`);
    } else {
      quiverScoreBonus = -1;
      thoughts.push(`⚠️ **Setup Mismatch:** Je geregistreerde boards zijn wat krap qua drijfvermogen voor de huidige ${waveHeight}m golfenergie. Met een board met meer volume zou je meer golven pakken.`);
    }

    if (userBoards.length > 1) {
      const otherBoards = evaluated.slice(1).map(e => `${e.board.name} (${e.match}%)`).join(', ');
      thoughts.push(`📋 **Overige boards in je setup:** ${otherBoards}`);
    }
  } else {
    thoughts.push("**Gear Advies:** Er zijn nog geen specifieke surfplanken toegevoegd aan je profiel. Voeg je setup toe voor exacte plank-matches.");
  }

  // Wetsuit evaluation based on temperature and user's wetsuits
  if (userWetsuits.length > 0) {
    const wetsuit = userWetsuits.find(w => w.id === user.selectedWetsuitId) || userWetsuits[0];
    if (waterTemp < 10) {
      if (!wetsuit.hasHood || !wetsuit.hasBoots || !wetsuit.hasGloves) {
        thoughts.push(`🤿 **Wetsuit Advies:** IJskoud water (${waterTemp}°C)! Jouw geregistreerde **${wetsuit.thickness}** mist enkele accessoires. Een cap/hood, neopreen boots en handschoenen zijn essentieel tegen onderkoeling.`);
      } else {
        thoughts.push(`🤿 **Wetsuit Advies:** Perfecte set-up uit je kast! Jouw **${wetsuit.thickness}** met hood, boots en gloves beschermt je optimaal tegen het ${waterTemp}°C water.`);
      }
    } else if (waterTemp >= 10 && waterTemp < 14) {
      if (!wetsuit.hasBoots) {
        thoughts.push(`🤿 **Wetsuit Advies:** Fris water (${waterTemp}°C). Jouw **${wetsuit.thickness}** volstaat, maar neopreen boots worden aangeraden.`);
      } else {
        thoughts.push(`🤿 **Wetsuit Advies:** Uitstekende wetsuitkeuze (${wetsuit.thickness} + boots) voor ${waterTemp}°C watertemperatuur.`);
      }
    } else {
      thoughts.push(`🤿 **Wetsuit Advies:** De watertemperatuur is mild (${waterTemp}°C). Jouw **${wetsuit.thickness}** wetsuit is comfortabel.`);
    }
  } else {
    thoughts.push(`🤿 **Wetsuit Advies:** Geen wetsuit geregistreerd. Bij ${waterTemp}°C watertemperatuur adviseren we ${waterTemp < 12 ? '5/4mm + boots' : waterTemp < 16 ? '4/3mm fullsuit' : '3/2mm fullsuit'}.`);
  }

  // Sunscreen & UV protection check
  if (forecast?.sunscreenAdvice && forecast.sunscreenAdvice.needsSunscreen) {
    thoughts.push(`☀️ **Zonbescherming:** ${forecast.sunscreenAdvice.shortAdvice} (${forecast.sunscreenAdvice.spfRecommendation}). Let op reflectie van het water.`);
  }

  // Kite Alert for Ouddorp P Noordweg zone (+100m N / -200m S)
  const kiteAlert = getKiteAlert(spot, forecast);
  if (kiteAlert.isZone && kiteAlert.isFavorable) {
    thoughts.push(`🪁 **Kite Waarschuwing (P Noordweg Zone):** ${kiteAlert.fullWarning}`);
  }

  // Nearby spots reminder (only if valid named spots exist)
  const validNearbySpots = (nearbySpots || []).filter(s => s && typeof s.name === 'string' && s.name.trim().length > 0 && s.id !== spot?.id);
  if (validNearbySpots.length > 0) {
    const backupSpotNames = validNearbySpots.slice(0, 2).map(s => s.name).join(' en ');
    thoughts.push(`📍 **Alternatieve Spots:** Als de condities op ${spot?.name || 'deze spot'} toch tegenvallen, kun je uitwijken naar **${backupSpotNames}**.`);
  }

  // Final adjusted score incorporating quiver
  score = Math.max(1, Math.min(10, score + quiverScoreBonus));

  if (score >= 8) {
    suitability = 'perfect';
    title = "Sessie Beoordeling: Uitstekend!";
  } else if (score >= 6) {
    suitability = 'good';
    title = "Sessie Beoordeling: Goede Sessie";
  } else if (score >= 4) {
    suitability = 'challenging';
    title = "Sessie Beoordeling: Uitdagend";
  } else {
    suitability = 'challenging';
    title = "Sessie Beoordeling: Matig";
  }

  const chanceOfSuccess = Math.min(100, Math.max(0, score * 10));

  return {
    score,
    title,
    description: thoughts.join("\n\n"),
    suitability,
    chanceOfSuccess,
    recommendedBoardId: bestBoard?.id
  };
}

export async function analyzeSpotPhoto(
  photoBase64: string,
  spot: SurfSpot,
  forecast: ForecastData
): Promise<SpotReport['analysis']> {
  if (!spot) throw new Error("Spot is required for analysis");
  
  const prompt = `
    Je bent een expert surf-analist. Je krijgt een foto van een surfspot (${spot?.name || 'Onbekend'}) en de bijbehorende voorspelling.
    Analyseer de foto en vergelijk deze met de voorspelling:
    
    VOORSPELLING:
    - Golfhoogte: ${forecast.waveHeight}m
    - Periode: ${forecast.swellPeriod}s
    - Wind: ${forecast.windSpeed} knopen uit ${forecast.windDirection}°
    
    GEEF JE ANALYSE IN JSON FORMAAT:
    - waveHeight: jouw schatting van de golfhoogte (tekstueel, bijv. "0.5-0.8m")
    - windCondition: jouw schatting van de wind (bijv. "Lichte offshore", "Sterke onshore")
    - matchScore: hoe goed de foto matcht met de voorspelling (1-10)
    - interpretation: een korte uitleg (1-2 zinnen) van wat je ziet vs de voorspelling.
    - isMismatched: true als de foto duidelijk afwijkt van de voorspelling (bijv. voorspeld 2m maar het is flat, of omgekeerd).
    
    Gebruik GEEN markdown blokken, alleen pure JSON.
  `;

  try {
    const response = await callGenerateContent({
      model: "gemini-3.7-flash",
      contents: [
        {
          inlineData: {
            data: photoBase64.split(",")[1] || photoBase64,
            mimeType: "image/jpeg"
          }
        },
        {
          text: prompt
        }
      ]
    });

    const text = response.text || "{}";
    const cleanedJson = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanedJson);
  } catch (error) {
    await logAppError("photo_analysis_error", "Error analyzing spot photo via Gemini API", { spotId: spot.id, spotName: spot.name }, error);
    throw error;
  }
}

export async function analyzeWaveVideo(
  frames: string[],
  spot: SurfSpot,
  forecast: ForecastData
): Promise<SpotReport['analysis']> {
  if (!spot) throw new Error("Spot is required for analysis");
  
  const prompt = `
    Je bent een expert surf-analist. Je krijgt een reeks van 4 beelden (frames) van een video van een surfspot (${spot?.name || 'Onbekend'}).
    De beelden tonen de actuele zee-condities over een periode van een paar seconden.
    
    VERGELIJK DE BEELDEN MET DE VOLGENDE VOORSPELLING:
    - Golfhoogte: ${forecast.waveHeight}m
    - Periode: ${forecast.swellPeriod}s
    - Wind: ${forecast.windSpeed} knopen uit ${forecast.windDirection}°
    
    ANALYSEER OP BASIS VAN DE VIDEODATA:
    1. Zijn de golven hoger of lager dan voorspeld?
    2. Hoe is de golfvorm (clean, choppy)?
    3. Is er sprake van een mismatch tussen wat de camera ziet en de data?
    
    GEEF JE ANALYSE IN JSON FORMAAT:
    - waveHeight: jouw schatting van de golfhoogte op basis van de beelden (bijv. "1.0m - 1.2m")
    - windCondition: jouw schatting van de wind (bijv. "Clean offshore", "Zware onshore windkracht")
    - matchScore: hoe goed de beelden matchen met de voorspelling (1-10)
    - interpretation: een bondige, professionele uitleg (max 2 zinnen) van de discrepantie of overeenkomst.
    - isMismatched: true als de beelden duidelijk iets anders tonen dan de voorspelling.
    
    Gebruik GEEN markdown blokken, alleen pure JSON.
  `;

  try {
    const response = await callGenerateContent({
      model: "gemini-3.7-flash",
      contents: [
        ...frames.map(frame => ({
          inlineData: {
            data: frame.split(",")[1] || frame,
            mimeType: "image/jpeg"
          }
        })),
        {
          text: prompt
        }
      ]
    });

    const text = response.text || "{}";
    const cleanedJson = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleanedJson);
  } catch (error) {
    await logAppError("video_analysis_error", "Error analyzing wave video via Gemini API", { spotId: spot.id, spotName: spot.name }, error);
    throw error;
  }
}

export async function getSurfAdvice(
  user: UserProfile,
  spot: SurfSpot,
  forecast: ForecastData,
  nearbySpots: SurfSpot[] = []
): Promise<SurfAdvice> {
  if (!spot) throw new Error("Spot is required for advice");

  const board = user.boards?.find(b => b.id === user.selectedBoardId) || user.boards?.[0];
  const wetsuit = user.wetsuits?.find(w => w.id === user.selectedWetsuitId) || user.wetsuits?.[0];

  const validNearbySpots = (nearbySpots || []).filter(s => s && typeof s.name === 'string' && s.name.trim().length > 0 && s.id !== spot?.id);
  const nearbyInfo = validNearbySpots.length > 0 
    ? `ER ZIJN ANDERE SPOTS DICHTBIJ (BINNEN 5KM VAN DE GEBRUIKER): 
       ${validNearbySpots.map(s => `- ${s.name} (${s.type || 'beachbreak'}, beste wind: ${(s.bestWind || []).join(', ')})`).join('\n')}`
    : '';

  const isSoulac = spot.id === 'soulac-sandaya' || spot.name.toLowerCase().includes('soulac');

  const coachRole = spot.isAtlantic
    ? (isSoulac
        ? "Je bent een expert surfcoach voor de Gironde / Médoc kust bij Camping Sandaya Soulac Plage (Soulac-sur-Mer). Geef advies passend bij een krachtige Atlantische beachbreak met zandbanken bij de monding van de Gironde, sterke getijdestromingen en actieve baïnes (muistromen). Mid-tide opkomend water is op deze spot vaak het mooist."
        : "Je bent een expert surfcoach voor de Franse Atlantische kust (Les Landes & Gironde). Geef advies passend bij een krachtige Atlantische beachbreak met baïnes (muistromen).")
    : "Je bent een expert surfcoach voor de Nederlandse Noordzee.";

  const powerIndexName = spot.isAtlantic
    ? "Atlantische Ocean Power Index"
    : "Noordzee Power Index";

  const tideHeightContext = spot.isAtlantic
    ? `- Getij: ${forecast.tideHeight || 0}m (Relatief t.o.v. gemiddeld zeeniveau. BEOORDELING GETIJ: Op Atlantische beachbreaks zoals Soulac Plage is volle vloed (hoge waterstand >3m) ongunstig vanwege volle/dichtklappende golven en harde shorebreak. Mid-tide opkomend/afgaand is veruit het beste!)`
    : `- Getij: ${forecast.tideHeight || 0}m (Relatief t.o.v. NAP)`;

  const quiverBoardsStr = (user.boards && user.boards.length > 0)
    ? user.boards.map(b => `- ${b.name} (${b.type}, ${b.volume}L, ${b.length}) ${b.id === user.selectedBoardId ? '[HUIDIG GESELECTEERD]' : ''}`).join('\n    ')
    : 'Geen boards geregistreerd in profiel';

  // ... existing code ...
  const userWetsuitsStr = (user.wetsuits && user.wetsuits.length > 0)
    ? user.wetsuits.map(w => `- ${w.thickness} (Hood: ${w.hasHood ? 'Ja' : 'Nee'}, Boots: ${w.hasBoots ? 'Ja' : 'Nee'}, Gloves: ${w.hasGloves ? 'Ja' : 'Nee'})`).join('\n    ')
    : 'Geen wetsuits geregistreerd in profiel';

  let recommendedBoardsStr = '';
  try {
    const res = await fetch('/surfboard-dataset-TOTAAL-1024.json');
    if (res.ok) {
      const data = await res.json();
      const sizesMap = data.dropdowns?.sizes_by_brand_model || {};
      let allBoards: any[] = [];
      
      for (const brand in sizesMap) {
        for (const model in sizesMap[brand]) {
          const boards = sizesMap[brand][model];
          if (Array.isArray(boards)) {
            boards.forEach(b => {
               allBoards.push({ brand, model, ...b });
            });
          }
        }
      }
      
      const weight = user.weight || 75;
      const skill = user.skillLevel || 'intermediate';
      const waveHeight = forecast.waveHeight || 1;
      
      let targetVolume = weight * 0.45; 
      if (skill === 'beginner') targetVolume = weight * 0.85;
      if (skill === 'advanced') targetVolume = weight * 0.35;
      
      const matches = allBoards.filter(b => {
         if (!b.volume_l) return false;
         const diff = Math.abs(b.volume_l - targetVolume);
         return diff < 15;
      });
      
      matches.forEach(b => {
         let matchScore = 15 - Math.abs(b.volume_l - targetVolume);
         if (waveHeight < 0.6) {
            if (b.volume_l > targetVolume) matchScore += 5;
            if (b.lengte_cm > 230) matchScore += 5;
         } else if (waveHeight > 1.5) {
            if (b.volume_l < targetVolume + 2) matchScore += 5;
            if (b.lengte_cm < 210) matchScore += 3;
         }
         b._matchScore = matchScore;
      });
      
      matches.sort((a, b) => (b._matchScore || 0) - (a._matchScore || 0));
      const topMatches = matches.slice(0, 8);
      
      if (topMatches.length > 0) {
        recommendedBoardsStr = topMatches.map(b => `- ${b.brand} ${b.model} ${b.maat_label} (${b.volume_l}L, Lengte: ${Math.round(b.lengte_cm)}cm)`).join('\n    ');
      }
    }
  } catch (error) {
    console.error("Could not fetch board dataset for recommendations", error);
  }

  const prompt = `
    ${coachRole}
    Gebruik de volgende gegevens om een deskundige, persoonlijke sessie-evaluatie en score te berekenen.
    
    BELANGRIJK: De score (1-10) en het advies MOETEN berekend worden op basis van het gear dat deze specifieke surfer in bezit heeft!
    - Kies het beste board uit de setup van de surfer voor deze condities.
    - Als de surfer alleen een board heeft dat ongeschikt is (bijv. een 28L shortboard bij 0.3m golfjes), pas de score daarop aan (lagere score wegens gear mismatch) en leg dit uit.
    - Als de surfer juist het perfecte board in bezit heeft (bijv. een 65L longboard of fish), verhoog de score en leg uit waarom dit board uit hun setup vandaag het beste werkt.
    - Evalueer of de wetsuit set-up warm genoeg is voor de huidige watertemperatuur (${forecast.waterTemp || 12}°C).
    
    SURFER PROFIEL & GEAR IN BEZIT:
    - Gewicht: ${user.weight || 75}kg
    - Niveau: ${user.skillLevel || 'intermediate'}
    - Surfboards in Setup:
    ${quiverBoardsStr}
    - Wetsuits in Kast:
    ${userWetsuitsStr}
    
    DATABASE AANBEVELINGEN (IDEALE BOARDS VOOR DEZE SURFER & CONDITIES):
    De volgende boards komen uit onze live database en matchen perfect met het gewicht en niveau van de surfer:
    ${recommendedBoardsStr || 'Geen specifieke aanbevelingen.'}
    => Gebruik eventueel 1 of 2 van deze specifieke aanbevelingen (merk, model, maat, volume) als 'tip' voor hun volgende board, vooral als hun eigen setup tekortschiet voor de huidige condities.
    
    LOCATIE DIE WORDT BEKEKEN:
    - Spot: ${spot.name} (${spot.type})
    - Beste wind: ${(spot.bestWind || []).join(', ')}
    - Beste swell: ${(spot.bestSwell || []).join(', ')}
    - Richting kustlijn: ${spot.coastlineAngle || 0}°
    
    ${nearbyInfo}
 
    CONDITIES (VOOR DE BEKEKEN SPOT):
    - Golfhoogte: ${forecast.waveHeight || 0}m
    - Periode: ${forecast.swellPeriod || 0}s
    - ${powerIndexName}: ${forecast.wavePower || 0}/100
    - Wind: ${forecast.windSpeed || 0} knopen uit ${forecast.windDirection || 0}°
    - Wind Type: ${forecast.windType || 'cross-shore'} (${forecast.windQuality || 0}/100 kwaliteit)
    - Watertemp: ${forecast.waterTemp || 12}°C
    - Luchttemp: ${forecast.airTemp || 15}°C
    - Zonkracht / UV Index: ${forecast.uvIndex !== undefined ? forecast.uvIndex : 'N/A'}${forecast.sunscreenAdvice ? ` (Advies: ${forecast.sunscreenAdvice.spfRecommendation})` : ''}
    - ${tideHeightContext}
    ${isOuddorpNoordwegKiteZone(spot) ? `- KITESURF MONITORING ZONE: Deze spot ligt op of binnen 100m N / 200m Z van Ouddorp P Noordweg. Als de wind >= 12 knopen is (${forecast.windSpeed || 0} knopen), vermeld dan altijd een duidelijke kite-waarschuwing: de spot staat dan vol met kiters, let op kiterlijnen en drukte in de branding.` : ''}

    ---
    GEEF JE ANALYSE IN JSON FORMAAT MET DE DEZE VELDEN:
    - "score": getal tussen 1 en 10
    - "title": korte pakkende titel (bijv. "Sessie Analyse: Ideaal voor Softtop")
    - "description": volledige analyse in duidelijke Nederlandse Markdown alinea's (gescheiden door dubbele newlines \\n\\n):
      • 🏄 **Setup Keuze:** Boardmatch uit eigen setup met motivatie.
      • 🤿 **Wetsuit Advies:** Dikte en comfort bij ${forecast.waterTemp || 12}°C.
      • 🌊 **Golf- & Windanalyse:** Wat voor golven te verwachten zijn en beste getijmoment.
      • ⚠️ **Veiligheid & Kitesurfers:** Alleen indien van toepassing.
      • 📍 **Alternatieve Spots:** Alleen indien er reële alternatieve spots zijn vermeld.
    - "suitability": één van "perfect" | "good" | "challenging" | "flat"
    - "chanceOfSuccess": slagingskans percentage tussen 0 en 100

    Belangrijk: Geef UITSLUITEND een geldig JSON object terug zonder extra markdown formatting eromheen.
  `;

  // Attempt 1: Call Primary Model (gemini-3.7-flash) per standard guidelines
  console.log(`🌊 [SURF-ADVICE] Start adviesverzoek voor spot: "${spot.name}" (Tijdstip: ${forecast.timestamp || 'huidig'})...`);
  try {
    const response = await callGenerateContent({
      model: "gemini-3.7-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      }
    });

    const text = response.text || "{}";
    const cleanedJson = text.replace(/```json|```/g, "").trim();
    const data = JSON.parse(cleanedJson);
    
    const adviceResult: SurfAdvice = {
      score: data.score || 0,
      title: data.title || "Geen advies beschikbaar",
      description: data.description || "Er kon geen advies worden gegenereerd.",
      suitability: data.suitability || "flat",
      chanceOfSuccess: data.chanceOfSuccess,
      recommendedBoardId: board?.id,
      source: 'gemini-primary',
      generatedAt: new Date().toISOString()
    };

    console.log(`✨ [SURF-ADVICE] ✅ Succesvol gegenereerd door Primaire AI (Gemini 3.7 Flash) voor "${spot.name}" | Score: ${adviceResult.score}/10 | Titel: "${adviceResult.title}"`);
    return adviceResult;
  } catch (primaryError: any) {
    console.warn(`⚠️ [SURF-ADVICE] Primaire AI (Gemini 3.7 Flash) mislukt (${primaryError?.message || primaryError}). Start backup AI (Gemini 3.1 Flash-Lite)...`);
    // Log the primary error
    await logAppError("gemini_primary_model_error", "Failed generating advice using primary gemini-3.7-flash", { spotId: spot.id, spotName: spot.name, userEmail: user.favoriteSpotId }, primaryError);

    // Attempt 2: Secondary model (gemini-3.1-flash-lite) for cost/latency optimization/backup
    try {
      const backupResponse = await callGenerateContent({
        model: "gemini-3.1-flash-lite",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });

      const text = backupResponse.text || "{}";
      const cleanedJson = text.replace(/```json|```/g, "").trim();
      const data = JSON.parse(cleanedJson);
      
      const backupResult: SurfAdvice = {
        score: data.score || 0,
        title: data.title || "Geen advies beschikbaar (Backup AI)",
        description: data.description || "Er is een lokaal-ondersteund advies berekend door de back-up AI.",
        suitability: data.suitability || "flat",
        chanceOfSuccess: data.chanceOfSuccess,
        recommendedBoardId: board?.id,
        source: 'gemini-backup',
        generatedAt: new Date().toISOString()
      };

      console.log(`🔄 [SURF-ADVICE] ✅ Succesvol gegenereerd door Backup AI (Gemini 3.1 Flash-Lite) voor "${spot.name}" | Score: ${backupResult.score}/10 | Titel: "${backupResult.title}"`);
      return backupResult;
    } catch (secondaryError: any) {
      console.warn(`⚠️ [SURF-ADVICE] Backup AI ook niet beschikbaar (${secondaryError?.message || secondaryError}). Schakelt over naar Offline Noordzee Redundancy Motor...`);
      // Log the secondary error 
      await logAppError("gemini_secondary_model_error", "Failed generating advice using secondary gemini-3.1-flash-lite", { spotId: spot.id, spotName: spot.name }, secondaryError);

      // Attempt 3: Ultimate Fallback Rule-based engine (Robust Offline/Heuristic Backup)
      try {
        const localAdvice = generateLocalSurfAdvice(user, spot, forecast, nearbySpots);
        const resolvedLocalAdvice: SurfAdvice = {
          ...localAdvice,
          source: 'rule-based-offline',
          generatedAt: new Date().toISOString()
        };
        console.log(`🛡️ [SURF-ADVICE] ✅ Succesvol gegenereerd door Offline Noordzee Heuristische Motor voor "${spot.name}" | Score: ${resolvedLocalAdvice.score}/10 | Titel: "${resolvedLocalAdvice.title}"`);
        return resolvedLocalAdvice;
      } catch (fallbackError) {
        // If everything fails, return basic safe fallback description
        await logAppError("heuristic_fallback_error", "Critical error in local advisory redundancy simulator", { spotId: spot.id }, fallbackError);
        console.error(`💥 [SURF-ADVICE] Kritieke fout bij genereren advies voor "${spot.name}":`, fallbackError);
        return {
          score: 0,
          title: "Fout bij genereren advies",
          description: "Zowel de live AI als de lokale back-up adviseur konden geen data verwerken. Controleer je internetverbinding.",
          suitability: "flat",
          source: 'fallback',
          generatedAt: new Date().toISOString()
        };
      }
    }
  }
}
