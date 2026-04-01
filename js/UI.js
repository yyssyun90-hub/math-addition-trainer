/**
 * ==================== 糖果数学消消乐 - UI管理 ====================
 * 版本: 6.0.1 (学生/教师注册版 - 移除管理员注册)
 * 功能：界面渲染、语言切换、模态框管理、反馈消息、新手引导
 * 修改：移除所有管理员注册相关的UI元素
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
        
        // 注册相关事件处理器
        this.chooseStudentHandler = null;
        this.chooseTeacherHandler = null;
        // 移除管理员相关处理器
        this.backToLoginFromChoiceHandler = null;
        this.backToChoiceFromStudentHandler = null;
        this.backToChoiceFromTeacherHandler = null;
        this.backToLoginFromStudentHandler = null;
        this.backToLoginFromTeacherHandler = null;
        this.closeChoiceModalHandler = null;
        this.closeStudentRegisterHandler = null;
        this.closeTeacherRegisterHandler = null;
        // 移除管理员注册相关处理器
        this.studentRegisterSubmitHandler = null;
        this.teacherRegisterSubmitHandler = null;
        // 移除管理员注册提交处理器
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
        this.bindRegisterEvents();
    }

    // ==================== 注册事件绑定 ====================

    /**
     * 绑定注册相关事件
     */
    bindRegisterEvents() {
        // 选择注册为学生
        const chooseStudent = document.getElementById('choose-student');
        if (chooseStudent) {
            this.chooseStudentHandler = () => {
                console.log('点击注册为学生');
                const choiceModal = document.getElementById('register-choice-modal');
                const studentModal = document.getElementById('student-register-modal');
                if (choiceModal) choiceModal.style.display = 'none';
                if (studentModal) studentModal.style.display = 'flex';
            };
            chooseStudent.addEventListener('click', this.chooseStudentHandler);
        } else {
            console.warn('choose-student 元素不存在');
        }

        // 选择注册为教师
        const chooseTeacher = document.getElementById('choose-teacher');
        if (chooseTeacher) {
            this.chooseTeacherHandler = () => {
                console.log('点击注册为教师');
                const choiceModal = document.getElementById('register-choice-modal');
                const teacherModal = document.getElementById('teacher-register-modal');
                if (choiceModal) choiceModal.style.display = 'none';
                if (teacherModal) teacherModal.style.display = 'flex';
            };
            chooseTeacher.addEventListener('click', this.chooseTeacherHandler);
        } else {
            console.warn('choose-teacher 元素不存在');
        }

        // 移除管理员注册按钮绑定

        // 从注册选择返回登录
        const backToLoginFromChoice = document.getElementById('back-to-login-from-choice');
        if (backToLoginFromChoice) {
            this.backToLoginFromChoiceHandler = (e) => {
                e.preventDefault();
                const choiceModal = document.getElementById('register-choice-modal');
                const authModal = document.getElementById('auth-modal');
                if (choiceModal) choiceModal.style.display = 'none';
                if (authModal) authModal.style.display = 'flex';
            };
            backToLoginFromChoice.addEventListener('click', this.backToLoginFromChoiceHandler);
        }

        // 从学生注册返回登录
        const backToLoginFromStudent = document.getElementById('back-to-login-from-student');
        if (backToLoginFromStudent) {
            this.backToLoginFromStudentHandler = (e) => {
                e.preventDefault();
                const studentModal = document.getElementById('student-register-modal');
                const authModal = document.getElementById('auth-modal');
                if (studentModal) studentModal.style.display = 'none';
                if (authModal) authModal.style.display = 'flex';
            };
            backToLoginFromStudent.addEventListener('click', this.backToLoginFromStudentHandler);
        }

        // 从学生注册返回选择
        const backToChoiceFromStudent = document.getElementById('back-to-choice-from-student');
        if (backToChoiceFromStudent) {
            this.backToChoiceFromStudentHandler = (e) => {
                e.preventDefault();
                const studentModal = document.getElementById('student-register-modal');
                const choiceModal = document.getElementById('register-choice-modal');
                if (studentModal) studentModal.style.display = 'none';
                if (choiceModal) choiceModal.style.display = 'flex';
            };
            backToChoiceFromStudent.addEventListener('click', this.backToChoiceFromStudentHandler);
        }

        // 从教师注册返回登录
        const backToLoginFromTeacher = document.getElementById('back-to-login-from-teacher');
        if (backToLoginFromTeacher) {
            this.backToLoginFromTeacherHandler = (e) => {
                e.preventDefault();
                const teacherModal = document.getElementById('teacher-register-modal');
                const authModal = document.getElementById('auth-modal');
                if (teacherModal) teacherModal.style.display = 'none';
                if (authModal) authModal.style.display = 'flex';
            };
            backToLoginFromTeacher.addEventListener('click', this.backToLoginFromTeacherHandler);
        }

        // 从教师注册返回选择
        const backToChoiceFromTeacher = document.getElementById('back-to-choice-from-teacher');
        if (backToChoiceFromTeacher) {
            this.backToChoiceFromTeacherHandler = (e) => {
                e.preventDefault();
                const teacherModal = document.getElementById('teacher-register-modal');
                const choiceModal = document.getElementById('register-choice-modal');
                if (teacherModal) teacherModal.style.display = 'none';
                if (choiceModal) choiceModal.style.display = 'flex';
            };
            backToChoiceFromTeacher.addEventListener('click', this.backToChoiceFromTeacherHandler);
        }

        // 移除管理员注册相关返回按钮绑定

        // 关闭注册选择模态框
        const closeChoiceModal = document.getElementById('close-choice-modal');
        if (closeChoiceModal) {
            this.closeChoiceModalHandler = () => {
                const choiceModal = document.getElementById('register-choice-modal');
                if (choiceModal) choiceModal.style.display = 'none';
            };
            closeChoiceModal.addEventListener('click', this.closeChoiceModalHandler);
        }

        // 关闭学生注册模态框
        const closeStudentRegister = document.getElementById('close-student-register');
        if (closeStudentRegister) {
            this.closeStudentRegisterHandler = () => {
                const studentModal = document.getElementById('student-register-modal');
                if (studentModal) studentModal.style.display = 'none';
            };
            closeStudentRegister.addEventListener('click', this.closeStudentRegisterHandler);
        }

        // 关闭教师注册模态框
        const closeTeacherRegister = document.getElementById('close-teacher-register');
        if (closeTeacherRegister) {
            this.closeTeacherRegisterHandler = () => {
                const teacherModal = document.getElementById('teacher-register-modal');
                if (teacherModal) teacherModal.style.display = 'none';
            };
            closeTeacherRegister.addEventListener('click', this.closeTeacherRegisterHandler);
        }

        // 移除管理员注册模态框关闭按钮绑定

        // 学生注册提交
        const studentRegisterSubmit = document.getElementById('student-register-submit');
        if (studentRegisterSubmit && this.game.auth) {
            this.studentRegisterSubmitHandler = async (e) => {
                e.preventDefault();
                console.log('学生注册提交');
                
                const email = document.getElementById('student-email')?.value;
                const password = document.getElementById('student-password')?.value;
                const state = document.getElementById('student-state')?.value;
                const school = document.getElementById('student-school')?.value;
                const name = document.getElementById('student-name')?.value;
                const studentClass = document.getElementById('student-class')?.value;
                const errorDiv = document.getElementById('student-register-error');
                
                if (!email || !password || !state || !school || !name || !studentClass) {
                    if (errorDiv) {
                        errorDiv.textContent = '❌ 所有字段都必须填写';
                        errorDiv.style.color = '#ff4444';
                    }
                    return;
                }
                
                if (errorDiv) {
                    errorDiv.textContent = '⏳ 处理中...';
                    errorDiv.style.color = '#666';
                }
                
                try {
                    const result = await this.game.auth.registerStudent(email, password, state, school, name, studentClass);
                    
                    if (result && result.success) {
                        if (errorDiv) {
                            errorDiv.textContent = '✅ 注册成功！正在登录...';
                            errorDiv.style.color = '#4CAF50';
                        }
                        setTimeout(() => {
                            const studentModal = document.getElementById('student-register-modal');
                            if (studentModal) studentModal.style.display = 'none';
                            location.reload();
                        }, 1500);
                    } else {
                        if (errorDiv) {
                            errorDiv.textContent = '❌ ' + (result?.error || '注册失败');
                            errorDiv.style.color = '#ff4444';
                        }
                    }
                } catch (err) {
                    console.error('学生注册错误:', err);
                    if (errorDiv) {
                        errorDiv.textContent = '❌ 注册失败，请重试';
                        errorDiv.style.color = '#ff4444';
                    }
                }
            };
            studentRegisterSubmit.addEventListener('click', this.studentRegisterSubmitHandler);
        }

        // 教师注册提交
        const teacherRegisterSubmit = document.getElementById('teacher-register-submit');
        if (teacherRegisterSubmit && this.game.auth) {
            this.teacherRegisterSubmitHandler = async (e) => {
                e.preventDefault();
                console.log('教师注册提交');
                
                const email = document.getElementById('teacher-email')?.value;
                const password = document.getElementById('teacher-password')?.value;
                const name = document.getElementById('teacher-name')?.value;
                const state = document.getElementById('teacher-state')?.value;
                const school = document.getElementById('teacher-school')?.value;
                const errorDiv = document.getElementById('teacher-register-error');
                
                if (!email || !password || !name || !state || !school) {
                    if (errorDiv) {
                        errorDiv.textContent = '❌ 所有字段都必须填写';
                        errorDiv.style.color = '#ff4444';
                    }
                    return;
                }
                
                if (errorDiv) {
                    errorDiv.textContent = '⏳ 处理中...';
                    errorDiv.style.color = '#666';
                }
                
                try {
                    const result = await this.game.auth.registerTeacher(email, password, name, state, school);
                    
                    if (result && result.success) {
                        if (errorDiv) {
                            errorDiv.textContent = '✅ 注册成功！正在登录...';
                            errorDiv.style.color = '#4CAF50';
                        }
                        setTimeout(() => {
                            const teacherModal = document.getElementById('teacher-register-modal');
                            if (teacherModal) teacherModal.style.display = 'none';
                            location.reload();
                        }, 1500);
                    } else {
                        if (errorDiv) {
                            errorDiv.textContent = '❌ ' + (result?.error || '注册失败');
                            errorDiv.style.color = '#ff4444';
                        }
                    }
                } catch (err) {
                    console.error('教师注册错误:', err);
                    if (errorDiv) {
                        errorDiv.textContent = '❌ 注册失败，请重试';
                        errorDiv.style.color = '#ff4444';
                    }
                }
            };
            teacherRegisterSubmit.addEventListener('click', this.teacherRegisterSubmitHandler);
        }

        // 移除管理员注册提交绑定
        
        console.log('✅ 注册事件绑定完成（仅学生和教师）');
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

        // ========== 登录/注册模态框 ==========
        const authTitle = document.getElementById('auth-title');
        if (authTitle) authTitle.textContent = lang.t('authTitle') || '登录';
        
        const authEmail = document.getElementById('auth-email');
        if (authEmail) authEmail.placeholder = lang.t('emailPlaceholder') || '邮箱';
        
        const authPassword = document.getElementById('auth-password');
        if (authPassword) authPassword.placeholder = lang.t('passwordPlaceholder') || '密码';
        
        const authSubmit = document.getElementById('auth-submit');
        if (authSubmit) authSubmit.textContent = lang.t('submit') || '提交';
        
        const authSwitch = document.getElementById('auth-switch');
        if (authSwitch) {
            authSwitch.innerHTML = (lang.t('noAccount') || '没有账号') + ' <span id="switch-to-register">' + (lang.t('registerNow') || '立即注册') + '</span>';
        }

        // ========== 注册模态框标题 ==========
        const studentRegisterTitle = document.querySelector('#student-register-modal h2');
        if (studentRegisterTitle) studentRegisterTitle.innerHTML = '👨‍🎓 ' + (lang.t('registerStudent') || '学生注册');
        
        const teacherRegisterTitle = document.querySelector('#teacher-register-modal h2');
        if (teacherRegisterTitle) teacherRegisterTitle.innerHTML = '👩‍🏫 ' + (lang.t('registerTeacher') || '教师注册');
        
        // 移除管理员注册标题
        
        const registerChoiceTitle = document.querySelector('#register-choice-modal h2');
        if (registerChoiceTitle) registerChoiceTitle.textContent = lang.t('chooseRole') || '选择注册身份';
        
        const chooseStudentBtn = document.getElementById('choose-student');
        if (chooseStudentBtn) {
            chooseStudentBtn.innerHTML = '👨‍🎓 ' + (lang.t('registerStudent') || '注册为学生');
        }
        
        const chooseTeacherBtn = document.getElementById('choose-teacher');
        if (chooseTeacherBtn) {
            chooseTeacherBtn.innerHTML = '👩‍🏫 ' + (lang.t('registerTeacher') || '注册为教师');
        }
        
        // 移除管理员注册按钮文本更新
        
        // 注册模态框占位符
        const studentEmail = document.getElementById('student-email');
        if (studentEmail) studentEmail.placeholder = lang.t('emailPlaceholder') || '电子邮箱';
        
        const studentPassword = document.getElementById('student-password');
        if (studentPassword) studentPassword.placeholder = lang.t('passwordPlaceholder') || '密码 (至少6位)';
        
        const studentName = document.getElementById('student-name');
        if (studentName) studentName.placeholder = lang.t('namePlaceholder') || '姓名';
        
        const studentSchool = document.getElementById('student-school');
        if (studentSchool) studentSchool.placeholder = lang.t('schoolPlaceholder') || '学校名称';
        
        const studentClass = document.getElementById('student-class');
        if (studentClass) studentClass.placeholder = lang.t('classPlaceholder') || '班级 (例: 5A)';
        
        const teacherEmail = document.getElementById('teacher-email');
        if (teacherEmail) teacherEmail.placeholder = lang.t('emailPlaceholder') || '电子邮箱';
        
        const teacherPassword = document.getElementById('teacher-password');
        if (teacherPassword) teacherPassword.placeholder = lang.t('passwordPlaceholder') || '密码 (至少6位)';
        
        const teacherName = document.getElementById('teacher-name');
        if (teacherName) teacherName.placeholder = lang.t('namePlaceholder') || '姓名';
        
        const teacherSchool = document.getElementById('teacher-school');
        if (teacherSchool) teacherSchool.placeholder = lang.t('schoolPlaceholder') || '学校名称';
        
        // 移除管理员注册占位符更新

        // 注册按钮文本
        const studentSubmit = document.getElementById('student-register-submit');
        if (studentSubmit) studentSubmit.textContent = lang.t('registerStudent') || '注册为学生';
        
        const teacherSubmit = document.getElementById('teacher-register-submit');
        if (teacherSubmit) teacherSubmit.textContent = lang.t('registerTeacher') || '注册为教师';
        
        // 移除管理员注册按钮文本更新
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
    async updateUserUI() {
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

            // 获取用户角色
            let role = 'student';
            let school = '';
            let userClass = '';
            let permissions = null;
            
            try {
                if (this.game.auth && this.game.auth.getUserProfile) {
                    const profile = await this.game.auth.getUserProfile(this.game.state.currentUser.id);
                    if (profile) {
                        role = profile.role || 'student';
                        school = profile.school || '';
                        userClass = profile.class || '';
                        permissions = profile.permissions || null;
                    }
                }
            } catch (error) {
                console.warn('获取用户资料失败:', error);
            }

            const logoutBtn = document.createElement('button');
            logoutBtn.className = 'auth-btn logout';
            logoutBtn.id = 'logout-btn';
            logoutBtn.innerHTML = '🚪 ' + (lang.t('logout') || '退出');
            logoutBtn.addEventListener('click', () => {
                if (this.game.auth) {
                    this.game.auth.logout();
                }
            });
            authButtons.appendChild(logoutBtn);

            if (userName) {
                let displayName = this.game.state.currentUser.name || this.game.state.currentUser.email || '用户';
                if (role === 'admin') {
                    displayName += ' 👑';
                } else if (role === 'teacher') {
                    displayName += ' 👩‍🏫';
                } else {
                    displayName += ' 👨‍🎓';
                }
                userName.textContent = displayName;
            }
            
            if (userStatus) {
                let status = '';
                if (role === 'admin') {
                    status = '👑 管理员 · 全校数据可见';
                } else {
                    status = this.game.state.isOnline ? '✨ ' + (lang.t('onlineMode') || '在线') : '📴 ' + (lang.t('offlineMode') || '离线');
                }
                if (school) {
                    status += ` · ${school}`;
                }
                if (userClass && role === 'student') {
                    status += ` · ${userClass}`;
                }
                userStatus.textContent = status;
            }
            
            if (userAvatar) {
                const name = this.game.state.currentUser.name || this.game.state.currentUser.email || 'U';
                userAvatar.textContent = name.charAt(0).toUpperCase();
            }

            // 显示或隐藏管理员标签页（在教师面板中）
            const adminTab = document.getElementById('admin-tab-btn');
            const adminTabContent = document.getElementById('admin-tab');
            if (adminTab && adminTabContent) {
                if (role === 'admin') {
                    adminTab.style.display = 'inline-block';
                } else {
                    adminTab.style.display = 'none';
                }
            }
        } else {
            // 未登录状态
            if (userInfo) userInfo.style.display = 'none';

            const loginBtn = document.createElement('button');
            loginBtn.className = 'auth-btn login';
            loginBtn.id = 'login-btn';
            loginBtn.innerHTML = '🔐 ' + (lang.t('login') || '登录');
            loginBtn.addEventListener('click', () => {
                if (this.game.auth) {
                    this.game.auth.showAuthModal('login');
                }
            });
            authButtons.appendChild(loginBtn);

            const registerBtn = document.createElement('button');
            registerBtn.className = 'auth-btn register';
            registerBtn.id = 'register-btn';
            registerBtn.innerHTML = '📝 ' + (lang.t('register') || '注册');
            registerBtn.addEventListener('click', () => {
                if (this.game.auth) {
                    this.game.auth.showRegisterChoice();
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
            
            const hint1 = document.getElementById('step1-hint');
            const hint2 = document.getElementById('step2-hint');
            const hint3 = document.getElementById('step3-hint');
            
            if (hint1) hint1.innerHTML = `⭐ ${lang.t('tutorial1')}`;
            if (hint2) hint2.innerHTML = `⭐ ${lang.t('tutorial2')}`;
            if (hint3) hint3.innerHTML = `⭐ ${lang.t('tutorial3')}`;

            const dontShowLabel = document.getElementById('dont-show-label');
            if (dontShowLabel) dontShowLabel.textContent = lang.t('dontShow');

            const noMatchText = document.getElementById('no-match-text');
            if (noMatchText) {
                noMatchText.textContent = `${lang.t('noMatch')} 8`;
            }

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
            
            if (this.clickHandler) {
                document.removeEventListener('click', this.clickHandler);
                this.clickHandler = null;
            }

            const soundToggle = document.getElementById('sound-toggle');
            if (soundToggle && this.soundToggleHandler) {
                soundToggle.removeEventListener('click', this.soundToggleHandler);
                this.soundToggleHandler = null;
            }

            const volumeSlider = document.getElementById('volume-slider');
            if (volumeSlider && this.volumeInputHandler) {
                volumeSlider.removeEventListener('input', this.volumeInputHandler);
                this.volumeInputHandler = null;
            }

            const langSwitch = document.getElementById('lang-switch');
            if (langSwitch && this.langSwitchHandler) {
                langSwitch.removeEventListener('click', this.langSwitchHandler);
                this.langSwitchHandler = null;
            }

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

            const dontShow = document.getElementById('dont-show-tutorial');
            if (dontShow && this.dontShowHandler) {
                dontShow.removeEventListener('change', this.dontShowHandler);
                this.dontShowHandler = null;
            }

            // 移除注册相关事件监听
            const chooseStudent = document.getElementById('choose-student');
            if (chooseStudent && this.chooseStudentHandler) {
                chooseStudent.removeEventListener('click', this.chooseStudentHandler);
                this.chooseStudentHandler = null;
            }

            const chooseTeacher = document.getElementById('choose-teacher');
            if (chooseTeacher && this.chooseTeacherHandler) {
                chooseTeacher.removeEventListener('click', this.chooseTeacherHandler);
                this.chooseTeacherHandler = null;
            }

            // 移除管理员注册相关事件监听

            const backToLoginFromChoice = document.getElementById('back-to-login-from-choice');
            if (backToLoginFromChoice && this.backToLoginFromChoiceHandler) {
                backToLoginFromChoice.removeEventListener('click', this.backToLoginFromChoiceHandler);
                this.backToLoginFromChoiceHandler = null;
            }

            const backToChoiceFromStudent = document.getElementById('back-to-choice-from-student');
            if (backToChoiceFromStudent && this.backToChoiceFromStudentHandler) {
                backToChoiceFromStudent.removeEventListener('click', this.backToChoiceFromStudentHandler);
                this.backToChoiceFromStudentHandler = null;
            }

            const backToChoiceFromTeacher = document.getElementById('back-to-choice-from-teacher');
            if (backToChoiceFromTeacher && this.backToChoiceFromTeacherHandler) {
                backToChoiceFromTeacher.removeEventListener('click', this.backToChoiceFromTeacherHandler);
                this.backToChoiceFromTeacherHandler = null;
            }

            // 移除管理员注册返回选择事件监听

            const backToLoginFromStudent = document.getElementById('back-to-login-from-student');
            if (backToLoginFromStudent && this.backToLoginFromStudentHandler) {
                backToLoginFromStudent.removeEventListener('click', this.backToLoginFromStudentHandler);
                this.backToLoginFromStudentHandler = null;
            }

            const backToLoginFromTeacher = document.getElementById('back-to-login-from-teacher');
            if (backToLoginFromTeacher && this.backToLoginFromTeacherHandler) {
                backToLoginFromTeacher.removeEventListener('click', this.backToLoginFromTeacherHandler);
                this.backToLoginFromTeacherHandler = null;
            }

            // 移除管理员注册返回登录事件监听

            const closeChoiceModal = document.getElementById('close-choice-modal');
            if (closeChoiceModal && this.closeChoiceModalHandler) {
                closeChoiceModal.removeEventListener('click', this.closeChoiceModalHandler);
                this.closeChoiceModalHandler = null;
            }

            const closeStudentRegister = document.getElementById('close-student-register');
            if (closeStudentRegister && this.closeStudentRegisterHandler) {
                closeStudentRegister.removeEventListener('click', this.closeStudentRegisterHandler);
                this.closeStudentRegisterHandler = null;
            }

            const closeTeacherRegister = document.getElementById('close-teacher-register');
            if (closeTeacherRegister && this.closeTeacherRegisterHandler) {
                closeTeacherRegister.removeEventListener('click', this.closeTeacherRegisterHandler);
                this.closeTeacherRegisterHandler = null;
            }

            // 移除管理员注册模态框关闭事件监听

            const studentRegisterSubmit = document.getElementById('student-register-submit');
            if (studentRegisterSubmit && this.studentRegisterSubmitHandler) {
                studentRegisterSubmit.removeEventListener('click', this.studentRegisterSubmitHandler);
                this.studentRegisterSubmitHandler = null;
            }

            const teacherRegisterSubmit = document.getElementById('teacher-register-submit');
            if (teacherRegisterSubmit && this.teacherRegisterSubmitHandler) {
                teacherRegisterSubmit.removeEventListener('click', this.teacherRegisterSubmitHandler);
                this.teacherRegisterSubmitHandler = null;
            }

            // 移除管理员注册提交事件监听

            if (this.tutorialObserver) {
                this.tutorialObserver.disconnect();
                this.tutorialObserver = null;
            }
        } catch (error) {
            console.warn('销毁UI时出错:', error);
        }

        this.eventListenersInitialized = false;
        this.tutorialInitialized = false;
        this.destroyed = true;
    }
}

// 导出到全局
window.UIManager = UIManager;
