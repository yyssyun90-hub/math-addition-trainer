/**
 * ==================== 糖果数学消消乐 - UI管理 ====================
 * 包含：界面渲染、语言切换、模态框管理、反馈消息、新手引导
 * 依赖：utils.js (需要 I18n, SoundManager, Formatters)
 * ============================================================
 */

class UIManager {
    constructor(game) {
        this.game = game;
        this.feedbackTimer = null;
        this.colorIndex = 0;
        this.tutorialStep = 1;
        this.totalSteps = 3;
        this.eventListenersInitialized = false; // 防止重复初始化事件监听器
    }

    // ==================== 初始化 ====================

    /**
     * 初始化UI相关功能
     */
    init() {
        this.updateLanguage();
        this.setupSoundControls(); // 只会调用一次
        this.initTutorial(); // 只会调用一次
    }

    // ==================== 语言切换 ====================

    /**
     * 切换语言
     */
    toggleLanguage() {
        const newLang = I18n.getLang() === 'zh' ? 'en' : 'zh';
        I18n.setLang(newLang);
        this.game.state.currentLang = newLang;
        this.updateLanguage();
        this.updateTutorialLanguage();
    }

    /**
     * 更新界面语言
     */
    updateLanguage() {
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
    }

    /**
     * 更新模式相关的显示
     */
    updateModeDisplay() {
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
        const fb = document.getElementById('feedback');
        if (!fb) return;

        const lang = I18n;

        if (this.feedbackTimer) {
            clearTimeout(this.feedbackTimer);
        }

        fb.textContent = lang.t(key) || key;
        fb.style.color = color;

        this.feedbackTimer = setTimeout(() => {
            fb.textContent = '';
            this.feedbackTimer = null;
        }, 1000);
    }

    // ==================== 模态框管理 ====================

