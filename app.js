// Web Audio API Synthesizer (Zero-dependency offline sound generation)
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playSynthSound(freqs, durations, type = 'sine', gainVal = 0.1) {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    let time = ctx.currentTime;
    freqs.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);
      
      gainNode.gain.setValueAtTime(gainVal, time);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, time + durations[index]);
      
      osc.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      osc.start(time);
      osc.stop(time + durations[index]);
      
      time += durations[index] * 0.55; // Stagger notes
    });
  } catch (e) {
    console.warn("Audio context blocked or not supported.", e);
  }
}

// Sound presets
function playClickSound() {
  playSynthSound([800], [0.04], 'triangle', 0.03);
}

function playSuccessSound() {
  playSynthSound([523.25, 659.25, 783.99, 1046.50], [0.12, 0.12, 0.12, 0.3], 'sine', 0.08);
}

function playErrorSound() {
  playSynthSound([220, 180], [0.15, 0.22], 'sawtooth', 0.08);
}

function playLockedSound() {
  playSynthSound([300, 300], [0.08, 0.08], 'square', 0.06);
}

// State Management
let tricks = [];
let favorites = [];
let mastered = [];
let checkedSteps = {};
let isVip = false;
let isAdmin = false;

// Supabase Database Configuration (ใส่ URL และ API Key ที่ได้จากการสมัคร Supabase ที่นี่)
const SUPABASE_URL = "https://mqotvzptnwehwzsbjtli.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_Iv0fsXEysMhFwlARaRU9PA_6HHXapKT"; 

let supabaseClient = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    const clientCreator = window.supabase ? window.supabase.createClient : null;
    if (clientCreator) {
      supabaseClient = clientCreator(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
  } catch (e) {
    console.error("Failed to initialize Supabase client:", e);
  }
}

function isSupabaseConfigured() {
  return supabaseClient !== null;
}

// Admin password configuration
const ADMIN_PASSWORD = "ADMIN-CUE-PASS";

// List of Discord usernames or emails that automatically get Admin access
const ADMIN_DISCORD_ACCOUNTS = ["theer", "admin_username_here"];

// Valid VIP Keys (Hardcoded mockup list)
const VALID_VIP_KEYS = ["VIP-RED-MASTER", "RED-POOL-PRO-2026", "TH-CUE-KING", "ADMIN-TEST", "E1D750E2"];

let currentTab = 'dashboard';
let currentCategory = 'all';
let searchQuery = '';
let activeTrickId = null;

// Auth State variables
let currentUser = null;

// Auth helper functions
async function checkSupabaseAuthSession() {
  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (data && data.session) {
      handleAuthStateChange('SIGNED_IN', data.session);
    } else {
      handleAuthStateChange('SIGNED_OUT', null);
    }
  } catch (e) {
    console.error("Error checking auth session:", e);
    handleAuthStateChange('SIGNED_OUT', null);
  }
}

function isDiscordAdmin(user) {
  if (!user) return false;
  const metadata = user.user_metadata || {};
  
  // รวบรวมฟิลด์ชื่อทั้งหมดที่อาจจะดึงมาจาก Discord
  const names = [
    metadata.user_name,
    metadata.full_name,
    metadata.name,
    metadata.custom_claims?.global_name,
    user.email ? user.email.split('@')[0] : ''
  ].filter(Boolean).map(n => n.toLowerCase());
  
  const email = (user.email || '').toLowerCase();
  
  // 1. ตรวจสอบจากลิสต์ชื่อแอดมินตรงๆ
  for (const name of names) {
    if (ADMIN_DISCORD_ACCOUNTS.includes(name)) return true;
  }
  if (ADMIN_DISCORD_ACCOUNTS.includes(email)) return true;
  
  // 2. ตรวจสอบ Regex สำหรับชื่อที่ขึ้นต้นด้วย theer หรือ tle ตามด้วย e หลายตัว (เช่น Tleeeeeee)
  const adminPattern = /^(theer|tle+)/i;
  for (const name of names) {
    if (adminPattern.test(name)) return true;
  }
  
  return false;
}

function checkIsAdmin(user) {
  if (sessionStorage.getItem('fivem_admin_disabled') === 'true') {
    return false;
  }
  return isDiscordAdmin(user);
}

function handleAuthStateChange(event, session) {
  const gate = document.getElementById('discord-login-gate');
  
  if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
    currentUser = session.user;
    if (gate) gate.classList.add('hidden');
    
    // ตรวจสอบสิทธิ์แอดมินแบบครอบคลุม
    if (checkIsAdmin(currentUser)) {
      isAdmin = true;
      sessionStorage.setItem('fivem_admin', 'true');
    }
    
    updateUserProfileUI(currentUser);
    updateAdminUi();
    
    // รีเฟรชกริดและสถิติให้แอดมินเห็นผลทันที
    renderTricksGrid();
    renderRecommendedTricks();
    updateDashboardStats();
  } else {
    currentUser = null;
    if (event === 'SIGNED_OUT') {
      isAdmin = false;
      sessionStorage.removeItem('fivem_admin');
    }
    if (gate) gate.classList.add('hidden');
    updateUserProfileUI(null);
    updateAdminUi();
    
    // รีเฟรชกริดเพื่อล็อกทริคทั้งหมดสำหรับผู้เยี่ยมชม (Guest)
    renderTricksGrid();
    renderRecommendedTricks();
    updateDashboardStats();
  }
}

function updateUserProfileUI(user) {
  const avatarImg = document.getElementById('sidebar-avatar');
  const placeholder = document.getElementById('sidebar-avatar-placeholder');
  const usernameEl = document.getElementById('sidebar-username');
  const rankEl = document.getElementById('sidebar-rank');
  const vipDiscordInput = document.getElementById('vip-discord-input');

  if (user) {
    // Logged in
    const metadata = user.user_metadata || {};
    const avatarUrl = metadata.avatar_url;
    const username = metadata.custom_claims?.global_name || metadata.full_name || user.email.split('@')[0];

    if (avatarUrl) {
      avatarImg.src = avatarUrl;
      avatarImg.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      avatarImg.style.display = 'none';
      placeholder.style.display = 'flex';
      placeholder.textContent = username.charAt(0).toUpperCase();
    }

    usernameEl.textContent = username;
    rankEl.textContent = isAdmin ? "Administrator" : (isVip ? "VIP Member" : "Pro Player");

    // Auto-fill VIP input (keep editable)
    if (vipDiscordInput) {
      vipDiscordInput.value = username;
      vipDiscordInput.disabled = false;
    }

    // Toggle Admin Bypass Button Visibility and Style
    const adminToggleBtn = document.getElementById('admin-toggle-btn');
    if (adminToggleBtn) {
      const isDiscAdmin = isDiscordAdmin(user);
      const hasAdminSession = sessionStorage.getItem('fivem_admin') === 'true';
      if (isDiscAdmin || hasAdminSession) {
        adminToggleBtn.style.display = 'flex';
        const isDisabled = sessionStorage.getItem('fivem_admin_disabled') === 'true';
        if (isDisabled) {
          adminToggleBtn.style.color = '#ef4444';
          adminToggleBtn.title = "ปิดสิทธิ์แอดมินอยู่ (คลิกเพื่อเปิดใช้งานสิทธิ์แอดมิน)";
        } else {
          adminToggleBtn.style.color = 'var(--accent-cyan)';
          adminToggleBtn.title = "เปิดสิทธิ์แอดมินอยู่ (คลิกเพื่อปิดใช้งานชั่วคราวเพื่อทดสอบโหมดผู้เล่นธรรมดา)";
        }
      } else {
        adminToggleBtn.style.display = 'none';
      }
    }
  } else {
    // Logged out / Offline fallback
    if (avatarImg) avatarImg.style.display = 'none';
    if (placeholder) {
      placeholder.style.display = 'flex';
      placeholder.textContent = '👤';
    }
    if (usernameEl) usernameEl.textContent = "ผู้มาเยือน";
    if (rankEl) rankEl.textContent = "ผู้เล่นทั่วไป (Guest)";

    if (vipDiscordInput) {
      vipDiscordInput.value = "";
      vipDiscordInput.disabled = false;
    }
    
    // Hide Admin Bypass Button when logged out
    const adminToggleBtn = document.getElementById('admin-toggle-btn');
    if (adminToggleBtn) adminToggleBtn.style.display = 'none';
  }

  // Update Login/Logout Button state dynamically
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    if (user) {
      logoutBtn.onclick = logoutUser;
      logoutBtn.title = "ออกจากระบบ";
      logoutBtn.innerHTML = '<i data-lucide="log-out"></i>';
    } else {
      logoutBtn.onclick = openLoginModal;
      logoutBtn.title = "เข้าสู่ระบบด้วย Discord";
      logoutBtn.innerHTML = '<i data-lucide="log-in" style="color: var(--accent-cyan);"></i>';
    }
    // Re-run lucide to render the changed icon
    lucide.createIcons();
  }
}

