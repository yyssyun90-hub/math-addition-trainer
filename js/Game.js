/**
 * ==================== 糖果数学消消乐 - 游戏主核心 ====================
 * 包含：游戏核心逻辑、状态管理、生命周期控制
 * 依赖：所有其他模块 (utils.js, Storage.js, Auth.js, UI.js, BattleMode.js, TournamentMode.js)
 * =================================================================
 */

class CandyMathGame {
    constructor() {
        // ==================== 状态管理 ====================
        this.state = {
            // 游戏状态
            score: 0,
            completed: 0,
            correct: 0,
            attempts: 0,
            timeLeft: 90,
            currentTarget: 10,
            selectedCards: [],
            gameActive: false,
            isPaused: false,
            startTime: null,
            timer: null,
            
            // 模式设置
            currentMode: 'challenge',
            currentDifficulty: 'easy',
            currentLang: localStorage.getItem(GAME_CONSTANTS.STORAGE_KEYS.LANG) || 'zh',
            
            // 用户状态
            currentUser: null,
            isOnline: navigator.onLine,
            
            // 数据
            history: [],
            wrongQuestions: [],
            
            // Supabase
            supabase: null,
            supabaseReady: false,
            supabaseError: null,
            
            // 冷却
            hintCooldown: 0,
            hintTimer: null,
            feedbackTimer: null
        };

        // ==================== 配置 ====================
        this.difficultyConfig = GAME_CONSTANTS.DIFFICULTY_CONFIG;
        this.modeConfig = GAME_CONSTANTS.MODE_CONFIG;
        this.currentConfig = this.difficultyConfig[this.state.currentDifficulty];
        
        // ==================== Supabase配置 ====================
        // 从HTML读取配置
        const configScript = document.getElementById('supabase-config');
        const config = configScript ? JSON.parse(configScript.textContent) : {};
        
        this.supabaseConfig = {
            url: config.supabaseUrl || 'https://zykqddnckhcivutcropm.supabase.co',
            anonKey: config.supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5a3FkZG5ja2hjaXZ1dGNyb3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NjQwNjIsImV4cCI6MjA4NzU0MDA2Mn0.hc3aROjGSUaAt7Jlcf3qqY4XeVSiKpwIxS8LHQ2LFOk'
        };
        
        // ==================== 颜色管理 ====================
        this.colorIndex = 0;

        // ==================== 子模块初始化 ====================
        // 工具类（直接使用全局单例）
        this.soundManager = SoundManager;
        this.i18n = I18n;
        
        // 核心模块（延迟初始化）
        this.storage = null;
        this.auth = null;
        this.ui = null;
        this.battle = null;
        this.tournament = null;
        
        // 事件处理器绑定
        this.boundHandlers = this.createBoundHandlers();
        
        // 标记是否已初始化
        this.initialized = false;
    }

    // ==================== 初始化 ====================

    /**
     * 创建绑定的事件处理器
     */
    createBoundHandlers() {
        return {
            closeGameover: () => this.ui?.closeModal('game-over-modal'),
            closeAuth: () => this.ui?.closeModal('auth-modal'),
            closeTutorial: () => this.ui?.closeModal('tutorial-modal'),
            closeTournament: () => this.ui?.closeModal('tournament-modal'),
            closeBattle: () => this.ui?.closeModal('battle-modal'),
            closeJoin: () => this.ui?.closeModal('join-modal'),
            closeCreate: () => this.ui?.closeModal('create-tournament-modal'),
            authModalClick: (e) => {
                if (e.target === document.getElementById('auth-modal')) {
                    this.ui?.closeModal('auth-modal');
                }
            },
            gameoverModalClick: (e) => {
                if (e.target === document.getElementById('game-over-modal')) {
                    this.ui?.closeModal('game-over-modal');
                }
            },
            tutorialModalClick: (e) => {
                if (e.target === document.getElementById('tutorial-modal')) {
                    this.ui?.closeModal('tutorial-modal');
                }
            },
            tournamentModalClick: (e) => {
                if (e.target === document.getElementById('tournament-modal')) {
                    this.ui?.closeModal('tournament-modal');
                }
            },
            battleModalClick: (e) => {
                if (e.target === document.getElementById('battle-modal')) {
                    this.ui?.closeModal('battle-modal');
                }
            },
            joinModalClick: (e) => {
                if (e.target === document.getElementById('join-modal')) {
                    this.ui?.closeModal('join-modal');
                }
            },
            createModalClick: (e) => {
                if (e.target === document.getElementById('create-tournament-modal')) {
                    this.ui?.closeModal('create-tournament-modal');
                }
            }
        };
    }

