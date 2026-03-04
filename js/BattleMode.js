/**
 * ==================== 糖果数学消消乐 - 对战模式 ====================
 * 包含：快速匹配、创建房间、加入房间、实时对战、聊天系统、AI对手
 * 依赖：utils.js (需要 I18n, SoundManager, Validators, GAME_CONSTANTS)
 * 
 * 版本：7.1.0 (匹配修复版)
 * 更新说明：
 * - 修复快速匹配无法匹配的问题（放宽匹配条件，添加强制匹配）
 * - 修复加入房间失败的问题（完善房间状态检查）
 * - 修复文字重影问题（优化CSS文本渲染）
 * - 添加匹配调试日志
 * - 优化ELO匹配算法
 * ============================================================
 */

class BattleMode {
    constructor(game) {
        this.game = game;
        this.matchQueue = [];
        this.room = {
            roomCode: null,
            battleId: null,
            playerRole: null, // 'player1' 或 'player2'
            opponentId: null,
            opponentName: null,
            opponentIsAI: false,
            aiDifficulty: 'medium',
            status: 'waiting',
            myTurn: false,
            roundTimer: null,
            channel: null,
            subscriptionId: null,
            gameActive: false,
            selectedCards: []
        };
        
        // 匹配系统状态
        this.matchTimeoutId = null;
        this.matchStartTime = null;
        this.queueStatusInterval = null;
        this.longWaitTimer = null;
        
        // 重连机制
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectTimer = null;
        
        // AI相关
        this.aiResponseTimer = null;
        this.aiMoveTimer = null;
        this.aiMoveRetryCount = 0;
        this.aiGlobalRetryCount = 0;
        this.aiResponsePending = false;
        this.localPollingTimer = null;
        
        // 并发控制
        this.cardClickProcessing = false;
        this.endTurnInProgress = false;
        this.rematchInProgress = false;
        this.scoreUpdateInProgress = false;
        this.isLeaving = false;
        this.isRefreshing = false;
        
        // 防抖
        this.clickDebounceTimer = null;
        this.lastClickTime = 0;
        this.CLICK_DEBOUNCE_TIME = 300;
        this.zoomTimer = null;
        this.refreshTimer = null;
        this.refreshCount = 0;
        
        // 信号量系统
        this.semaphores = {
            match: false,
            battle: false,
            score: false,
            turn: false,
            ai: false
        };
        
        // Promise追踪
        this.activePromises = new Set();
        this.promiseCounter = 0;
        this.promiseTimeouts = new Map();
        
        // 声音管理
        this.soundQueue = [];
        this.isPlayingSound = false;
        this.maxSoundQueueSize = 10;
        this.soundProcessTimer = null;
        this.lastWrongSoundTime = 0;
        
        // 内存存储
        this.memoryStorage = new Map();
        
        // DOM元素缓存
        this.cachedElements = null;
        
        // 观察者管理
        this.observers = {
            resize: null,
            mutation: null,
            intersection: null
        };
        
        // 事件处理器
        this.onlineHandler = null;
        this.offlineHandler = null;
        this.popStateHandler = null;
        this.visibilityHandler = null;
        this.beforeUnloadHandler = null;
        this.quickMatchHandler = null;
        this.joinRoomHandler = null;
        this.copyHandler = null;
        this.cancelHandler = null;
        this.sendHandler = null;
        this.chatKeyHandler = null;
        this.rematchHandler = null;
        this.closeHandler = null;
        this.confirmJoinHandler = null;
        this.cancelJoinHandler = null;
        this.gridClickHandler = null;
        this.gridTouchHandler = null;
        this.gridContextHandler = null;
        this.continueWaitingHandler = null;
        this.playWithAIHandler = null;
        
        // 常量定义
        this.constants = {
            MATCH_TIMEOUT: 30000,
            MAX_CHAT_MESSAGES: 100,
            ELO_K_FACTOR: 32,
            BASE_MATCH_RANGE: 400, // 增大基础匹配范围
            MAX_MATCH_RANGE: 800,  // 增大最大匹配范围
            AI_RESPONSE_DELAY: 1000,
            AI_MOVE_DELAY: 500,
            AI_MAX_RETRIES: 3,
            ROUND_TIME: 30,
            TIME_BONUS_FACTOR: 30, // 增大时间加成因子
            MAX_TIME_BONUS: 400,    // 增大最大时间加成
            LOCAL_STORAGE_KEY: 'candy_battle_local',
            STORAGE_EXPIRY: 3600000,
            MAX_REFRESH_COUNT: 3,
            REFRESH_DEBOUNCE: 300,
            SOUND_QUEUE_MAX: 10,
            WRONG_SOUND_COOLDOWN: 200,
            FORCE_MATCH_TIME: 10000 // 10秒后强制匹配
        };

        // 初始化
        this.setupPromiseErrorHandler();
        this.setupHistoryHandler();
        this.setupTabCommunication();
        this.setupZoomDetection();
        this.setupVisibilityHandler();
        this.setupBeforeUnloadHandler();
    }

    // ==================== 初始化 ====================

    init() {
        this.leaveBattle();
        this.bindEvents();
        this.setupReconnectionHandler();
        this.injectCandyStyles();
    }

    /**
     * 安全存储
     */
    safeStorage() {
        return {
            setItem: (key, value) => {
                try {
                    const testKey = '_test_' + Date.now();
                    localStorage.setItem(testKey, 'test');
                    localStorage.removeItem(testKey);
                    
                    localStorage.setItem(key, value);
                    return true;
                } catch (e) {
                    console.warn('localStorage不可用，使用内存存储:', e);
                    
                    if (!this.memoryStorage) this.memoryStorage = new Map();
                    
                    if (this.memoryStorage.size > 50) {
                        const oldestKey = this.memoryStorage.keys().next().value;
                        this.memoryStorage.delete(oldestKey);
                    }
                    
                    this.memoryStorage.set(key, value);
                    return false;
                }
            },
            getItem: (key) => {
                try {
                    return localStorage.getItem(key);
                } catch (e) {
                    return this.memoryStorage?.get(key) || null;
                }
            },
            removeItem: (key) => {
                try {
                    localStorage.removeItem(key);
                } catch (e) {
                    this.memoryStorage?.delete(key);
                }
            },
            clear: () => {
                try {
                    localStorage.clear();
                } catch (e) {
                    this.memoryStorage?.clear();
                }
            }
        };
    }

