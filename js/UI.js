/**
 * ==================== 糖果数学消消乐 - UI管理 ====================
 * 包含：界面渲染、语言切换、模态框管理、反馈消息、新手引导（多语言支持）
 * 依赖：utils.js (需要 I18n, SoundManager, Formatters)
 * ============================================================
 */

class UIManager {
    constructor(game) {
        this.game = game;
        this.feedbackTimer = null;
        this.highlightTimer = null;
        this.colorIndex = 0;
        this.tutorialStep = 1;
        this.totalSteps = 3;
        this.eventListenersInitialized = false;
        this.tutorialInitialized = false;
        this.destroyed = false;
        
        // 所有事件处理器引用
        this.langSwitchHandler = null;
        this.clickHandler = null;
        this.soundToggleHandler = null;
        this.dontShowHandler = null;
        this.langSwitchTimeout = null;
        this.tutorialObserver = null;
        this.prevStepHandler = null;
        this.nextStepHandler = null;
        this.volumeInputHandler = null;
    }

    // ==================== 初始化 ====================

    /**
     * 初始化UI相关功能
     */
    init() {
        if (this.destroyed) return;
        this.updateLanguage();
        this.setupSoundControls();
        this.initTutorial();
    }

    // ==================== 语言切换 ====================

    /**
     * 切换语言
     */
    toggleLanguage() {
        if (this.destroyed) return;
        
        const newLang = I18n.getLang() === 'zh' ? 'en' : 'zh';
        I18n.setLang(newLang);
        this.game.state.currentLang = newLang;
        this.updateLanguage();
    }

