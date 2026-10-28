"""Bodemprofielen (Jarkus, Rijkswaterstaat) bij de NzSurf-auditspots.

Haalt via OPeNDAP alleen de raaien bij de spots op (niet het hele bestand), neemt per
spot de dichtstbijzijnde raai en de laatste metingen, en schrijft een compacte JSON:
het profiel (hoogte t.o.v. NAP per 10 m vanaf de strandpaal) en de zandbanken (toppen
met hun diepte). Draait in GitHub Actions (daar is internet); lokaal kan het ook.

Gebruik: python scripts/bathymetry/jarkus.py src/data/bathymetry.json
"""
import json, math, sys
import numpy as np
import xarray as xr

URL = "https://opendap.deltares.nl/thredds/dodsC/opendap/rijkswaterstaat/jarkus/profiles/transect.nc"
SPOTS = {
    "ouddorp-p-noordweg": (51.8253, 3.8874),
    "maasvlakte": (51.9292, 3.9766),
}
YEARS = 3  # meest recente jaren met metingen per raai


def note(title, msg):
    print(f"::notice title={title}::{msg}")


def hav(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def bars(x, z, mlw):
    """Zandbanken: lokale toppen zeewaarts van de laagwaterlijn, minstens 0,4 m boven de trog ervoor."""
    out = []
    sea = np.where(z < mlw)[0]
    if not len(sea):
        return out
    i0 = sea[0]
    trough = z[i0]
    for i in range(i0 + 1, len(z) - 1):
        trough = min(trough, z[i])
        if z[i] >= z[i - 1] and z[i] >= z[i + 1] and z[i] - trough >= 0.4 and z[i] < mlw + 0.5:
            out.append({"x": float(x[i]), "crest": round(float(z[i]), 2), "prominence": round(float(z[i] - trough), 2)})
            trough = z[i]
    return out[:4]


def main(out_path):
    ds = xr.open_dataset(URL)
    print("variabelen:", list(ds.variables)[:40])
    lat = ds["lat"].values  # (alongshore, cross_shore)
    lon = ds["lon"].values
    cs = ds["cross_shore"].values
    ids = ds["id"].values
    i_rsp = int(np.argmin(np.abs(cs)))  # strandpaal (cross_shore = 0)
    result = {"source": "Rijkswaterstaat Jarkus via Deltares OpenDAP", "url": URL, "spots": {}}
    for spot, (la, lo) in SPOTS.items():
        # afstand van de spot tot elke raai (dichtstbijzijnde punt op de raai)
        best = None
        for a in range(lat.shape[0]):
            la_row, lo_row = lat[a], lon[a]
            ok = np.isfinite(la_row) & np.isfinite(lo_row)
            if not ok.any():
                continue
            # snel: alleen raaien binnen ~0,1 graad van de strandpaal
            if abs(np.nanmean(la_row) - la) > 0.12 or abs(np.nanmean(lo_row) - lo) > 0.2:
                continue
            d = min(hav(la, lo, float(y), float(x)) for y, x in zip(la_row[ok][::25], lo_row[ok][::25]))
            if best is None or d < best[0]:
                best = (d, a)
        if best is None:
            note(f"Bodem {spot}", "geen Jarkus-raai in de buurt gevonden")
            continue
        d, a = best
        alt = ds["altitude"].isel(alongshore=a).values  # (time, cross_shore)
        times = ds["time"].values
        have = [t for t in range(alt.shape[0]) if np.isfinite(alt[t]).sum() > 50]
        if not have:
            note(f"Bodem {spot}", f"raai {int(ids[a])} heeft geen metingen")
            continue
        use = have[-YEARS:]
        z = np.nanmean(np.stack([alt[t] for t in use]), axis=0)  # gemiddeld profiel recente jaren
        ok = np.isfinite(z)
        x, z = cs[ok], z[ok]
        mlw = float(ds["mean_low_water"].isel(alongshore=a).values) if "mean_low_water" in ds else -1.0
        mhw = float(ds["mean_high_water"].isel(alongshore=a).values) if "mean_high_water" in ds else 1.0
        step = 10
        grid = np.arange(math.ceil(x.min() / step) * step, x.max() + 1, step)
        zi = np.interp(grid, x, z)
        b = bars(grid, zi, mlw)
        years = [str(np.datetime_as_string(times[t], unit="Y")) for t in use]
        sea = grid[zi < -5]
        result["spots"][spot] = {
            "transect": int(ids[a]), "distance_m": round(d), "years": years,
            "mlw": round(mlw, 2), "mhw": round(mhw, 2),
            "x0": float(grid[0]), "step": step, "z": [round(float(v), 2) for v in zi],
            "bars": b,
            "dist_to_5m": float(sea[0]) if len(sea) else None,
        }
        note(f"Bodem {spot}", f"raai {int(ids[a])} ({round(d)} m van de spot), jaren {', '.join(years)}; "
             f"GLW {mlw:.2f} m NAP; banken: " + (", ".join(f"{bb['x']:.0f} m top {bb['crest']:.1f} m NAP" for bb in b) or "geen")
             + (f"; -5 m NAP op {sea[0]:.0f} m" if len(sea) else ""))
    with open(out_path, "w") as fh:
        json.dump(result, fh, indent=1)
    print("geschreven:", out_path)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "bathymetry.json")