    /**
     * Promise追踪
     */
    trackPromise(promise, name = 'unnamed', timeout = 30000) {
        const id = ++this.promiseCounter;
        
        const timeoutPromise = new Promise((_, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Promise ${name} 超时 (${timeout}ms)`));
            }, timeout);
            
            if (!this.promiseTimeouts) this.promiseTimeouts = new Map();
            this.promiseTimeouts.set(id, timer);
        });
        
        const trackedPromise = Promise.race([promise, timeoutPromise])
            .finally(() => {
                this.activePromises.delete(trackedPromise);
                const timer = this.promiseTimeouts?.get(id);
                if (timer) {
                    clearTimeout(timer);
                    this.promiseTimeouts.delete(id);
                }
            });
        
        this.activePromises.add(trackedPromise);
        return trackedPromise;
    }

    /**
     * 清理AI资源
     */
    cleanupAIResources() {
        if (this.aiMoveTimer) {
            clearTimeout(this.aiMoveTimer);
            this.aiMoveTimer = null;
        }
        
        if (this.aiResponseTimer) {
            clearTimeout(this.aiResponseTimer);
            this.aiResponseTimer = null;
        }
        
        this.aiResponsePending = false;
        this.aiMoveRetryCount = 0;
        this.aiGlobalRetryCount = 0;
    }

    /**
     * 停止所有声音
     */
    stopAllSounds() {
        try {
            if (typeof SoundManager !== 'undefined') {
                if (SoundManager.stopAll && typeof SoundManager.stopAll === 'function') {
                    SoundManager.stopAll();
                } else if (SoundManager.stop && typeof SoundManager.stop === 'function') {
                    SoundManager.stop();
                }
            }
            
            document.querySelectorAll('audio').forEach(audio => {
                try {
                    audio.pause();
                    audio.currentTime = 0;
                } catch (e) {}
            });
            
            if (typeof Howl !== 'undefined' && Howler && Howler.stop) {
                Howler.stop();
            }
        } catch (error) {
            console.warn('停止声音失败:', error);
        }
    }

    /**
     * 暂停所有声音
     */
    pauseAllSounds() {
        try {
            if (typeof SoundManager !== 'undefined' && SoundManager.pauseAll && typeof SoundManager.pauseAll === 'function') {
                SoundManager.pauseAll();
            }
            document.querySelectorAll('audio').forEach(audio => {
                try {
                    audio.pause();
                } catch (e) {}
            });
        } catch (error) {
            console.warn('暂停声音失败:', error);
        }
    }

    /**
     * 恢复所有声音
     */
    resumeAllSounds() {
        try {
            if (typeof SoundManager !== 'undefined' && SoundManager.resumeAll && typeof SoundManager.resumeAll === 'function') {
                SoundManager.resumeAll();
            }
        } catch (error) {
            console.warn('恢复声音失败:', error);
        }
    }

    /**
     * 清除声音队列
     */
    clearSoundQueue() {
        this.soundQueue = [];
        this.isPlayingSound = false;
        this.lastWrongSoundTime = 0;
        if (this.soundProcessTimer) {
            clearTimeout(this.soundProcessTimer);
            this.soundProcessTimer = null;
        }
    }

    /**
     * 播放声音
     */
    playSound(soundName) {
        if (!this.room.gameActive) {
            return;
        }
        
        if (this.soundQueue.length > this.maxSoundQueueSize) {
            return;
        }
        
        if (soundName === 'wrong' && this.lastWrongSoundTime) {
            const now = Date.now();
            if (now - this.lastWrongSoundTime < this.constants.WRONG_SOUND_COOLDOWN) {
                return;
            }
            this.lastWrongSoundTime = now;
        }
        
        this.soundQueue.push(soundName);
        this.processSoundQueue();
    }

    /**
     * 处理声音队列
     */
    processSoundQueue() {
        if (this.isPlayingSound || this.soundQueue.length === 0) return;
        
        this.isPlayingSound = true;
        const soundName = this.soundQueue.shift();
        
        try {
            if (typeof SoundManager !== 'undefined' && SoundManager.play && typeof SoundManager.play === 'function') {
                const playPromise = Promise.resolve(SoundManager.play(soundName));
                
                this.soundProcessTimer = setTimeout(() => {
                    this.isPlayingSound = false;
                    this.processSoundQueue();
                }, 1000);
                
                playPromise
                    .finally(() => {
                        if (this.soundProcessTimer) {
                            clearTimeout(this.soundProcessTimer);
                            this.soundProcessTimer = null;
                        }
                        this.isPlayingSound = false;
                        this.processSoundQueue();
                    })
                    .catch(() => {
                        this.isPlayingSound = false;
                        this.processSoundQueue();
                    });
            } else {
                this.isPlayingSound = false;
                this.processSoundQueue();
            }
        } catch (error) {
            console.warn('播放声音失败:', error);
            this.isPlayingSound = false;
            this.processSoundQueue();
        }
    }

    /**
     * 注入糖果主题CSS（修复文字重影）
     */
    injectCandyStyles() {
        const styleId = 'candy-battle-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* 马卡龙色系 - 修复文字重影 */
            :root {
                --macaron-pink: #fce4e8;
                --macaron-peach: #ffe9e0;
                --macaron-mint: #e0f0e5;
                --macaron-lavender: #f0e6f2;
                --macaron-cream: #fff9e6;
                --macaron-rose: #f8d7e3;
            }

            * {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                -webkit-font-smoothing: antialiased; /* 修复文字重影 */
                -moz-osx-font-smoothing: grayscale;  /* 修复文字重影 */
                text-rendering: optimizeLegibility;   /* 修复文字重影 */
            }

            /* 卡片样式优化 */
            #battle-grid {
                display: grid;
                grid-template-columns: repeat(5, 1fr);
                gap: 15px;
                padding: 20px;
                background: linear-gradient(145deg, #fff9fc, #fff5f8);
                border: 2px solid #fad1db;
                border-radius: 40px;
                box-shadow: inset 0 2px 8px rgba(255, 200, 220, 0.2), 0 8px 0 #f5b8c7;
            }

            #battle-grid .number-card {
                background: linear-gradient(145deg, #ffffff, #fffafc);
                border: 2px solid #fad1db;
                border-radius: 25px;
                box-shadow: 0 4px 0 #f5b8c7, 0 6px 12px rgba(245, 184, 199, 0.15);
                color: #b28b99;
                font-size: 2.5rem;
                font-weight: 400;
                width: 90px;
                height: 90px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.25s ease;
                position: relative;
                animation: cardAppear 0.3s ease-out;
                font-family: 'Comic Sans MS', 'Chalkboard SE', 'Arial Rounded', cursive, sans-serif;
                -webkit-tap-highlight-color: transparent;
                touch-action: manipulation;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                text-shadow: none; /* 移除文字阴影解决重影 */
            }

            @keyframes cardAppear {
                from {
                    transform: scale(0) rotate(-180deg);
                    opacity: 0;
                }
                to {
                    transform: scale(1) rotate(0);
                    opacity: 1;
                }
            }

            #battle-grid .number-card:hover {
                transform: translateY(-3px);
                box-shadow: 0 7px 0 #f5b8c7, 0 10px 18px rgba(245, 184, 199, 0.2);
                background: linear-gradient(145deg, #ffffff, #fff0f5);
            }

            #battle-grid .number-card:active {
                transform: translateY(4px);
                box-shadow: 0 2px 0 #f5b8c7;
            }

            #battle-grid .number-card.selected {
                background: linear-gradient(145deg, #eaf5ed, #e0efe5);
                border-color: #b8d9c4;
                box-shadow: 0 4px 0 #9ec0aa, 0 6px 12px rgba(158, 192, 170, 0.15);
                color: #5c8b6f;
                transform: scale(1.05) translateY(-2px);
                animation: softPulse 2s ease-in-out infinite;
            }

            @keyframes softPulse {
                0%, 100% { box-shadow: 0 4px 0 #9ec0aa, 0 6px 12px rgba(158, 192, 170, 0.15); }
                50% { box-shadow: 0 4px 0 #9ec0aa, 0 10px 18px rgba(158, 192, 170, 0.25); }
            }

            #battle-grid .number-card.matched {
                opacity: 0.3;
                transform: scale(0.7);
                pointer-events: none;
                filter: grayscale(0.4);
                box-shadow: 0 2px 0 #ccc;
                border-color: #ccc;
                animation: vanish 0.3s ease-out;
            }

            @keyframes vanish {
                0% { transform: scale(1); opacity: 1; }
                100% { transform: scale(0); opacity: 0; }
            }

            /* 目标数字优化 */
            .battle-target {
                background: linear-gradient(145deg, #fef0d7, #fee9d1);
                border: 3px solid #fad1b3;
                border-radius: 70px;
                box-shadow: 0 5px 0 #e6b68f, 0 10px 20px rgba(230, 182, 143, 0.15);
                color: #b27a58;
                font-size: 5rem;
                font-weight: 400;
                width: 150px;
                height: 150px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 25px;
                animation: macaronGlow 4s ease-in-out infinite;
                font-family: 'Comic Sans MS', 'Chalkboard SE', 'Arial Rounded', cursive, sans-serif;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                text-shadow: none; /* 移除文字阴影解决重影 */
            }

            @keyframes macaronGlow {
                0%, 100% { opacity: 0.95; }
                50% { opacity: 1; box-shadow: 0 5px 0 #e6b68f, 0 15px 30px rgba(230, 182, 143, 0.2); }
            }

            /* 回合指示器优化 */
            .turn-indicator {
                background: linear-gradient(145deg, #fef5f8, #fef0f4);
                border: 2px solid #fad1db;
                border-radius: 50px;
                padding: 15px 30px;
                font-size: 1.5rem;
                font-weight: 500;
                color: #b28b99;
                box-shadow: 0 4px 0 #f5b8c7, 0 8px 15px rgba(245, 184, 199, 0.1);
                text-align: center;
                margin-bottom: 25px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }

            .turn-indicator .turn-text {
                display: inline-block;
                margin-right: 20px;
            }

            .turn-indicator .timer {
                background: white;
                border-radius: 40px;
                padding: 8px 20px;
                color: #b28b99;
                font-size: 1.8rem;
                font-weight: 500;
                box-shadow: inset 0 2px 5px rgba(0,0,0,0.03);
                border: 2px solid #fad1db;
                font-family: monospace;
            }

            .timer.warning {
                color: #e68b8b !important;
                animation: timerWarning 1s ease-in-out infinite;
            }

            @keyframes timerWarning {
                0%, 100% { transform: scale(1); background: #fff5f5; }
                50% { transform: scale(1.05); background: #ffe5e5; }
            }

            /* 玩家卡片优化 */
            .player-card {
                background: linear-gradient(145deg, #fef5f8, #fef0f4);
                border: 2px solid #fad1db;
                border-radius: 40px;
                padding: 20px;
                box-shadow: 0 4px 0 #f5b8c7, 0 8px 15px rgba(245, 184, 199, 0.1);
                transition: all 0.3s ease;
            }

            .player-card.active {
                border-color: #b8d9c4;
                box-shadow: 0 4px 0 #9ec0aa, 0 8px 15px rgba(158, 192, 170, 0.15);
                transform: translateY(-3px);
            }

            .player-avatar {
                width: 70px;
                height: 70px;
                border-radius: 35px;
                background: linear-gradient(145deg, #fef0f4, #fde8ef);
                border: 2px solid #fad1db;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 2.5rem;
                color: #b28b99;
                box-shadow: 0 3px 0 #f5b8c7;
                margin-bottom: 10px;
            }

            .player-name {
                font-size: 1.2rem;
                font-weight: 500;
                color: #b28b99;
                margin-bottom: 10px;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }

            .player-score {
                font-size: 2rem;
                font-weight: 500;
                color: #b28b99;
                font-family: 'Comic Sans MS', 'Chalkboard SE', 'Arial Rounded', cursive, sans-serif;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }

            /* 进度条优化 */
            .progress-bar {
                background: rgba(245, 184, 199, 0.1);
                border: 2px solid #fad1db;
                border-radius: 25px;
                height: 25px;
                overflow: hidden;
                box-shadow: inset 0 1px 4px rgba(0,0,0,0.05);
                margin: 10px 0;
            }

            .progress-fill {
                height: 100%;
                border-radius: 25px;
                transition: width 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
                position: relative;
                overflow: hidden;
            }

            .progress-fill.player1 {
                background: linear-gradient(90deg, #fed9b0, #fecbad, #febdab);
            }

            .progress-fill.player2 {
                background: linear-gradient(90deg, #c5e5d0, #b8ddc5, #abd5ba);
            }

            .progress-fill::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
                animation: shimmer 2s infinite;
            }

            @keyframes shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }

            /* 聊天区域优化 */
            .chat-container {
                background: linear-gradient(145deg, #fef5f8, #fef0f4);
                border: 2px solid #fad1db;
                border-radius: 40px;
                padding: 20px;
                box-shadow: inset 0 2px 8px rgba(245, 184, 199, 0.1), 0 4px 0 #f5b8c7;
                margin-top: 20px;
            }

            .chat-messages {
                background: rgba(255, 255, 255, 0.7);
                border-radius: 30px;
                padding: 15px;
                min-height: 180px;
                max-height: 250px;
                overflow-y: auto;
                border: 2px solid #fad1db;
                margin-bottom: 15px;
                -webkit-overflow-scrolling: touch;
            }

            .chat-messages::-webkit-scrollbar {
                width: 8px;
            }

            .chat-messages::-webkit-scrollbar-track {
                background: #fef0f4;
                border-radius: 10px;
            }

            .chat-messages::-webkit-scrollbar-thumb {
                background: #fad1db;
                border-radius: 10px;
                border: 2px solid #fef0f4;
            }

            .message {
                margin: 10px 0;
                padding: 12px 18px;
                border-radius: 25px;
                max-width: 85%;
                word-wrap: break-word;
                font-size: 1rem;
                line-height: 1.4;
                animation: messageAppear 0.2s ease-out;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }

            @keyframes messageAppear {
                from {
                    opacity: 0;
                    transform: translateY(10px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .message.self {
                background: linear-gradient(145deg, #eaf5ed, #e0efe5);
                border-radius: 25px 25px 5px 25px;
                margin-left: auto;
                color: #5c8b6f;
                border: 2px solid #b8d9c4;
                box-shadow: 0 2px 0 #9ec0aa;
            }

            .message.opponent {
                background: linear-gradient(145deg, #fef0f4, #fde8ef);
                border-radius: 25px 25px 25px 5px;
                margin-right: auto;
                color: #b28b99;
                border: 2px solid #fad1db;
                box-shadow: 0 2px 0 #f5b8c7;
            }

            .message.system {
                background: linear-gradient(145deg, #f5ebf7, #f0e4f2);
                border-radius: 30px;
                margin: 8px auto;
                text-align: center;
                color: #9b7aa3;
                border: 2px solid #e0c9e5;
                font-style: italic;
                box-shadow: 0 2px 0 #c9aed0;
                max-width: 90%;
            }

            .message-sender {
                font-weight: 500;
                margin-right: 8px;
                color: inherit;
            }

            .chat-input-area {
                display: flex;
                gap: 10px;
                align-items: center;
            }

            .chat-input-area input {
                flex: 1;
                padding: 15px 20px;
                border: 2px solid #fad1db;
                border-radius: 40px;
                font-size: 1rem;
                background: white;
                box-shadow: inset 0 2px 5px rgba(0,0,0,0.02), 0 3px 0 #f5b8c7;
                transition: all 0.2s ease;
                color: #b28b99;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }

            .chat-input-area input:focus {
                outline: none;
                border-color: #f5b8c7;
                box-shadow: inset 0 2px 5px rgba(0,0,0,0.02), 0 4px 0 #f5b8c7;
                transform: translateY(-1px);
            }

            .chat-input-area input:disabled {
                opacity: 0.6;
                background: #f9f9f9;
                box-shadow: 0 2px 0 #ddd;
                border-color: #ddd;
            }

            /* 按钮优化 */
            .candy-btn {
                background: linear-gradient(145deg, #fef0f4, #fde8ef);
                border: none;
                border-radius: 50px;
                padding: 15px 30px;
                font-size: 1.2rem;
                font-weight: 500;
                color: #b28b99;
                cursor: pointer;
                box-shadow: 0 3px 0 #f5b8c7, 0 6px 12px rgba(245, 184, 199, 0.1);
                transition: all 0.2s ease;
                border: 2px solid #fad1db;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
                -webkit-tap-highlight-color: transparent;
                touch-action: manipulation;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }

            .candy-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 0 #f5b8c7, 0 8px 15px rgba(245, 184, 199, 0.15);
            }

            .candy-btn:active {
                transform: translateY(3px);
                box-shadow: 0 1px 0 #f5b8c7;
            }

            .candy-btn.primary {
                background: linear-gradient(145deg, #fef0d7, #fee9d1);
                border-color: #fad1b3;
                box-shadow: 0 3px 0 #e6b68f;
                color: #b27a58;
            }

            .candy-btn.secondary {
                background: linear-gradient(145deg, #e0f0e5, #d6eadc);
                border-color: #b8d9c4;
                box-shadow: 0 3px 0 #9ec0aa;
                color: #5c8b6f;
            }

            .candy-btn.small {
                padding: 10px 20px;
                font-size: 1rem;
            }

            .candy-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: translateY(0);
                box-shadow: 0 2px 0 #ddd;
                border-color: #ddd;
            }

            /* 等待动画 */
            .waiting-spinner {
                display: inline-block;
                width: 50px;
                height: 50px;
                border: 4px solid #fad1db;
                border-top-color: #f5b8c7;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 20px auto;
            }

            .waiting-spinner-small {
                display: inline-block;
                width: 20px;
                height: 20px;
                border: 3px solid #fad1db;
                border-top-color: #f5b8c7;
                border-radius: 50%;
                animation: spinSmall 1s linear infinite;
                margin-right: 8px;
            }

            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            @keyframes spinSmall {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            /* 结果页面优化 */
            .battle-result {
                text-align: center;
                padding: 30px;
                background: linear-gradient(145deg, #fef5f8, #fef0f4);
                border-radius: 60px;
                border: 3px solid #fad1db;
                box-shadow: 0 8px 0 #f5b8c7, 0 15px 25px rgba(245, 184, 199, 0.15);
            }

            .result-title {
                font-size: 3rem;
                margin-bottom: 30px;
                animation: resultPop 0.5s ease-out;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }

            @keyframes resultPop {
                0% { transform: scale(0); }
                80% { transform: scale(1.1); }
                100% { transform: scale(1); }
            }

            .result-scores {
                display: flex;
                justify-content: center;
                gap: 50px;
                margin: 30px 0;
            }

            .result-score-card {
                background: white;
                border-radius: 40px;
                padding: 25px;
                min-width: 150px;
                border: 2px solid #fad1db;
                box-shadow: 0 4px 0 #f5b8c7;
            }

            .result-score-card.winner {
                border-color: #b8d9c4;
                box-shadow: 0 4px 0 #9ec0aa;
                background: linear-gradient(145deg, #f0f9f2, #e8f2ea);
            }

            .result-score {
                font-size: 3.5rem;
                font-weight: 500;
                color: #b28b99;
                font-family: 'Comic Sans MS', 'Chalkboard SE', 'Arial Rounded', cursive, sans-serif;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }

            .winner .result-score {
                color: #5c8b6f;
            }

            .room-code-hint {
                display: block;
                font-size: 0.8rem;
                color: #b28b99;
                margin-top: 5px;
                cursor: pointer;
                transition: color 0.2s;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }

            .room-code-hint:hover {
                color: #f5b8c7;
            }

            .battle-container.compact #battle-grid .number-card {
                width: 60px;
                height: 60px;
                font-size: 2rem;
            }

            .battle-container.compact .battle-target {
                width: 100px;
                height: 100px;
                font-size: 3.5rem;
            }

            .battle-container.compact .candy-btn {
                padding: 12px 20px;
                font-size: 1rem;
            }

            @media (max-width: 768px) {
                #battle-grid .number-card {
                    width: 60px;
                    height: 60px;
                    font-size: 2rem;
                }

                .battle-target {
                    width: 100px;
                    height: 100px;
                    font-size: 3.5rem;
                }

                .candy-btn {
                    padding: 12px 20px;
                    font-size: 1rem;
                }
            }

            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;

        document.head.appendChild(style);
    }

    /**
     * 移除所有事件监听器
     */
    removeAllEventListeners() {
        const listeners = [
            { id: 'quick-match-btn', event: 'click', handler: this.quickMatchHandler },
            { id: 'join-room-btn', event: 'click', handler: this.joinRoomHandler },
            { id: 'copy-room-code', event: 'click', handler: this.copyHandler },
            { id: 'cancel-match', event: 'click', handler: this.cancelHandler },
            { id: 'send-message', event: 'click', handler: this.sendHandler },
            { id: 'chat-input', event: 'keypress', handler: this.chatKeyHandler },
            { id: 'rematch-btn', event: 'click', handler: this.rematchHandler },
            { id: 'close-battle-btn', event: 'click', handler: this.closeHandler },
            { id: 'confirm-join', event: 'click', handler: this.confirmJoinHandler },
            { id: 'cancel-join', event: 'click', handler: this.cancelJoinHandler },
            { id: 'continue-waiting-btn', event: 'click', handler: this.continueWaitingHandler },
            { id: 'play-with-ai-btn', event: 'click', handler: this.playWithAIHandler }
        ];

        listeners.forEach(({ id, event, handler }) => {
            if (handler) {
                const el = document.getElementById(id);
                if (el) {
                    el.removeEventListener(event, handler);
                }
            }
        });

        const battleGrid = document.getElementById('battle-grid');
        if (battleGrid) {
            if (this.gridClickHandler) {
                battleGrid.removeEventListener('click', this.gridClickHandler);
            }
            if (this.gridTouchHandler) {
                battleGrid.removeEventListener('touchstart', this.gridTouchHandler);
            }
            if (this.gridContextHandler) {
                battleGrid.removeEventListener('contextmenu', this.gridContextHandler);
            }
        }
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        this.removeAllEventListeners();

        const quickMatchBtn = document.getElementById('quick-match-btn');
        if (quickMatchBtn) {
            this.quickMatchHandler = () => this.quickMatch();
            quickMatchBtn.addEventListener('click', this.quickMatchHandler);
        }

        const joinRoomBtn = document.getElementById('join-room-btn');
        if (joinRoomBtn) {
            this.joinRoomHandler = () => this.showJoinModal();
            joinRoomBtn.addEventListener('click', this.joinRoomHandler);
        }

        const copyBtn = document.getElementById('copy-room-code');
        if (copyBtn) {
            this.copyHandler = () => this.copyRoomCode();
            copyBtn.addEventListener('click', this.copyHandler);
        }

        const cancelMatch = document.getElementById('cancel-match');
        if (cancelMatch) {
            this.cancelHandler = () => this.cancelMatch();
            cancelMatch.addEventListener('click', this.cancelHandler);
        }

        const sendMessage = document.getElementById('send-message');
        if (sendMessage) {
            this.sendHandler = () => this.sendChatMessage();
            sendMessage.addEventListener('click', this.sendHandler);
        }

        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            this.chatKeyHandler = (e) => {
                if (e.key === 'Enter') {
                    this.sendChatMessage();
                }
            };
            chatInput.addEventListener('keypress', this.chatKeyHandler);
        }

        const rematchBtn = document.getElementById('rematch-btn');
        if (rematchBtn) {
            this.rematchHandler = () => this.rematch();
            rematchBtn.addEventListener('click', this.rematchHandler);
        }

        const closeBattleBtn = document.getElementById('close-battle-btn');
        if (closeBattleBtn) {
            this.closeHandler = () => this.closeBattle();
            closeBattleBtn.addEventListener('click', this.closeHandler);
        }

        const confirmJoin = document.getElementById('confirm-join');
        if (confirmJoin) {
            this.confirmJoinHandler = () => this.confirmJoin();
            confirmJoin.addEventListener('click', this.confirmJoinHandler);
        }

        const cancelJoin = document.getElementById('cancel-join');
        if (cancelJoin) {
            this.cancelJoinHandler = () => this.closeJoinModal();
            cancelJoin.addEventListener('click', this.cancelJoinHandler);
        }

        const battleGrid = document.getElementById('battle-grid');
        if (battleGrid) {
            this.gridClickHandler = (e) => this.handleBattleCardClick(e);
            this.gridTouchHandler = (e) => {
                e.preventDefault();
                this.handleBattleCardClick(e);
            };
            this.gridContextHandler = (e) => e.preventDefault();
            
            battleGrid.addEventListener('click', this.gridClickHandler);
            battleGrid.addEventListener('touchstart', this.gridTouchHandler, { passive: false });
            battleGrid.addEventListener('contextmenu', this.gridContextHandler);
        }
    }

    /**
     * 设置页面可见性处理
     */
    setupVisibilityHandler() {
        if (this.visibilityHandler) {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
        }
        
        this.visibilityHandler = () => {
            if (document.hidden) {
                this.pauseAllSounds();
            } else {
                this.resumeAllSounds();
            }
        };
        
        document.addEventListener('visibilitychange', this.visibilityHandler);
    }

    /**
     * 设置页面卸载处理
     */
    setupBeforeUnloadHandler() {
        this.beforeUnloadHandler = (e) => {
            if (this.room.gameActive) {
                this.saveLocalBattleState();
                
                e.preventDefault();
                e.returnValue = '对战正在进行，确定要离开吗？';
                return '对战正在进行，确定要离开吗？';
            }
        };
        
        window.addEventListener('beforeunload', this.beforeUnloadHandler);
    }

    /**
     * 设置断线重连
     */
    setupReconnectionHandler() {
        if (this.onlineHandler) {
            window.removeEventListener('online', this.onlineHandler);
        }
        if (this.offlineHandler) {
            window.removeEventListener('offline', this.offlineHandler);
        }
        
        this.onlineHandler = () => {
            this.showFeedback('网络已连接', '#4CAF50');
            if (this.room.status === 'playing' && this.room.battleId && !this.room.opponentIsAI) {
                this.attemptReconnect();
            }
        };
        
        this.offlineHandler = () => {
            this.showFeedback('网络已断开，正在使用离线模式', '#ffa500');
            if (!this.room.opponentIsAI && this.room.status === 'playing') {
                this.switchToOfflineMode();
            }
        };
        
        window.addEventListener('online', this.onlineHandler);
        window.addEventListener('offline', this.offlineHandler);
    }

    /**
     * 设置历史状态处理
     */
    setupHistoryHandler() {
        this.originalHash = window.location.hash;
        
        this.popStateHandler = (e) => {
            if (this.room.gameActive || this.room.status === 'playing') {
                e.preventDefault();
                
                if (confirm('当前对战正在进行，确定要离开吗？')) {
                    this.stopAllSounds();
                    this.leaveBattle();
                    if (this.game.ui) {
                        this.game.ui.closeModal('battle-modal');
                    }
                    window.location.hash = this.originalHash;
                } else {
                    history.pushState(null, null, window.location.href);
                }
            }
        };
        
        window.addEventListener('popstate', this.popStateHandler);
    }

    /**
     * 设置标签页通信
     */
    setupTabCommunication() {
        try {
            this.broadcastChannel = new BroadcastChannel('candy_battle');
            
            this.broadcastChannel.onmessage = (event) => {
                const { type, data } = event.data;
                
                if (type === 'BATTLE_STARTED' && data.userId === this.game.state?.currentUser?.id) {
                    if (this.room.status !== 'playing') {
                        this.showFeedback('您已在其他标签页开始对战', '#ffa500');
                        this.leaveBattle();
                        if (this.game.ui) {
                            this.game.ui.closeModal('battle-modal');
                        }
                    }
                }
            };
        } catch (e) {
            console.warn('BroadcastChannel不可用', e);
        }
    }

    /**
     * 设置缩放检测
     */
    setupZoomDetection() {
        this.checkZoom();
        window.addEventListener('resize', () => {
            if (this.zoomTimer) clearTimeout(this.zoomTimer);
            this.zoomTimer = setTimeout(() => this.checkZoom(), 100);
        });
    }

    checkZoom() {
        const zoom = Math.round(window.devicePixelRatio * 100);
        const zoomWarning = document.getElementById('zoom-warning');
        
        if (zoom > 150 || zoom < 80) {
            if (!zoomWarning) {
                const warning = document.createElement('div');
                warning.id = 'zoom-warning';
                warning.style.cssText = `
                    position: fixed;
                    top: 10px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: #e68b8b;
                    color: white;
                    padding: 10px 20px;
                    border-radius: 30px;
                    z-index: 10000;
                    font-size: 14px;
                    box-shadow: 0 4px 10px rgba(0,0,0,0.1);
                    -webkit-font-smoothing: antialiased;
                    -moz-osx-font-smoothing: grayscale;
                `;
                warning.textContent = '检测到页面缩放可能影响显示，建议重置到100%';
                document.body.appendChild(warning);
                
                setTimeout(() => {
                    warning.remove();
                }, 5000);
            }
        } else {
            if (zoomWarning) zoomWarning.remove();
        }
    }

    /**
     * 设置布局观察者
     */
    setupLayoutObserver() {
        if (this.observers.resize) return;
        
        const battleContainer = document.querySelector('.battle-container');
        if (!battleContainer) return;
        
        this.observers.resize = new ResizeObserver(entries => {
            for (let entry of entries) {
                const width = entry.contentRect.width;
                if (width < 600) {
                    battleContainer.classList.add('compact');
                } else {
                    battleContainer.classList.remove('compact');
                }
            }
        });
        
        this.observers.resize.observe(battleContainer);
    }

    /**
     * Promise错误处理
     */
    setupPromiseErrorHandler() {
        const asyncMethods = [
            'quickMatch', 'joinQueue', 'createBattleRoom', 'startBattle',
            'checkBattleMatch', 'updateBattleScore', 'endTurn', 'endBattle',
            'sendChatMessage', 'rematch', 'attemptReconnect', 'confirmJoin'
        ];
        
        asyncMethods.forEach(methodName => {
            const originalMethod = this[methodName];
            if (originalMethod && typeof originalMethod === 'function') {
                this[methodName] = async (...args) => {
                    try {
                        return await this.trackPromise(originalMethod.apply(this, args), methodName);
                    } catch (error) {
                        console.error(`方法 ${methodName} 执行失败:`, error);
                        this.showFeedback('操作失败，请重试', '#ff4444');
                        return null;
                    }
                };
            }
        });
    }

    /**
     * 获取信号量
     */
    async acquireSemaphore(name, timeout = 5000) {
        const startTime = Date.now();
        while (this.semaphores[name]) {
            if (Date.now() - startTime > timeout) {
                throw new Error(`获取信号量超时: ${name}`);
            }
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        this.semaphores[name] = true;
        return true;
    }

    releaseSemaphore(name) {
        this.semaphores[name] = false;
    }

    showFeedback(message, color = '#4CAF50') {
        if (this.game?.ui) {
            this.game.ui.showFeedback(message, color);
        }
    }

    t(key) {
        try {
            if (typeof I18n !== 'undefined' && I18n.t) {
                return I18n.t(key);
            }
        } catch (error) {
            console.warn('I18n不可用');
        }
        
        const defaults = {
            'win': '胜利',
            'lose': '失败',
            'yourTurn': '你的回合',
            'opponentTurn': '对手回合'
        };
        return defaults[key] || key;
    }

    isSupabaseAvailable() {
        return this.game.state && 
               this.game.state.supabaseReady && 
               this.game.state.supabase && 
               navigator.onLine;
    }

    /**
     * 获取玩家分数元素
     */
    getMyScoreElement() {
        if (this.room.opponentIsAI) {
            return document.getElementById('player1-score');
        }
        return this.room.playerRole === 'player1' ? 
            document.getElementById('player1-score') : 
            document.getElementById('player2-score');
    }

    /**
     * 获取对手分数元素
     */
    getOpponentScoreElement() {
        if (this.room.opponentIsAI) {
            return document.getElementById('player2-score');
        }
        return this.room.playerRole === 'player1' ? 
            document.getElementById('player2-score') : 
            document.getElementById('player1-score');
    }

    /**
     * 显示房间码
     */
    showRoomCode() {
        const roomCodeSpan = document.getElementById('room-code');
        if (roomCodeSpan && this.room.roomCode) {
            roomCodeSpan.textContent = this.room.roomCode;
            
            const oldHint = document.querySelector('.room-code-hint');
            if (oldHint) oldHint.remove();
            
            const copyHint = document.createElement('small');
            copyHint.className = 'room-code-hint';
            copyHint.textContent = '点击可复制';
            copyHint.onclick = () => this.copyRoomCode();
            
            roomCodeSpan.parentNode.appendChild(copyHint);
        }
    }

    /**
     * 禁用聊天输入
     */
    disableChatInput(disabled = true) {
        const chatInput = document.getElementById('chat-input');
        const sendButton = document.getElementById('send-message');
        
        if (chatInput) {
            chatInput.disabled = disabled;
            chatInput.placeholder = disabled ? '对战已结束' : '输入消息...';
        }
        if (sendButton) {
            sendButton.disabled = disabled;
        }
    }

    /**
     * 更新进度条样式
     */
    updateProgressBars() {
        const player1Progress = document.getElementById('player1-progress');
        const player2Progress = document.getElementById('player2-progress');
        
        if (player1Progress) {
            player1Progress.classList.add('player1');
        }
        if (player2Progress) {
            player2Progress.classList.add('player2');
        }
    }

    /**
     * 开始心跳检测
     */
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        this.heartbeatInterval = setInterval(() => {
            this.checkConnection();
        }, 30000);
    }

    async checkConnection() {
        if (!this.isSupabaseAvailable() || !this.room.battleId || this.room.opponentIsAI) {
            return;
        }
        
        try {
            const { error } = await this.game.state.supabase
                .from('candy_math_battles')
                .select('id')
                .eq('id', this.room.battleId)
                .limit(1)
                .maybeSingle();
                
            if (error) {
                console.warn('连接检测失败，尝试重连:', error);
                this.handleConnectionLost();
            }
        } catch (error) {
            console.warn('连接检测异常:', error);
            this.handleConnectionLost();
        }
    }

    handleConnectionLost() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.showFeedback('连接丢失，请检查网络', '#ff4444');
            return;
        }
        
        this.reconnectAttempts++;
        
        if (this.room.battleId) {
            this.subscribeToBattle(this.room.battleId);
        }
    }

    /**
     * 同步分数
     */
    async syncScores() {
        if (!this.isSupabaseAvailable() || this.room.opponentIsAI) return;
        
        try {
            const { data: battle } = await this.game.state.supabase
                .from('candy_math_battles')
                .select('player1_score, player2_score, player1_progress, player2_progress')
                .eq('id', this.room.battleId)
                .single();
                
            if (battle) {
                const localMyScore = parseInt(this.getMyScoreElement()?.textContent) || 0;
                const localOpponentScore = parseInt(this.getOpponentScoreElement()?.textContent) || 0;
                
                const serverMyScore = this.room.playerRole === 'player1' ? 
                    battle.player1_score : battle.player2_score;
                const serverOpponentScore = this.room.playerRole === 'player1' ? 
                    battle.player2_score : battle.player1_score;
                
                if (localMyScore !== serverMyScore) {
                    const correctScore = Math.max(localMyScore, serverMyScore);
                    this.getMyScoreElement().textContent = correctScore;
                }
                
                if (localOpponentScore !== serverOpponentScore) {
                    const correctScore = Math.max(localOpponentScore, serverOpponentScore);
                    this.getOpponentScoreElement().textContent = correctScore;
                }
            }
        } catch (error) {
            console.error('同步分数失败:', error);
        }
    }

    startScoreSync() {
        this.scoreSyncInterval = setInterval(() => {
            this.syncScores();
        }, 10000);
    }

    // ==================== 匹配系统 ====================

    async quickMatch() {
        return this.trackPromise(this._quickMatch(), 'quickMatch');
    }

    async _quickMatch() {
        try {
            await this.acquireSemaphore('match');
            
            console.log('开始快速匹配');
            
            if (!this.game.auth || !this.game.auth.isLoggedIn()) {
                this.showFeedback('请先登录', '#ff4444');
                if (this.game.auth) {
                    this.game.auth.showAuthModal('login');
                }
                return;
            }

            this.cleanupMatch();

            if (this.game.ui) {
                this.game.ui.openModal('battle-modal');
            }
            
            const waitingDiv = document.getElementById('battle-waiting');
            const activeDiv = document.getElementById('battle-active');
            const resultDiv = document.getElementById('battle-result');
            
            if (waitingDiv) waitingDiv.style.display = 'block';
            if (activeDiv) activeDiv.style.display = 'none';
            if (resultDiv) resultDiv.style.display = 'none';

            const roomCode = this.generateRoomCode();
            this.room.roomCode = roomCode;
            const roomCodeSpan = document.getElementById('room-code');
            if (roomCodeSpan) roomCodeSpan.textContent = roomCode;

            this.showMatchWaitingUI();

            this.matchStartTime = Date.now();

            console.log('加入匹配队列:', this.game.state.currentUser);
            
            await this.joinQueue({
                id: this.game.state.currentUser.id,
                name: this.game.state.currentUser.name
            });

            console.log('当前队列人数:', this.matchQueue.length);

            this.longWaitTimer = setTimeout(() => {
                this.longWaitTimer = null;
                if (this.matchQueue.length > 0) {
                    this.showLongWaitSuggestion();
                }
            }, 15000);

            this.matchTimeoutId = setTimeout(() => {
                console.log('匹配超时');
                this.handleMatchTimeout();
            }, this.constants.MATCH_TIMEOUT);

            this.startQueueStatusUpdate();
            this.pushBattleState();
            this.setupLayoutObserver();
            
        } finally {
            this.releaseSemaphore('match');
        }
    }

    pushBattleState() {
        history.pushState({ battle: true }, null, window.location.href);
    }

    /**
     * 显示匹配等待界面
     */
    showMatchWaitingUI() {
        const waitingDiv = document.getElementById('battle-waiting');
        if (!waitingDiv) return;

        const oldHint = document.getElementById('match-waiting-hint');
        if (oldHint) oldHint.remove();

        const hintDiv = document.createElement('div');
        hintDiv.id = 'match-waiting-hint';
        hintDiv.style.cssText = `
            margin-top: 15px;
            padding: 15px;
            background: linear-gradient(145deg, #fef5f8, #fef0f4);
            border-radius: 30px;
            border: 2px solid #fad1db;
            box-shadow: 0 4px 0 #f5b8c7;
        `;

        const statusContainer = document.createElement('div');
        statusContainer.style.cssText = 'margin-bottom: 10px; display: flex; align-items: center; justify-content: center;';

        const spinner = document.createElement('span');
        spinner.className = 'waiting-spinner-small';
        statusContainer.appendChild(spinner);

        const statusText = document.createElement('span');
        statusText.id = 'match-status-text';
        statusText.style.cssText = 'font-size: 1.2rem; font-weight: 500; color: #b28b99; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;';
        statusText.textContent = '正在寻找对手...';
        statusContainer.appendChild(statusText);

        hintDiv.appendChild(statusContainer);

        const queueStatus = document.createElement('div');
        queueStatus.id = 'queue-status';
        queueStatus.style.cssText = 'font-size: 1rem; color: #b28b99; text-align: center; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;';
        queueStatus.textContent = '当前排队人数: ';

        const queueCount = document.createElement('span');
        queueCount.id = 'queue-count';
        queueCount.style.cssText = 'font-weight: 500; color: #f5b8c7;';
        queueCount.textContent = '1';
        queueStatus.appendChild(queueCount);

        hintDiv.appendChild(queueStatus);

        const waitTimeDiv = document.createElement('div');
        waitTimeDiv.style.cssText = 'font-size: 0.9rem; color: #b28b99; margin-top: 8px; text-align: center; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;';
        waitTimeDiv.textContent = '等待时间: ';

        const waitTime = document.createElement('span');
        waitTime.id = 'wait-time';
        waitTime.style.cssText = 'font-weight: 500;';
        waitTime.textContent = '0';
        waitTimeDiv.appendChild(waitTime);
        waitTimeDiv.appendChild(document.createTextNode('秒'));

        hintDiv.appendChild(waitTimeDiv);

        waitingDiv.appendChild(hintDiv);
    }

    /**
     * 显示长时间等待建议
     */
    showLongWaitSuggestion() {
        const waitingDiv = document.getElementById('battle-waiting');
        if (!waitingDiv) return;
        
        if (document.getElementById('long-wait-suggestion')) return;
        
        const suggestion = document.createElement('div');
        suggestion.id = 'long-wait-suggestion';
        suggestion.style.cssText = `
            margin-top: 15px;
            padding: 10px;
            background: #fff3e0;
            border-radius: 20px;
            border: 2px solid #e6b68f;
            color: #b27a58;
            font-size: 0.9rem;
            text-align: center;
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
        `;
        
        const text = document.createTextNode('⏳ 等待时间较长，您可以：');
        suggestion.appendChild(text);
        
        const continueBtn = document.createElement('button');
        continueBtn.className = 'candy-btn small';
        continueBtn.style.cssText = 'margin: 0 5px;';
        continueBtn.textContent = '继续等待';
        continueBtn.onclick = () => this.continueWaiting();
        suggestion.appendChild(continueBtn);
        
        const aiBtn = document.createElement('button');
        aiBtn.className = 'candy-btn small secondary';
        aiBtn.style.cssText = 'margin: 0 5px;';
        aiBtn.textContent = '与AI对战';
        aiBtn.onclick = () => {
            this.continueWaiting();
            this.startAIBattle();
        };
        suggestion.appendChild(aiBtn);
        
        waitingDiv.appendChild(suggestion);
    }

    /**
     * 继续等待
     */
    continueWaiting() {
        const suggestion = document.getElementById('long-wait-suggestion');
        if (suggestion) suggestion.remove();
    }

    startQueueStatusUpdate() {
        if (this.queueStatusInterval) {
            clearInterval(this.queueStatusInterval);
        }
        
        this.queueStatusInterval = setInterval(() => {
            this.updateQueueStatus();
        }, 1000);
    }

    updateQueueStatus() {
        const queueCount = document.getElementById('queue-count');
        if (queueCount) {
            queueCount.textContent = this.matchQueue.length;
        }

        const waitTimeSpan = document.getElementById('wait-time');
        if (waitTimeSpan && this.matchStartTime) {
            const waitSeconds = Math.floor((Date.now() - this.matchStartTime) / 1000);
            waitTimeSpan.textContent = waitSeconds;
        }

        const matchStatus = document.getElementById('match-status-text');
        if (matchStatus) {
            if (this.matchQueue.length >= 2) {
                matchStatus.textContent = '🎉 找到对手！准备开始对战...';
            } else if (this.matchQueue.length === 1) {
                matchStatus.textContent = '⏳ 等待其他玩家加入...';
            }
        }
    }

    stopQueueStatusUpdate() {
        if (this.queueStatusInterval) {
            clearInterval(this.queueStatusInterval);
            this.queueStatusInterval = null;
        }
    }

    handleMatchTimeout() {
        this.matchTimeoutId = null;

        if (this.game.state.currentUser) {
            this.leaveQueue(this.game.state.currentUser.id);
        }

        this.stopQueueStatusUpdate();

        const roomCodeSpan = document.getElementById('room-code');
        if (roomCodeSpan) {
            roomCodeSpan.textContent = '------';
        }

        this.showAIOption();
    }

    showAIOption() {
        const waitingDiv = document.getElementById('battle-waiting');
        if (!waitingDiv) return;

        const oldHint = document.getElementById('match-waiting-hint');
        if (oldHint) oldHint.remove();

        const existingOption = document.getElementById('ai-option');
        if (existingOption) existingOption.remove();

        const aiDiv = document.createElement('div');
        aiDiv.id = 'ai-option';
        aiDiv.style.cssText = `
            margin-top: 20px;
            padding: 25px;
            background: linear-gradient(145deg, #fef5f8, #fef0f4);
            border-radius: 40px;
            border: 2px solid #fad1db;
            box-shadow: 0 4px 0 #f5b8c7;
        `;

        const emoji = document.createElement('div');
        emoji.style.cssText = 'font-size: 3rem; margin-bottom: 15px;';
        emoji.textContent = '😢';
        aiDiv.appendChild(emoji);

        const p1 = document.createElement('p');
        p1.style.cssText = 'margin-bottom: 12px; font-weight: 500; color: #b28b99; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;';
        p1.textContent = '当前没有其他玩家在线';
        aiDiv.appendChild(p1);

        const p2 = document.createElement('p');
        p2.style.cssText = 'margin-bottom: 20px; font-size: 1rem; color: #b28b99; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;';
        p2.textContent = '您可以继续等待，或者与AI练习对战 (AI对战不计入排名，不消耗积分)';
        aiDiv.appendChild(p2);

        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display: flex; gap: 15px; justify-content: center;';

        const continueBtn = document.createElement('button');
        continueBtn.className = 'candy-btn primary';
        continueBtn.style.cssText = 'flex: 1;';
        continueBtn.textContent = '⏳ 继续等待';
        btnContainer.appendChild(continueBtn);

        const aiBtn = document.createElement('button');
        aiBtn.className = 'candy-btn secondary';
        aiBtn.style.cssText = 'flex: 1;';
        aiBtn.textContent = '🤖 与AI对战';
        btnContainer.appendChild(aiBtn);

        aiDiv.appendChild(btnContainer);

        waitingDiv.appendChild(aiDiv);

        continueBtn.onclick = () => {
            aiDiv.remove();
            this.quickMatch();
        };

        aiBtn.onclick = () => {
            aiDiv.remove();
            this.startAIBattle();
        };
    }

    async startAIBattle() {
        this.cleanupAIResources();
        
        this.cleanupMatch();

        const aiPlayer = {
            id: 'ai_' + Math.random().toString(36).substring(2, 8),
            name: this.getAIName(),
            elo: 1200
        };

        this.room.opponentIsAI = true;
        this.room.aiDifficulty = this.selectAIDifficulty();

        await this.startAIBattleRoom(aiPlayer);

        this.showFeedback('已为您匹配AI对手', '#4CAF50');
        
        const aiOption = document.getElementById('ai-option');
        if (aiOption) aiOption.remove();
    }

    selectAIDifficulty() {
        const playerELO = this.game.state?.currentUser?.elo || 1200;
        
        if (playerELO < 900) return 'easy';
        if (playerELO < 1300) return 'medium';
        if (playerELO < 1600) return 'hard';
        return 'expert';
    }

    getAIName() {
        const names = [
            '🤖 机器人小糖',
            '🍬 糖果AI',
            '🎮 游戏助手',
            '🤖 AI练习生',
            '🍭 糖果精灵',
            '🎯 靶心AI',
            '✨ 星光AI',
            '🌟 新手机器人',
            '🌈 彩虹AI',
            '⭐ 明星AI'
        ];
        
        let difficultyText = '';
        if (this.room.aiDifficulty === 'easy') difficultyText = ' (简单)';
        else if (this.room.aiDifficulty === 'medium') difficultyText = ' (中等)';
        else if (this.room.aiDifficulty === 'hard') difficultyText = ' (困难)';
        else difficultyText = ' (专家)';
        
        return names[Math.floor(Math.random() * names.length)] + difficultyText;
    }

    async startAIBattleRoom(aiPlayer) {
        this.room.battleId = 'ai_' + Date.now();
        this.room.roomCode = this.generateRoomCode();
        this.room.opponentId = aiPlayer.id;
        this.room.opponentName = aiPlayer.name;
        this.room.playerRole = 'player1';
        this.room.status = 'playing';
        this.room.gameActive = true;
        this.room.selectedCards = [];
        this.refreshCount = 0;

        const waitingDiv = document.getElementById('battle-waiting');
        const activeDiv = document.getElementById('battle-active');
        const resultDiv = document.getElementById('battle-result');
        
        if (waitingDiv) waitingDiv.style.display = 'none';
        if (activeDiv) activeDiv.style.display = 'block';
        if (resultDiv) resultDiv.style.display = 'none';

        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) chatMessages.innerHTML = '';

        const player1Name = document.getElementById('player1-name');
        const player2Name = document.getElementById('player2-name');
        const player1Avatar = document.getElementById('player1-avatar');
        const player2Avatar = document.getElementById('player2-avatar');
        
        if (player1Name) player1Name.textContent = this.game.state.currentUser.name;
        if (player2Name) player2Name.textContent = aiPlayer.name;
        if (player1Avatar) player1Avatar.textContent = this.game.state.currentUser.name.charAt(0).toUpperCase();
        if (player2Avatar) player2Avatar.textContent = '🤖';

        const player1Score = document.getElementById('player1-score');
        const player2Score = document.getElementById('player2-score');
        const player1Progress = document.getElementById('player1-progress');
        const player2Progress = document.getElementById('player2-progress');
        
        if (player1Score) player1Score.textContent = '0';
        if (player2Score) player2Score.textContent = '0';
        if (player1Progress) player1Progress.style.width = '0%';
        if (player2Progress) player2Progress.style.width = '0%';

        const firstPlayer = Math.random() < 0.5 ? this.game.state.currentUser.id : aiPlayer.id;
        this.room.myTurn = firstPlayer === this.game.state.currentUser.id;

        this.updateTurnIndicator();
        this.generateBattleGrid();
        this.generateBattleTarget();
        this.showRoomCode();
        this.updateProgressBars();

        this.addAIMessage(`⚔️ 与AI对战开始！ (难度: ${this.room.aiDifficulty === 'easy' ? '简单' : this.room.aiDifficulty === 'medium' ? '中等' : this.room.aiDifficulty === 'hard' ? '困难' : '专家'})`);
        if (this.room.myTurn) {
            this.addAIMessage('你的回合，请选择卡片');
        } else {
            this.addAIMessage(`${aiPlayer.name} 的回合，请稍候...`);
            this.scheduleAIMove();
        }
        
        this.saveLocalBattleState();
    }

    scheduleAIMove() {
        if (!this.room.gameActive) {
            return;
        }
        
        if (this.aiMoveTimer) {
            clearTimeout(this.aiMoveTimer);
        }
        
        this.aiMoveTimer = setTimeout(() => {
            this.aiMoveTimer = null;
            if (this.room.gameActive && !this.room.myTurn) {
                this.makeAIMove();
            }
        }, this.constants.AI_MOVE_DELAY);
    }

    async makeAIMove() {
        try {
            await this.acquireSemaphore('ai');
            
            if (!this.room.gameActive || this.room.myTurn) return;

            const grid = document.getElementById('battle-grid');
            if (!grid) return;

            const targetEl = document.getElementById('battle-target-number');
            if (!targetEl) {
                this.scheduleAIMove();
                return;
            }
            
            const target = parseInt(targetEl.textContent);
            if (isNaN(target) || target < 2 || target > 18) {
                this.generateBattleTarget();
                this.scheduleAIMove();
                return;
            }

            if (!this.checkGridHasValidCombination()) {
                console.log('AI移动前发现无有效组合，刷新网格');
                this.refreshBattleGrid();
                this.generateBattleTarget();
                this.scheduleAIMove();
                return;
            }

            const cards = Array.from(grid.querySelectorAll('.number-card:not(.matched)'));
            
            if (this.aiGlobalRetryCount > 5) {
                console.warn('AI多次失败，重置网格');
                this.refreshBattleGrid();
                this.generateBattleTarget();
                this.aiGlobalRetryCount = 0;
                this.scheduleAIMove();
                return;
            }
            
            if (!cards || cards.length < 2) {
                this.aiGlobalRetryCount++;
                if (this.aiMoveRetryCount >= this.constants.AI_MAX_RETRIES) {
                    this.refreshBattleGrid();
                    this.aiMoveRetryCount = 0;
                } else {
                    this.aiMoveRetryCount++;
                }
                this.scheduleAIMove();
                return;
            }
            
            this.aiMoveRetryCount = 0;
            this.aiGlobalRetryCount = 0;
            
            let move = null;
            
            if (this.room.aiDifficulty === 'easy') {
                if (Math.random() < 0.3) {
                    move = this.findCorrectMove(cards, target);
                }
            } else if (this.room.aiDifficulty === 'medium') {
                if (Math.random() < 0.7) {
                    move = this.findCorrectMove(cards, target);
                }
            } else if (this.room.aiDifficulty === 'hard') {
                if (Math.random() < 0.95) {
                    move = this.findCorrectMove(cards, target);
                }
            } else {
                move = this.findCorrectMove(cards, target);
                if (!move) {
                    move = this.findClosestMove(cards, target);
                }
            }

            if (!move) {
                const index1 = Math.floor(Math.random() * cards.length);
                let index2;
                do {
                    index2 = Math.floor(Math.random() * cards.length);
                } while (index2 === index1 && cards.length > 1);
                
                if (cards.length === 1) {
                    this.refreshBattleGrid();
                    this.scheduleAIMove();
                    return;
                }
                
                move = [cards[index1], cards[index2]];
            }

            const [card1, card2] = move;
            
            if (!card1 || !card2) {
                this.scheduleAIMove();
                return;
            }
            
            card1.classList.add('selected');
            card2.classList.add('selected');
            
            setTimeout(() => {
                this.executeAIMove(card1, card2, target);
            }, 500);
            
        } catch (error) {
            console.error('AI移动失败:', error);
        } finally {
            this.releaseSemaphore('ai');
        }
    }

    findCorrectMove(cards, target) {
        for (let i = 0; i < cards.length; i++) {
            for (let j = i + 1; j < cards.length; j++) {
                const num1 = parseInt(cards[i].dataset.value);
                const num2 = parseInt(cards[j].dataset.value);
                if (!isNaN(num1) && !isNaN(num2) && num1 + num2 === target) {
                    return [cards[i], cards[j]];
                }
            }
        }
        return null;
    }

    findClosestMove(cards, target) {
        let bestPair = null;
        let closestDiff = Infinity;
        
        for (let i = 0; i < cards.length; i++) {
            for (let j = i + 1; j < cards.length; j++) {
                const num1 = parseInt(cards[i].dataset.value);
                const num2 = parseInt(cards[j].dataset.value);
                if (!isNaN(num1) && !isNaN(num2)) {
                    const sum = num1 + num2;
                    const diff = Math.abs(sum - target);
                    
                    if (diff < closestDiff) {
                        closestDiff = diff;
                        bestPair = [cards[i], cards[j]];
                    }
                }
            }
        }
        
        return bestPair;
    }

    async executeAIMove(card1, card2, target) {
        if (!this.room.gameActive) return;

        if (!card1.isConnected || !card2.isConnected) {
            console.log('AI移动时卡片已被移除');
            this.scheduleAIMove();
            return;
        }

        const num1 = parseInt(card1.dataset.value);
        const num2 = parseInt(card2.dataset.value);
        const sum = num1 + num2;
        const isCorrectMove = sum === target;

        const result = isCorrectMove ? '✓ 正确' : '✗ 错误';
        this.addAIMessage(`${this.room.opponentName} 选择了 ${num1} + ${num2} = ${sum} ${result}`);

        if (isCorrectMove) {
            this.playSound('correct');
            
            card1.classList.add('matched');
            card2.classList.add('matched');
            
            setTimeout(() => {
                if (card1.isConnected) card1.remove();
                if (card2.isConnected) card2.remove();
            }, 300);

            const aiScoreEl = this.getOpponentScoreElement();
            if (aiScoreEl) {
                const currentScore = parseInt(aiScoreEl.textContent) || 0;
                aiScoreEl.textContent = currentScore + 10;
            }

            const aiProgress = this.room.playerRole === 'player1' ? 
                document.getElementById('player2-progress') : 
                document.getElementById('player1-progress');
            if (aiProgress) {
                const currentProgress = parseInt(aiProgress.style.width) || 0;
                const newProgress = Math.min(100, currentProgress + 10);
                aiProgress.style.width = newProgress + '%';
            }

            this.generateBattleTarget();

            const remaining = document.querySelectorAll('#battle-grid .number-card:not(.matched)');
            if (remaining.length < 4) {
                this.refreshBattleGrid();
            }

            const aiProgressWidth = aiProgress?.style.width;
            if (aiProgressWidth && parseInt(aiProgressWidth) >= 100) {
                this.endAIBattle(this.room.opponentId);
                return;
            }
            
            setTimeout(() => {
                this.autoRefreshGridIfNeeded();
            }, 500);
            
        } else {
            this.playSound('wrong');
            
            this.generateBattleTarget();
            
            setTimeout(() => {
                if (card1.isConnected) card1.classList.remove('selected');
                if (card2.isConnected) card2.classList.remove('selected');
            }, 500);
            
            setTimeout(() => {
                this.autoRefreshGridIfNeeded();
            }, 500);
        }

        this.room.myTurn = true;
        this.updateTurnIndicator();
        this.addAIMessage('你的回合');
    }

    endAIBattle(winnerId) {
        this.room.gameActive = false;
        this.stopTurnTimer();
        this.cleanupAIResources();
        this.refreshCount = 0;

        const activeDiv = document.getElementById('battle-active');
        const resultDiv = document.getElementById('battle-result');
        
        if (activeDiv) activeDiv.style.display = 'none';
        if (resultDiv) resultDiv.style.display = 'block';

        const iWon = winnerId === this.game.state.currentUser.id;
        
        const resultTitle = document.getElementById('result-title');
        if (resultTitle) resultTitle.textContent = iWon ? `🏆 ${this.t('win')}` : `😢 ${this.t('lose')}`;

        const myScore = parseInt(document.getElementById('player1-score')?.textContent) || 0;
        const aiScore = parseInt(document.getElementById('player2-score')?.textContent) || 0;

        const finalPlayerScore = document.getElementById('final-player-score');
        const finalOpponentScore = document.getElementById('final-opponent-score');
        
        if (finalPlayerScore) finalPlayerScore.textContent = myScore;
        if (finalOpponentScore) finalOpponentScore.textContent = aiScore;

        this.playSound(iWon ? 'achievement' : 'wrong');

        this.addAIMessage(`🏆 对战结束，${iWon ? '你' : this.room.opponentName} 获胜！`);
        
        this.disableChatInput(true);
        this.safeStorage().removeItem(this.constants.LOCAL_STORAGE_KEY);
    }

    addAIMessage(text) {
        const chat = document.getElementById('chat-messages');
        if (!chat) return;

        const fragment = document.createDocumentFragment();
        
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message system';
        msgDiv.textContent = text;
        
        fragment.appendChild(msgDiv);
        chat.appendChild(fragment);
        
        this.limitChatMessages(chat);
        
        requestAnimationFrame(() => {
            chat.scrollTop = chat.scrollHeight;
        });
    }

    limitChatMessages(chat) {
        while (chat.children.length > this.constants.MAX_CHAT_MESSAGES) {
            chat.removeChild(chat.children[0]);
        }
    }

    /**
     * 检查网格是否有有效组合
     */
    checkGridHasValidCombination() {
        const grid = document.getElementById('battle-grid');
        if (!grid) return true;

        const cards = Array.from(grid.querySelectorAll('.number-card:not(.matched)'));
        
        if (cards.length < 2) {
            if (!this.isRefreshing) {
                this.isRefreshing = true;
                setTimeout(() => {
                    this.refreshBattleGrid();
                    this.isRefreshing = false;
                }, 100);
            }
            return false;
        }

        const targetEl = document.getElementById('battle-target-number');
        if (!targetEl) return true;
        
        const target = parseInt(targetEl.textContent);
        if (isNaN(target)) return true;

        for (let i = 0; i < cards.length; i++) {
            for (let j = i + 1; j < cards.length; j++) {
                const num1 = parseInt(cards[i].dataset.value);
                const num2 = parseInt(cards[j].dataset.value);
                if (!isNaN(num1) && !isNaN(num2) && num1 + num2 === target) {
                    return true;
                }
            }
        }
        
        if (!this.isRefreshing) {
            this.isRefreshing = true;
            setTimeout(() => {
                this.autoRefreshGridIfNeeded();
                this.isRefreshing = false;
            }, 100);
        }
        return false;
    }

    /**
     * 自动刷新网格
     */
    autoRefreshGridIfNeeded() {
        if (!this.room.gameActive) return;
        
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = null;
            
            if (this.refreshCount > this.constants.MAX_REFRESH_COUNT) {
                console.warn('连续刷新多次，强制结束回合');
                this.refreshCount = 0;
                this.endTurn();
                return;
            }
            
            const hasValidCombination = this.checkGridHasValidCombination();
            if (!hasValidCombination) {
                console.log('无有效数字组合，自动刷新网格');
                this.refreshBattleGrid();
                this.generateBattleTarget();
                this.refreshCount = (this.refreshCount || 0) + 1;
                
                this.showFeedback('✨ 重新生成数字组合', '#ff69b4');
                
                if (this.room.opponentIsAI && !this.room.myTurn) {
                    this.scheduleAIMove();
                }
            } else {
                this.refreshCount = 0;
            }
        }, this.constants.REFRESH_DEBOUNCE);
    }

    cleanupMatch() {
        if (this.matchTimeoutId) {
            clearTimeout(this.matchTimeoutId);
            this.matchTimeoutId = null;
        }
        
        if (this.longWaitTimer) {
            clearTimeout(this.longWaitTimer);
            this.longWaitTimer = null;
        }

        this.stopQueueStatusUpdate();

        const aiOption = document.getElementById('ai-option');
        if (aiOption) aiOption.remove();

        const waitingHint = document.getElementById('match-waiting-hint');
        if (waitingHint) waitingHint.remove();
        
        const longWait = document.getElementById('long-wait-suggestion');
        if (longWait) longWait.remove();

        this.matchStartTime = null;
        
        if (this.game.state?.currentUser?.id) {
            this.leaveQueue(this.game.state.currentUser.id);
        }
        
        if (this.matchQueue.length === 0) {
            this.matchQueue = [];
        }
    }

    generateRoomCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    async joinQueue(player) {
        const elo = await this.calculatePlayerELO(player.id) || 1200;
        
        const existing = this.matchQueue.find(p => p.id === player.id);
        if (existing) return;

        this.matchQueue.push({
            ...player,
            elo,
            joinTime: Date.now()
        });

        this.matchQueue.sort((a, b) => a.elo - b.elo);
        this.tryMatch();
    }

    leaveQueue(playerId) {
        this.matchQueue = this.matchQueue.filter(p => p.id !== playerId);
    }

    /**
     * 尝试匹配（修复版）
     */
    async tryMatch() {
        if (this.matchQueue.length < 2) return;

        const matched = [];
        const used = new Set();

        for (let i = 0; i < this.matchQueue.length; i++) {
            if (used.has(i)) continue;

            let bestMatch = -1;
            let bestDiff = Infinity;

            for (let j = i + 1; j < this.matchQueue.length; j++) {
                if (used.has(j)) continue;

                const waitTime = Date.now() - this.matchQueue[j].joinTime;
                const diff = Math.abs(this.matchQueue[i].elo - this.matchQueue[j].elo);
                
                // 放宽匹配条件
                const timeBonus = Math.min(500, waitTime / 1000 * 50);
                const maxDiff = 800 + timeBonus;
                
                // 如果等待时间超过10秒，强制匹配
                if (waitTime > this.constants.FORCE_MATCH_TIME) {
                    bestMatch = j;
                    bestDiff = diff;
                    break;
                }
                
                if (diff < maxDiff) {
                    if (diff < bestDiff) {
                        bestDiff = diff;
                        bestMatch = j;
                    }
                }
            }

            if (bestMatch !== -1) {
                matched.push([i, bestMatch]);
                used.add(i);
                used.add(bestMatch);
            }
        }

        // 如果没有匹配成功但人数>=2，强制匹配最接近的两个人
        if (matched.length === 0 && this.matchQueue.length >= 2) {
            console.log('强制匹配最接近的两个人');
            const sorted = [...this.matchQueue].sort((a, b) => a.elo - b.elo);
            const i = this.matchQueue.findIndex(p => p.id === sorted[0].id);
            const j = this.matchQueue.findIndex(p => p.id === sorted[1].id);
            matched.push([i, j]);
        }

        for (const [i, j] of matched) {
            const player1 = this.matchQueue[i];
            const player2 = this.matchQueue[j];
            
            const index1 = Math.max(i, j);
            const index2 = Math.min(i, j);
            this.matchQueue.splice(index1, 1);
            this.matchQueue.splice(index2, 1);
            
            this.cleanupMatch();
            
            await this.createBattleRoom(player1, player2);
        }
    }

    async calculatePlayerELO(userId) {
        if (!this.isSupabaseAvailable()) return 1200;

        try {
            const { data: battles } = await this.game.state.supabase
                .from('candy_math_battles')
                .select('*')
                .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
                .eq('status', 'finished')
                .eq('match_type', 'ranked')
                .order('created_at', { ascending: false })
                .limit(20);

            if (!battles || battles.length === 0) {
                return 1200;
            }

            let totalScore = 1200;
            let wins = 0;

            for (const battle of battles) {
                const isWinner = battle.winner_id === userId;
                if (isWinner) wins++;
                
                const expected = 1 / (1 + Math.pow(10, (1200 - totalScore) / 400));
                const actual = isWinner ? 1 : 0;
                
                totalScore += this.constants.ELO_K_FACTOR * (actual - expected);
            }

            if (this.isSupabaseAvailable()) {
                const winRate = battles.length > 0 ? (wins / battles.length) * 100 : 0;
                await this.game.state.supabase
                    .from('player_elo')
                    .upsert({
                        user_id: userId,
                        elo: Math.round(totalScore),
                        win_rate: winRate,
                        battles: battles.length,
                        wins: wins,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id' });
            }

            return Math.round(totalScore);
        } catch (error) {
            console.error('计算ELO失败:', error);
            return 1200;
        }
    }

    // ==================== 房间管理 ====================

    async createBattleRoom(player1, player2) {
        if (!player1 || !player2 || !player1.id || !player2.id) {
            console.error('玩家信息不完整');
            return;
        }

        if (!this.isSupabaseAvailable()) {
            console.log('Supabase不可用，使用本地对战');
            await this.startLocalBattle(player1, player2);
            return;
        }

        try {
            const roomCode = this.generateRoomCode();

            const { data: battle, error } = await this.game.state.supabase
                .from('candy_math_battles')
                .insert([{
                    room_code: roomCode,
                    player1_id: player1.id,
                    player2_id: player2.id,
                    player1_name: player1.name,
                    player2_name: player2.name,
                    player1_elo: player1.elo || 1200,
                    player2_elo: player2.elo || 1200,
                    mode: 'challenge',
                    difficulty: 'medium',
                    status: 'playing',
                    started_at: new Date().toISOString(),
                    match_type: 'ranked'
                }])
                .select()
                .single();

            if (error) {
                console.error('Supabase错误:', error);
                await this.startLocalBattle(player1, player2);
                return;
            }

            this.notifyPlayer(player1.id, 'match_found', {
                battleId: battle.id,
                roomCode,
                opponent: player2
            });

            this.notifyPlayer(player2.id, 'match_found', {
                battleId: battle.id,
                roomCode,
                opponent: player1
            });
        } catch (error) {
            console.error('创建对战房间失败:', error);
            await this.startLocalBattle(player1, player2);
        }
    }

    async startLocalBattle(player1, player2) {
        this.room.battleId = 'local_' + Date.now();
        this.room.roomCode = this.generateRoomCode();
        this.room.opponentId = player2.id;
        this.room.opponentName = player2.name;
        this.room.playerRole = player1.id === this.game.state.currentUser.id ? 'player1' : 'player2';
        this.room.status = 'playing';
        this.room.gameActive = true;
        this.room.opponentIsAI = false;
        this.refreshCount = 0;

        const waitingDiv = document.getElementById('battle-waiting');
        const activeDiv = document.getElementById('battle-active');
        const resultDiv = document.getElementById('battle-result');
        
        if (waitingDiv) waitingDiv.style.display = 'none';
        if (activeDiv) activeDiv.style.display = 'block';
        if (resultDiv) resultDiv.style.display = 'none';

        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) chatMessages.innerHTML = '';

        if (this.room.playerRole === 'player1') {
            const player1Name = document.getElementById('player1-name');
            const player2Name = document.getElementById('player2-name');
            const player1Avatar = document.getElementById('player1-avatar');
            const player2Avatar = document.getElementById('player2-avatar');
            
            if (player1Name) player1Name.textContent = player1.name;
            if (player2Name) player2Name.textContent = player2.name;
            if (player1Avatar) player1Avatar.textContent = player1.name.charAt(0).toUpperCase();
            if (player2Avatar) player2Avatar.textContent = player2.name.charAt(0).toUpperCase();
        } else {
            const player1Name = document.getElementById('player1-name');
            const player2Name = document.getElementById('player2-name');
            const player1Avatar = document.getElementById('player1-avatar');
            const player2Avatar = document.getElementById('player2-avatar');
            
            if (player1Name) player1Name.textContent = player2.name;
            if (player2Name) player2Name.textContent = player1.name;
            if (player1Avatar) player1Avatar.textContent = player2.name.charAt(0).toUpperCase();
            if (player2Avatar) player2Avatar.textContent = player1.name.charAt(0).toUpperCase();
        }

        const player1Score = document.getElementById('player1-score');
        const player2Score = document.getElementById('player2-score');
        const player1Progress = document.getElementById('player1-progress');
        const player2Progress = document.getElementById('player2-progress');
        
        if (player1Score) player1Score.textContent = '0';
        if (player2Score) player2Score.textContent = '0';
        if (player1Progress) player1Progress.style.width = '0%';
        if (player2Progress) player2Progress.style.width = '0%';

        const firstPlayer = Math.random() < 0.5 ? player1.id : player2.id;
        this.room.myTurn = firstPlayer === this.game.state.currentUser.id;

        this.updateTurnIndicator();
        this.generateBattleGrid();
        this.generateBattleTarget();
        this.showRoomCode();
        this.updateProgressBars();

        this.sendLocalMessage('⚔️ 对战开始！（本地模式）');
        if (this.room.myTurn) {
            this.sendLocalMessage('你的回合，请选择卡片');
        } else {
            this.sendLocalMessage(`等待 ${this.room.opponentName} 操作`);
        }

        this.startLocalPolling();
        this.saveLocalBattleState();
    }

    startLocalPolling() {
        if (!this.room.myTurn && !this.room.opponentIsAI) {
            if (this.localPollingTimer) {
                clearTimeout(this.localPollingTimer);
            }
            
            this.localPollingTimer = setTimeout(() => {
                this.localPollingTimer = null;
                this.simulateOpponentMove();
            }, 2000 + Math.random() * 3000);
        }
    }

    simulateOpponentMove() {
        if (!this.room.gameActive || this.room.myTurn) return;

        const grid = document.getElementById('battle-grid');
        if (!grid) return;

        const cards = Array.from(grid.querySelectorAll('.number-card:not(.matched)'));
        
        if (!cards || cards.length < 2) {
            this.refreshBattleGrid();
            this.startLocalPolling();
            return;
        }

        const targetEl = document.getElementById('battle-target-number');
        if (!targetEl) {
            this.startLocalPolling();
            return;
        }
        
        const target = parseInt(targetEl.textContent) || 0;
        
        const index1 = Math.floor(Math.random() * cards.length);
        let index2;
        do {
            index2 = Math.floor(Math.random() * cards.length);
        } while (index2 === index1 && cards.length > 1);
        
        if (index1 === index2) {
            this.startLocalPolling();
            return;
        }

        const card1 = cards[index1];
        const card2 = cards[index2];
        const num1 = parseInt(card1.dataset.value);
        const num2 = parseInt(card2.dataset.value);
        const sum = num1 + num2;
        const isCorrect = sum === target;

        card1.classList.add('selected');
        card2.classList.add('selected');

        setTimeout(() => {
            if (isCorrect) {
                card1.classList.add('matched');
                card2.classList.add('matched');
                setTimeout(() => {
                    if (card1.isConnected) card1.remove();
                    if (card2.isConnected) card2.remove();
                }, 300);

                const opponentScoreEl = this.getOpponentScoreElement();
                if (opponentScoreEl) {
                    const currentScore = parseInt(opponentScoreEl.textContent) || 0;
                    opponentScoreEl.textContent = currentScore + 10;
                }

                const opponentProgress = this.room.playerRole === 'player1' ?
                    document.getElementById('player2-progress') :
                    document.getElementById('player1-progress');
                if (opponentProgress) {
                    const currentProgress = parseInt(opponentProgress.style.width) || 0;
                    const newProgress = Math.min(100, currentProgress + 10);
                    opponentProgress.style.width = newProgress + '%';
                }

                this.generateBattleTarget();

                const opponentProgressWidth = opponentProgress?.style.width;
                if (opponentProgressWidth && parseInt(opponentProgressWidth) >= 100) {
                    this.endLocalBattle(this.room.opponentId);
                    return;
                }
            } else {
                this.generateBattleTarget();
                
                card1.classList.remove('selected');
                card2.classList.remove('selected');
            }

            this.room.myTurn = true;
            this.updateTurnIndicator();
            this.sendLocalMessage('你的回合');
        }, 500);
    }

    endLocalBattle(winnerId) {
        this.room.gameActive = false;
        this.stopTurnTimer();
        this.refreshCount = 0;

        if (this.localPollingTimer) {
            clearTimeout(this.localPollingTimer);
            this.localPollingTimer = null;
        }

        const activeDiv = document.getElementById('battle-active');
        const resultDiv = document.getElementById('battle-result');
        
        if (activeDiv) activeDiv.style.display = 'none';
        if (resultDiv) resultDiv.style.display = 'block';

        const iWon = winnerId === this.game.state.currentUser.id;
        
        const resultTitle = document.getElementById('result-title');
        if (resultTitle) resultTitle.textContent = iWon ? `🏆 ${this.t('win')}` : `😢 ${this.t('lose')}`;

        const myScore = parseInt(this.getMyScoreElement()?.textContent) || 0;
        const opponentScore = parseInt(this.getOpponentScoreElement()?.textContent) || 0;

        const finalPlayerScore = document.getElementById('final-player-score');
        const finalOpponentScore = document.getElementById('final-opponent-score');
        
        if (finalPlayerScore) finalPlayerScore.textContent = myScore;
        if (finalOpponentScore) finalOpponentScore.textContent = opponentScore;

        this.playSound(iWon ? 'achievement' : 'wrong');
        
        this.disableChatInput(true);
        this.safeStorage().removeItem(this.constants.LOCAL_STORAGE_KEY);
    }

    sendLocalMessage(text) {
        const chat = document.getElementById('chat-messages');
        if (!chat) return;

        const fragment = document.createDocumentFragment();
        
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message system';
        msgDiv.textContent = text;
        
        fragment.appendChild(msgDiv);
        chat.appendChild(fragment);
        
        this.limitChatMessages(chat);
        
        requestAnimationFrame(() => {
            chat.scrollTop = chat.scrollHeight;
        });
    }

    saveLocalBattleState() {
        if (!this.room.battleId) return;
        
        try {
            const state = {
                battleId: this.room.battleId,
                roomCode: this.room.roomCode,
                opponentName: this.room.opponentName,
                opponentIsAI: this.room.opponentIsAI,
                aiDifficulty: this.room.aiDifficulty,
                myTurn: this.room.myTurn,
                gameActive: this.room.gameActive,
                player1Score: document.getElementById('player1-score')?.textContent || '0',
                player2Score: document.getElementById('player2-score')?.textContent || '0',
                player1Progress: document.getElementById('player1-progress')?.style.width || '0%',
                player2Progress: document.getElementById('player2-progress')?.style.width || '0%',
                targetNumber: document.getElementById('battle-target-number')?.textContent || '0',
                gridCards: this.saveGridState(),
                chatMessages: this.saveChatState(),
                timestamp: Date.now()
            };
            
            this.safeStorage().setItem(this.constants.LOCAL_STORAGE_KEY, JSON.stringify(state));
        } catch (error) {
            console.error('保存本地对战状态失败:', error);
        }
    }

    saveGridState() {
        const grid = document.getElementById('battle-grid');
        if (!grid) return [];
        
        const cards = Array.from(grid.querySelectorAll('.number-card'));
        return cards.map(card => ({
            value: card.dataset.value,
            matched: card.classList.contains('matched'),
            selected: card.classList.contains('selected')
        }));
    }

    saveChatState() {
        const chat = document.getElementById('chat-messages');
        if (!chat) return [];
        
        return Array.from(chat.children).map(msg => ({
            className: msg.className,
            text: msg.textContent || msg.innerHTML
        }));
    }

    loadLocalBattleState() {
        try {
            const saved = this.safeStorage().getItem(this.constants.LOCAL_STORAGE_KEY);
            if (!saved) return false;
            
            const state = JSON.parse(saved);
            
            if (Date.now() - state.timestamp > this.constants.STORAGE_EXPIRY) {
                this.safeStorage().removeItem(this.constants.LOCAL_STORAGE_KEY);
                return false;
            }
            
            this.room.battleId = state.battleId;
            this.room.roomCode = state.roomCode;
            this.room.opponentName = state.opponentName;
            this.room.opponentIsAI = state.opponentIsAI;
            this.room.aiDifficulty = state.aiDifficulty;
            this.room.myTurn = state.myTurn;
            this.room.gameActive = state.gameActive;
            
            const player1Score = document.getElementById('player1-score');
            const player2Score = document.getElementById('player2-score');
            const player1Progress = document.getElementById('player1-progress');
            const player2Progress = document.getElementById('player2-progress');
            const targetNumber = document.getElementById('battle-target-number');
            
            if (player1Score) player1Score.textContent = state.player1Score;
            if (player2Score) player2Score.textContent = state.player2Score;
            if (player1Progress) player1Progress.style.width = state.player1Progress;
            if (player2Progress) player2Progress.style.width = state.player2Progress;
            if (targetNumber) targetNumber.textContent = state.targetNumber;
            
            this.loadGridState(state.gridCards);
            this.loadChatState(state.chatMessages);
            
            return true;
        } catch (error) {
            console.error('加载本地对战状态失败:', error);
            return false;
        }
    }

    loadGridState(cardsData) {
        const grid = document.getElementById('battle-grid');
        if (!grid || !cardsData) return;
        
        const fragment = document.createDocumentFragment();
        
        cardsData.forEach(data => {
            const card = document.createElement('div');
            card.className = 'number-card';
            if (data.matched) card.classList.add('matched');
            if (data.selected) card.classList.add('selected');
            card.dataset.value = data.value;
            card.textContent = data.value;
            fragment.appendChild(card);
        });
        
        grid.innerHTML = '';
        grid.appendChild(fragment);
    }

    loadChatState(messagesData) {
        const chat = document.getElementById('chat-messages');
        if (!chat || !messagesData) return;
        
        const fragment = document.createDocumentFragment();
        
        messagesData.forEach(data => {
            const msgDiv = document.createElement('div');
            msgDiv.className = data.className;
            msgDiv.innerHTML = data.text;
            fragment.appendChild(msgDiv);
        });
        
        chat.innerHTML = '';
        chat.appendChild(fragment);
    }

    notifyPlayer(playerId, type, data) {
        if (this.game.state.currentUser && this.game.state.currentUser.id === playerId) {
            if (type === 'match_found') {
                this.cleanupMatch();
                this.startBattle(data);
            }
        }
    }

    showJoinModal() {
        if (this.game.ui) {
            this.game.ui.openModal('join-modal');
        }
        const input = document.getElementById('room-code-input');
        if (input) {
            input.value = '';
            input.focus();
        }
    }

    closeJoinModal() {
        if (this.game.ui) {
            this.game.ui.closeModal('join-modal');
        }
    }

    /**
     * 确认加入房间（修复版）
     */
    async confirmJoin() {
        const roomCodeInput = document.getElementById('room-code-input');
        const roomCode = roomCodeInput?.value;
        
        if (!roomCode || roomCode.length !== 6) {
            this.showFeedback('请输入6位房间码', '#ff4444');
            return;
        }

        if (!Validators || !Validators.isValidRoomCode(roomCode)) {
            this.showFeedback('房间码格式不正确', '#ff4444');
            return;
        }

        if (!this.game.auth || !this.game.auth.isLoggedIn()) {
            this.showFeedback('请先登录', '#ff4444');
            if (this.game.auth) {
                this.game.auth.showAuthModal('login');
            }
            return;
        }

        if (!this.isSupabaseAvailable()) {
            this.showFeedback('Supabase未连接', '#ff4444');
            return;
        }

        try {
            // 先查询房间状态
            const { data: battle, error } = await this.game.state.supabase
                .from('candy_math_battles')
                .select('*')
                .eq('room_code', roomCode.toUpperCase())
                .single();

            if (error || !battle) {
                this.showFeedback('房间不存在', '#ff4444');
                return;
            }

            // 检查房间状态
            if (battle.status !== 'waiting') {
                this.showFeedback('房间已开始或已结束', '#ff4444');
                return;
            }

            // 检查是否是自己创建的房间
            if (battle.player1_id === this.game.state.currentUser.id) {
                this.showFeedback('不能加入自己创建的房间', '#ff4444');
                return;
            }

            // 检查是否已经满员
            if (battle.player2_id) {
                this.showFeedback('房间已满', '#ff4444');
                return;
            }

            // 加入房间
            const { error: updateError } = await this.game.state.supabase
                .from('candy_math_battles')
                .update({
                    player2_id: this.game.state.currentUser.id,
                    player2_name: this.game.state.currentUser.name,
                    status: 'playing',
                    started_at: new Date().toISOString()
                })
                .eq('id', battle.id)
                .eq('status', 'waiting');

            if (updateError) {
                console.error('加入房间失败:', updateError);
                this.showFeedback('房间已被其他人加入', '#ff4444');
                return;
            }

            // 成功加入，开始对战
            this.startBattle({
                battleId: battle.id,
                roomCode: battle.room_code,
                opponent: { id: battle.player1_id, name: battle.player1_name }
            });

            this.closeJoinModal();
            this.showFeedback('加入房间成功', '#4CAF50');
            
        } catch (error) {
            console.error('加入房间失败:', error);
            this.showFeedback('加入房间失败', '#ff4444');
        }
    }

    copyRoomCode() {
        if (this.room.roomCode) {
            navigator.clipboard.writeText(this.room.roomCode);
            this.showFeedback('复制成功', '#4CAF50');
        }
    }

    cancelMatch() {
        this.cleanupMatch();

        if (this.game.state.currentUser) {
            this.leaveQueue(this.game.state.currentUser.id);
        }
        this.leaveBattle();
        if (this.game.ui) {
            this.game.ui.closeModal('battle-modal');
        }
    }

    // ==================== 对战逻辑 ====================

    async startBattle(data) {
        if (!this.isSupabaseAvailable()) {
            this.showFeedback('Supabase未连接，无法开始对战', '#ff4444');
            return;
        }

        this.room.battleId = data.battleId;
        this.room.roomCode = data.roomCode;
        this.room.opponentId = data.opponent.id;
        this.room.opponentName = data.opponent.name;
        this.room.playerRole = data.opponent.id === this.game.state.currentUser.id ? 'player2' : 'player1';
        this.room.status = 'playing';
        this.room.gameActive = true;
        this.room.selectedCards = [];
        this.room.opponentIsAI = false;
        this.refreshCount = 0;

        const waitingDiv = document.getElementById('battle-waiting');
        const activeDiv = document.getElementById('battle-active');
        const resultDiv = document.getElementById('battle-result');
        
        if (waitingDiv) waitingDiv.style.display = 'none';
        if (activeDiv) activeDiv.style.display = 'block';
        if (resultDiv) resultDiv.style.display = 'none';

        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) chatMessages.innerHTML = '';

        if (this.room.playerRole === 'player1') {
            const player1Name = document.getElementById('player1-name');
            const player2Name = document.getElementById('player2-name');
            const player1Avatar = document.getElementById('player1-avatar');
            const player2Avatar = document.getElementById('player2-avatar');
            
            if (player1Name) player1Name.textContent = this.game.state.currentUser.name;
            if (player2Name) player2Name.textContent = this.room.opponentName;
            if (player1Avatar) player1Avatar.textContent = this.game.state.currentUser.name.charAt(0).toUpperCase();
            if (player2Avatar) player2Avatar.textContent = this.room.opponentName.charAt(0).toUpperCase();
        } else {
            const player1Name = document.getElementById('player1-name');
            const player2Name = document.getElementById('player2-name');
            const player1Avatar = document.getElementById('player1-avatar');
            const player2Avatar = document.getElementById('player2-avatar');
            
            if (player1Name) player1Name.textContent = this.room.opponentName;
            if (player2Name) player2Name.textContent = this.game.state.currentUser.name;
            if (player1Avatar) player1Avatar.textContent = this.room.opponentName.charAt(0).toUpperCase();
            if (player2Avatar) player2Avatar.textContent = this.game.state.currentUser.name.charAt(0).toUpperCase();
        }

        const player1Score = document.getElementById('player1-score');
        const player2Score = document.getElementById('player2-score');
        const player1Progress = document.getElementById('player1-progress');
        const player2Progress = document.getElementById('player2-progress');
        
        if (player1Score) player1Score.textContent = '0';
        if (player2Score) player2Score.textContent = '0';
        if (player1Progress) player1Progress.style.width = '0%';
        if (player2Progress) player2Progress.style.width = '0%';

        const firstPlayer = Math.random() < 0.5 ? this.game.state.currentUser.id : this.room.opponentId;
        this.room.myTurn = firstPlayer === this.game.state.currentUser.id;

        try {
            await this.game.state.supabase
                .from('candy_math_battles')
                .update({ current_turn: firstPlayer })
                .eq('id', this.room.battleId);
        } catch (error) {
            console.error('更新先手失败:', error);
        }

        this.updateTurnIndicator();
        this.generateBattleGrid();
        this.generateBattleTarget();
        this.showRoomCode();
        this.updateProgressBars();

        await this.sendSystemMessage('⚔️ 对战开始！');
        if (this.room.myTurn) {
            await this.sendSystemMessage('你的回合，请选择卡片');
        } else {
            await this.sendSystemMessage(`等待 ${this.room.opponentName} 操作`);
        }

        this.subscribeToBattle(this.room.battleId);
        this.pushBattleState();
        this.startHeartbeat();
        this.startScoreSync();
        
        this.broadcastChannel?.postMessage({
            type: 'BATTLE_STARTED',
            data: { userId: this.game.state.currentUser.id }
        });
    }

    subscribeToBattle(battleId) {
        if (!this.isSupabaseAvailable()) return;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.room.channel) {
            console.log('取消旧订阅:', this.room.subscriptionId);
            try {
                this.room.channel.unsubscribe();
            } catch (e) {
                console.warn('取消订阅失败:', e);
            }
            this.room.channel = null;
            this.room.subscriptionId = null;
        }

        try {
            this.game.state.supabase.removeAllChannels();
        } catch (e) {
            console.warn('清理频道失败:', e);
        }

        try {
            this.room.channel = this.game.state.supabase
                .channel(`battle-${battleId}`)
                .on('presence', { event: 'sync' }, () => {
                    console.log('Presence sync');
                })
                .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                    console.log('Player joined:', newPresences);
                })
                .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                    console.log('Player left:', leftPresences);
                    
                    const offlineHint = document.createElement('div');
                    offlineHint.className = 'offline-hint';
                    offlineHint.style.cssText = `
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: #e68b8b;
                        color: white;
                        padding: 12px 20px;
                        border-radius: 30px;
                        z-index: 10001;
                        box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                        animation: slideIn 0.3s ease-out;
                        -webkit-font-smoothing: antialiased;
                        -moz-osx-font-smoothing: grayscale;
                    `;
                    
                    const container = document.createElement('div');
                    container.style.cssText = 'display: flex; align-items: center; gap: 10px;';
                    
                    const icon = document.createElement('span');
                    icon.textContent = '👋';
                    container.appendChild(icon);
                    
                    const text = document.createElement('span');
                    text.textContent = '对手已离线，等待重连...';
                    container.appendChild(text);
                    
                    const closeBtn = document.createElement('button');
                    closeBtn.style.cssText = 'background: none; border: none; color: white; font-size: 1.2rem; cursor: pointer;';
                    closeBtn.textContent = '×';
                    closeBtn.onclick = () => offlineHint.remove();
                    container.appendChild(closeBtn);
                    
                    offlineHint.appendChild(container);
                    
                    document.body.appendChild(offlineHint);
                    
                    setTimeout(() => {
                        if (offlineHint.isConnected) {
                            offlineHint.remove();
                        }
                    }, 3000);
                    
                    this.showFeedback('对手已断开连接', '#e68b8b');
                })
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'candy_math_battles',
                        filter: `id=eq.${battleId}`
                    },
                    (payload) => {
                        requestAnimationFrame(() => this.handleBattleUpdate(payload));
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'candy_math_battle_rounds',
                        filter: `battle_id=eq.${battleId}`
                    },
                    (payload) => {
                        requestAnimationFrame(() => this.handleRoundUpdate(payload));
                    }
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'candy_math_battle_messages',
                        filter: `battle_id=eq.${battleId}`
                    },
                    (payload) => {
                        requestAnimationFrame(() => this.handleNewMessage(payload));
                    }
                )
                .subscribe(async (status, err) => {
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        console.error('订阅失败:', err);
                        this.reconnectTimer = setTimeout(() => {
                            this.reconnectTimer = null;
                            this.attemptReconnect();
                        }, 5000);
                    } else if (status === 'CLOSED') {
                        console.log('通道已关闭');
                        this.reconnectTimer = setTimeout(() => {
                            this.reconnectTimer = null;
                            if (this.room.gameActive && this.room.battleId) {
                                this.subscribeToBattle(this.room.battleId);
                            }
                        }, 3000);
                    } else if (status === 'SUBSCRIBED') {
                        console.log('成功订阅对战:', battleId);
                        this.room.channel.send({
                            type: 'presence',
                            event: 'join',
                            payload: { user_id: this.game.state.currentUser.id }
                        });
                        this.reconnectAttempts = 0;
                    }
                });
                
            this.room.subscriptionId = `battle-${battleId}-${Date.now()}`;
            
        } catch (error) {
            console.error('订阅对战失败:', error);
        }
    }

    handleBattleUpdate(payload) {
        const battle = payload.new;

        if (this.room.playerRole === 'player1') {
            const player1Score = document.getElementById('player1-score');
            const player2Score = document.getElementById('player2-score');
            const player1Progress = document.getElementById('player1-progress');
            const player2Progress = document.getElementById('player2-progress');
            
            if (player1Score) player1Score.textContent = battle.player1_score || 0;
            if (player2Score) player2Score.textContent = battle.player2_score || 0;
            if (player1Progress) player1Progress.style.width = `${battle.player1_progress || 0}%`;
            if (player2Progress) player2Progress.style.width = `${battle.player2_progress || 0}%`;
        } else {
            const player1Score = document.getElementById('player1-score');
            const player2Score = document.getElementById('player2-score');
            const player1Progress = document.getElementById('player1-progress');
            const player2Progress = document.getElementById('player2-progress');
            
            if (player1Score) player1Score.textContent = battle.player2_score || 0;
            if (player2Score) player2Score.textContent = battle.player1_score || 0;
            if (player1Progress) player1Progress.style.width = `${battle.player2_progress || 0}%`;
            if (player2Progress) player2Progress.style.width = `${battle.player1_progress || 0}%`;
        }

        this.room.myTurn = battle.current_turn === this.game.state.currentUser.id;
        this.updateTurnIndicator();

        if (battle.status === 'finished') {
            this.showBattleResult(battle);
        }
    }

    handleRoundUpdate(payload) {
        const round = payload.new;
        if (round.player_id !== this.game.state.currentUser.id) {
            this.addOpponentMove(round);
        }
    }

    handleNewMessage(payload) {
        const message = payload.new;
        this.addChatMessage(message);
    }

    updateTurnIndicator() {
        if (!this.cachedElements) {
            this.cachedElements = {
                indicator: document.getElementById('turn-indicator'),
                turnText: document.querySelector('#turn-indicator .turn-text'),
                timer: document.getElementById('turn-timer'),
                player1Card: document.querySelector('.player-card.player1'),
                player2Card: document.querySelector('.player-card.player2')
            };
        }
        
        const { indicator, turnText, timer, player1Card, player2Card } = this.cachedElements;
        
        if (!indicator || !turnText) return;
        
        if (player1Card) {
            player1Card.classList.toggle('active', this.room.myTurn);
        }
        if (player2Card) {
            player2Card.classList.toggle('active', !this.room.myTurn);
        }

        if (this.room.opponentIsAI && !this.room.myTurn) {
            turnText.textContent = 'AI思考中...';
            indicator.style.background = 'linear-gradient(145deg, #f0e6f2, #e8daf0)';
            this.stopTurnTimer();
            if (timer) {
                timer.textContent = `${this.constants.ROUND_TIME}s`;
                timer.classList.remove('warning');
            }
        } else if (this.room.myTurn) {
            turnText.textContent = this.t('yourTurn');
            indicator.style.background = 'linear-gradient(145deg, #e0f0e5, #d6eadc)';
            this.startTurnTimer();
        } else {
            turnText.textContent = this.t('opponentTurn');
            indicator.style.background = 'linear-gradient(145deg, #fef0f4, #fde8ef)';
            this.stopTurnTimer();
            if (timer) {
                timer.textContent = `${this.constants.ROUND_TIME}s`;
                timer.classList.remove('warning');
            }
        }
    }

    startTurnTimer() {
        let timeLeft = this.constants.ROUND_TIME;
        const timer = document.getElementById('turn-timer');

        this.stopTurnTimer();

        this.room.roundTimer = setInterval(() => {
            timeLeft--;
            if (timer) {
                timer.textContent = `${timeLeft}s`;
                
                if (timeLeft <= 10) {
                    timer.classList.add('warning');
                    if (timeLeft === 10) {
                        this.playSound('warning');
                    }
                }
            }

            if (timeLeft <= 0) {
                this.handleTurnTimeout();
            }
        }, 1000);
    }

    async handleTurnTimeout() {
        this.stopTurnTimer();
        
        const timer = document.getElementById('turn-timer');
        if (timer) {
            timer.classList.remove('warning');
            timer.textContent = `${this.constants.ROUND_TIME}s`;
        }
        
        if (!this.room.gameActive) return;
        
        if (this.room.selectedCards.length > 0) {
            this.room.selectedCards.forEach(card => {
                if (card && card.isConnected) {
                    card.classList.remove('selected');
                }
            });
            this.room.selectedCards = [];
        }
        
        if (this.room.opponentIsAI) {
            this.addAIMessage('⏰ 时间到，轮到对方了');
        } else {
            await this.sendSystemMessage('⏰ 时间到，轮到对方了');
        }
        
        await this.endTurn();
    }

    stopTurnTimer() {
        if (this.room.roundTimer) {
            clearInterval(this.room.roundTimer);
            this.room.roundTimer = null;
        }
    }

    generateBattleGrid() {
        const grid = document.getElementById('battle-grid');
        if (!grid) return;

        const oldCards = grid.querySelectorAll('.number-card');
        oldCards.forEach(card => {
            card.style.animation = 'none';
            card.offsetHeight;
        });

        const numbers = [];
        for (let i = 0; i < 10; i++) {
            numbers.push(Math.floor(Math.random() * 10));
        }

        const fragment = document.createDocumentFragment();
        
        numbers.forEach(num => {
            const card = document.createElement('div');
            card.className = 'number-card';
            card.dataset.value = num;
            card.textContent = num;
            card.style.animation = 'cardAppear 0.3s ease-out';
            fragment.appendChild(card);
        });
        
        grid.innerHTML = '';
        grid.appendChild(fragment);
    }

    refreshBattleGrid() {
        const grid = document.getElementById('battle-grid');
        if (!grid) return;

        const hadSelectedCards = this.room.selectedCards.length > 0;
        
        const oldCards = grid.querySelectorAll('.number-card');
        oldCards.forEach(card => {
            card.style.animation = 'none';
            card.offsetHeight;
        });

        const numbers = [];
        for (let i = 0; i < 10; i++) {
            numbers.push(Math.floor(Math.random() * 10));
        }
        
        const fragment = document.createDocumentFragment();
        
        numbers.forEach(num => {
            const card = document.createElement('div');
            card.className = 'number-card';
            card.dataset.value = num;
            card.textContent = num;
            card.style.animation = 'cardAppear 0.3s ease-out';
            fragment.appendChild(card);
        });
        
        grid.innerHTML = '';
        grid.appendChild(fragment);
        
        if (hadSelectedCards) {
            this.room.selectedCards = [];
        }
        
        this.saveLocalBattleState();
    }

    generateBattleTarget() {
        const target = Math.floor(Math.random() * 10) + 5;
        const targetEl = document.getElementById('battle-target-number');
        if (targetEl) {
            targetEl.textContent = target;
            targetEl.style.animation = 'none';
            targetEl.offsetHeight;
            targetEl.style.animation = 'macaronGlow 4s ease-in-out infinite';
        }
    }

    async handleBattleCardClick(e) {
        if (!this.room.gameActive) {
            return;
        }
        
        const now = Date.now();
        if (now - this.lastClickTime < this.CLICK_DEBOUNCE_TIME) {
            return;
        }
        this.lastClickTime = now;
        
        if (this.clickDebounceTimer) {
            clearTimeout(this.clickDebounceTimer);
            this.clickDebounceTimer = null;
        }
        
        const card = e.target.closest('.number-card');
        if (!card) return;

        if (!this.room.gameActive) {
            return;
        }
        
        if (!this.room.myTurn) {
            this.playSound('wrong');
            this.showFeedback('现在是对手的回合', '#ffa500');
            return;
        }

        if (card.classList.contains('matched')) {
            return;
        }

        if (this.room.selectedCards.includes(card)) {
            card.classList.remove('selected');
            this.room.selectedCards = this.room.selectedCards.filter(c => c !== card);
            return;
        }

        if (this.cardClickProcessing) return;
        this.cardClickProcessing = true;

        try {
            this.playSound('click');

            if (this.room.selectedCards.length >= 2) {
                return;
            }

            card.classList.add('selected');
            this.room.selectedCards.push(card);

            if (this.room.selectedCards.length === 2) {
                await this.checkBattleMatch();
            }
        } catch (error) {
            console.error('卡片点击处理错误:', error);
            this.room.selectedCards.forEach(c => {
                if (c && c.isConnected) {
                    c.classList.remove('selected');
                }
            });
            this.room.selectedCards = [];
        } finally {
            this.cardClickProcessing = false;
        }
    }

    async checkBattleMatch() {
        const [card1, card2] = this.room.selectedCards;
        
        if (!card1 || !card2 || !card1.isConnected || !card2.isConnected) {
            this.room.selectedCards = [];
            return;
        }

        const targetEl = document.getElementById('battle-target-number');
        if (!targetEl) {
            this.room.selectedCards = [];
            return;
        }

        const target = parseInt(targetEl.textContent);
        if (isNaN(target)) {
            this.room.selectedCards = [];
            return;
        }

        const num1 = parseInt(card1.dataset.value);
        const num2 = parseInt(card2.dataset.value);
        const sum = num1 + num2;
        
        const isCorrect = sum === target;
        const timerText = document.getElementById('turn-timer')?.textContent || `${this.constants.ROUND_TIME}s`;
        const roundTime = this.constants.ROUND_TIME - parseInt(timerText.replace('s', ''));

        try {
            if (!this.room.opponentIsAI && this.isSupabaseAvailable()) {
                const round = {
                    battle_id: this.room.battleId,
                    player_id: this.game.state.currentUser.id,
                    target: target,
                    num1: num1,
                    num2: num2,
                    is_correct: isCorrect,
                    score: isCorrect ? 10 : 0,
                    round_time: roundTime * 1000
                };

                await this.game.state.supabase
                    .from('candy_math_battle_rounds')
                    .insert([round]);
            }

            if (isCorrect) {
                this.playSound('correct');
                
                card1.classList.add('matched');
                card2.classList.add('matched');
                
                setTimeout(() => {
                    if (card1.isConnected) card1.remove();
                    if (card2.isConnected) card2.remove();
                }, 300);

                await this.updateBattleScore(10);

                this.generateBattleTarget();

                const remaining = document.querySelectorAll('#battle-grid .number-card:not(.matched)');
                if (remaining.length < 4) {
                    this.refreshBattleGrid();
                }
                
                setTimeout(() => {
                    this.autoRefreshGridIfNeeded();
                }, 500);
                
            } else {
                this.playSound('wrong');
                
                this.generateBattleTarget();
                
                setTimeout(() => {
                    if (card1.isConnected) card1.classList.remove('selected');
                    if (card2.isConnected) card2.classList.remove('selected');
                }, 500);
                
                this.showFeedback('再试试其他组合吧！', '#ff69b4');
                
                setTimeout(() => {
                    this.autoRefreshGridIfNeeded();
                }, 500);
            }

            this.room.selectedCards = [];
            this.endTurn();
        } catch (error) {
            console.error('检查对战匹配失败:', error);
            this.showFeedback('操作失败', '#ff4444');
            this.room.selectedCards = [];
        }
    }

    async updateBattleScore(points) {
        if (this.scoreUpdateInProgress) return;
        this.scoreUpdateInProgress = true;

        try {
            if (this.room.opponentIsAI) {
                const myScoreEl = this.getMyScoreElement();
                if (myScoreEl) {
                    const currentScore = parseInt(myScoreEl.textContent) || 0;
                    myScoreEl.textContent = currentScore + points;
                }

                const myProgress = this.room.playerRole === 'player1' ? 
                    document.getElementById('player1-progress') : 
                    document.getElementById('player2-progress');
                if (myProgress) {
                    const currentProgress = parseInt(myProgress.style.width) || 0;
                    const newProgress = Math.min(100, currentProgress + 10);
                    myProgress.style.width = newProgress + '%';

                    if (newProgress >= 100 && this.room.gameActive) {
                        this.room.gameActive = false;
                        setTimeout(() => {
                            this.endAIBattle(this.game.state.currentUser.id);
                        }, 500);
                    }
                }
                
                this.saveLocalBattleState();
                return;
            }

            if (!this.isSupabaseAvailable() || !this.room.gameActive) {
                this.updateLocalScore(points);
                return;
            }

            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount < maxRetries) {
                try {
                    const field = this.room.playerRole === 'player1' ? 'player1_score' : 'player2_score';
                    const progressField = this.room.playerRole === 'player1' ? 'player1_progress' : 'player2_progress';

                    const { data: battle, error } = await this.game.state.supabase
                        .from('candy_math_battles')
                        .select('*')
                        .eq('id', this.room.battleId)
                        .single();

                    if (error || !battle) throw error || new Error('对战不存在');

                    if (battle.status === 'finished') return;

                    const newScore = (battle[field] || 0) + points;
                    const newProgress = Math.min(100, (battle[progressField] || 0) + 10);

                    const { error: updateError } = await this.game.state.supabase
                        .from('candy_math_battles')
                        .update({
                            [field]: newScore,
                            [progressField]: newProgress
                        })
                        .eq('id', this.room.battleId)
                        .eq(progressField, battle[progressField]);

                    if (updateError) {
                        throw updateError;
                    }

                    break;

                } catch (error) {
                    retryCount++;
                    if (retryCount === maxRetries) {
                        console.error('更新分数失败，使用本地更新:', error);
                        this.updateLocalScore(points);
                    } else {
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }
                }
            }
        } finally {
            this.scoreUpdateInProgress = false;
        }
    }

    updateLocalScore(points) {
        const myScoreEl = this.getMyScoreElement();
        if (myScoreEl) {
            const currentScore = parseInt(myScoreEl.textContent) || 0;
            myScoreEl.textContent = currentScore + points;
        }

        const myProgress = this.room.playerRole === 'player1' ? 
            document.getElementById('player1-progress') : 
            document.getElementById('player2-progress');
        if (myProgress) {
            const currentProgress = parseInt(myProgress.style.width) || 0;
            const newProgress = Math.min(100, currentProgress + 10);
            myProgress.style.width = newProgress + '%';
            
            if (newProgress >= 100 && this.room.gameActive) {
                this.room.gameActive = false;
                setTimeout(() => {
                    this.endBattle(this.game.state.currentUser.id);
                }, 500);
            }
        }
        
        this.saveLocalBattleState();
    }

    async endTurn() {
        if (this.endTurnInProgress) return;
        this.endTurnInProgress = true;
        
        try {
            this.refreshCount = 0;
            this.stopTurnTimer();
            
            if (this.room.opponentIsAI) {
                this.room.myTurn = false;
                this.updateTurnIndicator();
                this.scheduleAIMove();
                this.saveLocalBattleState();
                return;
            }

            if (!this.isSupabaseAvailable() || !navigator.onLine) {
                this.room.myTurn = !this.room.myTurn;
                this.updateTurnIndicator();
                this.startLocalPolling();
                this.saveLocalBattleState();
                return;
            }
            
            const { data: battle, error } = await this.game.state.supabase
                .from('candy_math_battles')
                .select('player1_id, player2_id')
                .eq('id', this.room.battleId)
                .single();

            if (error || !battle) throw error || new Error('对战不存在');

            const nextTurn = this.room.playerRole === 'player1' 
                ? battle.player2_id 
                : battle.player1_id;

            const { error: updateError } = await this.game.state.supabase
                .from('candy_math_battles')
                .update({ current_turn: nextTurn })
                .eq('id', this.room.battleId);

            if (updateError) throw updateError;
        } catch (error) {
            console.error('结束回合失败:', error);
            this.room.myTurn = true;
            this.startTurnTimer();
        } finally {
            this.endTurnInProgress = false;
        }
    }

    async endBattle(winnerId) {
        this.room.gameActive = false;
        this.stopTurnTimer();
        this.refreshCount = 0;

        if (this.room.opponentIsAI) return;

        if (!navigator.onLine) {
            this.showBattleResultFallback(winnerId);
            return;
        }

        if (!this.isSupabaseAvailable()) {
            this.showBattleResultFallback(winnerId);
            return;
        }

        try {
            const { data: battle, error: fetchError } = await this.game.state.supabase
                .from('candy_math_battles')
                .select('*')
                .eq('id', this.room.battleId)
                .single();

            if (fetchError) throw fetchError;

            if (battle.status === 'finished') {
                this.showBattleResult(battle);
                return;
            }

            const { error: updateError } = await this.game.state.supabase
                .from('candy_math_battles')
                .update({
                    status: 'finished',
                    winner_id: winnerId,
                    finished_at: new Date().toISOString()
                })
                .eq('id', this.room.battleId);

            if (updateError) throw updateError;

            const winner = winnerId === this.game.state.currentUser.id ? '你' : this.room.opponentName;
            await this.sendSystemMessage(`🏆 ${winner} 获胜！`);

            await this.updateELOAfterBattle(battle, winnerId);
            
            const { data: updatedBattle } = await this.game.state.supabase
                .from('candy_math_battles')
                .select('*')
                .eq('id', this.room.battleId)
                .single();
                
            this.showBattleResult(updatedBattle || battle);
        } catch (error) {
            console.error('结束对战失败:', error);
            this.showBattleResultFallback(winnerId);
        }
        
        this.disableChatInput(true);
        this.safeStorage().removeItem(this.constants.LOCAL_STORAGE_KEY);
    }

    async attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.showFeedback('重连失败，请重新开始对战', '#ff4444');
            this.leaveBattle();
            return;
        }

        this.reconnectAttempts++;
        
        try {
            if (!this.isSupabaseAvailable()) {
                throw new Error('Supabase未连接');
            }

            const { data: battle, error } = await this.game.state.supabase
                .from('candy_math_battles')
                .select('*')
                .eq('id', this.room.battleId)
                .single();

            if (error || !battle) throw new Error('对战不存在');

            if (battle.status === 'finished') {
                this.showBattleResult(battle);
            } else {
                this.subscribeToBattle(this.room.battleId);
                
                await this.syncScores();
                
                if (this.room.myTurn) {
                    this.autoRefreshGridIfNeeded();
                }
                
                this.showFeedback('重连成功', '#4CAF50');
                this.reconnectAttempts = 0;
            }
        } catch (error) {
            console.error('重连失败:', error);
            setTimeout(() => this.attemptReconnect(), 2000);
        }
    }

    switchToOfflineMode() {
        const currentBattleId = this.room.battleId;
        const currentOpponent = this.room.opponentName;
        
        if (this.room.channel) {
            this.room.channel.unsubscribe();
            this.room.channel = null;
        }
        
        this.room.opponentIsAI = false;
        this.room.battleId = 'offline_' + currentBattleId;
        
        this.sendLocalMessage('📴 网络断开，切换到离线模式');
        this.sendLocalMessage('您的进度将在网络恢复后同步');
        
        this.startLocalPolling();
    }

    async updateELOAfterBattle(battle, winnerId) {
        if (!this.isSupabaseAvailable()) return;

        try {
            const player1ELO = battle.player1_elo || 1200;
            const player2ELO = battle.player2_elo || 1200;
            
            const player1Result = winnerId === battle.player1_id ? 'win' : 
                                  winnerId === 'draw' ? 'draw' : 'lose';
            const player2Result = winnerId === battle.player2_id ? 'win' : 
                                  winnerId === 'draw' ? 'draw' : 'lose';
            
            const player1NewELO = this.calculateNewELO(player1ELO, player2ELO, player1Result);
            const player2NewELO = this.calculateNewELO(player2ELO, player1ELO, player2Result);

            const { data: currentStats } = await this.game.state.supabase
                .from('player_elo')
                .select('battles, wins')
                .in('user_id', [battle.player1_id, battle.player2_id]);

            const statsMap = {};
            if (currentStats) {
                currentStats.forEach(s => {
                    statsMap[s.user_id] = s;
                });
            }

            await this.game.state.supabase
                .from('player_elo')
                .upsert([
                    {
                        user_id: battle.player1_id,
                        elo: Math.round(player1NewELO),
                        battles: (statsMap[battle.player1_id]?.battles || 0) + 1,
                        wins: winnerId === battle.player1_id ? 
                            (statsMap[battle.player1_id]?.wins || 0) + 1 : 
                            (statsMap[battle.player1_id]?.wins || 0),
                        win_rate: this.calculateWinRate(
                            winnerId === battle.player1_id ? 
                                (statsMap[battle.player1_id]?.wins || 0) + 1 : 
                                (statsMap[battle.player1_id]?.wins || 0),
                            (statsMap[battle.player1_id]?.battles || 0) + 1
                        ),
                        updated_at: new Date().toISOString()
                    },
                    {
                        user_id: battle.player2_id,
                        elo: Math.round(player2NewELO),
                        battles: (statsMap[battle.player2_id]?.battles || 0) + 1,
                        wins: winnerId === battle.player2_id ? 
                            (statsMap[battle.player2_id]?.wins || 0) + 1 : 
                            (statsMap[battle.player2_id]?.wins || 0),
                        win_rate: this.calculateWinRate(
                            winnerId === battle.player2_id ? 
                                (statsMap[battle.player2_id]?.wins || 0) + 1 : 
                                (statsMap[battle.player2_id]?.wins || 0),
                            (statsMap[battle.player2_id]?.battles || 0) + 1
                        ),
                        updated_at: new Date().toISOString()
                    }
                ], { onConflict: 'user_id' });
        } catch (error) {
            console.error('更新ELO失败:', error);
        }
    }

    calculateNewELO(myELO, opponentELO, result) {
        myELO = parseInt(myELO) || 1200;
        opponentELO = parseInt(opponentELO) || 1200;
        
        if (myELO < 100) myELO = 1200;
        if (opponentELO < 100) opponentELO = 1200;
        
        const exponent = (opponentELO - myELO) / 400;
        const expected = 1 / (1 + Math.pow(10, exponent));
        
        let actual;
        if (result === 'win') actual = 1;
        else if (result === 'draw') actual = 0.5;
        else actual = 0;
        
        let newELO = myELO + this.constants.ELO_K_FACTOR * (actual - expected);
        newELO = Math.max(400, Math.min(3000, newELO));
        
        return Math.round(newELO * 10) / 10;
    }

    calculateWinRate(wins, battles) {
        if (battles === 0) return 0;
        return Math.round((wins / battles) * 100 * 10) / 10;
    }

    showBattleResultFallback(winnerId) {
        const activeDiv = document.getElementById('battle-active');
        const resultDiv = document.getElementById('battle-result');
        
        if (activeDiv) activeDiv.style.display = 'none';
        if (resultDiv) resultDiv.style.display = 'block';

        const iWon = winnerId === this.game.state.currentUser.id;
        
        const resultTitle = document.getElementById('result-title');
        if (resultTitle) resultTitle.textContent = iWon ? `🏆 ${this.t('win')}` : `😢 ${this.t('lose')}`;

        const myScore = parseInt(this.getMyScoreElement()?.textContent) || 0;
        const opponentScore = parseInt(this.getOpponentScoreElement()?.textContent) || 0;

        const finalPlayerScore = document.getElementById('final-player-score');
        const finalOpponentScore = document.getElementById('final-opponent-score');
        
        if (finalPlayerScore) finalPlayerScore.textContent = myScore;
        if (finalOpponentScore) finalOpponentScore.textContent = opponentScore;

        const myResultCard = document.querySelector('.result-score-card:first-child');
        const opponentResultCard = document.querySelector('.result-score-card:last-child');
        
        if (myResultCard && opponentResultCard) {
            if (iWon) {
                myResultCard.classList.add('winner');
                opponentResultCard.classList.remove('winner');
            } else {
                opponentResultCard.classList.add('winner');
                myResultCard.classList.remove('winner');
            }
        }

        this.playSound(iWon ? 'achievement' : 'wrong');
    }

    showBattleResult(battle) {
        const activeDiv = document.getElementById('battle-active');
        const resultDiv = document.getElementById('battle-result');
        
        if (activeDiv) activeDiv.style.display = 'none';
        if (resultDiv) resultDiv.style.display = 'block';

        const iWon = battle.winner_id === this.game.state.currentUser.id;
        
        const resultTitle = document.getElementById('result-title');
        if (resultTitle) resultTitle.textContent = iWon ? `🏆 ${this.t('win')}` : `😢 ${this.t('lose')}`;

        if (this.room.playerRole === 'player1') {
            const finalPlayerScore = document.getElementById('final-player-score');
            const finalOpponentScore = document.getElementById('final-opponent-score');
            
            if (finalPlayerScore) finalPlayerScore.textContent = battle.player1_score || 0;
            if (finalOpponentScore) finalOpponentScore.textContent = battle.player2_score || 0;
        } else {
            const finalPlayerScore = document.getElementById('final-player-score');
            const finalOpponentScore = document.getElementById('final-opponent-score');
            
            if (finalPlayerScore) finalPlayerScore.textContent = battle.player2_score || 0;
            if (finalOpponentScore) finalOpponentScore.textContent = battle.player1_score || 0;
        }

        const myResultCard = document.querySelector('.result-score-card:first-child');
        const opponentResultCard = document.querySelector('.result-score-card:last-child');
        
        if (myResultCard && opponentResultCard) {
            if (iWon) {
                myResultCard.classList.add('winner');
                opponentResultCard.classList.remove('winner');
            } else {
                opponentResultCard.classList.add('winner');
                myResultCard.classList.remove('winner');
            }
        }

        this.playSound(iWon ? 'achievement' : 'wrong');
    }

    // ==================== 聊天系统 ====================

    async sendChatMessage() {
        const input = document.getElementById('chat-input');
        if (!input || !input.value.trim()) return;

        let text = input.value.trim();
        
        text = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
        
        if (text.length > 200) {
            text = text.substring(0, 200) + '...';
        }
        
        if (text.length === 0) return;
        
        const emojiRegex = /^[\p{Emoji}\s]+$/u;
        if (emojiRegex.test(text) && text.length > 50) {
            text = text.substring(0, 50);
        }
        
        input.value = '';

        if (this.room.opponentIsAI) {
            this.addChatMessage({
                player_id: this.game.state.currentUser.id,
                player_name: this.game.state.currentUser.name,
                message: text
            });
            
            if (this.aiResponseTimer) {
                clearTimeout(this.aiResponseTimer);
                this.aiResponseTimer = null;
            }
            
            if (this.aiResponsePending) {
                this.aiResponsePending = false;
            }
            
            this.aiResponsePending = true;
            
            this.aiResponseTimer = setTimeout(() => {
                this.aiResponseTimer = null;
                this.aiResponsePending = false;
                
                if (!this.room.gameActive) return;
                
                const aiResponses = [
                    '好的！',
                    '继续加油！',
                    '你太厉害了！',
                    '再来一局？',
                    '🤖 正在计算...',
                    '这个选择不错',
                    '我学会了！',
                    '轮到我了！',
                    '看我的！',
                    '😊'
                ];
                const response = aiResponses[Math.floor(Math.random() * aiResponses.length)];
                this.addChatMessage({
                    player_id: this.room.opponentId,
                    player_name: this.room.opponentName,
                    message: response
                });
            }, 1000);
            
            this.saveLocalBattleState();
            return;
        }

        if (!this.isSupabaseAvailable() || !this.room.battleId) return;

        try {
            await this.game.state.supabase
                .from('candy_math_battle_messages')
                .insert([{
                    battle_id: this.room.battleId,
                    player_id: this.game.state.currentUser.id,
                    player_name: this.game.state.currentUser.name,
                    message: text
                }]);
        } catch (error) {
            console.error('发送消息失败:', error);
        }
    }

    async sendSystemMessage(text) {
        if (this.room.opponentIsAI) {
            this.addAIMessage(text);
            return;
        }

        if (!this.isSupabaseAvailable() || !this.room.battleId) return;

        try {
            await this.game.state.supabase
                .from('candy_math_battle_messages')
                .insert([{
                    battle_id: this.room.battleId,
                    player_id: 'system',
                    player_name: '系统',
                    message: text,
                    message_type: 'system'
                }]);
        } catch (error) {
            console.error('发送系统消息失败:', error);
        }
    }

    addChatMessage(message) {
        const chat = document.getElementById('chat-messages');
        if (!chat) return;

        const fragment = document.createDocumentFragment();
        const msgDiv = document.createElement('div');
        
        const displayMessage = message.message.length > 100 
            ? message.message.substring(0, 100) + '...' 
            : message.message;
        
        const escapedMessage = this.escapeHtml(displayMessage);
        const escapedName = this.escapeHtml(message.player_name || '');
        
        if (message.player_id === 'system') {
            msgDiv.className = 'message system';
            msgDiv.textContent = displayMessage;
        } else if (message.player_id === this.game.state?.currentUser?.id) {
            msgDiv.className = 'message self';
            msgDiv.innerHTML = `<span class="message-sender">你:</span> ${escapedMessage}`;
        } else {
            msgDiv.className = 'message opponent';
            msgDiv.innerHTML = `<span class="message-sender">${escapedName}:</span> ${escapedMessage}`;
        }

        fragment.appendChild(msgDiv);
        chat.appendChild(fragment);
        
        this.limitChatMessages(chat);
        
        requestAnimationFrame(() => {
            chat.scrollTop = chat.scrollHeight;
        });
    }

    escapeHtml(text) {
        if (!text) return '';
        
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;')
            .replace(/\//g, '&#x2F;');
    }

    addOpponentMove(round) {
        const chat = document.getElementById('chat-messages');
        if (!chat) return;

        const fragment = document.createDocumentFragment();
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message system';
        
        const result = round.is_correct ? '✓ 正确' : '✗ 错误';
        msgDiv.textContent = `${this.room.opponentName} 选择了 ${round.num1} + ${round.num2} = ${round.num1 + round.num2} ${result}`;
        
        fragment.appendChild(msgDiv);
        chat.appendChild(fragment);
        
        this.limitChatMessages(chat);
        
        requestAnimationFrame(() => {
            chat.scrollTop = chat.scrollHeight;
        });
    }

    // ==================== 退出清理 ====================

    leaveBattle() {
        if (this.isLeaving) return;
        this.isLeaving = true;
        
        try {
            this.clearSoundQueue();
            this.stopAllSounds();
            this.cleanupMatch();

            if (this.game.state.currentUser) {
                this.leaveQueue(this.game.state.currentUser.id);
            }
            
            if (this.room.channel) {
                try {
                    this.room.channel.unsubscribe();
                } catch (e) {
                    console.warn('取消订阅失败:', e);
                }
                this.room.channel = null;
            }
            
            this.stopTurnTimer();
            this.cleanupAIResources();
            this.stopAllTimers();
            this.removeAllEventListeners();
            
            if (this.observers) {
                Object.values(this.observers).forEach(observer => {
                    if (observer) observer.disconnect();
                });
            }
            
            this.hideBattleUI();
            this.resetAllState();
            
            this.safeStorage().removeItem(this.constants.LOCAL_STORAGE_KEY);
        } finally {
            setTimeout(() => {
                this.isLeaving = false;
            }, 500);
        }
    }

    /**
     * 停止所有定时器
     */
    stopAllTimers() {
        const timers = [
            this.aiMoveTimer,
            this.aiResponseTimer,
            this.localPollingTimer,
            this.matchTimeoutId,
            this.longWaitTimer,
            this.reconnectTimer,
            this.clickDebounceTimer,
            this.zoomTimer,
            this.refreshTimer,
            this.heartbeatInterval,
            this.scoreSyncInterval,
            this.queueStatusInterval,
            this.room.roundTimer,
            this.soundProcessTimer
        ];
        
        timers.forEach(timer => {
            if (timer) {
                if (timer.stop) timer.stop();
                if (timer.unref) timer.unref();
                clearTimeout(timer);
                clearInterval(timer);
            }
        });
        
        this.aiMoveTimer = null;
        this.aiResponseTimer = null;
        this.localPollingTimer = null;
        this.matchTimeoutId = null;
        this.longWaitTimer = null;
        this.reconnectTimer = null;
        this.clickDebounceTimer = null;
        this.zoomTimer = null;
        this.refreshTimer = null;
        this.heartbeatInterval = null;
        this.scoreSyncInterval = null;
        this.queueStatusInterval = null;
        this.room.roundTimer = null;
        this.soundProcessTimer = null;
    }

    /**
     * 隐藏所有对战UI
     */
    hideBattleUI() {
        const battleModal = document.querySelector('.battle-modal');
        if (battleModal) {
            battleModal.style.display = 'none';
        }
        
        const battleActive = document.getElementById('battle-active');
        const battleWaiting = document.getElementById('battle-waiting');
        const battleResult = document.getElementById('battle-result');
        
        if (battleActive) battleActive.style.display = 'none';
        if (battleWaiting) battleWaiting.style.display = 'none';
        if (battleResult) battleResult.style.display = 'none';
        
        const tempElements = [
            'match-waiting-hint',
            'ai-option',
            'long-wait-suggestion',
            'offline-hint',
            'zoom-warning'
        ];
        
        tempElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
        
        document.querySelectorAll('.offline-hint, .room-code-hint').forEach(el => el.remove());
    }

    /**
     * 重置所有状态
     */
    resetAllState() {
        this.room = {
            roomCode: null,
            battleId: null,
            playerRole: null,
            opponentId: null,
            opponentName: null,
            opponentIsAI: false,
            aiDifficulty: 'medium',
            status: 'waiting',
            myTurn: false,
            roundTimer: null,
            channel: null,
            subscriptionId: null,
            gameActive: false,
            selectedCards: []
        };
        
        this.matchQueue = [];
        this.reconnectAttempts = 0;
        this.aiMoveRetryCount = 0;
        this.aiGlobalRetryCount = 0;
        this.cardClickProcessing = false;
        this.endTurnInProgress = false;
        this.rematchInProgress = false;
        this.scoreUpdateInProgress = false;
        this.aiResponsePending = false;
        this.refreshCount = 0;
        this.isRefreshing = false;
        
        Object.keys(this.semaphores).forEach(key => {
            this.semaphores[key] = false;
        });
        
        this.cachedElements = null;
        this.clearSoundQueue();
    }

    async rematch() {
        if (this.rematchInProgress) return;
        this.rematchInProgress = true;
        
        try {
            const resultDiv = document.getElementById('battle-result');
            if (resultDiv) resultDiv.style.display = 'none';
            
            if (this.room.opponentIsAI) {
                this.leaveBattle();
                await this.startAIBattle();
            } else {
                this.leaveBattle();
                await this.quickMatch();
            }
        } finally {
            setTimeout(() => {
                this.rematchInProgress = false;
            }, 1000);
        }
    }

    closeBattle() {
        this.leaveBattle();
        if (this.game.ui) {
            this.game.ui.closeModal('battle-modal');
        }
    }

    async destroy() {
        if (this.activePromises.size > 0) {
            console.log(`等待 ${this.activePromises.size} 个 Promise 完成...`);
            await Promise.race([
                Promise.allSettled(Array.from(this.activePromises)),
                new Promise(resolve => setTimeout(resolve, 5000))
            ]);
        }

        this.leaveBattle();
        this.cleanupMatch();
        this.cleanupAIResources();
        
        if (this.onlineHandler) {
            window.removeEventListener('online', this.onlineHandler);
        }
        if (this.offlineHandler) {
            window.removeEventListener('offline', this.offlineHandler);
        }
        if (this.popStateHandler) {
            window.removeEventListener('popstate', this.popStateHandler);
        }
        if (this.visibilityHandler) {
            document.removeEventListener('visibilitychange', this.visibilityHandler);
        }
        if (this.beforeUnloadHandler) {
            window.removeEventListener('beforeunload', this.beforeUnloadHandler);
        }
        
        if (this.broadcastChannel) {
            this.broadcastChannel.close();
            this.broadcastChannel = null;
        }
        
        this.stopAllTimers();
        
        if (this.observers) {
            Object.keys(this.observers).forEach(key => {
                if (this.observers[key]) {
                    this.observers[key].disconnect();
                    this.observers[key] = null;
                }
            });
        }
        
        if (this.room.channel) {
            try {
                this.room.channel.unsubscribe();
            } catch (e) {
                console.warn('取消订阅失败:', e);
            }
            this.room.channel = null;
        }
        
        this.removeAllEventListeners();
        
        this.quickMatchHandler = null;
        this.joinRoomHandler = null;
        this.copyHandler = null;
        this.cancelHandler = null;
        this.sendHandler = null;
        this.chatKeyHandler = null;
        this.rematchHandler = null;
        this.closeHandler = null;
        this.confirmJoinHandler = null;
        this.cancelJoinHandler = null;
        this.gridClickHandler = null;
        this.gridTouchHandler = null;
        this.gridContextHandler = null;
        this.continueWaitingHandler = null;
        this.playWithAIHandler = null;
        this.onlineHandler = null;
        this.offlineHandler = null;
        this.popStateHandler = null;
        this.visibilityHandler = null;
        this.beforeUnloadHandler = null;
        
        const tempElements = [
            'match-waiting-hint',
            'ai-option',
            'candy-battle-styles',
            'zoom-warning',
            'long-wait-suggestion'
        ];
        tempElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
        
        const styleIds = [
            'candy-battle-styles',
            'battle-mode-spinner-style',
            'battle-mode-animations'
        ];
        styleIds.forEach(id => {
            const style = document.getElementById(id);
            if (style) style.remove();
        });
        
        const roomCodeHint = document.querySelector('.room-code-hint');
        if (roomCodeHint) roomCodeHint.remove();
        
        const offlineHints = document.querySelectorAll('.offline-hint');
        offlineHints.forEach(hint => hint.remove());
        
        this.cachedElements = null;
        this.safeStorage().clear();
        this.clearSoundQueue();
        
        this.activePromises.clear();
        if (this.promiseTimeouts) {
            this.promiseTimeouts.forEach(timer => clearTimeout(timer));
            this.promiseTimeouts.clear();
        }
    }
}

// 导出到全局
window.BattleMode = BattleMode;