    /**
     * 更新界面语言
     */
    updateLanguage() {
        if (this.destroyed) return;
        
        const lang = I18n;

        // 语言切换按钮
        const langIcon = document.getElementById('lang-icon');
        if (langIcon) langIcon.textContent = lang.t('langIcon');
        const langText = document.getElementById('lang-text');
        if (langText) langText.textContent = lang.t('langName');

        // 游戏标题
        const gameTitle = document.getElementById('game-title');
        if (gameTitle) gameTitle.textContent = lang.t('gameTitle');

        // 模式按钮
        document.querySelectorAll('.mode-btn').forEach(btn => {
            const mode = btn.dataset.mode;
            const textSpan = btn.querySelector('.mode-text');
            if (textSpan) {
                if (mode === 'challenge') textSpan.textContent = lang.t('modeChallenge');
                else if (mode === 'standard') textSpan.textContent = lang.t('modeStandard');
                else if (mode === 'practice') textSpan.textContent = lang.t('modePractice');
            }
        });

        // 难度按钮
        document.querySelectorAll('.difficulty-btn').forEach(btn => {
            const difficulty = btn.dataset.difficulty;
            const textSpan = btn.querySelector('.difficulty-text');
            if (textSpan) {
                if (difficulty === 'easy') textSpan.textContent = lang.t('difficultyEasy');
                else if (difficulty === 'medium') textSpan.textContent = lang.t('difficultyMedium');
                else if (difficulty === 'hard') textSpan.textContent = lang.t('difficultyHard');
            }
        });

        // 开始游戏按钮
        const startText = document.getElementById('start-text');
        if (startText) startText.textContent = lang.t('startGame');

        // 对战相关按钮
        const quickMatchBtn = document.getElementById('quick-match-btn');
        if (quickMatchBtn) {
            const textSpan = quickMatchBtn.querySelector('.btn-text');
            if (textSpan) textSpan.textContent = lang.t('quickMatch');
        }

        const tournamentBtn = document.getElementById('tournament-btn');
        if (tournamentBtn) {
            const textSpan = tournamentBtn.querySelector('.btn-text');
            if (textSpan) textSpan.textContent = lang.t('tournament');
        }

        const joinRoomBtn = document.getElementById('join-room-btn');
        if (joinRoomBtn) {
            const textSpan = joinRoomBtn.querySelector('.btn-text');
            if (textSpan) textSpan.textContent = lang.t('joinRoom');
        }

        // 统计标签
        const statScore = document.getElementById('stat-score');
        if (statScore) statScore.textContent = lang.t('statScore');
        const statCompleted = document.getElementById('stat-completed');
        if (statCompleted) statCompleted.textContent = lang.t('statCompleted');
        const statAccuracy = document.getElementById('stat-accuracy');
        if (statAccuracy) statAccuracy.textContent = lang.t('statAccuracy');
        const timeLabel = document.getElementById('time-label');
        if (timeLabel) {
            const mode = GAME_CONSTANTS.MODE_CONFIG[this.game.state.currentMode];
            timeLabel.textContent = mode.timeLimit ? lang.t('statTimeLeft') : lang.t('statTimeUsed');
        }
        const targetLabel = document.getElementById('target-label');
        if (targetLabel) targetLabel.textContent = lang.t('targetLabel');

        // 控制按钮
        document.querySelectorAll('.candy-btn .btn-text').forEach(btn => {
            const parent = btn.closest('.candy-btn');
            if (!parent) return;
            if (parent.id === 'hint-btn') btn.textContent = lang.t('hint');
            else if (parent.id === 'refresh-btn') btn.textContent = lang.t('refresh');
            else if (parent.id === 'pause-btn') {
                btn.textContent = this.game.state.isPaused ? lang.t('resume') : lang.t('pause');
            }
            else if (parent.id === 'endgame-btn') btn.textContent = lang.t('endGame');
            else if (parent.id === 'home-btn') btn.textContent = lang.t('home');
        });

        // 游戏结束弹窗
        const gameoverTitle = document.getElementById('gameover-title');
        if (gameoverTitle) gameoverTitle.textContent = lang.t('gameoverTitle');
        const finalScoreLabel = document.getElementById('final-score-label');
        if (finalScoreLabel) finalScoreLabel.textContent = lang.t('finalScore');
        const finalCompletedLabel = document.getElementById('final-completed-label');
        if (finalCompletedLabel) finalCompletedLabel.textContent = lang.t('finalCompleted');
        const finalAccuracyLabel = document.getElementById('final-accuracy-label');
        if (finalAccuracyLabel) finalAccuracyLabel.textContent = lang.t('finalAccuracy');
        const playAgainText = document.getElementById('play-again-text');
        if (playAgainText) playAgainText.textContent = lang.t('playAgain');
        const homeText = document.getElementById('home-text');
        if (homeText) homeText.textContent = lang.t('home');
        const exportText = document.getElementById('export-text');
        if (exportText) exportText.textContent = lang.t('exportData');

        // 更新用户UI
        this.updateUserUI();

        // 更新完成数量显示
        this.updateModeDisplay();
        
        // 更新引导内容
        this.updateTutorialContent();

        // ========== 新增：登录/注册模态框 ==========
        const authTitle = document.getElementById('auth-title');
        if (authTitle) authTitle.textContent = lang.t('authTitle');
        
        const authEmail = document.getElementById('auth-email');
        if (authEmail) authEmail.placeholder = lang.t('emailPlaceholder');
        
        const authPassword = document.getElementById('auth-password');
        if (authPassword) authPassword.placeholder = lang.t('passwordPlaceholder');
        
        const authSubmit = document.getElementById('auth-submit');
        if (authSubmit) authSubmit.textContent = lang.t('submit');
        
        const authSwitch = document.getElementById('auth-switch');
        if (authSwitch) {
            const isLogin = this.game.auth?.authMode === 'login';
            authSwitch.innerHTML = isLogin ? 
                lang.t('noAccount') : 
                lang.t('hasAccount');
        }

        // ========== 新增：加入房间模态框 ==========
        const joinTitle = document.querySelector('#join-modal h3');
        if (joinTitle) joinTitle.textContent = lang.t('joinRoom');
        
        const joinInput = document.getElementById('room-code-input');
        if (joinInput) joinInput.placeholder = lang.t('enterRoomCode');
        
        const confirmJoin = document.getElementById('confirm-join');
        if (confirmJoin) {
            confirmJoin.textContent = lang.t('join');
            // 确保保留 primary 类
            confirmJoin.classList.add('candy-btn', 'primary');
        }
        
        const cancelJoin = document.getElementById('cancel-join');
        if (cancelJoin) {
            cancelJoin.textContent = lang.t('cancel');
            cancelJoin.classList.add('candy-btn');
        }

        // ========== 新增：锦标赛大厅 ==========
        const tournamentTabs = document.querySelectorAll('.tournament-tabs .tab-btn');
        if (tournamentTabs.length >= 4) {
            // 大厅
            const lobbySpan = tournamentTabs[0].querySelector('span');
            if (lobbySpan) lobbySpan.textContent = lang.t('lobby');
            
            // 赛程表
            const bracketSpan = tournamentTabs[1].querySelector('span');
            if (bracketSpan) bracketSpan.textContent = lang.t('bracket');
            
            // 历史
            const historySpan = tournamentTabs[2].querySelector('span');
            if (historySpan) historySpan.textContent = lang.t('history');
            
            // 排名
            const rankingSpan = tournamentTabs[3].querySelector('span');
            if (rankingSpan) rankingSpan.textContent = lang.t('ranking');
        }
        
        const createTournamentBtn = document.getElementById('create-tournament-btn');
        if (createTournamentBtn) {
            createTournamentBtn.innerHTML = `➕ <span>${lang.t('createTournament')}</span>`;
        }

        // ========== 新增：创建锦标赛模态框 ==========
        const createTitle = document.querySelector('#create-tournament-modal h3');
        if (createTitle) createTitle.textContent = lang.t('createTournament');
        
        // 锦标赛名称
        const tournamentNameLabels = document.querySelectorAll('#create-tournament-modal label');
        if (tournamentNameLabels.length >= 1) {
            tournamentNameLabels[0].textContent = lang.t('tournamentName');
        }
        
        const tournamentNameInput = document.getElementById('tournament-name-input');
        if (tournamentNameInput) tournamentNameInput.placeholder = lang.t('enterTournamentName');
        
        // 参赛人数
        if (tournamentNameLabels.length >= 2) {
            tournamentNameLabels[1].textContent = lang.t('playerCount');
        }
        
        // 比赛模式
        if (tournamentNameLabels.length >= 3) {
            tournamentNameLabels[2].textContent = lang.t('gameMode');
        }
        
        // 难度
        if (tournamentNameLabels.length >= 4) {
            tournamentNameLabels[3].textContent = lang.t('difficulty');
        }
        
        // 报名费
        if (tournamentNameLabels.length >= 5) {
            tournamentNameLabels[4].textContent = lang.t('entryFee');
        }
        
        const entryFeeInput = document.getElementById('tournament-entry-fee');
        if (entryFeeInput) entryFeeInput.placeholder = lang.t('enterEntryFee');
        
        const confirmCreate = document.getElementById('confirm-create-tournament');
        if (confirmCreate) {
            confirmCreate.textContent = lang.t('create');
            confirmCreate.classList.add('candy-btn', 'primary');
        }
        
        const cancelCreate = document.getElementById('cancel-create-tournament');
        if (cancelCreate) {
            cancelCreate.textContent = lang.t('cancel');
            cancelCreate.classList.add('candy-btn');
        }

        // ========== 新增：对战模态框 ==========
        const battleWaitingTitle = document.querySelector('#battle-waiting h3');
        if (battleWaitingTitle) battleWaitingTitle.textContent = lang.t('findingOpponent');
        
        // 房间码标签
        const roomCodeDisplay = document.querySelector('.room-code-display');
        if (roomCodeDisplay) {
            const textNode = roomCodeDisplay.childNodes[0];
            if (textNode) {
                textNode.textContent = lang.t('roomCode') + ': ';
            }
        }
        
        const copyBtn = document.getElementById('copy-room-code');
        if (copyBtn) copyBtn.title = lang.t('copy');
        
        // 等待界面的玩家名称
        const playerSlots = document.querySelectorAll('.player-slot .player-name');
        if (playerSlots.length >= 2) {
            // 第一个是你
            if (playerSlots[0]) playerSlots[0].textContent = lang.t('you');
            // 第二个是等待中
            if (playerSlots[1]) playerSlots[1].textContent = lang.t('waiting');
        }
        
        const vsDivider = document.querySelector('.vs-divider');
        if (vsDivider) vsDivider.textContent = lang.t('vs');
        
        const cancelMatchBtn = document.getElementById('cancel-match');
        if (cancelMatchBtn) cancelMatchBtn.textContent = lang.t('cancel');
        
        // 对战界面的回合指示器
        const turnText = document.querySelector('.turn-text');
        if (turnText) {
            const myTurn = this.game?.battle?.room?.myTurn;
            turnText.textContent = myTurn ? lang.t('yourTurn') : lang.t('opponentTurn');
        }
        
        const chatInput = document.getElementById('chat-input');
        if (chatInput) chatInput.placeholder = lang.t('enterMessage');
        
        const sendBtn = document.getElementById('send-message');
        if (sendBtn) sendBtn.textContent = lang.t('send');
        
        const rematchBtn = document.getElementById('rematch-btn');
        if (rematchBtn) {
            const span = rematchBtn.querySelector('span');
            if (span) {
                span.textContent = lang.t('rematch');
            } else {
                rematchBtn.innerHTML = `🔄 <span>${lang.t('rematch')}</span>`;
            }
        }
        
        const closeBattleBtn = document.getElementById('close-battle-btn');
        if (closeBattleBtn) {
            const span = closeBattleBtn.querySelector('span');
            if (span) {
                span.textContent = lang.t('close');
            } else {
                closeBattleBtn.innerHTML = `<span>${lang.t('close')}</span>`;
            }
        }

        // ========== 新增：通用按钮 ==========
        const confirmBtns = document.querySelectorAll('.confirm-btn, #confirm-btn');
        confirmBtns.forEach(btn => {
            if (btn) btn.textContent = lang.t('confirm');
        });
        
        const backBtns = document.querySelectorAll('.back-btn, #back-btn');
        backBtns.forEach(btn => {
            if (btn) btn.textContent = lang.t('back');
        });
        
        const nextBtns = document.querySelectorAll('#next-step, .next-btn');
        nextBtns.forEach(btn => {
            if (btn && btn.id !== 'next-step') { // 避免覆盖引导的下一个按钮
                btn.textContent = lang.t('next');
            }
        });
        
        const prevBtns = document.querySelectorAll('#prev-step, .prev-btn');
        prevBtns.forEach(btn => {
            if (btn && btn.id !== 'prev-step') { // 避免覆盖引导的上一步按钮
                btn.textContent = lang.t('previous');
            }
        });
        
        const doneBtns = document.querySelectorAll('.done-btn, #done-btn');
        doneBtns.forEach(btn => {
            if (btn) btn.textContent = lang.t('done');
        });
    }

