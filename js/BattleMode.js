/**
 * ==================== 糖果数学消消乐 - 对战模式 ====================
 * 包含：快速匹配、创建房间、加入房间、实时对战、聊天系统
 * 依赖：utils.js (需要 I18n, SoundManager, Validators, GAME_CONSTANTS)
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
            status: 'waiting', // 'waiting', 'playing', 'finished'
            myTurn: false,
            roundTimer: null,
            channel: null,
            gameActive: false,
            selectedCards: []
        };
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        
        // 事件处理器变量（用于正确移除监听器）
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
    }

    // ==================== 初始化 ====================

    /**
     * 初始化对战模式
     */
    init() {
        this.leaveBattle(); // 确保开始时是干净状态
        this.bindEvents();
        this.setupReconnectionHandler();
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 快速匹配按钮
        const quickMatchBtn = document.getElementById('quick-match-btn');
        if (quickMatchBtn) {
            if (this.quickMatchHandler) {
                quickMatchBtn.removeEventListener('click', this.quickMatchHandler);
            }
            this.quickMatchHandler = () => this.quickMatch();
            quickMatchBtn.addEventListener('click', this.quickMatchHandler);
        }

        // 加入房间按钮
        const joinRoomBtn = document.getElementById('join-room-btn');
        if (joinRoomBtn) {
            if (this.joinRoomHandler) {
                joinRoomBtn.removeEventListener('click', this.joinRoomHandler);
            }
            this.joinRoomHandler = () => this.showJoinModal();
            joinRoomBtn.addEventListener('click', this.joinRoomHandler);
        }

        // 复制房间码按钮
        const copyBtn = document.getElementById('copy-room-code');
        if (copyBtn) {
            if (this.copyHandler) {
                copyBtn.removeEventListener('click', this.copyHandler);
            }
            this.copyHandler = () => this.copyRoomCode();
            copyBtn.addEventListener('click', this.copyHandler);
        }

        // 取消匹配按钮
        const cancelMatch = document.getElementById('cancel-match');
        if (cancelMatch) {
            if (this.cancelHandler) {
                cancelMatch.removeEventListener('click', this.cancelHandler);
            }
            this.cancelHandler = () => this.cancelMatch();
            cancelMatch.addEventListener('click', this.cancelHandler);
        }

        // 发送消息按钮
        const sendMessage = document.getElementById('send-message');
        if (sendMessage) {
            if (this.sendHandler) {
                sendMessage.removeEventListener('click', this.sendHandler);
            }
            this.sendHandler = () => this.sendChatMessage();
            sendMessage.addEventListener('click', this.sendHandler);
        }

        // 聊天输入框回车发送
        const chatInput = document.getElementById('chat-input');
        if (chatInput) {
            if (this.chatKeyHandler) {
                chatInput.removeEventListener('keypress', this.chatKeyHandler);
            }
            this.chatKeyHandler = (e) => {
                if (e.key === 'Enter') {
                    this.sendChatMessage();
                }
            };
            chatInput.addEventListener('keypress', this.chatKeyHandler);
        }

        // 再战一局按钮
        const rematchBtn = document.getElementById('rematch-btn');
        if (rematchBtn) {
            if (this.rematchHandler) {
                rematchBtn.removeEventListener('click', this.rematchHandler);
            }
            this.rematchHandler = () => this.rematch();
            rematchBtn.addEventListener('click', this.rematchHandler);
        }

        // 关闭对战按钮
        const closeBattleBtn = document.getElementById('close-battle-btn');
        if (closeBattleBtn) {
            if (this.closeHandler) {
                closeBattleBtn.removeEventListener('click', this.closeHandler);
            }
            this.closeHandler = () => this.closeBattle();
            closeBattleBtn.addEventListener('click', this.closeHandler);
        }

        // 确认加入房间按钮
        const confirmJoin = document.getElementById('confirm-join');
        if (confirmJoin) {
            if (this.confirmJoinHandler) {
                confirmJoin.removeEventListener('click', this.confirmJoinHandler);
            }
            this.confirmJoinHandler = () => this.confirmJoin();
            confirmJoin.addEventListener('click', this.confirmJoinHandler);
        }

        // 取消加入按钮
        const cancelJoin = document.getElementById('cancel-join');
        if (cancelJoin) {
            if (this.cancelJoinHandler) {
                cancelJoin.removeEventListener('click', this.cancelJoinHandler);
            }
            this.cancelJoinHandler = () => this.closeJoinModal();
            cancelJoin.addEventListener('click', this.cancelJoinHandler);
        }

        // 对战网格点击（使用事件委托）
        const battleGrid = document.getElementById('battle-grid');
        if (battleGrid) {
            if (this.gridClickHandler) {
                battleGrid.removeEventListener('click', this.gridClickHandler);
            }
            this.gridClickHandler = (e) => this.handleBattleCardClick(e);
            battleGrid.addEventListener('click', this.gridClickHandler);
        }
    }

    /**
     * 设置断线重连处理器
     */
    setupReconnectionHandler() {
        window.addEventListener('online', () => {
            if (this.room.status === 'playing' && this.room.battleId) {
                this.attemptReconnect();
            }
        });
    }

    /**
     * 尝试重连
     */
    async attemptReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            if (this.game.ui) {
                this.game.ui.showFeedback('重连失败，请重新开始对战', '#ff4444');
            }
            this.leaveBattle();
            return;
        }

        this.reconnectAttempts++;
        
        try {
            if (!this.game.state.supabaseReady) {
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
                if (this.game.ui) {
                    this.game.ui.showFeedback('重连成功', '#4CAF50');
                }
                this.reconnectAttempts = 0;
            }
        } catch (error) {
            console.error('重连失败:', error);
            setTimeout(() => this.attemptReconnect(), 2000);
        }
    }

    // ==================== 匹配系统 ====================

    /**
     * 快速匹配
     */
    async quickMatch() {
        if (!this.game.auth || !this.game.auth.isLoggedIn()) {
            if (this.game.ui) {
                this.game.ui.showFeedback('请先登录', '#ff4444');
            }
            if (this.game.auth) {
                this.game.auth.showAuthModal('login');
            }
            return;
        }

        // 打开对战模态框
        if (this.game.ui) {
            this.game.ui.openModal('battle-modal');
        }
        document.getElementById('battle-waiting').style.display = 'block';
        document.getElementById('battle-active').style.display = 'none';
        document.getElementById('battle-result').style.display = 'none';

        // 加入匹配队列
        await this.joinQueue({
            id: this.game.state.currentUser.id,
            name: this.game.state.currentUser.name
        });

        // 生成房间码
        const roomCode = this.generateRoomCode();
        this.room.roomCode = roomCode;
        const roomCodeSpan = document.getElementById('room-code');
        if (roomCodeSpan) roomCodeSpan.textContent = roomCode;
    }

    /**
     * 生成房间码
     */
    generateRoomCode() {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    }

    /**
     * 加入匹配队列
     */
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

    /**
     * 离开匹配队列
     */
    leaveQueue(playerId) {
        this.matchQueue = this.matchQueue.filter(p => p.id !== playerId);
    }

    /**
     * 尝试匹配
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

                const diff = Math.abs(this.matchQueue[i].elo - this.matchQueue[j].elo);
                const timeBonus = Math.min(100, (Date.now() - this.matchQueue[j].joinTime) / 1000) * 10;
                const maxDiff = 100 + timeBonus;
                
                if (diff < maxDiff && diff < bestDiff) {
                    bestDiff = diff;
                    bestMatch = j;
                }
            }

            if (bestMatch !== -1) {
                matched.push([i, bestMatch]);
                used.add(i);
                used.add(bestMatch);
            }
        }

        for (const [i, j] of matched) {
            const player1 = this.matchQueue[i];
            const player2 = this.matchQueue[j];
            
            // 从队列中移除（先删大的索引，再删小的索引）
            const index1 = Math.max(i, j);
            const index2 = Math.min(i, j);
            this.matchQueue.splice(index1, 1);
            this.matchQueue.splice(index2, 1);
            
            await this.createBattleRoom(player1, player2);
        }
    }

    /**
     * 计算玩家ELO分数
     */
    async calculatePlayerELO(userId) {
        if (!this.game.state.supabaseReady) return 1200;

        try {
            const { data: battles } = await this.game.state.supabase
                .from('candy_math_battles')
                .select('*')
                .or(`player1_id.eq.${userId},player2_id.eq.${userId}`)
                .eq('status', 'finished')
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
                
                totalScore += 32 * (actual - expected);
            }

            // 更新ELO到数据库
            if (this.game.state.supabaseReady) {
                const winRate = battles.length > 0 ? (wins / battles.length) * 100 : 0;
                await this.game.state.supabase
                    .from('player_elo')
                    .upsert({
                        user_id: userId,
                        elo: Math.round(totalScore),
                        win_rate: winRate,
                        battles: battles.length,
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

    /**
     * 创建对战房间
     */
    async createBattleRoom(player1, player2) {
        // 验证玩家信息
        if (!player1 || !player2 || !player1.id || !player2.id) {
            console.error('玩家信息不完整');
            return;
        }

        if (!this.game.state.supabaseReady) {
            if (this.game.ui) {
                this.game.ui.showFeedback('Supabase未连接，无法创建房间', '#ff4444');
            }
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

            if (error) throw error;

            // 通知玩家匹配成功
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
            if (this.game.ui) {
                this.game.ui.showFeedback('创建房间失败', '#ff4444');
            }
        }
    }

    /**
     * 通知玩家
     */
    notifyPlayer(playerId, type, data) {
        if (this.game.state.currentUser && this.game.state.currentUser.id === playerId) {
            if (type === 'match_found') {
                this.startBattle(data);
            }
        }
    }

    /**
     * 显示加入房间模态框
     */
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

    /**
     * 关闭加入房间模态框
     */
    closeJoinModal() {
        if (this.game.ui) {
            this.game.ui.closeModal('join-modal');
        }
    }

    /**
     * 确认加入房间
     */
    async confirmJoin() {
        const roomCodeInput = document.getElementById('room-code-input');
        const roomCode = roomCodeInput?.value;
        
        if (!roomCode || roomCode.length !== 6) {
            if (this.game.ui) {
                this.game.ui.showFeedback('请输入6位房间码', '#ff4444');
            }
            return;
        }

        if (!Validators.isValidRoomCode(roomCode)) {
            if (this.game.ui) {
                this.game.ui.showFeedback('房间码格式不正确', '#ff4444');
            }
            return;
        }

        if (!this.game.auth || !this.game.auth.isLoggedIn()) {
            if (this.game.ui) {
                this.game.ui.showFeedback('请先登录', '#ff4444');
            }
            if (this.game.auth) {
                this.game.auth.showAuthModal('login');
            }
            return;
        }

        if (!this.game.state.supabaseReady) {
            if (this.game.ui) {
                this.game.ui.showFeedback('Supabase未连接', '#ff4444');
            }
            return;
        }

        try {
            const { data: battle, error } = await this.game.state.supabase
                .from('candy_math_battles')
                .select('*')
                .eq('room_code', roomCode.toUpperCase())
                .eq('status', 'waiting')
                .single();

            if (error || !battle) {
                if (this.game.ui) {
                    this.game.ui.showFeedback('房间不存在或已开始', '#ff4444');
                }
                return;
            }

            await this.game.state.supabase
                .from('candy_math_battles')
                .update({
                    player2_id: this.game.state.currentUser.id,
                    player2_name: this.game.state.currentUser.name,
                    status: 'playing',
                    started_at: new Date().toISOString()
                })
                .eq('id', battle.id);

            this.startBattle({
                battleId: battle.id,
                roomCode: battle.room_code,
                opponent: { id: battle.player1_id, name: battle.player1_name }
            });

            this.closeJoinModal();
        } catch (error) {
            console.error('加入房间失败:', error);
            if (this.game.ui) {
                this.game.ui.showFeedback('加入房间失败', '#ff4444');
            }
        }
    }

    /**
     * 复制房间码
     */
    copyRoomCode() {
        if (this.room.roomCode) {
            navigator.clipboard.writeText(this.room.roomCode);
            if (this.game.ui) {
                this.game.ui.showFeedback('复制成功', '#4CAF50');
            }
        }
    }

    /**
     * 取消匹配
     */
    cancelMatch() {
        if (this.game.state.currentUser) {
            this.leaveQueue(this.game.state.currentUser.id);
        }
        this.leaveBattle();
        if (this.game.ui) {
            this.game.ui.closeModal('battle-modal');
        }
    }

    // ==================== 对战逻辑 ====================

    /**
     * 开始对战
     */
    async startBattle(data) {
        if (!this.game.state.supabaseReady) {
            if (this.game.ui) {
                this.game.ui.showFeedback('Supabase未连接，无法开始对战', '#ff4444');
            }
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

        // 更新UI
        document.getElementById('battle-waiting').style.display = 'none';
        document.getElementById('battle-active').style.display = 'block';
        document.getElementById('battle-result').style.display = 'none';

        // 清空聊天记录
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) chatMessages.innerHTML = '';

        // 设置玩家名称和头像
        if (this.room.playerRole === 'player1') {
            document.getElementById('player1-name').textContent = this.game.state.currentUser.name;
            document.getElementById('player2-name').textContent = this.room.opponentName;
            document.getElementById('player1-avatar').textContent = this.game.state.currentUser.name.charAt(0).toUpperCase();
            document.getElementById('player2-avatar').textContent = this.room.opponentName.charAt(0).toUpperCase();
        } else {
            document.getElementById('player1-name').textContent = this.room.opponentName;
            document.getElementById('player2-name').textContent = this.game.state.currentUser.name;
            document.getElementById('player1-avatar').textContent = this.room.opponentName.charAt(0).toUpperCase();
            document.getElementById('player2-avatar').textContent = this.game.state.currentUser.name.charAt(0).toUpperCase();
        }

        // 随机决定先手
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

        this.sendSystemMessage('⚔️ 对战开始！');
        if (this.room.myTurn) {
            this.sendSystemMessage('你的回合，请选择卡片');
        } else {
            this.sendSystemMessage(`等待 ${this.room.opponentName} 操作`);
        }

        this.subscribeToBattle(this.room.battleId);
    }

    /**
     * 订阅对战更新
     */
    subscribeToBattle(battleId) {
        if (!this.game.state.supabaseReady) return;

        if (this.room.channel) {
            this.room.channel.unsubscribe();
        }

        try {
            this.room.channel = this.game.state.supabase
                .channel(`battle-${battleId}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'UPDATE',
                        schema: 'public',
                        table: 'candy_math_battles',
                        filter: `id=eq.${battleId}`
                    },
                    (payload) => this.handleBattleUpdate(payload)
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'candy_math_battle_rounds',
                        filter: `battle_id=eq.${battleId}`
                    },
                    (payload) => this.handleRoundUpdate(payload)
                )
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'candy_math_battle_messages',
                        filter: `battle_id=eq.${battleId}`
                    },
                    (payload) => this.handleNewMessage(payload)
                )
                .subscribe((status, err) => {
                    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        console.error('订阅失败:', err);
                        this.attemptReconnect();
                    } else if (status === 'CLOSED') {
                        console.log('通道已关闭');
                    }
                });
        } catch (error) {
            console.error('订阅对战失败:', error);
        }
    }

    /**
     * 处理对战更新
     */
    handleBattleUpdate(payload) {
        const battle = payload.new;

        // 更新分数显示
        if (this.room.playerRole === 'player1') {
            document.getElementById('player1-score').textContent = battle.player1_score || 0;
            document.getElementById('player2-score').textContent = battle.player2_score || 0;
            document.getElementById('player1-progress').style.width = `${battle.player1_progress || 0}%`;
            document.getElementById('player2-progress').style.width = `${battle.player2_progress || 0}%`;
        } else {
            document.getElementById('player1-score').textContent = battle.player2_score || 0;
            document.getElementById('player2-score').textContent = battle.player1_score || 0;
            document.getElementById('player1-progress').style.width = `${battle.player2_progress || 0}%`;
            document.getElementById('player2-progress').style.width = `${battle.player1_progress || 0}%`;
        }

        this.room.myTurn = battle.current_turn === this.game.state.currentUser.id;
        this.updateTurnIndicator();

        if (battle.status === 'finished') {
            this.showBattleResult(battle);
        }
    }

    /**
     * 处理回合更新
     */
    handleRoundUpdate(payload) {
        const round = payload.new;
        if (round.player_id !== this.game.state.currentUser.id) {
            this.addOpponentMove(round);
        }
    }

    /**
     * 处理新消息
     */
    handleNewMessage(payload) {
        const message = payload.new;
        this.addChatMessage(message);
    }

    /**
     * 更新回合指示器
     */
    updateTurnIndicator() {
        const indicator = document.getElementById('turn-indicator');
        if (!indicator) return;

        const turnText = indicator.querySelector('.turn-text');
        const timer = document.getElementById('turn-timer');
        const lang = I18n;

        if (this.room.myTurn) {
            turnText.textContent = lang.t('yourTurn');
            indicator.style.background = 'linear-gradient(145deg, #6ab04c, #2e7d32)';
            this.startTurnTimer();
        } else {
            turnText.textContent = lang.t('opponentTurn');
            indicator.style.background = 'linear-gradient(145deg, #e84342, #c0392b)';
            this.stopTurnTimer();
            if (timer) timer.textContent = '30s';
        }
    }

    /**
     * 开始回合计时
     */
    startTurnTimer() {
        let timeLeft = 30;
        const timer = document.getElementById('turn-timer');

        this.stopTurnTimer();

        this.room.roundTimer = setInterval(() => {
            timeLeft--;
            if (timer) timer.textContent = `${timeLeft}s`;

            if (timeLeft <= 0) {
                this.endTurn();
            }
        }, 1000);
    }

    /**
     * 停止回合计时
     */
    stopTurnTimer() {
        if (this.room.roundTimer) {
            clearInterval(this.room.roundTimer);
            this.room.roundTimer = null;
        }
    }

    /**
     * 生成对战网格
     */
    generateBattleGrid() {
        const grid = document.getElementById('battle-grid');
        if (!grid) return;

        const numbers = [];
        for (let i = 0; i < 10; i++) {
            numbers.push(Math.floor(Math.random() * 10));
        }

        grid.innerHTML = numbers.map(num => 
            `<div class="number-card" data-value="${num}">${num}</div>`
        ).join('');
    }

    /**
     * 刷新对战网格
     */
    refreshBattleGrid() {
        const grid = document.getElementById('battle-grid');
        if (!grid) return;

        const numbers = [];
        for (let i = 0; i < 10; i++) {
            numbers.push(Math.floor(Math.random() * 10));
        }
        
        grid.innerHTML = numbers.map(num => 
            `<div class="number-card" data-value="${num}">${num}</div>`
        ).join('');
    }

    /**
     * 生成对战目标
     */
    generateBattleTarget() {
        const target = Math.floor(Math.random() * 10) + 5;
        const targetEl = document.getElementById('battle-target-number');
        if (targetEl) targetEl.textContent = target;
    }

    /**
     * 处理对战卡片点击
     */
    async handleBattleCardClick(e) {
        const card = e.target.closest('.number-card');
        if (!card) return;

        if (!this.room.gameActive) return;
        
        if (!this.room.myTurn) {
            SoundManager.play('wrong');
            if (this.game.ui) {
                this.game.ui.showFeedback('现在是对手的回合', '#ffa500');
            }
            return;
        }

        // 检查卡片是否已被匹配
        if (card.classList.contains('matched')) {
            return;
        }

        SoundManager.play('click');

        if (card.classList.contains('selected')) {
            card.classList.remove('selected');
            this.room.selectedCards = this.room.selectedCards.filter(c => c !== card);
            return;
        }

        if (this.room.selectedCards.length >= 2) {
            return;
        }

        card.classList.add('selected');
        this.room.selectedCards.push(card);

        if (this.room.selectedCards.length === 2) {
            await this.checkBattleMatch();
        }
    }

    /**
     * 检查对战匹配
     */
    async checkBattleMatch() {
        const [card1, card2] = this.room.selectedCards;
        
        // 检查卡片是否还存在
        if (!card1 || !card2 || !card1.isConnected || !card2.isConnected) {
            this.room.selectedCards = [];
            return;
        }

        // 获取目标数字
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
        const timerText = document.getElementById('turn-timer').textContent;
        const roundTime = 30 - parseInt(timerText.replace('s', ''));

        try {
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

            if (this.game.state.supabaseReady) {
                await this.game.state.supabase
                    .from('candy_math_battle_rounds')
                    .insert([round]);
            }

            if (isCorrect) {
                SoundManager.play('correct');
                
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
            } else {
                SoundManager.play('wrong');
                
                setTimeout(() => {
                    if (card1.isConnected) card1.classList.remove('selected');
                    if (card2.isConnected) card2.classList.remove('selected');
                }, 500);
            }

            this.room.selectedCards = [];
            this.endTurn();
        } catch (error) {
            console.error('检查对战匹配失败:', error);
            if (this.game.ui) {
                this.game.ui.showFeedback('操作失败', '#ff4444');
            }
            this.room.selectedCards = [];
        }
    }

    /**
     * 更新对战分数
     */
    async updateBattleScore(points) {
        if (!this.game.state.supabaseReady || !this.room.gameActive) return;

        try {
            const field = this.room.playerRole === 'player1' ? 'player1_score' : 'player2_score';
            const progressField = this.room.playerRole === 'player1' ? 'player1_progress' : 'player2_progress';

            const { data: battle, error } = await this.game.state.supabase
                .from('candy_math_battles')
                .select('*')
                .eq('id', this.room.battleId)
                .single();

            if (error || !battle) throw error || new Error('对战不存在');

            // 如果已经结束，不再更新
            if (battle.status === 'finished') return;

            const newScore = (battle[field] || 0) + points;
            const newProgress = Math.min(100, (battle[progressField] || 0) + 10);

            await this.game.state.supabase
                .from('candy_math_battles')
                .update({
                    [field]: newScore,
                    [progressField]: newProgress
                })
                .eq('id', this.room.battleId);

            if (newProgress >= 100 && this.room.gameActive) {
                this.room.gameActive = false; // 立即标记，防止重复触发
                setTimeout(() => {
                    this.endBattle(this.game.state.currentUser.id);
                }, 500);
            }
        } catch (error) {
            console.error('更新对战分数失败:', error);
        }
    }

    /**
     * 结束回合
     */
    async endTurn() {
        this.stopTurnTimer();
        
        if (!this.game.state.supabaseReady || !navigator.onLine) {
            // 如果网络断开，直接切换回合（本地模拟）
            this.room.myTurn = !this.room.myTurn;
            this.updateTurnIndicator();
            return;
        }
        
        try {
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
            // 如果更新失败，尝试恢复回合状态
            this.room.myTurn = true; // 保持当前玩家回合
            this.startTurnTimer();
        }
    }

    /**
     * 结束对战
     */
    async endBattle(winnerId) {
        this.room.gameActive = false;
        this.stopTurnTimer();

        // 检查网络状态
        if (!navigator.onLine) {
            this.showBattleResultFallback(winnerId);
            return;
        }

        if (!this.game.state.supabaseReady) {
            this.showBattleResultFallback(winnerId);
            return;
        }

        try {
            // 先获取当前对战状态
            const { data: battle, error: fetchError } = await this.game.state.supabase
                .from('candy_math_battles')
                .select('*')
                .eq('id', this.room.battleId)
                .single();

            if (fetchError) throw fetchError;

            // 如果已经结束了，不再重复结束
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
            this.sendSystemMessage(`🏆 ${winner} 获胜！`);

            // 更新ELO
            await this.updateELOAfterBattle(battle, winnerId);
            
            // 重新获取更新后的对战数据并显示结果
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
    }

    /**
     * 更新战后ELO
     */
    async updateELOAfterBattle(battle, winnerId) {
        if (!this.game.state.supabaseReady) return;

        try {
            const player1ELO = battle.player1_elo || 1200;
            const player2ELO = battle.player2_elo || 1200;
            
            const player1NewELO = this.calculateNewELO(player1ELO, player2ELO, winnerId === battle.player1_id);
            const player2NewELO = this.calculateNewELO(player2ELO, player1ELO, winnerId === battle.player2_id);

            await this.game.state.supabase
                .from('player_elo')
                .upsert([
                    {
                        user_id: battle.player1_id,
                        elo: Math.round(player1NewELO),
                        updated_at: new Date().toISOString()
                    },
                    {
                        user_id: battle.player2_id,
                        elo: Math.round(player2NewELO),
                        updated_at: new Date().toISOString()
                    }
                ], { onConflict: 'user_id' });
        } catch (error) {
            console.error('更新ELO失败:', error);
            // 静默失败，不影响游戏体验
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
     * 降级显示对战结果（Supabase不可用时）
     */
    showBattleResultFallback(winnerId) {
        document.getElementById('battle-active').style.display = 'none';
        document.getElementById('battle-result').style.display = 'block';

        const iWon = winnerId === this.game.state.currentUser.id;
        const lang = I18n;
        document.getElementById('result-title').textContent = iWon ? `🏆 ${lang.t('win')}` : `😢 ${lang.t('lose')}`;

        // 从本地状态获取分数
        const myScore = this.room.playerRole === 'player1' ? 
            parseInt(document.getElementById('player1-score').textContent) : 
            parseInt(document.getElementById('player2-score').textContent);
        
        const opponentScore = this.room.playerRole === 'player1' ? 
            parseInt(document.getElementById('player2-score').textContent) : 
            parseInt(document.getElementById('player1-score').textContent);

        document.getElementById('final-player-score').textContent = myScore || 0;
        document.getElementById('final-opponent-score').textContent = opponentScore || 0;

        SoundManager.play(iWon ? 'achievement' : 'wrong');
    }

    /**
     * 显示对战结果
     */
    showBattleResult(battle) {
        document.getElementById('battle-active').style.display = 'none';
        document.getElementById('battle-result').style.display = 'block';

        const iWon = battle.winner_id === this.game.state.currentUser.id;
        const lang = I18n;
        document.getElementById('result-title').textContent = iWon ? `🏆 ${lang.t('win')}` : `😢 ${lang.t('lose')}`;

        if (this.room.playerRole === 'player1') {
            document.getElementById('final-player-score').textContent = battle.player1_score || 0;
            document.getElementById('final-opponent-score').textContent = battle.player2_score || 0;
        } else {
            document.getElementById('final-player-score').textContent = battle.player2_score || 0;
            document.getElementById('final-opponent-score').textContent = battle.player1_score || 0;
        }

        SoundManager.play(iWon ? 'achievement' : 'wrong');
    }

    // ==================== 聊天系统 ====================

    /**
     * 发送聊天消息
     */
    async sendChatMessage() {
        const input = document.getElementById('chat-input');
        if (!input || !input.value.trim()) return;

        let text = input.value.trim();
        input.value = '';

        // 消息长度限制
        if (text.length > 200) {
            text = text.substring(0, 200) + '...';
        }

        if (!this.game.state.supabaseReady || !this.room.battleId) return;

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

    /**
     * 发送系统消息
     */
    async sendSystemMessage(text) {
        if (!this.game.state.supabaseReady || !this.room.battleId) return;

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

    /**
     * 添加聊天消息到界面
     */
    addChatMessage(message) {
        const chat = document.getElementById('chat-messages');
        if (!chat) return;

        const msgDiv = document.createElement('div');
        
        // 消息长度显示限制
        const displayMessage = message.message.length > 100 
            ? message.message.substring(0, 100) + '...' 
            : message.message;
        
        if (message.player_id === 'system') {
            msgDiv.className = 'message system';
            msgDiv.textContent = displayMessage;
        } else if (message.player_id === this.game.state.currentUser.id) {
            msgDiv.className = 'message self';
            msgDiv.innerHTML = `<span class="message-sender">你:</span> ${this.escapeHtml(displayMessage)}`;
        } else {
            msgDiv.className = 'message opponent';
            msgDiv.innerHTML = `<span class="message-sender">${this.escapeHtml(message.player_name)}:</span> ${this.escapeHtml(displayMessage)}`;
        }

        chat.appendChild(msgDiv);
        chat.scrollTop = chat.scrollHeight;
    }

    /**
     * 转义HTML特殊字符（防止XSS）
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 添加对手操作到聊天
     */
    addOpponentMove(round) {
        const chat = document.getElementById('chat-messages');
        if (!chat) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'message system';
        
        const result = round.is_correct ? '✓ 正确' : '✗ 错误';
        msgDiv.textContent = `${this.room.opponentName} 选择了 ${round.num1} + ${round.num2} = ${round.num1 + round.num2} ${result}`;
        
        chat.appendChild(msgDiv);
        chat.scrollTop = chat.scrollHeight;
    }

    // ==================== 退出清理 ====================

    /**
     * 离开对战
     */
    leaveBattle() {
        // 从匹配队列中移除
        if (this.game.state.currentUser) {
            this.leaveQueue(this.game.state.currentUser.id);
        }
        
        // 清理订阅
        if (this.room.channel) {
            this.room.channel.unsubscribe();
            this.room.channel = null;
        }
        
        // 停止计时器
        this.stopTurnTimer();
        
        // 重置房间状态
        this.room = {
            roomCode: null,
            battleId: null,
            playerRole: null,
            opponentId: null,
            opponentName: null,
            status: 'waiting',
            myTurn: false,
            roundTimer: null,
            channel: null,
            gameActive: false,
            selectedCards: []
        };
        
        this.reconnectAttempts = 0;
    }

    /**
     * 再战一局
     */
    async rematch() {
        document.getElementById('battle-result').style.display = 'none';
        this.leaveBattle();
        await this.quickMatch();
    }

    /**
     * 关闭对战
     */
    closeBattle() {
        this.leaveBattle();
        if (this.game.ui) {
            this.game.ui.closeModal('battle-modal');
        }
    }
}

// 导出到全局
window.BattleMode = BattleMode;