function toggleAdminBypass() {
  const isDisabled = sessionStorage.getItem('fivem_admin_disabled') === 'true';
  if (isDisabled) {
    sessionStorage.removeItem('fivem_admin_disabled');
    showToast('🛡️ เปิดใช้งานสิทธิ์แอดมินเรียบร้อยแล้ว');
  } else {
    sessionStorage.setItem('fivem_admin_disabled', 'true');
    isAdmin = false;
    sessionStorage.removeItem('fivem_admin');
    showToast('👤 ปิดใช้งานสิทธิ์แอดมินชั่วคราว (สลับเป็นโหมดผู้เล่นธรรมดา)');
  }
  
  // Re-run checks to update values
  if (isSupabaseConfigured() && currentUser) {
    isAdmin = checkIsAdmin(currentUser);
    if (isAdmin) {
      sessionStorage.setItem('fivem_admin', 'true');
    }
  } else {
    isAdmin = sessionStorage.getItem('fivem_admin') === 'true';
  }
  
  updateUserProfileUI(currentUser);
  updateAdminUi();
  renderTricksGrid();
  renderRecommendedTricks();
  updateDashboardStats();
}

async function loginWithDiscord() {
  if (!isSupabaseConfigured()) {
    alert("ขออภัย! ระบบเชื่อมต่อฐานข้อมูล Supabase ยังไม่ได้กำหนดค่าใน app.js");
    return;
  }
  
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: window.location.origin + window.location.pathname
      }
    });
    if (error) throw error;
  } catch (e) {
    alert("เกิดข้อผิดพลาดในการเชื่อมต่อสิทธิ์กับ Discord: " + e.message);
  }
}

async function logoutUser() {
  if (isSupabaseConfigured()) {
    try {
      await supabaseClient.auth.signOut();
    } catch (e) {
      console.error("Error signing out:", e);
    }
  }
  
  // Clean states
  currentUser = null;
  localStorage.removeItem('fivem_tricks_vip');
  localStorage.removeItem('fivem_tricks_vip_user');
  isVip = false;
  
  updateVipUi();
  updateUserProfileUI(null);
  
  const gate = document.getElementById('discord-login-gate');
  if (gate) gate.classList.add('hidden');
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  // Check if landing page was already closed in this session
  const hasStarted = sessionStorage.getItem('fivem_tricks_started');
  const landing = document.getElementById('landing-page');
  if (hasStarted && landing) {
    landing.style.display = 'none';
  }

  loadData();
  setupDate();
  
  // Auth Integration
  if (isSupabaseConfigured()) {
    checkSupabaseAuthSession();
    supabaseClient.auth.onAuthStateChange((event, session) => {
      handleAuthStateChange(event, session);
    });
  } else {
    // If Supabase is offline/fallback, hide login gate automatically
    const gate = document.getElementById('discord-login-gate');
    if (gate) gate.classList.add('hidden');
    updateUserProfileUI(null);
  }

  updateVipUi();
  updateAdminUi();
  renderRecommendedTricks();
  renderTricksGrid();
  updateDashboardStats();
  
  // Initialize Lucide Icons
  lucide.createIcons();

  // Setup Ambient Cursor Glow Tracking
  setupCursorGlow();

  // Setup UI Click Sounds
  setupGlobalClickSounds();
});

// Ambient Cursor Glow Tracking
function setupCursorGlow() {
  const glow = document.getElementById('cursor-glow');
  if (!glow) return;
  
  document.addEventListener('mousemove', (e) => {
    glow.style.left = e.clientX + 'px';
    glow.style.top = e.clientY + 'px';
  });
}

// Bind UI click sounds to buttons and inputs
function setupGlobalClickSounds() {
  document.addEventListener('click', (e) => {
    // Only play click sound for interactive elements
    const target = e.target.closest('button, .nav-item, .pill-btn, .trick-thumbnail, h4, input, select, textarea, .checklist-item');
    if (target) {
      const isCard = target.closest('.trick-card');
      if (isCard && isCard.classList.contains('locked-card') && !target.closest('.card-favorite-btn')) {
        playLockedSound();
      } else {
        playClickSound();
      }
    }
  });
}

// Set current date in Thai format
function setupDate() {
  const dateEl = document.getElementById('header-date');
  if (dateEl) {
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    // Add 543 years for Buddhist Era (BE) to fit standard Thai calendar, if localizing
    const date = new Date();
    const thaiYear = date.getFullYear() + 543;
    const dateStr = date.toLocaleDateString('th-TH', { day: 'numeric', month: 'long' });
    dateEl.textContent = `${dateStr} พ.ศ. ${thaiYear}`;
  }
}

// Load from LocalStorage
async function loadData() {
  // Load favorites
  const storedFavs = localStorage.getItem('fivem_tricks_favs');
  favorites = storedFavs ? JSON.parse(storedFavs) : [];

  // Load mastered/completed tricks
  const storedMastered = localStorage.getItem('fivem_tricks_mastered');
  mastered = storedMastered ? JSON.parse(storedMastered) : [];

  // Load individual checklist step states
  const storedSteps = localStorage.getItem('fivem_tricks_steps');
  checkedSteps = storedSteps ? JSON.parse(storedSteps) : {};

  // Load VIP state
  isVip = localStorage.getItem('fivem_tricks_vip') === 'true';

  // Load Admin state
  isAdmin = sessionStorage.getItem('fivem_admin') === 'true';

  // Load custom tricks + default mock tricks from localStorage first (for immediate display)
  const storedTricks = localStorage.getItem('fivem_tricks');
  if (storedTricks) {
    tricks = JSON.parse(storedTricks);
  } else {
    tricks = [...INITIAL_TRICKS];
    localStorage.setItem('fivem_tricks', JSON.stringify(tricks));
  }

  // Then fetch updated tricks from Supabase in the background
  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabaseClient
        .from('tricks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (data) {
        tricks = data.map(t => ({
          id: t.id,
          title: t.title,
          category: t.category,
          difficulty: t.difficulty,
          duration: t.duration,
          videoUrl: t.video_url || t.videoUrl, // handle both casing variants
          description: t.description,
          checklist: t.checklist || [],
          tips: t.tips
        }));
        saveState('fivem_tricks', tricks);
        
        // Rerender grids & stats to show the latest online database items
        renderTricksGrid();
        renderRecommendedTricks();
        updateDashboardStats();
      }
    } catch (e) {
      console.warn("Failed to load tricks from Supabase, using offline cache:", e);
    }
  }
}

// Helper: check if a trick is locked behind paywall
function isTrickLocked(trick) {
  // หากยังไม่ได้เข้าสู่ระบบ (เป็น Guest) จะต้องล็อกทุกทริค
  if (!currentUser) return true;
  
  if (isVip || isAdmin) return false;
  // Lock Advanced and Tactics1v1 categories
  return trick.category === 'advanced' || trick.category === 'tactics1v1';
}

