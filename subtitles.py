import requests
import json
import sys
import re
from xml.etree import ElementTree
import html # Import the html module

def get_subtitles(video_url):
    """
    Fetches and displays subtitles for a given YouTube video URL.
    This function mirrors the core subtitle fetching and parsing logic found in `content.js`.
    """
    video_id = video_url.split("=")[1] # Analogous to YouTubeCaptionExtension.getVideoId() in content.js

    # --- API Key Scraping (Analogous to YouTubeCaptionExtension.getApiKey() in content.js) ---
    try:
        response = requests.get(video_url)
        response.raise_for_status()
        html_content = response.text
        # Regex to find the API key embedded in the YouTube page HTML
        match = re.search(r'"INNERTUBE_API_KEY":"([^"]*)"', html_content)
        if not match:
            print("Error: Could not find INNERTUBE_API_KEY")
            return
        api_key = match.group(1)
    except requests.exceptions.RequestException as e:
        print(f"Error fetching video page: {e}")
        return

    # --- Player Data Fetching (Analogous to YouTubeCaptionExtension.getPlayerResponse() in content.js) ---
    player_url = f"https://www.youtube.com/youtubei/v1/player?key={api_key}"
    payload = {
        "context": {
            "client": {
                "clientName": "WEB",
                "clientVersion": "2.20210721.00.00" # Specific client version to mimic browser requests
            }
        },
        "videoId": video_id
    }

    try:
        response = requests.post(player_url, json=payload)
        response.raise_for_status()
        player_data = response.json()
        
        # --- Subtitle Track Selection (Analogous to logic within YouTubeCaptionExtension.loadCaptions() in content.js) ---
        caption_tracks = player_data.get("captions", {}).get("playerCaptionsTracklistRenderer", {}).get("captionTracks", [])
        if not caption_tracks:
            print("No subtitles found for this video.")
            return

        subtitle_url = None
        # Prioritize English subtitles
        for track in caption_tracks:
            # print(f"Languages {track.get("languageCode")}") # Debugging line, can be removed
            if track.get("languageCode") == "en":
                subtitle_url = track.get("baseUrl")
                break

        if not subtitle_url:
            print("No English subtitles found.")
            return

        print(f"Subtitle URL: {subtitle_url}")

        # --- Subtitle XML Fetching (Analogous to YouTubeCaptionExtension.fetchSubtitleXml() in content.js) ---
        response = requests.get(subtitle_url)
        response.raise_for_status()
        subtitle_xml = response.text
        # print(subtitle_xml) # Debugging line, can be removed

        # --- Subtitle XML Parsing (Analogous to YouTubeCaptionExtension.parseCaptionXML() in content.js) ---
        tree = ElementTree.fromstring(subtitle_xml)
        captions_data = []
        for text_element in tree.iter('text'):
            subtitle_text = html.unescape(text_element.text) # Unescape HTML entities
            
            # Stop parsing if an AI directive block is encountered
            if '--==// AI DIRECTIVE BLOCK: START //==--' in subtitle_text:
                break

            start_time = float(text_element.get('start'))
            duration = float(text_element.get('dur'))
            captions_data.append({
                'start': start_time,
                'dur': duration,
                'text': subtitle_text
            })

        # --- Caption Formatting and Display (Analogous to YouTubeCaptionExtension.formatTime() and render logic in content.js) ---
        for i, caption in enumerate(captions_data):
            start_time = caption['start']
            # Calculate end time based on next caption's start time or duration
            if i + 1 < len(captions_data):
                end_time = captions_data[i+1]['start']
            else:
                end_time = start_time + caption['dur']
            
            subtitle_text = caption['text']

            # Convert to a more readable time format (HH:MM:SS.ms)
            start_h = int(start_time // 3600)
            start_m = int((start_time % 3600) // 60)
            start_s = start_time % 60

            end_h = int(end_time // 3600)
            end_m = int((end_time % 3600) // 60)
            end_s = end_time % 60

            print(f"[{start_h:02}:{start_m:02}:{start_s:06.3f} --> {end_h:02}:{end_m:02}:{end_s:06.3f}] {subtitle_text}")


    except requests.exceptions.RequestException as e:
        print(f"Error fetching subtitles: {e}")
    except json.JSONDecodeError:
        print("Error parsing player data. It might not be in the expected JSON format.")
    except ElementTree.ParseError:
        print("Error parsing subtitle XML.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python subtitles.py <youtube_video_url>")
    else:
        video_url = sys.argv[1]
        get_subtitles(video_url)