    /**
     * 初始化游戏
     */
    async init() {
        if (this.initialized) return;
        
        try {
            console.log('开始初始化游戏...');
            
            // 初始化子模块
            this.storage = new StorageManager(this);
            // ===== 关键修复：传递对象而不是直接传递this =====
            this.auth = new AuthManager({ game: this });
            this.ui = new UIManager(this);
            
            // 加载本地数据
            this.storage.loadLocalData();
            this.auth.loadUserSession();
            
            // 初始化UI
            this.ui.init();
            
            // 初始化Supabase
            await this.initSupabase();
            
            // 初始化对战模式（懒加载）
            this.initBattle();
            
            // 初始化锦标赛模式（懒加载）
            this.initTournament();
            
            // 绑定事件
            this.bindEvents();
            
            // 设置网络监听
            this.setupNetworkListeners();
            
            // 加载难度配置
            this.loadDifficulty(this.state.currentDifficulty);
            
            // 更新语言
            this.ui.updateLanguage();
            
            // 更新用户UI
            this.ui.updateUserUI();
            
            // 检查首次游玩
            this.ui.checkFirstTime();
            
            this.initialized = true;
            
            // ===== 关键修复：同时设置两个全局变量 =====
            window.battleMode = this.battle;
            window.battleModeInstance = this.battle;
            
            console.log('游戏初始化成功', {
                battleMode: this.battle ? '已创建' : '未创建',
                battleModeGlobal: window.battleMode ? '已挂载' : '未挂载',
                battleModeInstance: window.battleModeInstance ? '已挂载' : '未挂载',
                supabaseReady: this.state.supabaseReady,
                supabaseError: this.state.supabaseError
            });
            
        } catch (error) {
            console.error('初始化失败:', error);
            this.state.supabaseError = error.message;
            this.ui?.showFeedback('初始化失败，使用离线模式', '#ffa500');
            
            // 即使Supabase失败，也继续初始化其他模块
            this.continueInitWithoutSupabase();
        }
    }

    /**
     * 无Supabase继续初始化
     */
    continueInitWithoutSupabase() {
        try {
            this.initBattle();
            this.initTournament();
            this.bindEvents();
            this.setupNetworkListeners();
            this.loadDifficulty(this.state.currentDifficulty);
            this.ui.updateLanguage();
            this.ui.updateUserUI();
            
            this.initialized = true;
            window.battleMode = this.battle;
            window.battleModeInstance = this.battle;
            
            console.log('游戏以离线模式初始化成功');
            this.ui?.showFeedback('已切换到离线模式', '#ffa500');
        } catch (error) {
            console.error('离线初始化失败:', error);
        }
    }