    /**
     * 更新模式相关的显示
     */
    updateModeDisplay() {
        if (this.destroyed) return;
        
        const mode = GAME_CONSTANTS.MODE_CONFIG[this.game.state.currentMode];
        const completedEl = document.getElementById('completed');

        if (completedEl) {
            if (mode.targetCount) {
                completedEl.textContent = `${this.game.state.completed}/${mode.targetCount}`;
            } else {
                completedEl.textContent = this.game.state.completed.toString();
            }
        }
    }

    // ==================== 用户UI ====================

    /**
     * 更新用户界面（登录状态）
     */
    updateUserUI() {
        if (this.destroyed) return;
        
        const userInfo = document.getElementById('user-info');
        const authButtons = document.getElementById('auth-buttons');
        const userName = document.getElementById('user-name');
        const userStatus = document.getElementById('user-status');
        const userAvatar = document.getElementById('user-avatar');
        const lang = I18n;

        if (!authButtons) return;

        // 清空认证按钮区域
        authButtons.innerHTML = '';

        if (this.game.state.currentUser) {
            // 已登录状态
            if (userInfo) userInfo.style.display = 'flex';

            const logoutBtn = document.createElement('button');
            logoutBtn.className = 'auth-btn logout';
            logoutBtn.id = 'logout-btn';
            logoutBtn.innerHTML = '🚪 ' + lang.t('logout');
            logoutBtn.addEventListener('click', () => {
                if (this.game.auth) {
                    this.game.auth.logout();
                }
            });
            authButtons.appendChild(logoutBtn);

            if (userName) userName.textContent = this.game.state.currentUser.name;
            if (userStatus) userStatus.textContent = this.game.state.isOnline ? '✨ ' + lang.t('onlineMode') : '📴 ' + lang.t('offlineMode');
            if (userAvatar) userAvatar.textContent = this.game.state.currentUser.name.charAt(0).toUpperCase();
        } else {
            // 未登录状态
            if (userInfo) userInfo.style.display = 'none';

            const loginBtn = document.createElement('button');
            loginBtn.className = 'auth-btn login';
            loginBtn.id = 'login-btn';
            loginBtn.innerHTML = '🔐 ' + lang.t('login');
            loginBtn.addEventListener('click', () => {
                if (this.game.auth) {
                    this.game.auth.showAuthModal('login');
                }
            });
            authButtons.appendChild(loginBtn);

            const registerBtn = document.createElement('button');
            registerBtn.className = 'auth-btn register';
            registerBtn.id = 'register-btn';
            registerBtn.innerHTML = '📝 ' + lang.t('register');
            registerBtn.addEventListener('click', () => {
                if (this.game.auth) {
                    this.game.auth.showAuthModal('register');
                }
            });
            authButtons.appendChild(registerBtn);
        }
    }

