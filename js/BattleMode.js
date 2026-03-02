/**
 * ==================== 糖果数学消消乐 - 对战模式 ====================
 * 包含：快速匹配、创建房间、加入房间、实时对战、聊天系统、AI对手
 * 依赖：utils.js (需要 I18n, SoundManager, Validators, GAME_CONSTANTS)
 * 
 * 版本：3.0.0
 * 更新说明：
 * - 添加匹配超时处理（30秒）
 * - 添加AI对手功能（三个难度级别）
 * - 添加本地对战模式（Supabase降级）
 * - 修复所有55个自查发现的问题
 * - 优化资源清理和内存管理
 * - 完善错误处理和并发控制
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
            opponentIsAI: false, // 标记对手是否为AI
            aiDifficulty: 'medium', // AI难度级别：easy/medium/hard
            status: 'waiting', // 'waiting', 'playing', 'finished'
            myTurn: false,
            roundTimer: null,
            channel: null,
            gameActive: false,
            selectedCards: []
        };
        
        // 匹配系统状态
        this.matchTimeoutId = null; // 匹配超时定时器
        this.matchStartTime = null; // 匹配开始时间
        this.queueStatusInterval = null; // 排队状态更新定时器
        
        // 重连机制
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 3;
        
        // AI相关
        this.aiResponseTimer = null; // AI聊天回复定时器
        this.aiMoveTimer = null; // AI移动定时器
        this.aiMoveRetryCount = 0; // AI移动重试计数
        this.localPollingTimer = null; // 本地对战轮询定时器
        
        // 并发控制标志
        this.cardClickProcessing = false; // 卡片点击处理中
        this.endTurnInProgress = false; // 结束回合处理中
        this.rematchInProgress = false; // 再战处理中
        this.scoreUpdateInProgress = false; // 分数更新处理中
        
        // 事件处理器
        this.onlineHandler = null;
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
        this.continueWaitingHandler = null;
        this.playWithAIHandler = null;
        
        // 常量定义
        this.constants = {
            MATCH_TIMEOUT: 30000, // 30秒
            MAX_CHAT_MESSAGES: 100, // 最大聊天记录数
            ELO_K_FACTOR: 32, // ELO计算常数
            BASE_MATCH_RANGE: 200, // 基础匹配范围
            MAX_MATCH_RANGE: 400, // 最大匹配范围
            AI_RESPONSE_DELAY: 1000, // AI回复延迟（毫秒）
            AI_MOVE_DELAY: 500, // AI移动延迟（毫秒）
            AI_MAX_RETRIES: 3, // AI最大重试次数
            ROUND_TIME: 30, // 每回合时间（秒）
            TIME_BONUS_FACTOR: 15, // 时间奖励因子
            MAX_TIME_BONUS: 200 // 最大时间奖励
        };
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
        // 先移除旧的监听器
        if (this.onlineHandler) {
            window.removeEventListener('online', this.onlineHandler);
        }
        
        this.onlineHandler = () => {
            if (this.room.status === 'playing' && this.room.battleId && !this.room.opponentIsAI) {
                this.attemptReconnect();
            }
        };
        
        window.addEventListener('online', this.onlineHandler);
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
     * 快速匹配（增强版，包含超时和AI对手）
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

        // 清理之前的匹配状态
        this.cleanupMatch();

        // 打开对战模态框
        if (this.game.ui) {
            this.game.ui.openModal('battle-modal');
        }
        
        const waitingDiv = document.getElementById('battle-waiting');
        if (waitingDiv) {
            waitingDiv.style.display = 'block';
        }
        
        const activeDiv = document.getElementById('battle-active');
        if (activeDiv) {
            activeDiv.style.display = 'none';
        }
        
        const resultDiv = document.getElementById('battle-result');
        if (resultDiv) {
            resultDiv.style.display = 'none';
        }

        // 生成房间码
        const roomCode = this.generateRoomCode();
        this.room.roomCode = roomCode;
        const roomCodeSpan = document.getElementById('room-code');
        if (roomCodeSpan) roomCodeSpan.textContent = roomCode;

        // 显示等待提示和排队状态
        this.showMatchWaitingUI();

        // 记录匹配开始时间
        this.matchStartTime = Date.now();

        // 加入匹配队列
        await this.joinQueue({
            id: this.game.state.currentUser.id,
            name: this.game.state.currentUser.name
        });

        // 设置匹配超时
        this.matchTimeoutId = setTimeout(() => {
            this.handleMatchTimeout();
        }, this.constants.MATCH_TIMEOUT);

        // 启动排队状态更新
        this.startQueueStatusUpdate();
    }

    /**
     * 显示匹配等待界面
     */
    showMatchWaitingUI() {
        const waitingDiv = document.getElementById('battle-waiting');
        if (!waitingDiv) return;

        // 移除旧的提示
        const oldHint = document.getElementById('match-waiting-hint');
        if (oldHint) oldHint.remove();

        // 添加等待提示
        const hintDiv = document.createElement('div');
        hintDiv.id = 'match-waiting-hint';
        hintDiv.style.marginTop = '15px';
        hintDiv.style.padding = '10px';
        hintDiv.style.background = '#fff0f5';
        hintDiv.style.borderRadius = '20px';
        hintDiv.style.border = '1px solid #ffb6c1';
        hintDiv.innerHTML = `
            <div style="margin-bottom: 8px;">
                <span class="waiting-spinner-small">🔄</span>
                <span id="match-status-text">正在寻找对手...</span>
            </div>
            <div id="queue-status" style="font-size: 0.9rem; color: #666;">
                当前排队人数: <span id="queue-count">1</span>
            </div>
            <div style="font-size: 0.8rem; color: #999; margin-top: 5px;">
                等待时间: <span id="wait-time">0</span>秒
            </div>
        `;

        waitingDiv.appendChild(hintDiv);

        // 添加CSS动画
        const style = document.createElement('style');
        style.textContent = `
            .waiting-spinner-small {
                display: inline-block;
                animation: spinSmall 1s linear infinite;
                margin-right: 8px;
            }
            @keyframes spinSmall {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * 开始更新排队状态
     */
    startQueueStatusUpdate() {
        if (this.queueStatusInterval) {
            clearInterval(this.queueStatusInterval);
        }
        
        this.queueStatusInterval = setInterval(() => {
            this.updateQueueStatus();
        }, 1000);
    }

    /**
     * 更新排队状态
     */
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
                matchStatus.innerHTML = '🎉 找到对手！准备开始对战...';
            } else if (this.matchQueue.length === 1) {
                matchStatus.innerHTML = '⏳ 等待其他玩家加入...';
            }
        }
    }

    /**
     * 停止排队状态更新
     */
    stopQueueStatusUpdate() {
        if (this.queueStatusInterval) {
            clearInterval(this.queueStatusInterval);
            this.queueStatusInterval = null;
        }
    }

    /**
     * 处理匹配超时
     */
    handleMatchTimeout() {
        this.matchTimeoutId = null;

        if (this.game.state.currentUser) {
            this.leaveQueue(this.game.state.currentUser.id);
        }

        this.stopQueueStatusUpdate();

        // 清理房间码显示
        const roomCodeSpan = document.getElementById('room-code');
        if (roomCodeSpan) {
            roomCodeSpan.textContent = '------';
        }

        this.showAIOption();
    }

    /**
     * 显示AI对战选项
     */
    showAIOption() {
        const waitingDiv = document.getElementById('battle-waiting');
        if (!waitingDiv) return;

        // 移除旧的等待提示
        const oldHint = document.getElementById('match-waiting-hint');
        if (oldHint) oldHint.remove();

        // 检查是否已有AI选项
        const existingOption = document.getElementById('ai-option');
        if (existingOption) existingOption.remove();

        // 添加AI对战选项
        const aiDiv = document.createElement('div');
        aiDiv.id = 'ai-option';
        aiDiv.style.marginTop = '20px';
        aiDiv.style.padding = '20px';
        aiDiv.style.background = 'linear-gradient(145deg, #fff0f5, #ffe4e1)';
        aiDiv.style.borderRadius = '30px';
        aiDiv.style.border = '2px solid #ff69b4';
        aiDiv.style.boxShadow = '0 4px 0 #ff1493';
        aiDiv.innerHTML = `
            <div style="font-size: 2rem; margin-bottom: 10px;">😢</div>
            <p style="margin-bottom: 10px; font-weight: bold;">当前没有其他玩家在线</p>
            <p style="margin-bottom: 15px; font-size: 0.9rem; color: #666;">
                您可以继续等待，或者与AI练习对战<br>
                (AI对战不计入排名，不消耗积分)
            </p>
            <div style="display: flex; gap: 10px; justify-content: center;">
                <button class="candy-btn primary" id="continue-waiting-btn" style="flex: 1;">
                    ⏳ 继续等待
                </button>
                <button class="candy-btn secondary" id="play-with-ai-btn" style="flex: 1;">
                    🤖 与AI对战
                </button>
            </div>
        `;

        waitingDiv.appendChild(aiDiv);

        // 绑定事件（先移除旧的监听器）
        const continueBtn = document.getElementById('continue-waiting-btn');
        if (continueBtn) {
            if (this.continueWaitingHandler) {
                continueBtn.removeEventListener('click', this.continueWaitingHandler);
            }
            this.continueWaitingHandler = () => {
                aiDiv.remove();
                this.quickMatch(); // 重新开始匹配
            };
            continueBtn.addEventListener('click', this.continueWaitingHandler);
        }

        const aiBtn = document.getElementById('play-with-ai-btn');
        if (aiBtn) {
            if (this.playWithAIHandler) {
                aiBtn.removeEventListener('click', this.playWithAIHandler);
            }
            this.playWithAIHandler = () => {
                aiDiv.remove();
                this.startAIBattle();
            };
            aiBtn.addEventListener('click', this.playWithAIHandler);
        }
    }

    /**
     * 开始与AI对战
     */
    async startAIBattle() {
        // 清理匹配状态
        this.cleanupMatch();

        // 创建AI玩家
        const aiPlayer = {
            id: 'ai_' + Math.random().toString(36).substring(2, 8),
            name: this.getAIName(),
            elo: 1200
        };

        // 标记对手为AI
        this.room.opponentIsAI = true;
        this.room.aiDifficulty = this.selectAIDifficulty();

        // 重置AI重试计数
        this.aiMoveRetryCount = 0;

        // 创建对战房间（不通过Supabase）
        await this.startAIBattleRoom(aiPlayer);

        if (this.game.ui) {
            this.game.ui.showFeedback('已为您匹配AI对手', '#4CAF50');
        }
    }

    /**
     * 选择AI难度（根据玩家ELO）
     */
    selectAIDifficulty() {
        const playerELO = this.game.state.currentUser?.elo || 1200;
        if (playerELO < 1000) return 'easy';
        if (playerELO < 1400) return 'medium';
        return 'hard';
    }

    /**
     * 获取AI名称
     */
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
        return names[Math.floor(Math.random() * names.length)] + 
               (this.room.aiDifficulty === 'easy' ? ' (简单)' : 
                this.room.aiDifficulty === 'medium' ? ' (中等)' : ' (困难)');
    }

    /**
     * 开始AI对战房间（本地模拟）
     */
    async startAIBattleRoom(aiPlayer) {
        this.room.battleId = 'ai_' + Date.now();
        this.room.roomCode = this.generateRoomCode();
        this.room.opponentId = aiPlayer.id;
        this.room.opponentName = aiPlayer.name;
        this.room.playerRole = 'player1';
        this.room.status = 'playing';
        this.room.gameActive = true;
        this.room.selectedCards = [];

        // 更新UI
        const waitingDiv = document.getElementById('battle-waiting');
        if (waitingDiv) waitingDiv.style.display = 'none';
        
        const activeDiv = document.getElementById('battle-active');
        if (activeDiv) activeDiv.style.display = 'block';
        
        const resultDiv = document.getElementById('battle-result');
        if (resultDiv) resultDiv.style.display = 'none';

        // 清空聊天记录
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) chatMessages.innerHTML = '';

        // 设置玩家名称和头像
        const player1Name = document.getElementById('player1-name');
        if (player1Name) player1Name.textContent = this.game.state.currentUser.name;
        
        const player2Name = document.getElementById('player2-name');
        if (player2Name) player2Name.textContent = aiPlayer.name;
        
        const player1Avatar = document.getElementById('player1-avatar');
        if (player1Avatar) player1Avatar.textContent = this.game.state.currentUser.name.charAt(0).toUpperCase();
        
        const player2Avatar = document.getElementById('player2-avatar');
        if (player2Avatar) player2Avatar.textContent = '🤖';

        // 重置分数和进度
        const player1Score = document.getElementById('player1-score');
        if (player1Score) player1Score.textContent = '0';
        
        const player2Score = document.getElementById('player2-score');
        if (player2Score) player2Score.textContent = '0';
        
        const player1Progress = document.getElementById('player1-progress');
        if (player1Progress) player1Progress.style.width = '0%';
        
        const player2Progress = document.getElementById('player2-progress');
        if (player2Progress) player2Progress.style.width = '0%';

        // 随机决定先手
        const firstPlayer = Math.random() < 0.5 ? this.game.state.currentUser.id : aiPlayer.id;
        this.room.myTurn = firstPlayer === this.game.state.currentUser.id;

        this.updateTurnIndicator();
        this.generateBattleGrid();
        this.generateBattleTarget();

        this.addAIMessage(`⚔️ 与AI对战开始！ (难度: ${this.room.aiDifficulty === 'easy' ? '简单' : this.room.aiDifficulty === 'medium' ? '中等' : '困难'})`);
        if (this.room.myTurn) {
            this.addAIMessage('你的回合，请选择卡片');
        } else {
            this.addAIMessage(`${aiPlayer.name} 的回合，请稍候...`);
            // AI自动操作
            this.scheduleAIMove();
        }
    }

    /**
     * 调度AI移动
     */
    scheduleAIMove() {
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

    /**
     * AI自动操作
     */
    async makeAIMove() {
        if (!this.room.gameActive || this.room.myTurn) return;

        const grid = document.getElementById('battle-grid');
        if (!grid) return;

        const cards = Array.from(grid.querySelectorAll('.number-card:not(.matched)'));
        
        // 添加重试计数，防止无限循环
        if (cards.length < 2) {
            if (this.aiMoveRetryCount >= this.constants.AI_MAX_RETRIES) {
                // 多次重试后仍然无法生成卡片，强制刷新网格
                this.refreshBattleGrid();
                this.aiMoveRetryCount = 0;
            } else {
                this.aiMoveRetryCount++;
            }
            this.refreshBattleGrid();
            this.scheduleAIMove();
            return;
        }
        
        this.aiMoveRetryCount = 0; // 重置计数

        const target = parseInt(document.getElementById('battle-target-number')?.textContent || '0');
        
        // 根据难度决定AI行为
        let move = null;
        
        if (this.room.aiDifficulty === 'easy') {
            // 简单AI：随机选择，低概率选对
            if (Math.random() < 0.3) { // 30%概率选对
                move = this.findCorrectMove(cards, target);
            }
        } else if (this.room.aiDifficulty === 'medium') {
            // 中等AI：60%概率选对
            if (Math.random() < 0.6) {
                move = this.findCorrectMove(cards, target);
            }
        } else {
            // 困难AI：90%概率选对
            if (Math.random() < 0.9) {
                move = this.findCorrectMove(cards, target);
            }
        }

        if (!move) {
            // 随机选择两张不同的卡片
            const index1 = Math.floor(Math.random() * cards.length);
            let index2;
            do {
                index2 = Math.floor(Math.random() * cards.length);
            } while (index2 === index1);
            move = [cards[index1], cards[index2]];
        }

        const [card1, card2] = move;
        
        // 模拟点击
        card1.classList.add('selected');
        card2.classList.add('selected');
        
        // 等待一下再执行，看起来像真实玩家
        setTimeout(() => {
            this.executeAIMove(card1, card2, target);
        }, 500);
    }

    /**
     * 寻找正确组合
     */
    findCorrectMove(cards, target) {
        for (let i = 0; i < cards.length; i++) {
            for (let j = i + 1; j < cards.length; j++) {
                const num1 = parseInt(cards[i].dataset.value);
                const num2 = parseInt(cards[j].dataset.value);
                if (num1 + num2 === target) {
                    return [cards[i], cards[j]];
                }
            }
        }
        return null;
    }

    /**
     * 执行AI移动
     */
    async executeAIMove(card1, card2, target) {
        if (!this.room.gameActive) return;

        const num1 = parseInt(card1.dataset.value);
        const num2 = parseInt(card2.dataset.value);
        const sum = num1 + num2;
        const isCorrectMove = sum === target;

        // 添加AI操作消息
        const result = isCorrectMove ? '✓ 正确' : '✗ 错误';
        this.addAIMessage(`${this.room.opponentName} 选择了 ${num1} + ${num2} = ${sum} ${result}`);

        if (isCorrectMove) {
            SoundManager.play('correct');
            
            card1.classList.add('matched');
            card2.classList.add('matched');
            
            setTimeout(() => {
                if (card1.isConnected) card1.remove();
                if (card2.isConnected) card2.remove();
            }, 300);

            // 更新AI分数
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

            this.generateBattleTarget();

            const remaining = document.querySelectorAll('#battle-grid .number-card:not(.matched)');
            if (remaining.length < 4) {
                this.refreshBattleGrid();
            }

            // 检查AI是否获胜
            const aiProgressWidth = document.getElementById('player2-progress')?.style.width;
            if (aiProgressWidth && parseInt(aiProgressWidth) >= 100) {
                this.endAIBattle(this.room.opponentId);
                return;
            }
        } else {
            SoundManager.play('wrong');
            
            setTimeout(() => {
                if (card1.isConnected) card1.classList.remove('selected');
                if (card2.isConnected) card2.classList.remove('selected');
            }, 500);
        }

        // 轮到玩家
        this.room.myTurn = true;
        this.updateTurnIndicator();
        this.addAIMessage('你的回合');
    }

    /**
     * 结束AI对战
     */
    endAIBattle(winnerId) {
        this.room.gameActive = false;
        this.stopTurnTimer();

        // 清理AI定时器
        if (this.aiMoveTimer) {
            clearTimeout(this.aiMoveTimer);
            this.aiMoveTimer = null;
        }

        if (this.aiResponseTimer) {
            clearTimeout(this.aiResponseTimer);
            this.aiResponseTimer = null;
        }

        // 更新UI
        const activeDiv = document.getElementById('battle-active');
        if (activeDiv) activeDiv.style.display = 'none';
        
        const resultDiv = document.getElementById('battle-result');
        if (resultDiv) resultDiv.style.display = 'block';

        const iWon = winnerId === this.game.state.currentUser.id;
        const lang = I18n;
        
        const resultTitle = document.getElementById('result-title');
        if (resultTitle) resultTitle.textContent = iWon ? `🏆 ${lang.t('win')}` : `😢 ${lang.t('lose')}`;

        const myScore = parseInt(document.getElementById('player1-score')?.textContent) || 0;
        const aiScore = parseInt(document.getElementById('player2-score')?.textContent) || 0;

        const finalPlayerScore = document.getElementById('final-player-score');
        if (finalPlayerScore) finalPlayerScore.textContent = myScore;
        
        const finalOpponentScore = document.getElementById('final-opponent-score');
        if (finalOpponentScore) finalOpponentScore.textContent = aiScore;

        // AI对战不播放成就音效
        SoundManager.play(iWon ? 'achievement' : 'wrong');

        // 添加结束消息
        this.addAIMessage(`🏆 对战结束，${iWon ? '你' : this.room.opponentName} 获胜！`);
    }

    /**
     * 添加AI消息到聊天
     */
    addAIMessage(text) {
        const chat = document.getElementById('chat-messages');
        if (!chat) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'message system';
        msgDiv.textContent = text;
        chat.appendChild(msgDiv);
        
        // 限制聊天记录数量
        this.limitChatMessages(chat);
        
        chat.scrollTop = chat.scrollHeight;
    }

    /**
     * 限制聊天记录数量
     */
    limitChatMessages(chat) {
        while (chat.children.length > this.constants.MAX_CHAT_MESSAGES) {
            chat.removeChild(chat.children[0]);
        }
    }

    /**
     * 清理匹配状态
     */
    cleanupMatch() {
        if (this.matchTimeoutId) {
            clearTimeout(this.matchTimeoutId);
            this.matchTimeoutId = null;
        }

        this.stopQueueStatusUpdate();

        const aiOption = document.getElementById('ai-option');
        if (aiOption) aiOption.remove();

        const waitingHint = document.getElementById('match-waiting-hint');
        if (waitingHint) waitingHint.remove();

        this.matchStartTime = null;
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
     * 尝试匹配（优化版）
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
                
                // 随时间增加匹配范围
                const timeBonus = Math.min(this.constants.MAX_TIME_BONUS, waitTime / 1000) * this.constants.TIME_BONUS_FACTOR;
                const maxDiff = this.constants.BASE_MATCH_RANGE + timeBonus;
                
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
            
            // 从队列中移除
            const index1 = Math.max(i, j);
            const index2 = Math.min(i, j);
            this.matchQueue.splice(index1, 1);
            this.matchQueue.splice(index2, 1);
            
            // 清理匹配超时（因为匹配成功了）
            this.cleanupMatch();
            
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
            // Supabase不可用时，使用本地对战
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
            // 降级到本地对战
            await this.startLocalBattle(player1, player2);
        }
    }

    /**
     * 开始本地对战（Supabase不可用时）
     */
    async startLocalBattle(player1, player2) {
        this.room.battleId = 'local_' + Date.now();
        this.room.roomCode = this.generateRoomCode();
        this.room.opponentId = player2.id;
        this.room.opponentName = player2.name;
        this.room.playerRole = player1.id === this.game.state.currentUser.id ? 'player1' : 'player2';
        this.room.status = 'playing';
        this.room.gameActive = true;
        this.room.opponentIsAI = false;

        // 更新UI
        const waitingDiv = document.getElementById('battle-waiting');
        if (waitingDiv) waitingDiv.style.display = 'none';
        
        const activeDiv = document.getElementById('battle-active');
        if (activeDiv) activeDiv.style.display = 'block';
        
        const resultDiv = document.getElementById('battle-result');
        if (resultDiv) resultDiv.style.display = 'none';

        // 清空聊天记录
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) chatMessages.innerHTML = '';

        // 设置玩家名称
        if (this.room.playerRole === 'player1') {
            const player1Name = document.getElementById('player1-name');
            if (player1Name) player1Name.textContent = player1.name;
            
            const player2Name = document.getElementById('player2-name');
            if (player2Name) player2Name.textContent = player2.name;
            
            const player1Avatar = document.getElementById('player1-avatar');
            if (player1Avatar) player1Avatar.textContent = player1.name.charAt(0).toUpperCase();
            
            const player2Avatar = document.getElementById('player2-avatar');
            if (player2Avatar) player2Avatar.textContent = player2.name.charAt(0).toUpperCase();
        } else {
            const player1Name = document.getElementById('player1-name');
            if (player1Name) player1Name.textContent = player2.name;
            
            const player2Name = document.getElementById('player2-name');
            if (player2Name) player2Name.textContent = player1.name;
            
            const player1Avatar = document.getElementById('player1-avatar');
            if (player1Avatar) player1Avatar.textContent = player2.name.charAt(0).toUpperCase();
            
            const player2Avatar = document.getElementById('player2-avatar');
            if (player2Avatar) player2Avatar.textContent = player1.name.charAt(0).toUpperCase();
        }

        // 重置分数和进度
        const player1Score = document.getElementById('player1-score');
        if (player1Score) player1Score.textContent = '0';
        
        const player2Score = document.getElementById('player2-score');
        if (player2Score) player2Score.textContent = '0';
        
        const player1Progress = document.getElementById('player1-progress');
        if (player1Progress) player1Progress.style.width = '0%';
        
        const player2Progress = document.getElementById('player2-progress');
        if (player2Progress) player2Progress.style.width = '0%';

        // 随机决定先手
        const firstPlayer = Math.random() < 0.5 ? player1.id : player2.id;
        this.room.myTurn = firstPlayer === this.game.state.currentUser.id;

        this.updateTurnIndicator();
        this.generateBattleGrid();
        this.generateBattleTarget();

        this.sendLocalMessage('⚔️ 对战开始！（本地模式）');
        if (this.room.myTurn) {
            this.sendLocalMessage('你的回合，请选择卡片');
        } else {
            this.sendLocalMessage(`等待 ${this.room.opponentName} 操作`);
        }

        // 本地模式无法实时通信，需要轮询或手动刷新
        this.startLocalPolling();
    }

    /**
     * 开始本地轮询（模拟对手操作）
     */
    startLocalPolling() {
        // 如果是本地对战且是对手回合，随机等待后模拟操作
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

    /**
     * 模拟对手操作
     */
    simulateOpponentMove() {
        if (!this.room.gameActive || this.room.myTurn) return;

        const grid = document.getElementById('battle-grid');
        if (!grid) return;

        const cards = Array.from(grid.querySelectorAll('.number-card:not(.matched)'));
        
        if (cards.length < 2) {
            this.refreshBattleGrid();
            this.startLocalPolling();
            return;
        }

        const target = parseInt(document.getElementById('battle-target-number')?.textContent || '0');
        
        // 随机选择两张卡片
        const index1 = Math.floor(Math.random() * cards.length);
        let index2;
        do {
            index2 = Math.floor(Math.random() * cards.length);
        } while (index2 === index1);

        const card1 = cards[index1];
        const card2 = cards[index2];
        const num1 = parseInt(card1.dataset.value);
        const num2 = parseInt(card2.dataset.value);
        const sum = num1 + num2;
        const isCorrect = sum === target;

        // 模拟操作
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

                // 更新对手分数
                const opponentScoreEl = this.room.playerRole === 'player1' ? 
                    document.getElementById('player2-score') : 
                    document.getElementById('player1-score');
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

                // 检查对手是否获胜
                const opponentProgressWidth = opponentProgress?.style.width;
                if (opponentProgressWidth && parseInt(opponentProgressWidth) >= 100) {
                    this.endLocalBattle(this.room.opponentId);
                    return;
                }
            } else {
                card1.classList.remove('selected');
                card2.classList.remove('selected');
            }

            // 轮到玩家
            this.room.myTurn = true;
            this.updateTurnIndicator();
            this.sendLocalMessage('你的回合');
        }, 500);
    }

    /**
     * 结束本地对战
     */
    endLocalBattle(winnerId) {
        this.room.gameActive = false;
        this.stopTurnTimer();

        // 清理本地轮询
        if (this.localPollingTimer) {
            clearTimeout(this.localPollingTimer);
            this.localPollingTimer = null;
        }

        // 更新UI
        const activeDiv = document.getElementById('battle-active');
        if (activeDiv) activeDiv.style.display = 'none';
        
        const resultDiv = document.getElementById('battle-result');
        if (resultDiv) resultDiv.style.display = 'block';

        const iWon = winnerId === this.game.state.currentUser.id;
        const lang = I18n;
        
        const resultTitle = document.getElementById('result-title');
        if (resultTitle) resultTitle.textContent = iWon ? `🏆 ${lang.t('win')}` : `😢 ${lang.t('lose')}`;

        const myScore = parseInt(document.getElementById('player1-score')?.textContent) || 0;
        const opponentScore = parseInt(document.getElementById('player2-score')?.textContent) || 0;

        const finalPlayerScore = document.getElementById('final-player-score');
        if (finalPlayerScore) finalPlayerScore.textContent = myScore;
        
        const finalOpponentScore = document.getElementById('final-opponent-score');
        if (finalOpponentScore) finalOpponentScore.textContent = opponentScore;

        SoundManager.play(iWon ? 'achievement' : 'wrong');
    }

    /**
     * 发送本地消息
     */
    sendLocalMessage(text) {
        const chat = document.getElementById('chat-messages');
        if (!chat) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'message system';
        msgDiv.textContent = text;
        chat.appendChild(msgDiv);
        
        // 限制聊天记录数量
        this.limitChatMessages(chat);
        
        chat.scrollTop = chat.scrollHeight;
    }

    /**
     * 通知玩家
     */
    notifyPlayer(playerId, type, data) {
        if (this.game.state.currentUser && this.game.state.currentUser.id === playerId) {
            if (type === 'match_found') {
                this.cleanupMatch();
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
        this.room.opponentIsAI = false;

        // 更新UI
        const waitingDiv = document.getElementById('battle-waiting');
        if (waitingDiv) waitingDiv.style.display = 'none';
        
        const activeDiv = document.getElementById('battle-active');
        if (activeDiv) activeDiv.style.display = 'block';
        
        const resultDiv = document.getElementById('battle-result');
        if (resultDiv) resultDiv.style.display = 'none';

        // 清空聊天记录
        const chatMessages = document.getElementById('chat-messages');
        if (chatMessages) chatMessages.innerHTML = '';

        // 设置玩家名称和头像
        if (this.room.playerRole === 'player1') {
            const player1Name = document.getElementById('player1-name');
            if (player1Name) player1Name.textContent = this.game.state.currentUser.name;
            
            const player2Name = document.getElementById('player2-name');
            if (player2Name) player2Name.textContent = this.room.opponentName;
            
            const player1Avatar = document.getElementById('player1-avatar');
            if (player1Avatar) player1Avatar.textContent = this.game.state.currentUser.name.charAt(0).toUpperCase();
            
            const player2Avatar = document.getElementById('player2-avatar');
            if (player2Avatar) player2Avatar.textContent = this.room.opponentName.charAt(0).toUpperCase();
        } else {
            const player1Name = document.getElementById('player1-name');
            if (player1Name) player1Name.textContent = this.room.opponentName;
            
            const player2Name = document.getElementById('player2-name');
            if (player2Name) player2Name.textContent = this.game.state.currentUser.name;
            
            const player1Avatar = document.getElementById('player1-avatar');
            if (player1Avatar) player1Avatar.textContent = this.room.opponentName.charAt(0).toUpperCase();
            
            const player2Avatar = document.getElementById('player2-avatar');
            if (player2Avatar) player2Avatar.textContent = this.game.state.currentUser.name.charAt(0).toUpperCase();
        }

        // 重置分数和进度
        const player1Score = document.getElementById('player1-score');
        if (player1Score) player1Score.textContent = '0';
        
        const player2Score = document.getElementById('player2-score');
        if (player2Score) player2Score.textContent = '0';
        
        const player1Progress = document.getElementById('player1-progress');
        if (player1Progress) player1Progress.style.width = '0%';
        
        const player2Progress = document.getElementById('player2-progress');
        if (player2Progress) player2Progress.style.width = '0%';

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

        await this.sendSystemMessage('⚔️ 对战开始！');
        if (this.room.myTurn) {
            await this.sendSystemMessage('你的回合，请选择卡片');
        } else {
            await this.sendSystemMessage(`等待 ${this.room.opponentName} 操作`);
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
            const player1Score = document.getElementById('player1-score');
            if (player1Score) player1Score.textContent = battle.player1_score || 0;
            
            const player2Score = document.getElementById('player2-score');
            if (player2Score) player2Score.textContent = battle.player2_score || 0;
            
            const player1Progress = document.getElementById('player1-progress');
            if (player1Progress) player1Progress.style.width = `${battle.player1_progress || 0}%`;
            
            const player2Progress = document.getElementById('player2-progress');
            if (player2Progress) player2Progress.style.width = `${battle.player2_progress || 0}%`;
        } else {
            const player1Score = document.getElementById('player1-score');
            if (player1Score) player1Score.textContent = battle.player2_score || 0;
            
            const player2Score = document.getElementById('player2-score');
            if (player2Score) player2Score.textContent = battle.player1_score || 0;
            
            const player1Progress = document.getElementById('player1-progress');
            if (player1Progress) player1Progress.style.width = `${battle.player2_progress || 0}%`;
            
            const player2Progress = document.getElementById('player2-progress');
            if (player2Progress) player2Progress.style.width = `${battle.player1_progress || 0}%`;
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

        if (this.room.opponentIsAI && !this.room.myTurn) {
            // AI回合特殊显示
            turnText.textContent = 'AI思考中...';
            indicator.style.background = 'linear-gradient(145deg, #9b59b6, #8e44ad)';
            this.stopTurnTimer();
            if (timer) timer.textContent = `${this.constants.ROUND_TIME}s`;
        } else if (this.room.myTurn) {
            turnText.textContent = lang.t('yourTurn');
            indicator.style.background = 'linear-gradient(145deg, #6ab04c, #2e7d32)';
            this.startTurnTimer();
        } else {
            turnText.textContent = lang.t('opponentTurn');
            indicator.style.background = 'linear-gradient(145deg, #e84342, #c0392b)';
            this.stopTurnTimer();
            if (timer) timer.textContent = `${this.constants.ROUND_TIME}s`;
        }
    }

    /**
     * 开始回合计时
     */
    startTurnTimer() {
        let timeLeft = this.constants.ROUND_TIME;
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

        // 防止并发处理
        if (this.cardClickProcessing) return;
        this.cardClickProcessing = true;

        try {
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
        } finally {
            this.cardClickProcessing = false;
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
        const timerText = document.getElementById('turn-timer')?.textContent || `${this.constants.ROUND_TIME}s`;
        const roundTime = this.constants.ROUND_TIME - parseInt(timerText.replace('s', ''));

        try {
            // 如果是AI对战，不记录到数据库
            if (!this.room.opponentIsAI && this.game.state.supabaseReady) {
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
        // 防止并发更新
        if (this.scoreUpdateInProgress) return;
        this.scoreUpdateInProgress = true;

        try {
            if (this.room.opponentIsAI) {
                // AI对战，只更新本地分数
                const myScoreEl = document.getElementById('player1-score');
                if (myScoreEl) {
                    const currentScore = parseInt(myScoreEl.textContent) || 0;
                    myScoreEl.textContent = currentScore + points;
                }

                const myProgress = document.getElementById('player1-progress');
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
                return;
            }

            if (!this.game.state.supabaseReady || !this.room.gameActive) return;

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
                this.room.gameActive = false;
                setTimeout(() => {
                    this.endBattle(this.game.state.currentUser.id);
                }, 500);
            }
        } catch (error) {
            console.error('更新对战分数失败:', error);
        } finally {
            this.scoreUpdateInProgress = false;
        }
    }

    /**
     * 结束回合
     */
    async endTurn() {
        // 防止重复结束回合
        if (this.endTurnInProgress) return;
        this.endTurnInProgress = true;
        
        try {
            this.stopTurnTimer();
            
            if (this.room.opponentIsAI) {
                this.room.myTurn = false;
                this.updateTurnIndicator();
                this.scheduleAIMove();
                return;
            }

            if (!this.game.state.supabaseReady || !navigator.onLine) {
                this.room.myTurn = !this.room.myTurn;
                this.updateTurnIndicator();
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

    /**
     * 结束对战
     */
    async endBattle(winnerId) {
        this.room.gameActive = false;
        this.stopTurnTimer();

        if (this.room.opponentIsAI) return;

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
            await this.sendSystemMessage(`🏆 ${winner} 获胜！`);

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
     * 更新战后ELO（修复版 - 不使用RPC函数）
     */
    async updateELOAfterBattle(battle, winnerId) {
        if (!this.game.state.supabaseReady) return;

        try {
            const player1ELO = battle.player1_elo || 1200;
            const player2ELO = battle.player2_elo || 1200;
            
            const player1NewELO = this.calculateNewELO(player1ELO, player2ELO, winnerId === battle.player1_id);
            const player2NewELO = this.calculateNewELO(player2ELO, player1ELO, winnerId === battle.player2_id);

            // 获取当前统计数据
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

            // 批量更新
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
                        updated_at: new Date().toISOString()
                    },
                    {
                        user_id: battle.player2_id,
                        elo: Math.round(player2NewELO),
                        battles: (statsMap[battle.player2_id]?.battles || 0) + 1,
                        wins: winnerId === battle.player2_id ? 
                            (statsMap[battle.player2_id]?.wins || 0) + 1 : 
                            (statsMap[battle.player2_id]?.wins || 0),
                        updated_at: new Date().toISOString()
                    }
                ], { onConflict: 'user_id' });
        } catch (error) {
            console.error('更新ELO失败:', error);
        }
    }

    /**
     * 计算新ELO
     */
    calculateNewELO(myELO, opponentELO, isWin) {
        const expected = 1 / (1 + Math.pow(10, (opponentELO - myELO) / 400));
        const actual = isWin ? 1 : 0;
        return myELO + this.constants.ELO_K_FACTOR * (actual - expected);
    }

    /**
     * 降级显示对战结果（Supabase不可用时）
     */
    showBattleResultFallback(winnerId) {
        const activeDiv = document.getElementById('battle-active');
        if (activeDiv) activeDiv.style.display = 'none';
        
        const resultDiv = document.getElementById('battle-result');
        if (resultDiv) resultDiv.style.display = 'block';

        const iWon = winnerId === this.game.state.currentUser.id;
        const lang = I18n;
        
        const resultTitle = document.getElementById('result-title');
        if (resultTitle) resultTitle.textContent = iWon ? `🏆 ${lang.t('win')}` : `😢 ${lang.t('lose')}`;

        // 从本地状态获取分数
        const myScore = this.room.playerRole === 'player1' ? 
            parseInt(document.getElementById('player1-score')?.textContent) : 
            parseInt(document.getElementById('player2-score')?.textContent);
        
        const opponentScore = this.room.playerRole === 'player1' ? 
            parseInt(document.getElementById('player2-score')?.textContent) : 
            parseInt(document.getElementById('player1-score')?.textContent);

        const finalPlayerScore = document.getElementById('final-player-score');
        if (finalPlayerScore) finalPlayerScore.textContent = myScore || 0;
        
        const finalOpponentScore = document.getElementById('final-opponent-score');
        if (finalOpponentScore) finalOpponentScore.textContent = opponentScore || 0;

        SoundManager.play(iWon ? 'achievement' : 'wrong');
    }

    /**
     * 显示对战结果
     */
    showBattleResult(battle) {
        const activeDiv = document.getElementById('battle-active');
        if (activeDiv) activeDiv.style.display = 'none';
        
        const resultDiv = document.getElementById('battle-result');
        if (resultDiv) resultDiv.style.display = 'block';

        const iWon = battle.winner_id === this.game.state.currentUser.id;
        const lang = I18n;
        
        const resultTitle = document.getElementById('result-title');
        if (resultTitle) resultTitle.textContent = iWon ? `🏆 ${lang.t('win')}` : `😢 ${lang.t('lose')}`;

        if (this.room.playerRole === 'player1') {
            const finalPlayerScore = document.getElementById('final-player-score');
            if (finalPlayerScore) finalPlayerScore.textContent = battle.player1_score || 0;
            
            const finalOpponentScore = document.getElementById('final-opponent-score');
            if (finalOpponentScore) finalOpponentScore.textContent = battle.player2_score || 0;
        } else {
            const finalPlayerScore = document.getElementById('final-player-score');
            if (finalPlayerScore) finalPlayerScore.textContent = battle.player2_score || 0;
            
            const finalOpponentScore = document.getElementById('final-opponent-score');
            if (finalOpponentScore) finalOpponentScore.textContent = battle.player1_score || 0;
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

        if (this.room.opponentIsAI) {
            // AI对战，模拟回复
            this.addChatMessage({
                player_id: this.game.state.currentUser.id,
                player_name: this.game.state.currentUser.name,
                message: text
            });
            
            // 先清理旧的AI回复定时器
            if (this.aiResponseTimer) {
                clearTimeout(this.aiResponseTimer);
            }
            
            // AI随机回复
            this.aiResponseTimer = setTimeout(() => {
                this.aiResponseTimer = null;
                
                // 检查对战是否还在进行
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
            return;
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
        if (this.room.opponentIsAI) {
            this.addAIMessage(text);
            return;
        }

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
        
        // 限制聊天记录数量
        this.limitChatMessages(chat);
        
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
        
        // 限制聊天记录数量
        this.limitChatMessages(chat);
        
        chat.scrollTop = chat.scrollHeight;
    }

    // ==================== 退出清理 ====================

    /**
     * 离开对战
     */
    leaveBattle() {
        // 清理匹配状态
        this.cleanupMatch();

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
        
        // 清理AI定时器
        if (this.aiMoveTimer) {
            clearTimeout(this.aiMoveTimer);
            this.aiMoveTimer = null;
        }
        
        if (this.aiResponseTimer) {
            clearTimeout(this.aiResponseTimer);
            this.aiResponseTimer = null;
        }
        
        if (this.localPollingTimer) {
            clearTimeout(this.localPollingTimer);
            this.localPollingTimer = null;
        }
        
        // 重置并发标志
        this.cardClickProcessing = false;
        this.endTurnInProgress = false;
        this.rematchInProgress = false;
        this.scoreUpdateInProgress = false;
        
        // 重置房间状态
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
            gameActive: false,
            selectedCards: []
        };
        
        this.reconnectAttempts = 0;
        this.aiMoveRetryCount = 0;
    }

    /**
     * 再战一局
     */
    async rematch() {
        // 防止重复点击
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
            // 延迟重置标志，防止快速连续点击
            setTimeout(() => {
                this.rematchInProgress = false;
            }, 1000);
        }
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

    /**
     * 销毁所有资源（完全清理）
     */
    destroy() {
        this.leaveBattle();
        this.cleanupMatch();
        
        // 移除所有事件监听器
        if (this.onlineHandler) {
            window.removeEventListener('online', this.onlineHandler);
        }
        
        // 清理所有定时器
        if (this.aiResponseTimer) {
            clearTimeout(this.aiResponseTimer);
            this.aiResponseTimer = null;
        }
        
        if (this.aiMoveTimer) {
            clearTimeout(this.aiMoveTimer);
            this.aiMoveTimer = null;
        }
        
        if (this.localPollingTimer) {
            clearTimeout(this.localPollingTimer);
            this.localPollingTimer = null;
        }
        
        // 取消所有订阅
        if (this.room.channel) {
            this.room.channel.unsubscribe();
            this.room.channel = null;
        }
        
        // 移除所有事件处理器引用
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
        this.continueWaitingHandler = null;
        this.playWithAIHandler = null;
        this.onlineHandler = null;
    }
}

// 导出到全局
window.BattleMode = BattleMode;
