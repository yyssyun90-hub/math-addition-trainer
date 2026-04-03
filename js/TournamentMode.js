/**
 * ==================== 糖果数学消消乐 - 锦标赛模式 ====================
 * 包含：创建锦标赛、报名参赛、赛程管理、排名系统、比赛结果处理、奖金发放
 * 依赖：utils.js (需要 I18n, SoundManager, GAME_CONSTANTS)
 * 
 * 特别说明：锦标赛创建权限已限制，仅允许指定邮箱的用户创建
 * 授权邮箱：yyssyun90@gmail.com
 * 
 * 修改记录：
 * 2024-01-XX - 重构为RPC调用，提高安全性
 * 2024-01-XX - 移除所有客户端业务逻辑，由数据库事务处理
 * 2024-03-XX - 支持自定义参赛人数 (2-100人)
 * 2024-04-01 - 加强权限检查，仅限 yyssyun90@gmail.com 创建锦标赛
 * 2024-04-02 - 修复状态查询，添加 waiting 状态支持
 * 2024-04-02 - 修复 renderTournamentList 自动创建容器
 * 2024-04-02 - 添加删除锦标赛功能（仅管理员可见）
 * 2024-04-03 - 添加 I18n 国际化支持（中英文翻译）
 * ==============================================================
 */

class TournamentMode {
    constructor(game) {
        this.game = game;
        this.currentTournament = null;
        this.bracket = null;
        this.activeTab = 'lobby';
        this.initialized = false;
        
        // 授权创建锦标赛的邮箱列表 - 只有超级管理员
        this.authorizedCreators = ['yyssyun90@gmail.com'];
        
        // 锦标赛常量
        this.tournamentConstants = {
            MIN_PLAYERS: 2,
            MAX_PLAYERS: 100,
            DEFAULT_PLAYERS: 16,
            PRIZE_POOL_PERCENTAGES: {
                first: 0.5,  // 冠军 50%
                second: 0.3,  // 亚军 30%
                third: 0.2    // 季军 20%
            }
        };
        
        // 事件处理器
        this.tabClickHandlers = new Map();
        this.createBtnHandler = null;
        this.confirmCreateHandler = null;
        this.cancelCreateHandler = null;
        this.tournamentBtnHandler = null;
        this.sizeInputHandler = null;
        this.feeInputHandler = null;
        
        // 加载状态
        this.isLoading = false;
        this.loadingElements = new Set();
        
        // 缓存
        this.cache = {
            tournaments: null,
            rankings: null,
            history: null,
            lastFetch: 0,
            cacheTTL: 5 * 60 * 1000 // 5分钟缓存
        };
    }

    // ==================== 初始化 ====================

    /**
     * 初始化锦标赛模式
     */
    init() {
        if (this.initialized) return;
        this.bindEvents();
        this.initialized = true;
        console.log('TournamentMode 初始化完成');
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 锦标赛主按钮
        const tournamentBtn = document.getElementById('tournament-btn');
        if (tournamentBtn) {
            if (this.tournamentBtnHandler) {
                tournamentBtn.removeEventListener('click', this.tournamentBtnHandler);
            }
            this.tournamentBtnHandler = () => this.openTournamentLobby();
            tournamentBtn.addEventListener('click', this.tournamentBtnHandler);
        }

        // 创建锦标赛按钮
        const createBtn = document.getElementById('create-tournament-btn');
        if (createBtn) {
            if (this.createBtnHandler) {
                createBtn.removeEventListener('click', this.createBtnHandler);
            }
            this.createBtnHandler = () => this.showCreateTournament();
            createBtn.addEventListener('click', this.createBtnHandler);
        }

        // 确认创建按钮
        const confirmCreate = document.getElementById('confirm-create-tournament');
        if (confirmCreate) {
            if (this.confirmCreateHandler) {
                confirmCreate.removeEventListener('click', this.confirmCreateHandler);
            }
            this.confirmCreateHandler = () => this.createTournament();
            confirmCreate.addEventListener('click', this.confirmCreateHandler);
        }

        // 取消创建按钮
        const cancelCreate = document.getElementById('cancel-create-tournament');
        if (cancelCreate) {
            if (this.cancelCreateHandler) {
                cancelCreate.removeEventListener('click', this.cancelCreateHandler);
            }
            this.cancelCreateHandler = () => this.closeCreateModal();
            cancelCreate.addEventListener('click', this.cancelCreateHandler);
        }

        // 标签页切换
        document.querySelectorAll('.tournament-tabs .tab-btn').forEach(btn => {
            const tabId = btn.dataset.tab;
            if (!tabId) return;
            
            if (this.tabClickHandlers.has(tabId)) {
                btn.removeEventListener('click', this.tabClickHandlers.get(tabId));
            }
            
            const handler = (e) => this.switchTournamentTab(tabId);
            btn.addEventListener('click', handler);
            this.tabClickHandlers.set(tabId, handler);
        });

        window.addEventListener('beforeunload', () => this.destroy());
    }

    // ==================== 辅助方法 ====================

    /**
     * 获取翻译文本
     */
    t(key) {
        if (typeof I18n !== 'undefined' && I18n.t) {
            return I18n.t(key);
        }
        return key;
    }

