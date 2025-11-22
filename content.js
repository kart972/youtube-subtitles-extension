class YouTubeCaptionExtension {
  constructor() {
    this.init();
  }

  async init() {
    this.captions = [];
    this.availableCaptionTracks = []; // Initialize array for available caption tracks
    this.defaultLanguageCode = 'en'; // Default language code
    this.currentLanguageCode = this.defaultLanguageCode;
    this.panelVisible = false;
    this.panel = null;
    this.player = null;
    // Wait for YouTube player to load
    await this.waitForPlayer();
    this.createToggleButton();
    this.createPanel();

    this.boundHandleTimeUpdate = this.handleTimeUpdate.bind(this);
    const followToggle = this.panel.querySelector('#follow-toggle-checkbox');
    followToggle.addEventListener('change', (e) => {
      if (e.target.checked) {
        this.player.addEventListener('timeupdate', this.boundHandleTimeUpdate);
      } else {
        this.player.removeEventListener('timeupdate', this.boundHandleTimeUpdate);
      }
    });

    this.loadCaptions();
    
    // Listen for video changes
    this.observeVideoChanges();
  }

  handleTimeUpdate() {
    if (!this.captions.length) return;
    const currentTime = this.player.currentTime;
    const currentCaption = this.captions.find(caption => currentTime >= caption.start && currentTime <= caption.start + caption.duration);

    if (currentCaption) {
      const allCaptionItems = this.panel.querySelectorAll('.caption-item');
      allCaptionItems.forEach(item => item.classList.remove('active'));

      const currentCaptionItem = this.panel.querySelector(`[data-start="${currentCaption.start}"]`);
      if (currentCaptionItem) {
        currentCaptionItem.classList.add('active');
        currentCaptionItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
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
      display: flex;
      align-items: center;
      justify-content: center;
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
        <div class="drag-handle"></div>
        <h3>Caption Search</h3>
        <button class="close-btn">×</button>
      </div>
      <!-- New expendable settings area -->
      <div class="expendable-settings">
          <div class="expendable-settings-toggle">
              <span>Settings</span>
              <button class="expand-btn">▼</button>
          </div>
          <div class="expendable-settings-content" style="display: none;">
              <div class="language-selection">
                  <label for="language-select">Language:</label>
                  <select id="language-select"></select>
              </div>
              <div class="follow-toggle">
                  <label for="follow-toggle-checkbox">Follow</label>
                  <input type="checkbox" id="follow-toggle-checkbox">
              </div>
              <div class="strip-formatting-toggle">
                  <label for="strip-formatting-checkbox">Strip Formatting</label>
                  <input type="checkbox" id="strip-formatting-checkbox">
              </div>
              <button class="copy-btn">Copy</button>
              <button class="copy-with-timeline-btn">Copy with Timeline</button>
          </div>
      </div>
      <div class="search-container">
        <input type="text" placeholder="Search captions..." class="search-input">
        <div class="search-results-count"></div>
        <div class="word-count"></div>
      </div>
      <div class="captions-container">
        <div class="loading">Loading captions...</div>
      </div>
    `;

    document.body.appendChild(this.panel);

    // Event listeners
    this.panel.querySelector('.close-btn').addEventListener('click', () => this.togglePanel());
    this.panel.querySelector('.search-input').addEventListener('input', (e) => this.searchCaptions(e.target.value));

    this.panel.querySelector('.copy-btn').addEventListener('click', () => this.copyToClipboard());
    this.panel.querySelector('.copy-with-timeline-btn').addEventListener('click', () => this.copyToClipboardWithTimeline());

    this.panel.querySelector('#strip-formatting-checkbox').addEventListener('change', () => this.renderCaptions());

    // Event listener for expendable settings
    const expendableSettingsToggle = this.panel.querySelector('.expendable-settings-toggle');
    const expendableSettingsContent = this.panel.querySelector('.expendable-settings-content');
    const expandBtn = this.panel.querySelector('.expand-btn');

    expendableSettingsToggle.addEventListener('click', () => {
      const isVisible = expendableSettingsContent.style.display === 'block' || expendableSettingsContent.style.display === 'flex';
      expendableSettingsContent.style.display = isVisible ? 'none' : 'flex'; // Use flex for internal elements layout
      expandBtn.textContent = isVisible ? '▼' : '▲';
    });

    // Event listener for language selection
    this.panel.querySelector('#language-select').addEventListener('change', (e) => this.handleLanguageChange(e));


    // Dragging logic
    const dragHandle = this.panel.querySelector('.drag-handle');
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    dragHandle.addEventListener('mousedown', (e) => {
      e.preventDefault(); // Prevent text selection during drag
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = this.panel.offsetLeft;
      startTop = this.panel.offsetTop;

      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
      document.body.style.mozUserSelect = 'none';
      document.body.style.msUserSelect = 'none';

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    const onMouseMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      this.panel.style.left = `${startLeft + dx}px`;
      this.panel.style.top = `${startTop + dy}px`;
    };

    const onMouseUp = () => {
      isDragging = false;
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';
      document.body.style.mozUserSelect = '';
      document.body.style.msUserSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  copyToClipboard() {
    const text = this.captions.map(caption => caption.text).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      console.log('✅ Captions copied to clipboard');
    }).catch(err => {
      console.error('❌ Failed to copy captions:', err);
    });
  }

  copyToClipboardWithTimeline() {
    const text = this.captions.map(caption => {
      const start = this.formatTime(caption.start);
      const end = this.formatTime(caption.start + caption.duration);
      return `[${start} --> ${end}] ${caption.text}`;
    }).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      console.log('✅ Captions with timeline copied to clipboard');
    }).catch(err => {
      console.error('❌ Failed to copy captions with timeline:', err);
    });
  }

  handleTimeUpdate() {
    if (!this.captions.length) return;
    const currentTime = this.player.currentTime;
    const currentCaption = this.captions.find(caption => currentTime >= caption.start && currentTime <= caption.start + caption.duration);

    if (currentCaption) {
      const allCaptionItems = this.panel.querySelectorAll('.caption-item');
      allCaptionItems.forEach(item => item.classList.remove('active'));

      const currentCaptionItem = this.panel.querySelector(`[data-start="${currentCaption.start}"]`);
      if (currentCaptionItem) {
        currentCaptionItem.classList.add('active');
        currentCaptionItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  togglePanel() {
    this.panelVisible = !this.panelVisible;
    this.panel.style.display = this.panelVisible ? 'block' : 'none';
  }

  async loadCaptions(targetLanguageCode = 'en') { // Add targetLanguageCode parameter
    console.log('🎬 Loading captions...');
    try {
      const videoId = this.getVideoId();
      console.log('📹 Video ID:', videoId);

      if (!videoId) {
        console.error('❌ No video ID found');
        this.showError('No video ID found');
        return;
      }

      const apiKey = await this.getApiKey();
      if (!apiKey) {
        console.error('❌ No API key found');
        this.showError('No API key found');
        return;
      }

      const playerResponse = await this.getPlayerResponse(videoId, apiKey);
      if (!playerResponse) {
        console.error('❌ No player response found');
        this.showError('No player response found');
        return;
      }

      const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (!captionTracks || captionTracks.length === 0) {
        console.error('❌ No caption tracks found');
        this.showError('No caption tracks found');
        return;
      }

      this.availableCaptionTracks = captionTracks; // Store all caption tracks

      let effectiveLanguageCode = targetLanguageCode;
      let subtitleTrack = captionTracks.find(track => track.languageCode === effectiveLanguageCode);

      // If targetLanguageCode is not found, try current language, then default, then first available
      if (!subtitleTrack) {
        effectiveLanguageCode = this.currentLanguageCode;
        subtitleTrack = captionTracks.find(track => track.languageCode === effectiveLanguageCode);
      }
      if (!subtitleTrack && this.defaultLanguageCode !== effectiveLanguageCode) { // Avoid double check if default was already target/current
        effectiveLanguageCode = this.defaultLanguageCode;
        subtitleTrack = captionTracks.find(track => track.languageCode === effectiveLanguageCode);
      }
      if (!subtitleTrack && captionTracks.length > 0) { // Fallback to first available track
        effectiveLanguageCode = captionTracks[0].languageCode;
        subtitleTrack = captionTracks[0];
      }

      if (!subtitleTrack) { // If still no track found, show error
        console.error(`❌ No suitable subtitle track found.`);
        this.showError(`No suitable subtitle track found.`);
        return;
      }
      
      this.currentLanguageCode = effectiveLanguageCode; // Store the language that was actually loaded
      this.populateLanguageDropdown(captionTracks, this.currentLanguageCode); // Populate dropdown with the actually loaded language selected

      const subtitleUrl = subtitleTrack.baseUrl;
      const subtitleXml = await this.fetchSubtitleXml(subtitleUrl);
      if (!subtitleXml) {
        console.error('❌ No subtitle XML found');
        this.showError('No subtitle XML found');
        return;
      }

      this.captions = this.parseCaptionXML(subtitleXml);
      this.renderCaptions();
      this.updateWordCount();

    } catch (error) {
      console.error('❌ Failed to load captions:', error);
      this.showError(`Failed to load captions: ${error.message}`);
    }
  }

  getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  async getApiKey() {
    try {
      const response = await fetch(window.location.href);
      const html = await response.text();
      const match = html.match(/"INNERTUBE_API_KEY":"([^"]*)"/);
      if (match) {
        return match[1];
      }
    } catch (error) {
      console.error('❌ Error fetching API key:', error);
    }
    return null;
  }

  async getPlayerResponse(videoId, apiKey) {
    const playerUrl = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;
    const payload = {
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20210721.00.00'
        }
      },
      videoId: videoId
    };

    try {
      const response = await fetch(playerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      return await response.json();
    } catch (error) {
      console.error('❌ Error fetching player response:', error);
    }
    return null;
  }

  async fetchSubtitleXml(url) {
    try {
      const response = await fetch(url);
      return await response.text();
    } catch (error) {
      console.error('❌ Error fetching subtitle XML:', error);
    }
    return null;
  }

  parseCaptionXML(xmlText) {
    console.log('🔧 Parsing caption XML...');
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      const textElements = doc.querySelectorAll('text');
      const captionsData = [];
      
      for (const textElement of textElements) {
        const textContent = textElement.textContent.trim();
        if (textContent.includes('--==// AI DIRECTIVE BLOCK: START //==--')) {
          break; // Stop parsing when the marker is found
        }
        const start = parseFloat(textElement.getAttribute('start'));
        const duration = parseFloat(textElement.getAttribute('dur') || '0');
        
        if (textContent) {
          captionsData.push({ start, duration, text: textContent });
        }
      }

      const captions = captionsData.map((caption, index) => {
        const endTime = (index + 1 < captionsData.length) ? captionsData[index + 1].start : caption.start + caption.duration;
        return {
          start: caption.start,
          duration: endTime - caption.start,
          text: caption.text.replace(/\n/g, ' ').replace(/\s+/g, ' ')
        };
      });

      console.log('✅ Parsed captions:', captions.length);
      return captions;
    } catch (error) {
      console.error('❌ Error parsing caption XML:', error);
      return [];
    }
  }

  updateWordCount() {
    const wordCount = this.captions.reduce((total, caption) => total + caption.text.split(' ').length, 0);
    const wordCountEl = this.panel.querySelector('.word-count');
    wordCountEl.textContent = `Total words: ${wordCount}`;
  }

  renderCaptions(filteredCaptions = null) {
    const container = this.panel.querySelector('.captions-container');
    const captions = filteredCaptions || this.captions;
    const stripFormatting = this.panel.querySelector('#strip-formatting-checkbox').checked;

    if (captions.length === 0) {
      container.innerHTML = '<div class="no-captions">No captions available</div>';
      return;
    }

    container.innerHTML = captions.map((caption, index) => {
      const text = stripFormatting ? caption.text.replace(/<[^>]+>/g, '') : caption.text;
      return `
      <div class="caption-item" data-start="${caption.start}">
        <div class="caption-time">${this.formatTime(caption.start)}</div>
        <div class="caption-text">${text}</div>
      </div>
    `}).join('');

    // Add click listeners to caption items
    container.querySelectorAll('.caption-item').forEach(item => {
      item.addEventListener('click', () => {
        const startTime = parseFloat(item.dataset.start);
        this.seekToTime(startTime);
      });
    });
  }

  copyToClipboard() {
    const stripFormatting = this.panel.querySelector('#strip-formatting-checkbox').checked;
    const text = this.captions.map(caption => {
      return stripFormatting ? caption.text.replace(/<[^>]+>/g, '') : caption.text;
    }).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      console.log('✅ Captions copied to clipboard');
    }).catch(err => {
      console.error('❌ Failed to copy captions:', err);
    });
  }

  copyToClipboardWithTimeline() {
    const stripFormatting = this.panel.querySelector('#strip-formatting-checkbox').checked;
    const text = this.captions.map(caption => {
      const start = this.formatTime(caption.start);
      const end = this.formatTime(caption.start + caption.duration);
      const captionText = stripFormatting ? caption.text.replace(/<[^>]+>/g, '') : caption.text;
      return `[${start} --> ${end}] ${captionText}`;
    }).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      console.log('✅ Captions with timeline copied to clipboard');
    }).catch(err => {
      console.error('❌ Failed to copy captions with timeline:', err);
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

  populateLanguageDropdown(captionTracks, selectedLanguageCode) {
    const languageSelect = this.panel.querySelector('#language-select');
    languageSelect.innerHTML = ''; // Clear existing options

    // Map YouTube's language codes to more readable names (if available)
    const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

    captionTracks.forEach(track => {
      const option = document.createElement('option');
      option.value = track.languageCode;
      // Use name.simpleText if available, otherwise use languageNames or languageCode
      option.textContent = track.name ? track.name.simpleText : languageNames.of(track.languageCode) || track.languageCode;
      if (track.languageCode === selectedLanguageCode) {
        option.selected = true;
      }
      languageSelect.appendChild(option);
    });
  }

  handleLanguageChange(event) {
    const newLanguageCode = event.target.value;
    this.loadCaptions(newLanguageCode); // Reload captions for the newly selected language
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
