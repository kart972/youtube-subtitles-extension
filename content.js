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
    this.panelMode = localStorage.getItem('captionSearchPanelMode') || 'floating'; // Initialize panel mode
    // Wait for YouTube player to load
    await this.waitForPlayer();
    this.createToggleButton();
    this.createPanel();
    this.updatePanelPlacement(); // Set initial panel placement

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

        // Scroll only the captions container (won't move page focus)
        const captionsContainer = this.panel.querySelector('.captions-container');
        if (captionsContainer) {
          const itemRect = currentCaptionItem.getBoundingClientRect();
          const containerRect = captionsContainer.getBoundingClientRect();
          const itemOffsetTop = itemRect.top - containerRect.top + captionsContainer.scrollTop;
          const targetScrollTop = itemOffsetTop - (captionsContainer.clientHeight / 2) + (currentCaptionItem.clientHeight / 2);
          captionsContainer.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
        }
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
    button.className = 'ytp-button caption-search-btn caption-search-icon-button';
    button.innerHTML = '📝';
    button.title = 'Search Captions';
    
    button.addEventListener('click', () => this.togglePanel());
    controls.insertBefore(button, controls.firstChild);
  }

  createPanel() {
    this.panel = document.createElement('div');
    this.panel.className = 'caption-search-panel';
    // this.panel.style.display = 'none'; // Will be managed by togglePanel

    this.panel.innerHTML = `
      <div class="panel-header">
        <h3 class="drag-handle" title="Drag to move panel">Caption Search</h3>
        <button class="expand-btn">▼</button>
        <button class="close-btn">×</button>
      </div>
      <!-- New expendable settings area -->
      <div class="expendable-settings"> 
          <div class="expendable-settings-content" style="display: none;">
              <h2>Settings</h2>
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
              <div class="panel-placement-selection">
                  <label for="panel-placement-select">Placement:</label>
                  <select id="panel-placement-select">
                      <option value="floating">Floating</option>
                      <option value="below-video">Below Video</option>
                  </select>
              </div>
              <div class="transparency-slider">
                  <label for="transparency-slider">Transparency:</label>
                  <input type="range" id="transparency-slider" min="0.1" max="1" step="0.1" value="0.8">
              </div>
              <div class="caption-size-slider">
                  <label for="caption-size-slider">Caption Size:</label>
                  <input type="range" id="caption-size-slider" min="10" max="30" step="1" value="13">
              </div>
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
      <div class="resizer top-left"></div>
      <div class="resizer top-right"></div>
      <div class="resizer bottom-left"></div>
      <div class="resizer bottom-right"></div>
      <div class="resizer top"></div>
      <div class="resizer bottom"></div>
      <div class="resizer left"></div>
      <div class="resizer right"></div>
    `;

    // Set Ui selector values based on saved settings
    this.setUiSelectorValue('#panel-placement-select', this.panelMode);
    const savedTransparency = localStorage.getItem('captionSearchPanelTransparency') || '0.8';
    this.panel.querySelector('#transparency-slider').value = savedTransparency;
    this.applyTransparency(savedTransparency);

    const savedCaptionSize = localStorage.getItem('captionSearchPanelSize') || '13';
    this.panel.querySelector('#caption-size-slider').value = savedCaptionSize;
    this.applyCaptionSize(savedCaptionSize);

    // Event listeners
    this.panel.querySelector('.close-btn').addEventListener('click', () => this.togglePanel());
    this.panel.querySelector('.search-input').addEventListener('input', (e) => this.searchCaptions(e.target.value));

    this.panel.querySelector('.copy-btn').addEventListener('click', () => this.copyToClipboard());
    this.panel.querySelector('.copy-with-timeline-btn').addEventListener('click', () => this.copyToClipboardWithTimeline());

    this.panel.querySelector('#strip-formatting-checkbox').addEventListener('change', () => this.renderCaptions());

    // Event listener for expendable settings
    const expendableSettingsContent = this.panel.querySelector('.expendable-settings-content');
    this.panel.querySelector('.expand-btn').addEventListener('click', () => {
      const expandBtn = this.panel.querySelector('.expand-btn');
      const isVisible = expendableSettingsContent.style.display === 'block' || expendableSettingsContent.style.display === 'flex';
      expendableSettingsContent.style.display = isVisible ? 'none' : 'flex'; // Use flex for internal elements layout
      expandBtn.textContent = isVisible ? '▼' : '▲';
      this.adjustCaptionsContainerHeight(); // Directly call adjust height after settings expand/collapse
    });

    // const expendableSettingsToggle = this.panel.querySelector('.expendable-settings-toggle');
    // const expendableSettingsContent = this.panel.querySelector('.expendable-settings-content');
    // const expandBtn = this.panel.querySelector('.expand-btn');

    // expendableSettingsToggle.addEventListener('click', () => {
    //   const isVisible = expendableSettingsContent.style.display === 'block' || expendableSettingsContent.style.display === 'flex';
    //   expendableSettingsContent.style.display = isVisible ? 'none' : 'flex'; // Use flex for internal elements layout
    //   expandBtn.textContent = isVisible ? '▼' : '▲';
    //   this.adjustCaptionsContainerHeight(); // Directly call adjust height after settings expand/collapse
    // });

    // Event listener for language selection
    this.panel.querySelector('#language-select').addEventListener('change', (e) => this.handleLanguageChange(e));

    // Event listener for panel placement
    this.panel.querySelector('#panel-placement-select').addEventListener('change', (e) => {
        this.panelMode = e.target.value;
        this.updatePanelPlacement();
    });

    // Event listener for transparency slider
    const transparencySlider = this.panel.querySelector('#transparency-slider');
    transparencySlider.addEventListener('input', (e) => {
      const transparency = e.target.value;
      localStorage.setItem('captionSearchPanelTransparency', transparency);
      this.applyTransparency(transparency);
    });

    // Event listener for caption size slider
    const captionSizeSlider = this.panel.querySelector('#caption-size-slider');
    captionSizeSlider.addEventListener('input', (e) => {
      const size = e.target.value;
      localStorage.setItem('captionSearchPanelSize', size);
      this.applyCaptionSize(size);
    });

    // Fix buttons overlapping with drag handle
    

    // ensure the captions container scrolls internally (prevents page scroll)
    const captionsContainer = this.panel.querySelector('.captions-container');
    if (captionsContainer) {
      captionsContainer.style.overflow = 'auto';
      captionsContainer.style.willChange = 'scroll';
    }

    // this.updatePanelPlacement();
    this.initDragging(); // Initialize dragging logic
    this.initResizing(); // Initialize resizing logic
  }

  setUiSelectorValue(selector, value) {
    const placementSelect = this.panel.querySelector(selector);
    if (placementSelect) {
      const hasOption = Array.from(placementSelect.options).some(o => o.value === value);
      placementSelect.value = hasOption ? value : 'floating';
    }
  }

  applyTransparency(transparency) {
    if (this.panel) {
      this.panel.style.setProperty('--main-bg', `rgba(40, 40, 40, ${transparency})`);
      this.panel.style.setProperty('--border-color', `rgba(68, 68, 68, ${transparency - 0.3})`);
      this.panel.style.setProperty('--header-bg', `rgba(51, 51, 51, ${transparency})`);
      this.panel.style.setProperty('--settings-bg', `rgba(51, 51, 51, ${transparency})`);
      this.panel.style.setProperty('--settings-content-bg', `rgba(42, 42, 42, ${transparency})`);
      this.panel.style.setProperty('--search-input-bg', `rgba(42, 42, 42, ${transparency})`);
      this.panel.style.setProperty('--caption-item-bg', `rgba(42, 42, 42, ${transparency})`);
      this.panel.style.setProperty('--search-container-bg', transparency < 1 ? 'transparent' : '#282828');
    }
  }

  applyCaptionSize(size) {
    if (this.panel) {
      this.panel.style.setProperty('--caption-font-size', `${size}px`);
    }
  }


  updatePanelPlacement() {
    localStorage.setItem('captionSearchPanelMode', this.panelMode);

    // Remove panel from current parent if it exists
    if (this.panel && this.panel.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }

    // Append to correct parent based on mode
    if (this.panelMode === 'floating') {
      document.body.appendChild(this.panel);
      this.panel.classList.add('caption-search-panel-floating');
      this.panel.classList.remove('caption-search-panel-below-video');
      this.initDragging(); // Re-initialize or enable if needed
      this.initResizing(); // Re-initialize or enable if needed
    } else { // 'below-video'
      const targetElement = document.querySelector('#player'); // Common container below the video
      if (targetElement) {
        targetElement.appendChild(this.panel);
        this.panel.classList.add('caption-search-panel-below-video');
        this.panel.classList.remove('caption-search-panel-floating');
        this.removeDragging();
        this.removeResizing();
      } else {
        document.body.appendChild(this.panel);
        this.panelMode = 'floating'; // Revert to floating if target not found
        localStorage.setItem('captionSearchPanelMode', this.panelMode);
        console.warn('Target element #below not found, reverting to floating mode.');
        this.panel.classList.add('caption-search-panel-floating');
        this.panel.classList.remove('caption-search-panel-below-video');
        this.initDragging();
        this.initResizing();
      }
    }
    // Set panel visibility based on this.panelVisible
    this.panel.style.display = this.panelVisible ? 'block' : 'none';
    requestAnimationFrame(() => this.adjustCaptionsContainerHeight());

  }

  initDragging() {
    const dragHandle = this.panel.querySelector('.drag-handle');
    if (!dragHandle) return; // Ensure drag handle exists
    
    // Remove existing listeners to prevent duplicates
    this.removeDragging(); 

    if (this.panelMode !== 'floating') return; // Only drag in floating mode

    let isDragging = false;
    let startX, startY, startLeft, startTop;

    const onMouseDown = (e) => {
      // Don't start drag when clicking interactive elements
      if (e.target.closest('button, input, select, label, a')) {
        return;
      }

      e.preventDefault(); // Prevent text selection during drag

      // Ensure cursor doesn't switch to 'grabbing' / 'move'
      document.body.style.cursor = 'default';
      if (dragHandle) dragHandle.style.cursor = 'default';

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = this.panel.offsetLeft;
      startTop = this.panel.offsetTop;

      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
      document.body.style.mozUserSelect = 'none';
      document.body.style.msUserSelect = 'none';

      document.addEventListener('mousemove', this.boundOnMouseMove);
      document.addEventListener('mouseup', this.boundOnMouseUp);
    };

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
      document.removeEventListener('mousemove', this.boundOnMouseMove);
      document.removeEventListener('mouseup', this.boundOnMouseUp);
    };

    // Store references to the bound functions to remove them later
    this.boundOnMouseDown = onMouseDown;
    this.boundOnMouseMove = onMouseMove;
    this.boundOnMouseUp = onMouseUp;

    dragHandle.addEventListener('mousedown', this.boundOnMouseDown);
  }

  removeDragging() {
    const dragHandle = this.panel.querySelector('.drag-handle');
    if (dragHandle && this.boundOnMouseDown) {
      dragHandle.removeEventListener('mousedown', this.boundOnMouseDown);
    }
    document.removeEventListener('mousemove', this.boundOnMouseMove);
    document.removeEventListener('mouseup', this.boundOnMouseUp);
    this.boundOnMouseDown = null;
    this.boundOnMouseMove = null;
    this.boundOnMouseUp = null;
  }

  removeResizing() {
    const resizers = this.panel.querySelectorAll('.resizer');
    resizers.forEach(resizer => {
      if (this.boundResizerMouseDown) {
        resizer.removeEventListener('mousedown', this.boundResizerMouseDown);
      }
    });
    document.removeEventListener('mousemove', this.boundResize);
    document.removeEventListener('mouseup', this.boundStopResize);
    this.boundResize = null;
    this.boundStopResize = null;
    this.boundResizerMouseDown = null;
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

  // Toggle panel visibility
  togglePanel() {
    this.panelVisible = !this.panelVisible;
    this.panel.style.display = this.panelVisible ? 'block' : 'none';
    if (this.panelVisible) { // Adjust height only if panel becomes visible
      this.adjustCaptionsContainerHeight();
      this.updatePanelPlacement();
    }
  }

  async loadCaptions(targetLanguageCode = 'en') { // Add targetLanguageCode parameter
    console.log('🎬 Loading captions...');
    try {
      // --- Extract Video ID (Analogous to video_id extraction in subtitles.py) ---
      const videoId = this.getVideoId();
      console.log('📹 Video ID:', videoId);

      if (!videoId) {
        console.error('❌ No video ID found');
        this.showError('No video ID found');
        return;
      }

      // --- API Key Scraping (Analogous to API key scraping in subtitles.py) ---
      const apiKey = await this.getApiKey();
      if (!apiKey) {
        console.error('❌ No API key found');
        this.showError('No API key found');
        return;
      }

      // --- Player Data Fetching (Analogous to player data fetching in subtitles.py) ---
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
        subtitleTrack = captionTracks[0]; // Fallback to first available if default not found
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

      // --- Subtitle XML Fetching (Analogous to subtitle XML fetching in subtitles.py) ---
      const subtitleUrl = subtitleTrack.baseUrl;
      const subtitleXml = await this.fetchSubtitleXml(subtitleUrl);
      if (!subtitleXml) {
        console.error('❌ No subtitle XML found');
        this.showError('No subtitle XML found');
        return;
      }

      // --- Subtitle XML Parsing (Analogous to subtitle XML parsing in subtitles.py) ---
      this.captions = this.parseCaptionXML(subtitleXml);
      this.renderCaptions();
      this.updateWordCount();
      this.adjustCaptionsContainerHeight(); // Adjust height after captions are loaded and rendered

    } catch (error) {
      console.error('❌ Failed to load captions:', error);
      this.showError(`Failed to load captions: ${error.message}`);
    }
  }

  /**
   * Extracts the YouTube video ID from the current URL.
   * Analogous to video_id extraction in `subtitles.py`.
   * @returns {string|null} The video ID or null if not found.
   */
  getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  /**
   * Scrapes the YouTube Innertube API key from the page HTML.
   * Analogous to API key scraping in `subtitles.py`.
   * @returns {Promise<string|null>} The API key or null if not found.
   */
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

  /**
   * Fetches the player response data from YouTube's internal API.
   * Analogous to player data fetching in `subtitles.py`.
   * @param {string} videoId - The ID of the YouTube video.
   * @param {string} apiKey - The YouTube Innertube API key.
   * @returns {Promise<object|null>} The player response object or null if an error occurs.
   */
  async getPlayerResponse(videoId, apiKey) {
    const playerUrl = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;
    const payload = {
      context: {
        client: {
          clientName: 'WEB',
          clientVersion: '2.20210721.00.00' // Specific client version to mimic browser requests
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

  /**
   * Fetches the subtitle XML content from the provided URL.
   * Analogous to subtitle XML fetching in `subtitles.py`.
   * @param {string} url - The URL to the subtitle XML file.
   * @returns {Promise<string|null>} The XML content as a string or null if an error occurs.
   */
  async fetchSubtitleXml(url) {
    try {
      const response = await fetch(url);
      return await response.text();
    } catch (error) {
      console.error('❌ Error fetching subtitle XML:', error);
    }
    return null;
  }

  /**
   * Parses the raw XML subtitle text into a structured array of caption objects.
   * Analogous to subtitle XML parsing in `subtitles.py`.
   * @param {string} xmlText - The raw XML string containing subtitle data.
   * @returns {Array<object>} An array of caption objects, each with start, duration, and text properties.
   */
  parseCaptionXML(xmlText) {
    console.log('🔧 Parsing caption XML...');
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xmlText, 'text/xml');
      const textElements = doc.querySelectorAll('text');
      const captionsData = [];
      
      for (const textElement of textElements) {
        const textContent = textElement.textContent.trim();
        // Stop parsing if an AI directive block is encountered
        if (textContent.includes('--==// AI DIRECTIVE BLOCK: START //==--')) {
          break;
        }
        const start = parseFloat(textElement.getAttribute('start'));
        const duration = parseFloat(textElement.getAttribute('dur') || '0');
        
        if (textContent) {
          captionsData.push({ start, duration, text: textContent });
        }
      }

      const captions = captionsData.map((caption, index) => {
        // Calculate end time based on next caption's start time or duration
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

  adjustCaptionsContainerHeight() {
    if (!this.panel) return;

    const panelHeight = this.panel.offsetHeight;
    console.log('DEBUG (adjustHeight): panelHeight:', panelHeight); // Added debug log

    const panelHeader = this.panel.querySelector('.panel-header');
    const expendableSettings = this.panel.querySelector('.expendable-settings');
    const searchContainer = this.panel.querySelector('.search-container');
    const captionsContainer = this.panel.querySelector('.captions-container');

    // Calculate height consumed by non-flexing elements
    const consumedHeight = 
      (panelHeader ? panelHeader.offsetHeight : 0) +
      (expendableSettings ? expendableSettings.offsetHeight : 0) +
      (searchContainer ? searchContainer.offsetHeight : 0);
    console.log('DEBUG (adjustHeight): consumedHeight:', consumedHeight); // Added debug log

    const availableHeight = panelHeight - consumedHeight;
    console.log('DEBUG (adjustHeight): availableHeight:', availableHeight); // Added debug log

    if (captionsContainer) {
      // Ensure a minimum height if necessary
      captionsContainer.style.height = Math.max(0, availableHeight) + 'px';
      // If availableHeight is less than min-height, force min-height, but ensure it doesn't overflow parent
      // This is implicit if availableHeight calculation is correct and min-height is only for content
    }
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

  initResizing() {
    // First, remove any existing listeners to prevent duplicates
    this.removeResizing();

    if (this.panelMode !== 'floating') {
      return; // Only enable resizing in floating mode
    }

    const panel = this.panel;
    const resizers = panel.querySelectorAll('.resizer');
    let currentResizer;

    const minimumWidth = 250;
    const minimumHeight = 150;

    let originalWidth = 0;
    let originalHeight = 0;
    let originalX = 0;
    let originalY = 0;
    let originalMouseX = 0;
    let originalMouseY = 0;

    const self = this; // Store 'this' reference for use in nested functions
    
    // Store bound functions to be able to remove them
    this.boundResize = function(e) {
      if (self.panelMode !== 'floating') return; // Double check mode
      if (currentResizer.classList.contains('bottom-right')) {
        const newWidth = originalWidth + (e.pageX - originalMouseX);
        const newHeight = originalHeight + (e.pageY - originalMouseY);
        if (newWidth > minimumWidth) panel.style.width = newWidth + 'px';
        if (newHeight > minimumHeight) panel.style.height = newHeight + 'px';
      } else if (currentResizer.classList.contains('bottom-left')) {
        const newWidth = originalWidth - (e.pageX - originalMouseX);
        const newHeight = originalHeight + (e.pageY - originalMouseY);
        if (newHeight > minimumHeight) panel.style.height = newHeight + 'px';
        if (newWidth > minimumWidth) {
          panel.style.left = (originalX + (e.pageX - originalMouseX)) + 'px';
          panel.style.width = newWidth + 'px';
        }
      } else if (currentResizer.classList.contains('top-right')) {
        const newWidth = originalWidth + (e.pageX - originalMouseX);
        const newHeight = originalHeight - (e.pageY - originalMouseY);
        if (newWidth > minimumWidth) panel.style.width = newWidth + 'px';
        if (newHeight > minimumHeight) {
          panel.style.top = (originalY + (e.pageY - originalMouseY)) + 'px';
          panel.style.height = newHeight + 'px';
        }
      } else if (currentResizer.classList.contains('top-left')) {
        const newWidth = originalWidth - (e.pageX - originalMouseX);
        const newHeight = originalHeight - (e.pageY - originalMouseY);
        if (newWidth > minimumWidth) {
          panel.style.left = (originalX + (e.pageX - originalMouseX)) + 'px';
          panel.style.width = newWidth + 'px';
        }
        if (newHeight > minimumHeight) {
          panel.style.top = (originalY + (e.pageY - originalMouseY)) + 'px';
          panel.style.height = newHeight + 'px';
        }
      } else if (currentResizer.classList.contains('bottom')) {
        const newHeight = originalHeight + (e.pageY - originalMouseY);
        if (newHeight > minimumHeight) panel.style.height = newHeight + 'px';
      } else if (currentResizer.classList.contains('top')) {
        const newHeight = originalHeight - (e.pageY - originalMouseY);
        if (newHeight > minimumHeight) {
          panel.style.top = (originalY + (e.pageY - originalMouseY)) + 'px';
          panel.style.height = newHeight + 'px';
        }
      } else if (currentResizer.classList.contains('left')) {
        const newWidth = originalWidth - (e.pageX - originalMouseX);
        if (newWidth > minimumWidth) {
          panel.style.left = (originalX + (e.pageX - originalMouseX)) + 'px';
          panel.style.width = newWidth + 'px';
        }
      } else if (currentResizer.classList.contains('right')) {
        const newWidth = originalWidth + (e.pageX - originalMouseX);
        if (newWidth > minimumWidth) panel.style.width = newWidth + 'px';
      }
      self.adjustCaptionsContainerHeight(); // Call adjust height during resize
    }.bind(this); // Bind 'this' to access self.adjustCaptionsContainerHeight

    this.boundStopResize = function() {
      document.removeEventListener('mousemove', this.boundResize);
      document.removeEventListener('mouseup', this.boundStopResize);
      this.adjustCaptionsContainerHeight(); // Call adjust height after resize is complete
    }.bind(this); // Bind 'this'

    resizers.forEach(resizer => {
      this.boundResizerMouseDown = function(e) { // Store for removal
        currentResizer = e.target;
        e.preventDefault();
        originalWidth = parseFloat(getComputedStyle(panel, null).getPropertyValue('width').replace('px', ''));
        originalHeight = parseFloat(getComputedStyle(panel, null).getPropertyValue('height').replace('px', ''));
        originalX = panel.getBoundingClientRect().left;
        originalY = panel.getBoundingClientRect().top;
        originalMouseX = e.pageX;
        originalMouseY = e.pageY;
        document.addEventListener('mousemove', this.boundResize);
        document.addEventListener('mouseup', this.boundStopResize);
      }.bind(this); // Bind 'this'
      resizer.addEventListener('mousedown', this.boundResizerMouseDown);
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
