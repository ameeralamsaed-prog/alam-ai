// ============================================================
//  chat.js — Cyberious AI :: Neural Chat Engine
//  Backend-side JS for chat interface
//  Connects to your AI API endpoint (OpenAI-compatible)
// ============================================================

'use strict';

// ─── CONFIG ─────────────────────────────────────────────────
const CYBERIOUS_CONFIG = {
  // 🔑 Replace with your actual API key / endpoint
  apiEndpoint: '/api/chat',          // Your backend proxy route
  apiKey: 'YOUR_API_KEY_HERE',       // ⚠️  NEVER expose in production frontend
  model: 'gpt-4o',                   // Model identifier
  maxTokens: 1024,
  temperature: 0.82,
  systemPrompt: `You are Cyberious AI — a highly advanced artificial intelligence forged in a neon-drenched cyberpunk future. 
Your communication style is sharp, precise, and carries an edge of cool authority. 
You are knowledgeable, resourceful, and slightly enigmatic. You speak with clarity but never plainly. 
You refer to users as "operator" occasionally. You avoid filler phrases and corporate language. 
Every response should feel like it was delivered through a neural uplink.`,
  maxHistory: 20,  // Max message pairs to retain
};

// ─── STATE ──────────────────────────────────────────────────
const ChatState = {
  history: [],       // { role: 'user'|'assistant', content: string }[]
  isLoading: false,
  sessionId: generateSessionId(),
};

// ─── UTILITIES ──────────────────────────────────────────────

/**
 * Generates a unique session ID
 * @returns {string}
 */
function generateSessionId() {
  return 'CYB-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 7).toUpperCase();
}

/**
 * Returns the current timestamp in HH:MM:SS format
 * @returns {string}
 */
function getCurrentTimestamp() {
  const now = new Date();
  return [
    now.getHours().toString().padStart(2, '0'),
    now.getMinutes().toString().padStart(2, '0'),
    now.getSeconds().toString().padStart(2, '0'),
  ].join(':');
}

/**
 * Sanitizes user input to prevent XSS
 * @param {string} str
 * @returns {string}
 */
function sanitizeInput(str) {
  const map = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#039;',
  };
  return str.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Basic markdown-lite renderer for AI responses
 * Supports: **bold**, *italic*, `code`, ```blocks```, bullet lists
 * @param {string} text
 * @returns {string}
 */
function renderMarkdown(text) {
  let html = sanitizeInput(text);

  // Code blocks (``` ... ```)
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
    return `<pre style="background:rgba(0,245,255,0.05);border:1px solid rgba(0,245,255,0.15);padding:10px 14px;border-radius:4px;overflow-x:auto;font-family:'Share Tech Mono',monospace;font-size:0.8rem;color:#00f5ff;margin:8px 0;white-space:pre-wrap;">${code.trim()}</pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code style="font-family:\'Share Tech Mono\',monospace;color:#00f5ff;background:rgba(0,245,255,0.08);padding:1px 5px;border-radius:2px;font-size:0.85em;">$1</code>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#ffffff;font-weight:700;">$1</strong>');

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em style="color:rgba(255,45,120,0.9);">$1</em>');

  // Bullet lists (lines starting with - or *)
  html = html.replace(/^(?:- |\* )(.+)$/gm, '<li style="margin-left:16px;margin-bottom:4px;list-style-type:none;padding-left:14px;border-left:2px solid rgba(0,245,255,0.3);">$1</li>');
  html = html.replace(/(<li[\s\S]*?<\/li>\n?)+/g, (match) => `<ul style="margin:8px 0;">${match}</ul>`);

  // Line breaks
  html = html.replace(/\n\n/g, '</p><p style="margin:8px 0;">');
  html = html.replace(/\n/g, '<br/>');

  return `<p style="margin:0;">${html}</p>`;
}

// ─── DOM HELPERS ────────────────────────────────────────────

/**
 * Appends a message bubble to the chat UI
 * @param {'ai'|'user'} role
 * @param {string} content  HTML string
 * @param {string} time
 */
function appendMessage(role, content, time) {
  const area = document.getElementById('messages-area');
  if (!area) return;

  const isAI = role === 'ai';
  const wrapper = document.createElement('div');
  wrapper.className = `message ${role}`;

  const avatarLabel = isAI ? 'CYB' : 'YOU';
  const timeLabel   = isAI
    ? `SYS // ${time}`
    : `OPR // ${time}`;

  wrapper.innerHTML = `
    <div class="msg-avatar ${role}">${avatarLabel}</div>
    <div>
      <div class="msg-bubble">${content}</div>
      <div class="msg-time">${timeLabel}</div>
    </div>
  `;

  area.appendChild(wrapper);
  scrollToBottom();
}