    /**
     * 初始化Supabase
     */
    async initSupabase() {
        try {
            console.log('初始化Supabase...');
            
            // 检查是否已有配置
            if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
                console.warn('Supabase配置缺失，使用本地模式');
                this.state.supabaseReady = false;
                return;
            }
            
            // 创建Supabase客户端
            const { createClient } = window.supabase;
            if (!createClient) {
                throw new Error('Supabase客户端库未加载');
            }
            
            this.state.supabase = createClient(
                window.SUPABASE_URL,
                window.SUPABASE_ANON_KEY,
                {
                    auth: {
                        autoRefreshToken: true,
                        persistSession: true,
                        detectSessionInUrl: true
                    }
                }
            );
            
            // 测试连接
            const { error } = await this.state.supabase
                .from('candy_math_battles')
                .select('count', { count: 'exact', head: true });
            
            if (error) {
                console.error('Supabase连接测试失败:', error);
                this.state.supabaseReady = false;
                this.state.supabaseError = error.message;
                
                // 如果是API key错误，给出明确提示
                if (error.message?.includes('API key')) {
                    console.warn('Supabase API key配置错误，请检查环境变量');
                }
            } else {
                console.log('Supabase连接成功');
                this.state.supabaseReady = true;
                this.state.supabaseError = null;
            }
            
        } catch (error) {
            console.error('Supabase初始化失败:', error);
            this.state.supabaseReady = false;
            this.state.supabaseError = error.message;
        }
    }

    /**
     * 初始化对战模式（懒加载）
     */
    initBattle() {
        if (!this.battle) {
            console.log('初始化对战模式...');
            this.battle = new BattleMode(this);
            this.battle.init();
            console.log('对战模式初始化完成');
        }
        return this.battle;
    }

    /**
     * 初始化锦标赛模式（懒加载）
     */
    initTournament() {
        if (!this.tournament) {
            this.tournament = new TournamentMode(this);
            this.tournament.init();
        }
        return this.tournament;
    }

    /**
     * 销毁游戏（清理资源）
     */
    destroy() {
        // 清理定时器
        if (this.state.timer) {
            clearInterval(this.state.timer);
            this.state.timer = null;
        }
        if (this.state.hintTimer) {
            clearInterval(this.state.hintTimer);
            this.state.hintTimer = null;
        }
        if (this.state.feedbackTimer) {
            clearTimeout(this.state.feedbackTimer);
            this.state.feedbackTimer = null;
        }
        
        // 清理子模块
        this.battle?.leaveBattle();
        this.tournament?.destroy();
        
        // 移除网络监听
        window.removeEventListener('online', this.handleNetworkOnline);
        window.removeEventListener('offline', this.handleNetworkOffline);
        
        // 清理全局引用
        if (window.battleMode === this.battle) {
            window.battleMode = null;
        }
        if (window.battleModeInstance === this.battle) {
            window.battleModeInstance = null;
        }
        
        this.initialized = false;
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 语言切换
        const langBtn = document.getElementById('lang-switch');
        if (langBtn) {
            if (this.langClickHandler) {
                langBtn.removeEventListener('click', this.langClickHandler);
            }
            this.langClickHandler = () => this.ui?.toggleLanguage();
            langBtn.addEventListener('click', this.langClickHandler);
        }

        // 模式切换
        document.querySelectorAll('.mode-btn').forEach(btn => {
            const handler = (e) => this.switchMode(e);
            btn.removeEventListener('click', handler);
            btn.addEventListener('click', handler);
        });

        // 难度切换
        document.querySelectorAll('.difficulty-btn').forEach(btn => {
            const handler = (e) => this.switchDifficulty(e);
            btn.removeEventListener('click', handler);
            btn.addEventListener('click', handler);
        });

        // 开始游戏
        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            if (this.startGameHandler) {
                startBtn.removeEventListener('click', this.startGameHandler);
            }
            this.startGameHandler = () => this.startGame();
            startBtn.addEventListener('click', this.startGameHandler);
        }

        // 游戏控制
        const hintBtn = document.getElementById('hint-btn');
        if (hintBtn) {
            if (this.hintHandler) {
                hintBtn.removeEventListener('click', this.hintHandler);
            }
            this.hintHandler = () => this.showHint();
            hintBtn.addEventListener('click', this.hintHandler);
        }

        const refreshBtn = document.getElementById('refresh-btn');
        if (refreshBtn) {
            if (this.refreshHandler) {
                refreshBtn.removeEventListener('click', this.refreshHandler);
            }
            this.refreshHandler = () => this.refreshGrid();
            refreshBtn.addEventListener('click', this.refreshHandler);
        }

        const pauseBtn = document.getElementById('pause-btn');
        if (pauseBtn) {
            if (this.pauseHandler) {
                pauseBtn.removeEventListener('click', this.pauseHandler);
            }
            this.pauseHandler = () => this.togglePause();
            pauseBtn.addEventListener('click', this.pauseHandler);
        }

        const endBtn = document.getElementById('endgame-btn');
        if (endBtn) {
            if (this.endHandler) {
                endBtn.removeEventListener('click', this.endHandler);
            }
            this.endHandler = () => this.endGame();
            endBtn.addEventListener('click', this.endHandler);
        }

        const homeBtn = document.getElementById('home-btn');
        if (homeBtn) {
            if (this.homeHandler) {
                homeBtn.removeEventListener('click', this.homeHandler);
            }
            this.homeHandler = () => this.goHome();
            homeBtn.addEventListener('click', this.homeHandler);
        }

        const homeFromGameoverBtn = document.getElementById('home-from-gameover-btn');
        if (homeFromGameoverBtn) {
            if (this.homeFromGameoverHandler) {
                homeFromGameoverBtn.removeEventListener('click', this.homeFromGameoverHandler);
            }
            this.homeFromGameoverHandler = () => this.goHome();
            homeFromGameoverBtn.addEventListener('click', this.homeFromGameoverHandler);
        }

        const playAgainBtn = document.getElementById('play-again-btn');
        if (playAgainBtn) {
            if (this.playAgainHandler) {
                playAgainBtn.removeEventListener('click', this.playAgainHandler);
            }
            this.playAgainHandler = () => this.restart();
            playAgainBtn.addEventListener('click', this.playAgainHandler);
        }

        const exportBtn = document.getElementById('export-data-btn');
        if (exportBtn) {
            if (this.exportHandler) {
                exportBtn.removeEventListener('click', this.exportHandler);
            }
            this.exportHandler = () => this.storage?.exportData();
            exportBtn.addEventListener('click', this.exportHandler);
        }

        // 关闭按钮
        const closeGameover = document.getElementById('close-gameover');
        if (closeGameover) {
            closeGameover.removeEventListener('click', this.boundHandlers.closeGameover);
            closeGameover.addEventListener('click', this.boundHandlers.closeGameover);
        }

        const closeAuth = document.getElementById('close-auth');
        if (closeAuth) {
            closeAuth.removeEventListener('click', this.boundHandlers.closeAuth);
            closeAuth.addEventListener('click', this.boundHandlers.closeAuth);
        }

        const closeTutorial = document.getElementById('close-tutorial');
        if (closeTutorial) {
            closeTutorial.removeEventListener('click', this.boundHandlers.closeTutorial);
            closeTutorial.addEventListener('click', this.boundHandlers.closeTutorial);
        }

        // 卡片点击
        const gameGrid = document.getElementById('game-grid');
        if (gameGrid) {
            if (this.cardClickHandler) {
                gameGrid.removeEventListener('click', this.cardClickHandler);
            }
            this.cardClickHandler = (e) => this.handleCardClick(e);
            gameGrid.addEventListener('click', this.cardClickHandler);
        }

        // ESC键
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
        }
        this.keydownHandler = (e) => this.handleKeydown(e);
        document.addEventListener('keydown', this.keydownHandler);

        // 模态框背景点击
        const authModal = document.getElementById('auth-modal');
        if (authModal) {
            authModal.removeEventListener('click', this.boundHandlers.authModalClick);
            authModal.addEventListener('click', this.boundHandlers.authModalClick);
        }

        const gameoverModal = document.getElementById('game-over-modal');
        if (gameoverModal) {
            gameoverModal.removeEventListener('click', this.boundHandlers.gameoverModalClick);
            gameoverModal.addEventListener('click', this.boundHandlers.gameoverModalClick);
        }

        const tutorialModal = document.getElementById('tutorial-modal');
        if (tutorialModal) {
            tutorialModal.removeEventListener('click', this.boundHandlers.tutorialModalClick);
            tutorialModal.addEventListener('click', this.boundHandlers.tutorialModalClick);
        }

        const tournamentModal = document.getElementById('tournament-modal');
        if (tournamentModal) {
            tournamentModal.removeEventListener('click', this.boundHandlers.tournamentModalClick);
            tournamentModal.addEventListener('click', this.boundHandlers.tournamentModalClick);
        }

        const battleModal = document.getElementById('battle-modal');
        if (battleModal) {
            battleModal.removeEventListener('click', this.boundHandlers.battleModalClick);
            battleModal.addEventListener('click', this.boundHandlers.battleModalClick);
        }

        const joinModal = document.getElementById('join-modal');
        if (joinModal) {
            joinModal.removeEventListener('click', this.boundHandlers.joinModalClick);
            joinModal.addEventListener('click', this.boundHandlers.joinModalClick);
        }

        const createModal = document.getElementById('create-tournament-modal');
        if (createModal) {
            createModal.removeEventListener('click', this.boundHandlers.createModalClick);
            createModal.addEventListener('click', this.boundHandlers.createModalClick);
        }
    }

    /**
     * 设置网络监听
     */
    setupNetworkListeners() {
        window.removeEventListener('online', this.handleNetworkOnline);
        window.removeEventListener('offline', this.handleNetworkOffline);
        
        this.handleNetworkOnline = () => this.handleNetworkOnline();
        this.handleNetworkOffline = () => this.handleNetworkOffline();
        
        window.addEventListener('online', this.handleNetworkOnline);
        window.addEventListener('offline', this.handleNetworkOffline);
    }

    /**
     * 网络连接恢复
     */
    handleNetworkOnline() {
        this.state.isOnline = true;
        this.ui?.updateUserUI();
        this.ui?.showFeedback('networkOnline', '#4CAF50');
    }

    /**
     * 网络断开
     */
    handleNetworkOffline() {
        this.state.isOnline = false;
        this.ui?.updateUserUI();
        this.ui?.showFeedback('networkOffline', '#ffa500');
    }

    /**
     * 键盘事件
     */
    handleKeydown(e) {
        if (e.key === 'Escape') {
            this.ui?.closeModal('auth-modal');
            this.ui?.closeModal('game-over-modal');
            this.ui?.closeModal('tutorial-modal');
            this.ui?.closeModal('tournament-modal');
            this.ui?.closeModal('battle-modal');
            this.ui?.closeModal('join-modal');
            this.ui?.closeModal('create-tournament-modal');
        }
    }

    // ==================== 模式切换 ====================

    /**
     * 切换游戏模式
     */
    switchMode(e) {
        const btn = e.currentTarget;
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.currentMode = btn.dataset.mode;
        this.ui?.updateModeDisplay();
    }

    /**
     * 切换难度
     */
    switchDifficulty(e) {
        const btn = e.currentTarget;
        document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.state.currentDifficulty = btn.dataset.difficulty;
        this.loadDifficulty(btn.dataset.difficulty);
    }

    /**
     * 加载难度配置
     */
    loadDifficulty(difficulty) {
        const config = this.difficultyConfig[difficulty];
        const { min, max } = config.numberRange;
        const maxPossibleSum = max * 2;
        const minPossibleSum = min * 2;

        config.targetRange.min = Math.max(config.targetRange.min, minPossibleSum);
        config.targetRange.max = Math.min(config.targetRange.max, maxPossibleSum);

        this.currentConfig = config;
    }

    // ==================== 游戏控制 ====================

    /**
     * 开始游戏
     */
    startGame() {
        try {
            if (this.state.timer) {
                clearInterval(this.state.timer);
                this.state.timer = null;
            }
            if (this.state.hintTimer) {
                clearInterval(this.state.hintTimer);
                this.state.hintTimer = null;
            }

            this.ui?.showGameArea();

            this.resetGame();

            this.state.gameActive = true;
            this.state.isPaused = false;
            this.state.startTime = Date.now();

            const mode = this.modeConfig[this.state.currentMode];
            this.ui?.updatePauseButton();

            if (mode.timeLimit) {
                this.state.timeLeft = mode.timeLimit;
                this.ui?.updateTime(this.state.timeLeft);

                this.state.timer = setInterval(() => {
                    if (!this.state.gameActive || this.state.isPaused) return;
                    this.state.timeLeft--;
                    this.ui?.updateTime(this.state.timeLeft);

                    if (this.state.timeLeft <= 0) {
                        this.endGame();
                    }
                }, 1000);
            } else {
                this.state.timer = setInterval(() => {
                    if (!this.state.gameActive || this.state.isPaused) return;
                    const elapsed = Math.floor((Date.now() - this.state.startTime) / 1000);
                    this.ui?.updateTime(elapsed);
                }, 1000);
            }

            this.generateTarget();
            this.generateGrid();
        } catch (error) {
            console.error('开始游戏失败:', error);
            this.ui?.showFeedback('errorOccurred', '#ff4444');
        }
    }

    /**
     * 重置游戏状态
     */
    resetGame() {
        this.state.score = 0;
        this.state.completed = 0;
        this.state.correct = 0;
        this.state.attempts = 0;
        this.state.selectedCards = [];
        this.state.hintCooldown = 0;
        this.state.timer = null;

        this.ui?.updateStats();
        this.ui?.updateHintButton(0);
    }

    /**
     * 暂停/继续游戏
     */
    togglePause() {
        if (!this.state.gameActive) return;

        this.state.isPaused = !this.state.isPaused;
        this.ui?.updatePauseButton();

        if (this.state.isPaused) {
            this.ui?.showFeedback('gamePaused', '#ffa500');
            this.ui?.setCardsEnabled(false);
        } else {
            this.ui?.showFeedback('gameResumed', '#4CAF50');
            this.ui?.setCardsEnabled(true);
        }
    }

    /**
     * 返回首页
     */
    goHome() {
        if (this.state.gameActive) {
            const lang = I18n;
            if (confirm(lang.t('saveProgress'))) {
                this.storage?.saveLocalData();
            }

            this.state.gameActive = false;
            if (this.state.timer) {
                clearInterval(this.state.timer);
                this.state.timer = null;
            }
            if (this.state.hintTimer) {
                clearInterval(this.state.hintTimer);
                this.state.hintTimer = null;
            }
        }

        this.ui?.showHome();
    }

    /**
     * 重新开始
     */
    restart() {
        this.ui?.closeModal('game-over-modal');
        this.startGame();
    }

    /**
     * 结束游戏
     */
    async endGame() {
        this.state.gameActive = false;
        this.state.isPaused = false;

        if (this.state.timer) {
            clearInterval(this.state.timer);
            this.state.timer = null;
        }
        if (this.state.hintTimer) {
            clearInterval(this.state.hintTimer);
            this.state.hintTimer = null;
        }

        this.ui?.setCardsEnabled(false);
        this.ui?.clearSelected();
        this.state.selectedCards = [];
        
        this.ui?.showGameOver();

        this.soundManager.play('achievement');

        this.storage?.saveLocalData();

        if (!this.state.currentUser) {
            this.storage?.saveGuestGame();
        }

        if (this.state.currentUser && this.state.isOnline && this.state.supabaseReady) {
            await this.storage?.syncToCloud();
        }
    }

    // ==================== 网格生成 ====================

    /**
     * 生成游戏网格
     */
    generateGrid() {
        const numbers = this.generateNumbers();
        this.ui?.renderGrid(numbers);

        if (this.state.gameActive && !this.state.isPaused) {
            this.ui?.setCardsEnabled(true);
        }
    }

    /**
     * 生成数字
     */
    generateNumbers() {
        const { min, max } = this.currentConfig.numberRange;
        const numbers = NumberGenerator.generateGridNumbers(
            { min, max },
            this.state.currentTarget,
            10
        );

        if (!numbers) {
            this.generateTarget();
            return this.generateNumbers();
        }

        return numbers;
    }

    /**
     * 刷新网格
     */
    refreshGrid() {
        this.generateGrid();
        this.state.selectedCards = [];
        this.soundManager.play('click');
        this.ui?.showFeedback('refreshed', '#ffa500');
    }

    /**
     * 生成目标数字
     */
    generateTarget() {
        const { min, max } = this.currentConfig.targetRange;
        const minSum = this.currentConfig.numberRange.min * 2;
        const maxSum = this.currentConfig.numberRange.max * 2;
        
        this.state.currentTarget = NumberGenerator.generateTarget(
            { min, max },
            minSum,
            maxSum
        );
        
        this.ui?.updateTarget(this.state.currentTarget);
    }

    // ==================== 卡片交互 ====================

    /**
     * 处理卡片点击
     */
    handleCardClick(e) {
        try {
            const card = e.target.closest('.number-card');
            if (!card) return;

            if (!this.state.gameActive || this.state.isPaused || card.classList.contains('matched')) return;

            this.soundManager.play('click');

            if (card.classList.contains('selected')) {
                card.classList.remove('selected');
                this.state.selectedCards = this.state.selectedCards.filter(c => c !== card);
                return;
            }

            if (this.state.selectedCards.length >= 2) {
                this.ui?.showFeedback('maxTwo', '#ff4444');
                return;
            }

            card.classList.add('selected');
            this.state.selectedCards.push(card);

            if (this.state.selectedCards.length === 2) {
                this.checkMatch();
            }
        } catch (error) {
            console.error('卡片点击错误:', error);
            this.ui?.showFeedback('errorOccurred', '#ff4444');
        }
    }

    /**
     * 检查匹配
     */
    checkMatch() {
        const [card1, card2] = this.state.selectedCards;
        const num1 = parseInt(card1.dataset.value);
        const num2 = parseInt(card2.dataset.value);
        const sum = num1 + num2;
        const isCorrect = sum === this.state.currentTarget;

        this.state.attempts++;

        if (isCorrect) {
            this.handleCorrect(card1, card2);
        } else {
            this.handleWrong(card1, card2);
        }
    }

    /**
     * 处理正确匹配
     */
    handleCorrect(card1, card2) {
        this.state.correct++;
        this.state.completed++;

        const baseScore = 10;
        const multiplier = this.currentConfig.scoreMultiplier;
        let timeBonus = 1;

        if (this.state.currentMode === 'challenge' && this.state.timeLeft > 0) {
            timeBonus = 1 + (this.state.timeLeft / 100);
        }

        this.state.score += Math.floor(baseScore * multiplier * timeBonus);

        this.state.history.push({
            type: 'correct',
            target: this.state.currentTarget,
            num1: parseInt(card1.dataset.value),
            num2: parseInt(card2.dataset.value),
            timestamp: new Date().toISOString()
        });

        if (this.state.history.length > 100) {
            this.state.history.shift();
        }

        this.soundManager.play('correct');
        this.ui?.showFeedback('correct', '#4CAF50');

        this.state.selectedCards = [];
        this.ui?.clearSelected();

        this.ui?.addMatchAnimation(card1, card2);

        setTimeout(() => {
            this.ui?.removeCards(card1, card2);

            const remaining = document.querySelectorAll('.number-card:not(.matched)');
            if (remaining.length < 4) {
                this.generateGrid();
            }

            this.generateTarget();

            setTimeout(() => this.checkValidCombination(), 100);
        }, 300);

        this.ui?.updateStats();

        const mode = this.modeConfig[this.state.currentMode];
        if (mode.targetCount && this.state.completed >= mode.targetCount) {
            this.endGame();
        }
    }

    /**
     * 处理错误匹配
     */
    handleWrong(card1, card2) {
        this.state.wrongQuestions.push({
            target: this.state.currentTarget,
            num1: parseInt(card1.dataset.value),
            num2: parseInt(card2.dataset.value),
            timestamp: new Date().toISOString()
        });

        if (this.state.wrongQuestions.length > 200) {
            this.state.wrongQuestions.shift();
        }

        this.soundManager.play('wrong');
        this.ui?.showFeedback('wrong', '#ff4444');

        setTimeout(() => {
            card1.classList.remove('selected');
            card2.classList.remove('selected');
            this.state.selectedCards = [];

            this.checkValidCombination();
        }, 500);
    }

    /**
     * 检查是否还有有效组合
     */
    checkValidCombination() {
        const cards = document.querySelectorAll('.number-card:not(.matched)');
        const nums = Array.from(cards).map(c => parseInt(c.dataset.value));

        for (let i = 0; i < nums.length; i++) {
            for (let j = i + 1; j < nums.length; j++) {
                if (nums[i] + nums[j] === this.state.currentTarget) {
                    return true;
                }
            }
        }

        this.ui?.showFeedback('noCombination', '#ffa500');
        setTimeout(() => this.refreshGrid(), 500);
        return false;
    }

    // ==================== 提示系统 ====================

    /**
     * 显示提示
     */
    showHint() {
        if (!this.state.gameActive || this.state.isPaused) return;

        if (this.state.hintCooldown > 0) {
            this.ui?.showFeedback('hintCooldown', '#ffa500');
            return;
        }

        const cards = document.querySelectorAll('.number-card:not(.matched)');
        const nums = Array.from(cards).map(c => parseInt(c.dataset.value));
        const pair = ArrayUtils.findPairSum(nums, this.state.currentTarget);

        if (pair) {
            this.ui?.highlightHint(pair);
            this.soundManager.play('click');
            this.ui?.showFeedback('hintHere', '#4CAF50');

            this.state.hintCooldown = 10;
            this.startHintCooldown();
        } else {
            this.ui?.showFeedback('noHint', '#ff4444');
        }
    }

    /**
     * 开始提示冷却
     */
    startHintCooldown() {
        if (this.state.hintTimer) {
            clearInterval(this.state.hintTimer);
        }

        this.state.hintTimer = setInterval(() => {
            this.state.hintCooldown--;
            this.ui?.updateHintButton(this.state.hintCooldown);

            if (this.state.hintCooldown <= 0) {
                clearInterval(this.state.hintTimer);
                this.state.hintTimer = null;
            }
        }, 1000);
    }

    // ==================== 导出数据 ====================

    /**
     * 导出数据（委托给storage）
     */
    exportData() {
        this.storage?.exportData();
    }
}

