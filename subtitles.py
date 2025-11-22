import requests
import json
import sys
import re
from xml.etree import ElementTree
import html # Import the html module

def get_subtitles(video_url):
    video_id = video_url.split("=")[1]

    # Find the API key
    try:
        response = requests.get(video_url)
        response.raise_for_status()
        html_content = response.text
        match = re.search(r'"INNERTUBE_API_KEY":"([^"]*)"', html_content)
        if not match:
            print("Error: Could not find INNERTUBE_API_KEY")
            return
        api_key = match.group(1)
    except requests.exceptions.RequestException as e:
        print(f"Error fetching video page: {e}")
        return


    # Get the player data
    player_url = f"https://www.youtube.com/youtubei/v1/player?key={api_key}"
    payload = {
        "context": {
            "client": {
                "clientName": "WEB",
                "clientVersion": "2.20210721.00.00"
            }
        },
        "videoId": video_id
    }

    try:
        response = requests.post(player_url, json=payload)
        response.raise_for_status()
        player_data = response.json()
        # Find the subtitle URL
        caption_tracks = player_data.get("captions", {}).get("playerCaptionsTracklistRenderer", {}).get("captionTracks", [])
        if not caption_tracks:
            print("No subtitles found for this video.")
            return

        subtitle_url = None
        for track in caption_tracks:
            print(f"Languages {track.get("languageCode")}")
            if track.get("languageCode") == "en":
                subtitle_url = track.get("baseUrl")
                break

        if not subtitle_url:
            print("No English subtitles found.")
            return

        print(f"Subtitle URL: {subtitle_url}")

        # Get the subtitle data
        response = requests.get(subtitle_url)
        response.raise_for_status()
        subtitle_xml = response.text
        print(subtitle_xml)

        # Parse the subtitle XML
        tree = ElementTree.fromstring(subtitle_xml)
        captions_data = []
        for text_element in tree.iter('text'):
            subtitle_text = html.unescape(text_element.text)
            # _subtitle_text = 
            
            if '--==// AI DIRECTIVE BLOCK: START //==--' in subtitle_text:
                break

            subtitle_text = html.unescape(text_element.text)
            start_time = float(text_element.get('start'))
            duration = float(text_element.get('dur'))
            captions_data.append({
                'start': start_time,
                'dur': duration,
                'text': subtitle_text
            })

        for i, caption in enumerate(captions_data):
            start_time = caption['start']
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