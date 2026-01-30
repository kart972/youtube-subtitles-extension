import requests
import json
import re
import sys
import html

def get_captions(url, target_lang='en'):
    """
    Fetches YouTube captions using the Innertube API with an ANDROID client context.
    This method is currently more reliable than the standard WEB client.
    """
     
    # Extract Video ID from URL or use as is
    video_id = input_arg.split("v=")[-1].split("&")[0] if "v=" in url else url
    
    session = requests.Session()
    
    # 1. Modern Headers
    headers = {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.youtube.com/",
    }

    # 2. Fetch the video page to get the essential tokens (API Key and VisitorData)
    video_url = f"https://www.youtube.com/watch?v={video_id}"
    print(f"[*] Fetching video page: {video_url}")
    
    try:
        response = session.get(video_url, headers=headers, timeout=10)
        response.raise_for_status()
    except Exception as e:
        print(f"[!] Network Error: {e}")
        return None

    html = response.text

    # 3. Extract tokens using Regex
    def extract(pattern, text):
        match = re.search(pattern, text)
        return match.group(1) if match else None

    api_key = extract(r'"INNERTUBE_API_KEY":"([^"]*)"', html)
    visitor_data = extract(r'"visitorData":"([^"]*)"', html)
    
    if not api_key:
        print("[!] Error: Could not find INNERTUBE_API_KEY in page source.")
        return None

    # 4. Construct the Innertube Player Request
    # We use the 'ANDROID' client which often receives captions even when 'WEB' is restricted.
    player_url = f"https://www.youtube.com/youtubei/v1/player?key={api_key}"
    payload = {
        "context": {
            "client": {
                "clientName": "ANDROID",
                "clientVersion": "19.01.33",
                "hl": target_lang,
                "gl": "US",
                "visitorData": visitor_data
            }
        },
        "videoId": video_id
    }

    print("[*] Requesting player data from Innertube API...")
    try:
        resp = session.post(player_url, json=payload, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"[!] API Error: {e}")
        return None

    # 5. Extract Caption Tracks
    captions_renderer = data.get("captions", {}).get("playerCaptionsTracklistRenderer", {})
    tracks = captions_renderer.get("captionTracks", [])
    
    # Fallback: Sometimes captions are available in the initial page response but not the API
    if not tracks:
        print("[*] API didn't return captions. Checking page variable 'ytInitialPlayerResponse'...")
        page_data_match = re.search(r'ytInitialPlayerResponse\s*=\s*({.+?})\s*;', html)
        if page_data_match:
            try:
                page_data = json.loads(page_data_match.group(1))
                tracks = page_data.get("captions", {}).get("playerCaptionsTracklistRenderer", {}).get("captionTracks", [])
            except:
                pass

    if not tracks:
        print("[!] No caption tracks available for this video.")
        return None

    print(f"[*] Success! Found {len(tracks)} track(s).")
    for i, track in enumerate(tracks):
        lang = track.get('languageCode')
        name = track.get('name', {}).get('simpleText', 'Unknown')
        kind = "Auto" if track.get('kind') == 'asr' else "Manual"
        print(f"    [{i}] {lang} - {name} ({kind})") 

    
    # 6. Select the target track
    # Priority: 1. Manual Target Lang, 2. Auto Target Lang, 3. Manual English, 4. First available
    target_track = next((t for t in tracks if t.get('languageCode') == target_lang and t.get('kind') != 'asr'), None)
    if not target_track:
        target_track = next((t for t in tracks if t.get('languageCode') == target_lang), None)
    if not target_track:
        print(f"[*] Requested language '{target_lang}' not found. Falling back to default...")
        target_track = next((t for t in tracks if t.get('languageCode') == 'en' and t.get('kind') != 'asr'), tracks[0])
    
    transcript_url = target_track['baseUrl']
    if "fmt=json3" not in transcript_url:
        transcript_url += "&fmt=json3"
    
    print(f"[*] Downloading transcript: {target_track.get('languageCode')} ({'Manual' if target_track.get('kind') != 'asr' else 'Auto'})...")
    
    try:
        transcript_resp = session.get(transcript_url, headers=headers, timeout=10)
        transcript_resp.raise_for_status()
        
        if 'application/json' in transcript_resp.headers.get('Content-Type', ''):
            return transcript_resp.json()
        else:
            return {"raw_text": transcript_resp.text}
            
    except Exception as e:
        print(f"[!] Error downloading transcript: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 youtube_captions_fixed.py <VIDEO_ID_OR_URL> [LANGUAGE_CODE]")
        sys.exit(1)

    input_arg = sys.argv[1]
    target_lang = sys.argv[2] if len(sys.argv) > 2 else 'en'
    
    result = get_captions(input_arg, target_lang)

    print(result)
    
    if result:
        print("\n--- Transcript Preview (First 10 lines) ---")
        if "raw_text" in result:
            xml_text = result["raw_text"]
            # Support both legacy <text> and newer <p> formats
            # <p t="12597" d="1741">One of my
            tags = re.findall(r'<p\s+t="(\d+)"[^>]*>([^<]*)</p>', xml_text)
            if tags:
                for i, (t_ms, text) in enumerate(tags[:10]):
                    print(f"[{float(t_ms)/1000:6.2f}s] {html.unescape(text)}")
            else:
                # Legacy format: <text start="1.23" dur="4.56">...</text>
                tags = re.findall(r'<text\s+start="([\d.]+)"[^>]*>([^<]*)</text>', xml_text)
                for i, (start, text) in enumerate(tags[:10]):
                    print(f"[{float(start):6.2f}s] {html.unescape(text)}")
        else:
            events = result.get('events', [])
            line_count = 0
            for event in events:
                if 'segs' in event:
                    text = "".join([s.get('utf8', '') for s in event['segs']]).strip()
                    if text:
                        time_sec = event.get('tStartMs', 0) / 1000
                        print(f"[{time_sec:6.2f}s] {text}")
                        line_count += 1
                if line_count >= 10:
                    break
    else:
        print("\n[!] Failed to retrieve subtitles.")