// ==================== 启动游戏 ====================
document.addEventListener('DOMContentLoaded', () => {
    // 设置Supabase配置（从HTML读取）
    const configScript = document.getElementById('supabase-config');
    const config = configScript ? JSON.parse(configScript.textContent) : {};
    
    window.SUPABASE_URL = config.supabaseUrl || 'https://zykqddnckhcivutcropm.supabase.co';
    window.SUPABASE_ANON_KEY = config.supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp5a3FkZG5ja2hjaXZ1dGNyb3BtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NjQwNjIsImV4cCI6MjA4NzU0MDA2Mn0.hc3aROjGSUaAt7Jlcf3qqY4XeVSiKpwIxS8LHQ2LFOk';
    
    window.game = new CandyMathGame();
    window.game.init();
    
    // 延迟检查
    setTimeout(() => {
        console.log('启动检查:', {
            gameExists: !!window.game,
            battleExists: !!window.game?.battle,
            battleModeGlobal: !!window.battleMode,
            battleModeInstance: !!window.battleModeInstance,
            supabaseReady: window.game?.state?.supabaseReady,
            supabaseError: window.game?.state?.supabaseError
        });
        
        // 如果battleMode仍未挂载，手动挂载
        if (window.game?.battle && !window.battleMode) {
            window.battleMode = window.game.battle;
            window.battleModeInstance = window.game.battle;
            console.log('手动挂载 battleMode 和 battleModeInstance 成功');
        }
    }, 1000);
});
