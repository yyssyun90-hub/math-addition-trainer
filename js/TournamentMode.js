/**
 * ==================== 糖果数学消消乐 - 锦标赛模式 ====================
 * 包含：创建锦标赛、报名参赛、赛程管理、排名系统、比赛结果处理、奖金发放
 * 依赖：utils.js (需要 I18n, SoundManager, Formatters, GAME_CONSTANTS)
 * 
 * 特别说明：锦标赛创建权限已限制，仅允许指定邮箱的用户创建
 * 授权邮箱：yyssyun90@gmail.com
 * ==============================================================
 */

class TournamentMode {
    constructor(game) {
        this.game = game;
        this.currentTournament = null;
        this.bracket = null;
        this.activeTab = 'lobby';
        this.initialized = false;
        
        // 授权创建锦标赛的邮箱列表
        this.authorizedCreators = ['yyssyun90@gmail.com'];
        
        // 事件处理器
        this.tabClickHandlers = new Map();
        this.createBtnHandler = null;
        this.confirmCreateHandler = null;
        this.cancelCreateHandler = null;
        this.tournamentBtnHandler = null;
        
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
            
            // 移除旧的监听器
            if (this.tabClickHandlers.has(tabId)) {
                btn.removeEventListener('click', this.tabClickHandlers.get(tabId));
            }
            
            const handler = (e) => this.switchTournamentTab(tabId);
            btn.addEventListener('click', handler);
            this.tabClickHandlers.set(tabId, handler);
        });

        // 窗口关闭时清理
        window.addEventListener('beforeunload', () => this.destroy());
    }

    // ==================== 权限检查 ====================

    /**
     * 检查当前用户是否有权创建锦标赛
     */
    canCreateTournament() {
        if (!this.game.auth || !this.game.auth.isLoggedIn()) {
            return false;
        }
        
        const userEmail = this.game.state.currentUser?.email;
        return this.authorizedCreators.includes(userEmail);
    }

    /**
     * 检查创建权限并提示
     */
    checkCreatePermission() {
        if (!this.game.auth || !this.game.auth.isLoggedIn()) {
            if (this.game.ui) {
                this.game.ui.showFeedback('请先登录', '#ff4444');
            }
            if (this.game.auth) {
                this.game.auth.showAuthModal('login');
            }
            return false;
        }

        if (!this.canCreateTournament()) {
            if (this.game.ui) {
                this.game.ui.showFeedback('您没有权限创建锦标赛', '#ff4444');
            }
            return false;
        }

        return true;
    }

    // ==================== 缓存管理 ====================

    /**
     * 检查缓存是否有效
     */
    isCacheValid(key) {
        if (!this.cache[key]) return false;
        return Date.now() - this.cache.lastFetch < this.cache.cacheTTL;
    }

    /**
     * 更新缓存
     */
    updateCache(key, data) {
        this.cache[key] = data;
        this.cache.lastFetch = Date.now();
    }

    /**
     * 清除缓存
     */
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
            if (this.game.ui) {
                this.game.ui.showFeedback('请先登录', '#ff4444');
            }
            if (this.game.auth) {
                this.game.auth.showAuthModal('login');
            }
            return;
        }

        if (this.game.ui) {
            this.game.ui.openModal('tournament-modal');
        }
        
        // 重置到大厅标签
        this.switchTournamentTab('lobby');
        await this.loadTournamentLobby();
        
        // 根据权限显示/隐藏创建按钮
        this.updateCreateButtonVisibility();
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
        // 验证标签页是否有效
        if (!['lobby', 'bracket', 'history', 'ranking'].includes(tabId)) {
            console.warn('无效的标签页:', tabId);
            return;
        }

        // 更新标签按钮状态
        document.querySelectorAll('.tournament-tabs .tab-btn').forEach(btn => {
            if (btn.dataset.tab === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // 更新标签内容显示
        document.querySelectorAll('.tab-content').forEach(content => {
            content.style.display = 'none';
        });
        
        const tabContent = document.getElementById(`${tabId}-tab`);
        if (tabContent) {
            tabContent.style.display = 'block';
        }

        this.activeTab = tabId;

        // 根据标签加载数据
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
     * 加载锦标赛大厅列表
     */
    async loadTournamentLobby(forceRefresh = false) {
        if (!this.game.state.supabaseReady) {
            this.showEmptyList('tournament-list', 'Supabase未连接');
            return;
        }

        // 使用缓存
        if (!forceRefresh && this.isCacheValid('tournaments')) {
            this.renderTournamentList(this.cache.tournaments);
            return;
        }

        this.showLoading('tournament-list', '加载锦标赛列表...');

        try {
            const { data: tournaments, error } = await this.fetchWithRetry(
                () => this.game.state.supabase
                    .from('candy_math_tournaments')
                    .select('*')
                    .in('status', ['registering', 'active'])
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
            if (this.game.ui) {
                this.game.ui.showFeedback('加载失败', '#ff4444');
            }
        }
    }

    /**
     * 渲染锦标赛列表
     */
    renderTournamentList(tournaments) {
        const list = document.getElementById('tournament-list');
        if (!list) return;

        this.hideLoading('tournament-list');

        if (!tournaments || tournaments.length === 0) {
            list.innerHTML = '<div class="empty-state">暂无进行中的锦标赛</div>';
            return;
        }

        // 使用文档片段优化性能
        const fragment = document.createDocumentFragment();
        const tempDiv = document.createElement('div');
        
        tournaments.forEach(t => {
            tempDiv.innerHTML = this.renderTournamentItem(t);
            const item = tempDiv.firstElementChild;
            
            // 绑定事件
            const joinBtn = item.querySelector(`#join-tournament-${t.id}`);
            if (joinBtn) {
                joinBtn.addEventListener('click', () => this.joinTournament(t.id));
            }
            
            const viewBtn = item.querySelector(`#view-tournament-${t.id}`);
            if (viewBtn) {
                viewBtn.addEventListener('click', () => this.viewTournament(t.id));
            }
            
            fragment.appendChild(item);
        });

        list.innerHTML = '';
        list.appendChild(fragment);
    }

    /**
     * 渲染锦标赛列表项
     */
    renderTournamentItem(tournament) {
        const statusText = {
            'registering': '报名中',
            'active': '进行中',
            'finished': '已结束'
        }[tournament.status] || tournament.status;

        const statusClass = {
            'registering': 'status-registering',
            'active': 'status-active',
            'finished': 'status-finished'
        }[tournament.status] || '';

        const modeText = tournament.mode === 'challenge' ? '⚡挑战' : '📚标准';
        const difficultyText = {
            'easy': '🍬简单',
            'medium': '🍭中等',
            'hard': '🍫困难'
        }[tournament.difficulty] || tournament.difficulty;

        // 添加倒计时
        const timeLeft = this.getRegistrationTimeLeft(tournament.created_at, tournament.status);
        const timeDisplay = timeLeft ? `<span class="time-left">⏰ ${timeLeft}</span>` : '';

        const buttonHtml = tournament.status === 'registering' 
            ? `<button class="join-tournament-btn" id="join-tournament-${tournament.id}">报名参赛</button>`
            : `<button class="join-tournament-btn" id="view-tournament-${tournament.id}">查看赛程</button>`;

        return `
            <div class="tournament-item">
                <div class="tournament-item-header">
                    <div class="tournament-icon">🏆</div>
                    <div class="tournament-item-info">
                        <h4>${this.escapeHtml(tournament.name)}</h4>
                        <div class="tournament-item-meta">
                            <span>👥 ${tournament.size}人</span>
                            <span>${modeText}</span>
                            <span>${difficultyText}</span>
                            <span>💰 报名费: ${tournament.entry_fee || 0}</span>
                            ${timeDisplay}
                        </div>
                    </div>
                </div>
                <div>
                    <span class="tournament-status ${statusClass}">${statusText}</span>
                    ${buttonHtml}
                </div>
            </div>
        `;
    }

    /**
     * 获取报名剩余时间
     */
    getRegistrationTimeLeft(createdAt, status) {
        if (status !== 'registering') return '';
        
        const created = new Date(createdAt).getTime();
        const now = Date.now();
        const timeLeft = 24 * 60 * 60 * 1000 - (now - created); // 报名期24小时
        
        if (timeLeft <= 0) return '报名已结束';
        
        const hours = Math.floor(timeLeft / (60 * 60 * 1000));
        const minutes = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
        
        if (hours > 0) {
            return `剩余 ${hours}小时${minutes}分钟`;
        } else {
            return `剩余 ${minutes}分钟`;
        }
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

        // 重置表单
        const nameInput = document.getElementById('tournament-name-input');
        const sizeSelect = document.getElementById('tournament-size');
        const modeSelect = document.getElementById('tournament-mode');
        const difficultySelect = document.getElementById('tournament-difficulty');
        const feeInput = document.getElementById('tournament-entry-fee');

        if (nameInput) nameInput.value = '';
        if (sizeSelect) sizeSelect.value = '16';
        if (modeSelect) modeSelect.value = 'challenge';
        if (difficultySelect) difficultySelect.value = 'medium';
        if (feeInput) feeInput.value = '0';

        if (this.game.ui) {
            this.game.ui.openModal('create-tournament-modal');
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
     * 创建锦标赛
     */
    async createTournament() {
        if (!this.checkCreatePermission()) return;

        // 获取表单数据
        const name = document.getElementById('tournament-name-input')?.value;
        const size = parseInt(document.getElementById('tournament-size')?.value);
        const mode = document.getElementById('tournament-mode')?.value;
        const difficulty = document.getElementById('tournament-difficulty')?.value;
        const entryFee = parseInt(document.getElementById('tournament-entry-fee')?.value) || 0;

        // 验证
        if (!name || name.trim().length < 2 || name.trim().length > 50) {
            if (this.game.ui) {
                this.game.ui.showFeedback('锦标赛名称长度必须在2-50字符之间', '#ff4444');
            }
            return;
        }

        if (![4, 8, 16, 32].includes(size)) {
            if (this.game.ui) {
                this.game.ui.showFeedback('请选择有效的参赛人数', '#ff4444');
            }
            return;
        }

        // 检查size是否是2的幂
        if (size & (size - 1) !== 0) {
            if (this.game.ui) {
                this.game.ui.showFeedback('参赛人数必须是2的幂', '#ff4444');
            }
            return;
        }

        if (!mode || !difficulty) {
            if (this.game.ui) {
                this.game.ui.showFeedback('请选择比赛模式和难度', '#ff4444');
            }
            return;
        }

        if (entryFee < 0 || entryFee > 10000) {
            if (this.game.ui) {
                this.game.ui.showFeedback('报名费必须在0-10000之间', '#ff4444');
            }
            return;
        }

        // 二次确认
        if (entryFee > 0) {
            const confirmMsg = `创建锦标赛将扣除 ${entryFee} 积分作为报名费，确定继续吗？`;
            if (!confirm(confirmMsg)) return;
        }

        // 检查用户积分是否足够支付报名费
        if (entryFee > 0) {
            const userPoints = await this.getUserPoints(this.game.state.currentUser.id);
            if (userPoints < entryFee) {
                if (this.game.ui) {
                    this.game.ui.showFeedback('积分不足，无法创建付费锦标赛', '#ff4444');
                }
                return;
            }
        }

        if (!this.game.state.supabaseReady) {
            if (this.game.ui) {
                this.game.ui.showFeedback('Supabase未连接', '#ff4444');
            }
            return;
        }

        try {
            // 计算奖金池
            const prizePool = this.calculatePrizePool(entryFee, size);

            // 扣除创建者的报名费（作为第一笔报名）
            if (entryFee > 0) {
                const deducted = await this.deductPoints(
                    this.game.state.currentUser.id,
                    entryFee,
                    null,
                    'tournament_create'
                );
                if (!deducted) {
                    throw new Error('积分扣除失败');
                }
            }

            const { data: tournament, error } = await this.game.state.supabase
                .from('candy_math_tournaments')
                .insert([{
                    name: name.trim(),
                    size: size,
                    mode: mode,
                    difficulty: difficulty,
                    entry_fee: entryFee,
                    prize_pool: prizePool,
                    status: 'registering',
                    created_by: this.game.state.currentUser.id,
                    created_at: new Date().toISOString(),
                    version: 1
                }])
                .select()
                .single();

            if (error) throw error;

            // 创建者自动报名
            await this.game.state.supabase
                .from('candy_math_tournament_players')
                .insert([{
                    tournament_id: tournament.id,
                    user_id: this.game.state.currentUser.id,
                    user_name: this.game.state.currentUser.name,
                    joined_at: new Date().toISOString()
                }]);

            // 创建赛程表
            await this.createBracket(tournament.id, size);

            this.closeCreateModal();
            this.clearCache(); // 清除缓存
            await this.loadTournamentLobby(true); // 强制刷新
            
            if (this.game.ui) {
                this.game.ui.showFeedback('锦标赛创建成功', '#4CAF50');
            }

            // 自动切换到大厅标签
            this.switchTournamentTab('lobby');
        } catch (error) {
            console.error('创建锦标赛失败:', error);
            
            // 如果失败，退还扣除的积分
            if (entryFee > 0) {
                await this.refundPoints(
                    this.game.state.currentUser.id,
                    entryFee,
                    'tournament_create_failed'
                );
            }
            
            if (this.game.ui) {
                this.game.ui.showFeedback(this.getFriendlyErrorMessage(error), '#ff4444');
            }
        }
    }

    /**
     * 获取用户积分
     */
    async getUserPoints(userId) {
        if (!this.game.state.supabaseReady) return 0;
        try {
            const { data } = await this.game.state.supabase
                .from('player_elo')
                .select('points')
                .eq('user_id', userId)
                .single();
            return data?.points || 0;
        } catch (error) {
            console.error('获取用户积分失败:', error);
            return 0;
        }
    }

    /**
     * 扣除积分
     */
    async deductPoints(userId, amount, tournamentId, type) {
        if (!this.game.state.supabaseReady) return false;
        
        try {
            const { data, error } = await this.game.state.supabase.rpc('deduct_points', {
                p_user_id: userId,
                p_amount: amount,
                p_tournament_id: tournamentId,
                p_type: type
            });
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('扣除积分失败:', error);
            return false;
        }
    }

    /**
     * 退还积分
     */
    async refundPoints(userId, amount, reason) {
        if (!this.game.state.supabaseReady) return false;
        
        try {
            const { data, error } = await this.game.state.supabase.rpc('refund_points', {
                p_user_id: userId,
                p_amount: amount,
                p_reason: reason
            });
            
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('退款失败:', error);
            return false;
        }
    }

    /**
     * 计算奖金池
     */
    calculatePrizePool(entryFee, size) {
        const total = entryFee * size;
        return {
            first: Math.floor(total * 0.7),
            second: Math.floor(total * 0.2),
            third_fourth: Math.floor(total * 0.1 / 2),
            total: total
        };
    }

    /**
     * 创建赛程表
     */
    async createBracket(tournamentId, size) {
        const rounds = Math.log2(size);
        const matches = [];

        // 创建第一轮比赛
        for (let i = 0; i < size / 2; i++) {
            matches.push({
                tournament_id: tournamentId,
                round: 1,
                match_order: i + 1,
                player1_id: null,
                player2_id: null,
                player1_name: null,
                player2_name: null,
                status: 'pending'
            });
        }

        // 创建后续轮次
        for (let round = 2; round <= rounds; round++) {
            const matchesInRound = size / Math.pow(2, round);
            for (let i = 0; i < matchesInRound; i++) {
                matches.push({
                    tournament_id: tournamentId,
                    round: round,
                    match_order: i + 1,
                    player1_id: null,
                    player2_id: null,
                    player1_name: null,
                    player2_name: null,
                    status: 'pending'
                });
            }
        }

        const { error } = await this.game.state.supabase
            .from('candy_math_tournament_matches')
            .insert(matches);

        if (error) throw error;
    }

    // ==================== 报名参赛 ====================

    /**
     * 报名锦标赛（带并发控制）
     */
    async joinTournament(tournamentId) {
        if (!this.game.auth || !this.game.auth.isLoggedIn()) {
            if (this.game.ui) {
                this.game.ui.showFeedback('请先登录', '#ff4444');
            }
            if (this.game.auth) {
                this.game.auth.showAuthModal('login');
            }
            return;
        }

        // 禁用按钮防止重复点击
        const joinBtn = document.getElementById(`join-tournament-${tournamentId}`);
        if (joinBtn) {
            joinBtn.disabled = true;
            joinBtn.textContent = '报名中...';
        }

        if (!this.game.state.supabaseReady) {
            if (this.game.ui) {
                this.game.ui.showFeedback('Supabase未连接', '#ff4444');
            }
            if (joinBtn) {
                joinBtn.disabled = false;
                joinBtn.textContent = '报名参赛';
            }
            return;
        }

        try {
            // 使用存储过程处理报名（包含并发控制）
            const { data, error } = await this.game.state.supabase.rpc('join_tournament', {
                p_tournament_id: tournamentId,
                p_user_id: this.game.state.currentUser.id,
                p_user_name: this.game.state.currentUser.name
            });

            if (error) throw error;

            if (data.success) {
                if (this.game.ui) {
                    this.game.ui.showFeedback('报名成功', '#4CAF50');
                }
                
                // 清除缓存
                this.clearCache();
                
                // 如果报名后人数已满，开始锦标赛
                if (data.tournament_started) {
                    await this.startTournamentWithLock(tournamentId);
                    if (this.game.ui) {
                        this.game.ui.showFeedback('报名人数已满，锦标赛即将开始', '#4CAF50');
                    }
                }
                
                // 刷新列表
                await this.loadTournamentLobby(true);
            } else {
                if (this.game.ui) {
                    this.game.ui.showFeedback(data.message || '报名失败', '#ff4444');
                }
            }
        } catch (error) {
            console.error('报名失败:', error);
            if (this.game.ui) {
                this.game.ui.showFeedback(this.getFriendlyErrorMessage(error), '#ff4444');
            }
        } finally {
            // 恢复按钮状态
            if (joinBtn) {
                joinBtn.disabled = false;
                joinBtn.textContent = '报名参赛';
            }
        }
    }

    /**
     * 带锁的锦标赛开始（防止并发）
     */
    async startTournamentWithLock(tournamentId) {
        if (!this.game.state.supabaseReady) return;

        try {
            // 获取当前锦标赛信息（带版本号）
            const { data: tournament, error: fetchError } = await this.game.state.supabase
                .from('candy_math_tournaments')
                .select('status, version')
                .eq('id', tournamentId)
                .single();

            if (fetchError || !tournament) throw fetchError || new Error('锦标赛不存在');

            // 如果已经开始，直接返回
            if (tournament.status !== 'registering') return;

            // 使用乐观锁更新状态
            const { error: updateError } = await this.game.state.supabase
                .from('candy_math_tournaments')
                .update({ 
                    status: 'active', 
                    version: tournament.version + 1,
                    started_at: new Date().toISOString()
                })
                .eq('id', tournamentId)
                .eq('version', tournament.version);

            if (updateError) {
                // 版本不匹配，说明有其他请求已经开始
                console.log('锦标赛已被其他请求开始');
                return;
            }

            // 开始锦标赛
            await this.startTournament(tournamentId);
        } catch (error) {
            console.error('开始锦标赛失败:', error);
        }
    }

    /**
     * 开始锦标赛
     */
    async startTournament(tournamentId) {
        if (!this.game.state.supabaseReady) return;

        try {
            // 获取所有报名玩家
            const { data: players, error: playersError } = await this.game.state.supabase
                .from('candy_math_tournament_players')
                .select('*')
                .eq('tournament_id', tournamentId);

            if (playersError) throw playersError;

            // 获取锦标赛信息
            const { data: tournament } = await this.game.state.supabase
                .from('candy_math_tournaments')
                .select('size')
                .eq('id', tournamentId)
                .single();

            // 检查人数是否足够
            if (players.length !== tournament.size) {
                console.error('报名人数不足');
                return;
            }

            // 随机打乱玩家顺序
            const shuffled = this.shuffleArray(players);

            // 获取第一轮比赛
            const { data: matches, error: matchesError } = await this.game.state.supabase
                .from('candy_math_tournament_matches')
                .select('*')
                .eq('tournament_id', tournamentId)
                .eq('round', 1)
                .order('match_order');

            if (matchesError) throw matchesError;

            // 分配玩家到比赛
            for (let i = 0; i < matches.length; i++) {
                const player1 = shuffled[i * 2];
                const player2 = shuffled[i * 2 + 1];

                await this.game.state.supabase
                    .from('candy_math_tournament_matches')
                    .update({
                        player1_id: player1?.user_id || null,
                        player1_name: player1?.user_name || '轮空',
                        player2_id: player2?.user_id || null,
                        player2_name: player2?.user_name || '轮空',
                        status: 'scheduled'
                    })
                    .eq('id', matches[i].id);
            }

            // 发送通知
            this.sendTournamentNotification(tournamentId, '锦标赛已开始');
            
            // 清除缓存
            this.clearCache();
            
        } catch (error) {
            console.error('开始锦标赛失败:', error);
        }
    }

    /**
     * 发送锦标赛通知
     */
    async sendTournamentNotification(tournamentId, message) {
        if (!this.game.state.supabaseReady) return;

        try {
            await this.game.state.supabase
                .from('candy_math_battle_messages')
                .insert([{
                    battle_id: null,
                    tournament_id: tournamentId,
                    player_id: 'system',
                    player_name: '系统',
                    message: message,
                    message_type: 'tournament'
                }]);
        } catch (error) {
            console.error('发送通知失败:', error);
        }
    }

    // ==================== 赛程管理 ====================

    /**
     * 查看锦标赛
     */
    async viewTournament(tournamentId) {
        // 切换到赛程表标签
        this.switchTournamentTab('bracket');
        await this.loadTournamentBracket(tournamentId);
    }

    /**
     * 加载赛程表
     */
    async loadTournamentBracket(tournamentId) {
        if (!this.game.state.supabaseReady) {
            this.showEmptyList('bracket-container', 'Supabase未连接');
            return;
        }

        this.showLoading('bracket-container', '加载赛程表...');

        try {
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
                this.showEmptyList('bracket-container', '暂无赛程数据');
                return;
            }

            this.renderBracket(matches);
        } catch (error) {
            console.error('加载赛程表失败:', error);
            this.hideLoading('bracket-container');
            this.showEmptyList('bracket-container', this.getFriendlyErrorMessage(error));
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
            html += `<div class="round-title" style="text-align: center; font-size: 1.2rem; margin-bottom: 20px;">第${round}轮</div>`;

            roundMatches.forEach(match => {
                const isFinished = match.status === 'finished';
                const winner = match.winner_id;
                
                // 处理轮空情况
                const player1Name = match.player1_name || '轮空';
                const player2Name = match.player2_name || '轮空';
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
                            <div class="match-status" style="text-align: center; margin-top: 10px; color: #f39c12;">⏳ 进行中</div>
                        ` : ''}
                    </div>
                `;
            });

            html += `</div>`;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    // ==================== 比赛结果处理 ====================

    /**
     * 完成比赛
     */
    async finishMatch(matchId, winnerId, player1Score, player2Score) {
        if (!this.game.state.supabaseReady) return;
        
        try {
            // 获取比赛信息
            const { data: match, error: matchError } = await this.game.state.supabase
                .from('candy_math_tournament_matches')
                .select('*')
                .eq('id', matchId)
                .single();
            
            if (matchError) throw matchError;
            
            // 更新比赛结果
            await this.game.state.supabase
                .from('candy_math_tournament_matches')
                .update({
                    player1_score: player1Score,
                    player2_score: player2Score,
                    winner_id: winnerId,
                    status: 'finished',
                    finished_at: new Date().toISOString()
                })
                .eq('id', matchId);
            
            // 更新胜者到下一轮
            await this.advanceWinner(match.tournament_id, match.round, match.match_order, winnerId);
            
            // 更新玩家ELO
            await this.updatePlayerELO(match, winnerId);
            
            // 检查是否所有比赛都结束了
            await this.checkTournamentCompletion(match.tournament_id);
            
        } catch (error) {
            console.error('完成比赛失败:', error);
            if (this.game.ui) {
                this.game.ui.showFeedback('更新比赛结果失败', '#ff4444');
            }
        }
    }

    /**
     * 胜者晋级下一轮
     */
    async advanceWinner(tournamentId, currentRound, matchOrder, winnerId) {
        const nextRound = currentRound + 1;
        const nextMatchOrder = Math.ceil(matchOrder / 2);
        const isFirstMatch = matchOrder % 2 === 1;
        
        // 获取下一轮比赛
        const { data: nextMatch, error: nextError } = await this.game.state.supabase
            .from('candy_math_tournament_matches')
            .select('*')
            .eq('tournament_id', tournamentId)
            .eq('round', nextRound)
            .eq('match_order', nextMatchOrder)
            .single();
        
        if (nextError || !nextMatch) return;
        
        // 获取胜者信息
        const { data: winner } = await this.game.state.supabase
            .from('candy_math_tournament_players')
            .select('user_name')
            .eq('user_id', winnerId)
            .single();
        
        // 更新下一轮比赛
        const updateField = isFirstMatch ? 'player1_id' : 'player2_id';
        const nameField = isFirstMatch ? 'player1_name' : 'player2_name';
        
        await this.game.state.supabase
            .from('candy_math_tournament_matches')
            .update({
                [updateField]: winnerId,
                [nameField]: winner?.user_name || '未知'
            })
            .eq('id', nextMatch.id);
    }

    /**
     * 获取玩家ELO
     */
    async getPlayerELO(userId) {
        if (!userId) return 1200;
        try {
            const { data } = await this.game.state.supabase
                .from('player_elo')
                .select('elo')
                .eq('user_id', userId)
                .single();
            return data?.elo || 1200;
        } catch {
            return 1200;
        }
    }

    /**
     * 计算新ELO
     */
    calculateNewELO(myELO, opponentELO, isWin) {
        const expected = 1 / (1 + Math.pow(10, (opponentELO - myELO) / 400));
        const actual = isWin ? 1 : 0;
        return myELO + 32 * (actual - expected);
    }

    /**
     * 更新玩家ELO
     */
    async updatePlayerELO(match, winnerId) {
        // 计算ELO变化
        const player1ELO = await this.getPlayerELO(match.player1_id);
        const player2ELO = await this.getPlayerELO(match.player2_id);
        
        const player1NewELO = this.calculateNewELO(player1ELO, player2ELO, winnerId === match.player1_id);
        const player2NewELO = this.calculateNewELO(player2ELO, player1ELO, winnerId === match.player2_id);
        
        // 批量更新
        await this.game.state.supabase
            .from('player_elo')
            .upsert([
                {
                    user_id: match.player1_id,
                    elo: Math.round(player1NewELO),
                    updated_at: new Date().toISOString()
                },
                {
                    user_id: match.player2_id,
                    elo: Math.round(player2NewELO),
                    updated_at: new Date().toISOString()
                }
            ], { onConflict: 'user_id' });
    }

    /**
     * 检查锦标赛是否完成
     */
    async checkTournamentCompletion(tournamentId) {
        // 获取所有未完成的比赛
        const { data: pendingMatches } = await this.game.state.supabase
            .from('candy_math_tournament_matches')
            .select('id')
            .eq('tournament_id', tournamentId)
            .neq('status', 'finished');
        
        // 如果没有未完成的比赛，锦标赛结束
        if (!pendingMatches || pendingMatches.length === 0) {
            await this.finishTournament(tournamentId);
        }
    }

    /**
     * 完成锦标赛并发放奖金
     */
    async finishTournament(tournamentId) {
        if (!this.game.state.supabaseReady) return;
        
        try {
            // 获取锦标赛信息
            const { data: tournament } = await this.game.state.supabase
                .from('candy_math_tournaments')
                .select('*')
                .eq('id', tournamentId)
                .single();
            
            // 获取最终排名
            const rankings = await this.calculateFinalRankings(tournamentId);
            
            // 发放奖金
            if (tournament.prize_pool && tournament.prize_pool.total > 0) {
                await this.distributePrizes(tournamentId, rankings, tournament.prize_pool);
            }
            
            // 更新锦标赛状态
            await this.game.state.supabase
                .from('candy_math_tournaments')
                .update({
                    status: 'finished',
                    finished_at: new Date().toISOString(),
                    rankings: rankings,
                    winner_id: rankings[0]?.user_id
                })
                .eq('id', tournamentId);
            
            // 发送通知
            this.sendTournamentNotification(tournamentId, '锦标赛已结束');
            
            // 清除缓存
            this.clearCache();
            
            if (this.game.ui) {
                this.game.ui.showFeedback('锦标赛已结束，奖金已发放', '#4CAF50');
            }
            
        } catch (error) {
            console.error('完成锦标赛失败:', error);
        }
    }

    /**
     * 计算最终排名
     */
    async calculateFinalRankings(tournamentId) {
        // 获取所有比赛
        const { data: matches } = await this.game.state.supabase
            .from('candy_math_tournament_matches')
            .select('*')
            .eq('tournament_id', tournamentId)
            .order('round', { ascending: false });
        
        // 计算胜场和得分
        const playerStats = new Map();
        
        matches.forEach(match => {
            if (match.winner_id) {
                const stats = playerStats.get(match.winner_id) || { wins: 0, points: 0, userId: match.winner_id };
                stats.wins++;
                stats.points += Math.max(match.player1_score || 0, match.player2_score || 0);
                playerStats.set(match.winner_id, stats);
            }
        });
        
        // 转换为数组并排序
        const rankings = Array.from(playerStats.values()).sort((a, b) => 
            b.wins - a.wins || b.points - a.points
        );
        
        return rankings;
    }

    /**
     * 发放奖金
     */
    async distributePrizes(tournamentId, rankings, prizePool) {
        const prizes = [
            { rank: 1, amount: prizePool.first },
            { rank: 2, amount: prizePool.second },
            { rank: 3, amount: prizePool.third_fourth },
            { rank: 4, amount: prizePool.third_fourth }
        ];
        
        for (let i = 0; i < Math.min(rankings.length, prizes.length); i++) {
            const ranking = rankings[i];
            const prize = prizes[i];
            
            if (prize.amount > 0) {
                // 发放奖金
                await this.game.state.supabase.rpc('add_points', {
                    p_user_id: ranking.userId,
                    p_amount: prize.amount,
                    p_tournament_id: tournamentId,
                    p_reason: `tournament_rank_${prize.rank}`
                });
                
                // 更新夺冠次数
                if (prize.rank === 1) {
                    await this.game.state.supabase.rpc('increment_tournament_wins', {
                        p_user_id: ranking.userId
                    });
                }
            }
        }
    }

    // ==================== 排名系统 ====================

    /**
     * 加载锦标赛排名
     */
    async loadTournamentRanking(forceRefresh = false) {
        if (!this.game.state.supabaseReady) {
            this.showEmptyList('tournament-ranking', 'Supabase未连接');
            return;
        }

        // 使用缓存
        if (!forceRefresh && this.isCacheValid('rankings')) {
            this.renderRankingList(this.cache.rankings);
            return;
        }

        this.showLoading('tournament-ranking', '加载排名...');

        try {
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
            list.innerHTML = '<div class="empty-state">暂无排名数据</div>';
            return;
        }

        // 使用文档片段优化性能
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
        
        // 生成显示名称
        const displayName = ranking.user_name || 
                           (ranking.user_id ? `玩家${ranking.user_id.slice(0, 4)}` : '未知玩家');

        return `
            <div class="ranking-item" style="display: flex; align-items: center; padding: 15px; border-bottom: 1px solid #f1c40f;">
                <div class="ranking-rank ${rankClass}" style="width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: bold; ${index < 3 ? 'background: ' + (index === 0 ? '#ffd700' : index === 1 ? '#c0c0c0' : '#cd7f32') + '; border-radius: 50%;' : ''}">
                    ${medalEmoji || rankDisplay}
                </div>
                <div class="ranking-info" style="flex: 1; margin-left: 15px;">
                    <div class="ranking-name" style="font-weight: bold;">${this.escapeHtml(displayName)}</div>
                    <div class="ranking-stats" style="font-size: 0.9rem; color: #666;">
                        胜率: ${(ranking.win_rate || 0).toFixed(1)}% · 
                        对战: ${ranking.battles || 0} · 
                        夺冠: ${ranking.tournament_wins || 0} · 
                        积分: ${ranking.points || 0}
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
        if (!this.game.state.supabaseReady) {
            this.showEmptyList('tournament-history', 'Supabase未连接');
            return;
        }

        // 使用缓存
        if (!forceRefresh && this.isCacheValid('history')) {
            this.renderHistoryList(this.cache.history);
            return;
        }

        this.showLoading('tournament-history', '加载历史记录...');

        try {
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
            list.innerHTML = '<div class="empty-state">暂无历史记录</div>';
            return;
        }

        // 使用文档片段优化性能
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
        const dateStr = Formatters.formatDate(date, 'YYYY-MM-DD HH:mm');
        
        const prizePool = tournament.prize_pool || { first: 0, second: 0 };
        
        return `
            <div class="history-item" style="padding: 15px; border-bottom: 1px solid #f1c40f;">
                <div class="history-header" style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                    <span class="history-name" style="font-weight: bold;">${this.escapeHtml(tournament.name)}</span>
                    <span class="history-date" style="color: #666;">${dateStr}</span>
                </div>
                <div class="history-details" style="display: flex; gap: 20px; font-size: 0.9rem;">
                    <span>👥 ${tournament.size}人</span>
                    <span>🏆 冠军: ${prizePool.first || 0}</span>
                    <span>🥈 亚军: ${prizePool.second || 0}</span>
                </div>
            </div>
        `;
    }

    // ==================== 退赛功能 ====================

    /**
     * 退出锦标赛
     */
    async leaveTournament(tournamentId) {
        if (!this.game.auth || !this.game.auth.isLoggedIn()) {
            if (this.game.ui) {
                this.game.ui.showFeedback('请先登录', '#ff4444');
            }
            return;
        }

        // 二次确认
        if (!confirm('确定要退出锦标赛吗？报名费将不予退还。')) return;

        try {
            // 获取锦标赛信息
            const { data: tournament } = await this.game.state.supabase
                .from('candy_math_tournaments')
                .select('status, entry_fee')
                .eq('id', tournamentId)
                .single();

            if (tournament.status !== 'registering') {
                if (this.game.ui) {
                    this.game.ui.showFeedback('比赛已开始，无法退出', '#ff4444');
                }
                return;
            }

            // 删除报名记录
            const { error } = await this.game.state.supabase
                .from('candy_math_tournament_players')
                .delete()
                .eq('tournament_id', tournamentId)
                .eq('user_id', this.game.state.currentUser.id);

            if (error) throw error;

            // 清除缓存
            this.clearCache();
            
            // 刷新列表
            await this.loadTournamentLobby(true);
            
            if (this.game.ui) {
                this.game.ui.showFeedback('已退出锦标赛', '#4CAF50');
            }
            
        } catch (error) {
            console.error('退出锦标赛失败:', error);
            if (this.game.ui) {
                this.game.ui.showFeedback('退出失败', '#ff4444');
            }
        }
    }

    // ==================== 工具函数 ====================

    /**
     * 带重试的请求
     */
    async fetchWithRetry(fn, maxRetries = 3) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                // 添加超时控制
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('请求超时')), 10000);
                });
                
                return await Promise.race([fn(), timeoutPromise]);
            } catch (error) {
                if (i === maxRetries - 1) throw error;
                // 指数退避
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
            }
        }
    }

    /**
     * 获取友好的错误消息
     */
    getFriendlyErrorMessage(error) {
        if (!error) return '操作失败';
        
        // 网络错误
        if (!navigator.onLine) return '网络已断开，请检查连接';
        
        // 超时错误
        if (error.message === '请求超时') return '网络超时，请重试';
        
        // 数据库错误码映射
        const errorMap = {
            '23505': '数据已存在',
            '23503': '关联数据不存在',
            '23514': '数据验证失败',
            '40P01': '并发冲突，请重试',
            'duplicate_key': '您已报名该锦标赛',
            'foreign_key': '锦标赛不存在',
            'check_constraint': '报名人数已满',
            'tournament_full': '报名人数已满',
            'already_joined': '您已报名',
            'insufficient_points': '积分不足',
            'timeout': '网络超时，请重试'
        };
        
        return errorMap[error.code] || errorMap[error.message] || error.message || '操作失败，请稍后重试';
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
        // 移除所有标签页监听器
        this.tabClickHandlers.forEach((handler, tabId) => {
            const btn = document.querySelector(`.tournament-tabs .tab-btn[data-tab="${tabId}"]`);
            if (btn) {
                btn.removeEventListener('click', handler);
            }
        });
        this.tabClickHandlers.clear();

        // 移除其他监听器
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

        this.initialized = false;
    }
}

// 导出到全局
window.TournamentMode = TournamentMode;
