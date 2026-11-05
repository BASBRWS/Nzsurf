/**
 * Stap van de NzSurf-verwachting in uren. Sinds november 2026 rekent NzSurf elk uur
 * (daarvoor elke 3 uur). Alles wat "tot het volgende punt" rekent gebruikt deze stap.
 */
export const FORECAST_STEP_H = 1;
export const FORECAST_STEP_MS = FORECAST_STEP_H * 3600e3;
