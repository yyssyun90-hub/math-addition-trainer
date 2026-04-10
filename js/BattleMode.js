/**
 * ==================== 糖果数学消消乐 - 对战模式 ====================
 * 版本: 9.2.0 (修复版 - AI界面显示 + 有效组合 + 加入房间 + WebSocket)
 * 
 * 功能：
 * - 双人对战：使用 Supabase Realtime WebSocket，实时同步，无延迟
 * - AI对战：延迟答题（3-7秒），多种难度可选
 * - 锦标赛：保留原有功能，使用 Realtime
 * 
 * AI延迟配置：
 * - 简单：延迟 5-7秒，准确率 60%，回合时间 30秒
 * - 中等：延迟 4-6秒，准确率 80%，回合时间 20秒
 * - 困难：延迟 3-5秒，准确率 95%，回合时间 15秒
 * 
 * 修复记录：
 * 2024-04-10 - 修复手机端AI对战界面不显示问题
 * 2024-04-10 - 修复卡片没有有效组合的问题
 * 2024-04-10 - 修复两人对战加入房间失败问题
 * 2024-04-10 - 两人对战改用纯WebSocket实时通信
 * ============================================================
 */

class BattleMode {
    constructor(game) {
        this.game = game;
        this.matchQueue = [];
        this.offlineMode = false;
        this.pendingClicks = [];
        this.maxQueueSize = 20;
        this.activeSubscriptions = new Map();
        this._wrappedMethods = new WeakMap();
        this._lastCacheVersion = 0;
        this.lastZoomWarningTime = 0;
        this.zoomCheckThrottle = null;
        this.cardTemplate = null;
        this.subscriptionCheckTimer = null;
        this.initRetryTimer = null;
        this.matchRetryCount = 0;
        this.isMatching = false;
        this.updateLayoutHandler = null;
        this.keydownHandler = null;
        this.aiCooldownTimer = null;
        
        // 添加防重复销毁标志
        this._isDestroying = false;
        this._initialized = false;
        
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
            selectedCards: [],
            timeLeft: 30,
            tournamentMode: false,
            tournamentId: null,
            tournamentMatchId: null,
            tournamentChannel: null
        };
        
        // AI 延迟配置
        this.aiDelayConfig = {
            easy: { minDelay: 5000, maxDelay: 7000, accuracy: 0.6, turnTime: 30 },
            medium: { minDelay: 4000, maxDelay: 6000, accuracy: 0.8, turnTime: 20 },
            hard: { minDelay: 3000, maxDelay: 5000, accuracy: 0.95, turnTime: 15 }
        };
        
        this.matchTimeoutId = null;
        this.matchStartTime = null;
        this.queueStatusInterval = null;
        this.longWaitTimer = null;
        
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        this.reconnectTimer = null;
        this.broadcastReconnectTimer = null;
        
        this.aiResponseTimer = null;
        this.aiMoveTimer = null;
        this.aiMoveRetryCount = 0;
        this.aiGlobalRetryCount = 0;
        this.aiResponsePending = false;
        this.localPollingTimer = null;
        this.isAIMoving = false;
        
        this.cardClickProcessing = false;
        this.endTurnInProgress = false;
        this.rematchInProgress = false;
        this.scoreUpdateInProgress = false;
        this.isLeaving = false;
        this.isRefreshing = false;
        
        this.cardClickTimer = null;
        this.lastClickCard = null;
        this.CLICK_DEBOUNCE_TIME = 300;
        this.zoomTimer = null;
        this.refreshTimer = null;
        this.refreshCount = 0;
        
        this.semaphores = {
            match: { locked: false, queue: [], maxLength: 10 },
            battle: { locked: false, queue: [], maxLength: 10 },
            score: { locked: false, queue: [], maxLength: 20 },
            turn: { locked: false, queue: [], maxLength: 10 },
            ai: { locked: false, queue: [], maxLength: 5 }
        };
        
        this.activePromises = new Set();
        this.promiseCounter = 0;
        this.promiseTimeouts = new Map();
        
        this.soundQueue = [];
        this.isPlayingSound = false;
        this.maxSoundQueueSize = 10;
        this.soundProcessTimer = null;
        this.lastWrongSoundTime = 0;
        
        this.memoryStorage = new Map();
        
        this.cachedElements = null;
        this.cacheVersion = 0;
        
        this.observers = {
            resize: null,
            mutation: null,
            intersection: null
        };
        
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
        
        // 模式选择事件处理器
        this.aiModeSelectHandler = null;
        this.multiplayerModeSelectHandler = null;
        this.cancelModeSelectHandler = null;
        this.aiEasyHandler = null;
        this.aiMediumHandler = null;
        this.aiHardHandler = null;
        this.cancelAIDifficultyHandler = null;
        this.createRoomBtnHandler = null;
        this.joinRoomSubmenuHandler = null;
        this.confirmJoinRoomHandler = null;
        this.cancelJoinRoomHandler = null;
        this.backToModeSelectHandler = null;
        
        // 轮询定时器
        this.pollingInterval = null;
        this.heartbeatInterval = null;  // WebSocket 心跳
        
        this.constants = {
            MATCH_TIMEOUT: 30000,
            MAX_CHAT_MESSAGES: 100,
            ELO_K_FACTOR: 32,
            BASE_MATCH_RANGE: 400,
            MAX_MATCH_RANGE: 800,
            AI_RESPONSE_DELAY: 1000,
            AI_MOVE_DELAY: 500,
            AI_MAX_RETRIES: 3,
            ROUND_TIME: 30,
            TIME_BONUS_FACTOR: 30,
            MAX_TIME_BONUS: 400,
            LOCAL_STORAGE_KEY: 'candy_battle_local',
            STORAGE_VERSION: '9.2.0',
            STORAGE_EXPIRY: 3600000,
            MAX_REFRESH_COUNT: 3,
            REFRESH_DEBOUNCE: 300,
            SOUND_QUEUE_MAX: 10,
            WRONG_SOUND_COOLDOWN: 200,
            FORCE_MATCH_TIME: 10000,
            MAX_QUEUE_SIZE: 20,
            SOUND_TIMEOUT: 3000,
            ZOOM_WARNING_COOLDOWN: 10000,
            SUBSCRIPTION_CHECK_INTERVAL: 5000,
            INIT_RETRY_DELAY: 1000,
            MAX_INIT_RETRIES: 3,
            AUTH_WAIT_TIMEOUT: 3000,
            MAX_MATCH_RETRIES: 3,
            AI_COOLDOWN_TIME: 2000,
            POLLING_INTERVAL: 2000,
            MAX_POLLING_ATTEMPTS: 60  // 最多轮询 60 次（2 分钟）
        };