    /**
     * 打开模态框
     */
    openModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.style.display = 'flex';
    }

    /**
     * 关闭模态框
     */
    closeModal(modalId) {
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
                card.style.pointerEvents = 'auto';
            });
        }
    }

    /**
     * 更新目标显示
     */
    updateTarget(target) {
        const targetSum = document.getElementById('target-sum');
        if (targetSum) targetSum.textContent = target;
    }

    /**
     * 更新统计显示
     */
    updateStats() {
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
        const timeEl = document.getElementById('time');
        if (timeEl) timeEl.textContent = time;
    }

    /**
     * 高亮提示卡片
     */
    highlightHint(indices) {
        const cards = document.querySelectorAll('.number-card:not(.matched)');
        if (indices && indices.length === 2 && cards[indices[0]] && cards[indices[1]]) {
            cards[indices[0]].style.animation = 'bounce 0.5s';
            cards[indices[1]].style.animation = 'bounce 0.5s';
            setTimeout(() => {
                cards[indices[0]].style.animation = '';
                cards[indices[1]].style.animation = '';
            }, 500);
        }
    }

    /**
     * 清除所有卡片的选中状态
     */
    clearSelected() {
        document.querySelectorAll('.number-card.selected').forEach(c => {
            c.classList.remove('selected');
        });
    }

    /**
     * 设置卡片点击可用性
     */
    setCardsEnabled(enabled) {
        document.querySelectorAll('.number-card').forEach(card => {
            if (!card.classList.contains('matched')) {
                card.style.pointerEvents = enabled ? 'auto' : 'none';
            }
        });
    }

    /**
     * 添加匹配动画
     */
    addMatchAnimation(card1, card2) {
        card1.classList.add('matched');
        card2.classList.add('matched');
    }

    /**
     * 移除卡片
     */
    removeCards(card1, card2) {
        card1.remove();
        card2.remove();
    }

    // ==================== 游戏结束 ====================

    /**
     * 显示游戏结束弹窗
     */
    showGameOver() {
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
        // 避免重复初始化
        if (this.eventListenersInitialized) return;

        const soundToggle = document.getElementById('sound-toggle');
        if (soundToggle) {
            soundToggle.addEventListener('click', () => {
                SoundManager.toggleMute();
                const volumePanel = document.getElementById('sound-volume');
                if (volumePanel) {
                    volumePanel.style.display = volumePanel.style.display === 'none' ? 'block' : 'none';
                }
            });
        }

        const volumeSlider = document.getElementById('volume-slider');
        if (volumeSlider) {
            volumeSlider.value = SoundManager.getVolume();
            volumeSlider.addEventListener('input', (e) => {
                SoundManager.setVolume(e.target.value);
            });
        }

        // 为所有可点击元素添加点击音效（使用事件委托避免重复绑定）
        document.addEventListener('click', (e) => {
            const target = e.target;
            if (target.matches('button, .number-card, .mode-btn, .difficulty-btn')) {
                SoundManager.play('click');
            }
        });

        this.eventListenersInitialized = true;
    }

    // ==================== 新手引导 ====================

    /**
     * 初始化新手引导
     */
    initTutorial() {
        // 避免重复初始化
        if (this.tutorialInitialized) return;

        const prevBtn = document.getElementById('prev-step');
        const nextBtn = document.getElementById('next-step');

        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.prevTutorialStep());
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextTutorialStep());
        }

        const dontShow = document.getElementById('dont-show-tutorial');
        if (dontShow) {
            dontShow.addEventListener('change', (e) => {
                if (e.target.checked) {
                    localStorage.setItem(GAME_CONSTANTS.STORAGE_KEYS.HAS_PLAYED, 'true');
                }
            });
        }

        this.tutorialInitialized = true;
        this.updateTutorialStep(1);
    }

    /**
     * 下一步
     */
    nextTutorialStep() {
        if (this.tutorialStep < this.totalSteps) {
            this.updateTutorialStep(this.tutorialStep + 1);
        } else {
            this.closeModal('tutorial-modal');
        }
    }

    /**
     * 上一步
     */
    prevTutorialStep() {
        if (this.tutorialStep > 1) {
            this.updateTutorialStep(this.tutorialStep - 1);
        }
    }

    /**
     * 更新引导步骤
     */
    updateTutorialStep(step) {
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
    }

    /**
     * 更新引导语言
     */
    updateTutorialLanguage() {
        const lang = I18n;
        const hint1 = document.getElementById('step1-hint');
        const hint2 = document.getElementById('step2-hint');
        const hint3 = document.getElementById('step3-hint');
        const dontShowLabel = document.getElementById('dont-show-label');
        const noMatchText = document.getElementById('no-match-text');

        if (hint1) hint1.innerHTML = `⭐ ${lang.t('tutorial1')}`;
        if (hint2) hint2.innerHTML = `⭐ ${lang.t('tutorial2')}`;
        if (hint3) hint3.innerHTML = `⭐ ${lang.t('tutorial3')}`;
        if (dontShowLabel) dontShowLabel.textContent = lang.t('dontShow');
        if (noMatchText) noMatchText.textContent = `${lang.t('noMatch')} 8`;
    }

    /**
     * 检查是否首次游玩
     */
    checkFirstTime() {
        const hasPlayed = localStorage.getItem(GAME_CONSTANTS.STORAGE_KEYS.HAS_PLAYED);
        if (!hasPlayed) {
            this.openModal('tutorial-modal');
            this.updateTutorialLanguage();
        }
    }

    // ==================== 界面切换 ====================

    /**
     * 切换到游戏界面
     */
    showGameArea() {
        const settingsPanel = document.getElementById('settings-panel');
        const gameArea = document.getElementById('game-area');

        if (settingsPanel) settingsPanel.style.display = 'none';
        if (gameArea) gameArea.style.display = 'block';
    }

    /**
     * 切换到首页
     */
    showHome() {
        const gameArea = document.getElementById('game-area');
        const gameoverModal = document.getElementById('game-over-modal');
        const settingsPanel = document.getElementById('settings-panel');

        if (gameArea) gameArea.style.display = 'none';
        if (gameoverModal) gameoverModal.style.display = 'none';
        if (settingsPanel) settingsPanel.style.display = 'block';
    }

    /**
     * 更新暂停按钮状态
     */
    updatePauseButton() {
        const pauseBtn = document.getElementById('pause-btn');
        const lang = I18n;
        if (pauseBtn) {
            pauseBtn.innerHTML = this.game.state.isPaused ? 
                `▶️ <span class="btn-text">${lang.t('resume')}</span>` : 
                `⏸️ <span class="btn-text">${lang.t('pause')}</span>`;
        }
    }

    /**
     * 更新提示按钮冷却状态
     */
    updateHintButton(cooldown) {
        const hintBtn = document.getElementById('hint-btn');
        if (!hintBtn) return;

        if (cooldown > 0) {
            hintBtn.disabled = true;
            hintBtn.innerHTML = `⏳ ${cooldown}s`;
        } else {
            hintBtn.disabled = false;
            hintBtn.innerHTML = `💡 <span class="btn-text">${I18n.t('hint')}</span>`;
        }
    }
}

// 导出到全局
window.UIManager = UIManager;