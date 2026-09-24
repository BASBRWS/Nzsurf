#!/usr/bin/env bash
# Kopieert de pure scorelogica uit src/ naar functions/src/app/ zodat de
# Cloud Function EXACT dezelfde surfscore berekent als de app/site.
#
# Draai dit opnieuw na elke wijziging aan de scorelogica in src/ (bijv. na een
# AI Studio-export), en deploy daarna de functie opnieuw.
#
#   bash scripts/sync-functions-logic.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DST="$ROOT/functions/src/app"

mkdir -p "$DST/utils" "$DST/services"

cp "$ROOT/src/types.ts"                      "$DST/types.ts"
cp "$ROOT/src/constants.ts"                  "$DST/constants.ts"
cp "$ROOT/src/utils/sunscreenUtils.ts"       "$DST/utils/sunscreenUtils.ts"
cp "$ROOT/src/utils/kiteAlertUtils.ts"       "$DST/utils/kiteAlertUtils.ts"
cp "$ROOT/src/utils/dailyForecastUtils.ts"   "$DST/utils/dailyForecastUtils.ts"
cp "$ROOT/src/services/weatherService.ts"    "$DST/services/weatherService.ts"

echo "Logica gesynct naar functions/src/app/ (types, constants, utils, weatherService)."