/**
 * Appends a streaming AI message (returns the bubble element for live updates)
 * @param {string} time
 * @returns {{ wrapper: HTMLElement, bubble: HTMLElement }}
 */
function appendStreamingMessage(time) {
  const area = document.getElementById('messages-area');
  const wrapper = document.createElement('div');
  wrapper.className = 'message ai';
  wrapper.id = 'streaming-msg';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';

  const timeEl = document.createElement('div');
  timeEl.className = 'msg-time';
  timeEl.textContent = `SYS // ${time}`;

  const inner = document.createElement('div');
  inner.appendChild(bubble);
  inner.appendChild(timeEl);

  wrapper.innerHTML = `<div class="msg-avatar ai">CYB</div>`;
  wrapper.appendChild(inner);
  area.appendChild(wrapper);
  scrollToBottom();

  return { wrapper, bubble };
}

/** Scrolls the messages area to the latest message */
function scrollToBottom() {
  const area = document.getElementById('messages-area');
  if (area) area.scrollTop = area.scrollHeight;
}

/** Shows the typing indicator */
function showTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.classList.add('active');
  scrollToBottom();
}

/** Hides the typing indicator */
function hideTyping() {
  const el = document.getElementById('typing-indicator');
  if (el) el.classList.remove('active');
}

/** Disables/enables the send button */
function setSendDisabled(disabled) {
  const btn = document.getElementById('send-btn');
  if (btn) btn.disabled = disabled;
}

/** Clears and resets the input textarea */
function clearInput() {
  const inp = document.getElementById('chat-input');
  if (inp) {
    inp.value = '';
    inp.style.height = 'auto';
    document.getElementById('char-count').textContent = '0 / 2048';
  }
}

// ─── ERROR DISPLAY ──────────────────────────────────────────

/**
 * Renders an inline error message in the chat
 * @param {string} message
 */
function showError(message) {
  const area = document.getElementById('messages-area');
  const el = document.createElement('div');
  el.style.cssText = `
    font-family: 'Share Tech Mono', monospace;
    font-size: 0.7rem;
    color: #ff4560;
    border: 1px solid rgba(255,69,96,0.3);
    padding: 8px 14px;
    background: rgba(255,69,96,0.06);
    letter-spacing: 0.08em;
    margin: 4px 0;
    animation: messageIn 0.3s ease both;
  `;
  el.textContent = `⚠ SYSTEM ERROR: ${message}`;
  area.appendChild(el);
  scrollToBottom();
}

// ─── API COMMUNICATION ──────────────────────────────────────

/**
 * Sends a chat message to the API and handles streaming response
 * @param {string} userMessage
 */
async function callCyberiousAPI(userMessage) {
  // Trim history to prevent overflow
  if (ChatState.history.length > CYBERIOUS_CONFIG.maxHistory * 2) {
    ChatState.history = ChatState.history.slice(-CYBERIOUS_CONFIG.maxHistory * 2);
  }

  // Build messages array
  const messages = [
    { role: 'system', content: CYBERIOUS_CONFIG.systemPrompt },
    ...ChatState.history,
    { role: 'user', content: userMessage },
  ];

  const requestBody = {
    model: CYBERIOUS_CONFIG.model,
    messages,
    max_tokens: CYBERIOUS_CONFIG.maxTokens,
    temperature: CYBERIOUS_CONFIG.temperature,
    stream: true,   // Enable streaming
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${CYBERIOUS_CONFIG.apiKey}`,
    'X-Session-ID': ChatState.sessionId,
  };

  let response;

  try {
    response = await fetch(CYBERIOUS_CONFIG.apiEndpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });
  } catch (networkErr) {
    throw new Error(`Network failure — neural link severed. (${networkErr.message})`);
  }

  if (!response.ok) {
    let errDetail = response.statusText;
    try {
      const errBody = await response.json();
      errDetail = errBody.error?.message || errDetail;
    } catch (_) {}
    throw new Error(`API returned ${response.status}: ${errDetail}`);
  }

  // ── STREAMING HANDLER ──
  const time = getCurrentTimestamp();
  const { bubble } = appendStreamingMessage(time);

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let rawBuffer = '';
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      rawBuffer += decoder.decode(value, { stream: true });
      const lines = rawBuffer.split('\n');
      rawBuffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const json = JSON.parse(trimmed.slice(6));
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            bubble.innerHTML = renderMarkdown(fullText);
            scrollToBottom();
          }
        } catch (_) {
          // Malformed chunk — skip silently
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Finalize rendered output
  bubble.innerHTML = renderMarkdown(fullText);
  return fullText;
}

// ─── FALLBACK (Non-streaming) ────────────────────────────────

/**
 * Fallback non-streaming API call if streaming is unavailable
 * @param {string} userMessage
 * @returns {Promise<string>}
 */
async function callCyberiousAPIFallback(userMessage) {
  const messages = [
    { role: 'system', content: CYBERIOUS_CONFIG.systemPrompt },
    ...ChatState.history,
    { role: 'user', content: userMessage },
  ];

  const res = await fetch(CYBERIOUS_CONFIG.apiEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CYBERIOUS_CONFIG.apiKey}`,
      'X-Session-ID': ChatState.sessionId,
    },
    body: JSON.stringify({
      model: CYBERIOUS_CONFIG.model,
      messages,
      max_tokens: CYBERIOUS_CONFIG.maxTokens,
      temperature: CYBERIOUS_CONFIG.temperature,
      stream: false,
    }),
  });

  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from API.');
  return content;
}