    /**
     * 显示反馈消息
     */
    showFeedback(message, color = '#4CAF50') {
        if (this.game?.ui && typeof this.game.ui.showFeedback === 'function') {
            this.game.ui.showFeedback(message, color);
        } else {
            console.log('[Tournament]', message);
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: ${color};
                color: white;
                padding: 10px 20px;
                border-radius: 25px;
                z-index: 10002;
                font-size: 0.9rem;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                animation: slideDown 0.3s ease-out;
            `;
            toast.textContent = message;
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.style.animation = 'fadeOut 0.3s ease-out';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }
    }

    /**
     * 检查网络是否可用
     */
    isNetworkAvailable() {
        return navigator.onLine && this.game?.state?.isOnline !== false;
    }

    /**
     * 获取当前用户
     */
    getCurrentUser() {
        return this.game?.state?.currentUser;
    }

    // ==================== 权限检查 ====================

    /**
     * 检查当前用户是否有权创建锦标赛
     * 只有 yyssyun90@gmail.com 可以创建锦标赛
     */
    canCreateTournament() {
        if (!this.game.auth || !this.game.auth.isLoggedIn()) {
            return false;
        }
        
        const userEmail = this.game.state.currentUser?.email;
        // 只有指定的邮箱才能创建锦标赛
        const isAuthorized = userEmail === 'yyssyun90@gmail.com';
        
        if (!isAuthorized && userEmail) {
            console.log('非授权用户尝试创建锦标赛:', userEmail);
        }
        
        return isAuthorized;
    }

    /**
     * 检查创建权限并提示
     */
    checkCreatePermission() {
        if (!this.game.auth || !this.game.auth.isLoggedIn()) {
            this.showFeedback(this.t('loginRequired') || '请先登录', '#ff4444');
            if (this.game.auth) {
                this.game.auth.showAuthModal('login');
            }
            return false;
        }

        if (!this.canCreateTournament()) {
            this.showFeedback(this.t('adminOnly') || '只有超级管理员可以创建锦标赛', '#ff4444');
            return false;
        }

        return true;
    }

    // ==================== 缓存管理 ====================

    isCacheValid(key) {
        if (!this.cache[key]) return false;
        return Date.now() - this.cache.lastFetch < this.cache.cacheTTL;
    }

    updateCache(key, data) {
        this.cache[key] = data;
        this.cache.lastFetch = Date.now();
    }

    clearCache() {
        this.cache = {
            tournaments: null,
            rankings: null,
            history: null,
            lastFetch: 0,
            cacheTTL: 5 * 60 * 1000
        };
    }

    // ==================== 大厅管理 ====================

    /**
     * 打开锦标赛大厅
     */
    async openTournamentLobby() {
        if (!this.game.auth || !this.game.auth.isLoggedIn()) {
            this.showFeedback(this.t('loginRequired') || '请先登录', '#ff4444');
            if (this.game.auth) {
                this.game.auth.showAuthModal('login');
            }
            return;
        }

        if (this.game.ui) {
            this.game.ui.openModal('tournament-modal');
        }
        
        // 更新标签页按钮文字
        this.updateTabButtonsText();
        
        this.switchTournamentTab('lobby');
        await this.loadTournamentLobby();
        this.updateCreateButtonVisibility();
    }

    /**
     * 更新标签页按钮文字（支持翻译）
     */
    updateTabButtonsText() {
        const tabs = document.querySelectorAll('.tournament-tabs .tab-btn');
        const tabMap = ['lobby', 'bracket', 'history', 'ranking'];
        const tabTextMap = {
            'lobby': this.t('lobby') || '大厅',
            'bracket': this.t('bracket') || '赛程表',
            'history': this.t('history') || '历史',
            'ranking': this.t('ranking') || '排名'
        };
        tabs.forEach((btn, index) => {
            if (tabMap[index]) {
                btn.innerHTML = tabTextMap[tabMap[index]] || btn.innerHTML;
            }
        });
        
        // 更新创建按钮文字
        const createBtn = document.getElementById('create-tournament-btn');
        if (createBtn) {
            createBtn.innerHTML = `➕ ${this.t('createTournament') || '创建锦标赛'}`;
        }
    }

    /**
     * 更新创建按钮可见性
     */
    updateCreateButtonVisibility() {
        const createBtn = document.getElementById('create-tournament-btn');
        if (createBtn) {
            createBtn.style.display = this.canCreateTournament() ? 'block' : 'none';
        }
    }

    /**
     * 切换锦标赛标签页
     */
    switchTournamentTab(tabId) {
        if (!['lobby', 'bracket', 'history', 'ranking'].includes(tabId)) {
            console.warn('无效的标签页:', tabId);
            return;
        }

        document.querySelectorAll('.tournament-tabs .tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });

        document.querySelectorAll('.tab-content').forEach(content => {
            content.style.display = 'none';
        });
        
        const tabContent = document.getElementById(`${tabId}-tab`);
        if (tabContent) {
            tabContent.style.display = 'block';
        }

        this.activeTab = tabId;

        switch (tabId) {
            case 'lobby':
                this.loadTournamentLobby();
                break;
            case 'ranking':
                this.loadTournamentRanking();
                break;
            case 'history':
                this.loadTournamentHistory();
                break;
        }
    }

    /**
     * 显示加载状态
     */
    showLoading(elementId, message = '加载中...') {
        const element = document.getElementById(elementId);
        if (element) {
            this.loadingElements.add(elementId);
            element.innerHTML = `<div class="loading-spinner">🔄 ${message}</div>`;
        }
    }

    /**
     * 隐藏加载状态
     */
    hideLoading(elementId) {
        this.loadingElements.delete(elementId);
    }

    /**
     * 加载锦标赛大厅列表 - 修复版：添加 waiting 状态支持
     */
    async loadTournamentLobby(forceRefresh = false) {
        try {
            if (!this.game.state.supabaseReady || !this.game.state.supabase) {
                this.showEmptyList('tournament-list', this.t('supabaseNotConnected') || 'Supabase未连接');
                return;
            }

            if (!this.isNetworkAvailable()) {
                this.showEmptyList('tournament-list', this.t('networkOffline') || '网络不可用，请检查连接');
                return;
            }

            if (!forceRefresh && this.isCacheValid('tournaments')) {
                this.renderTournamentList(this.cache.tournaments);
                return;
            }

            this.showLoading('tournament-list', this.t('loading') || '加载锦标赛列表...');

            // ✅ 修复：添加 'waiting' 状态
            const { data: tournaments, error } = await this.fetchWithRetry(
                () => this.game.state.supabase
                    .from('candy_math_tournaments')
                    .select('*')
                    .in('status', ['waiting', 'registering', 'active'])
                    .order('created_at', { ascending: false })
                    .limit(50)
            );

            if (error) throw error;

            this.updateCache('tournaments', tournaments);
            this.renderTournamentList(tournaments);
            
        } catch (error) {
            console.error('加载锦标赛列表失败:', error);
            this.hideLoading('tournament-list');
            this.showEmptyList('tournament-list', this.getFriendlyErrorMessage(error));
            this.showFeedback(this.t('loadFailed') || '加载失败', '#ff4444');
        }
    }

    /**
     * 渲染锦标赛列表 - 修复版：自动创建容器 + 添加删除按钮
     */
    renderTournamentList(tournaments) {
        // ✅ 确保容器存在
        let list = document.getElementById('tournament-list');
        if (!list) {
            list = document.createElement('div');
            list.id = 'tournament-list';
            list.className = 'tournament-list';
            list.style.cssText = 'padding: 10px; min-height: 200px;';
            
            // 找到合适的父容器
            let parent = document.querySelector('.tournament-lobby, .tournament-container, .tournament-panel, .tab-content');
            if (!parent) {
                parent = document.querySelector('main, .game-container, body');
            }
            if (parent) {
                parent.appendChild(list);
                console.log('✅ 自动创建了 tournament-list 容器');
            } else {
                console.warn('⚠️ 找不到父容器，无法创建 tournament-list');
                return;
            }
        }

        this.hideLoading('tournament-list');

        if (!tournaments || tournaments.length === 0) {
            list.innerHTML = `<div class="empty-state">${this.t('noTournaments') || '暂无进行中的锦标赛'}</div>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        const tempDiv = document.createElement('div');
        
        tournaments.forEach(t => {
            tempDiv.innerHTML = this.renderTournamentItem(t);
            const item = tempDiv.firstElementChild;
            
            const joinBtn = item.querySelector(`#join-tournament-${t.id}`);
            if (joinBtn) {
                joinBtn.addEventListener('click', () => this.joinTournament(t.id));
            }
            
            const viewBtn = item.querySelector(`#view-tournament-${t.id}`);
            if (viewBtn) {
                viewBtn.addEventListener('click', () => this.viewTournament(t.id));
            }
            
            // ✅ 添加删除按钮事件绑定
            const deleteBtn = item.querySelector(`#delete-tournament-${t.id}`);
            if (deleteBtn) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteTournament(t.id);
                });
            }
            
            fragment.appendChild(item);
        });

        list.innerHTML = '';
        list.appendChild(fragment);
    }

    /**
     * 渲染锦标赛列表项 - 添加删除按钮 + 翻译支持
     */
    renderTournamentItem(tournament) {
        const statusMap = {
            'waiting': this.t('statusWaiting') || '等待中',
            'registering': this.t('statusRegistering') || '报名中',
            'active': this.t('statusActive') || '进行中',
            'finished': this.t('statusFinished') || '已结束'
        };
        const statusText = statusMap[tournament.status] || tournament.status;

        const statusClass = {
            'waiting': 'status-waiting',
            'registering': 'status-registering',
            'active': 'status-active',
            'finished': 'status-finished'
        }[tournament.status] || '';

        const modeText = tournament.mode === 'challenge' 
            ? '⚡ ' + (this.t('challengeMode') || '挑战') 
            : '📚 ' + (this.t('standardMode') || '标准');
        
        const difficultyMap = {
            'easy': '🍬 ' + (this.t('difficultyEasy') || '简单'),
            'medium': '🍭 ' + (this.t('difficultyMedium') || '中等'),
            'hard': '🍫 ' + (this.t('difficultyHard') || '困难')
        };
        const difficultyText = difficultyMap[tournament.difficulty] || tournament.difficulty;

        const timeLeft = this.getRegistrationTimeLeft(tournament.created_at, tournament.status);
        const timeDisplay = timeLeft ? `<span class="time-left">⏰ ${timeLeft}</span>` : '';

        const buttonText = (tournament.status === 'waiting' || tournament.status === 'registering') 
            ? (this.t('join') || '报名参赛')
            : (this.t('viewSchedule') || '查看赛程');
        
        const buttonHtml = tournament.status === 'waiting' || tournament.status === 'registering'
            ? `<button class="join-tournament-btn" id="join-tournament-${tournament.id}" style="background: #4CAF50; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer;">${buttonText}</button>`
            : `<button class="join-tournament-btn" id="view-tournament-${tournament.id}" style="background: #2196F3; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer;">${buttonText}</button>`;

        // ✅ 管理员可见删除按钮
        const isAdmin = this.canCreateTournament();
        const deleteButton = isAdmin 
            ? `<button class="delete-tournament-btn" id="delete-tournament-${tournament.id}" style="background: #ff4444; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; margin-left: 10px;">🗑️ ${this.t('delete') || '删除'}</button>` 
            : '';

        return `
            <div class="tournament-item" style="border: 1px solid #e0e0e0; border-radius: 12px; padding: 15px; margin: 10px 0; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                            <span style="font-size: 24px;">🏆</span>
                            <h4 style="margin: 0; color: #333;">${this.escapeHtml(tournament.name)}</h4>
                        </div>
                        <div style="display: flex; flex-wrap: wrap; gap: 15px; font-size: 14px; color: #666;">
                            <span>👥 ${tournament.current_players || 1}/${tournament.max_players || tournament.size} ${this.t('players') || '人'}</span>
                            <span>${modeText}</span>
                            <span>${difficultyText}</span>
                            <span>💰 ${this.t('entryFee') || '报名费'}: ${tournament.entry_fee || 0}</span>
                            ${timeDisplay}
                        </div>
                    </div>
                    <div style="display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
                        <span class="tournament-status ${statusClass}" style="padding: 4px 12px; border-radius: 20px; font-size: 12px; background: ${tournament.status === 'waiting' ? '#ff9800' : tournament.status === 'registering' ? '#4caf50' : '#9e9e9e'}; color: white;">${statusText}</span>
                        ${buttonHtml}
                        ${deleteButton}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 获取报名剩余时间
     */
    getRegistrationTimeLeft(createdAt, status) {
        if (status !== 'registering' && status !== 'waiting') return '';
        
        const created = new Date(createdAt).getTime();
        const now = Date.now();
        const timeLeft = 24 * 60 * 60 * 1000 - (now - created);
        
        if (timeLeft <= 0) return this.t('registrationClosed') || '报名已结束';
        
        const hours = Math.floor(timeLeft / (60 * 60 * 1000));
        const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
        
        const remainingText = this.t('remaining') || '剩余';
        const hoursText = this.t('hours') || '小时';
        const minutesText = this.t('minutes') || '分钟';
        
        return hours > 0 
            ? `${remainingText} ${hours}${hoursText}${minutes}${minutesText}` 
            : `${remainingText} ${minutes}${minutesText}`;
    }

    /**
     * 显示空列表提示
     */
    showEmptyList(elementId, message) {
        const element = document.getElementById(elementId);
        if (element && !this.loadingElements.has(elementId)) {
            element.innerHTML = `<div class="empty-state">${message}</div>`;
        }
    }

    // ==================== 锦标赛创建 ====================

    /**
     * 显示创建锦标赛表单
     */
    showCreateTournament() {
        if (!this.checkCreatePermission()) return;

        const nameInput = document.getElementById('tournament-name-input');
        const sizeInput = document.getElementById('tournament-size-input');
        const modeSelect = document.getElementById('tournament-mode');
        const difficultySelect = document.getElementById('tournament-difficulty');
        const feeInput = document.getElementById('tournament-entry-fee');
        const prizePreview = document.getElementById('prize-pool-preview');

        if (nameInput) nameInput.value = '';
        if (sizeInput) {
            sizeInput.value = this.tournamentConstants.DEFAULT_PLAYERS;
            // 添加输入事件监听
            if (this.sizeInputHandler) {
                sizeInput.removeEventListener('input', this.sizeInputHandler);
            }
            this.sizeInputHandler = () => this.updatePrizePreview();
            sizeInput.addEventListener('input', this.sizeInputHandler);
        }
        if (modeSelect) modeSelect.value = 'challenge';
        if (difficultySelect) difficultySelect.value = 'medium';
        if (feeInput) {
            feeInput.value = '0';
            if (this.feeInputHandler) {
                feeInput.removeEventListener('input', this.feeInputHandler);
            }
            this.feeInputHandler = () => this.updatePrizePreview();
            feeInput.addEventListener('input', this.feeInputHandler);
        }
        
        // 隐藏奖池预览（默认不显示）
        if (prizePreview) prizePreview.style.display = 'none';

        if (this.game.ui) {
            this.game.ui.openModal('create-tournament-modal');
        }
    }

    /**
     * 更新奖池预览
     */
    updatePrizePreview() {
        const sizeInput = document.getElementById('tournament-size-input');
        const feeInput = document.getElementById('tournament-entry-fee');
        const prizePreview = document.getElementById('prize-pool-preview');
        
        if (!sizeInput || !feeInput || !prizePreview) return;
        
        const size = parseInt(sizeInput.value) || 0;
        const fee = parseInt(feeInput.value) || 0;
        
        if (size >= this.tournamentConstants.MIN_PLAYERS && fee > 0) {
            const totalPrize = size * fee;
            const firstPrize = Math.floor(totalPrize * this.tournamentConstants.PRIZE_POOL_PERCENTAGES.first);
            const secondPrize = Math.floor(totalPrize * this.tournamentConstants.PRIZE_POOL_PERCENTAGES.second);
            const thirdPrize = Math.floor(totalPrize * this.tournamentConstants.PRIZE_POOL_PERCENTAGES.third);
            
            const firstSpan = document.getElementById('prize-first');
            const secondSpan = document.getElementById('prize-second');
            const thirdSpan = document.getElementById('prize-third');
            if (firstSpan) firstSpan.textContent = firstPrize;
            if (secondSpan) secondSpan.textContent = secondPrize;
            if (thirdSpan) thirdSpan.textContent = thirdPrize;
            
            prizePreview.style.display = 'block';
        } else {
            prizePreview.style.display = 'none';
        }
    }

    /**
     * 关闭创建模态框
     */
    closeCreateModal() {
        if (this.game.ui) {
            this.game.ui.closeModal('create-tournament-modal');
        }
    }

    /**
     * 创建锦标赛（使用RPC）
     */
    async createTournament() {
        if (!this.checkCreatePermission()) return;

        const name = document.getElementById('tournament-name-input')?.value;
        const sizeInput = document.getElementById('tournament-size-input');
        const mode = document.getElementById('tournament-mode')?.value;
        const difficulty = document.getElementById('tournament-difficulty')?.value;
        const entryFee = parseInt(document.getElementById('tournament-entry-fee')?.value) || 0;

        // 验证名称
        if (!name || name.trim().length < 2 || name.trim().length > 50) {
            this.showFeedback(this.t('nameLengthError') || '锦标赛名称长度必须在2-50字符之间', '#ff4444');
            return;
        }

        // 验证参赛人数
        let size;
        if (sizeInput) {
            size = parseInt(sizeInput.value);
            if (isNaN(size) || size < this.tournamentConstants.MIN_PLAYERS || size > this.tournamentConstants.MAX_PLAYERS) {
                this.showFeedback(this.t('playersRangeError') || `参赛人数必须在 ${this.tournamentConstants.MIN_PLAYERS}-${this.tournamentConstants.MAX_PLAYERS} 之间`, '#ff4444');
                return;
            }
        } else {
            this.showFeedback(this.t('playersRequired') || '请填写参赛人数', '#ff4444');
            return;
        }

        // 验证比赛模式
        if (!['challenge', 'standard'].includes(mode)) {
            this.showFeedback(this.t('invalidMode') || '请选择有效的比赛模式', '#ff4444');
            return;
        }

        // 验证难度
        if (!['easy', 'medium', 'hard'].includes(difficulty)) {
            this.showFeedback(this.t('invalidDifficulty') || '请选择有效的难度', '#ff4444');
            return;
        }

        // 验证报名费
        if (entryFee < 0 || entryFee > 10000) {
            this.showFeedback(this.t('entryFeeRangeError') || '报名费必须在0-10000之间', '#ff4444');
            return;
        }

        // 报名费确认
        if (entryFee > 0) {
            const totalPrize = size * entryFee;
            const confirmMsg = `${this.t('createConfirm') || '创建锦标赛将扣除'} ${entryFee} ${this.t('points') || '积分'} ${this.t('asEntryFee') || '作为报名费'}。\n` +
                              `${this.t('totalPrize') || '总奖池'}: ${totalPrize} ${this.t('points') || '积分'}\n` +
                              `${this.t('champion') || '冠军'}: ${Math.floor(totalPrize * 0.5)} ${this.t('points') || '积分'}\n` +
                              `${this.t('runnerUp') || '亚军'}: ${Math.floor(totalPrize * 0.3)} ${this.t('points') || '积分'}\n` +
                              `${this.t('thirdPlace') || '季军'}: ${Math.floor(totalPrize * 0.2)} ${this.t('points') || '积分'}\n\n` +
                              `${this.t('confirmContinue') || '确定继续吗？'}`;
            if (!confirm(confirmMsg)) return;
        }

        // 检查用户登录状态
        const user = this.getCurrentUser();
        if (!user || !user.id) {
            this.showFeedback(this.t('loginRequired') || '请先登录', '#ff4444');
            if (this.game?.auth) {
                this.game.auth.showAuthModal('login');
            }
            return;
        }

        // 检查网络连接
        if (!this.isNetworkAvailable()) {
            this.showFeedback(this.t('networkOffline') || '网络不可用，请检查连接', '#ff4444');
            return;
        }

        // 检查 Supabase 连接
        if (!this.game.state.supabaseReady || !this.game.state.supabase) {
            this.showFeedback(this.t('supabaseNotConnected') || 'Supabase未连接', '#ff4444');
            return;
        }

        const createBtn = document.getElementById('confirm-create-tournament');
        
        try {
            if (createBtn) {
                createBtn.disabled = true;
                createBtn.textContent = this.t('creating') || '创建中...';
            }

            const userId = String(user.id);
            const userName = String(user.name || user.email || '未知用户');

            const { data, error } = await this.fetchWithRetry(
                () => this.game.state.supabase.rpc('create_tournament', {
                    p_name: name.trim(),
                    p_size: size,
                    p_mode: mode,
                    p_difficulty: difficulty,
                    p_entry_fee: entryFee,
                    p_creator_id: userId,
                    p_creator_name: userName
                })
            );

            if (error) throw error;

            if (data?.success) {
                this.closeCreateModal();
                this.clearCache();
                await this.loadTournamentLobby(true);
                
                this.showFeedback(data.message || this.t('createSuccess') || '锦标赛创建成功', '#4CAF50');

                // 切换到大厅标签页
                this.switchTournamentTab('lobby');
            } else {
                this.showFeedback(data?.message || this.t('createFailed') || '创建失败', '#ff4444');
            }
        } catch (error) {
            console.error('创建锦标赛失败:', error);
            this.showFeedback(this.getFriendlyErrorMessage(error), '#ff4444');
        } finally {
            if (createBtn) {
                createBtn.disabled = false;
                createBtn.textContent = this.t('confirmCreate') || '确认创建';
            }
        }
    }

    // ==================== 删除锦标赛 ====================

    /**
     * 删除锦标赛（仅管理员）
     */
    async deleteTournament(tournamentId) {
        // 检查权限
        if (!this.canCreateTournament()) {
            this.showFeedback(this.t('adminOnly') || '只有管理员可以删除锦标赛', '#ff4444');
            return;
        }

        if (!confirm(this.t('deleteConfirm') || '⚠️ 确定要删除这个锦标赛吗？\n\n此操作不可恢复，所有相关数据（参赛者、比赛记录）将被永久删除！')) {
            return;
        }

        if (!this.game.state.supabaseReady || !this.game.state.supabase) {
            this.showFeedback(this.t('supabaseNotConnected') || 'Supabase未连接', '#ff4444');
            return;
        }

        try {
            this.showFeedback(this.t('deleting') || '正在删除...', '#ff9800');

            // 先删除参赛者记录
            const { error: playersError } = await this.game.state.supabase
                .from('candy_math_tournament_players')
                .delete()
                .eq('tournament_id', tournamentId);

            if (playersError) {
                console.warn('删除参赛者记录失败:', playersError);
            }

            // 再删除比赛记录
            const { error: matchesError } = await this.game.state.supabase
                .from('candy_math_tournament_matches')
                .delete()
                .eq('tournament_id', tournamentId);

            if (matchesError) {
                console.warn('删除比赛记录失败:', matchesError);
            }

            // 最后删除锦标赛
            const { error } = await this.game.state.supabase
                .from('candy_math_tournaments')
                .delete()
                .eq('id', tournamentId);

            if (error) throw error;

            this.showFeedback(this.t('deleteSuccess') || '✅ 锦标赛已删除', '#4CAF50');
            this.clearCache();
            await this.loadTournamentLobby(true);

        } catch (error) {
            console.error('删除锦标赛失败:', error);
            this.showFeedback(this.getFriendlyErrorMessage(error), '#ff4444');
        }
    }

    // ==================== 报名参赛 ====================

    /**
     * 报名锦标赛（使用RPC）
     */
    async joinTournament(tournamentId) {
        // 检查用户登录状态
        const user = this.getCurrentUser();
        if (!user || !user.id) {
            this.showFeedback(this.t('loginRequired') || '请先登录', '#ff4444');
            if (this.game?.auth) {
                this.game.auth.showAuthModal('login');
            }
            return;
        }

        // 检查网络连接
        if (!this.isNetworkAvailable()) {
            this.showFeedback(this.t('networkOffline') || '网络不可用，请检查连接', '#ff4444');
            return;
        }

        const joinBtn = document.getElementById(`join-tournament-${tournamentId}`);
        
        if (joinBtn) {
            joinBtn.disabled = true;
            joinBtn.textContent = this.t('joining') || '报名中...';
        }

        if (!this.game.state.supabaseReady || !this.game.state.supabase) {
            this.showFeedback(this.t('supabaseNotConnected') || 'Supabase未连接', '#ff4444');
            if (joinBtn) {
                joinBtn.disabled = false;
                joinBtn.textContent = this.t('join') || '报名参赛';
            }
            return;
        }

        try {
            const userId = String(user.id);
            const userName = String(user.name || user.email || '未知用户');

            const { data, error } = await this.fetchWithRetry(
                () => this.game.state.supabase.rpc('join_tournament', {
                    p_tournament_id: tournamentId,
                    p_user_id: userId,
                    p_user_name: userName
                })
            );

            if (error) throw error;

            if (data?.success) {
                this.showFeedback(data.message || this.t('joinSuccess') || '报名成功', '#4CAF50');
                
                this.clearCache();
                
                if (data.tournament_started) {
                    this.showFeedback(this.t('tournamentStarted') || '报名人数已满，锦标赛即将开始', '#4CAF50');
                }
                
                await this.loadTournamentLobby(true);
            } else {
                this.showFeedback(data?.message || this.t('joinFailed') || '报名失败', '#ff4444');
            }
        } catch (error) {
            console.error('报名失败:', error);
            this.showFeedback(this.getFriendlyErrorMessage(error), '#ff4444');
        } finally {
            if (joinBtn) {
                joinBtn.disabled = false;
                joinBtn.textContent = this.t('join') || '报名参赛';
            }
        }
    }

    // ==================== 赛程管理 ====================

    /**
     * 查看锦标赛
     */
    async viewTournament(tournamentId) {
        this.currentTournament = { id: tournamentId };
        this.switchTournamentTab('bracket');
        await this.loadTournamentBracket(tournamentId);
    }

    /**
     * 加载赛程表
     */
    async loadTournamentBracket(tournamentId) {
        try {
            if (!this.game.state.supabaseReady || !this.game.state.supabase) {
                this.showEmptyList('bracket-container', this.t('supabaseNotConnected') || 'Supabase未连接');
                return;
            }

            if (!this.isNetworkAvailable()) {
                this.showEmptyList('bracket-container', this.t('networkOffline') || '网络不可用，请检查连接');
                return;
            }

            this.showLoading('bracket-container', this.t('loadingBracket') || '加载赛程表...');

            const { data: matches, error } = await this.fetchWithRetry(
                () => this.game.state.supabase
                    .from('candy_math_tournament_matches')
                    .select('*')
                    .eq('tournament_id', tournamentId)
                    .order('round')
                    .order('match_order')
            );

            if (error) throw error;

            this.hideLoading('bracket-container');

            if (!matches || matches.length === 0) {
                this.showEmptyList('bracket-container', this.t('noBracketData') || '暂无赛程数据');
                return;
            }

            this.renderBracket(matches);
        } catch (error) {
            console.error('加载赛程表失败:', error);
            this.hideLoading('bracket-container');
            this.showEmptyList('bracket-container', this.getFriendlyErrorMessage(error));
            this.showFeedback(this.t('loadFailed') || '加载失败', '#ff4444');
        }
    }

    /**
     * 渲染赛程表
     */
    renderBracket(matches) {
        const container = document.getElementById('bracket-container');
        if (!container) return;

        const rounds = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);
        
        let html = '<div class="bracket-wrapper" style="overflow-x: auto; white-space: nowrap; padding: 20px 0;">';
        
        rounds.forEach(round => {
            const roundMatches = matches.filter(m => m.round === round);
            html += `<div class="bracket-round" style="display: inline-block; vertical-align: top; margin-right: 40px; min-width: 250px;">`;
            html += `<div class="round-title" style="text-align: center; font-size: 1.2rem; margin-bottom: 20px;">${this.t('round') || '第'}${round}${this.t('roundSuffix') || '轮'}</div>`;

            roundMatches.forEach(match => {
                const isFinished = match.status === 'finished';
                const isBye = match.is_bye_match;
                const winner = match.winner_id;
                
                const player1Name = match.player1_name || this.t('pending') || '待定';
                const player2Name = match.player2_name || this.t('pending') || '待定';
                
                if (isBye && isFinished) {
                    html += `
                        <div class="bracket-match bye-match" 
                             style="background: #e8f5e8; border: 2px solid #4CAF50; border-radius: 20px; padding: 15px; margin-bottom: 15px;">
                            <div class="match-players" style="text-align: center;">
                                <span class="match-player winner">🏆 ${this.escapeHtml(player1Name)}</span>
                                <span class="bye-label" style="margin-left: 10px; color: #4CAF50;">(${this.t('byeAdvance') || '轮空晋级'})</span>
                            </div>
                        </div>
                    `;
                } else {
                    const player1Class = winner === match.player1_id ? 'winner' : '';
                    const player2Class = winner === match.player2_id ? 'winner' : '';
                    
                    html += `
                        <div class="bracket-match ${isFinished ? 'finished' : ''}" 
                             style="background: #fff0f5; border: 2px solid #f1c40f; border-radius: 20px; padding: 15px; margin-bottom: 15px;">
                            <div class="match-players" style="display: flex; justify-content: space-between; align-items: center;">
                                <span class="match-player ${player1Class}" style="flex: 1; text-align: center;">${this.escapeHtml(player1Name)}</span>
                                <span class="match-vs" style="margin: 0 10px; font-weight: bold;">VS</span>
                                <span class="match-player ${player2Class}" style="flex: 1; text-align: center;">${this.escapeHtml(player2Name)}</span>
                            </div>
                            ${isFinished ? `
                                <div class="match-score" style="text-align: center; margin-top: 10px; font-size: 1.2rem;">
                                    ${match.player1_score || 0} : ${match.player2_score || 0}
                                </div>
                            ` : ''}
                            ${match.status === 'scheduled' ? `
                                <div class="match-status" style="text-align: center; margin-top: 10px; color: #f39c12;">⏳ ${this.t('inProgress') || '进行中'}</div>
                            ` : ''}
                        </div>
                    `;
                }
            });

            html += `</div>`;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    // ==================== 比赛结果处理 ====================

    /**
     * 完成比赛（使用RPC）
     */
    async finishMatch(matchId, winnerId, player1Score, player2Score) {
        // 检查用户登录状态
        const user = this.getCurrentUser();
        if (!user || !user.id) {
            this.showFeedback(this.t('loginRequired') || '请先登录', '#ff4444');
            return;
        }

        // 检查网络连接
        if (!this.isNetworkAvailable()) {
            this.showFeedback(this.t('networkOffline') || '网络不可用，请检查连接', '#ff4444');
            return;
        }

        if (!this.game.state.supabaseReady || !this.game.state.supabase) return;

        const finishBtn = document.getElementById(`finish-match-${matchId}`);

        try {
            if (finishBtn) {
                finishBtn.disabled = true;
                finishBtn.textContent = this.t('submitting') || '提交中...';
            }

            const userId = String(user.id);
            const winnerIdStr = String(winnerId);

            const { data, error } = await this.fetchWithRetry(
                () => this.game.state.supabase.rpc('finish_match', {
                    p_match_id: matchId,
                    p_winner_id: winnerIdStr,
                    p_player1_score: player1Score,
                    p_player2_score: player2Score,
                    p_user_id: userId
                })
            );

            if (error) throw error;

            if (data?.success) {
                this.showFeedback(this.t('resultUpdated') || '比赛结果已更新', '#4CAF50');
                
                if (this.currentTournament) {
                    await this.loadTournamentBracket(this.currentTournament.id);
                }
            } else {
                this.showFeedback(data?.message || this.t('updateFailed') || '更新失败', '#ff4444');
            }
        } catch (error) {
            console.error('完成比赛失败:', error);
            this.showFeedback(this.getFriendlyErrorMessage(error), '#ff4444');
        } finally {
            if (finishBtn) {
                finishBtn.disabled = false;
                finishBtn.textContent = this.t('submitResult') || '提交结果';
            }
        }
    }

    // ==================== 排名系统 ====================

    /**
     * 加载锦标赛排名
     */
    async loadTournamentRanking(forceRefresh = false) {
        try {
            if (!this.game.state.supabaseReady || !this.game.state.supabase) {
                this.showEmptyList('tournament-ranking', this.t('supabaseNotConnected') || 'Supabase未连接');
                return;
            }

            if (!this.isNetworkAvailable()) {
                this.showEmptyList('tournament-ranking', this.t('networkOffline') || '网络不可用，请检查连接');
                return;
            }

            if (!forceRefresh && this.isCacheValid('rankings')) {
                this.renderRankingList(this.cache.rankings);
                return;
            }

            this.showLoading('tournament-ranking', this.t('loadingRanking') || '加载排名...');

            const { data: rankings, error } = await this.fetchWithRetry(
                () => this.game.state.supabase
                    .from('player_elo')
                    .select('*')
                    .order('elo', { ascending: false })
                    .limit(50)
            );

            if (error) throw error;

            this.updateCache('rankings', rankings);
            this.renderRankingList(rankings);
            
        } catch (error) {
            console.error('加载排名失败:', error);
            this.hideLoading('tournament-ranking');
            this.showEmptyList('tournament-ranking', this.getFriendlyErrorMessage(error));
            this.showFeedback(this.t('loadRankingFailed') || '加载排名失败', '#ff4444');
        }
    }

    /**
     * 渲染排名列表
     */
    renderRankingList(rankings) {
        const list = document.getElementById('tournament-ranking');
        if (!list) return;

        this.hideLoading('tournament-ranking');

        if (!rankings || rankings.length === 0) {
            list.innerHTML = `<div class="empty-state">${this.t('noRankingData') || '暂无排名数据'}</div>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        const tempDiv = document.createElement('div');
        
        rankings.forEach((r, index) => {
            tempDiv.innerHTML = this.renderRankingItem(r, index);
            fragment.appendChild(tempDiv.firstElementChild);
        });

        list.innerHTML = '';
        list.appendChild(fragment);
    }

    /**
     * 渲染排名项
     */
    renderRankingItem(ranking, index) {
        const rankClass = index < 3 ? ['gold', 'silver', 'bronze'][index] : '';
        const rankDisplay = index + 1;
        const medalEmoji = index === 0 ? '🥇' : (index === 1 ? '🥈' : (index === 2 ? '🥉' : ''));
        
        const displayName = ranking.user_name || 
                           (ranking.user_id ? `${this.t('player') || '玩家'}${String(ranking.user_id).slice(0, 4)}` : this.t('unknownPlayer') || '未知玩家');

        return `
            <div class="ranking-item" style="display: flex; align-items: center; padding: 15px; border-bottom: 1px solid #f1c40f;">
                <div class="ranking-rank ${rankClass}" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: bold; ${index < 3 ? 'background: ' + (index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : '#cd7f32') + '; border-radius: 50%;' : ''}">
                    ${medalEmoji || rankDisplay}
                </div>
                <div class="ranking-info" style="flex: 1; margin-left: 15px;">
                    <div class="ranking-name" style="font-weight: bold;">${this.escapeHtml(displayName)}</div>
                    <div class="ranking-stats" style="font-size: 0.9rem; color: #666;">
                        ${this.t('winRate') || '胜率'}: ${(ranking.win_rate || 0).toFixed(1)}% · 
                        ${this.t('battles') || '对战'}: ${ranking.battles || 0} · 
                        ${this.t('tournamentWins') || '夺冠'}: ${ranking.tournament_wins || 0} · 
                        ${this.t('points') || '积分'}: ${ranking.points || 0}
                    </div>
                </div>
                <div class="ranking-points" style="font-size: 1.3rem; font-weight: bold; color: #f39c12;">${ranking.elo || 1200}</div>
            </div>
        `;
    }

    /**
     * 加载历史锦标赛
     */
    async loadTournamentHistory(forceRefresh = false) {
        try {
            if (!this.game.state.supabaseReady || !this.game.state.supabase) {
                this.showEmptyList('tournament-history', this.t('supabaseNotConnected') || 'Supabase未连接');
                return;
            }

            if (!this.isNetworkAvailable()) {
                this.showEmptyList('tournament-history', this.t('networkOffline') || '网络不可用，请检查连接');
                return;
            }

            if (!forceRefresh && this.isCacheValid('history')) {
                this.renderHistoryList(this.cache.history);
                return;
            }

            this.showLoading('tournament-history', this.t('loadingHistory') || '加载历史记录...');

            const { data: tournaments, error } = await this.fetchWithRetry(
                () => this.game.state.supabase
                    .from('candy_math_tournaments')
                    .select('*')
                    .eq('status', 'finished')
                    .order('finished_at', { ascending: false })
                    .limit(20)
            );

            if (error) throw error;

            this.updateCache('history', tournaments);
            this.renderHistoryList(tournaments);
            
        } catch (error) {
            console.error('加载历史记录失败:', error);
            this.hideLoading('tournament-history');
            this.showEmptyList('tournament-history', this.getFriendlyErrorMessage(error));
            this.showFeedback(this.t('loadHistoryFailed') || '加载历史记录失败', '#ff4444');
        }
    }

    /**
     * 渲染历史列表
     */
    renderHistoryList(tournaments) {
        const list = document.getElementById('tournament-history');
        if (!list) return;

        this.hideLoading('tournament-history');

        if (!tournaments || tournaments.length === 0) {
            list.innerHTML = `<div class="empty-state">${this.t('noHistory') || '暂无历史记录'}</div>`;
            return;
        }

        const fragment = document.createDocumentFragment();
        const tempDiv = document.createElement('div');
        
        tournaments.forEach(t => {
            tempDiv.innerHTML = this.renderHistoryItem(t);
            fragment.appendChild(tempDiv.firstElementChild);
        });

        list.innerHTML = '';
        list.appendChild(fragment);
    }

    /**
     * 渲染历史记录项
     */
    renderHistoryItem(tournament) {
        const date = new Date(tournament.finished_at || tournament.created_at);
        const dateStr = this.formatDate(date, 'YYYY-MM-DD HH:mm');
        
        const prizePool = tournament.prize_pool || { first: 0, second: 0 };
        
        return `
            <div class="history-item" style="padding: 15px; border-bottom: 1px solid #f1c40f;">
                <div class="history-header" style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span class="history-name" style="font-weight: bold;">${this.escapeHtml(tournament.name)}</span>
                    <span class="history-date" style="color: #666;">${dateStr}</span>
                </div>
                <div class="history-details" style="display: flex; gap: 20px; font-size: 0.9rem;">
                    <span>👥 ${tournament.size || tournament.max_players}${this.t('players') || '人'}</span>
                    <span>🏆 ${this.t('champion') || '冠军'}: ${prizePool.first || 0}</span>
                    <span>🥈 ${this.t('runnerUp') || '亚军'}: ${prizePool.second || 0}</span>
                </div>
            </div>
        `;
    }

    /**
     * 格式化日期
     */
    formatDate(date, format) {
        const d = new Date(date);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        
        return format
            .replace('YYYY', year)
            .replace('MM', month)
            .replace('DD', day)
            .replace('HH', hours)
            .replace('mm', minutes);
    }

    // ==================== 退赛功能 ====================

    /**
     * 退出锦标赛
     */
    async leaveTournament(tournamentId) {
        // 检查用户登录状态
        const user = this.getCurrentUser();
        if (!user || !user.id) {
            this.showFeedback(this.t('loginRequired') || '请先登录', '#ff4444');
            return;
        }

        if (!confirm(this.t('leaveConfirm') || '确定要退出锦标赛吗？报名费将不予退还。')) return;

        try {
            const { data: tournament, error: fetchError } = await this.game.state.supabase
                .from('candy_math_tournaments')
                .select('status, entry_fee')
                .eq('id', tournamentId)
                .single();

            if (fetchError) throw fetchError;

            if (tournament.status !== 'registering' && tournament.status !== 'waiting') {
                this.showFeedback(this.t('cannotLeave') || '比赛已开始，无法退出', '#ff4444');
                return;
            }

            const { error } = await this.game.state.supabase
                .from('candy_math_tournament_players')
                .delete()
                .eq('tournament_id', tournamentId)
                .eq('user_id', user.id);

            if (error) throw error;

            this.clearCache();
            await this.loadTournamentLobby(true);
            
            this.showFeedback(this.t('leaveSuccess') || '已退出锦标赛', '#4CAF50');
            
        } catch (error) {
            console.error('退出锦标赛失败:', error);
            this.showFeedback(this.getFriendlyErrorMessage(error), '#ff4444');
        }
    }

    // ==================== 工具函数 ====================

    /**
     * 带重试的请求
     */
    async fetchWithRetry(fn, maxRetries = 3) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('请求超时')), 10000);
                });
                
                return await Promise.race([fn(), timeoutPromise]);
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
            }
        }
    }

    /**
     * 获取友好的错误消息
     */
    getFriendlyErrorMessage(error) {
        if (!error) return this.t('operationFailed') || '操作失败';
        
        if (!navigator.onLine) return this.t('networkOffline') || '网络已断开，请检查连接';
        
        if (error.message === '请求超时') return this.t('requestTimeout') || '网络超时，请重试';
        
        if (error.message && typeof error.message === 'string') {
            try {
                if (error.message.includes('{') && error.message.includes('}')) {
                    const parsed = JSON.parse(error.message);
                    if (parsed.message) return parsed.message;
                }
            } catch (e) {}
            
            if (error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
                return this.t('alreadyJoined') || '您已报名该锦标赛';
            }
            if (error.message.includes('foreign key')) {
                return this.t('tournamentNotFound') || '锦标赛不存在';
            }
            if (error.message.includes('check constraint')) {
                return this.t('tournamentFull') || '报名人数已满';
            }
            if (error.message.includes('insufficient points') || error.message.includes('积分不足')) {
                return this.t('insufficientPoints') || '积分不足';
            }
            
            return error.message;
        }
        
        const errorMap = {
            '23505': this.t('dataExists') || '数据已存在',
            '23503': this.t('dataNotFound') || '关联数据不存在',
            '23514': this.t('validationFailed') || '数据验证失败',
            '40P01': this.t('concurrencyError') || '并发冲突，请重试',
            '42703': this.t('columnNotFound') || '字段不存在',
            '42P01': this.t('tableNotFound') || '表不存在'
        };
        
        return errorMap[error.code] || error.message || this.t('operationFailed') || '操作失败，请稍后重试';
    }

    /**
     * 打乱数组
     */
    shuffleArray(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    /**
     * 转义HTML特殊字符
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==================== 清理 ====================

    /**
     * 清理事件监听器
     */
    destroy() {
        this.tabClickHandlers.forEach((handler, tabId) => {
            const btn = document.querySelector(`.tournament-tabs .tab-btn[data-tab="${tabId}"]`);
            if (btn) {
                btn.removeEventListener('click', handler);
            }
        });
        this.tabClickHandlers.clear();

        const tournamentBtn = document.getElementById('tournament-btn');
        if (tournamentBtn && this.tournamentBtnHandler) {
            tournamentBtn.removeEventListener('click', this.tournamentBtnHandler);
        }

        const createBtn = document.getElementById('create-tournament-btn');
        if (createBtn && this.createBtnHandler) {
            createBtn.removeEventListener('click', this.createBtnHandler);
        }

        const confirmCreate = document.getElementById('confirm-create-tournament');
        if (confirmCreate && this.confirmCreateHandler) {
            confirmCreate.removeEventListener('click', this.confirmCreateHandler);
        }

        const cancelCreate = document.getElementById('cancel-create-tournament');
        if (cancelCreate && this.cancelCreateHandler) {
            cancelCreate.removeEventListener('click', this.cancelCreateHandler);
        }

        const sizeInput = document.getElementById('tournament-size-input');
        if (sizeInput && this.sizeInputHandler) {
            sizeInput.removeEventListener('input', this.sizeInputHandler);
        }

        const feeInput = document.getElementById('tournament-entry-fee');
        if (feeInput && this.feeInputHandler) {
            feeInput.removeEventListener('input', this.feeInputHandler);
        }

        this.initialized = false;
        console.log('TournamentMode 已销毁');
    }
}

// 导出到全局
window.TournamentMode = TournamentMode;