    // ==================== 反馈消息 ====================

    /**
     * 显示反馈消息
     */
    showFeedback(key, color) {
        if (this.destroyed) return;
        
        const fb = document.getElementById('feedback');
        if (!fb) return;

        const lang = I18n;

        if (this.feedbackTimer) {
            clearTimeout(this.feedbackTimer);
        }

        fb.textContent = lang.t(key) || key;
        fb.style.color = color;

        this.feedbackTimer = setTimeout(() => {
            if (!this.destroyed) {
                fb.textContent = '';
            }
            this.feedbackTimer = null;
        }, 1000);
    }

    // ==================== 模态框管理 ====================

    /**
     * 打开模态框
     */
    openModal(modalId) {
        if (this.destroyed) return;
        
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'flex';
    }

    /**
     * 关闭模态框
     */
    closeModal(modalId) {
        if (this.destroyed) return;
        
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'none';
    }

    // ==================== 游戏网格 ====================

    /**
     * 获取下一个颜色索引
     */
    getNextColor() {
        const colors = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
        const color = colors[this.colorIndex % colors.length];
        this.colorIndex = (this.colorIndex + 1) % colors.length;
        return color;
    }

    /**
     * 渲染游戏网格
     */
    renderGrid(numbers) {
        if (this.destroyed) return;
        
        const grid = document.getElementById('game-grid');
        if (!grid) return;

        grid.innerHTML = numbers.map(num => {
            const colorIndex = this.getNextColor();
            return `<div class="number-card" 
                          data-value="${num}" 
                          data-color="${colorIndex}"
                          tabindex="0"
                          role="button"
                          aria-label="数字 ${num}">${num}</div>`;
        }).join('');

        // 设置卡片点击状态
        if (this.game.state.gameActive && !this.game.state.isPaused) {
            document.querySelectorAll('.number-card').forEach(card => {
                if (card) {
                    card.style.pointerEvents = 'auto';
                }
            });
        }
    }

