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
    
    // Overlay Mode state
    this.isOverlayMode = false;
    this.overlayElement = null;
    this.overlayTextElement = null;
    this.currentVideoId = null;

    // Wait for YouTube player to load
    await this.waitForPlayer();
    this.createToggleButton();
    this.createPanel();
    this.createOverlay(); // Create overlay elements
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

    // Keyboard shortcut for Overlay Mode (Alt+C)
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.code === 'KeyC') {
        e.preventDefault();
        this.toggleOverlayMode();
      }
    });

    this.loadCaptions();
    
    // Listen for video changes
    this.observeVideoChanges();
  }

  // Safety check: ensure panel exists before accessing
  isPanelValid() {
    try {
      return this.panel && document.body.contains(this.panel);
    } catch (e) {
      return false;
    }
  }

  createOverlay() {
    this.overlayElement = document.createElement('div');
    this.overlayElement.className = 'caption-search-overlay';
    
    this.overlayTextElement = document.createElement('span');
    this.overlayTextElement.className = 'caption-search-overlay-text';
    this.overlayElement.appendChild(this.overlayTextElement);

    // Append to video player container so it's visible in full screen
    const playerContainer = document.querySelector('.html5-video-player') || document.body;
    playerContainer.appendChild(this.overlayElement);
  }

  toggleOverlayMode() {
    if (!this.isPanelValid() || !this.overlayElement || !this.player) return; // Safety check
    
    this.isOverlayMode = !this.isOverlayMode;
    
    try {
      if (this.isOverlayMode) {
        // Enter Overlay Mode
        this.overlayElement.style.display = 'block';
        if (this.panel && document.body.contains(this.panel)) {
          this.panel.style.display = 'none'; // Hide normal panel
        }
        this.panelVisible = false; // Sync state
        
        // Ensure time update listener is active for overlay updates
        // We force it on in overlay mode, regardless of "Follow" toggle
        this.player.removeEventListener('timeupdate', this.boundHandleTimeUpdate); // Remove to avoid duplicate
        this.player.addEventListener('timeupdate', this.boundHandleTimeUpdate);
        
        // Initial update
        this.handleTimeUpdate();
        console.log('📺 Overlay Mode: ON');
      } else {
        // Exit Overlay Mode
        this.overlayElement.style.display = 'none';
        
        // Revert "Follow" listener to checkbox state
        if (this.isPanelValid()) {
          const followToggle = this.panel.querySelector('#follow-toggle-checkbox');
          if (followToggle && !followToggle.checked) {
            this.player.removeEventListener('timeupdate', this.boundHandleTimeUpdate);
          }
        }
        
        console.log('📺 Overlay Mode: OFF');
      }
    } catch (e) {
      console.error('Error in toggleOverlayMode:', e.message);
    }
  }

  handleTimeUpdate() {
    if (!this.captions.length || !this.player) return;
    
    try {
      const currentTime = this.player.currentTime;
      const currentCaption = this.captions.find(caption => currentTime >= caption.start && currentTime <= caption.start + caption.duration);

      if (this.isOverlayMode) {
        // Overlay Mode Update - with safety checks
        if (!this.overlayElement || !document.body.contains(this.overlayElement)) return;
        
        if (currentCaption && this.overlayTextElement) {
          this.overlayTextElement.textContent = currentCaption.text.replace(/<[^>]+>/g, '');
          this.overlayElement.style.display = 'block';
        } else {
          if (this.overlayTextElement) this.overlayTextElement.textContent = '';
          this.overlayElement.style.display = 'none';
        }
      } else {
        // Standard Panel Update - with safety checks
        if (!this.isPanelValid()) return;
        
        if (currentCaption) {
          const allCaptionItems = this.panel.querySelectorAll('.caption-item');
          allCaptionItems.forEach(item => item.classList.remove('active'));

          // Use fixed precision for string matching to avoid float comparison issues
          const searchKey = currentCaption.start.toFixed(3);
          const currentCaptionItem = this.panel.querySelector(`[data-start="${searchKey}"]`);
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
    } catch (e) {
      // Silently ignore errors from dead objects
      // This prevents "can't access dead object" errors during overlay mode
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
    if (document.querySelector('.caption-search-btn') || document.querySelector('.caption-search-floating-btn')) {
      return;
    }
    const controls = document.querySelector('.ytp-right-controls');
    
    const button = document.createElement('button');
    button.innerHTML = '📝';
    button.title = 'Search Captions';
    button.addEventListener('click', () => this.togglePanel());

    if (controls) {
      // Desktop YouTube
      console.log('✅ Found YouTube controls, attaching button...');
      button.className = 'ytp-button caption-search-btn caption-search-icon-button';
      controls.insertBefore(button, controls.firstChild);
    } else {
      // Mobile or fallback
      console.log('⚠️ YouTube controls not found, using floating button...');
      button.className = 'caption-search-floating-btn';
      // Style for floating button
      Object.assign(button.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '50px',
        height: '50px',
        borderRadius: '50%',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        fontSize: '24px',
        zIndex: '9999',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: '0 2px 10px rgba(0,0,0,0.3)'
      });
      document.body.appendChild(button);
    }
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
              <div class="follow-toggle-settings">
                  <label for="follow-toggle-checkbox-settings">Follow</label>
                  <input type="checkbox" id="follow-toggle-checkbox-settings">
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
              <div class="upload-subtitles">
                  <label>Import Subtitles (.srt, .vtt):</label>
                  <button class="upload-btn">Choose File</button>
                  <input type="file" id="subtitle-file-input" accept=".srt,.vtt" style="display: none;">
              </div>
          </div>
      </div>
      <div class="search-container">
        <!-- Single-line layout: input fills remaining space, follow toggle to the right -->
      <div class="search-row" style="display:flex;align-items:center;gap:8px;">
        <input type="text" placeholder="Search captions..." class="search-input" style="flex:1;min-width:0;padding:6px 8px;">
        <div class="follow-toggle" style="flex:0;display:flex;align-items:center;gap:6px;">
        <label for="follow-toggle-checkbox" style="margin:0;">Follow</label>
        <input type="checkbox" id="follow-toggle-checkbox">
        </div>
      </div>
        
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

    // Apply saved position and size
    if (this.panelMode === 'floating') {
      const savedTop = localStorage.getItem('captionSearchPanelTop');
      const savedLeft = localStorage.getItem('captionSearchPanelLeft');
      const savedWidth = localStorage.getItem('captionSearchPanelWidth');
      const savedHeight = localStorage.getItem('captionSearchPanelHeight');

      if (savedTop) this.panel.style.top = savedTop;
      if (savedLeft) this.panel.style.left = savedLeft;
      if (savedWidth) this.panel.style.width = savedWidth;
      if (savedHeight) this.panel.style.height = savedHeight;
    }

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

    // Event listener for file upload
    const uploadBtn = this.panel.querySelector('.upload-btn');
    const fileInput = this.panel.querySelector('#subtitle-file-input');
    
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

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

  handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const extension = file.name.split('.').pop().toLowerCase();
      
      let parsedCaptions = [];
      try {
        if (extension === 'srt') {
          parsedCaptions = this.parseSRT(content);
        } else if (extension === 'vtt') {
          parsedCaptions = this.parseVTT(content);
        } else {
          alert('Unsupported file format. Please upload .srt or .vtt');
          return;
        }

        if (parsedCaptions.length > 0) {
          this.captions = parsedCaptions;
          this.renderCaptions();
          this.updateWordCount();
          this.adjustCaptionsContainerHeight();
          
          // Update UI to reflect custom file
          const languageSelect = this.panel.querySelector('#language-select');
          // Add and select a "Custom File" option
          let customOption = languageSelect.querySelector('option[value="custom"]');
          if (!customOption) {
            customOption = document.createElement('option');
            customOption.value = 'custom';
            customOption.textContent = `File: ${file.name}`;
            languageSelect.appendChild(customOption);
          } else {
            customOption.textContent = `File: ${file.name}`;
          }
          languageSelect.value = 'custom';
          
          console.log(`✅ Loaded ${parsedCaptions.length} captions from file`);
        } else {
          alert('No valid captions found in file.');
        }
      } catch (error) {
        console.error('Error parsing subtitle file:', error);
        alert('Error parsing subtitle file');
      }
    };
    reader.readAsText(file);
  }

  parseSRT(content) {
    const captions = [];
    const blocks = content.trim().split(/\n\s*\n/);
    
    blocks.forEach(block => {
      const lines = block.split('\n');
      if (lines.length < 3) return;

      // Skip index line if present (some bad SRTs might format differently, but standard has index)
      let timeLineIndex = 1;
      if (!lines[0].includes('-->')) {
        // If first line doesn't have arrow, assume it's index
        timeLineIndex = 1; 
      } else {
        timeLineIndex = 0;
      }
      
      const timeLine = lines[timeLineIndex];
      const textLines = lines.slice(timeLineIndex + 1);
      
      if (!timeLine || !timeLine.includes('-->')) return;

      const [startStr, endStr] = timeLine.split('-->').map(s => s.trim());
      const start = this.timeToSeconds(startStr);
      const end = this.timeToSeconds(endStr);
      const text = textLines.join(' ');

      if (!isNaN(start) && !isNaN(end)) {
        captions.push({
          start,
          duration: end - start,
          text
        });
      }
    });
    return captions;
  }
    
  /**
   * Fetches captions from the fallback GitHub repository.
   * @param {string} videoId - The YouTube Video ID.
   * @returns {Promise<Array<object>|null>} Parsed captions or null.
   */
  /**
   * Fetches captions from the fallback GitHub repository.
   * @param {string} videoId - The YouTube Video ID.
   * @returns {Promise<Array<object>|null>} Parsed captions or null.
   */
  async fetchGitHubCaptions(videoId) {
    // --- CONFIGURATION ---
    const GITHUB_USER = 'kart972'; 
    const GITHUB_REPO = 'subtitles_database'; 
    const FOLDER_PATH = 'youtube-subtitles';
    // ---------------------

    console.log(`🌍 Checking GitHub fallback for Video ID: ${videoId}`);

    try {
      // 1. Get directory listing from GitHub API
      const apiURL = `https://api.github.com/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${FOLDER_PATH}`;
      const apiResponse = await fetch(apiURL);
      
      if (!apiResponse.ok) {
        console.warn(`⚠️ Could not access GitHub repo: ${apiResponse.status}`);
        return null;
      }

      const files = await apiResponse.json();
      
      // 2. Find .srt file starting with VideoID
      const matchingFile = files.find(file => 
        file.name.startsWith(videoId) && file.name.toLowerCase().endsWith('.srt')
      );

      if (!matchingFile) {
        console.log(`ℹ️ No matching .srt file found for ${videoId} in GitHub repository.`);
        return null;
      }

      console.log(`✅ Found fallback file: ${matchingFile.name}`);

      // 3. Extract language code from filename (videoId___Title___ru.srt)
      const filename = matchingFile.name.replace('.srt', '');
      const parts = filename.split('___');
      this.currentCustomLanguageCode = parts[parts.length - 1] || 'custom';
      this.currentCustomFileName = matchingFile.name;

      // 4. Fetch file content
      const contentResponse = await fetch(matchingFile.download_url);
      if (!contentResponse.ok) return null;

      const srtContent = await contentResponse.text();
      
      // 5. Parse SRT
      return this.parseSRT(srtContent);

    } catch (error) {
      console.error('❌ GitHub Fallback Error:', error);
      return null;
    }
  }
    
  parseVTT(content) {
    const captions = [];
    const lines = content.trim().split('\n');
    let i = 0;
    
    // Skip WEBVTT header
    if (lines[0].startsWith('WEBVTT')) i++;
    while (i < lines.length && lines[i].trim() === '') i++;

    while (i < lines.length) {
      // Check for optional identifier
      if (lines[i].trim() !== '' && !lines[i].includes('-->')) {
        i++; // Skip identifier
      }

      if (i >= lines.length) break;

      const timeLine = lines[i];
      if (timeLine.includes('-->')) {
        const [startStr, endStr] = timeLine.split('-->').map(s => s.trim().split(' ')[0]); // Remove align settings
        const start = this.timeToSeconds(startStr);
        const end = this.timeToSeconds(endStr);
        
        i++;
        let text = [];
        while (i < lines.length && lines[i].trim() !== '') {
          text.push(lines[i]);
          i++;
        }
        
        if (!isNaN(start) && !isNaN(end)) {
          captions.push({
            start,
            duration: end - start,
            text: text.join(' ')
          });
        }
      } else {
        i++;
      }
    }
    return captions;
  }

  timeToSeconds(timeStr) {
    if (!timeStr) return 0;
    timeStr = timeStr.replace(',', '.'); // Handle comma in SRT
    const parts = timeStr.split(':');
    let seconds = 0;
    
    if (parts.length === 3) {
      seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      seconds = parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return seconds;
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

    // Append to correct parent and apply styles based on mode
    if (this.panelMode === 'floating') {
      document.body.appendChild(this.panel);
      this.panel.classList.add('caption-search-panel-floating');
      this.panel.classList.remove('caption-search-panel-below-video');

      // Apply saved position and size
      const savedTop = localStorage.getItem('captionSearchPanelTop');
      const savedLeft = localStorage.getItem('captionSearchPanelLeft');
      const savedWidth = localStorage.getItem('captionSearchPanelWidth');
      const savedHeight = localStorage.getItem('captionSearchPanelHeight');

      this.panel.style.top = savedTop || '60px';
      this.panel.style.left = savedLeft || 'calc(50% - 175px)';
      this.panel.style.width = savedWidth || '350px';
      this.panel.style.height = savedHeight || ''; // Default height can be auto

      this.initDragging(); // Re-initialize or enable if needed
      this.initResizing(); // Re-initialize or enable if needed
    } else { // 'below-video'
      // Try to insert after #player in the main column
      const player = document.querySelector('#player');
      const targetParent = player ? player.parentNode : null;
      
      if (targetParent) {
        // Insert after player (or append if it's the last child)
        if (player.nextSibling) {
            targetParent.insertBefore(this.panel, player.nextSibling);
        } else {
            targetParent.appendChild(this.panel);
        }
        
        this.panel.classList.add('caption-search-panel-below-video');
        this.panel.classList.remove('caption-search-panel-floating');
        
        // Remove inline styles so CSS can take over
        this.panel.style.top = '';
        this.panel.style.left = '';
        this.panel.style.width = '';
        this.panel.style.height = '';

        this.removeDragging();
        this.removeResizing();
      } else {
        document.body.appendChild(this.panel);
        this.panelMode = 'floating'; // Revert to floating if target not found
        localStorage.setItem('captionSearchPanelMode', this.panelMode);
        console.warn('Target element #player parent not found, reverting to floating mode.');
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

      // Save position
      if (this.panelMode === 'floating') {
        localStorage.setItem('captionSearchPanelTop', this.panel.style.top);
        localStorage.setItem('captionSearchPanelLeft', this.panel.style.left);
      }
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

  // Main function to load captions
  async loadCaptions(targetLanguageCode = 'en') {
    if (this.isLoading) return;
    this.isLoading = true;
    
    console.log('🎬 Loading captions...');
    try {
      const videoId = this.getVideoId();
      if (!videoId) {
        this.showError('No video ID found');
        this.isLoading = false;
        return;
      }

      // Only reset custom track info if it's a NEW video
      if (this.currentVideoId !== videoId) {
        console.log('🆕 New video detected, resetting custom track info');
        this.currentVideoId = videoId;
        this.currentCustomFileName = null;
        this.currentCustomLanguageCode = null;
      }

      let nativeLoaded = false;

      // --- STAGE 1: Browser Data (Natural Page Scraping & WEB API) ---
      console.log('🔍 [Stage 1] Trying browser data methods...');
      let playerResponse = await this.getPlayerResponseFromPage();
      
      if (!playerResponse || !playerResponse.captions) {
        const apiKey = await this.getApiKey();
        if (apiKey) {
          playerResponse = await this.getPlayerResponse(videoId, apiKey);
        }
      }

      if (playerResponse && playerResponse.captions) {
        nativeLoaded = await this.fetchAndRenderNativeCaptions(playerResponse, targetLanguageCode);
      }

      // --- STAGE 2: Backup Method (ANDROID Client) ---
      if (!nativeLoaded) {
        console.log('🔄 [Stage 2] Trying ANDROID backup method...');
        const apiKey = await this.getApiKey();
        const visitorData = await this.getVisitorData();
        if (apiKey) {
          // Pass targetLanguageCode as 'hl'
          playerResponse = await this.getPlayerResponseAndroid(videoId, apiKey, visitorData, targetLanguageCode);
          if (playerResponse && playerResponse.captions) {
            nativeLoaded = await this.fetchAndRenderNativeCaptions(playerResponse, targetLanguageCode);
          }
        }
      }

      // --- FALLBACK LOGIC ---
      // 1. Determine if we only have auto-generated tracks
      const hasOnlyAutoGenerated = this.availableCaptionTracks && 
                                   this.availableCaptionTracks.length > 0 && 
                                   this.availableCaptionTracks.every(track => track.kind === 'asr' || track.languageCode.includes('-auto'));

      // 2. Decide whether to try GitHub
      // We try GitHub if:
      // a) User explicitly selected 'custom' (GitHub)
      // b) Native failed to load any captions (!nativeLoaded)
      // c) We are on initial load (target='en' or default) AND native only has auto-generated
      const shouldTryGitHub = targetLanguageCode === 'custom' || 
                              !nativeLoaded || 
                              (hasOnlyAutoGenerated && (targetLanguageCode === 'en' || targetLanguageCode === this.defaultLanguageCode));

      if (shouldTryGitHub) {
        console.log('🔄 Checking GitHub for manual subtitles (Native missing or auto-generated)...');
        const fallbackCaptions = await this.fetchGitHubCaptions(videoId);
        
        if (fallbackCaptions && fallbackCaptions.length > 0) {
          this.captions = fallbackCaptions;
          this.currentLanguageCode = 'custom';
          
          if (this.isPanelValid()) {
            // Re-populate dropdown to include native tracks + the GitHub track
            this.populateLanguageDropdown(this.availableCaptionTracks || [], 'custom');
            this.renderCaptions();
            this.updateWordCount();
            this.adjustCaptionsContainerHeight();
          }
          console.log(`✅ Loaded ${fallbackCaptions.length} captions from GitHub fallback`);
          this.isLoading = false;
          return;
        }
      }

      if (nativeLoaded) {
        this.isLoading = false;
        return;
      }

      this.showError('No captions found for this video.');
    } catch (error) {
      console.error('❌ Failed to load captions:', error);
      this.showError(`Failed to load captions: ${error.message}`);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Shared logic to select a track, fetch XML, and render captions.
   */
  async fetchAndRenderNativeCaptions(playerResponse, targetLanguageCode) {
    console.log('🔧 [Native] Analyzing caption tracks in player response...');
    
    // Support various YouTube response structures
    let captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!captionTracks) {
      captionTracks = playerResponse?.captions?.captionTracks;
    }

    if (!captionTracks || captionTracks.length === 0) {
      console.warn('⚠️ [Native] No caption tracks found in this player response structure.');
      return false;
    }

    console.log(`📊 [Native] Found ${captionTracks.length} available tracks.`);
    this.availableCaptionTracks = captionTracks;

    // If user explicitly asked for GitHub/Custom, don't try to load anything natively
    if (targetLanguageCode === 'custom') return false;

    // --- TRACK SELECTION LOGIC ---
    let subtitleTrack = null;
    let finalLanguageCode = targetLanguageCode;

    // 1. Try exact target language
    subtitleTrack = captionTracks.find(t => t.languageCode === targetLanguageCode);
    
    // 2. Try current/saved language
    if (!subtitleTrack) {
      subtitleTrack = captionTracks.find(t => t.languageCode === this.currentLanguageCode);
      if (subtitleTrack) finalLanguageCode = this.currentLanguageCode;
    }
    
    // 3. Try default language
    if (!subtitleTrack && this.defaultLanguageCode !== targetLanguageCode) {
      subtitleTrack = captionTracks.find(t => t.languageCode === this.defaultLanguageCode);
      if (subtitleTrack) finalLanguageCode = this.defaultLanguageCode;
    }
    
    // 4. Fallback to first available track
    if (!subtitleTrack && captionTracks.length > 0) {
      subtitleTrack = captionTracks[0];
      finalLanguageCode = subtitleTrack.languageCode;
      console.log(`ℹ️ [Native] Falling back to first available language: ${finalLanguageCode}`);
    }

    if (subtitleTrack) {
      console.log(`📥 [Native] Fetching XML for: ${finalLanguageCode}`);
      const subtitleUrl = subtitleTrack.baseUrl;
      const subtitleXml = await this.fetchSubtitleXml(subtitleUrl);
      
      if (subtitleXml) {
        this.captions = this.parseCaptionXML(subtitleXml);
        if (this.captions.length > 0) {
          this.currentLanguageCode = finalLanguageCode;
          if (this.isPanelValid()) {
            this.populateLanguageDropdown(captionTracks, this.currentLanguageCode);
            this.renderCaptions();
            this.updateWordCount();
            this.adjustCaptionsContainerHeight();
          }
          console.log(`✅ [Native] Successfully loaded ${this.captions.length} captions`);
          return true;
        } else {
          console.warn('⚠️ [Native] XML was empty or contained no valid segments.');
        }
      } else {
        console.error('❌ [Native] Failed to fetch subtitle XML from baseUrl.');
      }
    }
    
    return false;
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
   * BACKUP METHOD: Fetches player data using the ANDROID client context.
   */
  async getPlayerResponseAndroid(videoId, apiKey, visitorData, hl = 'en') {
    console.log(`📱 Attempting ANDROID client backup method (hl=${hl})...`);
    const playerUrl = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;
    const payload = {
      context: {
        client: {
          clientName: 'ANDROID',
          clientVersion: '19.01.33',
          hl: hl,
          gl: 'US',
          visitorData: visitorData
        }
      },
      videoId: videoId
    };

    try {
      const response = await fetch(playerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await response.json();
    } catch (error) {
      console.error('❌ Error fetching ANDROID player response:', error);
    }
    return null;
  }

  /**
   * Scrapes the visitorData token from the page HTML.
   */
  async getVisitorData() {
    try {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const match = script.textContent.match(/"visitorData":"([^"]*)"/);
        if (match) return match[1];
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Attempts to extract the player response from the page source.
   * This is often more reliable than the API call as it avoids extra network requests and API restrictions.
   * @returns {object|null} The player response object or null.
   */
  async getPlayerResponseFromPage() {
    console.log('🔍 Scraping player response from page...');
    try {
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent;
        if (text.includes('ytInitialPlayerResponse')) {
          // Robust regex for ytInitialPlayerResponse
          const match = text.match(/ytInitialPlayerResponse\s*=\s*({.+?})(?:;|$)/s);
          if (match) {
            try {
              const data = JSON.parse(match[1]);
              console.log('✅ Found player response in page script');
              if (data && data.captions) {
                console.log('📊 Captions property exists in page playerResponse');
              } else {
                console.warn('⚠️ playerResponse found on page but it LACKS the "captions" property.');
              }
              return data;
            } catch (e) {
              const cleaned = match[1].trim();
              try {
                const data = JSON.parse(cleaned);
                if (data && data.captions) {
                  console.log('✅ Found and parsed player response after cleaning');
                }
                return data;
              } catch (e2) {
                console.warn('⚠️ Found ytInitialPlayerResponse but failed to parse JSON');
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('❌ Error scraping player response from page:', e);
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
    console.log(`📥 [Fetch] Requesting subtitle XML...`);
    try {
      // credentials: 'include' is crucial for Stage 1 URLs found in page metadata
      const response = await fetch(url, { credentials: 'include' });
      
      if (!response.ok) {
        console.error(`❌ [Fetch] XML fetch failed with status: ${response.status} ${response.statusText}`);
        return null;
      }
      
      const text = await response.text();
      
      // Basic validation that we got a subtitle format
      if (text.includes('<timedtext') || text.includes('<?xml')) {
        return text;
      } else {
        console.warn('⚠️ [Fetch] Received response, but it does not appear to be a valid subtitle format.');
        return null;
      }
    } catch (error) {
      console.error('❌ [Fetch] Error during fetch:', error);
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
      let textElements = doc.querySelectorAll('text');
      const captionsData = [];
      
      if (textElements.length === 0) {
        // Support for newer Format 3 XML (<p t="start_ms" d="dur_ms">)
        textElements = doc.querySelectorAll('p');
        for (const textElement of textElements) {
          const textContent = textElement.textContent.trim();
          if (textContent) {
            // Attributes 't' and 'd' are in milliseconds
            const start = parseFloat(textElement.getAttribute('t') || '0') / 1000;
            const duration = parseFloat(textElement.getAttribute('d') || '2000') / 1000;
            captionsData.push({ start, duration, text: textContent });
          }
        }
      } else {
        // Support for legacy XML (<text start="sec" dur="sec">)
        for (const textElement of textElements) {
          const textContent = textElement.textContent.trim();
          if (textContent.includes('--==// AI DIRECTIVE BLOCK: START //==--')) {
            break;
          }
          const start = parseFloat(textElement.getAttribute('start') || '0');
          const duration = parseFloat(textElement.getAttribute('dur') || '0');
          
          if (textContent) {
            captionsData.push({ start, duration, text: textContent });
          }
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

    container.innerHTML = ''; // Clear existing content

    if (captions.length === 0) {
      const noCaptions = document.createElement('div');
      noCaptions.className = 'no-captions';
      noCaptions.textContent = 'No captions available';
      container.appendChild(noCaptions);
      return;
    }

    const fragment = document.createDocumentFragment();

    captions.forEach((caption) => {
      const item = document.createElement('div');
      item.className = 'caption-item';
      // Use fixed precision for stable keys used by the "Follow" function
      item.dataset.start = caption.start.toFixed(3);

      const time = document.createElement('div');
      time.className = 'caption-time';
      time.textContent = this.formatTime(caption.start);
      item.appendChild(time);

      const textDiv = document.createElement('div');
      textDiv.className = 'caption-text';
      
      // If we are stripping formatting, we remove tags. 
      // If not, we might want to keep basic formatting.
      // However, to be safe from XSS, we should generally use textContent.
      // If the original subtitle has trusted HTML (like <i>), we'd need a sanitizer.
      // For now, let's treat it as text or safe HTML if we really need it.
      // But to satisfy the linter completely, textContent is best.
      // If the user *expects* <i> tags to render as italics, this change will show "<i>text</i>".
      // Let's implement a simple HTML entity decoder/tag stripper if needed, 
      // OR just set textContent which is safest. 
      
      // Original logic was:
      // const text = stripFormatting ? caption.text.replace(/<[^>]+>/g, '') : caption.text;
      
      if (stripFormatting) {
          textDiv.textContent = caption.text.replace(/<[^>]+>/g, '');
      } else {
          textDiv.textContent = caption.text;
      }
      
      item.appendChild(textDiv);
      
      item.addEventListener('click', () => {
        const startTime = parseFloat(item.dataset.start);
        this.seekToTime(startTime);
      });

      fragment.appendChild(item);
    });

    container.appendChild(fragment);
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
      if (!term) {
        element.textContent = text;
        return;
      }
      const regex = new RegExp(`(${term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
      const parts = text.split(regex);
      element.innerHTML = ''; // Clear the element
      parts.forEach(part => {
        if (part.toLowerCase() === term.toLowerCase()) {
          const mark = document.createElement('mark');
          mark.textContent = part;
          element.appendChild(mark);
        } else {
          element.appendChild(document.createTextNode(part));
        }
      });
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
    container.innerHTML = ''; // Clear container

    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';

    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    errorDiv.appendChild(messageDiv);

    const debugButton = document.createElement('button');
    debugButton.className = 'debug-btn';
    debugButton.style.marginTop = '10px';
    debugButton.style.padding = '5px 10px';
    debugButton.style.background = '#333';
    debugButton.style.color = '#fff';
    debugButton.style.border = 'none';
    debugButton.style.borderRadius = '4px';
    debugButton.style.cursor = 'pointer';
    debugButton.textContent = 'Show Debug Info';
    debugButton.addEventListener('click', () => {
      this.showDebugInfo();
    });
    errorDiv.appendChild(debugButton);

    container.appendChild(errorDiv);
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
    container.innerHTML = ''; // Clear container

    const debugInfoDiv = document.createElement('div');
    debugInfoDiv.className = 'debug-info';
    debugInfoDiv.style.padding = '16px';
    debugInfoDiv.style.fontSize = '12px';
    debugInfoDiv.style.fontFamily = 'monospace';

    const h4 = document.createElement('h4');
    h4.textContent = 'Debug Information:';
    debugInfoDiv.appendChild(h4);

    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(debugInfo, null, 2);
    debugInfoDiv.appendChild(pre);

    const retryButton = document.createElement('button');
    retryButton.className = 'retry-btn';
    retryButton.style.marginTop = '10px';
    retryButton.style.padding = '5px 10px';
    retryButton.style.background = '#4a9eff';
    retryButton.style.color = '#fff';
    retryButton.style.border = 'none';
    retryButton.style.borderRadius = '4px';
    retryButton.style.cursor = 'pointer';
    retryButton.textContent = 'Retry Loading Captions';
    retryButton.addEventListener('click', () => {
      this.loadCaptions();
    });
    debugInfoDiv.appendChild(retryButton);

    container.appendChild(debugInfoDiv);
  }

  adjustCaptionsContainerHeight() {
    if (!this.isPanelValid()) return;

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
    if (!this.isPanelValid()) return;
    const languageSelect = this.panel.querySelector('#language-select');
    languageSelect.innerHTML = ''; // Clear existing options

    // Map YouTube's language codes to more readable names (if available)
    const languageNames = new Intl.DisplayNames(['en'], { type: 'language' });

    captionTracks.forEach(track => {
      const option = document.createElement('option');
      option.value = track.languageCode;
      
      // Robust name extraction for different YouTube API versions
      let label = '';
      if (track.name) {
        if (typeof track.name === 'string') {
          label = track.name;
        } else if (track.name.simpleText) {
          label = track.name.simpleText;
        } else if (track.name.runs && track.name.runs[0] && track.name.runs[0].text) {
          label = track.name.runs[0].text;
        }
      }
      
      // Fallback to localized language name if label extraction failed
      if (!label) {
        try {
          label = languageNames.of(track.languageCode) || track.languageCode;
        } catch (e) {
          label = track.languageCode;
        }
      }

      option.textContent = label;
      if (track.languageCode === selectedLanguageCode) {
        option.selected = true;
      }
      languageSelect.appendChild(option);
    });

    // Handle special "custom" (GitHub) case
    // Add GitHub track if it exists
    if (this.currentCustomFileName) {
      const option = document.createElement('option');
      option.value = 'custom';
      const langUpper = (this.currentCustomLanguageCode || 'custom').toUpperCase();
      option.textContent = `${langUpper} (Manual - GitHub)`;
      if (selectedLanguageCode === 'custom') {
        option.selected = true;
      }
      languageSelect.appendChild(option);
    }
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

      // Save size
      if (this.panelMode === 'floating') {
        localStorage.setItem('captionSearchPanelWidth', this.panel.style.width);
        localStorage.setItem('captionSearchPanelHeight', this.panel.style.height);
      }
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
      
      // Check if button is missing (e.g. after theater mode switch)
      if (!document.querySelector('.caption-search-btn') && !document.querySelector('.caption-search-floating-btn')) {
         this.createToggleButton();
      }

      // Re-attach overlay if missing and we are in overlay mode or it was just lost
      if (this.overlayElement && !document.body.contains(this.overlayElement) && !document.querySelector('.caption-search-overlay')) {
          const playerContainer = document.querySelector('.html5-video-player') || document.body;
          playerContainer.appendChild(this.overlayElement);
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