        this.setupPromiseErrorHandler();
        this.setupHistoryHandler();
        this.setupTabCommunication();
        this.setupZoomDetection();
        this.setupVisibilityHandler();
        this.setupBeforeUnloadHandler();
        this.createCardTemplate();
        this.startSubscriptionChecker();
        this.setupKeyBindings();
    }

    // ==================== 键盘快捷键绑定 ====================
    setupKeyBindings() {
        this.keydownHandler = (e) => {
            if ((e.key === 'r' || e.key === 'R') && this.room.gameActive && !this.room.opponentIsAI) {
                e.preventDefault();
                this.manualRefreshGrid();
            }
            if (e.key === 'Escape') {
                if (this.game?.ui) {
                    this.game.ui.closeModal('auth-modal');
                    this.game.ui.closeModal('game-over-modal');
                    this.game.ui.closeModal('tutorial-modal');
                    this.game.ui.closeModal('tournament-modal');
                    this.game.ui.closeModal('battle-modal');
                    this.game.ui.closeModal('join-modal');
                    this.game.ui.closeModal('create-tournament-modal');
                }
            }
        };
        document.addEventListener('keydown', this.keydownHandler);
    }

    // ==================== 手动刷新网格 ====================
    manualRefreshGrid() {
        if (!this.room.gameActive) return;
        
        this.refreshBattleGrid();
        this.generateBattleTarget();
        this.showFeedback('🔄 已刷新卡片组合', '#ff9800');
        this.addSystemMessage('你刷新了卡片组合');
        
        if (this.room.selectedCards.length > 0) {
            this.room.selectedCards.forEach(card => {
                if (card && card.classList) card.classList.remove('selected');
            });
            this.room.selectedCards = [];
        }
    }

    // ==================== 修复关闭按钮 ====================
    fixCloseButtons() {
        const closeBtn = document.getElementById('close-battle-btn');
        if (closeBtn) {
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode?.replaceChild(newCloseBtn, closeBtn);
            newCloseBtn.onclick = () => {
                this.leaveBattle();
                if (this.game?.ui) this.game.ui.closeModal('battle-modal');
                const modal = document.getElementById('battle-modal');
                if (modal) modal.style.display = 'none';
            };
        }
        
        const closeResultBtn = document.getElementById('close-result-btn');
        if (closeResultBtn) {
            const newResultBtn = closeResultBtn.cloneNode(true);
            closeResultBtn.parentNode?.replaceChild(newResultBtn, closeResultBtn);
            newResultBtn.onclick = () => {
                this.leaveBattle();
                if (this.game?.ui) this.game.ui.closeModal('battle-modal');
                const modal = document.getElementById('battle-modal');
                if (modal) modal.style.display = 'none';
            };
        }
        
        const rematchBtn = document.getElementById('rematch-btn');
        if (rematchBtn) {
            const newRematchBtn = rematchBtn.cloneNode(true);
            rematchBtn.parentNode?.replaceChild(newRematchBtn, rematchBtn);
            newRematchBtn.onclick = () => {
                this.rematch();
            };
        }
        
        const rematchResultBtn = document.getElementById('rematch-result-btn');
        if (rematchResultBtn) {
            const newRematchResultBtn = rematchResultBtn.cloneNode(true);
            rematchResultBtn.parentNode?.replaceChild(newRematchResultBtn, rematchResultBtn);
            newRematchResultBtn.onclick = () => {
                this.rematch();
            };
        }
    }

    createCardTemplate() {
        this.cardTemplate = document.createElement('div');
        this.cardTemplate.className = 'number-card';
    }

    startSubscriptionChecker() {
        if (this.subscriptionCheckTimer) {
            clearInterval(this.subscriptionCheckTimer);
        }
        
        this.subscriptionCheckTimer = setInterval(() => {
            if (this.room.gameActive && !this.room.opponentIsAI && !this.offlineMode) {
                this.ensureRealtimeSubscription();
            }
        }, this.constants.SUBSCRIPTION_CHECK_INTERVAL);
    }

    ensureRealtimeSubscription() {
        if (this.room.channel && this.room.channel.state === 'joined') {
            return true;
        }
        
        if (!this.room.battleId) {
            return false;
        }
        
        console.log('检测到订阅未开启，尝试重新订阅...');
        this.setupRealtimeSubscription();
        return false;
    }

    async setupRealtimeSubscription() {
        if (!this.isSupabaseAvailable()) {
            console.log('Supabase不可用，跳过实时订阅');
            return false;
        }
        
        try {
            if (this.room.channel) {
                try {
                    await this.room.channel.unsubscribe();
                } catch (e) {
                    console.warn('取消旧订阅失败:', e);
                }
                this.room.channel = null;
            }
            
            console.log('开始创建实时订阅频道...');
            
            const channelName = 'battle-presence';
            const newChannel = this.game.state.supabase.channel(channelName, {
                config: {
                    presence: {
                        key: 'candy-battle'
                    }
                }
            });
            
            newChannel
                .on('presence', { event: 'sync' }, () => {
                    try {
                        const presenceState = newChannel.presenceState();
                        console.log('当前在线玩家:', presenceState);
                        
                        const players = [];
                        Object.values(presenceState).forEach(presences => {
                            if (Array.isArray(presences)) {
                                presences.forEach(presence => {
                                    if (presence.user_id && presence.user_id !== this.game.state.currentUser?.id) {
                                        players.push({
                                            id: presence.user_id,
                                            name: presence.user_name,
                                            status: presence.status,
                                            joinTime: new Date(presence.online_at).getTime()
                                        });
                                    }
                                });
                            } else if (presences && typeof presences === 'object') {
                                Object.values(presences).forEach(presence => {
                                    if (presence.user_id && presence.user_id !== this.game.state.currentUser?.id) {
                                        players.push({
                                            id: presence.user_id,
                                            name: presence.user_name,
                                            status: presence.status,
                                            joinTime: new Date(presence.online_at).getTime()
                                        });
                                    }
                                });
                            }
                        });
                        
                        this.matchQueue = players;
                        console.log('更新匹配队列:', this.matchQueue);
                        
                        if (this.matchQueue.length > 0 && this.isMatching) {
                            this.tryMatch();
                        }
                    } catch (err) {
                        console.warn('处理 presence sync 失败:', err);
                    }
                })
                .on('presence', { event: 'join' }, ({ key, newPresences }) => {
                    console.log('新玩家加入:', newPresences);
                    if (newPresences && newPresences.length > 0) {
                        newPresences.forEach(presence => {
                            if (presence.user_id && presence.user_id !== this.game.state.currentUser?.id) {
                                this.showFeedback(`👋 ${presence.user_name} 进入匹配`, '#a3d8d8');
                            }
                        });
                    }
                })
                .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
                    console.log('玩家离开:', leftPresences);
                    if (leftPresences && leftPresences.length > 0) {
                        leftPresences.forEach(presence => {
                            if (presence.user_id && presence.user_id !== this.game.state.currentUser?.id) {
                                this.showFeedback(`👋 ${presence.user_name} 离开匹配`, '#fbb9c0');
                            }
                        });
                    }
                });
            
            const subscribePromise = new Promise((resolve, reject) => {
                let timeoutId = setTimeout(() => {
                    reject(new Error('订阅超时'));
                }, 10000);
                
                newChannel.subscribe(async (status, err) => {
                    clearTimeout(timeoutId);
                    console.log('订阅回调状态:', status, err);
                    
                    if (status === 'SUBSCRIBED') {
                        console.log('订阅成功');
                        this.room.channel = newChannel;
                        
                        if (this.game.state.currentUser) {
                            try {
                                await newChannel.track({
                                    user_id: this.game.state.currentUser.id,
                                    user_name: this.game.state.currentUser.name,
                                    status: 'idle',
                                    online_at: new Date().toISOString()
                                });
                                console.log('已跟踪当前用户');
                            } catch (trackErr) {
                                console.warn('跟踪用户失败:', trackErr);
                            }
                        }
                        resolve(true);
                    } else if (status === 'CHANNEL_ERROR') {
                        reject(new Error(`频道错误: ${err?.message || '未知错误'}`));
                    } else if (status === 'TIMED_OUT') {
                        reject(new Error('订阅超时'));
                    }
                });
            });
            
            await subscribePromise;
            return true;
            
        } catch (error) {
            console.error('设置实时订阅失败:', error);
            this.offlineMode = true;
            console.log('订阅失败，切换到离线模式，可以使用AI对战');
            return true;
        }
    }

    handlePlayerJoined(newPresences) {
        newPresences.forEach(presence => {
            if (presence.user_id && presence.user_id !== this.game.state.currentUser?.id) {
                this.showFeedback(`👋 ${presence.user_name} 进入匹配`, '#a3d8d8');
            }
        });
    }

    handlePlayerLeft(leftPresences) {
        leftPresences.forEach(presence => {
            if (presence.user_id && presence.user_id !== this.game.state.currentUser?.id) {
                this.showFeedback(`👋 ${presence.user_name} 离开匹配`, '#fbb9c0');
            }
        });
    }

    /**
     * 初始化对战模式
     */
    init() {
        if (this._initialized) {
            console.log('BattleMode 已经初始化，跳过');
            return;
        }
        
        console.log('BattleMode 9.2.0 初始化开始...');
        
        if (this.initRetryTimer) {
            clearTimeout(this.initRetryTimer);
            this.initRetryTimer = null;
        }
        
        try {
            this.leaveBattle();
            this.bindEvents();
            this.setupReconnectionHandler();
            this.injectCandyStyles();
            this.setupResponsiveLayout();
            this.setupSupabaseFunctions();
            this.fixCloseButtons();
            
            this.delayedAuthCheck(0);
            
            this._initialized = true;
            console.log('BattleMode 初始化完成');
            
        } catch (error) {
            console.error('BattleMode 初始化失败:', error);
            this.showFeedback('对战模式初始化失败，请刷新页面', '#fbb9c0');
        }
    }

    delayedAuthCheck(retryCount = 0) {
        if (this.initRetryTimer) {
            clearTimeout(this.initRetryTimer);
            this.initRetryTimer = null;
        }

        if (retryCount >= this.constants.MAX_INIT_RETRIES) {
            console.log('达到最大重试次数，跳过实时订阅初始化');
            return;
        }

        this.initRetryTimer = setTimeout(() => {
            try {
                if (!this.game) {
                    console.log('game 对象不存在，重试中...');
                    this.delayedAuthCheck(retryCount + 1);
                    return;
                }

                if (!this.game.auth) {
                    console.log('auth 模块未就绪，重试中...');
                    this.delayedAuthCheck(retryCount + 1);
                    return;
                }

                if (typeof this.game.auth.isLoggedIn !== 'function') {
                    console.warn('auth.isLoggedIn 不是函数，重试中...');
                    this.delayedAuthCheck(retryCount + 1);
                    return;
                }

                if (this.game.auth.isLoggedIn()) {
                    console.log('用户已登录，初始化实时订阅');
                    this.setupRealtimeSubscription();
                } else {
                    console.log('用户未登录，跳过实时订阅');
                }
            } catch (error) {
                console.error('检查登录状态失败:', error);
                this.delayedAuthCheck(retryCount + 1);
            }
        }, this.constants.INIT_RETRY_DELAY);
    }

    async waitForAuthReady() {
        const startTime = Date.now();
        
        while (true) {
            if (Date.now() - startTime > this.constants.AUTH_WAIT_TIMEOUT) {
                console.log('等待 auth 超时');
                return false;
            }

            if (!this.game) {
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }

            if (!this.game.auth) {
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }

            if (typeof this.game.auth.isLoggedIn !== 'function' ||
                typeof this.game.auth.showAuthModal !== 'function') {
                await new Promise(resolve => setTimeout(resolve, 100));
                continue;
            }

            return true;
        }
    }

    ensureGameObject() {
        if (!this.game) {
            console.log('game 对象不存在，尝试从 window.game 获取');
            if (window.game) {
                this.game = window.game;
                console.log('成功从 window.game 获取 game 对象');
                
                if (!this.game.state) {
                    console.warn('game.state 不存在');
                    return false;
                }
                if (!this.game.auth) {
                    console.warn('game.auth 不存在');
                    return false;
                }
                return true;
            } else {
                console.error('无法从 window.game 获取 game 对象');
                return false;
            }
        }
        
        if (!this.game.state) {
            console.warn('game.state 不存在');
            return false;
        }
        if (!this.game.auth) {
            console.warn('game.auth 不存在');
            return false;
        }
        return true;
    }

    setupResponsiveLayout() {
        this.updateLayoutHandler = () => {
            const width = window.innerWidth;
            const battleContainer = document.querySelector('.battle-container');
            if (!battleContainer) return;

            if (width <= 480) {
                battleContainer.classList.add('mobile');
                battleContainer.classList.remove('tablet', 'desktop');
            } else if (width <= 768) {
                battleContainer.classList.add('tablet');
                battleContainer.classList.remove('mobile', 'desktop');
            } else {
                battleContainer.classList.add('desktop');
                battleContainer.classList.remove('mobile', 'tablet');
            }
        };

        window.addEventListener('resize', this.updateLayoutHandler);
        this.updateLayoutHandler();
    }

    async setupSupabaseFunctions() {
        if (!this.isSupabaseAvailable()) return;

        try {
            const { error } = await this.game.state.supabase
                .rpc('increment_battle_score', {
                    battle_id: '00000000-0000-0000-0000-000000000000',
                    score_field: 'player1_score',
                    progress_field: 'player1_progress',
                    points: 0
                });

            if (error && error.message && error.message.includes('function "increment_battle_score" does not exist')) {
                console.log('创建 increment_battle_score 函数...');
                await this.createIncrementScoreFunction();
            }
        } catch (error) {
            console.warn('Supabase函数检查失败:', error);
        }
    }

    async createIncrementScoreFunction() {
        const createFunctionSQL = `
            CREATE OR REPLACE FUNCTION increment_battle_score(
                battle_id UUID,
                score_field TEXT,
                progress_field TEXT,
                points INTEGER
            ) RETURNS void AS $$
            BEGIN
                EXECUTE format('
                    UPDATE candy_math_battles 
                    SET 
                        %I = COALESCE(%I, 0) + $1,
                        %I = LEAST(100, COALESCE(%I, 0) + 10)
                    WHERE id = $2
                ', score_field, score_field, progress_field, progress_field)
                USING points, battle_id;
            END;
            $$ LANGUAGE plpgsql;
        `;

        try {
            await this.game.state.supabase.rpc('exec_sql', { sql: createFunctionSQL });
        } catch (error) {
            console.warn('无法自动创建函数，请在Supabase SQL编辑器中手动执行:', error);
        }
    }

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
                    localStorage.removeItem(this.constants.LOCAL_STORAGE_KEY);
                } catch (e) {
                    this.memoryStorage?.delete(this.constants.LOCAL_STORAGE_KEY);
                }
            }
        };
    }

    trackPromise(promise, name = 'unnamed', timeout = 30000) {
        const id = ++this.promiseCounter;
        
        let timeoutId = null;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(new Error(`Promise ${name} 超时 (${timeout}ms)`));
            }, timeout);
            
            if (!this.promiseTimeouts) this.promiseTimeouts = new Map();
            this.promiseTimeouts.set(id, timeoutId);
        });
        
        const trackedPromise = Promise.race([promise, timeoutPromise])
            .finally(() => {
                this.activePromises.delete(trackedPromise);
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    this.promiseTimeouts.delete(id);
                }
            });
        
        this.activePromises.add(trackedPromise);
        return trackedPromise;
    }

    cleanupAIResources() {
        if (this.aiMoveTimer) {
            clearTimeout(this.aiMoveTimer);
            this.aiMoveTimer = null;
        }
        
        if (this.aiResponseTimer) {
            clearTimeout(this.aiResponseTimer);
            this.aiResponseTimer = null;
        }
        
        if (this.aiCooldownTimer) {
            clearTimeout(this.aiCooldownTimer);
            this.aiCooldownTimer = null;
        }
        
        this.aiResponsePending = false;
        this.aiMoveRetryCount = 0;
        this.aiGlobalRetryCount = 0;
        this.isAIMoving = false;
    }

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

    resumeAllSounds() {
        try {
            if (typeof SoundManager !== 'undefined' && SoundManager.resumeAll && typeof SoundManager.resumeAll === 'function') {
                SoundManager.resumeAll();
            }
        } catch (error) {
            console.warn('恢复声音失败:', error);
        }
    }

    clearSoundQueue() {
        this.soundQueue = [];
        this.isPlayingSound = false;
        this.lastWrongSoundTime = 0;
        if (this.soundProcessTimer) {
            clearTimeout(this.soundProcessTimer);
            this.soundProcessTimer = null;
        }
    }

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

    async processSoundQueue() {
        if (this.isPlayingSound || this.soundQueue.length === 0) return;
        
        this.isPlayingSound = true;
        const soundName = this.soundQueue.shift();
        
        try {
            if (typeof SoundManager !== 'undefined' && SoundManager.play && typeof SoundManager.play === 'function') {
                await Promise.race([
                    SoundManager.play(soundName),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('声音播放超时')), this.constants.SOUND_TIMEOUT)
                    )
                ]);
            }
        } catch (error) {
            console.warn('播放声音失败:', error);
        } finally {
            this.isPlayingSound = false;
            queueMicrotask(() => this.processSoundQueue());
        }
    }

    injectCandyStyles() {
        const styleId = 'candy-battle-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            /* 柔和多彩的对战样式 */
            :root {
                --soft-pink: #fce4e8;
                --soft-peach: #ffe9e0;
                --soft-mint: #e0f0e5;
                --soft-lavender: #f0e6f2;
                --soft-cream: #fff9e6;
                --soft-rose: #f8d7e3;
                --coral-pink: #feada6;
                --candy-pink: #f5b0c5;
                --mint-green: #a3d8d8;
                --sunshine-yellow: #ffe194;
                --lavender: #d9c6e6;
            }

            * {
                font-family: 'Comic Neue', 'Chalkboard SE', 'Quicksand', 'Segoe UI', sans-serif;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                text-rendering: optimizeLegibility;
                box-sizing: border-box;
            }

            .battle-container {
                width: 100%;
                max-width: 1200px;
                margin: 0 auto;
                padding: 5px;
                overflow-x: hidden;
            }

            .battle-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.2);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 4000;
                display: none;
                justify-content: center;
                align-items: center;
            }

            #battle-grid {
                display: grid;
                grid-template-columns: repeat(5, minmax(0, 1fr));
                gap: 6px;
                padding: 8px;
                background: rgba(255, 249, 252, 0.7);
                backdrop-filter: blur(5px);
                -webkit-backdrop-filter: blur(5px);
                border: 1px solid rgba(255, 220, 230, 0.6);
                border-radius: 16px;
                box-shadow: 0 8px 20px rgba(255, 200, 220, 0.2);
                margin-bottom: 8px;
                width: 100%;
                overflow: hidden;
            }

            #battle-grid .number-card {
                background: linear-gradient(145deg, #ffffff, #fffafc);
                border: 2px solid rgba(255, 220, 230, 0.8);
                border-radius: 10px;
                box-shadow: 0 5px 10px rgba(0, 0, 0, 0.03);
                color: #b2869c;
                font-size: clamp(1.8rem, 8vw, 3.2rem);
                font-weight: 800;
                aspect-ratio: 1 / 1;
                width: 100%;
                max-width: 100%;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s ease;
                position: relative;
                animation: cardAppear 0.3s ease-out;
                -webkit-tap-highlight-color: transparent;
                touch-action: manipulation;
                text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
                margin: 0;
                padding: 0;
                user-select: none;
            }

            @media (max-width: 360px) {
                #battle-grid {
                    gap: 3px;
                    padding: 5px;
                }
                #battle-grid .number-card {
                    font-size: clamp(1.4rem, 7vw, 2.2rem);
                    font-weight: 700;
                }
            }

            @media (min-width: 481px) and (max-width: 768px) {
                #battle-grid .number-card {
                    font-size: clamp(1.6rem, 6vw, 2.5rem);
                }
            }

            @media (min-width: 1200px) {
                #battle-grid .number-card {
                    font-size: clamp(2rem, 4vw, 3.5rem);
                }
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
                transform: translateY(-2px);
                box-shadow: 0 8px 15px rgba(255, 200, 220, 0.3);
                background: linear-gradient(145deg, #ffffff, #fff0f5);
            }

            #battle-grid .number-card:active {
                transform: translateY(1px);
                box-shadow: 0 3px 8px rgba(255, 200, 220, 0.2);
            }

            #battle-grid .number-card.selected {
                background: linear-gradient(145deg, #e0f0e5, #d6eadc);
                border-color: #b8d9c4;
                box-shadow: 0 5px 12px rgba(163, 216, 216, 0.3);
                color: #2b6c6c;
                transform: scale(1.02);
                animation: softPulse 2s ease-in-out infinite;
            }

            @keyframes softPulse {
                0%, 100% { box-shadow: 0 5px 12px rgba(163, 216, 216, 0.2); }
                50% { box-shadow: 0 8px 18px rgba(163, 216, 216, 0.4); }
            }

            #battle-grid .number-card.matched {
                opacity: 0.3;
                transform: scale(0.7);
                pointer-events: none;
                filter: grayscale(0.4);
                animation: vanish 0.3s ease-out;
            }

            @keyframes vanish {
                0% { transform: scale(1); opacity: 1; }
                100% { transform: scale(0); opacity: 0; }
            }

            .battle-target {
                background: radial-gradient(circle at 30% 30%, #fede9e, #fdce7e);
                border: 3px solid white;
                border-radius: 50%;
                box-shadow: 0 10px 20px rgba(254, 190, 120, 0.2);
                color: #b27a58;
                font-size: clamp(2rem, 8vw, 3.5rem);
                font-weight: 600;
                width: min(80px, 20vw);
                height: min(80px, 20vw);
                max-width: 100px;
                max-height: 100px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 5px auto 8px;
                animation: macaronGlow 4s ease-in-out infinite;
                text-shadow: none;
            }

            @media (min-width: 481px) and (max-width: 768px) {
                .battle-target {
                    width: min(100px, 18vw);
                    height: min(100px, 18vw);
                    font-size: clamp(2.5rem, 6vw, 4rem);
                }
            }

            @media (min-width: 769px) {
                .battle-target {
                    width: 120px;
                    height: 120px;
                    font-size: 4rem;
                }
            }

            @keyframes macaronGlow {
                0%, 100% { opacity: 0.95; }
                50% { opacity: 1; box-shadow: 0 15px 25px rgba(254, 190, 120, 0.3); }
            }

            .players-info {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 5px;
                margin-bottom: 5px;
            }

            .player-card {
                flex: 1;
                min-width: 0;
                background: rgba(255, 245, 250, 0.7);
                backdrop-filter: blur(5px);
                -webkit-backdrop-filter: blur(5px);
                border: 1px solid rgba(255, 220, 230, 0.6);
                border-radius: 16px;
                padding: 6px;
                box-shadow: 0 5px 15px rgba(255, 200, 220, 0.1);
                transition: all 0.3s ease;
            }

            .player-card.active {
                border-color: #b8d9c4;
                box-shadow: 0 8px 18px rgba(163, 216, 216, 0.2);
                transform: translateY(-1px);
            }

            .player-avatar {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: linear-gradient(145deg, #feada6, #f5b0c5);
                border: 2px solid white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.2rem;
                color: white;
                box-shadow: 0 3px 8px rgba(254, 173, 166, 0.2);
                margin: 0 auto 3px;
            }

            .player-name {
                font-size: 0.8rem;
                font-weight: 500;
                color: #b2869c;
                text-align: center;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                margin-bottom: 2px;
            }

            .player-score {
                font-size: 1.2rem;
                font-weight: 600;
                color: #d46b8d;
                text-align: center;
                font-family: 'Comic Sans MS', 'Chalkboard SE', cursive;
            }

            @media (min-width: 481px) and (max-width: 768px) {
                .player-avatar {
                    width: 40px;
                    height: 40px;
                    font-size: 1.5rem;
                }
                .player-name {
                    font-size: 0.9rem;
                }
                .player-score {
                    font-size: 1.5rem;
                }
            }

            @media (min-width: 769px) {
                .player-avatar {
                    width: 50px;
                    height: 50px;
                    font-size: 1.8rem;
                }
                .player-name {
                    font-size: 1rem;
                }
                .player-score {
                    font-size: 1.8rem;
                }
            }

            .progress-bar {
                background: rgba(255, 220, 230, 0.3);
                border-radius: 12px;
                height: 12px;
                overflow: hidden;
                margin: 3px 0;
            }

            .progress-fill {
                height: 100%;
                border-radius: 12px;
                transition: width 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
                position: relative;
                overflow: hidden;
            }

            .progress-fill.player1 {
                background: linear-gradient(90deg, #feada6, #f5b0c5);
            }

            .progress-fill.player2 {
                background: linear-gradient(90deg, #a3d8d8, #b8e2e2);
            }

            .turn-indicator {
                background: rgba(255, 245, 250, 0.8);
                backdrop-filter: blur(5px);
                -webkit-backdrop-filter: blur(5px);
                border: 1px solid rgba(255, 220, 230, 0.6);
                border-radius: 25px;
                padding: 6px 12px;
                font-size: 0.9rem;
                font-weight: 500;
                color: #b2869c;
                box-shadow: 0 5px 15px rgba(255, 200, 220, 0.1);
                text-align: center;
                margin-bottom: 8px;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }

            .turn-indicator .turn-text {
                display: inline-block;
                margin-right: 8px;
            }

            .turn-indicator .timer {
                background: white;
                border-radius: 15px;
                padding: 4px 10px;
                color: #d46b8d;
                font-size: 1rem;
                font-weight: 600;
                border: 1px solid rgba(255, 220, 230, 0.6);
                font-family: monospace;
            }

            .timer.warning {
                color: #fbb9c0 !important;
                animation: timerWarning 1s ease-in-out infinite;
            }

            @keyframes timerWarning {
                0%, 100% { transform: scale(1); background: #fff5f5; }
                50% { transform: scale(1.05); background: #ffe5e5; }
            }

            @media (min-width: 481px) and (max-width: 768px) {
                .turn-indicator {
                    font-size: 1rem;
                    padding: 8px 15px;
                }
                .turn-indicator .timer {
                    font-size: 1.2rem;
                }
            }

            @media (min-width: 769px) {
                .turn-indicator {
                    font-size: 1.1rem;
                    padding: 10px 20px;
                }
                .turn-indicator .timer {
                    font-size: 1.3rem;
                }
            }

            .chat-container {
                background: rgba(255, 245, 250, 0.7);
                backdrop-filter: blur(5px);
                -webkit-backdrop-filter: blur(5px);
                border: 1px solid rgba(255, 220, 230, 0.6);
                border-radius: 16px;
                padding: 8px;
                box-shadow: 0 5px 15px rgba(255, 200, 220, 0.1);
                margin-top: 8px;
            }

            .chat-messages {
                background: rgba(255, 255, 255, 0.5);
                border-radius: 12px;
                padding: 6px;
                min-height: 80px;
                max-height: 200px;
                overflow-y: auto;
                border: 1px solid rgba(255, 220, 230, 0.6);
                margin-bottom: 6px;
                -webkit-overflow-scrolling: touch;
            }

            @media (max-width: 768px) {
                .chat-messages {
                    max-height: 150px;
                    min-height: 100px;
                }
            }

            .chat-messages::-webkit-scrollbar {
                width: 4px;
            }

            .chat-messages::-webkit-scrollbar-track {
                background: #fef0f4;
                border-radius: 4px;
            }

            .chat-messages::-webkit-scrollbar-thumb {
                background: #fba9c4;
                border-radius: 4px;
            }

            .message {
                margin: 3px 0;
                padding: 4px 8px;
                border-radius: 12px;
                max-width: 85%;
                word-wrap: break-word;
                font-size: 0.8rem;
                line-height: 1.2;
                animation: messageAppear 0.2s ease-out;
            }

            @keyframes messageAppear {
                from {
                    opacity: 0;
                    transform: translateY(3px);
                }
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }

            .message.self {
                background: linear-gradient(135deg, #feada6, #f5b0c5);
                border-radius: 12px 12px 3px 12px;
                margin-left: auto;
                color: white;
                border: 1px solid white;
            }

            .message.opponent {
                background: white;
                border-radius: 12px 12px 12px 3px;
                margin-right: auto;
                color: #b2869c;
                border: 1px solid rgba(255, 200, 220, 0.6);
            }

            .message.system {
                background: linear-gradient(135deg, #ffe194, #ffd966);
                border-radius: 15px;
                margin: 3px auto;
                text-align: center;
                color: #946f2b;
                font-style: italic;
                max-width: 95%;
                font-size: 0.75rem;
                border: 1px solid white;
            }

            .message-sender {
                font-weight: 600;
                margin-right: 3px;
                color: inherit;
            }

            .chat-input-area {
                display: flex;
                gap: 4px;
                align-items: center;
            }

            .chat-input-area input {
                flex: 1;
                min-width: 0;
                padding: 6px 10px;
                border: 2px solid rgba(255, 200, 220, 0.6);
                border-radius: 20px;
                font-size: 0.8rem;
                background: white;
                transition: all 0.2s ease;
                color: #b2869c;
            }

            .chat-input-area input:focus {
                outline: none;
                border-color: #fba9c4;
                box-shadow: 0 0 0 3px rgba(255, 200, 220, 0.3);
            }

            .chat-input-area input:disabled {
                opacity: 0.6;
                background: #f9f9f9;
                border-color: #ddd;
            }

            /* 柔和多彩的按钮样式 */
            .candy-btn {
                background: rgba(255, 245, 250, 0.8);
                backdrop-filter: blur(5px);
                -webkit-backdrop-filter: blur(5px);
                border: none;
                border-radius: 30px;
                padding: 8px 16px;
                font-size: 0.9rem;
                font-weight: 600;
                color: #9b7b88;
                cursor: pointer;
                box-shadow: 0 8px 15px rgba(230, 200, 210, 0.2);
                transition: all 0.3s ease;
                border: 1px solid rgba(255, 255, 255, 0.8);
                display: inline-flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }

            .candy-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 12px 20px rgba(230, 200, 210, 0.3);
            }

            .candy-btn:active {
                transform: translateY(1px);
                box-shadow: 0 5px 10px rgba(230, 200, 210, 0.15);
            }

            .candy-btn.primary {
                background: linear-gradient(135deg, #feada6, #f5b0c5);
                color: white;
            }

            .candy-btn.secondary {
                background: linear-gradient(135deg, #ffcdb1, #febf9f);
                color: #8b5a44;
            }

            .candy-btn.warning {
                background: linear-gradient(135deg, #fbb9c0, #faa7b0);
                color: white;
            }

            .candy-btn.home {
                background: linear-gradient(135deg, #d9c6e6, #cbafdf);
                color: white;
            }

            .candy-btn.pause {
                background: linear-gradient(135deg, #a5dff9, #8ac4e8);
                color: #2b6c6c;
            }

            .candy-btn.battle {
                background: linear-gradient(135deg, #a3d8d8, #b8e2e2);
                color: #2b6c6c;
            }

            .candy-btn.tournament {
                background: linear-gradient(135deg, #ffe194, #ffd966);
                color: #946f2b;
            }

            .candy-btn.small {
                padding: 4px 8px;
                font-size: 0.7rem;
            }

            .candy-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: translateY(0);
            }

            @media (min-width: 481px) and (max-width: 768px) {
                .candy-btn {
                    padding: 8px 16px;
                    font-size: 0.9rem;
                }
            }

            @media (min-width: 769px) {
                .candy-btn {
                    padding: 10px 20px;
                    font-size: 1rem;
                }
            }

            .waiting-spinner {
                display: inline-block;
                width: 25px;
                height: 25px;
                border: 3px solid rgba(255, 200, 220, 0.3);
                border-top-color: #fba9c4;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin: 8px auto;
            }

            .waiting-spinner-small {
                display: inline-block;
                width: 12px;
                height: 12px;
                border: 2px solid rgba(255, 200, 220, 0.3);
                border-top-color: #fba9c4;
                border-radius: 50%;
                animation: spinSmall 1s linear infinite;
                margin-right: 4px;
            }

            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            @keyframes spinSmall {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }

            .battle-result {
                text-align: center;
                padding: 12px;
                background: rgba(255, 245, 250, 0.8);
                backdrop-filter: blur(10px);
                -webkit-backdrop-filter: blur(10px);
                border-radius: 25px;
                border: 2px solid white;
                box-shadow: 0 15px 25px rgba(0, 0, 0, 0.05);
            }

            .result-title {
                font-size: 1.8rem;
                margin-bottom: 10px;
                animation: resultPop 0.5s ease-out;
                color: #d46b8d;
            }

            @keyframes resultPop {
                0% { transform: scale(0); }
                80% { transform: scale(1.1); }
                100% { transform: scale(1); }
            }

            .result-scores {
                display: flex;
                justify-content: center;
                gap: 15px;
                margin: 10px 0;
            }

            .result-score-card {
                background: white;
                border-radius: 16px;
                padding: 10px;
                min-width: 80px;
                border: 1px solid rgba(255, 200, 220, 0.6);
                box-shadow: 0 5px 10px rgba(0, 0, 0, 0.02);
            }

            .result-score-card.winner {
                border-color: #b8d9c4;
                background: linear-gradient(145deg, #f0f9f2, #e8f2ea);
            }

            .result-score {
                font-size: 2rem;
                font-weight: 600;
                color: #d46b8d;
            }

            .winner .result-score {
                color: #2b6c6c;
            }

            .room-code-hint {
                display: block;
                font-size: 0.6rem;
                color: #b2869c;
                margin-top: 2px;
                cursor: pointer;
                transition: color 0.2s;
            }

            .room-code-hint:hover {
                color: #fba9c4;
            }

            .modal-content {
                background: rgba(255, 255, 255, 0.85);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border-radius: 25px;
                padding: 15px;
                max-width: 350px;
                width: 100%;
                border: 2px solid white;
                box-shadow: 0 20px 30px rgba(0, 0, 0, 0.1);
            }

            .modal-content input {
                width: 100%;
                padding: 10px;
                border: 2px solid rgba(255, 200, 220, 0.6);
                border-radius: 20px;
                font-size: 0.9rem;
                background: white;
                color: #b2869c;
                margin: 8px 0;
            }

            .modal-content input:focus {
                outline: none;
                border-color: #fba9c4;
            }

            .modal-buttons {
                display: flex;
                gap: 8px;
                justify-content: center;
                margin-top: 10px;
            }

            #match-waiting-hint {
                margin-top: 8px;
                padding: 10px;
                background: rgba(255, 245, 250, 0.7);
                backdrop-filter: blur(5px);
                -webkit-backdrop-filter: blur(5px);
                border-radius: 16px;
                border: 1px solid rgba(255, 220, 230, 0.6);
                box-shadow: 0 5px 15px rgba(255, 200, 220, 0.1);
            }

            #ai-option {
                margin-top: 10px;
                padding: 12px;
                background: rgba(255, 245, 250, 0.7);
                backdrop-filter: blur(5px);
                -webkit-backdrop-filter: blur(5px);
                border-radius: 20px;
                border: 1px solid rgba(255, 200, 220, 0.6);
                box-shadow: 0 5px 15px rgba(255, 200, 220, 0.1);
            }

            .offline-hint {
                position: fixed;
                top: 8px;
                right: 8px;
                background: #fbb9c0;
                color: white;
                padding: 6px 12px;
                border-radius: 16px;
                z-index: 10001;
                box-shadow: 0 5px 15px rgba(251, 185, 192, 0.3);
                animation: slideIn 0.3s ease-out;
                font-size: 0.8rem;
                border: 1px solid white;
            }

            #zoom-warning {
                position: fixed;
                top: 8px;
                left: 50%;
                transform: translateX(-50%);
                background: #fbb9c0;
                color: white;
                padding: 6px 12px;
                border-radius: 20px;
                z-index: 10000;
                font-size: 0.8rem;
                box-shadow: 0 5px 15px rgba(251, 185, 192, 0.3);
                border: 1px solid white;
                white-space: nowrap;
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

            .sync-indicator {
                display: inline-block;
                width: 12px;
                height: 12px;
                border: 2px solid rgba(255, 200, 220, 0.3);
                border-top-color: #fba9c4;
                border-radius: 50%;
                animation: spin 0.6s linear infinite;
                margin-left: 4px;
            }

            /* 发送按钮样式 */
            .send-btn {
                background: linear-gradient(135deg, #a3d8d8, #b8e2e2);
                border: none;
                border-radius: 30px;
                padding: 8px 20px;
                color: #2b6c6c;
                font-weight: 600;
                box-shadow: 0 8px 15px rgba(163, 216, 216, 0.2);
                transition: all 0.3s ease;
                border: 1px solid white;
                cursor: pointer;
            }

            .send-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 12px 20px rgba(163, 216, 216, 0.3);
            }

            .send-btn:active {
                transform: translateY(1px);
                box-shadow: 0 5px 10px rgba(163, 216, 216, 0.15);
            }

            /* 手动刷新按钮样式 */
            .manual-refresh-btn {
                background: linear-gradient(135deg, #ffe194, #ffd966);
                color: #946f2b;
                border: none;
                border-radius: 30px;
                padding: 8px 16px;
                font-size: 0.9rem;
                font-weight: 600;
                cursor: pointer;
                margin: 10px;
                transition: all 0.3s ease;
                border: 1px solid white;
            }

            .manual-refresh-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 15px rgba(255, 225, 148, 0.3);
            }
        `;

        document.head.appendChild(style);
        this.addManualRefreshButton();
    }
    
    // ==================== 添加手动刷新按钮 ====================
    addManualRefreshButton() {
        const battleActive = document.getElementById('battle-active');
        if (!battleActive) return;
        
        if (document.getElementById('manual-refresh-btn')) return;
        
        const refreshBtn = document.createElement('button');
        refreshBtn.id = 'manual-refresh-btn';
        refreshBtn.className = 'manual-refresh-btn';
        refreshBtn.innerHTML = '🔄 刷新卡片';
        refreshBtn.style.cssText = 'background: linear-gradient(135deg, #ffe194, #ffd966); color: #946f2b; border: none; border-radius: 30px; padding: 8px 16px; margin: 10px; cursor: pointer; font-weight: 600;';
        refreshBtn.onclick = () => {
            if (this.room.gameActive) {
                this.manualRefreshGrid();
            }
        };
        
        const turnIndicator = document.querySelector('#turn-indicator');
        if (turnIndicator && turnIndicator.parentNode) {
            turnIndicator.parentNode.insertBefore(refreshBtn, turnIndicator.nextSibling);
        } else {
            battleActive.appendChild(refreshBtn);
        }
    }

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

        if (this.updateLayoutHandler) {
            window.removeEventListener('resize', this.updateLayoutHandler);
            this.updateLayoutHandler = null;
        }
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
            this.keydownHandler = null;
        }
    }

    bindEvents() {
        this.removeAllEventListeners();

        const quickMatchBtn = document.getElementById('quick-match-btn');
        if (quickMatchBtn) {
            this.quickMatchHandler = () => this.showModeSelect();
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

        const continueWaitingBtn = document.getElementById('continue-waiting-btn');
        if (continueWaitingBtn) {
            this.continueWaitingHandler = () => this.continueWaiting();
            continueWaitingBtn.addEventListener('click', this.continueWaitingHandler);
        }

        const playWithAIBtn = document.getElementById('play-with-ai-btn');
        if (playWithAIBtn) {
            this.playWithAIHandler = () => this.startAIBattle();
            playWithAIBtn.addEventListener('click', this.playWithAIHandler);
        }

        const battleGrid = document.getElementById('battle-grid');
        if (battleGrid) {
            this.gridClickHandler = (e) => this.handleBattleCardClick(e);
            this.gridTouchHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.touches.length > 1) return;
                this.handleBattleCardClick(e);
            };
            this.gridContextHandler = (e) => e.preventDefault();
            
            battleGrid.addEventListener('click', this.gridClickHandler);
            battleGrid.addEventListener('touchstart', this.gridTouchHandler, { passive: false });
            battleGrid.addEventListener('contextmenu', this.gridContextHandler);
        }
    }

    handleKeydown(e) {
        if (e.key === 'Escape') {
            if (this.game?.ui) {
                this.game.ui.closeModal('auth-modal');
                this.game.ui.closeModal('game-over-modal');
                this.game.ui.closeModal('tutorial-modal');
                this.game.ui.closeModal('tournament-modal');
                this.game.ui.closeModal('battle-modal');
                this.game.ui.closeModal('join-modal');
                this.game.ui.closeModal('create-tournament-modal');
            }
        }
    }

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

    setupReconnectionHandler() {
        if (this.onlineHandler) {
            window.removeEventListener('online', this.onlineHandler);
        }
        if (this.offlineHandler) {
            window.removeEventListener('offline', this.offlineHandler);
        }
        
        this.onlineHandler = () => {
            this.showFeedback('网络已连接', '#a3d8d8');
            this.offlineMode = false;
            if (this.room.status === 'playing' && this.room.battleId && !this.room.opponentIsAI) {
                this.attemptReconnect();
            }
        };
        
        this.offlineHandler = () => {
            this.showFeedback('网络已断开，正在使用离线模式', '#fbb9c0');
            this.offlineMode = true;
            if (!this.room.opponentIsAI && this.room.status === 'playing') {
                this.switchToOfflineMode();
            }
        };
        
        window.addEventListener('online', this.onlineHandler);
        window.addEventListener('offline', this.offlineHandler);
    }

    resetToOnlineState() {
        if (this.localPollingTimer) {
            clearTimeout(this.localPollingTimer);
            this.localPollingTimer = null;
        }
        
        if (this.room.battleId && !this.room.channel) {
            this.subscribeToBattle(this.room.battleId);
        }
        
        this.updateTurnIndicator();
        this.showFeedback('已恢复在线状态', '#a3d8d8');
    }

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
        window.addEventListener('load', () => {
            if (this.room.gameActive) {
                this.ensureRealtimeSubscription();
            }
        });
    }

    initBroadcastChannel() {
        try {
            if (this.broadcastChannel) {
                this.broadcastChannel.close();
            }
            
            this.broadcastChannel = new BroadcastChannel('candy_battle');
            
            this.broadcastChannel.onmessage = (event) => {
                const { type, data } = event.data;
                if (type === 'BATTLE_STARTED' && data.userId === this.game.state?.currentUser?.id) {
                    if (this.room.status !== 'playing') {
                        this.showFeedback('您已在其他标签页开始对战', '#fbb9c0');
                        this.leaveBattle();
                        if (this.game.ui) {
                            this.game.ui.closeModal('battle-modal');
                        }
                    }
                } else if (type === 'PING') {
                    this.broadcastChannel.postMessage({ type: 'PONG' });
                }
            };

            this.broadcastChannel.onclose = () => {
                console.log('BroadcastChannel关闭，尝试重连');
                if (this.broadcastReconnectTimer) {
                    clearTimeout(this.broadcastReconnectTimer);
                }
                this.broadcastReconnectTimer = setTimeout(() => {
                    this.broadcastReconnectTimer = null;
                    this.initBroadcastChannel();
                }, 5000);
            };

            this.broadcastChannel.onerror = (error) => {
                console.warn('BroadcastChannel错误:', error);
                this.broadcastChannel.close();
            };

            this.startBroadcastHeartbeat();
        } catch (e) {
            console.warn('BroadcastChannel初始化失败:', e);
            if (this.broadcastReconnectTimer) {
                clearTimeout(this.broadcastReconnectTimer);
            }
            this.broadcastReconnectTimer = setTimeout(() => {
                this.broadcastReconnectTimer = null;
                this.initBroadcastChannel();
            }, 5000);
        }
    }

    setupTabCommunication() {
        this.initBroadcastChannel();
    }

    startBroadcastHeartbeat() {
        if (this.broadcastHeartbeatTimer) {
            clearInterval(this.broadcastHeartbeatTimer);
        }
        
        this.broadcastHeartbeatTimer = setInterval(() => {
            if (this.broadcastChannel) {
                try {
                    this.broadcastChannel.postMessage({ type: 'PING' });
                } catch (e) {
                    console.warn('BroadcastChannel心跳失败:', e);
                }
            }
        }, 30000);
    }

    setupZoomDetection() {
        this.checkZoom();
        window.addEventListener('resize', () => {
            if (this.zoomTimer) clearTimeout(this.zoomTimer);
            this.zoomTimer = setTimeout(() => this.checkZoom(), 100);
        });
    }

    checkZoom() {
        if (this.zoomCheckThrottle) return;
        
        this.zoomCheckThrottle = setTimeout(() => {
            this.zoomCheckThrottle = null;
            const zoom = Math.round(window.devicePixelRatio * 100);
            const zoomWarning = document.getElementById('zoom-warning');
            if (zoom > 150 || zoom < 80) {
                if (!zoomWarning && Date.now() - this.lastZoomWarningTime > this.constants.ZOOM_WARNING_COOLDOWN) {
                    this.showZoomWarning();
                    this.lastZoomWarningTime = Date.now();
                }
            } else {
                if (zoomWarning) zoomWarning.remove();
            }
        }, 500);
    }

    showZoomWarning() {
        const warning = document.createElement('div');
        warning.id = 'zoom-warning';
        warning.textContent = '检测到页面缩放可能影响显示，建议重置到100%';
        document.body.appendChild(warning);
        setTimeout(() => warning.remove(), 5000);
    }

    setupLayoutObserver() {
        if (this.observers.resize) return;
        const battleContainer = document.querySelector('.battle-container');
        if (!battleContainer) return;
        
        this.observers.resize = new ResizeObserver(entries => {
            for (let entry of entries) {
                const width = entry.contentRect.width;
                if (width <= 480) {
                    battleContainer.classList.add('mobile');
                    battleContainer.classList.remove('tablet', 'desktop');
                } else if (width <= 768) {
                    battleContainer.classList.add('tablet');
                    battleContainer.classList.remove('mobile', 'desktop');
                } else {
                    battleContainer.classList.add('desktop');
                    battleContainer.classList.remove('mobile', 'tablet');
                }
            }
        });
        this.observers.resize.observe(battleContainer);
    }

    setupPromiseErrorHandler() {
        const asyncMethods = [
            'quickMatch', 'joinQueue', 'createBattleRoom', 'startBattle',
            'checkBattleMatch', 'updateBattleScore', 'endTurn', 'endBattle',
            'sendChatMessage', 'rematch', 'attemptReconnect', 'confirmJoin',
            'joinTournamentMatch', 'updateELOAfterBattle'
        ];
        
        asyncMethods.forEach(methodName => {
            const originalMethod = this[methodName];
            if (originalMethod && typeof originalMethod === 'function' && !this._wrappedMethods.has(originalMethod)) {
                const wrappedMethod = async (...args) => {
                    try {
                        return await originalMethod.apply(this, args);
                    } catch (error) {
                        console.error(`方法 ${methodName} 执行失败:`, error);
                        this.showFeedback('操作失败，请重试', '#fbb9c0');
                        return null;
                    }
                };
                this._wrappedMethods.set(originalMethod, true);
                this[methodName] = (...args) => {
                    return this.trackPromise(wrappedMethod(...args), methodName);
                };
            }
        });
    }

    async acquireSemaphore(name, timeout = 5000) {
        const semaphore = this.semaphores[name];
        if (!semaphore) {
            throw new Error(`未知的信号量: ${name}`);
        }

        return new Promise((resolve, reject) => {
            if (semaphore.queue.length >= semaphore.maxLength) {
                reject(new Error(`信号量队列溢出: ${name}`));
                return;
            }

            let isResolved = false;
            const timeoutId = setTimeout(() => {
                if (!isResolved) {
                    const index = semaphore.queue.indexOf(tryAcquire);
                    if (index > -1) semaphore.queue.splice(index, 1);
                    reject(new Error(`获取信号量超时: ${name}`));
                }
            }, timeout);

            const tryAcquire = () => {
                if (!semaphore.locked) {
                    semaphore.locked = true;
                    isResolved = true;
                    clearTimeout(timeoutId);
                    resolve();
                } else {
                    semaphore.queue.push(tryAcquire);
                }
            };
            tryAcquire();
        });
    }

    releaseSemaphore(name) {
        const semaphore = this.semaphores[name];
        if (!semaphore) return;
        semaphore.locked = false;
        if (semaphore.queue.length > 0) {
            const next = semaphore.queue.shift();
            queueMicrotask(() => next());
        }
    }

    showFeedback(message, color = '#a3d8d8') {
        if (this.game?.ui && typeof this.game.ui.showFeedback === 'function') {
            this.game.ui.showFeedback(message, color);
        } else {
            console.log('[BattleMode]', message);
        }
    }

    t(key) {
        try {
            if (typeof I18n !== 'undefined' && I18n.t) {
                return I18n.t(key);
            }
        } catch (error) {}
        const defaults = {
            'win': '胜利', 'lose': '失败', 'yourTurn': '你的回合', 'opponentTurn': '对手回合'
        };
        return defaults[key] || key;
    }

    isSupabaseAvailable() {
        return this.game?.state && this.game.state.supabaseReady && this.game.state.supabase && navigator.onLine && !this.offlineMode;
    }

    getMyScoreElement() {
        if (this.room.opponentIsAI) return document.getElementById('player1-score');
        return this.room.playerRole === 'player1' ? document.getElementById('player1-score') : document.getElementById('player2-score');
    }

    getOpponentScoreElement() {
        if (this.room.opponentIsAI) return document.getElementById('player2-score');
        return this.room.playerRole === 'player1' ? document.getElementById('player2-score') : document.getElementById('player1-score');
    }

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

    disableChatInput(disabled = true) {
        const chatInput = document.getElementById('chat-input');
        const sendButton = document.getElementById('send-message');
        if (chatInput) {
            chatInput.disabled = disabled;
            chatInput.placeholder = disabled ? '对战已结束' : '输入消息...';
        }
        if (sendButton) sendButton.disabled = disabled;
    }

    startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => this.checkConnection(), 30000);
    }

    async checkConnection() {
        if (!this.isSupabaseAvailable() || !this.room.battleId || this.room.opponentIsAI) return;
        try {
            const { error } = await this.game.state.supabase.from('candy_math_battles').select('id').eq('id', this.room.battleId).limit(1).maybeSingle();
            if (error) this.handleConnectionLost();
        } catch (error) { this.handleConnectionLost(); }
    }

    handleConnectionLost() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.showFeedback('连接丢失，请检查网络', '#fbb9c0');
            return;
        }
        this.reconnectAttempts++;
        if (this.room.battleId) this.subscribeToBattle(this.room.battleId);
    }

    async syncScores() {
        if (!this.isSupabaseAvailable() || this.room.opponentIsAI) return;
        try {
            const { data: battle } = await this.game.state.supabase.from('candy_math_battles').select('player1_score, player2_score, player1_progress, player2_progress').eq('id', this.room.battleId).single();
            if (battle) this.updateScoresFromServer(battle);
        } catch (error) { console.error('同步分数失败:', error); }
    }

    updateScoresFromServer(battle) {
        if (!battle) return;
        if (this.room.playerRole === 'player1') {
            this.updateScoreElement('player1-score', battle.player1_score);
            this.updateScoreElement('player2-score', battle.player2_score);
            this.updateProgressElement('player1-progress', battle.player1_progress);
            this.updateProgressElement('player2-progress', battle.player2_progress);
        } else {
            this.updateScoreElement('player1-score', battle.player2_score);
            this.updateScoreElement('player2-score', battle.player1_score);
            this.updateProgressElement('player1-progress', battle.player2_progress);
            this.updateProgressElement('player2-progress', battle.player1_progress);
        }
    }

    updateScoreElement(elementId, value) {
        const el = document.getElementById(elementId);
        if (el) el.textContent = value || 0;
    }

    updateProgressElement(elementId, value) {
        const el = document.getElementById(elementId);
        if (el) el.style.width = (value || 0) + '%';
    }

    startScoreSync() {
        if (this.scoreSyncInterval) clearInterval(this.scoreSyncInterval);
        this.scoreSyncInterval = setInterval(() => this.syncScores(), 10000);
    }
        // ==================== 模式选择界面 ====================

    showModeSelect() {
        if (!this.game.auth || !this.game.auth.isLoggedIn()) {
            this.showFeedback('请先登录', '#ff4444');
            if (this.game.auth) this.game.auth.showAuthModal('login');
            return;
        }

        let modeModal = document.getElementById('battle-mode-select-modal');
        if (!modeModal) {
            modeModal = document.createElement('div');
            modeModal.id = 'battle-mode-select-modal';
            modeModal.className = 'battle-modal';
            modeModal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); backdrop-filter: blur(8px); z-index: 6000; display: none; justify-content: center; align-items: center;';
            modeModal.innerHTML = `
                <div class="battle-card" style="max-width: 400px; background: white; border-radius: 60px; padding: 30px; text-align: center;">
                    <h3 style="color: #d46b8d; margin-bottom: 25px;">${I18n.t('selectBattleMode') || '选择对战模式'}</h3>
                    <div style="display: flex; flex-direction: column; gap: 15px;">
                        <button id="multiplayer-mode-select-btn" class="candy-btn primary" style="padding: 15px; font-size: 1.1rem;">
                            👥 ${I18n.t('multiplayerBattle') || '双人对战'}
                            <span style="font-size: 0.8rem; display: block; color: rgba(255,255,255,0.8);">${I18n.t('multiplayerDesc') || '创建/加入房间，实时对战'}</span>
                        </button>
                        <button id="ai-mode-select-btn" class="candy-btn battle" style="padding: 15px; font-size: 1.1rem;">
                            🤖 ${I18n.t('aiBattle') || 'AI对战'}
                            <span style="font-size: 0.8rem; display: block; color: rgba(255,255,255,0.8);">${I18n.t('aiDesc') || '练习模式，AI有延迟答题'}</span>
                        </button>
                        <button id="cancel-battle-mode-select" class="candy-btn home" style="margin-top: 10px;">${I18n.t('cancel') || '取消'}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modeModal);
        }
        
        modeModal.style.display = 'flex';
        
        const aiModeBtn = document.getElementById('ai-mode-select-btn');
        const multiplayerBtn = document.getElementById('multiplayer-mode-select-btn');
        const cancelBtn = document.getElementById('cancel-battle-mode-select');
        
        if (aiModeBtn) {
            aiModeBtn.onclick = () => {
                modeModal.style.display = 'none';
                this.showAIDifficultySelect();
            };
        }
        if (multiplayerBtn) {
            multiplayerBtn.onclick = () => {
                modeModal.style.display = 'none';
                this.showMultiplayerMenu();
            };
        }
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                modeModal.style.display = 'none';
            };
        }
    }

    showAIDifficultySelect() {
        let difficultyModal = document.getElementById('ai-difficulty-modal');
        if (!difficultyModal) {
            difficultyModal = document.createElement('div');
            difficultyModal.id = 'ai-difficulty-modal';
            difficultyModal.className = 'battle-modal';
            difficultyModal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); backdrop-filter: blur(8px); z-index: 6000; display: none; justify-content: center; align-items: center;';
            difficultyModal.innerHTML = `
                <div class="battle-card" style="max-width: 400px; background: white; border-radius: 60px; padding: 30px; text-align: center;">
                    <h3 style="color: #d46b8d; margin-bottom: 20px;">${I18n.t('selectAIDifficulty') || '选择 AI 难度'}</h3>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <button id="ai-easy-btn" class="candy-btn" style="background: linear-gradient(145deg, #c3e6cb, #a7d8b5); color: #2d6a4f;">
                            🍬 ${I18n.t('aiEasy') || '简单'}
                            <span style="font-size: 0.75rem; display: block;">${I18n.t('aiEasyDesc') || '延迟5-7秒，适合新手'}</span>
                        </button>
                        <button id="ai-medium-btn" class="candy-btn" style="background: linear-gradient(145deg, #ffd8b1, #ffc999); color: #b85e3a;">
                            🍭 ${I18n.t('aiMedium') || '中等'}
                            <span style="font-size: 0.75rem; display: block;">${I18n.t('aiMediumDesc') || '延迟4-6秒，稍有挑战'}</span>
                        </button>
                        <button id="ai-hard-btn" class="candy-btn" style="background: linear-gradient(145deg, #ffc4c4, #ffadad); color: #a34141;">
                            🍫 ${I18n.t('aiHard') || '困难'}
                            <span style="font-size: 0.75rem; display: block;">${I18n.t('aiHardDesc') || '延迟3-5秒，高手挑战'}</span>
                        </button>
                        <button id="cancel-ai-difficulty" class="candy-btn home" style="margin-top: 10px;">${I18n.t('back') || '返回'}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(difficultyModal);
        }
        
        difficultyModal.style.display = 'flex';
        
        const easyBtn = document.getElementById('ai-easy-btn');
        const mediumBtn = document.getElementById('ai-medium-btn');
        const hardBtn = document.getElementById('ai-hard-btn');
        const cancelBtn = document.getElementById('cancel-ai-difficulty');
        
        if (easyBtn) {
            easyBtn.onclick = () => {
                difficultyModal.style.display = 'none';
                this.startAIBattleWithDifficulty('easy');
            };
        }
        if (mediumBtn) {
            mediumBtn.onclick = () => {
                difficultyModal.style.display = 'none';
                this.startAIBattleWithDifficulty('medium');
            };
        }
        if (hardBtn) {
            hardBtn.onclick = () => {
                difficultyModal.style.display = 'none';
                this.startAIBattleWithDifficulty('hard');
            };
        }
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                difficultyModal.style.display = 'none';
                this.showModeSelect();
            };
        }
    }

    showMultiplayerMenu() {
        let multiplayerModal = document.getElementById('multiplayer-menu-modal');
        if (!multiplayerModal) {
            multiplayerModal = document.createElement('div');
            multiplayerModal.id = 'multiplayer-menu-modal';
            multiplayerModal.className = 'battle-modal';
            multiplayerModal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.3); backdrop-filter: blur(8px); z-index: 6000; display: none; justify-content: center; align-items: center;';
            multiplayerModal.innerHTML = `
                <div class="battle-card" style="max-width: 400px; background: white; border-radius: 60px; padding: 30px; text-align: center;">
                    <h3 style="color: #d46b8d; margin-bottom: 20px;">👥 ${I18n.t('multiplayerBattle') || '双人对战'}</h3>
                    <div style="display: flex; gap: 15px; justify-content: center; margin-bottom: 20px;">
                        <button id="create-room-btn" class="candy-btn primary" style="padding: 12px 25px;">🏠 ${I18n.t('createRoom') || '创建房间'}</button>
                        <button id="join-room-submenu-btn" class="candy-btn secondary" style="padding: 12px 25px;">🔑 ${I18n.t('joinRoomBtn') || '加入房间'}</button>
                    </div>
                    <div id="join-room-input-area" style="display: none; margin-top: 15px;">
                        <input type="text" id="room-code-join-input" placeholder="${I18n.t('enterRoomCodePlaceholder') || '输入6位房间码'}" maxlength="6" style="width: 100%; padding: 12px; margin-bottom: 10px; border-radius: 30px; border: 2px solid #ffb6c1; text-transform: uppercase;">
                        <div style="display: flex; gap: 10px;">
                            <button id="confirm-join-room" class="candy-btn primary" style="flex: 1;">${I18n.t('confirm') || '确认加入'}</button>
                            <button id="cancel-join-room" class="candy-btn home" style="flex: 1;">${I18n.t('back') || '返回'}</button>
                        </div>
                    </div>
                    <button id="back-to-mode-select" class="candy-btn home" style="margin-top: 15px;">${I18n.t('back') || '返回'}</button>
                </div>
            `;
            document.body.appendChild(multiplayerModal);
        }
        
        multiplayerModal.style.display = 'flex';
        
        const createRoomBtn = document.getElementById('create-room-btn');
        const joinRoomBtn = document.getElementById('join-room-submenu-btn');
        const confirmJoinRoom = document.getElementById('confirm-join-room');
        const cancelJoinRoom = document.getElementById('cancel-join-room');
        const backBtn = document.getElementById('back-to-mode-select');
        const joinInputArea = document.getElementById('join-room-input-area');
        const roomInput = document.getElementById('room-code-join-input');
        
        if (createRoomBtn) {
            createRoomBtn.onclick = () => {
                multiplayerModal.style.display = 'none';
                this.createBattleRoom();
            };
        }
        if (joinRoomBtn) {
            joinRoomBtn.onclick = () => {
                if (joinInputArea) joinInputArea.style.display = 'block';
                if (roomInput) {
                    roomInput.value = '';
                    roomInput.focus();
                    // 自动转大写
                    roomInput.addEventListener('input', function(e) {
                        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                    });
                    // 按回车加入
                    roomInput.onkeypress = (e) => {
                        if (e.key === 'Enter') {
                            const code = roomInput.value.toUpperCase();
                            if (code && code.length === 6) {
                                multiplayerModal.style.display = 'none';
                                this.joinBattleRoom(code);
                            } else {
                                this.showFeedback(I18n.t('invalidRoomCode') || '请输入6位房间码', '#ff4444');
                            }
                        }
                    };
                }
            };
        }
        if (confirmJoinRoom) {
            confirmJoinRoom.onclick = () => {
                const roomCode = roomInput?.value?.toUpperCase();
                if (roomCode && roomCode.length === 6) {
                    multiplayerModal.style.display = 'none';
                    this.joinBattleRoom(roomCode);
                } else {
                    this.showFeedback(I18n.t('invalidRoomCode') || '请输入6位房间码', '#ff4444');
                }
            };
        }
        if (cancelJoinRoom) {
            cancelJoinRoom.onclick = () => {
                if (joinInputArea) joinInputArea.style.display = 'none';
                if (roomInput) roomInput.value = '';
            };
        }
        if (backBtn) {
            backBtn.onclick = () => {
                multiplayerModal.style.display = 'none';
                this.showModeSelect();
            };
        }
    }

    // ==================== AI 对战 ====================

    startAIBattleWithDifficulty(difficulty) {
        console.log(`启动 AI 对战，难度: ${difficulty}`);
        this.cleanupAIResources();
        this.cleanupMatch();
        
        this.fixCloseButtons();

        const aiPlayer = {
            id: 'ai_' + Math.random().toString(36).substring(2, 8),
            name: this.getAIName(difficulty),
            elo: 1200
        };

        this.room.opponentIsAI = true;
        this.room.aiDifficulty = difficulty;
        this.room.opponentId = aiPlayer.id;
        this.room.opponentName = aiPlayer.name;
        this.room.playerRole = 'player1';
        this.room.status = 'playing';
        this.room.gameActive = true;
        this.room.selectedCards = [];
        this.refreshCount = 0;
        this.offlineMode = false;

        const config = this.aiDelayConfig[difficulty];
        this.room.timeLeft = config.turnTime;

        const firstPlayer = Math.random() < 0.5 ? this.game.state.currentUser.id : aiPlayer.id;
        
        // ✅ 关键修复：确保模态框打开并等待 DOM 完全渲染
        if (this.game && this.game.ui) {
            this.game.ui.openModal('battle-modal');
        } else {
            const modal = document.getElementById('battle-modal');
            if (modal) modal.style.display = 'flex';
        }
        
        // ✅ 使用 requestAnimationFrame 确保 DOM 已渲染
        const doInitialize = () => {
            const waitingDiv = document.getElementById('battle-waiting');
            const activeDiv = document.getElementById('battle-active');
            
            if (!waitingDiv || !activeDiv) {
                console.log('等待对战界面元素渲染...');
                requestAnimationFrame(doInitialize);
                return;
            }
            
            this.initializeBattleUI(
                this.game.state.currentUser,
                aiPlayer,
                firstPlayer
            );

            this.generateBattleGrid();
            this.generateBattleTarget();
            this.showRoomCode();
            this.addManualRefreshButton();

            const difficultyText = { easy: '简单', medium: '中等', hard: '困难' }[difficulty];
            const delayText = { easy: '5-7秒', medium: '4-6秒', hard: '3-5秒' }[difficulty];
            
            this.addSystemMessage(`⚔️ 与AI对战开始！ (难度: ${difficultyText}，AI思考时间: ${delayText})`);
            
            if (this.room.myTurn) {
                this.addSystemMessage(`你的回合，时间限制: ${this.room.timeLeft}秒`);
                this.startTurnTimer();
            } else {
                this.addSystemMessage(`${aiPlayer.name} 的回合，请稍候...`);
                this.scheduleAIMove();
            }
            
            this.showFeedback(`AI难度: ${difficultyText}，AI会思考后再答题`, '#a3d8d8');
        };
        
        setTimeout(() => {
            requestAnimationFrame(doInitialize);
        }, 100);
    }

    getAIName(difficulty) {
        const names = {
            easy: ['🍬 糖果新手', '🍭 小糖豆', '🎈 气球AI', '🌟 星星AI'],
            medium: ['🤖 中级AI', '🍫 巧克力AI', '🎯 靶心AI', '✨ 星光AI'],
            hard: ['👑 大师AI', '⚡ 闪电AI', '🔥 烈焰AI', '💎 钻石AI']
        };
        const selectedNames = names[difficulty] || names.medium;
        const name = selectedNames[Math.floor(Math.random() * selectedNames.length)];
        const difficultyText = { easy: ' (简单)', medium: ' (中等)', hard: ' (困难)' }[difficulty];
        return name + difficultyText;
    }

    scheduleAIMove() {
        if (!this.room.gameActive || this.room.myTurn || this.isAIMoving) return;
        
        if (this.aiMoveTimer) clearTimeout(this.aiMoveTimer);
        
        const config = this.aiDelayConfig[this.room.aiDifficulty];
        const delay = Math.floor(Math.random() * (config.maxDelay - config.minDelay + 1)) + config.minDelay;
        
        this.addSystemMessage(`🤖 AI 思考中... (约 ${Math.round(delay/1000)} 秒后作答)`);
        
        this.aiMoveTimer = setTimeout(() => {
            this.aiMoveTimer = null;
            if (this.room.gameActive && !this.room.myTurn && !this.isAIMoving) {
                this.makeAIMove();
            }
        }, delay);
    }

    async makeAIMove() {
        if (this.isAIMoving) return;
        this.isAIMoving = true;
        
        try {
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

            const cards = Array.from(grid.querySelectorAll('.number-card:not(.matched)'));
            
            if (!cards || cards.length < 2) {
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
            
            const config = this.aiDelayConfig[this.room.aiDifficulty];
            let move = null;
            
            if (Math.random() < config.accuracy) {
                move = this.findCorrectMove(cards, target);
            }
            
            if (!move && cards.length >= 2) {
                const index1 = Math.floor(Math.random() * cards.length);
                let index2 = Math.floor(Math.random() * cards.length);
                let attempts = 0;
                while (index2 === index1 && cards.length > 1 && attempts < 10) {
                    index2 = Math.floor(Math.random() * cards.length);
                    attempts++;
                }
                if (cards[index1] && cards[index2] && index1 !== index2) {
                    move = [cards[index1], cards[index2]];
                }
            }
            
            if (!move) {
                this.refreshBattleGrid();
                this.scheduleAIMove();
                return;
            }

            const [card1, card2] = move;
            if (!card1 || !card2 || !card1.isConnected || !card2.isConnected) {
                this.scheduleAIMove();
                return;
            }
            
            card1.classList.add('selected');
            card2.classList.add('selected');
            
            setTimeout(() => {
                this.executeAIMove(card1, card2, target);
            }, 800);
            
        } catch (error) {
            console.error('AI移动失败:', error);
            this.scheduleAIMove();
        } finally {
            this.isAIMoving = false;
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

    async executeAIMove(card1, card2, target) {
        if (!this.room.gameActive) return;

        const num1 = parseInt(card1.dataset.value);
        const num2 = parseInt(card2.dataset.value);
        const sum = num1 + num2;
        const isCorrectMove = sum === target;

        const result = isCorrectMove ? '✓ 正确' : '✗ 错误';
        this.addSystemMessage(`${this.room.opponentName} 选择了 ${num1} + ${num2} = ${sum} ${result}`);

        if (isCorrectMove) {
            this.playSound('correct');
            
            card1.classList.add('matched');
            card2.classList.add('matched');
            
            setTimeout(() => {
                if (card1.isConnected) card1.remove();
                if (card2.isConnected) card2.remove();
            }, 300);

            this.updateAIScore(true);
            this.generateBattleTarget();

            const remaining = document.querySelectorAll('#battle-grid .number-card:not(.matched)');
            if (remaining.length < 4) {
                this.refreshBattleGrid();
            }

            const aiProgress = document.getElementById('player2-progress');
            if (aiProgress && parseInt(aiProgress.style.width) >= 100) {
                this.endBattle(this.room.opponentId);
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
        }

        this.room.myTurn = true;
        this.updateTurnIndicator();
        
        const config = this.aiDelayConfig[this.room.aiDifficulty];
        this.room.timeLeft = config.turnTime;
        this.startTurnTimer();
        
        this.addSystemMessage(`你的回合，时间限制: ${this.room.timeLeft}秒`);
    }

    updateAIScore(isCorrect) {
        if (!isCorrect) return;

        const aiScoreEl = document.getElementById('player2-score');
        if (aiScoreEl) {
            const currentScore = parseInt(aiScoreEl.textContent) || 0;
            aiScoreEl.textContent = currentScore + 10;
        }

        const aiProgress = document.getElementById('player2-progress');
        if (aiProgress) {
            const currentProgress = parseInt(aiProgress.style.width) || 0;
            const newProgress = Math.min(100, currentProgress + 10);
            aiProgress.style.width = newProgress + '%';
        }
    }

    // ==================== 双人对战 - 房间管理 ====================

    async createBattleRoom() {
        if (!this.isSupabaseAvailable()) {
            this.showFeedback('网络未连接，无法创建房间', '#ff4444');
            return;
        }

        const user = this.game.state.currentUser;
        if (!user) {
            this.showFeedback('请先登录', '#ff4444');
            if (this.game.auth) this.game.auth.showAuthModal('login');
            return;
        }

        try {
            // 生成不重复的房间码
            let roomCode;
            let isUnique = false;
            let attempts = 0;
            const maxAttempts = 5;
            
            do {
                roomCode = this.generateRoomCode();
                attempts++;
                
                const { data: existing } = await this.game.state.supabase
                    .from('candy_math_battles')
                    .select('id')
                    .eq('room_code', roomCode)
                    .eq('status', 'waiting')
                    .maybeSingle();
                
                if (!existing) {
                    isUnique = true;
                }
            } while (!isUnique && attempts < maxAttempts);
            
            if (!isUnique) {
                this.showFeedback('创建房间失败，请重试', '#ff4444');
                return;
            }
            
            console.log(`创建房间: ${roomCode}`);
            
            const { data: battle, error } = await this.game.state.supabase
                .from('candy_math_battles')
                .insert([{
                    room_code: roomCode,
                    player1_id: user.id,
                    player1_name: user.name || user.email,
                    status: 'waiting',
                    mode: 'challenge',
                    difficulty: 'medium',
                    created_at: new Date().toISOString(),
                    player1_score: 0,
                    player2_score: 0,
                    player1_progress: 0,
                    player2_progress: 0
                }])
                .select()
                .single();

            if (error) {
                console.error('创建房间失败:', error);
                
                if (error.code === '23505') {
                    this.showFeedback('房间码冲突，正在重试...', '#ffa500');
                    setTimeout(() => this.createBattleRoom(), 500);
                    return;
                }
                
                this.showFeedback('创建房间失败: ' + (error.message || '未知错误'), '#ff4444');
                return;
            }

            console.log('房间创建成功:', battle.id, roomCode);
            
            this.room.battleId = battle.id;
            this.room.roomCode = roomCode;
            this.room.playerRole = 'player1';
            this.room.status = 'waiting';
            this.room.opponentIsAI = false;
            
            if (this.game.ui) {
                this.game.ui.closeModal('join-modal');
            }
            
            this.showWaitingForOpponent(roomCode);
            this.startWaitingPolling();
            
            this.showFeedback(`房间创建成功！房间码: ${roomCode}`, '#a3d8d8');
            
        } catch (error) {
            console.error('创建房间异常:', error);
            this.showFeedback('创建房间失败，请重试', '#ff4444');
        }
    }

    async joinBattleRoom(roomCode) {
        if (!this.isSupabaseAvailable()) {
            this.showFeedback('网络未连接，请检查网络', '#ff4444');
            return;
        }

        const user = this.game.state.currentUser;
        if (!user) {
            this.showFeedback('请先登录', '#ff4444');
            if (this.game.auth) this.game.auth.showAuthModal('login');
            return;
        }

        if (!roomCode || roomCode.length !== 6) {
            this.showFeedback('房间码必须是6位字符', '#ff4444');
            return;
        }

        try {
            console.log(`尝试加入房间: ${roomCode}`);
            
            const { data: battle, error } = await this.game.state.supabase
                .from('candy_math_battles')
                .select('*')
                .eq('room_code', roomCode.toUpperCase())
                .maybeSingle();

            if (error) {
                console.error('查询房间失败:', error);
                this.showFeedback('查询房间失败，请重试', '#ff4444');
                return;
            }

            if (!battle) {
                this.showFeedback('房间不存在，请检查房间码', '#ff4444');
                return;
            }

            if (battle.status !== 'waiting') {
                this.showFeedback('房间已开始或已结束', '#ffa500');
                return;
            }

            if (battle.player1_id === user.id) {
                this.showFeedback('不能加入自己创建的房间', '#ffa500');
                return;
            }

            if (battle.player2_id) {
                this.showFeedback('房间已满', '#ffa500');
                return;
            }

            const { error: updateError } = await this.game.state.supabase
                .from('candy_math_battles')
                .update({
                    player2_id: user.id,
                    player2_name: user.name || user.email,
                    status: 'playing',
                    started_at: new Date().toISOString(),
                    current_turn: battle.player1_id
                })
                .eq('id', battle.id);

            if (updateError) {
                console.error('更新房间失败:', updateError);
                
                if (updateError.code === '23505' || updateError.message.includes('duplicate')) {
                    this.showFeedback('房间刚被其他人加入', '#ffa500');
                } else {
                    this.showFeedback('加入房间失败，请重试', '#ff4444');
                }
                return;
            }

            console.log('成功加入房间:', battle.id);
            
            this.room.battleId = battle.id;
            this.room.roomCode = roomCode;
            this.room.playerRole = 'player2';
            this.room.opponentId = battle.player1_id;
            this.room.opponentName = battle.player1_name;
            this.room.status = 'playing';
            this.room.gameActive = true;
            this.room.myTurn = false;
            this.room.opponentIsAI = false;
            this.room.timeLeft = 30;
            
            if (this.game.ui) {
                this.game.ui.closeModal('join-modal');
            }
            
            this.showFeedback('成功加入房间！', '#a3d8d8');
            this.startBattleAfterJoin();
            
        } catch (error) {
            console.error('加入房间异常:', error);
            this.showFeedback('加入房间失败，请重试', '#ff4444');
        }
    }

    showWaitingForOpponent(roomCode) {
        if (this.game.ui) {
            this.game.ui.openModal('battle-modal');
        }
        
        const waitingDiv = document.getElementById('battle-waiting');
        const activeDiv = document.getElementById('battle-active');
        const resultDiv = document.getElementById('battle-result');
        
        if (waitingDiv) {
            waitingDiv.style.display = 'block';
            waitingDiv.innerHTML = `
                <div class="waiting-spinner">🔄</div>
                <h3 style="color: #d46b8d;">${I18n.t('waitingForOpponent') || '等待对手加入...'}</h3>
                <div class="room-code-display">
                    ${I18n.t('roomCodeLabel') || '房间码'}: <span id="room-code">${roomCode}</span>
                    <button class="copy-btn" id="copy-room-code">📋</button>
                </div>
                <div class="waiting-players">
                    <div class="player-slot">
                        <div class="player-avatar">👤</div>
                        <div class="player-name">${I18n.t('youLabel') || '你'}</div>
                    </div>
                    <div class="vs-divider">VS</div>
                    <div class="player-slot empty">
                        <div class="player-avatar">❓</div>
                        <div class="player-name">${I18n.t('waitingLabel') || '等待中...'}</div>
                    </div>
                </div>
                <button class="cancel-btn" id="cancel-match">${I18n.t('cancelLabel') || '取消'}</button>
            `;
            
            const copyBtn = document.getElementById('copy-room-code');
            if (copyBtn) {
                copyBtn.onclick = () => this.copyRoomCode();
            }
            
            const cancelBtn = document.getElementById('cancel-match');
            if (cancelBtn) {
                cancelBtn.onclick = () => this.cancelMatch();
            }
        }
        
        if (activeDiv) activeDiv.style.display = 'none';
        if (resultDiv) resultDiv.style.display = 'none';
    }

    startWaitingPolling() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        
        let pollCount = 0;
        
        this.pollingInterval = setInterval(async () => {
            if (this.room.status !== 'waiting') {
                clearInterval(this.pollingInterval);
                this.pollingInterval = null;
                return;
            }
            
            pollCount++;
            
            if (pollCount > this.constants.MAX_POLLING_ATTEMPTS) {
                clearInterval(this.pollingInterval);
                this.pollingInterval = null;
                
                const waitingDiv = document.getElementById('battle-waiting');
                if (waitingDiv) {
                    const timeoutHint = document.createElement('div');
                    timeoutHint.style.cssText = 'margin-top: 15px; color: #ffa500;';
                    timeoutHint.innerHTML = `
                        <p>⏰ 等待时间较长</p>
                        <p>可以将房间码分享给朋友，或取消后与AI对战</p>
                    `;
                    waitingDiv.appendChild(timeoutHint);
                }
                return;
            }
            
            try {
                const { data: battle, error } = await this.game.state.supabase
                    .from('candy_math_battles')
                    .select('*')
                    .eq('id', this.room.battleId)
                    .maybeSingle();
                
                if (error) {
                    console.error('轮询房间状态失败:', error);
                    return;
                }
                
                if (!battle) {
                    clearInterval(this.pollingInterval);
                    this.pollingInterval = null;
                    this.showFeedback('房间已失效', '#ff4444');
                    this.cancelMatch();
                    return;
                }
                
                if (battle.status === 'playing' && battle.player2_id) {
                    clearInterval(this.pollingInterval);
                    this.pollingInterval = null;
                    
                    this.room.opponentId = battle.player2_id;
                    this.room.opponentName = battle.player2_name;
                    this.room.status = 'playing';
                    this.room.gameActive = true;
                    this.room.myTurn = battle.current_turn === this.game.state.currentUser.id;
                    this.room.timeLeft = 30;
                    
                    console.log('对手已加入:', battle.player2_name);
                    this.startBattleAfterJoin();
                }
            } catch (error) {
                console.error('轮询房间状态异常:', error);
            }
        }, this.constants.POLLING_INTERVAL);
    }

    startBattleAfterJoin() {
        const opponent = {
            id: this.room.opponentId,
            name: this.room.opponentName
        };
        
        const firstPlayer = this.room.myTurn ? this.game.state.currentUser.id : this.room.opponentId;
        
        this.initializeBattleUI(
            this.game.state.currentUser,
            opponent,
            firstPlayer
        );

        this.generateBattleGrid();
        this.generateBattleTarget();
        this.showRoomCode();
        this.addManualRefreshButton();
        this.fixCloseButtons();
        
        if (this.room.myTurn) {
            this.startTurnTimer();
        }
        
        // ✅ 改用 WebSocket 实时订阅
        this.subscribeToBattleRealtime(this.room.battleId);
    }

    // ✅ 新增：纯 WebSocket 实时订阅
    subscribeToBattleRealtime(battleId) {
        if (!this.isSupabaseAvailable()) {
            console.log('Supabase不可用，使用轮询备用');
            this.startBattlePolling();
            return;
        }
        
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        
        if (this.room.channel) {
            this.room.channel.unsubscribe();
            this.room.channel = null;
        }
        
        console.log('🔌 建立 WebSocket 实时连接...');
        
        this.room.channel = this.game.state.supabase
            .channel(`battle-realtime-${battleId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'candy_math_battles',
                filter: `id=eq.${battleId}`
            }, (payload) => {
                const battle = payload.new;
                console.log('📡 收到实时更新:', battle);
                
                if (this.room.playerRole === 'player1') {
                    this.updateScoreUI('player1-score', battle.player1_score);
                    this.updateScoreUI('player2-score', battle.player2_score);
                    this.updateProgressUI('player1-progress', battle.player1_progress);
                    this.updateProgressUI('player2-progress', battle.player2_progress);
                } else {
                    this.updateScoreUI('player1-score', battle.player2_score);
                    this.updateScoreUI('player2-score', battle.player1_score);
                    this.updateProgressUI('player1-progress', battle.player2_progress);
                    this.updateProgressUI('player2-progress', battle.player1_progress);
                }
                
                const newTurn = battle.current_turn === this.game.state.currentUser.id;
                if (newTurn !== this.room.myTurn) {
                    this.room.myTurn = newTurn;
                    this.updateTurnIndicator();
                    
                    if (this.room.myTurn) {
                        this.startTurnTimer();
                        this.addSystemMessage('你的回合');
                        this.showFeedback('轮到你了！', '#a3d8d8');
                    } else {
                        this.stopTurnTimer();
                        this.addSystemMessage(`等待 ${this.room.opponentName} 操作`);
                    }
                }
                
                if (battle.status === 'finished') {
                    this.showBattleResult(battle);
                }
            })
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'candy_math_battle_rounds',
                filter: `battle_id=eq.${battleId}`
            }, (payload) => {
                const round = payload.new;
                if (round.player_id !== this.game.state.currentUser.id) {
                    this.addOpponentMove(round);
                }
            })
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'candy_math_battle_messages',
                filter: `battle_id=eq.${battleId}`
            }, (payload) => {
                const message = payload.new;
                if (message.player_id !== this.game.state.currentUser.id) {
                    this.addChatMessage(message);
                }
            })
            .subscribe((status, err) => {
                if (status === 'SUBSCRIBED') {
                    console.log('✅ WebSocket 实时连接已建立');
                    this.addSystemMessage('📡 实时连接已建立');
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    console.error('❌ WebSocket 连接失败，切换到轮询模式');
                    this.startBattlePolling();
                } else if (status === 'CLOSED') {
                    console.log('🔌 WebSocket 连接关闭，尝试重连...');
                    setTimeout(() => {
                        if (this.room.gameActive) {
                            this.subscribeToBattleRealtime(battleId);
                        }
                    }, 3000);
                }
            });
        
        this.startRealtimeHeartbeat();
    }

    startRealtimeHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        
        this.heartbeatInterval = setInterval(() => {
            if (this.room.channel && this.room.channel.state === 'joined') {
                this.room.channel.send({
                    type: 'broadcast',
                    event: 'heartbeat',
                    payload: { 
                        user_id: this.game.state.currentUser?.id,
                        battle_id: this.room.battleId,
                        timestamp: Date.now()
                    }
                }).catch(() => {});
            }
        }, 30000);
    }

    startBattlePolling() {
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        
        this.pollingInterval = setInterval(async () => {
            if (!this.room.gameActive) return;
            
            try {
                const { data: battle, error } = await this.game.state.supabase
                    .from('candy_math_battles')
                    .select('*')
                    .eq('id', this.room.battleId)
                    .single();
                
                if (error) throw error;
                
                if (this.room.playerRole === 'player1') {
                    this.updateScoreUI('player1-score', battle.player1_score);
                    this.updateScoreUI('player2-score', battle.player2_score);
                    this.updateProgressUI('player1-progress', battle.player1_progress);
                    this.updateProgressUI('player2-progress', battle.player2_progress);
                } else {
                    this.updateScoreUI('player1-score', battle.player2_score);
                    this.updateScoreUI('player2-score', battle.player1_score);
                    this.updateProgressUI('player1-progress', battle.player2_progress);
                    this.updateProgressUI('player2-progress', battle.player1_progress);
                }
                
                const newTurn = battle.current_turn === this.game.state.currentUser.id;
                if (newTurn !== this.room.myTurn && !this.room.opponentIsAI) {
                    this.room.myTurn = newTurn;
                    this.updateTurnIndicator();
                    
                    if (this.room.myTurn) {
                        this.startTurnTimer();
                        this.addSystemMessage('你的回合');
                    } else {
                        this.stopTurnTimer();
                        this.addSystemMessage(`等待 ${this.room.opponentName} 操作`);
                    }
                }
                
                if (battle.status === 'finished') {
                    this.showBattleResult(battle);
                }
            } catch (error) {
                console.error('轮询对战状态失败:', error);
            }
        }, this.constants.POLLING_INTERVAL);
    }

    updateScoreUI(elementId, value) {
        const el = document.getElementById(elementId);
        if (el) el.textContent = value || 0;
    }

    updateProgressUI(elementId, value) {
        const el = document.getElementById(elementId);
        if (el) el.style.width = (value || 0) + '%';
    }

    async updateBattleScore(points) {
        if (this.scoreUpdateInProgress) return;
        this.scoreUpdateInProgress = true;

        try {
            if (this.room.opponentIsAI) {
                this.updateLocalScore(points);
                return;
            }

            if (!this.isSupabaseAvailable() || !this.room.gameActive) {
                this.updateLocalScore(points);
                return;
            }

            const field = this.room.playerRole === 'player1' ? 'player1_score' : 'player2_score';
            const progressField = this.room.playerRole === 'player1' ? 'player1_progress' : 'player2_progress';

            const { error } = await this.game.state.supabase
                .rpc('increment_battle_score', {
                    battle_id: this.room.battleId,
                    score_field: field,
                    progress_field: progressField,
                    points: points
                });

            if (error) throw error;
            
        } catch (error) {
            console.error('更新分数失败:', error);
            this.updateLocalScore(points);
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
    }

    async endTurn() {
        if (!this.room.gameActive || this.endTurnInProgress) return;
        this.endTurnInProgress = true;
        
        try {
            this.refreshCount = 0;
            this.stopTurnTimer();
            
            if (this.room.opponentIsAI) {
                this.room.myTurn = false;
                this.updateTurnIndicator();
                this.scheduleAIMove();
                return;
            }

            if (!this.isSupabaseAvailable() || !this.room.gameActive) {
                this.room.myTurn = !this.room.myTurn;
                this.updateTurnIndicator();
                return;
            }
            
            const nextTurn = this.room.playerRole === 'player1' 
                ? this.room.opponentId 
                : this.game.state.currentUser.id;

            const { error } = await this.game.state.supabase
                .from('candy_math_battles')
                .update({ current_turn: nextTurn })
                .eq('id', this.room.battleId);

            if (error) throw error;
            
        } catch (error) {
            console.error('结束回合失败:', error);
            this.room.myTurn = true;
            this.startTurnTimer();
        } finally {
            this.endTurnInProgress = false;
        }
    }

    // ==================== 快速匹配 ====================

    async quickMatch() {
        if (this.isMatching) {
            console.log('已经在匹配中，请稍候');
            this.showFeedback('正在匹配中，请稍候', '#fbb9c0');
            return;
        }

        try {
            await this.acquireSemaphore('match');
            this.isMatching = true;
            console.log('开始快速匹配');
            
            if (!this.ensureGameObject()) {
                this.releaseSemaphore('match');
                this.isMatching = false;
                this.showFeedback('游戏初始化失败，请刷新页面', '#fbb9c0');
                return;
            }

            const authReady = await this.waitForAuthReady();
            if (!authReady) {
                this.releaseSemaphore('match');
                this.isMatching = false;
                this.showFeedback('登录模块加载失败，请刷新页面', '#fbb9c0');
                return;
            }

            if (!this.game.auth || !this.game.auth.isLoggedIn()) {
                this.showFeedback('请先登录才能进行对战', '#fbb9c0');
                if (this.game.auth) this.game.auth.showAuthModal('login');
                this.releaseSemaphore('match');
                this.isMatching = false;
                return;
            }

            if (!this.cardTemplate) {
                this.cardTemplate = document.createElement('div');
                this.cardTemplate.className = 'number-card';
            }

            const subscribed = await this.setupRealtimeSubscription();
            if (!subscribed) {
                this.showFeedback('无法连接匹配服务器，请使用AI对战', '#ffa500');
                this.releaseSemaphore('match');
                this.isMatching = false;
                this.showModeSelect();
                return;
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));

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

            if (this.room.channel && this.game.state.currentUser) {
                try {
                    await this.room.channel.track({
                        user_id: this.game.state.currentUser.id,
                        user_name: this.game.state.currentUser.name,
                        status: 'matching',
                        room_code: roomCode,
                        online_at: new Date().toISOString()
                    });
                    console.log('已加入匹配队列');
                } catch (error) {
                    console.warn('更新presence状态失败:', error);
                }
            }

            this.matchTimeoutId = setTimeout(() => {
                console.log('匹配超时');
                this.handleMatchTimeout();
            }, this.constants.MATCH_TIMEOUT);

            this.longWaitTimer = setTimeout(() => {
                this.longWaitTimer = null;
                this.showLongWaitSuggestion();
            }, 15000);

            this.startQueueStatusUpdate();
            
        } catch (error) {
            console.error('quickMatch 执行失败:', error);
            this.showFeedback('匹配失败，请重试', '#fbb9c0');
        } finally {
            this.releaseSemaphore('match');
            this.isMatching = false;
        }
    }

    showMatchWaitingUI() {
        const waitingDiv = document.getElementById('battle-waiting');
        if (!waitingDiv) return;

        const oldHint = document.getElementById('match-waiting-hint');
        if (oldHint) oldHint.remove();

        const hintDiv = document.createElement('div');
        hintDiv.id = 'match-waiting-hint';
        hintDiv.innerHTML = `
            <div style="margin-bottom: 5px; display: flex; align-items: center; justify-content: center;">
                <span class="waiting-spinner-small"></span>
                <span id="match-status-text" style="font-size: 0.9rem; font-weight: 500; color: #b2869c; margin-left: 8px;">${I18n.t('waitingForPlayers') || '正在寻找对手...'}</span>
            </div>
            <div id="queue-status" style="font-size: 0.8rem; color: #b2869c; text-align: center;">
                ${I18n.t('playersOnlineLabel') || '当前在线玩家'}: <span id="queue-count" style="font-weight: 500; color: #fba9c4;">0</span>
            </div>
            <div style="font-size: 0.75rem; color: #b2869c; margin-top: 3px; text-align: center;">
                ${I18n.t('waitTimeLabel') || '等待时间'}: <span id="wait-time" style="font-weight: 500;">0</span>${I18n.t('secondsLabel') || '秒'}
            </div>
            <div style="margin-top: 5px; font-size: 0.7rem; color: #fba9c4; text-align: center;">
                ✨ ${I18n.t('matchFoundLabel') || '检测到其他玩家时会立即匹配'} ✨
            </div>
        `;
        waitingDiv.appendChild(hintDiv);
    }

    startQueueStatusUpdate() {
        if (this.queueStatusInterval) clearInterval(this.queueStatusInterval);
        
        this.queueStatusInterval = setInterval(() => {
            const queueCount = document.getElementById('queue-count');
            if (queueCount) queueCount.textContent = this.matchQueue.length;

            const waitTimeSpan = document.getElementById('wait-time');
            if (waitTimeSpan && this.matchStartTime) {
                const waitSeconds = Math.floor((Date.now() - this.matchStartTime) / 1000);
                waitTimeSpan.textContent = waitSeconds;
            }

            const matchStatus = document.getElementById('match-status-text');
            if (matchStatus) {
                if (this.matchQueue.length >= 1) {
                    matchStatus.textContent = `🎉 ${I18n.t('matchFoundLabel') || '找到对手！准备开始对战...'}`;
                } else {
                    matchStatus.textContent = `⏳ ${I18n.t('waitingForPlayers') || '等待其他玩家加入...'}`;
                }
            }
        }, 1000);
    }

    stopQueueStatusUpdate() {
        if (this.queueStatusInterval) {
            clearInterval(this.queueStatusInterval);
            this.queueStatusInterval = null;
        }
    }

    handleMatchTimeout() {
        this.matchTimeoutId = null;
        this.stopQueueStatusUpdate();
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
        aiDiv.innerHTML = `
            <div style="font-size: 2rem; margin-bottom: 5px;">😢</div>
            <p style="margin-bottom: 5px; font-weight: 500; color: #b2869c; font-size: 0.9rem;">${I18n.t('noPlayersOnlineLabel') || '当前没有其他玩家在线'}</p>
            <p style="margin-bottom: 8px; font-size: 0.8rem; color: #b2869c;">${I18n.t('playWithAILabel') || '您可以继续等待，或者与AI练习对战'}</p>
            <div style="display: flex; gap: 5px; justify-content: center;">
                <button class="candy-btn primary small" style="flex: 1;">⏳ ${I18n.t('continueWaitingLabel') || '继续等待'}</button>
                <button class="candy-btn secondary small" style="flex: 1;">🤖 ${I18n.t('playWithAILabel') || '与AI对战'}</button>
            </div>
        `;

        const continueBtn = aiDiv.querySelector('.candy-btn.primary');
        const aiBtn = aiDiv.querySelector('.candy-btn.secondary');

        continueBtn.onclick = () => {
            aiDiv.remove();
            this.quickMatch();
        };

        aiBtn.onclick = () => {
            aiDiv.remove();
            this.showAIDifficultySelect();
        };

        waitingDiv.appendChild(aiDiv);
    }

    continueWaiting() {
        const suggestion = document.getElementById('long-wait-suggestion');
        if (suggestion) suggestion.remove();
        this.quickMatch();
    }

    showLongWaitSuggestion() {
        const waitingDiv = document.getElementById('battle-waiting');
        if (!waitingDiv) return;
        
        if (document.getElementById('long-wait-suggestion')) return;
        
        const suggestion = document.createElement('div');
        suggestion.id = 'long-wait-suggestion';
        suggestion.style.cssText = `
            margin-top: 8px;
            padding: 6px;
            background: #fff3e0;
            border-radius: 12px;
            border: 1px solid #febf9f;
            color: #b85e3a;
            font-size: 0.8rem;
            text-align: center;
        `;
        
        suggestion.innerHTML = `
            ⏳ 等待时间较长，您可以：
            <button class="candy-btn small" style="margin: 0 2px;">${I18n.t('continueWaitingLabel') || '继续等待'}</button>
            <button class="candy-btn small secondary" style="margin: 0 2px;">${I18n.t('playWithAILabel') || '与AI对战'}</button>
        `;
        
        const continueBtn = suggestion.querySelector('.candy-btn.small');
        const aiBtn = suggestion.querySelector('.candy-btn.small.secondary');
        
        continueBtn.onclick = () => this.continueWaiting();
        aiBtn.onclick = () => {
            this.continueWaiting();
            this.showAIDifficultySelect();
        };
        
        waitingDiv.appendChild(suggestion);
    }

    async tryMatch() {
        console.log('尝试匹配，当前队列:', this.matchQueue);
        
        const otherPlayers = this.matchQueue.filter(p => p.id !== this.game.state.currentUser?.id);
        
        if (otherPlayers.length === 0) {
            console.log('没有其他玩家在线');
            return;
        }

        console.log('找到其他在线玩家:', otherPlayers.length, '人');
        const bestMatch = otherPlayers[0];
        
        console.log('立即匹配到对手:', bestMatch);
        
        this.showFeedback(`🎉 找到对手: ${bestMatch.name}`, '#a3d8d8');
        
        const matchStatus = document.getElementById('match-status-text');
        if (matchStatus) {
            matchStatus.textContent = '🎉 找到对手！准备开始对战...';
        }
        
        this.cleanupMatch();
        this.matchQueue = this.matchQueue.filter(p => p.id !== bestMatch.id);
        
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        await this.createBattleRoomWithPlayer(bestMatch);
    }

    async createBattleRoomWithPlayer(opponent) {
        const user = this.game.state.currentUser;
        
        try {
            const roomCode = this.generateRoomCode();
            
            const { data: battle, error } = await this.game.state.supabase
                .from('candy_math_battles')
                .insert([{
                    room_code: roomCode,
                    player1_id: user.id,
                    player1_name: user.name,
                    player2_id: opponent.id,
                    player2_name: opponent.name,
                    status: 'playing',
                    mode: 'challenge',
                    difficulty: 'medium',
                    started_at: new Date().toISOString(),
                    current_turn: Math.random() < 0.5 ? user.id : opponent.id,
                    player1_score: 0,
                    player2_score: 0,
                    player1_progress: 0,
                    player2_progress: 0
                }])
                .select()
                .single();

            if (error) throw error;

            this.room.battleId = battle.id;
            this.room.roomCode = roomCode;
            this.room.playerRole = 'player1';
            this.room.opponentId = opponent.id;
            this.room.opponentName = opponent.name;
            this.room.status = 'playing';
            this.room.gameActive = true;
            this.room.myTurn = battle.current_turn === user.id;
            this.room.opponentIsAI = false;
            this.room.timeLeft = 30;
            
            this.startBattleAfterJoin();
            
        } catch (error) {
            console.error('创建对战房间失败:', error);
            this.showFeedback('创建对战失败，请重试', '#ff4444');
        }
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

        if (this.room.channel) {
            this.room.channel.track({
                user_id: this.game.state.currentUser?.id,
                user_name: this.game.state.currentUser?.name,
                status: 'idle',
                online_at: new Date().toISOString()
            }).catch(() => {});
        }

        const aiOption = document.getElementById('ai-option');
        if (aiOption) aiOption.remove();

        const waitingHint = document.getElementById('match-waiting-hint');
        if (waitingHint) waitingHint.remove();
        
        const longWait = document.getElementById('long-wait-suggestion');
        if (longWait) longWait.remove();

        this.matchStartTime = null;
        this.matchQueue = [];
    }

    generateRoomCode() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    copyRoomCode() {
        if (this.room.roomCode) {
            navigator.clipboard.writeText(this.room.roomCode);
            this.showFeedback('复制成功', '#a3d8d8');
        }
    }

    cancelMatch() {
        this.cleanupMatch();
        if (this.game.ui) {
            this.game.ui.closeModal('battle-modal');
        }
    }

    // ==================== 通用对战逻辑 ====================

    initializeBattleUI(player1, player2, firstPlayerId) {
        const waitingDiv = document.getElementById('battle-waiting');
        const activeDiv = document.getElementById('battle-active');
        const resultDiv = document.getElementById('battle-result');
        
        if (!waitingDiv || !activeDiv) {
            console.error('对战界面元素未找到，重试中...');
            setTimeout(() => this.initializeBattleUI(player1, player2, firstPlayerId), 50);
            return;
        }
        
        if (waitingDiv) waitingDiv.style.display = 'none';
        if (activeDiv) activeDiv.style.display = 'block';
        if (resultDiv) resultDiv.style.display = 'none';

        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) chatMessages.innerHTML = '';

        this.setPlayerUI('player1', player1);
        this.setPlayerUI('player2', player2);

        this.resetScoresAndProgress();

        this.room.myTurn = firstPlayerId === this.game.state.currentUser.id;
        this.updateTurnIndicator();
        this.updateProgressBars();
        this.fixCloseButtons();
        this.addManualRefreshButton();
        
        const grid = document.getElementById('battle-grid');
        if (!grid) {
            console.error('battle-grid 元素未找到！');
        }
        
        this.addSystemMessage('⚔️ 对战开始！');
        if (this.room.myTurn) {
            this.addSystemMessage('你的回合，请选择卡片');
            this.startTurnTimer();
        } else {
            this.addSystemMessage(`等待 ${this.room.opponentName} 操作`);
        }
    }

    setPlayerUI(playerNum, player) {
        const nameEl = document.getElementById(`${playerNum}-name`);
        const avatarEl = document.getElementById(`${playerNum}-avatar`);
        
        if (nameEl) nameEl.textContent = player.name;
        if (avatarEl) avatarEl.textContent = player.name?.charAt(0).toUpperCase() || '👤';
    }

    resetScoresAndProgress() {
        const elements = ['player1-score', 'player2-score', 'player1-progress', 'player2-progress'];
        elements.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                if (id.includes('progress')) el.style.width = '0%';
                else el.textContent = '0';
            }
        });
    }

    generateBattleGrid() {
        const grid = document.getElementById('battle-grid');
        if (!grid) return;

        const targetEl = document.getElementById('battle-target-number');
        const target = targetEl ? parseInt(targetEl.textContent) : 10;
        
        let numbers;
        let attempts = 0;
        const maxAttempts = 20;
        let hasValidPair = false;
        
        do {
            numbers = [];
            for (let i = 0; i < 10; i++) {
                numbers.push(Math.floor(Math.random() * 10));
            }
            
            hasValidPair = false;
            for (let i = 0; i < numbers.length; i++) {
                for (let j = i + 1; j < numbers.length; j++) {
                    if (numbers[i] + numbers[j] === target) {
                        hasValidPair = true;
                        break;
                    }
                }
                if (hasValidPair) break;
            }
            
            attempts++;
        } while (!hasValidPair && attempts < maxAttempts);
        
        if (!hasValidPair) {
            const num1 = Math.floor(Math.random() * Math.min(target + 1, 10));
            const num2 = target - num1;
            if (num2 >= 0 && num2 <= 9) {
                numbers[0] = num1;
                numbers[1] = num2;
            }
        }

        const fragment = document.createDocumentFragment();
        numbers.forEach(num => {
            const card = this.cardTemplate.cloneNode(false);
            card.dataset.value = num;
            card.textContent = num;
            fragment.appendChild(card);
        });
        
        grid.innerHTML = '';
        grid.appendChild(fragment);
    }

    refreshBattleGrid() {
        const grid = document.getElementById('battle-grid');
        if (!grid) return;

        const targetEl = document.getElementById('battle-target-number');
        const target = targetEl ? parseInt(targetEl.textContent) : 10;
        
        let numbers;
        let attempts = 0;
        const maxAttempts = 20;
        let hasValidPair = false;
        
        do {
            numbers = [];
            for (let i = 0; i < 10; i++) {
                numbers.push(Math.floor(Math.random() * 10));
            }
            
            hasValidPair = false;
            for (let i = 0; i < numbers.length; i++) {
                for (let j = i + 1; j < numbers.length; j++) {
                    if (numbers[i] + numbers[j] === target) {
                        hasValidPair = true;
                        break;
                    }
                }
                if (hasValidPair) break;
            }
            
            attempts++;
        } while (!hasValidPair && attempts < maxAttempts);
        
        if (!hasValidPair) {
            const num1 = Math.floor(Math.random() * Math.min(target + 1, 10));
            const num2 = target - num1;
            if (num2 >= 0 && num2 <= 9) {
                numbers[0] = num1;
                numbers[1] = num2;
            }
        }
        
        const fragment = document.createDocumentFragment();
        numbers.forEach(num => {
            const card = this.cardTemplate.cloneNode(false);
            card.dataset.value = num;
            card.textContent = num;
            fragment.appendChild(card);
        });
        
        grid.innerHTML = '';
        grid.appendChild(fragment);
        
        if (this.room.selectedCards.length > 0) {
            this.room.selectedCards = [];
        }
    }

    generateBattleTarget() {
        const target = Math.floor(Math.random() * 10) + 5;
        const targetEl = document.getElementById('battle-target-number');
        if (targetEl) targetEl.textContent = target;
    }
        async handleBattleCardClick(e) {
        if (!this.room.gameActive || !this.room.myTurn) return;
        
        const card = e.target.closest('.number-card');
        if (!card || card.classList.contains('matched')) return;

        if (this.room.selectedCards.includes(card)) {
            card.classList.remove('selected');
            this.room.selectedCards = this.room.selectedCards.filter(c => c !== card);
            return;
        }

        if (this.cardClickProcessing) {
            if (this.pendingClicks.length < this.constants.MAX_QUEUE_SIZE) {
                this.pendingClicks.push(card);
            }
            return;
        }
        
        if (this.room.selectedCards.length >= 2) return;

        this.cardClickProcessing = true;

        try {
            this.playSound('click');
            card.classList.add('selected');
            this.room.selectedCards.push(card);

            if (this.room.selectedCards.length === 2) {
                if (this.cardClickTimer) clearTimeout(this.cardClickTimer);
                this.cardClickTimer = setTimeout(() => {
                    this.cardClickTimer = null;
                    this.checkBattleMatch().finally(() => {
                        this.cardClickProcessing = false;
                        this.processPendingClick();
                    });
                }, 100);
            } else {
                this.cardClickProcessing = false;
                this.processPendingClick();
            }
        } catch (error) {
            console.error('卡片点击处理错误:', error);
            this.room.selectedCards.forEach(c => {
                if (c && c.isConnected) c.classList.remove('selected');
            });
            this.room.selectedCards = [];
            this.cardClickProcessing = false;
        }
    }

    processPendingClick() {
        if (this.pendingClicks.length > 0 && !this.cardClickProcessing) {
            const nextCard = this.pendingClicks.shift();
            const fakeEvent = { target: nextCard };
            this.handleBattleCardClick(fakeEvent);
        }
    }

    async checkBattleMatch() {
        const [card1, card2] = this.room.selectedCards;
        
        if (!card1 || !card2) {
            this.room.selectedCards = [];
            return;
        }

        if (!card1.isConnected || !card2.isConnected) {
            this.room.selectedCards = [];
            return;
        }

        const targetEl = document.getElementById('battle-target-number');
        if (!targetEl) {
            this.room.selectedCards = [];
            return;
        }

        const target = parseInt(targetEl.textContent);
        const num1 = parseInt(card1.dataset.value);
        const num2 = parseInt(card2.dataset.value);
        const sum = num1 + num2;
        const isCorrect = sum === target;

        if (isCorrect) {
            await this.handleCorrectMatch(card1, card2);
        } else {
            await this.handleIncorrectMatch(card1, card2);
        }

        this.room.selectedCards = [];
        await this.endTurn();
    }

    async handleCorrectMatch(card1, card2) {
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
        if (remaining.length < 4) this.refreshBattleGrid();
        
        setTimeout(() => this.autoRefreshGridIfNeeded(), 500);
    }

    async handleIncorrectMatch(card1, card2) {
        this.playSound('wrong');
        this.generateBattleTarget();
        
        setTimeout(() => {
            if (card1.isConnected) card1.classList.remove('selected');
            if (card2.isConnected) card2.classList.remove('selected');
        }, 500);
        
        setTimeout(() => this.autoRefreshGridIfNeeded(), 500);
    }

    autoRefreshGridIfNeeded() {
        if (!this.room.gameActive) return;
        
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
        
        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = null;
            
            if (this.refreshCount > this.constants.MAX_REFRESH_COUNT) {
                this.refreshCount = 0;
                this.endTurn();
                return;
            }
            
            if (!this.checkGridHasValidCombination()) {
                this.refreshBattleGrid();
                this.generateBattleTarget();
                this.refreshCount++;
                this.showFeedback('✨ 重新生成数字组合', '#fba9c4');
            } else {
                this.refreshCount = 0;
            }
        }, this.constants.REFRESH_DEBOUNCE);
    }

    checkGridHasValidCombination() {
        const grid = document.getElementById('battle-grid');
        if (!grid) return true;

        const cards = Array.from(grid.querySelectorAll('.number-card:not(.matched)'));
        if (cards.length < 2) return false;

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
        return false;
    }

    startTurnTimer() {
        this.stopTurnTimer();
        
        const timerEl = document.getElementById('turn-timer');
        
        this.room.roundTimer = setInterval(() => {
            if (!this.room.gameActive || !this.room.myTurn) return;
            
            this.room.timeLeft--;
            if (timerEl) timerEl.textContent = `${this.room.timeLeft}s`;
            
            if (this.room.timeLeft <= 10 && timerEl) {
                timerEl.classList.add('warning');
            }
            
            if (this.room.timeLeft <= 0) {
                this.handleTurnTimeout();
            }
        }, 1000);
    }

    stopTurnTimer() {
        if (this.room.roundTimer) {
            clearInterval(this.room.roundTimer);
            this.room.roundTimer = null;
        }
    }

    async handleTurnTimeout() {
        this.stopTurnTimer();
        
        if (!this.room.gameActive) return;
        
        if (this.room.selectedCards.length > 0) {
            this.room.selectedCards.forEach(card => {
                if (card && card.isConnected) card.classList.remove('selected');
            });
            this.room.selectedCards = [];
        }
        
        this.addSystemMessage('⏰ 时间到，轮到对方了');
        await this.endTurn();
    }

    updateTurnIndicator() {
        const turnText = document.querySelector('#turn-indicator .turn-text');
        const timerEl = document.getElementById('turn-timer');
        const player1Card = document.querySelector('.player-card:first-child');
        const player2Card = document.querySelector('.player-card:last-child');
        
        if (player1Card) player1Card.classList.toggle('active', this.room.myTurn);
        if (player2Card) player2Card.classList.toggle('active', !this.room.myTurn);

        if (this.room.opponentIsAI && !this.room.myTurn) {
            if (turnText) turnText.textContent = 'AI思考中...';
            if (timerEl) {
                timerEl.textContent = `${this.room.timeLeft || 30}s`;
                timerEl.classList.remove('warning');
            }
        } else if (this.room.myTurn) {
            if (turnText) turnText.textContent = this.t('yourTurn');
        } else {
            if (turnText) turnText.textContent = this.t('opponentTurn');
        }
    }

    updateProgressBars() {
        const player1Progress = document.getElementById('player1-progress');
        const player2Progress = document.getElementById('player2-progress');
        if (player1Progress) player1Progress.classList.add('player1');
        if (player2Progress) player2Progress.classList.add('player2');
    }

    // ==================== ELO 排名系统 ====================

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
                
            if (this.game.state.currentUser && this.game.state.currentUser.id === battle.player1_id) {
                this.game.state.currentUser.elo = Math.round(player1NewELO);
            } else if (this.game.state.currentUser && this.game.state.currentUser.id === battle.player2_id) {
                this.game.state.currentUser.elo = Math.round(player2NewELO);
            }
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

    // ==================== 锦标赛集成 ====================

    async joinTournamentMatch(tournamentId, matchId) {
        if (!this.isSupabaseAvailable()) {
            this.showFeedback('Supabase未连接，无法开始比赛', '#ff4444');
            return;
        }

        const user = this.game.state.currentUser;
        if (!user) {
            this.showFeedback('请先登录', '#ff4444');
            return;
        }

        try {
            const { data: match, error } = await this.game.state.supabase
                .from('candy_math_tournament_matches')
                .select('*')
                .eq('id', matchId)
                .single();

            if (error || !match) {
                this.showFeedback('比赛不存在', '#ff4444');
                return;
            }

            const roomCode = this.generateRoomCode();
            const opponentId = match.player1_id === user.id ? match.player2_id : match.player1_id;
            const opponentName = match.player1_id === user.id ? match.player2_name : match.player1_name;

            const { data: battle, error: battleError } = await this.game.state.supabase
                .from('candy_math_battles')
                .insert([{
                    room_code: roomCode,
                    player1_id: user.id,
                    player1_name: user.name,
                    player2_id: opponentId,
                    player2_name: opponentName,
                    status: 'playing',
                    mode: 'challenge',
                    difficulty: 'medium',
                    started_at: new Date().toISOString(),
                    current_turn: user.id,
                    tournament_id: tournamentId,
                    tournament_match_id: matchId
                }])
                .select()
                .single();

            if (battleError) throw battleError;

            this.room.battleId = battle.id;
            this.room.roomCode = roomCode;
            this.room.playerRole = 'player1';
            this.room.opponentId = opponentId;
            this.room.opponentName = opponentName;
            this.room.status = 'playing';
            this.room.gameActive = true;
            this.room.myTurn = true;
            this.room.opponentIsAI = false;
            this.room.tournamentMode = true;
            this.room.tournamentId = tournamentId;
            this.room.tournamentMatchId = matchId;

            this.startBattleAfterJoin();
            this.subscribeToTournamentMatch(matchId);

        } catch (error) {
            console.error('加入锦标赛比赛失败:', error);
            this.showFeedback('开始比赛失败', '#ff4444');
        }
    }

    subscribeToTournamentMatch(matchId) {
        if (!this.isSupabaseAvailable()) return;

        const channel = this.game.state.supabase
            .channel(`tournament-match-${matchId}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'candy_math_tournament_matches',
                filter: `id=eq.${matchId}`
            }, (payload) => {
                const match = payload.new;
                if (match.status === 'finished') {
                    this.showFeedback('比赛已结束', '#a3d8d8');
                    this.endTournamentMatch(match);
                }
            })
            .subscribe();

        this.room.tournamentChannel = channel;
    }

    async endTournamentMatch(match) {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }

        const winner = match.winner_id === this.game.state.currentUser.id ? '你' : this.room.opponentName;
        this.addSystemMessage(`🏆 锦标赛比赛结束，${winner} 获胜！`);
        
        setTimeout(() => {
            this.leaveBattle();
            if (this.game.ui) {
                this.game.ui.closeModal('battle-modal');
            }
        }, 3000);
    }

    // ==================== 本地存储和重连 ====================

    saveLocalBattleState() {
        if (!this.room.battleId) return;
        
        try {
            const state = {
                version: this.constants.STORAGE_VERSION,
                battleId: this.room.battleId,
                roomCode: this.room.roomCode,
                opponentName: this.room.opponentName,
                opponentIsAI: this.room.opponentIsAI,
                aiDifficulty: this.room.aiDifficulty,
                myTurn: this.room.myTurn,
                gameActive: this.room.gameActive,
                offlineMode: this.offlineMode,
                player1Score: document.getElementById('player1-score')?.textContent || '0',
                player2Score: document.getElementById('player2-score')?.textContent || '0',
                player1Progress: document.getElementById('player1-progress')?.style.width || '0%',
                player2Progress: document.getElementById('player2-progress')?.style.width || '0%',
                targetNumber: document.getElementById('battle-target-number')?.textContent || '0',
                gridCards: this.saveGridState(),
                chatMessages: this.saveChatState(),
                matchRetryCount: this.matchRetryCount,
                isMatching: this.isMatching,
                tournamentMode: this.room.tournamentMode || false,
                tournamentId: this.room.tournamentId,
                tournamentMatchId: this.room.tournamentMatchId,
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
            text: msg.textContent
        }));
    }

    loadLocalBattleState() {
        try {
            const saved = this.safeStorage().getItem(this.constants.LOCAL_STORAGE_KEY);
            if (!saved) return false;
            
            const state = JSON.parse(saved);
            
            if (state.version !== this.constants.STORAGE_VERSION) {
                const migrated = this.migrateStorageState(state);
                if (migrated) {
                    this.safeStorage().setItem(this.constants.LOCAL_STORAGE_KEY, JSON.stringify(migrated));
                    return this.loadLocalBattleState();
                } else {
                    this.safeStorage().removeItem(this.constants.LOCAL_STORAGE_KEY);
                    return false;
                }
            }
            
            if (Date.now() - state.timestamp > this.constants.STORAGE_EXPIRY) {
                this.showFeedback('保存的对战已过期', '#fbb9c0');
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
            this.offlineMode = state.offlineMode || false;
            this.matchRetryCount = state.matchRetryCount || 0;
            this.isMatching = state.isMatching || false;
            this.room.tournamentMode = state.tournamentMode || false;
            this.room.tournamentId = state.tournamentId || null;
            this.room.tournamentMatchId = state.tournamentMatchId || null;
            
            this.restoreUIFromState(state);
            return true;
        } catch (error) {
            console.error('加载本地对战状态失败:', error);
            return false;
        }
    }

    restoreUIFromState(state) {
        const elements = {
            'player1-score': state.player1Score,
            'player2-score': state.player2Score,
            'player1-progress': (el) => { el.style.width = state.player1Progress; },
            'player2-progress': (el) => { el.style.width = state.player2Progress; },
            'battle-target-number': state.targetNumber
        };

        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) {
                if (typeof value === 'function') value(el);
                else el.textContent = value;
            }
        });

        this.loadGridState(state.gridCards);
        this.loadChatState(state.chatMessages);
    }

    loadGridState(cardsData) {
        const grid = document.getElementById('battle-grid');
        if (!grid || !cardsData) return;
        
        const fragment = document.createDocumentFragment();
        cardsData.forEach(data => {
            const card = this.cardTemplate.cloneNode(false);
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
            msgDiv.textContent = data.text;
            fragment.appendChild(msgDiv);
        });
        
        chat.innerHTML = '';
        chat.appendChild(fragment);
    }

    migrateStorageState(oldState) {
        const migrations = {
            '7.3.0': (s) => ({ ...s, version: '8.0.0', offlineMode: s.offlineMode || false }),
            '8.0.0': (s) => ({ ...s, version: '8.1.0' }),
            '8.1.0': (s) => ({ ...s, version: '8.2.0' }),
            '8.2.0': (s) => ({ ...s, version: '8.2.1' }),
            '8.2.1': (s) => ({ ...s, version: '8.2.2' }),
            '8.2.2': (s) => ({ ...s, version: '8.2.3' }),
            '8.2.3': (s) => ({ ...s, version: '8.2.4', matchRetryCount: s.matchRetryCount || 0, isMatching: s.isMatching || false }),
            '8.2.4': (s) => ({ ...s, version: '8.2.5' }),
            '8.2.5': (s) => ({ ...s, version: '8.2.6' }),
            '8.2.6': (s) => ({ ...s, version: '9.0.0', tournamentMode: false }),
            '9.0.0': (s) => ({ ...s, version: '9.2.0' })
        };

        let current = oldState;
        while (current.version !== this.constants.STORAGE_VERSION && migrations[current.version]) {
            current = migrations[current.version](current);
        }

        this.safeStorage().setItem(this.constants.LOCAL_STORAGE_KEY, JSON.stringify(current));
        return current;
    }

    restoreFullStateFromStorage() {
        const saved = this.safeStorage().getItem(this.constants.LOCAL_STORAGE_KEY);
        if (!saved) return false;

        try {
            const state = JSON.parse(saved);
            
            if (state.version !== this.constants.STORAGE_VERSION) {
                this.migrateStorageState(state);
            }

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
            this.offlineMode = state.offlineMode || false;
            this.matchRetryCount = state.matchRetryCount || 0;
            this.isMatching = state.isMatching || false;
            this.room.tournamentMode = state.tournamentMode || false;
            this.room.tournamentId = state.tournamentId || null;
            this.room.tournamentMatchId = state.tournamentMatchId || null;

            this.restoreFullUIFromState(state);
            return true;
        } catch (error) {
            console.error('恢复存储状态失败:', error);
            return false;
        }
    }

    restoreFullUIFromState(state) {
        const player1Score = document.getElementById('player1-score');
        const player2Score = document.getElementById('player2-score');
        if (player1Score) player1Score.textContent = state.player1Score || '0';
        if (player2Score) player2Score.textContent = state.player2Score || '0';

        const player1Progress = document.getElementById('player1-progress');
        const player2Progress = document.getElementById('player2-progress');
        if (player1Progress) player1Progress.style.width = state.player1Progress || '0%';
        if (player2Progress) player2Progress.style.width = state.player2Progress || '0%';

        const targetNumber = document.getElementById('battle-target-number');
        if (targetNumber) targetNumber.textContent = state.targetNumber || '10';

        this.loadGridState(state.gridCards);
        this.loadChatState(state.chatMessages);
        this.updateTurnIndicator();

        if (this.room.gameActive && !this.room.opponentIsAI) {
            this.subscribeToBattleRealtime(this.room.battleId);
        } else if (this.room.gameActive && this.room.opponentIsAI) {
            if (!this.room.myTurn) {
                this.scheduleAIMove();
            } else {
                this.startTurnTimer();
            }
        }
    }

    async attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.showFeedback('重连失败，请重新开始对战', '#fbb9c0');
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
                this.subscribeToBattleRealtime(this.room.battleId);
                await this.syncScores();
                if (this.room.myTurn) this.autoRefreshGridIfNeeded();
                this.showFeedback('重连成功', '#a3d8d8');
                this.reconnectAttempts = 0;
                this.offlineMode = false;
            }
        } catch (error) {
            console.error('重连失败:', error);
            setTimeout(() => this.attemptReconnect(), 2000);
        }
    }

    switchToOfflineMode() {
        if (this.room.channel) {
            this.room.channel.unsubscribe();
            this.room.channel = null;
        }
        this.room.opponentIsAI = false;
        this.offlineMode = true;
        this.room.battleId = 'offline_' + (this.room.battleId || Date.now());
        this.addSystemMessage('📴 网络断开，切换到离线模式');
        this.addSystemMessage('您的进度将在网络恢复后同步');
        this.startLocalPolling();
    }

    startLocalPolling() {
        if (!this.room.myTurn && !this.room.opponentIsAI && this.offlineMode) {
            if (this.localPollingTimer) clearTimeout(this.localPollingTimer);
            this.localPollingTimer = setTimeout(() => {
                this.localPollingTimer = null;
                this.simulateOpponentMove();
            }, 2000 + Math.random() * 3000);
        }
    }

    simulateOpponentMove() {
        if (!this.room.gameActive || this.room.myTurn || !this.offlineMode) return;

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
        let attempts = 0;
        const maxAttempts = 10;
        
        do {
            index2 = Math.floor(Math.random() * cards.length);
            attempts++;
        } while (index2 === index1 && cards.length > 1 && attempts < maxAttempts);
        
        if (index1 === index2 || !cards[index1] || !cards[index2]) {
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
                this.updateLocalOpponentScore();
                this.generateBattleTarget();
            } else {
                this.generateBattleTarget();
                card1.classList.remove('selected');
                card2.classList.remove('selected');
            }

            this.room.myTurn = true;
            this.updateTurnIndicator();
            this.addSystemMessage('你的回合');
        }, 500);
    }

    updateLocalOpponentScore() {
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
    }

    // ==================== 订阅对战 ====================

    subscribeToBattle(battleId) {
        if (!this.isSupabaseAvailable()) return;

        const subscriptionKey = `battle-${battleId}`;
        if (this.activeSubscriptions.has(subscriptionKey)) {
            console.log('已有活跃订阅，跳过');
            return;
        }

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.room.channel) {
            try {
                this.room.channel.unsubscribe();
            } catch (e) {
                console.warn('取消订阅失败:', e);
            }
            this.room.channel = null;
            this.room.subscriptionId = null;
        }

        this.activeSubscriptions.set(subscriptionKey, true);

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
                    this.showOfflineHint();
                })
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'candy_math_battles',
                    filter: `id=eq.${battleId}`
                }, (payload) => {
                    requestAnimationFrame(() => this.handleBattleUpdate(payload));
                })
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'candy_math_battle_rounds',
                    filter: `battle_id=eq.${battleId}`
                }, (payload) => {
                    requestAnimationFrame(() => this.handleRoundUpdate(payload));
                })
                .on('postgres_changes', {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'candy_math_battle_messages',
                    filter: `battle_id=eq.${battleId}`
                }, (payload) => {
                    requestAnimationFrame(() => this.handleNewMessage(payload));
                })
                .subscribe(async (status, err) => {
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        console.error('订阅失败:', err);
                        this.activeSubscriptions.delete(subscriptionKey);
                        this.reconnectTimer = setTimeout(() => {
                            this.reconnectTimer = null;
                            this.attemptReconnect();
                        }, 5000);
                    } else if (status === 'CLOSED') {
                        console.log('通道已关闭');
                        this.activeSubscriptions.delete(subscriptionKey);
                        this.reconnectTimer = setTimeout(() => {
                            this.reconnectTimer = null;
                            if (this.room.gameActive && this.room.battleId) {
                                this.subscribeToBattle(this.room.battleId);
                            }
                        }, 3000);
                    } else if (status === 'SUBSCRIBED') {
                        console.log('成功订阅对战:', battleId);
                        await this.room.channel.track({
                            user_id: this.game.state.currentUser.id,
                            user_name: this.game.state.currentUser.name,
                            status: 'playing',
                            battle_id: battleId
                        });
                        this.reconnectAttempts = 0;
                    }
                });
                
            this.room.subscriptionId = `battle-${battleId}-${Date.now()}`;
            
        } catch (error) {
            console.error('订阅对战失败:', error);
            this.activeSubscriptions.delete(subscriptionKey);
        }
    }

    showOfflineHint() {
        const offlineHint = document.createElement('div');
        offlineHint.className = 'offline-hint';
        offlineHint.innerHTML = `
            <div style="display: flex; align-items: center; gap: 5px;">
                <span>👋</span>
                <span>对手已离线，等待重连...</span>
                <button style="background: none; border: none; color: white; font-size: 1rem; cursor: pointer; padding: 0 3px;">×</button>
            </div>
        `;
        const closeBtn = offlineHint.querySelector('button');
        closeBtn.onclick = () => offlineHint.remove();
        document.body.appendChild(offlineHint);
        setTimeout(() => {
            if (offlineHint.isConnected) offlineHint.remove();
        }, 3000);
        this.showFeedback('对手已断开连接', '#fbb9c0');
    }

    handleBattleUpdate(payload) {
        const battle = payload.new;
        this.updateScoresFromServer(battle);
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

    // ==================== 结束对战 ====================

    async endBattle(winnerId) {
        this.room.gameActive = false;
        this.stopTurnTimer();
        this.refreshCount = 0;
        this.aiMoveRetryCount = 0;
        this.aiGlobalRetryCount = 0;

        if (this.room.opponentIsAI) {
            this.endAIBattle(winnerId);
            return;
        }

        if (!navigator.onLine || this.offlineMode) {
            this.endBattleCommon(winnerId);
            return;
        }

        if (!this.isSupabaseAvailable()) {
            this.endBattleCommon(winnerId);
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
            this.endBattleCommon(winnerId);
        }
        
        this.disableChatInput(true);
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
        this.safeStorage().removeItem(this.constants.LOCAL_STORAGE_KEY);
    }

    endAIBattle(winnerId) {
        const myScore = parseInt(document.getElementById('player1-score')?.textContent) || 0;
        const opponentScore = parseInt(document.getElementById('player2-score')?.textContent) || 0;
        this.displayBattleResult(winnerId, myScore, opponentScore);
        
        const winner = winnerId === this.game.state.currentUser.id ? '你' : this.room.opponentName;
        this.addSystemMessage(`🏆 对战结束，${winner} 获胜！`);
        this.disableChatInput(true);
        this.cleanupAIResources();
    }

    endBattleCommon(winnerId) {
        const myScore = parseInt(document.getElementById('player1-score')?.textContent) || 0;
        const opponentScore = parseInt(document.getElementById('player2-score')?.textContent) || 0;
        this.displayBattleResult(winnerId, myScore, opponentScore);
        this.disableChatInput(true);
    }

    displayBattleResult(winnerId, player1Score, player2Score) {
        const activeDiv = document.getElementById('battle-active');
        const resultDiv = document.getElementById('battle-result');
        
        if (activeDiv) activeDiv.style.display = 'none';
        if (resultDiv) resultDiv.style.display = 'block';

        const iWon = winnerId === this.game.state.currentUser.id;
        
        const resultTitle = document.getElementById('result-title');
        if (resultTitle) resultTitle.textContent = iWon ? `🏆 ${this.t('win')}` : `😢 ${this.t('lose')}`;

        const finalPlayerScore = document.getElementById('final-player-score');
        const finalOpponentScore = document.getElementById('final-opponent-score');
        
        if (finalPlayerScore) finalPlayerScore.textContent = player1Score || 0;
        if (finalOpponentScore) finalOpponentScore.textContent = player2Score || 0;

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
        const myScore = this.room.playerRole === 'player1' ? battle.player1_score : battle.player2_score;
        const opponentScore = this.room.playerRole === 'player1' ? battle.player2_score : battle.player1_score;
        this.displayBattleResult(battle.winner_id, myScore, opponentScore);
    }

    // ==================== 聊天功能 ====================

    async sendChatMessage() {
        const input = document.getElementById('chat-input');
        if (!input || !input.value.trim()) return;

        let text = input.value.trim();
        text = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
        
        if (text.length > 200) {
            text = text.substring(0, 200) + '...';
        }
        
        if (text.length === 0) return;
        
        input.value = '';

        if (this.room.opponentIsAI) {
            this.addChatMessage({
                player_id: this.game.state.currentUser.id,
                player_name: this.game.state.currentUser.name,
                message: text
            });
            this.handleAIResponse(text);
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

    handleAIResponse(userMessage) {
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
                '好的！', '继续加油！', '你太厉害了！', '再来一局？',
                '🤖 正在计算...', '这个选择不错', '我学会了！', '轮到我了！',
                '看我的！', '😊', '👍', '🎯 好准！', '⚡ 快速！'
            ];
            const response = aiResponses[Math.floor(Math.random() * aiResponses.length)];
            this.addChatMessage({
                player_id: this.room.opponentId,
                player_name: this.room.opponentName,
                message: response
            });
        }, 1000);
    }

    async sendSystemMessage(text) {
        if (this.room.opponentIsAI) {
            this.addSystemMessage(text);
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

    addSystemMessage(text) {
        const chat = document.getElementById('chat-messages');
        if (!chat) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'message system';
        msgDiv.textContent = text;
        chat.appendChild(msgDiv);
        
        this.limitChatMessages(chat);
        chat.scrollTop = chat.scrollHeight;
    }

    addChatMessage(message) {
        const chat = document.getElementById('chat-messages');
        if (!chat) return;

        const msgDiv = document.createElement('div');
        const displayMessage = message.message.length > 100 
            ? message.message.substring(0, 100) + '...' 
            : message.message;
        const safeMessage = this.escapeHtml(displayMessage || '');
        
        if (message.player_id === 'system') {
            msgDiv.className = 'message system';
            msgDiv.textContent = safeMessage;
        } else if (message.player_id === this.game.state?.currentUser?.id) {
            msgDiv.className = 'message self';
            msgDiv.innerHTML = `<span class="message-sender">你:</span> ${safeMessage}`;
        } else {
            msgDiv.className = 'message opponent';
            const senderName = (message.player_name || '对手');
            msgDiv.innerHTML = `<span class="message-sender">${this.escapeHtml(senderName)}:</span> ${safeMessage}`;
        }

        chat.appendChild(msgDiv);
        this.limitChatMessages(chat);
        chat.scrollTop = chat.scrollHeight;
    }

    addOpponentMove(round) {
        const chat = document.getElementById('chat-messages');
        if (!chat) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'message system';
        const result = round.is_correct ? '✓ 正确' : '✗ 错误';
        msgDiv.textContent = `${this.room.opponentName} 选择了 ${round.num1} + ${round.num2} = ${round.num1 + round.num2} ${result}`;
        
        chat.appendChild(msgDiv);
        this.limitChatMessages(chat);
        chat.scrollTop = chat.scrollHeight;
    }

    limitChatMessages(chat) {
        while (chat.children.length > this.constants.MAX_CHAT_MESSAGES) {
            chat.removeChild(chat.firstChild);
        }
    }

    // ==================== 清理和销毁 ====================

    leaveBattle() {
        if (this.isLeaving) return;
        this.isLeaving = true;
        
        try {
            this.clearSoundQueue();
            this.stopAllSounds();
            this.cleanupMatch();
            this.stopTurnTimer();
            this.cleanupAIResources();
            this.stopAllTimers();
            
            if (this.pollingInterval) {
                clearInterval(this.pollingInterval);
                this.pollingInterval = null;
            }
            
            if (this.room.tournamentChannel) {
                this.room.tournamentChannel.unsubscribe();
                this.room.tournamentChannel = null;
            }
            
            if (this.room.channel) {
                try {
                    this.room.channel.untrack();
                    this.room.channel.unsubscribe();
                } catch (e) {}
                this.room.channel = null;
            }
            
            if (this.game.state.currentUser) {
                this.leaveQueue(this.game.state.currentUser.id);
            }
            
            if (this.observers) {
                Object.values(this.observers).forEach(observer => {
                    if (observer) {
                        if (observer.unobserve) {
                            const battleContainer = document.querySelector('.battle-container');
                            if (battleContainer) observer.unobserve(battleContainer);
                        }
                        observer.disconnect();
                    }
                });
            }
            
            this.hideBattleUI();
            this.resetAllState();
            this.safeStorage().removeItem(this.constants.LOCAL_STORAGE_KEY);
        } finally {
            setTimeout(() => { this.isLeaving = false; }, 500);
        }
    }

    hideBattleUI() {
        const battleModal = document.querySelector('.battle-modal');
        if (battleModal) battleModal.style.display = 'none';
        
        const battleActive = document.getElementById('battle-active');
        const battleWaiting = document.getElementById('battle-waiting');
        const battleResult = document.getElementById('battle-result');
        
        if (battleActive) battleActive.style.display = 'none';
        if (battleWaiting) battleWaiting.style.display = 'none';
        if (battleResult) battleResult.style.display = 'none';
        
        const tempElements = ['match-waiting-hint', 'ai-option', 'long-wait-suggestion', 'offline-hint', 'zoom-warning'];
        tempElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
        document.querySelectorAll('.offline-hint, .room-code-hint').forEach(el => el.remove());
    }

    stopAllTimers() {
        const timers = [
            this.aiMoveTimer, this.aiResponseTimer, this.aiCooldownTimer,
            this.localPollingTimer, this.matchTimeoutId, this.longWaitTimer,
            this.reconnectTimer, this.broadcastReconnectTimer, this.cardClickTimer,
            this.zoomTimer, this.refreshTimer, this.heartbeatInterval,
            this.scoreSyncInterval, this.queueStatusInterval, this.broadcastHeartbeatTimer,
            this.room.roundTimer, this.soundProcessTimer, this.zoomCheckThrottle,
            this.subscriptionCheckTimer, this.initRetryTimer, this.pollingInterval
        ];
        
        timers.forEach(timer => {
            if (timer) {
                clearTimeout(timer);
                clearInterval(timer);
            }
        });
        
        this.aiMoveTimer = null;
        this.aiResponseTimer = null;
        this.aiCooldownTimer = null;
        this.localPollingTimer = null;
        this.matchTimeoutId = null;
        this.longWaitTimer = null;
        this.reconnectTimer = null;
        this.broadcastReconnectTimer = null;
        this.cardClickTimer = null;
        this.zoomTimer = null;
        this.refreshTimer = null;
        this.heartbeatInterval = null;
        this.scoreSyncInterval = null;
        this.queueStatusInterval = null;
        this.broadcastHeartbeatTimer = null;
        this.room.roundTimer = null;
        this.soundProcessTimer = null;
        this.zoomCheckThrottle = null;
        this.subscriptionCheckTimer = null;
        this.initRetryTimer = null;
        this.pollingInterval = null;
    }

    resetAllState() {
        this.room = {
            roomCode: null, battleId: null, playerRole: null, opponentId: null,
            opponentName: null, opponentIsAI: false, aiDifficulty: 'medium',
            status: 'waiting', myTurn: false, roundTimer: null, channel: null,
            subscriptionId: null, gameActive: false, selectedCards: [], timeLeft: 30,
            tournamentMode: false, tournamentId: null, tournamentMatchId: null, tournamentChannel: null
        };
        
        this.matchQueue = [];
        this.pendingClicks = [];
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
        this.offlineMode = false;
        this._lastCacheVersion = 0;
        this.matchRetryCount = 0;
        this.isMatching = false;
        
        Object.keys(this.semaphores).forEach(key => {
            this.semaphores[key] = { locked: false, queue: [], maxLength: this.semaphores[key].maxLength };
        });
        
        if (this.activeSubscriptions) {
            this.activeSubscriptions.forEach((value, subKey) => {
                const channel = this.game?.state?.supabase?.getChannel(subKey);
                if (channel) channel.unsubscribe().catch(() => {});
            });
            this.activeSubscriptions.clear();
        }
        
        this.cachedElements = null;
        this.cacheVersion = 0;
        this.clearSoundQueue();
        this._wrappedMethods = new WeakMap();
    }

    async rematch() {
        if (this.rematchInProgress) return;
        this.rematchInProgress = true;
        
        try {
            const resultDiv = document.getElementById('battle-result');
            if (resultDiv) resultDiv.style.display = 'none';
            
            this.leaveBattle();
            
            if (this.room.opponentIsAI) {
                this.showAIDifficultySelect();
            } else {
                this.showModeSelect();
            }
        } finally {
            setTimeout(() => { this.rematchInProgress = false; }, 1000);
        }
    }

    closeBattle() {
        this.leaveBattle();
        if (this.game.ui) this.game.ui.closeModal('battle-modal');
    }

    showJoinModal() {
        if (this.game.ui) {
            this.game.ui.openModal('join-modal');
        } else {
            const modal = document.getElementById('join-modal');
            if (modal) modal.style.display = 'flex';
        }
        
        const input = document.getElementById('room-code-input');
        if (input) {
            input.value = '';
            input.focus();
            
            // 自动转大写
            input.addEventListener('input', function(e) {
                e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            });
            
            // 按回车直接加入
            input.onkeypress = (e) => {
                if (e.key === 'Enter') {
                    this.confirmJoin();
                }
            };
        }
        
        // 点击模态框外部关闭
        const modal = document.getElementById('join-modal');
        if (modal) {
            modal.onclick = (e) => {
                if (e.target === modal) {
                    this.closeJoinModal();
                }
            };
        }
    }

    closeJoinModal() {
        if (this.game.ui) this.game.ui.closeModal('join-modal');
    }

    confirmJoin() {
        const roomCodeInput = document.getElementById('room-code-input');
        const roomCode = roomCodeInput?.value?.toUpperCase();
        if (roomCode && roomCode.length === 6) {
            this.closeJoinModal();
            this.joinBattleRoom(roomCode);
        } else {
            this.showFeedback('请输入6位房间码', '#ff4444');
        }
    }

    joinQueue(player) {
        const existing = this.matchQueue.find(p => p.id === player.id);
        if (existing) return;
        this.matchQueue.push({ ...player, joinTime: Date.now() });
        this.matchQueue.sort((a, b) => a.elo - b.elo);
    }

    leaveQueue(playerId) {
        this.matchQueue = this.matchQueue.filter(p => p.id !== playerId);
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async destroy() {
        if (this._isDestroying) return;
        this._isDestroying = true;
        
        console.log('开始销毁 BattleMode 实例...');
        
        if (this.subscriptionCheckTimer) clearInterval(this.subscriptionCheckTimer);
        if (this.initRetryTimer) clearTimeout(this.initRetryTimer);
        if (this.pollingInterval) clearInterval(this.pollingInterval);
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        
        this.leaveBattle();
        this.cleanupMatch();
        this.cleanupAIResources();
        this.stopAllTimers();
        
        if (this.room.tournamentChannel) {
            this.room.tournamentChannel.unsubscribe();
            this.room.tournamentChannel = null;
        }
        
        if (this.room.channel) {
            try {
                await this.room.channel.untrack();
                this.room.channel.unsubscribe();
            } catch (e) {}
            this.room.channel = null;
        }
        
        this.removeAllEventListeners();
        
        const eventHandlers = [
            { target: window, event: 'online', handler: this.onlineHandler },
            { target: window, event: 'offline', handler: this.offlineHandler },
            { target: window, event: 'popstate', handler: this.popStateHandler },
            { target: document, event: 'visibilitychange', handler: this.visibilityHandler },
            { target: window, event: 'beforeunload', handler: this.beforeUnloadHandler }
        ];
        
        eventHandlers.forEach(({ target, event, handler }) => {
            if (handler) target.removeEventListener(event, handler);
        });
        
        if (this.broadcastChannel) {
            this.broadcastChannel.close();
            this.broadcastChannel = null;
        }
        
        const tempElements = ['match-waiting-hint', 'ai-option', 'candy-battle-styles', 'zoom-warning', 'long-wait-suggestion'];
        tempElements.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.remove();
        });
        
        this.cachedElements = null;
        this.cardTemplate = null;
        this.safeStorage().removeItem(this.constants.LOCAL_STORAGE_KEY);
        this.clearSoundQueue();
        
        this.game = null;
        this.memoryStorage = null;
        this._wrappedMethods = new WeakMap();
        this._initialized = false;
        this._isDestroying = false;
        
        console.log('BattleMode 实例销毁完成');
    }
}

window.BattleMode = BattleMode;
