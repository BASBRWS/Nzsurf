// Verkenning (eenmalig/test): wat geven de surfsites terug voor Ouddorp?
// Logt status, grootte en relevante stukjes, zodat de uitlezers gericht gebouwd kunnen worden.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

async function peek(name: string, url: string, init: RequestInit = {}, show: (t: string) => string = t => t.slice(0, 600)) {
  try {
    const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: '*/*', ...(init.headers || {}) }, signal: AbortSignal.timeout(30000) });
    const text = await res.text();
    console.log(`\n=== ${name} — HTTP ${res.status} — ${text.length} tekens — ${url}`);
    console.log(show(text));
    return text;
  } catch (e: any) {
    console.log(`\n=== ${name} — FOUT ${e.message} — ${url}`);
    return '';
  }
}

const around = (t: string, needle: RegExp, n = 400) => {
  const m = t.search(needle);
  return m < 0 ? `(geen match voor ${needle})` : t.slice(Math.max(0, m - 100), m + n);
};

async function rws(name: string, path: string, body: unknown) {
  return peek(name, 'https://ddapi20-waterwebservices.rijkswaterstaat.nl' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, t => t.slice(0, 700));
}

async function main() {
  // ── Rijkswaterstaat: waarom zijn golf/wind leeg? ──
  const to = new Date(); to.setUTCMinutes(0, 0, 0);
  const from = new Date(to.getTime() - 24 * 3600e3);
  const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '.000+00:00');
  for (const [loc, gr, comp] of [['goeree.lichteiland', 'Hm0', 'OW'], ['europlatform', 'Hm0', 'OW'], ['haringvlietmond', 'Hm0', 'OW'], ['schouwenbank.1', 'Hm0', 'OW'], ['goeree.lichteiland', 'WINDSHD', 'LT']]) {
    await rws(`RWS laatste ${gr}@${loc}`, '/ONLINEWAARNEMINGENSERVICES/OphalenLaatsteWaarnemingen', {
      LocatieLijst: [{ Code: loc }],
      AquoPlusWaarnemingMetadataLijst: [{ AquoMetadata: { Compartiment: { Code: comp }, Grootheid: { Code: gr } } }],
    });
    await rws(`RWS reeks ${gr}@${loc} 24u`, '/ONLINEWAARNEMINGENSERVICES/OphalenWaarnemingen', {
      Locatie: { Code: loc },
      AquoPlusWaarnemingMetadata: { AquoMetadata: { Compartiment: { Code: comp }, Grootheid: { Code: gr } } },
      Periode: { Begindatumtijd: fmt(from), Einddatumtijd: fmt(to) },
    });
  }
  // Waterinfo (website) grafiekdienst
  for (const mapType of ['golfhoogte', 'windsnelheid', 'windrichting', 'golfperiode', 'golfrichting']) {
    await peek(`Waterinfo ${mapType}`, `https://waterinfo.rws.nl/api/chart/get?mapType=${mapType}&locationCodes=Goeree-lichteiland(LEG)&values=-48,0`, {}, t => t.slice(0, 500));
  }
  await peek('Waterinfo locaties golfhoogte', 'https://waterinfo.rws.nl/api/point/latestmeasurement?parameterId=golfhoogte', {}, t => around(t, /goeree|lichteiland|LEG/i, 500));

  // Surfline: zoek spot-id
  const sl = await peek('Surfline zoek', 'https://services.surfline.com/search/site?q=Ouddorp&querySize=5&suggestionSize=5');
  const id = sl.match(/"_id":"([a-f0-9]{24})"[^}]*?"name":"Ouddorp/i)?.[1] || sl.match(/spot\/([a-f0-9]{24})/)?.[1] || sl.match(/"_id":"([a-f0-9]{24})"/)?.[1];
  console.log('Surfline spot-id kandidaat:', id);
  if (id) {
    await peek('Surfline wave', `https://services.surfline.com/kbyg/spots/forecasts/wave?spotId=${id}&days=5&intervalHours=3`, {}, t => t.slice(0, 900));
    await peek('Surfline wind', `https://services.surfline.com/kbyg/spots/forecasts/wind?spotId=${id}&days=5&intervalHours=3`, {}, t => t.slice(0, 500));
    await peek('Surfline rating', `https://services.surfline.com/kbyg/spots/forecasts/rating?spotId=${id}&days=5&intervalHours=3`, {}, t => t.slice(0, 500));
  }

  // surfnerd
  await peek('surfnerd', 'https://www.surfnerd.com/surf-forecast/ouddorp', {}, t =>
    `${around(t, /__NEXT_DATA__|application\/json|forecast/i, 800)}\n...\n${around(t, /waveHeight|swellHeight|"height"/i, 600)}`);

  // surf-forecast.com
  await peek('surf-forecast.com', 'https://www.surf-forecast.com/breaks/Ouddorp/forecasts/latest/six_day', {}, t =>
    `${around(t, /data-row-name="wave-height"|wave-height/i, 700)}\n...\n${around(t, /data-row-name="periods"|periods/i, 400)}`);

  // Windguru
  await peek('Windguru zoek', 'https://www.windguru.cz/int/iapi.php?q=autocomplete&type_info=true&all=0&latlon=1&query=Ouddorp', { headers: { Referer: 'https://www.windguru.cz/' } });

  // Windfinder
  await peek('Windfinder', 'https://www.windfinder.com/forecast/ouddorp', {}, t =>
    `${around(t, /wave|golf/i, 500)}\n...\n${around(t, /data-|windspeed|ws-/i, 400)}`);

  // spots.guru en breakfinder
  await peek('spots.guru', 'https://spots.guru/forecast/surf-ouddorp', {}, t => around(t, /wave|swell/i, 600));
  await peek('breakfinder', 'https://breakfinder.surf/en/surf_spots/ouddorp', {}, t => around(t, /score|wave/i, 600));
}
main();
