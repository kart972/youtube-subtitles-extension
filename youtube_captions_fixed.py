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
    video_id = url.split("v=")[-1].split("&")[0] if "v=" in url else url
    
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

def format_timestamp(ms):
    """Converts milliseconds to SRT timestamp format (HH:MM:SS,mmm)."""
    ms = int(ms)
    hours = ms // 3600000
    minutes = (ms % 3600000) // 60000
    seconds = (ms % 60000) // 1000
    milliseconds = ms % 1000
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"

def generate_srt(result):
    """Converts YouTube caption data (JSON or XML) into standard SRT format."""
    srt_blocks = []
    
    if "raw_text" in result:
        # XML format parsing (Format 3)
        xml_text = result["raw_text"]
        # Match <p t="start" d="duration">text</p>
        pattern = r'<p\s+t="(\d+)"(?: d="(\d+)")?[^>]*>(.*?)</p>'
        matches = re.findall(pattern, xml_text, re.DOTALL)
        
        for i, (start_ms_str, dur_ms_str, raw_content) in enumerate(matches):
            start_ms = int(start_ms_str)
            dur_ms = int(dur_ms_str) if dur_ms_str else 2000
            end_ms = start_ms + dur_ms
            
            # Remove any nested tags like <s> and unescape HTML entities
            clean_text = re.sub(r'<[^>]+>', '', raw_content)
            clean_text = html.unescape(clean_text).strip()
            
            if clean_text:
                srt_blocks.append(f"{len(srt_blocks) + 1}\n{format_timestamp(start_ms)} --> {format_timestamp(end_ms)}\n{clean_text}\n")
    else:
        # JSON format parsing (Innertube)
        events = result.get('events', [])
        for event in events:
            if 'segs' not in event:
                continue
            
            start_ms = event.get('tStartMs', 0)
            dur_ms = event.get('dDurationMs', 2000)
            end_ms = start_ms + dur_ms
            
            # Combine segments
            text = "".join([s.get('utf8', '') for s in event['segs']]).strip()
            
            if text:
                srt_blocks.append(f"{len(srt_blocks) + 1}\n{format_timestamp(start_ms)} --> {format_timestamp(end_ms)}\n{text}\n")
                
    return "\n".join(srt_blocks)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 youtube_captions_fixed.py <VIDEO_ID_OR_URL> [LANGUAGE_CODE]")
        sys.exit(1)

    input_arg = sys.argv[1]
    target_lang = sys.argv[2] if len(sys.argv) > 2 else 'en'
    
    result = get_captions(input_arg, target_lang)
    
    if result:
        srt_content = generate_srt(result)
        print(f"\n--- SRT Output ({target_lang}) ---")
        print(srt_content)
    else:
        print("\n[!] Failed to retrieve subtitles.")