    /**
     * 更新目标显示
     */
    updateTarget(target) {
        if (this.destroyed) return;
        
        const targetSum = document.getElementById('target-sum');
        if (targetSum) targetSum.textContent = target;
    }

    /**
     * 更新统计显示
     */
    updateStats() {
        if (this.destroyed) return;
        
        const scoreEl = document.getElementById('score');
        if (scoreEl) scoreEl.textContent = this.game.state.score;

        this.updateModeDisplay();

        const accuracy = Formatters.calculateAccuracy(
            this.game.state.correct, 
            this.game.state.attempts
        );

        const accuracyEl = document.getElementById('accuracy');
        if (accuracyEl) accuracyEl.textContent = accuracy + '%';
    }

    /**
     * 更新时间显示
     */
    updateTime(time) {
        if (this.destroyed) return;
        
        const timeEl = document.getElementById('time');
        if (timeEl) timeEl.textContent = time;
    }

    /**
     * 高亮提示卡片
     */
    highlightHint(indices) {
        if (this.destroyed) return;
        
        // 清除之前的定时器
        if (this.highlightTimer) {
            clearTimeout(this.highlightTimer);
            this.highlightTimer = null;
        }
        
        try {
            const cards = document.querySelectorAll('.number-card:not(.matched)');
            if (indices && indices.length === 2 && cards[indices[0]] && cards[indices[1]]) {
                cards[indices[0]].style.animation = 'bounce 0.5s';
                cards[indices[1]].style.animation = 'bounce 0.5s';
                
                this.highlightTimer = setTimeout(() => {
                    if (!this.destroyed) {
                        // 重新获取卡片，确保元素仍然存在
                        const currentCards = document.querySelectorAll('.number-card:not(.matched)');
                        if (currentCards[indices[0]] && currentCards[indices[1]]) {
                            currentCards[indices[0]].style.animation = '';
                            currentCards[indices[1]].style.animation = '';
                        }
                    }
                    this.highlightTimer = null;
                }, 500);
            }
        } catch (error) {
            console.warn('高亮提示卡片时出错:', error);
        }
    }

    /**
     * 清除所有卡片的选中状态
     */
    clearSelected() {
        if (this.destroyed) return;
        
        try {
            document.querySelectorAll('.number-card.selected').forEach(c => {
                if (c) c.classList.remove('selected');
            });
        } catch (error) {
            console.warn('清除选中状态时出错:', error);
        }
    }

    /**
     * 设置卡片点击可用性
     */
    setCardsEnabled(enabled) {
        if (this.destroyed) return;
        
        try {
            document.querySelectorAll('.number-card').forEach(card => {
                if (card && !card.classList.contains('matched')) {
                    card.style.pointerEvents = enabled ? 'auto' : 'none';
                }
            });
        } catch (error) {
            console.warn('设置卡片状态时出错:', error);
        }
    }

    /**
     * 添加匹配动画
     */
    addMatchAnimation(card1, card2) {
        if (this.destroyed) return;
        
        try {
            if (card1) card1.classList.add('matched');
            if (card2) card2.classList.add('matched');
        } catch (error) {
            console.warn('添加匹配动画时出错:', error);
        }
    }

    /**
     * 移除卡片
     */
    removeCards(card1, card2) {
        if (this.destroyed) return;
        
        try {
            if (card1 && card1.parentNode) card1.remove();
            if (card2 && card2.parentNode) card2.remove();
        } catch (error) {
            console.warn('移除卡片时出错:', error);
        }
    }

