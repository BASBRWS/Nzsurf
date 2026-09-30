<?php
/**
 * NzSurf API-proxy
 * ----------------
 * De Android-APK laadt vanaf https://localhost en heeft geen eigen backend.
 * Deze proxy staat op je eigen webhosting en stuurt de AI-verzoeken door naar de
 * Google Gemini API, zodat het AI-advies ook in de APK werkt. De API-sleutel
 * blijft server-side (komt niet in de app).
 *
 * Dekt dezelfde endpoints als server.ts:
 *   POST .../api/gemini/generateContent   -> { text }
 *   POST .../api/moderate-image           -> { isSafe, reason }
 *
 * Plaats dit bestand + .htaccess in de map die op
 *   https://www.etaksinsights.nl/noordzeesurf/
 * staat. Zet hieronder je Gemini API-sleutel.
 */

// ==== 1) API-SLEUTEL ========================================================
// Vul hier je Google Gemini API-sleutel in (of zet de env-var GEMINI_API_KEY).
// PHP-broncode wordt niet uitgeleverd aan bezoekers, dus dit blijft server-side.
const GEMINI_API_KEY = 'ZET-HIER-JE-GEMINI-API-SLEUTEL';

// ===========================================================================

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['error' => 'Method not allowed']);
    exit;
}

$apiKey = getenv('GEMINI_API_KEY');
if (!$apiKey || $apiKey === '') {
    $apiKey = GEMINI_API_KEY;
}
if (!$apiKey || $apiKey === 'ZET-HIER-JE-GEMINI-API-SLEUTEL') {
    http_response_code(503);
    echo json_encode(['error' => 'GEMINI_API_KEY niet geconfigureerd op de server']);
    exit;
}

$raw  = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ongeldige JSON in verzoek']);
    exit;
}

$path = isset($_GET['__path']) ? $_GET['__path'] : 'gemini/generateContent';

// ---- Beeldmoderatie --------------------------------------------------------
if ($path === 'moderate-image') {
    $base64 = isset($body['base64Image']) ? $body['base64Image'] : '';
    if (!$base64) {
        http_response_code(400);
        echo json_encode(['error' => 'No image provided']);
        exit;
    }
    $mime = 'image/jpeg';
    $data = $base64;
    if (preg_match('/^data:([^;]+);base64,(.+)$/s', $base64, $m)) {
        $mime = $m[1];
        $data = $m[2];
    }
    $payload = [
        'contents' => [[
            'parts' => [
                ['inlineData' => ['data' => $data, 'mimeType' => $mime]],
                ['text' => 'You are a content moderator for a surfing community. Check this image. Does it contain any inappropriate, explicit, offensive, or non-safe-for-work (NSFW) content? Also, is it completely unrelated to surfing, the beach, or the sea? Reply ONLY with a JSON object: { "isSafe": true/false, "reason": "string" }'],
            ],
        ]],
        'generationConfig' => ['responseMimeType' => 'application/json', 'temperature' => 0.1],
    ];
    $text = gemini_call('gemini-3.7-flash', $payload, $apiKey);
    if ($text === null) exit; // fout al verstuurd
    $obj = json_decode($text, true);
    echo json_encode($obj ?: ['isSafe' => true, 'reason' => 'Moderatie kon niet worden geparsed']);
    exit;
}

// ---- Standaard: gemini/generateContent ------------------------------------
$model    = isset($body['model']) ? $body['model'] : 'gemini-3.7-flash';
$contents = isset($body['contents']) ? $body['contents'] : '';
$config   = isset($body['config']) ? $body['config'] : null;

$payload = ['contents' => normalize_contents($contents)];
if (is_array($config)) {
    $payload['generationConfig'] = $config;
}

$text = gemini_call($model, $payload, $apiKey);
if ($text === null) exit; // fout al verstuurd
echo json_encode(['text' => $text]);
exit;

// ==== Helpers ==============================================================

/**
 * Zet `contents` om naar het REST-formaat van de Gemini API, net zoals de
 * @google/genai SDK dat doet: een string wordt één user-content met een
 * text-part; een array van parts wordt in één content gewikkeld.
 */
function normalize_contents($contents)
{
    if (is_string($contents)) {
        return [['role' => 'user', 'parts' => [['text' => $contents]]]];
    }
    if (is_array($contents)) {
        $looksLikeParts = false;
        foreach ($contents as $item) {
            if (is_array($item) && (isset($item['text']) || isset($item['inlineData']) || isset($item['inline_data']))) {
                $looksLikeParts = true;
                break;
            }
        }
        if ($looksLikeParts) {
            return [['role' => 'user', 'parts' => array_values($contents)]];
        }
        return array_values($contents); // al content-objecten
    }
    return [['role' => 'user', 'parts' => [['text' => (string) $contents]]]];
}

/**
 * Roept de Gemini generateContent-REST-API aan en geeft de samengevoegde tekst
 * terug. Bij een fout stuurt het zelf een JSON-foutantwoord en geeft null terug.
 */
function gemini_call($model, $payload, $apiKey)
{
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/'
        . rawurlencode($model) . ':generateContent?key=' . urlencode($apiKey);
    $json = json_encode($payload);

    $resp = null;
    $httpCode = 0;
    $errMsg = '';

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $json,
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 60,
        ]);
        $resp     = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $errMsg   = curl_error($ch);
        curl_close($ch);
    } else {
        // Fallback zonder cURL
        $ctx = stream_context_create([
            'http' => [
                'method'        => 'POST',
                'header'        => "Content-Type: application/json\r\n",
                'content'       => $json,
                'timeout'       => 60,
                'ignore_errors' => true,
            ],
        ]);
        $resp = @file_get_contents($url, false, $ctx);
        if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $mm)) {
            $httpCode = (int) $mm[1];
        }
    }

    if ($resp === false || $resp === null) {
        http_response_code(502);
        echo json_encode(['error' => 'Kon Gemini niet bereiken' . ($errMsg ? ': ' . $errMsg : '')]);
        return null;
    }

    $data = json_decode($resp, true);
    if (($httpCode >= 400 && $httpCode !== 0) || !is_array($data)) {
        http_response_code($httpCode >= 400 ? $httpCode : 500);
        $msg = isset($data['error']['message']) ? $data['error']['message'] : ('Gemini gaf HTTP ' . $httpCode);
        echo json_encode(['error' => $msg]);
        return null;
    }

    $text = '';
    if (isset($data['candidates'][0]['content']['parts']) && is_array($data['candidates'][0]['content']['parts'])) {
        foreach ($data['candidates'][0]['content']['parts'] as $p) {
            if (isset($p['text'])) $text .= $p['text'];
        }
    }
    return $text;
}
