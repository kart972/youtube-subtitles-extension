class YouTubeCaptionExtension {
  constructor() {
    this.captions = [];
    this.panelVisible = false;
    this.panel = null;
    this.player = null;
    this.init();
  }

  async init() {
    // Wait for YouTube player to load
    await this.waitForPlayer();
    this.createToggleButton();
    this.createPanel();
    this.loadCaptions();
    
    // Listen for video changes
    this.observeVideoChanges();
  }

  waitForPlayer() {
    return new Promise((resolve) => {
      const checkPlayer = () => {
        this.player = document.querySelector('video');
        if (this.player) {
          resolve();
        } else {
          setTimeout(checkPlayer, 100);
        }
      };
      checkPlayer();
    });
  }

  createToggleButton() {
    const controls = document.querySelector('.ytp-right-controls');
    if (!controls) return;

    const button = document.createElement('button');
    button.className = 'ytp-button caption-search-btn';
    button.innerHTML = '📝';
    button.title = 'Search Captions';
    button.style.cssText = `
      background: none;
      border: none;
      color: white;
      font-size: 16px;
      cursor: pointer;
      padding: 8px;
    `;
    
    button.addEventListener('click', () => this.togglePanel());
    controls.insertBefore(button, controls.firstChild);
  }

  createPanel() {
    this.panel = document.createElement('div');
    this.panel.className = 'caption-search-panel';
    this.panel.style.display = 'none';
    
    this.panel.innerHTML = `
      <div class="panel-header">
        <h3>Caption Search</h3>
        <button class="close-btn">×</button>
      </div>
      <div class="search-container">
        <input type="text" placeholder="Search captions..." class="search-input">
        <div class="search-results-count"></div>
      </div>
      <div class="captions-container">
        <div class="loading">Loading captions...</div>
      </div>
    `;

    document.body.appendChild(this.panel);

    // Event listeners
    this.panel.querySelector('.close-btn').addEventListener('click', () => this.togglePanel());
    this.panel.querySelector('.search-input').addEventListener('input', (e) => this.searchCaptions(e.target.value));
  }

  togglePanel() {
    this.panelVisible = !this.panelVisible;
    this.panel.style.display = this.panelVisible ? 'block' : 'none';
  }

  async loadCaptions() {
    console.log('🎬 Loading captions...');
    try {
      const videoId = this.getVideoId();
      console.log('📹 Video ID:', videoId);
      
      if (!videoId) {
        console.error('❌ No video ID found');
        this.showError('No video ID found');
        return;
      }

      // Try multiple methods to get captions
      const captions = await this.fetchCaptions(videoId);
      console.log('📝 Captions found:', captions.length);
      
      this.captions = captions;
      this.renderCaptions();
    } catch (error) {
      console.error('❌ Failed to load captions:', error);
      this.showError(`Failed to load captions: ${error.message}`);
    }
  }

  getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  async fetchCaptions(videoId) {
    console.log('🔍 Fetching captions for video:', videoId);
    
    // Method 1: Extract from YouTube's page data (most reliable)
    let captions = await this.extractFromPageData();
    if (captions && captions.length > 0) {
      console.log('✅ Found captions via page data extraction');
      return captions;
    }

    // Method 2: Monitor live caption rendering (for auto-generated captions)
    captions = await this.monitorLiveCaptions();
    if (captions && captions.length > 0) {
      console.log('✅ Found captions via live monitoring');
      return captions;
    }

    // Method 3: Use yt-dlp style extraction (embedded in page)
    captions = await this.extractLikeYtDlp();
    if (captions && captions.length > 0) {
      console.log('✅ Found captions via yt-dlp method');
      return captions;
    }

    // Method 4: Extract from player config using regex patterns
    captions = await this.extractFromPlayerConfig();
    if (captions && captions.length > 0) {
      console.log('✅ Found captions via player config');
      return captions;
    }

    console.log('⚠️ No captions found, using mock data for demonstration');
    return this.getMockCaptions();
  }

  async extractFromPageData() {
    console.log('🔍 Extracting from page data...');
    try {
      // Method 1a: Extract from window.ytInitialData
      if (window.ytInitialData) {
        console.log('📊 Found ytInitialData');
        // Look for embedded caption data
        const jsonStr = JSON.stringify(window.ytInitialData);
        if (jsonStr.includes('captionTracks')) {
          console.log('📝 Found captionTracks in ytInitialData');
          return this.parseEmbeddedCaptionData(window.ytInitialData);
        }
      }

      // Method 1b: Extract from all script tags with a more comprehensive approach
      const scripts = Array.from(document.querySelectorAll('script'));
      for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        const content = script.textContent || script.innerHTML;
        
        if (content.includes('captionTracks') || content.includes('timedtext')) {
          console.log(`📜 Found caption data in script ${i}`);
          
          // Try to extract the actual caption content, not just URLs
          const captionData = this.extractCaptionDataFromScript(content);
          if (captionData) {
            return captionData;
          }
        }
      }

      // Method 1c: Look for pre-loaded caption data in window objects
      const windowKeys = Object.keys(window);
      for (const key of windowKeys) {
        if (key.includes('caption') || key.includes('subtitle')) {
          console.log('🔑 Found caption-related window property:', key);
          try {
            const data = window[key];
            if (data && typeof data === 'object' && data.length) {
              console.log('📝 Found caption array in window property');
              return this.normalizeCaptionData(data);
            }
          } catch (e) {
            // Ignore access errors
          }
        }
      }

    } catch (error) {
      console.error('❌ Error in extractFromPageData:', error);
    }
    return null;
  }

  extractCaptionDataFromScript(scriptContent) {
    try {
      // Look for different patterns of embedded caption data
      const patterns = [
        // Pattern 1: Look for actual caption text embedded in page
        /"text":\s*"([^"]+)"[^}]*"start":\s*([0-9.]+)/g,
        // Pattern 2: Look for caption segments
        /"utf8":\s*"([^"]+)"[^}]*"tStartMs":\s*([0-9]+)/g,
        // Pattern 3: Look for VTT-style data
        /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})\s*\n([^\n]+)/g
      ];

      for (const pattern of patterns) {
        const matches = [...scriptContent.matchAll(pattern)];
        if (matches.length > 0) {
          console.log(`✅ Found ${matches.length} caption matches with pattern`);
          return this.parseMatchesToCaptions(matches, pattern);
        }
      }

      // Try to find JSON objects containing caption data
      const jsonMatches = scriptContent.match(/\{[^{}]*"text"[^{}]*"start"[^{}]*\}/g);
      if (jsonMatches) {
        console.log(`✅ Found ${jsonMatches.length} JSON caption objects`);
        return this.parseJsonCaptions(jsonMatches);
      }

    } catch (error) {
      console.error('❌ Error extracting from script:', error);
    }
    return null;
  }

  parseMatchesToCaptions(matches, pattern) {
    const captions = [];
    
    for (const match of matches) {
      try {
        let text, start, duration = 3; // default duration
        
        if (match[0].includes('tStartMs')) {
          // YouTube JSON format
          text = match[1].replace(/\\u[\dA-F]{4}/gi, (match) => {
            return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16));
          });
          start = parseInt(match[2]) / 1000; // Convert ms to seconds
        } else if (match[0].includes('start')) {
          // Standard format
          text = match[1];
          start = parseFloat(match[2]);
        } else if (match[0].includes('-->')) {
          // VTT format
          text = match[3];
          start = this.parseVTTTime(match[1]);
          const end = this.parseVTTTime(match[2]);
          duration = end - start;
        }
        
        if (text && text.trim() && !isNaN(start)) {
          captions.push({
            start,
            duration,
            text: text.trim().replace(/\\n/g, ' ').replace(/\s+/g, ' ')
          });
        }
      } catch (e) {
        console.log('Error parsing match:', e);
      }
    }
    
    // Sort by start time
    captions.sort((a, b) => a.start - b.start);
    console.log(`✅ Parsed ${captions.length} captions from matches`);
    return captions.length > 0 ? captions : null;
  }

  parseJsonCaptions(jsonMatches) {
    const captions = [];
    
    for (const jsonStr of jsonMatches) {
      try {
        const obj = JSON.parse(jsonStr);
        if (obj.text && obj.start !== undefined) {
          captions.push({
            start: parseFloat(obj.start),
            duration: parseFloat(obj.duration || 3),
            text: obj.text.trim()
          });
        }
      } catch (e) {
        // Ignore invalid JSON
      }
    }
    
    captions.sort((a, b) => a.start - b.start);
    return captions.length > 0 ? captions : null;
  }

  async monitorLiveCaptions() {
    console.log('🔍 Monitoring live captions...');
    
    return new Promise((resolve) => {
      const captions = [];
      const captionTexts = new Set(); // Avoid duplicates
      
      // Find caption display elements
      const captionSelectors = [
        '.ytp-caption-segment',
        '.caption-window',
        '.ytp-caption-window-container .captions-text',
        '[class*="caption"] [class*="text"]'
      ];
      
      let observer;
      let timeout;
      
      const checkForCaptions = () => {
        for (const selector of captionSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const element of elements) {
            const text = element.textContent?.trim();
            if (text && text.length > 3 && !captionTexts.has(text)) {
              captionTexts.add(text);
              
              // Estimate timestamp based on video current time
              const video = document.querySelector('video');
              const currentTime = video ? video.currentTime : captions.length * 3;
              
              captions.push({
                start: currentTime,
                duration: 3,
                text: text
              });
              
              console.log(`📝 Captured live caption: "${text.substring(0, 30)}..."`);
            }
          }
        }
      };
      
      // Set up DOM observer for caption changes
      observer = new MutationObserver(checkForCaptions);
      
      // Observe the video container for caption changes
      const videoContainer = document.querySelector('#movie_player, .html5-video-container');
      if (videoContainer) {
        observer.observe(videoContainer, {
          childList: true,
          subtree: true,
          characterData: true
        });
      }
      
      // Initial check
      checkForCaptions();
      
      // Resolve after collecting captions for 10 seconds
      timeout = setTimeout(() => {
        if (observer) observer.disconnect();
        
        if (captions.length > 0) {
          console.log(`✅ Collected ${captions.length} live captions`);
          resolve(captions);
        } else {
          console.log('❌ No live captions captured');
          resolve(null);
        }
      }, 10000);
      
      // If we get some captions quickly, resolve early
      setTimeout(() => {
        if (captions.length >= 3) {
          if (observer) observer.disconnect();
          clearTimeout(timeout);
          console.log(`✅ Got ${captions.length} captions quickly`);
          resolve(captions);
        }
      }, 3000);
    });
  }

  async extractLikeYtDlp() {
    console.log('🔍 Extracting like yt-dlp...');
    try {
      // This method tries to extract caption data the way yt-dlp does
      // by finding the player response data embedded in the page
      
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent;
        
        // Look for ytInitialPlayerResponse embedded in script
        const playerResponseMatch = content.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
        if (playerResponseMatch) {
          try {
            const playerResponse = JSON.parse(playerResponseMatch[1]);
            console.log('🎯 Found embedded player response');
            
            const captions = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (captions && captions.length > 0) {
              console.log('📝 Found caption tracks in embedded data');
              
              // Instead of fetching URLs, look for actual caption data
              return await this.extractEmbeddedCaptionContent(playerResponse);
            }
          } catch (e) {
            console.log('Error parsing embedded player response:', e);
          }
        }
      }
    } catch (error) {
      console.error('❌ Error in extractLikeYtDlp:', error);
    }
    return null;
  }

  async extractEmbeddedCaptionContent(playerResponse) {
    try {
      // Look for caption data that might be embedded directly
      const jsonStr = JSON.stringify(playerResponse);
      
      // Check if caption content is embedded anywhere in the response
      if (jsonStr.includes('"text"') && jsonStr.includes('"start"')) {
        console.log('🎯 Found embedded caption content');
        
        // Extract caption objects from the JSON
        const captionMatches = jsonStr.match(/"text":"[^"]+","start":"?[0-9.]+"?/g);
        if (captionMatches) {
          const captions = [];
          
          for (const match of captionMatches) {
            try {
              const obj = JSON.parse('{' + match + '}');
              captions.push({
                start: parseFloat(obj.start),
                duration: 3,
                text: obj.text
              });
            } catch (e) {
              // Ignore invalid matches
            }
          }
          
          if (captions.length > 0) {
            console.log(`✅ Extracted ${captions.length} embedded captions`);
            return captions;
          }
        }
      }
    } catch (error) {
      console.error('❌ Error extracting embedded content:', error);
    }
    return null;
  }

  async tryExtractFromPlayerData() {
    console.log('🔍 Trying to extract from player data...');
    try {
      // Look for the video player element and its associated data
      const video = document.querySelector('video');
      if (!video) return null;

      // Try to find text tracks in the video element
      const textTracks = video.textTracks;
      console.log('📺 Text tracks found:', textTracks.length);

      for (let i = 0; i < textTracks.length; i++) {
        const track = textTracks[i];
        console.log(`Track ${i}:`, track.kind, track.language, track.mode);
        
        if (track.kind === 'subtitles' || track.kind === 'captions') {
          // Try to access cues
          try {
            const cues = track.cues;
            if (cues && cues.length > 0) {
              console.log('✅ Found cues:', cues.length);
              const captions = [];
              for (let j = 0; j < cues.length; j++) {
                const cue = cues[j];
                captions.push({
                  start: cue.startTime,
                  duration: cue.endTime - cue.startTime,
                  text: cue.text
                });
              }
              return captions;
            }
          } catch (e) {
            console.log('Cannot access cues directly:', e.message);
          }
        }
      }

      // Try to force load subtitles by enabling them
      for (let i = 0; i < textTracks.length; i++) {
        const track = textTracks[i];
        if (track.kind === 'subtitles' || track.kind === 'captions') {
          track.mode = 'showing';
          // Wait a bit for cues to load
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          try {
            const cues = track.cues;
            if (cues && cues.length > 0) {
              console.log('✅ Found cues after enabling track:', cues.length);
              const captions = [];
              for (let j = 0; j < cues.length; j++) {
                const cue = cues[j];
                captions.push({
                  start: cue.startTime,
                  duration: cue.endTime - cue.startTime,
                  text: cue.text
                });
              }
              track.mode = 'disabled'; // Hide subtitles again
              return captions;
            }
          } catch (e) {
            console.log('Still cannot access cues:', e.message);
          }
        }
      }

    } catch (error) {
      console.error('❌ Error in tryExtractFromPlayerData:', error);
    }
    return null;
  }

  async trySubtitleTrackMonitoring() {
    console.log('🔍 Trying subtitle track monitoring...');
    try {
      return new Promise((resolve) => {
        const video = document.querySelector('video');
        if (!video) {
          resolve(null);
          return;
        }

        let captionsFound = false;
        const checkForCaptions = () => {
          if (captionsFound) return;
          
          const textTracks = video.textTracks;
          for (let i = 0; i < textTracks.length; i++) {
            const track = textTracks[i];
            
            if ((track.kind === 'subtitles' || track.kind === 'captions') && track.cues && track.cues.length > 0) {
              captionsFound = true;
              console.log('✅ Captions loaded via monitoring:', track.cues.length);
              
              const captions = [];
              for (let j = 0; j < track.cues.length; j++) {
                const cue = track.cues[j];
                captions.push({
                  start: cue.startTime,
                  duration: cue.endTime - cue.startTime,
                  text: cue.text
                });
              }
              resolve(captions);
              return;
            }
          }
        };

        // Check immediately
        checkForCaptions();

        // Set up monitoring for track changes
        video.addEventListener('loadedmetadata', checkForCaptions);
        
        // Also monitor for track cue changes
        const textTracks = video.textTracks;
        for (let i = 0; i < textTracks.length; i++) {
          const track = textTracks[i];
          track.addEventListener('cuechange', checkForCaptions);
        }

        // Timeout after 3 seconds
        setTimeout(() => {
          if (!captionsFound) {
            console.log('❌ Timeout waiting for captions');
            resolve(null);
          }
        }, 3000);
      });

    } catch (error) {
      console.error('❌ Error in trySubtitleTrackMonitoring:', error);
      return null;
    }
  }

  async tryDOMExtraction() {
    console.log('🔍 Trying DOM extraction...');
    try {
      // Look for subtitle/caption elements in the DOM
      const captionContainers = [
        '.caption-window',
        '.ytp-caption-window-container',
        '.captions-text',
        '.ytp-caption-segment',
        '[class*="caption"]',
        '[class*="subtitle"]'
      ];

      for (const selector of captionContainers) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          console.log(`📝 Found caption elements with ${selector}:`, elements.length);
          // This would require more complex extraction logic
          // depending on YouTube's current DOM structure
        }
      }

      // Try to click CC button and monitor for caption data
      const ccButton = document.querySelector('.ytp-subtitles-button');
      if (ccButton && !ccButton.classList.contains('ytp-subtitles-button-active')) {
        console.log('🎯 Attempting to enable captions...');
        ccButton.click();
        
        // Wait a bit for captions to appear
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Try to extract from text tracks again
        const video = document.querySelector('video');
        if (video && video.textTracks.length > 0) {
          return await this.tryExtractFromPlayerData();
        }
      }

    } catch (error) {
      console.error('❌ Error in tryDOMExtraction:', error);
    }
    return null;
  }

  async tryYtInitialPlayerResponse() {
    console.log('🔍 Trying ytInitialPlayerResponse...');
    try {
      if (window.ytInitialPlayerResponse) {
        const playerResponse = window.ytInitialPlayerResponse;
        console.log('📊 Player response found:', !!playerResponse);
        
        const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (captionTracks && captionTracks.length > 0) {
          console.log('📝 Caption tracks found:', captionTracks.length);
          
          // Get the first available caption track (preferably English)
          const track = captionTracks.find(t => t.languageCode === 'en') || captionTracks[0];
          console.log('🎯 Selected track:', track.name?.simpleText || track.languageCode);
          
          if (track.baseUrl) {
            // Instead of fetching directly, try alternative approaches
            console.log('🔗 Caption URL found, trying alternative extraction...');
            
            // Try to use a different approach - look for the caption data in the page
            return await this.tryAlternativeCaptionExtraction(track);
          }
        } else {
          console.log('❌ No caption tracks in ytInitialPlayerResponse');
        }
      } else {
        console.log('❌ ytInitialPlayerResponse not found');
      }
    } catch (error) {
      console.error('❌ Error in tryYtInitialPlayerResponse:', error);
    }
    return null;
  }

  async tryAlternativeCaptionExtraction(track) {
    console.log('🔄 Trying alternative caption extraction...');
    
    // Method 1: Try to construct a working URL with different parameters
    try {
      const url = new URL(track.baseUrl);
      
      // Try different format parameters
      const formats = ['srv3', 'srv2', 'srv1', 'ttml', 'vtt'];
      
      for (const format of formats) {
        try {
          const modifiedUrl = new URL(track.baseUrl);
          modifiedUrl.searchParams.set('fmt', format);
          modifiedUrl.searchParams.delete('signature'); // Remove signature to avoid auth issues
          
          console.log(`🔗 Trying format ${format}:`, modifiedUrl.toString());
          
          const response = await fetch(modifiedUrl.toString(), {
            mode: 'cors',
            credentials: 'omit'
          });
          
          if (response.ok) {
            const text = await response.text();
            if (text && text.length > 0) {
              console.log(`✅ Got captions with format ${format}, length:`, text.length);
              return this.parseCaptionContent(text, format);
            }
          }
        } catch (e) {
          console.log(`❌ Format ${format} failed:`, e.message);
        }
      }
    } catch (error) {
      console.log('❌ Alternative extraction failed:', error);
    }
    
    return null;
  }

  parseCaptionContent(content, format) {
    console.log(`🔧 Parsing ${format} content...`);
    
    try {
      if (format === 'vtt') {
        return this.parseVTT(content);
      } else if (format.includes('srv')) {
        return this.parseSRV(content);
      } else {
        return this.parseCaptionXML(content);
      }
    } catch (error) {
      console.error(`❌ Error parsing ${format}:`, error);
      return [];
    }
  }

  parseVTT(vttContent) {
    console.log('🔧 Parsing VTT content...');
    const lines = vttContent.split('\n');
    const captions = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Look for timestamp lines (format: 00:00:00.000 --> 00:00:03.000)
      if (line.includes('-->')) {
        const [startStr, endStr] = line.split('-->').map(s => s.trim());
        const start = this.parseVTTTime(startStr);
        const end = this.parseVTTTime(endStr);
        
        // Get the caption text (next non-empty lines)
        let text = '';
        let j = i + 1;
        while (j < lines.length && lines[j].trim() !== '') {
          if (text) text += ' ';
          text += lines[j].trim();
          j++;
        }
        
        if (text) {
          captions.push({
            start,
            duration: end - start,
            text: text.replace(/<[^>]*>/g, '') // Remove HTML tags
          });
        }
        
        i = j; // Skip processed lines
      }
    }
    
    console.log('✅ Parsed VTT captions:', captions.length);
    return captions;
  }

  parseVTTTime(timeStr) {
    // Parse time format: 00:00:00.000 or 00:00.000
    const parts = timeStr.split(':');
    if (parts.length === 3) {
      const [hours, minutes, seconds] = parts;
      return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
    } else if (parts.length === 2) {
      const [minutes, seconds] = parts;
      return parseInt(minutes) * 60 + parseFloat(seconds);
    }
    return 0;
  }

  parseSRV(srvContent) {
    console.log('🔧 Parsing SRV/JSON content...');
    try {
      const data = JSON.parse(srvContent);
      
      if (data.events) {
        const captions = [];
        
        for (const event of data.events) {
          if (event.segs) {
            let text = '';
            for (const seg of event.segs) {
              if (seg.utf8) {
                text += seg.utf8;
              }
            }
            
            if (text.trim()) {
              captions.push({
                start: event.tStartMs / 1000,
                duration: event.dDurationMs / 1000,
                text: text.trim().replace(/\n/g, ' ')
              });
            }
          }
        }
        
        console.log('✅ Parsed SRV captions:', captions.length);
        return captions;
      }
    } catch (error) {
      console.error('❌ Error parsing SRV:', error);
    }
    
    return [];
  }

  async tryScriptTags() {
    console.log('🔍 Trying script tags...');
    const scripts = document.querySelectorAll('script');
    console.log('📜 Found scripts:', scripts.length);
    
    for (let i = 0; i < scripts.length; i++) {
      const script = scripts[i];
      const content = script.textContent || script.innerHTML;
      
      if (content.includes('captionTracks')) {
        console.log(`📝 Found captionTracks in script ${i}`);
        try {
          // Try different regex patterns
          const patterns = [
            /"captionTracks":\[(.*?)\]/s,
            /"captionTracks":\s*\[(.*?)\]/s,
            /captionTracks":\[(.*?)\]/s
          ];
          
          for (const pattern of patterns) {
            const match = content.match(pattern);
            if (match) {
              console.log('🎯 Pattern matched:', pattern.source);
              const tracks = JSON.parse('[' + match[1] + ']');
              console.log('📋 Parsed tracks:', tracks.length);
              
              if (tracks.length > 0) {
                const track = tracks.find(t => t.languageCode === 'en') || tracks[0];
                console.log('🌐 Selected track language:', track.languageCode || 'unknown');
                
                if (track.baseUrl) {
                  const captionData = await this.fetchCaptionXML(track.baseUrl);
                  if (captionData) {
                    return this.parseCaptionXML(captionData);
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error('❌ Error parsing caption tracks from script:', e);
        }
      }
    }
    
    console.log('❌ No captions found in script tags');
    return null;
  }

  async tryPlayerConfig() {
    console.log('🔍 Trying player config...');
    try {
      // Look for ytplayer.config or similar
      if (window.ytplayer && window.ytplayer.config) {
        console.log('📊 ytplayer.config found');
        const config = window.ytplayer.config;
        
        if (config.args && config.args.player_response) {
          const playerResponse = JSON.parse(config.args.player_response);
          const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          
          if (captionTracks && captionTracks.length > 0) {
            console.log('📝 Caption tracks in player config:', captionTracks.length);
            const track = captionTracks.find(t => t.languageCode === 'en') || captionTracks[0];
            
            if (track.baseUrl) {
              const captionData = await this.fetchCaptionXML(track.baseUrl);
              if (captionData) {
                return this.parseCaptionXML(captionData);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error in tryPlayerConfig:', error);
    }
    
    console.log('❌ No captions found in player config');
    return null;
  }

  async tryClosedCaptionMenu() {
    console.log('🔍 Trying closed caption menu...');
    try {
      // Look for CC button and menu
      const ccButton = document.querySelector('.ytp-subtitles-button, .ytp-cc-button');
      if (ccButton) {
        console.log('📺 CC button found');
        
        // Try to find caption options in the DOM
        const captionOptions = document.querySelectorAll('[role="menuitem"]');
        console.log('📋 Caption options found:', captionOptions.length);
        
        // This is more complex and would require simulating clicks
        // For now, just log that we found the button
      }
    } catch (error) {
      console.error('❌ Error in tryClosedCaptionMenu:', error);
    }
    
    console.log('❌ No captions extracted from CC menu');
    return null;
  }

  async fetchCaptionXML(url) {
    console.log('🌐 Fetching caption XML from:', url);
    try {
      const response = await fetch(url);
      console.log('📡 Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const xmlText = await response.text();
      console.log('📄 XML length:', xmlText.length);
      console.log('📄 XML preview:', xmlText.substring(0, 200) + '...');
      return xmlText;
    } catch (error) {
      console.error('❌ Failed to fetch caption XML:', error);
      return null;
    }
  }

  parseCaptionXML(xmlText) {
    console.log('🔧 Parsing caption XML...');
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      
      // Check for XML parsing errors
      const parserError = doc.querySelector('parsererror');
      if (parserError) {
        console.error('❌ XML parsing error:', parserError.textContent);
        return [];
      }
      
      const textElements = doc.querySelectorAll('text');
      console.log('📝 Text elements found:', textElements.length);
      
      const captions = Array.from(textElements).map((element, index) => {
        const start = parseFloat(element.getAttribute('start'));
        const duration = parseFloat(element.getAttribute('dur') || '0');
        const text = element.textContent.trim();
        
        // Log first few captions for debugging
        if (index < 3) {
          console.log(`Caption ${index}:`, { start, duration, text: text.substring(0, 50) });
        }
        
        return {
          start,
          duration,
          text: text.replace(/\n/g, ' ').replace(/\s+/g, ' ')
        };
      }).filter(caption => caption.text.length > 0);
      
      console.log('✅ Parsed captions:', captions.length);
      return captions;
    } catch (error) {
      console.error('❌ Error parsing caption XML:', error);
      return [];
    }
  }

  getMockCaptions() {
    // Mock captions for demonstration
    return [
      { start: 0, duration: 3, text: "Welcome to this amazing tutorial" },
      { start: 3, duration: 4, text: "Today we'll learn about web development" },
      { start: 7, duration: 3, text: "Starting with HTML basics" },
      { start: 10, duration: 4, text: "HTML stands for HyperText Markup Language" },
      { start: 14, duration: 5, text: "It's the foundation of every webpage" },
      { start: 19, duration: 3, text: "Let's create our first HTML file" },
      { start: 22, duration: 4, text: "Open your favorite text editor" },
      { start: 26, duration: 5, text: "And start typing the basic HTML structure" }
    ];
  }

  renderCaptions(filteredCaptions = null) {
    const container = this.panel.querySelector('.captions-container');
    const captions = filteredCaptions || this.captions;
    
    if (captions.length === 0) {
      container.innerHTML = '<div class="no-captions">No captions available</div>';
      return;
    }

    container.innerHTML = captions.map((caption, index) => `
      <div class="caption-item" data-start="${caption.start}">
        <div class="caption-time">${this.formatTime(caption.start)}</div>
        <div class="caption-text">${caption.text}</div>
      </div>
    `).join('');

    // Add click listeners to caption items
    container.querySelectorAll('.caption-item').forEach(item => {
      item.addEventListener('click', () => {
        const startTime = parseFloat(item.dataset.start);
        this.seekToTime(startTime);
      });
    });
  }

  searchCaptions(query) {
    if (!query.trim()) {
      this.renderCaptions();
      this.updateSearchCount(this.captions.length, this.captions.length);
      return;
    }

    const filtered = this.captions.filter(caption => 
      caption.text.toLowerCase().includes(query.toLowerCase())
    );

    this.renderCaptions(filtered);
    this.updateSearchCount(filtered.length, this.captions.length);
    this.highlightSearchTerm(query);
  }

  updateSearchCount(found, total) {
    const counter = this.panel.querySelector('.search-results-count');
    counter.textContent = `${found} of ${total} captions`;
  }

  highlightSearchTerm(term) {
    const captionTexts = this.panel.querySelectorAll('.caption-text');
    captionTexts.forEach(element => {
      const text = element.textContent;
      const regex = new RegExp(`(${term})`, 'gi');
      element.innerHTML = text.replace(regex, '<mark>$1</mark>');
    });
  }

  seekToTime(seconds) {
    if (this.player) {
      this.player.currentTime = seconds;
    }
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  showError(message) {
    console.log('❌ Showing error:', message);
    const container = this.panel.querySelector('.captions-container');
    container.innerHTML = `
      <div class="error">
        <div>${message}</div>
        <button class="debug-btn" style="margin-top: 10px; padding: 5px 10px; background: #333; color: #fff; border: none; border-radius: 4px; cursor: pointer;">
          Show Debug Info
        </button>
      </div>
    `;
    
    container.querySelector('.debug-btn').addEventListener('click', () => {
      this.showDebugInfo();
    });
  }

  showDebugInfo() {
    const videoId = this.getVideoId();
    const debugInfo = {
      videoId,
      url: window.location.href,
      ytInitialPlayerResponse: !!window.ytInitialPlayerResponse,
      ytplayer: !!window.ytplayer,
      scriptCount: document.querySelectorAll('script').length,
      ccButton: !!document.querySelector('.ytp-subtitles-button, .ytp-cc-button')
    };
    
    console.log('🐛 Debug Info:', debugInfo);
    
    const container = this.panel.querySelector('.captions-container');
    container.innerHTML = `
      <div class="debug-info" style="padding: 16px; font-size: 12px; font-family: monospace;">
        <h4>Debug Information:</h4>
        <pre>${JSON.stringify(debugInfo, null, 2)}</pre>
        <button class="retry-btn" style="margin-top: 10px; padding: 5px 10px; background: #4a9eff; color: #fff; border: none; border-radius: 4px; cursor: pointer;">
          Retry Loading Captions
        </button>
      </div>
    `;
    
    container.querySelector('.retry-btn').addEventListener('click', () => {
      this.loadCaptions();
    });
  }

  observeVideoChanges() {
    let currentUrl = location.href;
    const observer = new MutationObserver(() => {
      if (location.href !== currentUrl) {
        currentUrl = location.href;
        console.log('🔄 Video changed, reloading captions...');
        // Reload captions for new video
        setTimeout(() => this.loadCaptions(), 2000); // Increased delay for page to fully load
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also listen for YouTube's navigation events
    window.addEventListener('yt-navigate-finish', () => {
      console.log('🎯 YouTube navigation finished');
      setTimeout(() => this.loadCaptions(), 2000);
    });

    // Listen for player state changes
    const video = document.querySelector('video');
    if (video) {
      video.addEventListener('loadedmetadata', () => {
        console.log('📺 Video metadata loaded');
        setTimeout(() => this.loadCaptions(), 1000);
      });
    }
  }
}

// Initialize the extension when the page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new YouTubeCaptionExtension());
} else {
  new YouTubeCaptionExtension();
}