    // ==================== 游戏结束 ====================

    /**
     * 显示游戏结束弹窗
     */
    showGameOver() {
        if (this.destroyed) return;
        
        const accuracy = Formatters.calculateAccuracy(
            this.game.state.correct, 
            this.game.state.attempts
        );

        const finalScore = document.getElementById('final-score');
        const finalCompleted = document.getElementById('final-completed');
        const finalAccuracy = document.getElementById('final-accuracy');

        if (finalScore) finalScore.textContent = this.game.state.score;
        if (finalCompleted) finalCompleted.textContent = this.game.state.completed;
        if (finalAccuracy) finalAccuracy.textContent = accuracy + '%';

        this.openModal('game-over-modal');
    }

    // ==================== 音效控制 ====================

    /**
     * 设置音效控制面板
     */
    setupSoundControls() {
        if (this.destroyed) return;
        
        // 避免重复初始化
        if (this.eventListenersInitialized) return;

        try {
            const soundToggle = document.getElementById('sound-toggle');
            if (soundToggle) {
                this.soundToggleHandler = () => {
                    try {
                        SoundManager.toggleMute();
                        const volumePanel = document.getElementById('sound-volume');
                        if (volumePanel) {
                            volumePanel.style.display = volumePanel.style.display === 'none' ? 'block' : 'none';
                        }
                    } catch (error) {
                        console.warn('音效切换出错:', error);
                    }
                };
                soundToggle.addEventListener('click', this.soundToggleHandler);
            }

            const volumeSlider = document.getElementById('volume-slider');
            if (volumeSlider) {
                volumeSlider.value = SoundManager.getVolume();
                this.volumeInputHandler = (e) => {
                    try {
                        SoundManager.setVolume(e.target.value);
                    } catch (error) {
                        console.warn('音量调节出错:', error);
                    }
                };
                volumeSlider.addEventListener('input', this.volumeInputHandler);
            }

            // 为所有可点击元素添加点击音效（使用事件委托）
            this.clickHandler = (e) => {
                if (!this.destroyed) {
                    try {
                        const target = e.target;
                        if (target && target.matches && target.matches('button, .number-card, .mode-btn, .difficulty-btn')) {
                            SoundManager.play('click');
                        }
                    } catch (error) {
                        // 忽略点击音效错误
                    }
                }
            };
            document.addEventListener('click', this.clickHandler);

            this.eventListenersInitialized = true;
        } catch (error) {
            console.warn('设置音效控制失败:', error);
        }
    }

    // ==================== 新手引导（多语言支持） ====================

    /**
     * 初始化新手引导
     */
    initTutorial() {
        if (this.destroyed) return;
        if (this.tutorialInitialized) return;

        try {
            const prevBtn = document.getElementById('prev-step');
            const nextBtn = document.getElementById('next-step');

            if (prevBtn) {
                this.prevStepHandler = () => this.prevTutorialStep();
                prevBtn.addEventListener('click', this.prevStepHandler);
            }

            if (nextBtn) {
                this.nextStepHandler = () => this.nextTutorialStep();
                nextBtn.addEventListener('click', this.nextStepHandler);
            }

            const dontShow = document.getElementById('dont-show-tutorial');
            if (dontShow) {
                this.dontShowHandler = (e) => {
                    try {
                        if (e.target.checked) {
                            localStorage.setItem(GAME_CONSTANTS.STORAGE_KEYS.HAS_PLAYED, 'true');
                        }
                    } catch (error) {
                        console.warn('设置不再显示失败:', error);
                    }
                };
                dontShow.addEventListener('change', this.dontShowHandler);
            }

            // 添加语言切换监听
            const langSwitch = document.getElementById('lang-switch');
            if (langSwitch && !this.langSwitchHandler) {
                this.langSwitchHandler = () => {
                    if (this.langSwitchTimeout) {
                        clearTimeout(this.langSwitchTimeout);
                    }
                    this.langSwitchTimeout = setTimeout(() => {
                        if (!this.destroyed) {
                            this.updateTutorialContent();
                        }
                        this.langSwitchTimeout = null;
                    }, 50);
                };
                langSwitch.addEventListener('click', this.langSwitchHandler);
            }

            // 监听引导模态框关闭
            const tutorialModal = document.getElementById('tutorial-modal');
            if (tutorialModal) {
                this.tutorialObserver = new MutationObserver((mutations) => {
                    try {
                        mutations.forEach((mutation) => {
                            if (mutation.attributeName === 'style' && 
                                tutorialModal.style.display === 'none') {
                                this.updateTutorialStep(1);
                                if (this.langSwitchTimeout) {
                                    clearTimeout(this.langSwitchTimeout);
                                    this.langSwitchTimeout = null;
                                }
                            }
                        });
                    } catch (error) {
                        console.warn('监听引导模态框失败:', error);
                    }
                });
                this.tutorialObserver.observe(tutorialModal, { attributes: true });
            }

            this.tutorialInitialized = true;
            this.updateTutorialStep(1);
            this.updateTutorialContent();
        } catch (error) {
            console.warn('初始化新手引导失败:', error);
        }
    }

