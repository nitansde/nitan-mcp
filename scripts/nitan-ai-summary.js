// ==UserScript==
// @name         USCardForum AI 总结 (v39.0 智能对话版)
// @namespace    http://tampermonkey.net/
// @version      39.0
// @description  总结后自动生成聊天模式，支持基于上下文的连续追问
// @author       ALousaBao
// @match        https://www.uscardforum.com/*
// @connect      generativelanguage.googleapis.com
// @connect      uscardforum.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @updateURL    https://raw.githubusercontent.com/nitan-ALousaBao/nitan-AI-summary/main/nitan-ai-summary.js
// @downloadURL  https://raw.githubusercontent.com/nitan-ALousaBao/nitan-AI-summary/main/nitan-ai-summary.js
// ==/UserScript==

(function() {
    'use strict';

    // ✅ 你的 API Key
    const API_KEY = '';

    // 🎨 聊天样式注入
    GM_addStyle(`
        .ai-progress-container { width: 100%; height: 4px; background: #f0f0f0; margin-bottom: 10px; border-radius: 2px; overflow: hidden; display: none; }
        .ai-progress-bar { width: 0%; height: 100%; background: #28a745; transition: width 0.2s ease; }

        /* 按钮组 */
        .ai-btn-group { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
        .ai-btn { padding: 8px 16px; color: white; border: 1px solid rgba(255,255,255,0.5); border-radius: 50px; cursor: pointer; font-weight: bold; font-size: 13px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); transition: transform 0.1s; min-width: 140px; font-family: sans-serif; }
        .ai-btn:hover { transform: scale(1.05); }
        .ai-btn:active { transform: scale(0.95); }

        /* 聊天气泡 */
        .chat-bubble { max-width: 85%; padding: 10px 14px; border-radius: 12px; margin-bottom: 10px; font-size: 14px; line-height: 1.5; word-wrap: break-word; position: relative; }
        .chat-user { align-self: flex-end; background-color: #0088cc; color: white; border-bottom-right-radius: 2px; }
        .chat-ai { align-self: flex-start; background-color: #f1f3f5; color: #333; border-bottom-left-radius: 2px; border: 1px solid #e0e0e0; }
        .chat-system { align-self: center; font-size: 12px; color: #999; margin: 5px 0; font-style: italic; }

        /* 输入区域 */
        .chat-input-area { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #eee; background: white; border-radius: 0 0 12px 12px; }
        .chat-textarea { flex-grow: 1; padding: 8px; border: 1px solid #ddd; border-radius: 8px; resize: none; height: 40px; font-family: inherit; font-size: 14px; outline: none; transition: border 0.2s; }
        .chat-textarea:focus { border-color: #0088cc; }
        .chat-send-btn { width: 60px; height: 40px; background: #0088cc; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; }
        .chat-send-btn:hover { background: #0077b3; }
        .chat-send-btn:disabled { background: #ccc; cursor: not-allowed; }
    `);

    // 状态管理
    let currentModel = GM_getValue('ai_model_selection', null);
    let currentLang = localStorage.getItem('ai_summary_lang') || 'zh';
    let availableModels = [];
    let chatHistory = []; // 存储对话上下文
    let isGenerating = false;

    const CONTAINER_ID = 'ai-btn-container-v39';
    const BOX_ID = 'ai-chat-window-v39';

    // 🌐 语言包
    const I18N = {
        zh: {
            ui_title: "🤖 AI 助手",
            btn_settings: "⚙️ 设置",
            btn_close: "✕",
            input_placeholder: "继续追问... (Enter发送)",
            btn_send: "发送",
            status_init: "🔄 初始化...",
            status_thinking: "🤖 正在思考...",
            prompt_lang: "请严格使用简体中文输出。",
            prompt_prefix: "你是一个美卡论坛助手。",
            tag_rec: "🟢 推荐",
            // 按钮
            btn_search_ultra: "🤯 究极搜索 (Top 10)",
            btn_search_deep: "🧠 深度搜索 (Top 50)",
            btn_search_fast: "⚡ 屏幕总结",
            btn_topic_full: "🧠 深度全帖 (并发)",
            btn_topic_medium: "⚖️ 中度分析 (首尾)",
            btn_topic_fast: "⚡ 快速总结",
            // 提示
            err_net: "网络错误",
            err_429: "❌ 速度太快 (429)，请稍候...",
        },
        en: {
            ui_title: "🤖 AI Assistant",
            btn_settings: "⚙️ Settings",
            btn_close: "✕",
            input_placeholder: "Ask follow-up... (Enter to send)",
            btn_send: "Send",
            status_init: "🔄 Init...",
            status_thinking: "🤖 Thinking...",
            prompt_lang: "Please output strictly in ENGLISH.",
            prompt_prefix: "You are a forum assistant.",
            tag_rec: "🟢 Rec.",
            // Buttons
            btn_search_ultra: "🤯 Ultra Search (Top 10)",
            btn_search_deep: "🧠 Deep Search (Top 50)",
            btn_search_fast: "⚡ Screen Summary",
            btn_topic_full: "🧠 Deep Full-Topic",
            btn_topic_medium: "⚖️ Medium Analysis",
            btn_topic_fast: "⚡ Fast Summary",
            // Errors
            err_net: "Network Error",
            err_429: "❌ Rate Limit (429)",
        }
    };
    const t = (key) => I18N[currentLang][key] || key;

    // === 1. 初始化 ===
    initModelList();

    // === 2. 界面监控 ===
    setInterval(() => {
        const url = window.location.href;
        const valid = (url.includes('/search') && document.querySelector('.fps-result')) ||
                      (url.includes('/t/') && document.querySelector('.post-stream'));
        if (valid) {
            if (!document.getElementById(CONTAINER_ID)) createMainUI();
        } else {
            const c = document.getElementById(CONTAINER_ID);
            if(c) c.remove();
        }
    }, 1000);

    // === 3. UI 构建 ===
    function createMainUI() {
        if(document.getElementById(CONTAINER_ID)) return;
        const c = document.createElement('div');
        c.id = CONTAINER_ID;
        c.className = 'ai-btn-group';
        c.style.cssText = `position: fixed !important; bottom: 40px; right: 40px; z-index: 999999;`;

        // 工具栏
        const toolbar = document.createElement('div');
        toolbar.style.cssText = "display:flex; gap:5px;";
        const langSel = document.createElement('select');
        langSel.style.cssText = "padding:4px;border-radius:8px;font-size:12px;border:1px solid #ccc;cursor:pointer;";
        langSel.innerHTML = `<option value="zh" ${currentLang==='zh'?'selected':''}>🇨🇳</option><option value="en" ${currentLang==='en'?'selected':''}>🇺🇸</option>`;
        langSel.onchange = (e) => { currentLang = e.target.value; localStorage.setItem('ai_summary_lang', currentLang); updateMainUI(); };

        const settingsBtn = document.createElement('button');
        settingsBtn.innerHTML = t('btn_settings');
        settingsBtn.style.cssText = "padding:4px 8px;border-radius:8px;font-size:12px;cursor:pointer;border:1px solid #ccc;background:#f8f9fa;";
        settingsBtn.onclick = () => alert("当前模型: " + currentModel); // 简化设置，点击显示当前模型

        toolbar.appendChild(langSel);
        toolbar.appendChild(settingsBtn);
        c.appendChild(toolbar);

        // 按钮逻辑
        const isSearch = window.location.href.includes('/search');
        if (isSearch) {
            c.appendChild(createBtn(t('btn_search_ultra'), '#dc3545', handleSearchUltra));
            c.appendChild(createBtn(t('btn_search_deep'), '#6f42c1', handleSearchDeep));
            c.appendChild(createBtn(t('btn_search_fast'), '#0088cc', handleSearchFast));
        } else {
            c.appendChild(createBtn(t('btn_topic_full'), '#dc3545', handleTopicFull));
            c.appendChild(createBtn(t('btn_topic_medium'), '#6f42c1', handleTopicMedium));
            c.appendChild(createBtn(t('btn_topic_fast'), '#fd7e14', handleTopicFast));
        }
        document.body.appendChild(c);
    }

    function createBtn(text, color, onClick) {
        const b = document.createElement('button');
        b.className = 'ai-btn';
        b.innerHTML = text;
        b.style.background = color;
        b.onclick = onClick;
        return b;
    }

    function updateMainUI() {
        const old = document.getElementById(CONTAINER_ID);
        if(old) old.remove();
        createMainUI();
    }

    // === 4. 聊天窗口 UI ===
    function openChatWindow(initialLoadingText) {
        let box = document.getElementById(BOX_ID);
        if (!box) {
            box = document.createElement('div');
            box.id = BOX_ID;
            box.style.cssText = `position: fixed; top: 10%; right: 10%; width: 500px; height: 75vh; background: white; z-index: 1000000; border-radius: 12px; box-shadow: 0 25px 80px rgba(0,0,0,0.5); font-family: -apple-system, sans-serif; border: 1px solid #ccc; display: flex; flex-direction: column;`;

            // Header
            const header = document.createElement('div');
            header.style.cssText = `padding:12px 20px;border-bottom:1px solid #eee;background:#f8f9fa;border-radius:12px 12px 0 0;display:flex;justify-content:space-between;align-items:center;flex-shrink:0;`;
            header.innerHTML = `<b id="ai-win-title">${t('ui_title')}</b>`;
            const close = document.createElement('button');
            close.innerText = t('btn_close');
            close.style.cssText = "border:none;background:none;font-size:16px;cursor:pointer;color:#666;";
            close.onclick = () => box.style.display = 'none';
            header.appendChild(close);
            box.appendChild(header);

            // Progress Bar
            const prog = document.createElement('div');
            prog.id = BOX_ID + '_prog';
            prog.className = 'ai-progress-container';
            prog.innerHTML = `<div class="ai-progress-bar"></div>`;
            box.appendChild(prog);

            // Chat Content Area
            const content = document.createElement('div');
            content.id = BOX_ID + '_content';
            content.style.cssText = `padding:20px;overflow-y:auto;flex-grow:1;background:#fff;display:flex;flex-direction:column;gap:5px;`;
            box.appendChild(content);

            // Input Area
            const inputArea = document.createElement('div');
            inputArea.className = 'chat-input-area';
            inputArea.innerHTML = `
                <textarea class="chat-textarea" id="ai-chat-input" placeholder="${t('input_placeholder')}"></textarea>
                <button class="chat-send-btn" id="ai-chat-send">${t('btn_send')}</button>
            `;
            box.appendChild(inputArea);

            document.body.appendChild(box);

            // Bind Events
            document.getElementById('ai-chat-send').onclick = sendUserMessage;
            document.getElementById('ai-chat-input').addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendUserMessage();
                }
            });
        }

        box.style.display = 'flex';
        // Clear history for new task
        const contentDiv = document.getElementById(BOX_ID + '_content');
        contentDiv.innerHTML = '';
        appendSystemMessage(initialLoadingText);

        // Disable input while loading
        toggleInput(false);
    }

    // === 5. 消息处理 ===
    function appendMessage(role, text) {
        const div = document.createElement('div');
        div.className = `chat-bubble chat-${role}`;

        if (role === 'ai') {
            // Markdown简单处理
            div.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
        } else {
            div.innerText = text;
        }

        document.getElementById(BOX_ID + '_content').appendChild(div);
        scrollToBottom();
    }

    function appendSystemMessage(text) {
        const div = document.createElement('div');
        div.className = 'chat-system';
        div.innerText = text;
        div.id = 'ai-sys-msg'; // 标记，方便更新
        document.getElementById(BOX_ID + '_content').appendChild(div);
        scrollToBottom();
    }

    function updateSystemMessage(text) {
        const div = document.getElementById('ai-sys-msg');
        if(div) div.innerText = text;
        else appendSystemMessage(text);
    }

    function scrollToBottom() {
        const c = document.getElementById(BOX_ID + '_content');
        c.scrollTop = c.scrollHeight;
    }

    function toggleInput(enabled) {
        const area = document.querySelector('.chat-input-area');
        if (enabled) {
            area.style.opacity = '1';
            area.style.pointerEvents = 'auto';
            setTimeout(() => document.getElementById('ai-chat-input').focus(), 100);
        } else {
            area.style.opacity = '0.5';
            area.style.pointerEvents = 'none';
        }
    }

    // === 6. 对话逻辑 ===
    async function sendUserMessage() {
        if (isGenerating) return;
        const input = document.getElementById('ai-chat-input');
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        appendMessage('user', text);
        toggleInput(false);
        isGenerating = true;

        // Add to history
        chatHistory.push({ role: 'user', parts: [{ text: text }] });

        // Call API
        try {
            await callGeminiAPI(chatHistory);
        } catch (e) {
            appendSystemMessage("Error: " + e.message);
            toggleInput(true);
            isGenerating = false;
        }
    }

    async function startNewChat(systemPrompt, initialData, taskName) {
        openChatWindow(taskName);
        chatHistory = []; // Reset
        isGenerating = true;

        // Construct Initial Prompt
        const firstPrompt = `${t('prompt_prefix')} ${t('prompt_lang')}\n\nTask: ${taskName}\n\nData Context:\n${initialData}`;

        chatHistory.push({ role: 'user', parts: [{ text: firstPrompt }] });

        try {
            await callGeminiAPI(chatHistory);
        } catch (e) {
            updateSystemMessage("Error: " + e.message);
            toggleInput(true); // Allow retry?
        }
    }

    async function callGeminiAPI(history) {
        if (!currentModel) {
            await initModelList(); // Try init if missing
            if(!currentModel) throw new Error("No model available");
        }

        // Add a temporary "Thinking..." bubble
        const thinkingId = 'ai-thinking-' + Date.now();
        const thinkingDiv = document.createElement('div');
        thinkingDiv.className = 'chat-bubble chat-ai';
        thinkingDiv.id = thinkingId;
        thinkingDiv.innerText = t('status_thinking');
        document.getElementById(BOX_ID + '_content').appendChild(thinkingDiv);
        scrollToBottom();

        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "POST",
                url: `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${API_KEY}`,
                headers: { "Content-Type": "application/json" },
                data: JSON.stringify({ contents: history }),
                onload: (res) => {
                    const thinkingEl = document.getElementById(thinkingId);
                    if(thinkingEl) thinkingEl.remove();

                    if (res.status === 200) {
                        try {
                            const responseText = JSON.parse(res.responseText).candidates[0].content.parts[0].text;
                            appendMessage('ai', responseText);
                            // Add response to history
                            chatHistory.push({ role: 'model', parts: [{ text: responseText }] });
                            toggleInput(true);
                            isGenerating = false;
                            resolve();
                        } catch (e) { reject(new Error("Parse Failed")); }
                    } else if (res.status === 429) {
                        reject(new Error(t('err_429')));
                    } else {
                        reject(new Error(`API Error ${res.status}`));
                    }
                },
                onerror: () => {
                    const thinkingEl = document.getElementById(thinkingId);
                    if(thinkingEl) thinkingEl.remove();
                    reject(new Error(t('err_net')));
                }
            });
        });
    }

    // === 7. 抓取逻辑 (并发) ===
    async function fetchBatchedParallel(topicId, postIds) {
        const BATCH_SIZE = 50;
        const chunks = [];
        for(let i=0; i<postIds.length; i+=BATCH_SIZE) chunks.push(postIds.slice(i,i+BATCH_SIZE));

        const total = chunks.length;
        let completed = 0;
        showProgress(true);

        const promises = chunks.map(chunkIds => {
            const q = chunkIds.map(id => `post_ids[]=${id}`).join('&');
            return fetchJson(`https://www.uscardforum.com/t/${topicId}/posts.json?include_raw=true&${q}`)
                .then(res => {
                    completed++;
                    updateProgressBar((completed / total) * 100);
                    let txt = "";
                    res.post_stream.posts.forEach(p => txt += `[${p.username}]: ${p.raw||p.cooked.replace(/<[^>]+>/g,'')}\n---\n`);
                    return txt;
                })
                .catch(() => "");
        });
        const results = await Promise.all(promises);
        showProgress(false);
        return results.join("");
    }

    // === 8. 业务处理入口 ===
    async function handleTopicFull() {
        openChatWindow("⏳ 初始化全帖抓取...");
        const meta = await fetchJson(window.location.href.split('?')[0] + ".json");
        const total = meta.post_stream.stream.length;
        if(total > 3000 && !confirm(`> 3000 posts. Continue?`)) { document.getElementById(BOX_ID).style.display='none'; return; }

        updateSystemMessage(`🚀 正在并发抓取 ${total} 楼...`);
        const content = await fetchBatchedParallel(meta.id, meta.post_stream.stream);

        startNewChat(t('prompt_prefix'), content, "深度全帖分析");
    }

    async function handleSearchUltra() {
        openChatWindow("🚀 启动究极搜索...");
        showProgress(true);
        try {
            const q = new URLSearchParams(window.location.search).get('q');
            const sData = await fetchJson(`https://www.uscardforum.com/search/query.json?term=${encodeURIComponent(q)}`);
            const topics = (sData.topics || []).slice(0, 10);

            let combined = `Query: ${q}\n\n`;
            for (let i = 0; i < topics.length; i++) {
                const t = topics[i];
                updateSystemMessage(`📖 读取 [${i+1}/10]: ${t.title}`);
                updateProgressBar(((i)/10)*100);
                try {
                    const meta = await fetchJson(`https://www.uscardforum.com/t/${t.id}.json`);
                    const ids = meta.post_stream.stream;
                    const target = ids.length <= 80 ? ids : [...new Set([...ids.slice(0, 40), ...ids.slice(ids.length - 40, ids.length)])];
                    const content = await fetchBatchedParallel(t.id, target);
                    combined += `\n=== Thread ${i+1}: ${t.title} ===\n${content}\n`;
                } catch (e) {}
            }
            showProgress(false);
            startNewChat(t('prompt_prefix'), combined, "究极搜索分析");
        } catch (e) { updateSystemMessage("Error: " + e.message); }
    }

    // 其他入口简化...
    function handleTopicFast() {
        const posts = document.querySelectorAll('.topic-post');
        let txt = ""; posts.forEach((p,i) => { if(i<40) txt += `[${p.querySelector('.username')?.innerText}]: ${p.querySelector('.cooked')?.innerText.substring(0,300)}\n` });
        startNewChat(t('prompt_prefix'), txt, "当前屏幕总结");
    }
    async function handleTopicMedium() {
        openChatWindow("⏳ 获取中度数据...");
        const meta = await fetchJson(window.location.href.split('?')[0] + ".json");
        const ids = meta.post_stream.stream;
        const target = ids.length <= 60 ? ids : [...new Set([...ids.slice(0, 30), ...ids.slice(ids.length - 30, ids.length)])];
        const content = await fetchBatchedParallel(meta.id, target);
        startNewChat(t('prompt_prefix'), content, "中度分析(首尾)");
    }
    function handleSearchFast() {
        const list = document.querySelectorAll('.fps-result');
        let txt = ""; list.forEach((l,i) => { if(i<20) txt += `${i+1}. ${l.innerText.replace(/\n/g,' ')}\n` });
        startNewChat(t('prompt_prefix'), txt, "搜索页屏幕总结");
    }
    async function handleSearchDeep() {
        openChatWindow("⏳ 获取 Top 50 标题...");
        const q = new URLSearchParams(window.location.search).get('q');
        const data = await fetchJson(`https://www.uscardforum.com/search/query.json?term=${encodeURIComponent(q)}`);
        let txt = `Query: ${q}\n\n`;
        data.topics.slice(0,50).forEach((t,i) => txt += `${i+1}. [${t.title}] (Replies:${t.posts_count})\n`);
        startNewChat(t('prompt_prefix'), txt, "深度标题分析");
    }

    // === Tools ===
    async function initModelList() {
        try {
            const res = await new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: "GET", url: `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`,
                    onload: r => r.status===200 ? resolve(JSON.parse(r.responseText)) : reject()
                });
            });
            availableModels = (res.models || []).filter(m => m.supportedGenerationMethods?.includes("generateContent")).map(m => m.name.replace('models/', ''));
            if (!currentModel || !availableModels.includes(currentModel)) {
                // Auto pick
                const prefs = ['gemini-1.5-flash-002', 'gemini-1.5-flash-001', 'gemini-1.5-flash', 'gemini-1.5-pro-002'];
                for (let p of prefs) if (availableModels.includes(p)) { currentModel = p; break; }
                if(!currentModel) currentModel = availableModels[0];
                GM_setValue('ai_model_selection', currentModel);
            }
            if(document.getElementById(CONTAINER_ID)) updateMainUI();
        } catch(e) {}
    }

    async function fetchJson(url) { return new Promise((res, rej) => GM_xmlhttpRequest({ method: "GET", url, onload: r => r.status==200?res(JSON.parse(r.responseText)):rej(new Error(r.status)), onerror: rej })); }

    function showProgress(show) {
        const el = document.querySelector('.ai-progress-container');
        if(el) el.style.display = show ? 'block' : 'none';
    }
    function updateProgressBar(percent) {
        const el = document.querySelector('.ai-progress-bar');
        if(el) el.style.width = `${percent}%`;
    }

})();