// Save specific parts of state to localStorage
function saveState(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

// Tab navigation controller
function switchTab(tabId) {
  currentTab = tabId;
  
  // Toggle active class on nav buttons
  const navButtons = document.querySelectorAll('.nav-item');
  navButtons.forEach(btn => {
    if (btn.id === `nav-btn-${tabId}`) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Toggle active class on panels
  const panels = document.querySelectorAll('.tab-panel');
  panels.forEach(panel => {
    if (panel.id === `tab-${tabId}`) {
      panel.classList.add('active');
    } else {
      panel.classList.remove('active');
    }
  });

  // Refresh layouts
  if (tabId === 'dashboard') {
    renderRecommendedTricks();
    updateDashboardStats();
  } else if (tabId === 'gallery') {
    renderTricksGrid();
  }

  // Re-run lucide to render any newly appended icons
  lucide.createIcons();
}

// Filter tricks by category
function filterCategory(category) {
  currentCategory = category;
  
  // Highlight active pill button
  const pills = document.querySelectorAll('.pill-btn');
  pills.forEach(pill => {
    if (pill.dataset.category === category) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });

  renderTricksGrid();
}

// Handle Search Input
function handleSearch(val) {
  searchQuery = val.trim().toLowerCase();
  
  // Show or hide clear button
  const clearBtn = document.getElementById('clear-search-btn');
  if (searchQuery.length > 0) {
    clearBtn.style.display = 'flex';
    // If user searches from dashboard, switch to gallery tab automatically
    if (currentTab !== 'gallery') {
      switchTab('gallery');
    }
  } else {
    clearBtn.style.display = 'none';
  }

  renderTricksGrid();
}

// Clear Search Bar
function clearSearch() {
  const searchInput = document.getElementById('search-input');
  searchInput.value = '';
  searchQuery = '';
  document.getElementById('clear-search-btn').style.display = 'none';
  renderTricksGrid();
}

// Helper: Translate Category to Thai text for display
function getCategoryLabel(cat) {
  switch(cat) {
    case 'basic': return 'เบสิก';
    case 'intermediate': return 'ขั้นกลาง';
    case 'advanced': return 'ขั้นสูง';
    case 'tactics1v1': return 'เทคนิค 1vs1';
    default: return 'ทริคทั่วไป';
  }
}

// Helper: Convert any YouTube / video link to embed format
function formatVideoUrl(url) {
  if (!url) return '';
  
  // Convert standard youtube embed to nocookie if it is youtube.com
  if (url.includes('youtube.com/embed/')) {
    url = url.replace('youtube.com/embed/', 'youtube-nocookie.com/embed/');
  }
  
  // Check if it's already an embed link
  if (url.includes('youtube-nocookie.com/embed/') || url.includes('player.vimeo.com/video/')) {
    return url;
  }

  // YouTube Shorts link matcher (e.g. youtube.com/shorts/XYZ)
  if (url.includes('youtube.com/shorts/') || url.includes('youtu.be/shorts/')) {
    let shortsReg = /shorts\/([a-zA-Z0-9_-]{11})/;
    let shortsMatch = url.match(shortsReg);
    if (shortsMatch) {
      return `https://www.youtube-nocookie.com/embed/${shortsMatch[1]}?autoplay=1&rel=0`;
    }
  }
  
  // YouTube Watch link matcher (e.g. watch?v=XYZ)
  let youtubeReg = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  let ytMatch = url.match(youtubeReg);
  if (ytMatch && ytMatch[2].length === 11) {
    return `https://www.youtube-nocookie.com/embed/${ytMatch[2]}?autoplay=1&rel=0`;
  }
  
  // Vimeo video link matcher (e.g. vimeo.com/XYZ)
  let vimeoReg = /vimeo\.com\/(\d+)/;
  let vimeoMatch = url.match(vimeoReg);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`;
  }
  
  // Otherwise, return original (e.g. direct .mp4 file or other embed)
  return url;
}

// Global hover state variables
let hoverTimeout = null;

// Hover preview helper functions for trick cards
function playCardPreview(cardElement, trickId) {
  if (!currentUser) return; // ไม่เล่นทีเซอร์ตัวอย่างสำหรับ Guest
  // Clear any existing preview timeout first
  if (hoverTimeout) {
    clearTimeout(hoverTimeout);
    hoverTimeout = null;
  }

  // Set timeout to show the pop-up modal after 300ms hover
  hoverTimeout = setTimeout(() => {
    showHoverModal(trickId);
  }, 300);
}

function stopCardPreview(cardElement) {
  // Clear hover delay timeout if mouse leaves before modal triggers
  if (hoverTimeout) {
    clearTimeout(hoverTimeout);
    hoverTimeout = null;
  }

  closeHoverModal();
}

function showHoverModal(trickId) {
  const trick = tricks.find(t => t.id === trickId);
  if (!trick || !trick.videoUrl) return;

  const modal = document.getElementById('hover-preview-modal');
  const videoContainer = document.getElementById('hover-preview-video-container');
  const titleEl = document.getElementById('hover-preview-title');
  const fill = document.getElementById('hover-preview-progress-fill');

  if (!modal || !videoContainer || !titleEl || !fill) return;

  // Set title
  titleEl.textContent = `ตัวอย่าง: ${trick.title}`;

  // Clear container
  videoContainer.innerHTML = '';

  const formattedUrl = formatVideoUrl(trick.videoUrl);

  if (formattedUrl.endsWith('.mp4') || formattedUrl.endsWith('.webm')) {
    // Direct video file
    videoContainer.innerHTML = `
      <video src="${formattedUrl}" autoplay loop playsinline controlsList="nodownload nofullscreen noremoteplayback" oncontextmenu="return false;" style="width: 100%; height: 100%; object-fit: cover;">
      </video>
    `;
  } else {
    // YouTube embed - add autoplay, mute=0 (unmuted), controls=0, loop=1, rel=0, showinfo=0, iv_load_policy=3
    let playUrl = formattedUrl;
    const ytId = getYoutubeId(formattedUrl);
    if (playUrl.includes('?')) {
      playUrl += '&autoplay=1&mute=0&controls=0&loop=1';
    } else {
      playUrl += '?autoplay=1&mute=0&controls=0&loop=1';
    }
    if (ytId) {
      playUrl += '&playlist=' + ytId;
    }

    videoContainer.innerHTML = `
      <div class="video-iframe-wrapper" oncontextmenu="return false;" style="position: relative; width: 100%; height: 100%; overflow: hidden; background: #000; pointer-events: none;">
        <iframe src="${playUrl}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope;" referrerpolicy="strict-origin-when-cross-origin" style="width: 100%; height: 100%; border: none; transform: scale(1.4); transform-origin: center;"></iframe>
      </div>
    `;
  }

  // Activate modal
  modal.classList.add('active');

  // Animate progress bar
  fill.style.transition = 'none';
  fill.style.transform = 'scaleX(1)';
  fill.offsetHeight; // force repaint
  fill.style.transition = 'transform 7s linear';
  fill.style.transform = 'scaleX(0)';

  // Automatically close modal after 7 seconds (7000ms)
  const autoCloseId = setTimeout(() => {
    closeHoverModal();
  }, 7000);
  modal.dataset.autoCloseTimeout = autoCloseId.toString();
}

function closeHoverModal() {
  const modal = document.getElementById('hover-preview-modal');
  if (!modal) return;

  // Clear auto-close timeout if active
  if (modal.dataset.autoCloseTimeout) {
    clearTimeout(parseInt(modal.dataset.autoCloseTimeout));
    delete modal.dataset.autoCloseTimeout;
  }

  modal.classList.remove('active');

  // Clear HTML after transition ends (300ms) to prevent visual glitch
  setTimeout(() => {
    if (!modal.classList.contains('active')) {
      const videoContainer = document.getElementById('hover-preview-video-container');
      if (videoContainer) videoContainer.innerHTML = '';
    }
  }, 300);
}

// Helper to extract YouTube video ID from embed URL
function getYoutubeId(url) {
  const regExp = /^.*(embed\/|v\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : '';
}

// Render Trick Cards in the Gallery Grid
function renderTricksGrid() {
  const grid = document.getElementById('tricks-gallery-grid');
  const emptyState = document.getElementById('gallery-empty-state');
  
  // Filter tricks by category & search
  const filtered = tricks.filter(trick => {
    const matchesCategory = currentCategory === 'all' || trick.category === currentCategory;
    const matchesSearch = searchQuery === '' || 
      trick.title.toLowerCase().includes(searchQuery) ||
      trick.description.toLowerCase().includes(searchQuery) ||
      getCategoryLabel(trick.category).toLowerCase().includes(searchQuery);
    return matchesCategory && matchesSearch;
  });

  // Update count badge
  document.getElementById('gallery-count').textContent = `พบ ${filtered.length} บทเรียน`;

  if (filtered.length === 0) {
    grid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }
  
  emptyState.style.display = 'none';

  grid.innerHTML = filtered.map((trick, index) => {
    const isCompleted = mastered.includes(trick.id);
    const isFav = favorites.includes(trick.id);
    const locked = isTrickLocked(trick);
    
    const completionClass = locked ? 'uncompleted text-pink' : (isCompleted ? 'completed' : 'uncompleted');
    const completionText = locked ? 'สำหรับ VIP' : (isCompleted ? 'ฝึกสำเร็จแล้ว' : 'ยังไม่ได้เริ่ม');
    const favClass = isFav ? 'active' : '';
    
     // Click action triggers VIP modal if locked
    const clickAction = `handleTrickClick('${trick.id}')`;
    
    // Choose icon base on category
    let categoryIcon = '🎯';
    if (trick.category === 'basic') categoryIcon = '🟢';
    if (trick.category === 'intermediate') categoryIcon = '🔵';
    if (trick.category === 'advanced') categoryIcon = '🔒';
    if (trick.category === 'tactics1v1') categoryIcon = '🔒';

    // Admin Delete button HTML
    const deleteButtonHtml = isAdmin ? `
      <button class="card-delete-btn" onclick="handleDeleteClick('${trick.id}', event)" title="ลบทริคนี้ (เฉพาะแอดมิน)">
        <i data-lucide="trash-2"></i>
      </button>
    ` : '';

    return `
      <article class="trick-card ${locked ? 'locked-card' : ''}" id="card-${trick.id}" style="animation-delay: ${index * 0.04}s" onmouseenter="playCardPreview(this, '${trick.id}')" onmouseleave="stopCardPreview(this)">
        <!-- Favorite heart button -->
        <button class="card-favorite-btn ${favClass}" onclick="handleFavoriteClick('${trick.id}', event)" title="${locked ? 'เฉพาะ VIP' : 'ชื่นชอบ'}">
          <i data-lucide="heart"></i>
        </button>

        <div class="trick-thumbnail" onclick="${clickAction}">
          <div class="thumb-placeholder">${categoryIcon}</div>
          <div class="play-overlay-icon">
            <i data-lucide="${locked ? 'lock' : 'play'}"></i>
          </div>
          <div class="card-badge-row">
            <span class="badge badge-category ${trick.category}">${getCategoryLabel(trick.category)}</span>
            <span class="badge badge-difficulty">${trick.difficulty}</span>
          </div>
        </div>

        <div class="trick-card-body">
          <div class="card-title-row" style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.5rem;">
            <h4 onclick="${clickAction}" style="flex: 1; margin-bottom: 0;">${trick.title}</h4>
            ${deleteButtonHtml}
          </div>
          <p>${trick.description}</p>
          <div class="card-footer-row">
            <span class="card-time"><i data-lucide="clock"></i> ${trick.duration}</span>
            <span class="card-completion-status ${completionClass}">
              <i data-lucide="${locked ? 'lock' : (isCompleted ? 'check-circle2' : 'circle')}"></i>
              ${completionText}
            </span>
          </div>
        </div>
      </article>
    `;
  }).join('');

  lucide.createIcons();
}

// Render Daily Recommended Tricks in Dashboard
function renderRecommendedTricks() {
  const grid = document.getElementById('recommended-tricks-grid');
  if (!grid) return;

  // Filter 3 uncompleted tricks, or fall back to first 3 tricks
  let recommended = tricks.filter(t => !mastered.includes(t.id));
  if (recommended.length === 0) {
    recommended = tricks;
  }
  
  // Limit to 3 items
  recommended = recommended.slice(0, 3);

  grid.innerHTML = recommended.map(trick => {
    const isCompleted = mastered.includes(trick.id);
    const locked = isTrickLocked(trick);
    
    const clickAction = `handleTrickClick('${trick.id}')`;
    const icon = locked ? 'lock' : (isCompleted ? 'check-circle2' : 'play');
    const completionText = locked ? 'ล็อก' : (isCompleted ? 'สำเร็จ' : 'ฝึกเลย');
    const completionClass = locked ? 'uncompleted text-pink' : (isCompleted ? 'completed' : 'uncompleted');
    
    return `
      <div class="trick-card compact-card ${locked ? 'locked-card' : ''}" onclick="${clickAction}" style="height: auto; cursor: pointer;">
        <div class="trick-card-body" style="padding: 1.2rem;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem; gap: 0.5rem;">
            <span class="badge badge-category ${trick.category}" style="font-size: 0.65rem;">${getCategoryLabel(trick.category)}</span>
            <span class="card-time" style="font-size: 0.75rem;"><i data-lucide="clock" style="width:12px; height:12px;"></i> ${trick.duration}</span>
          </div>
          <h4 style="font-size: 0.95rem; margin-bottom: 0.4rem; height: auto; display: block; -webkit-line-clamp: none;">${trick.title}</h4>
          <div class="card-footer-row" style="margin-top: 0.5rem; border-top: none; padding-top: 0;">
            <span style="font-size: 0.75rem; color: var(--text-muted);">ยาก: ${trick.difficulty}</span>
            <span class="card-completion-status ${completionClass}" style="font-size: 0.75rem;">
              <i data-lucide="${icon}" style="width: 12px; height: 12px;"></i>
              ${completionText}
            </span>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  lucide.createIcons();
}

// Update Dashboard Statistics Card & Progress Ring
function updateDashboardStats() {
  const totalCount = tricks.length;
  const completedCount = mastered.length;
  const favoritesCount = favorites.length;

  // Elements
  const totalEl = document.getElementById('stat-total');
  const completedEl = document.getElementById('stat-completed');
  const favoritesEl = document.getElementById('stat-favorites');
  const rankEl = document.getElementById('stat-rank');
  const ratioEl = document.getElementById('progress-ratio');
  const percentEl = document.getElementById('progress-percent');
  const circleEl = document.getElementById('progress-circle');

  if (totalEl) totalEl.textContent = totalCount;
  if (completedEl) completedEl.textContent = completedCount;
  if (favoritesEl) favoritesEl.textContent = favoritesCount;

  // Calculate percentage
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  if (percentEl) percentEl.textContent = `${percent}%`;
  if (ratioEl) ratioEl.textContent = `${completedCount}/${totalCount} ทริค`;

  // Draw circular progress
  // Radius is 40, Circumference is 2 * Math.PI * r = 251.2
  if (circleEl) {
    const circumference = 251.2;
    const offset = circumference - (percent / 100) * circumference;
    circleEl.style.strokeDashoffset = offset;
  }

  // Update user Rank
  if (rankEl) {
    let rankName = 'Beginner (ผู้ฝึกหัด)';
    if (percent > 25 && percent <= 50) rankName = 'Aspirant (นักเดินทาง)';
    if (percent > 50 && percent <= 75) rankName = 'Expert (เหลี่ยมเก๋า)';
    if (percent > 75) rankName = 'Cue Master (มหาเทพไม้พูล)';
    rankEl.textContent = rankName;
  }
}

// Toggle Favorites
function toggleFavorite(trickId, event) {
  if (event) {
    event.stopPropagation(); // Stop parent card click
  }
  
  const index = favorites.indexOf(trickId);
  if (index > -1) {
    favorites.splice(index, 1);
  } else {
    favorites.push(trickId);
  }
  
  saveState('fivem_tricks_favs', favorites);
  
  // Rerender active views
  if (currentTab === 'gallery') {
    renderTricksGrid();
  } else {
    renderRecommendedTricks();
    updateDashboardStats();
  }
}

// Toggle Favorites inside Video Modal
function toggleFavoriteCurrent() {
  if (!activeTrickId) return;
  toggleFavorite(activeTrickId);
  
  // Update Modal Button Appearance
  const isFav = favorites.includes(activeTrickId);
  const favBtn = document.getElementById('modal-fav-btn');
  const favText = document.getElementById('modal-fav-text');
  
  if (isFav) {
    favBtn.classList.add('active');
    favText.textContent = 'ชื่นชอบแล้ว';
  } else {
    favBtn.classList.remove('active');
    favText.textContent = 'ชื่นชอบ';
  }
  
  lucide.createIcons();
}

// Toggle mastered/completed status for a trick
function toggleMastered(trickId) {
  const trick = tricks.find(t => t.id === trickId);
  if (!trick) return;

  const index = mastered.indexOf(trickId);
  const isNowMastered = index === -1;
  
  if (isNowMastered) {
    mastered.push(trickId);
    // Automatically check all steps in the checklist
    if (trick.checklist) {
      checkedSteps[trickId] = trick.checklist.map((_, i) => i);
    }
  } else {
    mastered.splice(index, 1);
    // Clear checklist steps
    delete checkedSteps[trickId];
  }

  saveState('fivem_tricks_mastered', mastered);
  saveState('fivem_tricks_steps', checkedSteps);

  // Rerender active views
  if (currentTab === 'gallery') {
    renderTricksGrid();
  } else {
    renderRecommendedTricks();
    updateDashboardStats();
  }
}

// Toggle Mastered state inside Video Modal
function toggleMasteredCurrent() {
  if (!activeTrickId) return;
  toggleMastered(activeTrickId);
  
  const isCompleted = mastered.includes(activeTrickId);
  const masterBtn = document.getElementById('modal-mastered-btn');
  const masterText = document.getElementById('modal-mastered-text');
  
  if (isCompleted) {
    masterBtn.innerHTML = '<i data-lucide="check-circle-2"></i> <span>ฝึกฝนสำเร็จแล้ว (กดเพื่อเริ่มใหม่)</span>';
    masterBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
  } else {
    masterBtn.innerHTML = '<i data-lucide="circle"></i> <span>ทำเครื่องหมายฝึกฝนสำเร็จ</span>';
    masterBtn.style.background = 'var(--bg-card)';
  }
  
  // Re-render checklist checkboxes inside modal
  renderModalChecklist();
  lucide.createIcons();
}

// Open video and training modal
function openModal(trickId) {
  const trick = tricks.find(t => t.id === trickId);
  if (!trick) return;

  // Redirection safety check
  if (isTrickLocked(trick)) {
    openVipModal();
    return;
  }

  activeTrickId = trickId;
  
  // Set modal details
  document.getElementById('modal-title').textContent = trick.title;
  document.getElementById('modal-description').textContent = trick.description;
  document.getElementById('modal-duration').innerHTML = `<i data-lucide="clock"></i> ${trick.duration}`;
  
  // Category badge
  const categoryBadge = document.getElementById('modal-badge-category');
  categoryBadge.textContent = getCategoryLabel(trick.category);
  categoryBadge.className = `modal-badge badge-category ${trick.category}`;
  
  // Difficulty badge
  const diffBadge = document.getElementById('modal-badge-difficulty');
  diffBadge.textContent = trick.difficulty;

  // Additional tips wrapper
  const tipsWrapper = document.getElementById('modal-tips-wrapper');
  if (trick.tips) {
    tipsWrapper.style.display = 'block';
    document.getElementById('modal-tips').textContent = trick.tips;
  } else {
    tipsWrapper.style.display = 'none';
  }

  // Inject video/embed player
  const playerContainer = document.getElementById('video-player-container');
  const formattedUrl = formatVideoUrl(trick.videoUrl);

  if (formattedUrl.endsWith('.mp4') || formattedUrl.endsWith('.webm')) {
    playerContainer.innerHTML = `
      <video src="${formattedUrl}" controls autoplay controlsList="nodownload nofullscreen noremoteplayback" oncontextmenu="return false;" class="w-full h-full" style="object-fit: contain;">
        เบราว์เซอร์ของคุณไม่รองรับการเล่นวิดีโอแบบ HTML5
      </video>
    `;
  } else {
    playerContainer.innerHTML = `
      <div class="video-iframe-wrapper" oncontextmenu="return false;" style="position: relative; width: 100%; height: 100%; overflow: hidden; background: #000;">
        <iframe src="${formattedUrl}" title="${trick.title}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen style="width: 100%; height: 100%; border: none;"></iframe>
        
        <!-- Overlays to block clicking on Share/Title (Top) and YouTube Logo (Bottom-Right) -->
        <div class="video-overlay-block" style="position: absolute; top: 0; left: 0; width: 100%; height: 55px; z-index: 10; background: transparent; cursor: default;"></div>
        <div class="video-overlay-block" style="position: absolute; bottom: 0; right: 0; width: 120px; height: 50px; z-index: 10; background: transparent; cursor: default;"></div>
      </div>
    `;
  }

  // Update Favorite button status
  const isFav = favorites.includes(trickId);
  const favBtn = document.getElementById('modal-fav-btn');
  const favText = document.getElementById('modal-fav-text');
  if (isFav) {
    favBtn.classList.add('active');
    favText.textContent = 'ชื่นชอบแล้ว';
  } else {
    favBtn.classList.remove('active');
    favText.textContent = 'ชื่นชอบ';
  }

  // Update Mastered button status
  const isCompleted = mastered.includes(trickId);
  const masterBtn = document.getElementById('modal-mastered-btn');
  const masterText = document.getElementById('modal-mastered-text');
  if (isCompleted) {
    masterBtn.innerHTML = '<i data-lucide="check-circle-2"></i> <span>ฝึกฝนสำเร็จแล้ว (กดเพื่อเริ่มใหม่)</span>';
    masterBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
  } else {
    masterBtn.innerHTML = '<i data-lucide="circle"></i> <span>ทำเครื่องหมายฝึกฝนสำเร็จ</span>';
    masterBtn.style.background = 'var(--bg-card)';
  }

  // Render Checkboxes
  renderModalChecklist();

  // Show Modal Overlay
  const modalOverlay = document.getElementById('video-modal');
  modalOverlay.classList.add('active');
  
  lucide.createIcons();
}

// Render checklist checkboxes inside open modal
function renderModalChecklist() {
  const container = document.getElementById('modal-checklist-items');
  const trick = tricks.find(t => t.id === activeTrickId);
  if (!trick) return;

  const stepsList = trick.checklist || [];
  const checkedIndices = checkedSteps[activeTrickId] || [];

  if (stepsList.length === 0) {
    container.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">ไม่มีขั้นตอนเฉพาะเจาะจงสำหรับทริคนี้</p>';
    return;
  }

  container.innerHTML = stepsList.map((step, index) => {
    const isChecked = checkedIndices.includes(index);
    const checkedClass = isChecked ? 'checked' : '';
    
    return `
      <div class="checklist-item ${checkedClass}" onclick="toggleStepCheck(${index})">
        <div class="checkbox-custom">
          <i data-lucide="check"></i>
        </div>
        <span class="checklist-text">${step}</span>
      </div>
    `;
  }).join('');
}

// Toggle specific checklist step
function toggleStepCheck(stepIndex) {
  if (!activeTrickId) return;

  const trick = tricks.find(t => t.id === activeTrickId);
  if (!trick) return;

  if (!checkedSteps[activeTrickId]) {
    checkedSteps[activeTrickId] = [];
  }

  const index = checkedSteps[activeTrickId].indexOf(stepIndex);
  if (index > -1) {
    // Unchecking
    checkedSteps[activeTrickId].splice(index, 1);
  } else {
    // Checking
    checkedSteps[activeTrickId].push(stepIndex);
  }

  saveState('fivem_tricks_steps', checkedSteps);

  // Check if ALL steps are completed
  const totalSteps = trick.checklist.length;
  const completedSteps = checkedSteps[activeTrickId].length;
  
  const wasMastered = mastered.includes(activeTrickId);

  if (completedSteps === totalSteps && totalSteps > 0) {
    // Automatically master trick if all checkboxes are ticked
    if (!wasMastered) {
      mastered.push(activeTrickId);
      saveState('fivem_tricks_mastered', mastered);
    }
  } else {
    // If not all checkboxes checked, un-master it
    if (wasMastered) {
      const idx = mastered.indexOf(activeTrickId);
      if (idx > -1) mastered.splice(idx, 1);
      saveState('fivem_tricks_mastered', mastered);
    }
  }

  // Update modal header completed status button
  const isCompleted = mastered.includes(activeTrickId);
  const masterBtn = document.getElementById('modal-mastered-btn');
  if (isCompleted) {
    masterBtn.innerHTML = '<i data-lucide="check-circle-2"></i> <span>ฝึกฝนสำเร็จแล้ว (กดเพื่อเริ่มใหม่)</span>';
    masterBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
  } else {
    masterBtn.innerHTML = '<i data-lucide="circle"></i> <span>ทำเครื่องหมายฝึกฝนสำเร็จ</span>';
    masterBtn.style.background = 'var(--bg-card)';
  }

  // Redraw
  renderModalChecklist();
  
  if (currentTab === 'gallery') {
    renderTricksGrid();
  } else {
    renderRecommendedTricks();
    updateDashboardStats();
  }

  lucide.createIcons();
}

// Close Video modal and clear source to stop player
function closeModal() {
  const modalOverlay = document.getElementById('video-modal');
  modalOverlay.classList.remove('active');
  
  // Clear player container to stop audio/video
  document.getElementById('video-player-container').innerHTML = '';
  activeTrickId = null;

  // Refresh data stats if they have checked off some boxes
  if (currentTab === 'dashboard') {
    renderRecommendedTricks();
    updateDashboardStats();
  } else if (currentTab === 'gallery') {
    renderTricksGrid();
  }
}

// Close modal if user clicks on the surrounding background overlay
function closeModalOnOverlay(event) {
  if (event.target.id === 'video-modal') {
    closeModal();
  }
}

// Form Submission: Add New Red Pool Combat Trick
async function handleFormSubmit(event) {
  event.preventDefault();

  const title = document.getElementById('trick-title').value.trim();
  const category = document.getElementById('trick-category').value;
  const difficulty = document.getElementById('trick-difficulty').value;
  const duration = document.getElementById('trick-duration').value.trim();
  const videoUrl = document.getElementById('trick-video').value.trim();
  const description = document.getElementById('trick-description').value.trim();
  const rawChecklist = document.getElementById('trick-checklist').value.split('\n');
  const tips = document.getElementById('trick-tips').value.trim();

  // Clean checklist steps (filter out empty lines)
  const checklist = rawChecklist
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // Generate unique ID
  const id = `custom-${Date.now()}`;

  const newTrick = {
    id,
    title,
    category,
    difficulty,
    duration,
    videoUrl,
    description,
    checklist,
    tips: tips || null
  };

  // Add to local state first (immediate responsiveness)
  tricks.unshift(newTrick);
  saveState('fivem_tricks', tricks);

  // Reset form
  document.getElementById('add-trick-form').reset();

  // Redirect to Gallery view
  switchTab('gallery');

  // If Supabase is configured, upload to database
  if (isSupabaseConfigured()) {
    showToast('⏳ กำลังบันทึกทริคขึ้นฐานข้อมูล...');
    try {
      const { error } = await supabaseClient
        .from('tricks')
        .insert([{
          id,
          title,
          category,
          difficulty,
          duration,
          video_url: videoUrl,
          description,
          checklist,
          tips: tips || null
        }]);

      if (error) throw error;
      showToast('เพิ่มทริคไม้พูลใหม่สำเร็จ!');
    } catch (e) {
      console.error("Failed to upload trick to Supabase:", e);
      showToast('⚠️ เพิ่มทริคสำเร็จในเครื่อง แต่ไม่สามารถอัปโหลดขึ้นเซิร์ฟเวอร์ได้');
    }
  } else {
    showToast('เพิ่มทริคไม้พูลใหม่สำเร็จ!');
  }
}

// Toast Alert display
function showToast(message) {
  const toast = document.getElementById('toast-banner');
  const toastMsg = document.getElementById('toast-message');
  
  toastMsg.textContent = message;
  toast.classList.add('active');

  // Fade out after 3.5 seconds
  setTimeout(() => {
    toast.classList.remove('active');
  }, 3500);
}

/* ==========================================
   VIP MODAL ACTIONS & KEY VALIDATION
   ========================================== */

// Hashing function to generate personalized VIP key based on Discord username
function generateVipKey(username) {
  const cleanName = username.trim().toLowerCase().replace(/\s+/g, '');
  if (!cleanName) return '';
  
  // DJB2 polynomial hash
  let hash = 5381;
  for (let i = 0; i < cleanName.length; i++) {
    hash = ((hash << 5) + hash) + cleanName.charCodeAt(i);
  }
  
  // Convert hash to a 36-base string (numbers and capital letters)
  const hashStr = Math.abs(hash).toString(36).toUpperCase();
  return `VIP-${hashStr}`;
}

// Open VIP Unlock Modal
function openVipModal() {
  // Clear modal inputs
  document.getElementById('vip-key-input').value = '';
  document.getElementById('vip-error-msg').textContent = '';
  
  // Restore saved username, or use currently logged in Discord username
  let targetUser = '';
  if (currentUser) {
    const metadata = currentUser.user_metadata || {};
    targetUser = metadata.custom_claims?.global_name || metadata.full_name || currentUser.email.split('@')[0];
  } else {
    targetUser = localStorage.getItem('fivem_tricks_vip_user') || '';
  }
  
  const discordInput = document.getElementById('vip-discord-input');
  if (discordInput) {
    discordInput.value = targetUser;
    discordInput.disabled = false;
  }
  
  const vipModal = document.getElementById('vip-modal');
  vipModal.classList.add('active');
  
  // Re-run lucide to render icons
  lucide.createIcons();
}

// Close VIP Unlock Modal
function closeVipModal() {
  const vipModal = document.getElementById('vip-modal');
  vipModal.classList.remove('active');
}

// Close VIP Modal when clicking on overlay background
function closeVipModalOnOverlay(event) {
  if (event.target.id === 'vip-modal') {
    closeVipModal();
  }
}

// Handle Enter key on VIP Key input field
function handleVipKeyPress(event) {
  if (event.key === 'Enter') {
    activateVip();
  }
}

// Verify VIP key and activate VIP status (Online & Offline Support)
async function activateVip() {
  const usernameInput = document.getElementById('vip-discord-input');
  const keyInput = document.getElementById('vip-key-input');
  const errorMsg = document.getElementById('vip-error-msg');
  
  if (!currentUser) {
    errorMsg.style.color = 'var(--accent-pink)';
    errorMsg.textContent = 'กรุณาเข้าสู่ระบบด้วย Discord ก่อนเปิดใช้งานคีย์ VIP';
    playErrorSound();
    openLoginModal();
    return;
  }
  
  const username = usernameInput.value.trim();
  const key = keyInput.value.trim().toUpperCase();

  if (!username) {
    errorMsg.style.color = 'var(--accent-pink)';
    errorMsg.textContent = 'กรุณากรอกชื่อ Discord ของคุณก่อนทำการยืนยัน';
    playErrorSound();
    return;
  }

  if (!key) {
    errorMsg.style.color = 'var(--accent-pink)';
    errorMsg.textContent = 'กรุณากรอกรหัสเปิดใช้งานก่อนทำการยืนยัน';
    playErrorSound();
    return;
  }

  // Show loading indicator
  errorMsg.style.color = 'var(--accent-cyan)';
  errorMsg.textContent = '⏳ กำลังตรวจสอบคีย์ออนไลน์...';

  try {
    // 1. Verify offline master keys for testing override
    if (VALID_VIP_KEYS.includes(key)) {
      unlockVipLocally(username, key);
      showToast('👑 ยินดีต้อนรับสู่ VIP PRO! (เปิดใช้งานด้วยมาสเตอร์คีย์)');
      return;
    }

    // 2. Verify offline personalized key (Fallback support if Supabase is unconfigured)
    const localPersonalizedKey = generateVipKey(username);
    if (!isSupabaseConfigured()) {
      if (key === localPersonalizedKey) {
        unlockVipLocally(username, key);
        showToast('👑 ยินดีต้อนรับสู่ VIP PRO! (เปิดใช้งานระบบออฟไลน์)');
      } else {
        errorMsg.style.color = 'var(--accent-pink)';
        errorMsg.textContent = 'รหัสเปิดใช้งานไม่ถูกต้อง กรุณาติดต่อแอดมินเพื่อขอรับรหัส';
        playErrorSound();
      }
      return;
    }

    // 3. Online Database verification via Supabase
    const { data, error } = await supabaseClient
      .from('vip_keys')
      .select('*')
      .eq('key_code', key)
      .maybeSingle();

    if (error) {
      console.error("Supabase select error:", error);
      errorMsg.style.color = 'var(--accent-pink)';
      errorMsg.textContent = '❌ เกิดข้อผิดพลาดในระบบฐานข้อมูล กรุณาลองใหม่';
      playErrorSound();
      return;
    }

    if (!data) {
      errorMsg.style.color = 'var(--accent-pink)';
      errorMsg.textContent = 'รหัสเปิดใช้งานไม่ถูกต้อง กรุณาตรวจสอบและลองใหม่';
      playErrorSound();
      return;
    }

    // Check if the key has already been activated elsewhere
    if (data.is_used) {
      errorMsg.style.color = 'var(--accent-pink)';
      errorMsg.textContent = `❌ คีย์นี้ถูกใช้งานไปแล้วโดยผู้ใช้อื่น: ${data.used_by}`;
      playErrorSound();
      return;
    }

    // 4. Mark key as activated in Supabase
    const { error: updateError } = await supabaseClient
      .from('vip_keys')
      .update({
        is_used: true,
        used_by: username,
        activated_at: new Date().toISOString()
      })
      .eq('key_code', key);

    if (updateError) {
      console.error("Supabase update error:", updateError);
      errorMsg.style.color = 'var(--accent-pink)';
      errorMsg.textContent = '❌ เกิดข้อผิดพลาดขณะบันทึกข้อมูลเปิดใช้งาน';
      playErrorSound();
      return;
    }

    // 5. Success unlock locally
    unlockVipLocally(username, key);
    showToast('👑 ยินดีต้อนรับสู่ VIP PRO! ปลดล็อคบทเรียนระดับสูงออนไลน์แล้ว');

  } catch (err) {
    console.error("Activation network error:", err);
    errorMsg.style.color = 'var(--accent-pink)';
    errorMsg.textContent = '❌ เชื่อมต่อเครือข่ายอินเทอร์เน็ตล้มเหลว กรุณาลองใหม่';
    playErrorSound();
  }
}

// Helper: Unlock VIP and redraw user interface
function unlockVipLocally(username, key) {
  isVip = true;
  localStorage.setItem('fivem_tricks_vip', 'true');
  localStorage.setItem('fivem_tricks_vip_user', username);
  localStorage.setItem('fivem_tricks_vip_key', key);
  
  // Clear error messages
  const errorMsg = document.getElementById('vip-error-msg');
  if (errorMsg) errorMsg.textContent = '';
  
  closeVipModal();
  
  playSuccessSound();
  triggerVipScreenFlash();
  
  updateVipUi();
  renderTricksGrid();
  renderRecommendedTricks();
  updateDashboardStats();
}

// Trigger full screen flash animation on VIP Unlock
function triggerVipScreenFlash() {
  const flash = document.getElementById('vip-flash-overlay');
  if (!flash) return;
  
  flash.classList.remove('flash-active');
  void flash.offsetWidth; // Trigger reflow to restart animation
  flash.classList.add('flash-active');
  
  setTimeout(() => {
    flash.classList.remove('flash-active');
  }, 1000);
}

// Update the VIP Sidebar Card appearance
function updateVipUi() {
  const banner = document.getElementById('sidebar-vip-banner');
  const statusText = document.getElementById('vip-status-text');
  const btn = document.getElementById('sidebar-vip-btn');
  const rankEl = document.getElementById('sidebar-rank');

  if (!banner) return;

  if (isVip) {
    banner.classList.add('unlocked');
    statusText.textContent = 'ปลดล็อกระดับ PRO แล้ว';
    if (btn) {
      btn.textContent = 'เปิดใช้งานแล้ว 👑';
      // Disable click or keep active with message
      btn.onclick = () => showToast('👑 คุณเป็นสมาชิกระดับ VIP PRO เรียบร้อยแล้ว!');
    }
    if (rankEl) {
      rankEl.textContent = "VIP Member";
    }
  } else {
    banner.classList.remove('unlocked');
    statusText.textContent = 'ล็อกบทเรียนขั้นสูงไว้';
    if (btn) {
      btn.textContent = 'เปิดใช้งาน';
      btn.onclick = openVipModal;
    }
    if (rankEl) {
      rankEl.textContent = "Pro Player";
    }
  }
}

// Admin tool: Generate VIP Key for customer (Online Database insertion)
async function generateAndShowKey() {
  const discordInput = document.getElementById('generator-discord-name');
  const resultContainer = document.getElementById('generator-result-container');
  const displayEl = document.getElementById('generated-key-display');
  
  const username = discordInput.value.trim();
  if (!username) {
    showToast('❌ กรุณากรอกชื่อ Discord ของลูกค้า');
    return;
  }
  
  // Generate a cryptographically random short key to prevent guess attacks
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  const key = `VIP-${randomStr}`;
  
  // If Supabase is unconfigured, generate and show local key as fallback
  if (!isSupabaseConfigured()) {
    const fallbackKey = generateVipKey(username);
    displayEl.textContent = fallbackKey;
    resultContainer.style.display = 'flex';
    lucide.createIcons();
    showToast('⚠️ สร้างคีย์สำเร็จ (โหมดออฟไลน์เนื่องจาก Supabase ยังไม่ได้ตั้งค่า)');
    return;
  }
  
  // Upload the new valid key to the online database table
  try {
    const { error } = await supabaseClient
      .from('vip_keys')
      .insert([
        { key_code: key, is_used: false }
      ]);
      
    if (error) {
      console.error("Supabase insert error:", error);
      showToast('❌ เกิดข้อผิดพลาด ไม่สามารถบันทึกคีย์ขึ้นระบบได้');
      return;
    }
    
    // Display generated key for copy pasting
    displayEl.textContent = key;
    resultContainer.style.display = 'flex';
    lucide.createIcons();
    showToast('🔑 อัปโหลดคีย์ VIP ขึ้นฐานข้อมูลออนไลน์เสร็จสมบูรณ์!');
  } catch (err) {
    console.error("Insert network error:", err);
    showToast('❌ การเชื่อมต่อล้มเหลว ตรวจสอบอินเทอร์เน็ต');
  }
}

// Admin tool: Copy generated VIP key to clipboard
function copyGeneratedKey() {
  const displayEl = document.getElementById('generated-key-display');
  const key = displayEl.textContent;
  
  if (!key || key === 'VIP-XXXXXX') return;
  
  navigator.clipboard.writeText(key)
    .then(() => {
      showToast('📋 คัดลอกคีย์ VIP ลงคลิปบอร์ดแล้ว!');
    })
    .catch(err => {
      console.error(err);
      showToast('❌ ไม่สามารถคัดลอกได้อัตโนมัติ');
    });
}

/* ==========================================
   ADMIN PORTAL & CODE EXPORT
   ========================================== */

// Open Admin Login Modal
function openAdminModal() {
  document.getElementById('admin-password-input').value = '';
  document.getElementById('admin-error-msg').textContent = '';
  
  const modal = document.getElementById('admin-modal');
  modal.classList.add('active');
}

// Close Admin Login Modal
function closeAdminModal() {
  const modal = document.getElementById('admin-modal');
  modal.classList.remove('active');
}

// Close Admin Modal on Overlay background click
function closeAdminModalOnOverlay(event) {
  if (event.target.id === 'admin-modal') {
    closeAdminModal();
  }
}

// Handle Enter key on Admin password input field
function handleAdminKeyPress(event) {
  if (event.key === 'Enter') {
    loginAdmin();
  }
}

// Validate admin password and grant access
function loginAdmin() {
  const passwordInput = document.getElementById('admin-password-input');
  const errorMsg = document.getElementById('admin-error-msg');
  const password = passwordInput.value;

  if (password === ADMIN_PASSWORD) {
    isAdmin = true;
    sessionStorage.setItem('fivem_admin', 'true');
    
    errorMsg.textContent = '';
    closeAdminModal();
    updateAdminUi();
    
    // Refresh grids & stats so admin immediately sees unlocked tricks
    renderTricksGrid();
    renderRecommendedTricks();
    updateDashboardStats();
    
    showToast('🔑 เข้าสู่ระบบแอดมินสำเร็จ! เมนูเพิ่มทริคและบทเรียนทั้งหมดปลดล็อคแล้ว');
  } else {
    errorMsg.textContent = 'รหัสผ่านแอดมินไม่ถูกต้อง กรุณาลองอีกครั้ง';
    playErrorSound();
  }
}

// Update UI view based on admin state
function updateAdminUi() {
  const submitBtn = document.getElementById('nav-btn-submit');
  const generatorBtn = document.getElementById('nav-btn-generator');
  
  if (isAdmin) {
    if (submitBtn) submitBtn.style.display = 'flex';
    if (generatorBtn) generatorBtn.style.display = 'flex';
  } else {
    if (submitBtn) submitBtn.style.display = 'none';
    if (generatorBtn) generatorBtn.style.display = 'none';
    // If user is currently on an admin page, push them back to dashboard
    if (currentTab === 'submit' || currentTab === 'generator') {
      switchTab('dashboard');
    }
  }
}

// Export submitted trick data into formatting suitable for mockData.js
function exportTrickCode() {
  const title = document.getElementById('trick-title').value.trim();
  const category = document.getElementById('trick-category').value;
  const difficulty = document.getElementById('trick-difficulty').value;
  const duration = document.getElementById('trick-duration').value.trim();
  const videoUrl = document.getElementById('trick-video').value.trim();
  const description = document.getElementById('trick-description').value.trim();
  const rawChecklist = document.getElementById('trick-checklist').value.split('\n');
  const tips = document.getElementById('trick-tips').value.trim();

  if (!title || !category || !difficulty || !duration || !videoUrl || !description || rawChecklist.length === 0) {
    showToast('❌ กรุณากรอกข้อมูลที่จำเป็นทั้งหมดก่อนทำการคัดลอกโค้ด');
    return;
  }

  // Clean checklist steps
  const checklist = rawChecklist
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // Generate ID based on title (transliterating to simple ascii if possible, otherwise simple hash)
  const cleanId = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-');
  
  const id = cleanId || `custom-${Date.now()}`;

  // Build clean code string matching mockData format
  const formattedCode = `  {
    id: "${id}",
    title: "${title}",
    category: "${category}",
    difficulty: "${difficulty}",
    duration: "${duration}",
    videoUrl: "${videoUrl}",
    description: "${description}",
    checklist: ${JSON.stringify(checklist, null, 6).replace(/\n/g, '\n    ')},
    tips: ${tips ? `"${tips}"` : 'null'}
  },`;

  // Copy to clipboard
  navigator.clipboard.writeText(formattedCode)
    .then(() => {
      showToast('📋 คัดลอกโค้ดสำหรับ mockData.js ลงคลิปบอร์ดแล้ว!');
    })
    .catch(err => {
      console.error(err);
      showToast('❌ ไม่สามารถคัดลอกได้อัตโนมัติ กรุณาลองใหม่');
    });
}

// Helper: Open Login Modal
function openLoginModal() {
  const gate = document.getElementById('discord-login-gate');
  if (gate) {
    gate.classList.remove('hidden');
    lucide.createIcons();
  }
}

// Helper: Close Login Modal
function closeLoginModal() {
  const gate = document.getElementById('discord-login-gate');
  if (gate) gate.classList.add('hidden');
}

// Helper: Close Login Modal on overlay click
function closeLoginModalOnOverlay(event) {
  if (event.target.id === 'discord-login-gate') {
    closeLoginModal();
  }
}

// Helper: Custom Click Handler for Trick Cards
function handleTrickClick(trickId) {
  if (!currentUser) {
    showToast('🔒 กรุณาเข้าสู่ระบบด้วย Discord ก่อนเข้าดูบทเรียน');
    openLoginModal();
    return;
  }
  
  const trick = tricks.find(t => t.id === trickId);
  const locked = isTrickLocked(trick);
  if (locked) {
    openVipModal();
  } else {
    openModal(trickId);
  }
}

// Helper: Custom Click Handler for Favorite Buttons
function handleFavoriteClick(trickId, event) {
  if (event) event.stopPropagation();
  
  if (!currentUser) {
    showToast('🔒 กรุณาเข้าสู่ระบบด้วย Discord ก่อนทำรายการ');
    openLoginModal();
    return;
  }
  
  toggleFavorite(trickId, event);
}

// Dismiss landing page overlay with transition and cache state
function closeLandingPage() {
  const landing = document.getElementById('landing-page');
  if (landing) {
    landing.classList.add('fade-out');
    sessionStorage.setItem('fivem_tricks_started', 'true');
    setTimeout(() => {
      landing.style.display = 'none';
    }, 800);
  }
  // Try to resume audio context if suspended
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
  } catch (e) {}
}

// Admin only: Delete a trick from the workspace list
async function handleDeleteClick(trickId, event) {
  if (event) event.stopPropagation(); // Prevent opening video details modal
  
  if (!isAdmin) {
    showToast('🔒 เฉพาะผู้ดูแลระบบเท่านั้นที่มีสิทธิ์ลบบทเรียน');
    return;
  }
  
  const trick = tricks.find(t => t.id === trickId);
  if (!trick) return;
  
  if (confirm(`คุณต้องการลบบทเรียน "${trick.title}" ใช่หรือไม่?`)) {
    // Remove from tricks list locally
    tricks = tricks.filter(t => t.id !== trickId);
    saveState('fivem_tricks', tricks);
    
    // Also remove from favorites and mastered lists if present
    const favIndex = favorites.indexOf(trickId);
    if (favIndex > -1) {
      favorites.splice(favIndex, 1);
      saveState('fivem_tricks_favs', favorites);
    }
    
    const masteredIndex = mastered.indexOf(trickId);
    if (masteredIndex > -1) {
      mastered.splice(masteredIndex, 1);
      saveState('fivem_tricks_mastered', mastered);
    }
    
    // Remove checklist state
    if (checkedSteps[trickId]) {
      delete checkedSteps[trickId];
      saveState('fivem_tricks_steps', checkedSteps);
    }
    
    // Re-render all grids & stats
    renderTricksGrid();
    renderRecommendedTricks();
    updateDashboardStats();
    
    // If Supabase is configured, delete from database
    if (isSupabaseConfigured()) {
      showToast('⏳ กำลังลบข้อมูลออกจากฐานข้อมูล...');
      try {
        const { error } = await supabaseClient
          .from('tricks')
          .delete()
          .eq('id', trickId);

        if (error) throw error;
        showToast(`ลบบทเรียน "${trick.title}" สำเร็จ`);
      } catch (e) {
        console.error("Failed to delete trick from Supabase:", e);
        showToast('⚠️ ลบสำเร็จในเครื่อง แต่ไม่สามารถลบออกจากเซิร์ฟเวอร์ได้');
      }
    } else {
      showToast(`ลบบทเรียน "${trick.title}" สำเร็จ`);
    }
  }
}