    /**
     * 更新引导内容（根据当前语言）
     */
    updateTutorialContent() {
        if (this.destroyed) return;
        
        try {
            const lang = I18n;
            
            // 更新步骤提示文本
            const hint1 = document.getElementById('step1-hint');
            const hint2 = document.getElementById('step2-hint');
            const hint3 = document.getElementById('step3-hint');
            
            if (hint1) hint1.innerHTML = `⭐ ${lang.t('tutorial1')}`;
            if (hint2) hint2.innerHTML = `⭐ ${lang.t('tutorial2')}`;
            if (hint3) hint3.innerHTML = `⭐ ${lang.t('tutorial3')}`;

            // 更新"不再显示"标签
            const dontShowLabel = document.getElementById('dont-show-label');
            if (dontShowLabel) dontShowLabel.textContent = lang.t('dontShow');

            // 更新演示区域的无匹配文本
            const noMatchText = document.getElementById('no-match-text');
            if (noMatchText) {
                noMatchText.textContent = `${lang.t('noMatch')} 8`;
            }

            // 更新步骤指示器的语言属性
            const stepIndicator = document.getElementById('step-indicator');
            if (stepIndicator) {
                stepIndicator.setAttribute('data-lang', I18n.getLang());
            }
        } catch (error) {
            console.warn('更新引导内容失败:', error);
        }
    }

    /**
     * 下一步
     */
    nextTutorialStep() {
        if (this.destroyed) return;
        
        try {
            if (this.tutorialStep < this.totalSteps) {
                this.updateTutorialStep(this.tutorialStep + 1);
            } else {
                this.closeModal('tutorial-modal');
            }
        } catch (error) {
            console.warn('下一步失败:', error);
        }
    }

    /**
     * 上一步
     */
    prevTutorialStep() {
        if (this.destroyed) return;
        
        try {
            if (this.tutorialStep > 1) {
                this.updateTutorialStep(this.tutorialStep - 1);
            }
        } catch (error) {
            console.warn('上一步失败:', error);
        }
    }

    /**
     * 更新引导步骤
     */
    updateTutorialStep(step) {
        if (this.destroyed) return;
        
        try {
            this.tutorialStep = step;
            
            const steps = document.querySelectorAll('.step');
            const dots = document.querySelectorAll('.step-dot');
            const prevBtn = document.getElementById('prev-step');
            const nextBtn = document.getElementById('next-step');
            const stepText = document.getElementById('step-text');

            steps.forEach((s, i) => {
                if (s) {
                    s.style.display = i + 1 === step ? 'block' : 'none';
                }
            });

            dots.forEach((d, i) => {
                if (d) {
                    if (i + 1 === step) {
                        d.classList.add('active');
                    } else {
                        d.classList.remove('active');
                    }
                }
            });

            if (prevBtn) {
                prevBtn.style.visibility = step === 1 ? 'hidden' : 'visible';
            }

            if (nextBtn) {
                nextBtn.innerHTML = step === this.totalSteps ? '✓' : '▶';
            }

            if (stepText) {
                stepText.textContent = `${step}/${this.totalSteps}`;
            }
        } catch (error) {
            console.warn('更新引导步骤失败:', error);
        }
    }

    /**
     * 检查是否首次游玩
     */
    checkFirstTime() {
        if (this.destroyed) return;
        
        try {
            const hasPlayed = localStorage.getItem(GAME_CONSTANTS.STORAGE_KEYS.HAS_PLAYED);
            if (!hasPlayed) {
                this.openModal('tutorial-modal');
                this.updateTutorialStep(1);
                this.updateTutorialContent();
            }
        } catch (error) {
            console.warn('检查首次游玩失败:', error);
        }
    }

    // ==================== 界面切换 ====================

    /**
     * 切换到游戏界面
     */
    showGameArea() {
        if (this.destroyed) return;
        
        try {
            const settingsPanel = document.getElementById('settings-panel');
            const gameArea = document.getElementById('game-area');

            if (settingsPanel) settingsPanel.style.display = 'none';
            if (gameArea) gameArea.style.display = 'block';
        } catch (error) {
            console.warn('切换到游戏界面失败:', error);
        }
    }