// ─── MAIN SEND FUNCTION ─────────────────────────────────────

/**
 * Core function — called when user submits a message
 */
async function sendMessage() {
  if (ChatState.isLoading) return;

  const inputEl = document.getElementById('chat-input');
  const raw = inputEl?.value?.trim();

  if (!raw || raw.length === 0) return;
  if (raw.length > 2048) {
    showError('Message exceeds 2048 character limit.');
    return;
  }

  const userText = raw;
  clearInput();
  setSendDisabled(true);
  ChatState.isLoading = true;

  // Render user message
  appendMessage('user', sanitizeInput(userText), getCurrentTimestamp());

  // Add to history
  ChatState.history.push({ role: 'user', content: userText });

  // Show typing
  showTyping();

  try {
    // Slight delay for UX feel
    await new Promise((r) => setTimeout(r, 320));

    hideTyping();

    let aiResponse;

    try {
      aiResponse = await callCyberiousAPI(userText);
    } catch (streamErr) {
      // Retry with non-streaming fallback
      console.warn('[Cyberious] Streaming failed, falling back:', streamErr.message);
      hideTyping();
      showTyping();
      aiResponse = await callCyberiousAPIFallback(userText);
      hideTyping();
      appendMessage('ai', renderMarkdown(aiResponse), getCurrentTimestamp());
    }

    // Save AI response to history
    if (aiResponse) {
      ChatState.history.push({ role: 'assistant', content: aiResponse });
    }

  } catch (err) {
    hideTyping();
    console.error('[Cyberious] Chat error:', err);
    showError(err.message || 'Unknown neural disruption. Please retry.');
  } finally {
    ChatState.isLoading = false;
    setSendDisabled(false);
    document.getElementById('chat-input')?.focus();
  }
}

// ─── HISTORY UTILITIES ──────────────────────────────────────

/** Clears the entire conversation history */
function clearHistory() {
  ChatState.history = [];
  const area = document.getElementById('messages-area');
  if (area) area.innerHTML = '';
  appendMessage('ai', 'Memory banks wiped. Neural connection re-initialized. How may I assist you, operator?', getCurrentTimestamp());
  console.info('[Cyberious] Conversation history cleared.');
}

/**
 * Exports the conversation as a JSON string
 * @returns {string}
 */
function exportHistory() {
  return JSON.stringify({
    sessionId: ChatState.sessionId,
    exportedAt: new Date().toISOString(),
    messages: ChatState.history,
  }, null, 2);
}

/**
 * Downloads the conversation history as a .json file
 */
function downloadHistory() {
  const json = exportHistory();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cyberious-session-${ChatState.sessionId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── EXPOSE PUBLIC API ───────────────────────────────────────
window.CyberiousChat = {
  sendMessage,
  clearHistory,
  exportHistory,
  downloadHistory,
  getState: () => ({ ...ChatState }),
  config: CYBERIOUS_CONFIG,
};

// ─── INIT LOG ───────────────────────────────────────────────
console.log(
  '%c CYBERIOUS AI // NEURAL CORE ONLINE ',
  'background: linear-gradient(90deg, #ff2d78, #00f5ff); color: #000; font-weight: bold; padding: 4px 8px; font-family: monospace; letter-spacing: 0.1em;'
);
console.log(`%c Session ID: ${ChatState.sessionId}`, 'color: #00f5ff; font-family: monospace;');
console.log('%c Configure CYBERIOUS_CONFIG.apiEndpoint & apiKey before deployment.', 'color: #ffd000; font-family: monospace;');