    /**
     * 切换到首页
     */
    showHome() {
        if (this.destroyed) return;
        
        try {
            const gameArea = document.getElementById('game-area');
            const gameoverModal = document.getElementById('game-over-modal');
            const settingsPanel = document.getElementById('settings-panel');

            if (gameArea) gameArea.style.display = 'none';
            if (gameoverModal) gameoverModal.style.display = 'none';
            if (settingsPanel) settingsPanel.style.display = 'block';
        } catch (error) {
            console.warn('切换到首页失败:', error);
        }
    }

    /**
     * 更新暂停按钮状态
     */
    updatePauseButton() {
        if (this.destroyed) return;
        
        try {
            const pauseBtn = document.getElementById('pause-btn');
            const lang = I18n;
            if (pauseBtn) {
                pauseBtn.innerHTML = this.game.state.isPaused ? 
                    `▶️ <span class="btn-text">${lang.t('resume')}</span>` : 
                    `⏸️ <span class="btn-text">${lang.t('pause')}</span>`;
            }
        } catch (error) {
            console.warn('更新暂停按钮失败:', error);
        }
    }

    /**
     * 更新提示按钮冷却状态
     */
    updateHintButton(cooldown) {
        if (this.destroyed) return;
        
        try {
            const hintBtn = document.getElementById('hint-btn');
            if (!hintBtn) return;

            if (cooldown > 0) {
                hintBtn.disabled = true;
                hintBtn.innerHTML = `⏳ ${cooldown}s`;
            } else {
                hintBtn.disabled = false;
                hintBtn.innerHTML = `💡 <span class="btn-text">${I18n.t('hint')}</span>`;
            }
        } catch (error) {
            console.warn('更新提示按钮失败:', error);
        }
    }

    // ==================== 清理资源 ====================

    /**
     * 销毁UI（清理资源）
     */
    destroy() {
        if (this.destroyed) return;
        
        try {
            // 清理所有定时器
            if (this.feedbackTimer) {
                clearTimeout(this.feedbackTimer);
                this.feedbackTimer = null;
            }
            
            if (this.highlightTimer) {
                clearTimeout(this.highlightTimer);
                this.highlightTimer = null;
            }
            
            if (this.langSwitchTimeout) {
                clearTimeout(this.langSwitchTimeout);
                this.langSwitchTimeout = null;
            }
            
            // 移除点击事件监听
            if (this.clickHandler) {
                document.removeEventListener('click', this.clickHandler);
                this.clickHandler = null;
            }

            // 移除音效开关监听
            const soundToggle = document.getElementById('sound-toggle');
            if (soundToggle && this.soundToggleHandler) {
                soundToggle.removeEventListener('click', this.soundToggleHandler);
                this.soundToggleHandler = null;
            }

            // 移除音量滑动条监听
            const volumeSlider = document.getElementById('volume-slider');
            if (volumeSlider && this.volumeInputHandler) {
                volumeSlider.removeEventListener('input', this.volumeInputHandler);
                this.volumeInputHandler = null;
            }

            // 移除语言切换监听
            const langSwitch = document.getElementById('lang-switch');
            if (langSwitch && this.langSwitchHandler) {
                langSwitch.removeEventListener('click', this.langSwitchHandler);
                this.langSwitchHandler = null;
            }

            // 移除引导按钮监听
            const prevBtn = document.getElementById('prev-step');
            if (prevBtn && this.prevStepHandler) {
                prevBtn.removeEventListener('click', this.prevStepHandler);
                this.prevStepHandler = null;
            }

            const nextBtn = document.getElementById('next-step');
            if (nextBtn && this.nextStepHandler) {
                nextBtn.removeEventListener('click', this.nextStepHandler);
                this.nextStepHandler = null;
            }

            // 移除不再显示复选框监听
            const dontShow = document.getElementById('dont-show-tutorial');
            if (dontShow && this.dontShowHandler) {
                dontShow.removeEventListener('change', this.dontShowHandler);
                this.dontShowHandler = null;
            }

            // 断开观察器
            if (this.tutorialObserver) {
                this.tutorialObserver.disconnect();
                this.tutorialObserver = null;
            }
        } catch (error) {
            console.warn('销毁UI时出错:', error);
        }

        // 重置标志
        this.eventListenersInitialized = false;
        this.tutorialInitialized = false;
        this.destroyed = true;
    }
}

// 导出到全局
window.UIManager = UIManager;
