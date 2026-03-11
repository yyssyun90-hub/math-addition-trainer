/**
 * ==================== 糖果数学消消乐 - 工具函数库 ====================
 * 版本: 2.0.0
 * 包含：音效管理、国际化、常量定义、数组工具、数字生成、格式化等
 * 作者：AI 程序员 和 TYUN
 * 日期：2026
 * =================================================================
 */

(function(global) {
    'use strict';

    // ==================== 音效管理器 ====================
    const SoundManager = (function() {
        let instance = null;
        
        class SoundManagerClass {
            constructor() {
                if (instance) return instance;
                instance = this;
                
                this.audioContext = null;
                this.muted = this.safeLocalStorageGet('candyMathGame_v4_sound_muted') === 'true';
                this.volume = parseInt(this.safeLocalStorageGet('candyMathGame_v4_sound_volume') || '70') / 100;
                this.init();
            }
            
            safeLocalStorageGet(key) {
                try {
                    return localStorage.getItem(key);
                } catch (e) {
                    return null;
                }
            }
            
            safeLocalStorageSet(key, value) {
                try {
                    localStorage.setItem(key, value);
                } catch (e) {
                    console.warn('localStorage 写入失败');
                }
            }
            
            async init() {
                // 等待用户交互后初始化音频
                const initAudio = async () => {
                    if (!this.audioContext) {
                        try {
                            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                            // 如果音频上下文是挂起状态，尝试恢复
                            if (this.audioContext.state === 'suspended') {
                                await this.audioContext.resume();
                            }
                        } catch (e) {
                            console.warn('Web Audio API 不支持');
                        }
                    }
                };
                
                document.addEventListener('click', initAudio, { once: true });
                document.addEventListener('touchstart', initAudio, { once: true });
                
                // 更新UI图标，确保DOM已加载
                this.updateIcon();
            }
            
            async play(type) {
                if (this.muted) return;
                
                // 确保音频上下文已初始化
                if (!this.audioContext) {
                    return;
                }
                
                // 如果音频上下文是挂起状态，尝试恢复
                if (this.audioContext.state === 'suspended') {
                    try {
                        await this.audioContext.resume();
                    } catch (e) {
                        console.warn('无法恢复音频上下文');
                        return;
                    }
                }
                
                try {
                    const oscillator = this.audioContext.createOscillator();
                    const gainNode = this.audioContext.createGain();
                    
                    oscillator.connect(gainNode);
                    gainNode.connect(this.audioContext.destination);
                    
                    switch(type) {
                        case 'correct':
                            oscillator.frequency.setValueAtTime(523.25, this.audioContext.currentTime);
                            oscillator.frequency.setValueAtTime(659.25, this.audioContext.currentTime + 0.1);
                            oscillator.frequency.setValueAtTime(783.99, this.audioContext.currentTime + 0.2);
                            gainNode.gain.setValueAtTime(this.volume * 0.3, this.audioContext.currentTime);
                            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
                            oscillator.start();
                            oscillator.stop(this.audioContext.currentTime + 0.3);
                            break;
                            
                        case 'wrong':
                            oscillator.frequency.setValueAtTime(220, this.audioContext.currentTime);
                            oscillator.frequency.setValueAtTime(196, this.audioContext.currentTime + 0.1);
                            oscillator.frequency.setValueAtTime(174.61, this.audioContext.currentTime + 0.2);
                            gainNode.gain.setValueAtTime(this.volume * 0.2, this.audioContext.currentTime);
                            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
                            oscillator.start();
                            oscillator.stop(this.audioContext.currentTime + 0.3);
                            break;
                            
                        case 'click':
                            oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime);
                            gainNode.gain.setValueAtTime(this.volume * 0.1, this.audioContext.currentTime);
                            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
                            oscillator.start();
                            oscillator.stop(this.audioContext.currentTime + 0.1);
                            break;
                            
                        case 'achievement':
                            oscillator.frequency.setValueAtTime(659.25, this.audioContext.currentTime);
                            oscillator.frequency.setValueAtTime(783.99, this.audioContext.currentTime + 0.1);
                            oscillator.frequency.setValueAtTime(987.77, this.audioContext.currentTime + 0.2);
                            oscillator.frequency.setValueAtTime(1046.50, this.audioContext.currentTime + 0.3);
                            gainNode.gain.setValueAtTime(this.volume * 0.4, this.audioContext.currentTime);
                            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.4);
                            oscillator.start();
                            oscillator.stop(this.audioContext.currentTime + 0.4);
                            break;
                    }
                } catch (e) {
                    console.warn('音效播放失败:', e);
                }
            }
            
            toggleMute() {
                this.muted = !this.muted;
                this.safeLocalStorageSet('candyMathGame_v4_sound_muted', this.muted);
                this.updateIcon();
                return this.muted;
            }
            
            setVolume(value) {
                this.volume = Math.max(0, Math.min(100, value)) / 100;
                this.safeLocalStorageSet('candyMathGame_v4_sound_volume', value);
            }
            
            getVolume() {
                return Math.round(this.volume * 100);
            }
            
            isMuted() {
                return this.muted;
            }
            
            updateIcon() {
                // 确保DOM加载完成后再更新图标
                const updateIconSafe = () => {
                    const icon = document.querySelector('.sound-icon');
                    if (icon) {
                        icon.textContent = this.muted ? '🔇' : '🔊';
                    }
                };
                
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', updateIconSafe.bind(this));
                } else {
                    updateIconSafe.call(this);
                }
            }
        }
        
        return new SoundManagerClass();
    })();

    // ==================== 国际化 ====================
    const TRANSLATIONS = {
        'zh': {
            gameTitle: '糖果数学消消乐',
            langName: '中文',
            langIcon: '🇨🇳',
            modeChallenge: '挑战模式',
            modeStandard: '标准模式',
            modePractice: '练习模式',
            difficultyEasy: '简单',
            difficultyMedium: '中等',
            difficultyHard: '困难',
            startGame: '开始游戏',
            hint: '提示',
            refresh: '刷新',
            pause: '暂停',
            resume: '继续',
            endGame: '结束游戏',
            home: '首页',
            playAgain: '再玩一次',
            exportData: '导出数据',
            statScore: '得分',
            statCompleted: '完成',
            statTimeLeft: '剩余时间',
            statTimeUsed: '已用时间',
            statAccuracy: '正确率',
            targetLabel: '目标和',
            gameoverTitle: '🎉 游戏结束',
            finalScore: '最终得分',
            finalCompleted: '完成题数',
            finalAccuracy: '正确率',
            correct: '✓ 正确！',
            wrong: '✗ 不对哦',
            maxTwo: '只能选2张卡片哦',
            noCombination: '没有可组合的数字，刷新啦',
            hintHere: '试试这两个！',
            noHint: '没有可组合的',
            refreshed: '✨ 刷新啦',
            hintCooldown: '提示冷却中',
            login: '登录',
            register: '注册',
            logout: '退出',
            email: '邮箱',
            password: '密码',
            noAccount: '还没有账号？',
            hasAccount: '已有账号？',
            registerNow: '立即注册',
            loginNow: '立即登录',
            offlineMode: '离线模式',
            onlineMode: '已登录',
            guest: '游客',
            networkOnline: '网络已连接',
            networkOffline: '网络已断开，进入离线模式',
            gamePaused: '游戏已暂停',
            gameResumed: '继续游戏',
            saveProgress: '是否保存当前进度？',
            errorOccurred: '发生错误，请刷新页面',
            welcome: '欢迎来到糖果世界',
            tutorial1: '选两张卡片，加起来等于 🎯',
            tutorial2: '正确！卡片会消失 ✨',
            tutorial3: '没得配？点刷新换一批',
            noMatch: '没有数字能组成',
            dontShow: '不再显示',
            loginSuccess: '登录成功！',
            registerSuccess: '注册成功！',
            exportSuccess: '数据导出成功',
            exportFailed: '导出失败',
            syncSuccess: '同步成功',
            syncFailed: '同步失败',
            quickMatch: '快速匹配',
            tournament: '锦标赛',
            createTournament: '创建锦标赛',
            joinRoom: '加入房间',
            yourTurn: '你的回合',
            opponentTurn: '等待对手',
            send: '发送',
            win: '胜利！',
            lose: '惜败',
            rematch: '再战一局',
            
            // ===== 忘记密码相关翻译 =====
            forgotPassword: '忘记密码',
            sendResetLink: '发送重置链接',
            backToLogin: '返回登录',
            passwordResetEmailSent: '密码重置链接已发送',
            resetEmailSent: '密码重置链接已发送到您的邮箱，请查收',
            emailRequired: '邮箱不能为空',
            emailNotFound: '该邮箱未注册',
            emailAndPasswordRequired: '邮箱和密码不能为空',
            invalidCredentials: '邮箱或密码错误',
            userAlreadyExists: '该邮箱已被注册',
            rateLimitExceeded: '操作过于频繁，请稍后再试',
            emailNotConfirmed: '请先验证邮箱',
            authFailed: '认证失败，请稍后重试',
            sendFailed: '发送失败，请稍后重试',
            supabaseNotConnected: 'Supabase 未连接，请稍后重试',
            processing: '处理中...',
            sending: '发送中...',
            unexpectedError: '发生未知错误，请重试',
            passwordResetSuccess: '密码重置成功，请重新登录',
            networkOffline: '网络已断开，请检查网络连接',
            networkError: '网络错误，请稍后重试',
            requestTimeout: '请求超时，请重试',
            genericError: '操作失败，请稍后重试',
            showPassword: '显示密码',
            hidePassword: '隐藏密码',
            emailVerificationRequired: '请查收邮件验证邮箱',
            
            // ===== 新增：登录/注册模态框 =====
            authTitle: '登录',
            emailPlaceholder: '请输入邮箱',
            passwordPlaceholder: '请输入密码',
            submit: '提交',
            
            // ===== 新增：加入房间模态框 =====
            enterRoomCode: '请输入6位房间码',
            join: '加入',
            cancel: '取消',
            
            // ===== 新增：锦标赛模态框 =====
            lobby: '大厅',
            bracket: '赛程表',
            history: '历史',
            ranking: '排名',
            tournamentName: '锦标赛名称',
            enterTournamentName: '例如：糖果杯2026',
            playerCount: '参赛人数',
            gameMode: '比赛模式',
            entryFee: '报名费',
            enterEntryFee: '输入报名费',
            create: '创建',
            
            // ===== 新增：对战模态框 =====
            findingOpponent: '正在寻找对手...',
            roomCode: '房间码',
            copy: '复制',
            you: '你',
            waiting: '等待中...',
            vs: 'VS',
            enterMessage: '输入消息...',
            close: '关闭',
            
            // ===== 新增：通用按钮 =====
            confirm: '确认',
            back: '返回',
            next: '下一步',
            previous: '上一步',
            done: '完成'
        },
        'en': {
            gameTitle: 'Candy Math Match',
            langName: 'English',
            langIcon: '🇬🇧',
            modeChallenge: 'Challenge',
            modeStandard: 'Standard',
            modePractice: 'Practice',
            difficultyEasy: 'Easy',
            difficultyMedium: 'Medium',
            difficultyHard: 'Hard',
            startGame: 'Start Game',
            hint: 'Hint',
            refresh: 'Refresh',
            pause: 'Pause',
            resume: 'Resume',
            endGame: 'End Game',
            home: 'Home',
            playAgain: 'Play Again',
            exportData: 'Export Data',
            statScore: 'Score',
            statCompleted: 'Done',
            statTimeLeft: 'Time Left',
            statTimeUsed: 'Time Used',
            statAccuracy: 'Accuracy',
            targetLabel: 'Target',
            gameoverTitle: '🎉 Game Over',
            finalScore: 'Final Score',
            finalCompleted: 'Completed',
            finalAccuracy: 'Accuracy',
            correct: '✓ Correct!',
            wrong: '✗ Try Again',
            maxTwo: 'Select only 2 cards',
            noCombination: 'No combination, refresh',
            hintHere: 'Try these two!',
            noHint: 'No hint available',
            refreshed: '✨ Refreshed',
            hintCooldown: 'Hint cooldown',
            login: 'Login',
            register: 'Register',
            logout: 'Logout',
            email: 'Email',
            password: 'Password',
            noAccount: 'No account?',
            hasAccount: 'Have account?',
            registerNow: 'Register',
            loginNow: 'Login',
            offlineMode: 'Offline Mode',
            onlineMode: 'Online',
            guest: 'Guest',
            networkOnline: 'Network connected',
            networkOffline: 'Network offline, entering offline mode',
            gamePaused: 'Game Paused',
            gameResumed: 'Game Resumed',
            saveProgress: 'Save current progress?',
            errorOccurred: 'Error occurred, please refresh',
            welcome: 'Welcome to Candy World',
            tutorial1: 'Pick 2 cards = 🎯',
            tutorial2: 'Correct! Cards vanish ✨',
            tutorial3: 'No match? Refresh 🔄',
            noMatch: 'No numbers make',
            dontShow: 'Don\'t show again',
            loginSuccess: 'Login successful!',
            registerSuccess: 'Registration successful!',
            exportSuccess: 'Data exported successfully',
            exportFailed: 'Export failed',
            syncSuccess: 'Sync successful',
            syncFailed: 'Sync failed',
            quickMatch: 'Quick Match',
            tournament: 'Tournament',
            createTournament: 'Create Tournament',
            joinRoom: 'Join Room',
            yourTurn: 'Your Turn',
            opponentTurn: 'Waiting',
            send: 'Send',
            win: 'Victory!',
            lose: 'Defeat',
            rematch: 'Rematch',
            
            // ===== New forgot password related translations =====
            forgotPassword: 'Forgot Password',
            sendResetLink: 'Send Reset Link',
            backToLogin: 'Back to Login',
            passwordResetEmailSent: 'Password reset email sent',
            resetEmailSent: 'Password reset link has been sent to your email',
            emailRequired: 'Email is required',
            emailNotFound: 'Email not found',
            emailAndPasswordRequired: 'Email and password are required',
            invalidCredentials: 'Invalid email or password',
            userAlreadyExists: 'User already exists',
            rateLimitExceeded: 'Too many attempts, please try again later',
            emailNotConfirmed: 'Please verify your email first',
            authFailed: 'Authentication failed, please try again',
            sendFailed: 'Failed to send, please try again',
            supabaseNotConnected: 'Supabase not connected, please try again',
            processing: 'Processing...',
            sending: 'Sending...',
            unexpectedError: 'An unexpected error occurred',
            passwordResetSuccess: 'Password reset successful, please login again',
            networkOffline: 'Network offline, please check your connection',
            networkError: 'Network error, please try again',
            requestTimeout: 'Request timeout, please try again',
            genericError: 'Operation failed, please try again',
            showPassword: 'Show password',
            hidePassword: 'Hide password',
            emailVerificationRequired: 'Please check your email to verify your account',
            
            // ===== New: Login/Register Modal =====
            authTitle: 'Login',
            emailPlaceholder: 'Enter email',
            passwordPlaceholder: 'Enter password',
            submit: 'Submit',
            
            // ===== New: Join Room Modal =====
            enterRoomCode: 'Enter 6-digit room code',
            join: 'Join',
            cancel: 'Cancel',
            
            // ===== New: Tournament Modal =====
            lobby: 'Lobby',
            bracket: 'Bracket',
            history: 'History',
            ranking: 'Ranking',
            tournamentName: 'Tournament Name',
            enterTournamentName: 'e.g., Candy Cup 2026',
            playerCount: 'Players',
            gameMode: 'Game Mode',
            entryFee: 'Entry Fee',
            enterEntryFee: 'Enter fee',
            create: 'Create',
            
            // ===== New: Battle Modal =====
            findingOpponent: 'Finding opponent...',
            roomCode: 'Room Code',
            copy: 'Copy',
            you: 'You',
            waiting: 'Waiting...',
            vs: 'VS',
            enterMessage: 'Enter message...',
            close: 'Close',
            
            // ===== New: Common Buttons =====
            confirm: 'Confirm',
            back: 'Back',
            next: 'Next',
            previous: 'Previous',
            done: 'Done'
        }
    };

    const I18n = {
        currentLang: (function() {
            try {
                return localStorage.getItem('candyMathGame_v4_lang') || 'zh';
            } catch (e) {
                return 'zh';
            }
        })(),
        
        t(key) {
            const langData = TRANSLATIONS[this.currentLang];
            if (!langData) {
                console.warn(`语言 ${this.currentLang} 不存在，使用默认值`);
                return key;
            }
            return langData[key] || key;
        },
        
        setLang(lang) {
            if (TRANSLATIONS[lang]) {
                this.currentLang = lang;
                try {
                    localStorage.setItem('candyMathGame_v4_lang', lang);
                } catch (e) {
                    console.warn('无法保存语言设置');
                }
            }
            return this.currentLang;
        },
        
        getLang() {
            return this.currentLang;
        },
        
        getAllTranslations() {
            return TRANSLATIONS;
        },
        
        // 获取带参数的消息
        tParam(key, params) {
            let message = this.t(key);
            if (params && typeof params === 'object') {
                Object.keys(params).forEach(param => {
                    message = message.replace(`{${param}}`, params[param]);
                });
            }
            return message;
        }
    };

    // ==================== 常量定义 ====================
    const GAME_CONSTANTS = {
        VERSION: 'v4',
        STORAGE_KEYS: {
            GAME_DATA: 'candyMathGame_v4_data',
            STATS: 'candyMathGame_v4_stats',
            LANG: 'candyMathGame_v4_lang',
            USER: 'candyMathGame_v4_user',
            HAS_PLAYED: 'candyMathGame_v4_hasPlayed',
            GUEST_GAMES: 'candyMathGame_v4_guest',
            SOUND_MUTED: 'candyMathGame_v4_sound_muted',
            SOUND_VOLUME: 'candyMathGame_v4_sound_volume'
        },
        
        DIFFICULTY_CONFIG: {
            easy: {
                numberRange: { min: 0, max: 9 },
                targetRange: { min: 5, max: 12 },
                timeBonus: 1.2,
                scoreMultiplier: 1
            },
            medium: {
                numberRange: { min: 1, max: 14 },
                targetRange: { min: 6, max: 16 },
                timeBonus: 1,
                scoreMultiplier: 1.5
            },
            hard: {
                numberRange: { min: 2, max: 18 },
                targetRange: { min: 8, max: 20 },
                timeBonus: 0.8,
                scoreMultiplier: 2
            }
        },
        
        MODE_CONFIG: {
            challenge: { 
                timeLimit: 90, 
                targetCount: null,
                maxQuestions: Infinity 
            },
            standard: { 
                timeLimit: null, 
                targetCount: 30,
                maxQuestions: 30
            },
            practice: { 
                timeLimit: null, 
                targetCount: null,
                maxQuestions: Infinity
            }
        },
        
        GAME_LIMITS: {
            maxScore: 999999,
            maxQuestions: 999,
            minCards: 6,
            maxCards: 20
        }
    };

    // ==================== 数组工具 ====================
    const ArrayUtils = {
        shuffle(arr) {
            if (!arr || !Array.isArray(arr)) return [];
            const array = [...arr];
            for (let i = array.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [array[i], array[j]] = [array[j], array[i]];
            }
            return array;
        },
        
        unique(arr) {
            if (!arr || !Array.isArray(arr)) return [];
            return [...new Set(arr)];
        },
        
        randomItem(arr) {
            if (!arr || !Array.isArray(arr) || arr.length === 0) return null;
            return arr[Math.floor(Math.random() * arr.length)];
        },
        
        hasPairSum(nums, target) {
            if (!nums || !Array.isArray(nums)) return false;
            const seen = new Set();
            for (const num of nums) {
                const complement = target - num;
                if (seen.has(complement)) {
                    return true;
                }
                seen.add(num);
            }
            return false;
        },
        
        findPairSum(nums, target) {
            if (!nums || !Array.isArray(nums)) return null;
            const map = new Map();
            for (let i = 0; i < nums.length; i++) {
                const complement = target - nums[i];
                if (map.has(complement)) {
                    return [map.get(complement), i];
                }
                map.set(nums[i], i);
            }
            return null;
        },
        
        // 获取所有可能的配对
        findAllPairs(nums, target) {
            if (!nums || !Array.isArray(nums)) return [];
            const pairs = [];
            const used = new Set();
            
            for (let i = 0; i < nums.length; i++) {
                if (used.has(i)) continue;
                for (let j = i + 1; j < nums.length; j++) {
                    if (used.has(j)) continue;
                    if (nums[i] + nums[j] === target) {
                        pairs.push([i, j]);
                        used.add(i);
                        used.add(j);
                        break;
                    }
                }
            }
            return pairs;
        }
    };

    // ==================== 数字生成工具 ====================
    const NumberGenerator = {
        random(min, max) {
            min = Math.ceil(min);
            max = Math.floor(max);
            return Math.floor(Math.random() * (max - min + 1)) + min;
        },
        
        generateGridNumbers(range, target, size = 10) {
            const { min, max } = range;
            const numbers = [];
            
            // 确保至少有一对数字可以组成目标
            let pairFound = false;
            let attempts = 0;
            const maxAttempts = 50;
            
            while (!pairFound && attempts < maxAttempts) {
                const candidate1 = this.random(min, max);
                const candidate2 = target - candidate1;
                
                if (candidate2 >= min && candidate2 <= max) {
                    numbers.push(candidate1, candidate2);
                    pairFound = true;
                }
                attempts++;
            }
            
            if (!pairFound) {
                // 如果找不到配对，使用默认值
                const fallback1 = this.random(min, max);
                const fallback2 = target - fallback1;
                numbers.push(fallback1, Math.max(min, Math.min(max, fallback2)));
            }
            
            // 填充剩余的数字
            while (numbers.length < size) {
                numbers.push(this.random(min, max));
            }
            
            return ArrayUtils.shuffle(numbers);
        },
        
        generateTarget(range, minSum, maxSum) {
            const actualMin = Math.max(range.min, minSum);
            const actualMax = Math.min(range.max, maxSum);
            return this.random(actualMin, actualMax);
        },
        
        // 检查数字是否在范围内
        isInRange(num, range) {
            return num >= range.min && num <= range.max;
        }
    };

    // ==================== 格式化工具 ====================
    const Formatters = {
        formatTime(seconds) {
            if (seconds === undefined || seconds === null) return '0:00';
            if (seconds < 0) seconds = 0;
            const mins = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        },
        
        calculateAccuracy(correct, total) {
            if (total === 0) return 100;
            return Math.round((correct / total) * 100);
        },
        
        formatDate(date, format = 'YYYY-MM-DD') {
            try {
                const d = new Date(date);
                if (isNaN(d.getTime())) return I18n.t('invalidDate') || '无效日期';
                
                const year = d.getFullYear();
                const month = (d.getMonth() + 1).toString().padStart(2, '0');
                const day = d.getDate().toString().padStart(2, '0');
                const hours = d.getHours().toString().padStart(2, '0');
                const minutes = d.getMinutes().toString().padStart(2, '0');
                const seconds = d.getSeconds().toString().padStart(2, '0');
                
                return format
                    .replace('YYYY', year)
                    .replace('MM', month)
                    .replace('DD', day)
                    .replace('HH', hours)
                    .replace('mm', minutes)
                    .replace('ss', seconds);
            } catch (e) {
                return I18n.t('invalidDate') || '无效日期';
            }
        },
        
        formatNumber(num) {
            if (num === undefined || num === null) return '0';
            if (typeof num !== 'number') num = parseFloat(num);
            if (isNaN(num)) return '0';
            return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        },
        
        formatScore(score) {
            const maxScore = GAME_CONSTANTS.GAME_LIMITS.maxScore;
            if (score > maxScore) return `${this.formatNumber(maxScore)}+`;
            return this.formatNumber(score);
        }
    };

    // ==================== 验证工具 ====================
    const Validators = {
        isEmail(email) {
            if (!email || typeof email !== 'string') return false;
            const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return re.test(email);
        },
        
        isStrongPassword(password) {
            return password && typeof password === 'string' && password.length >= 6;
        },
        
        // 添加新的密码验证方法
        validatePassword(password) {
            const i18n = I18n;
            if (!password) return { 
                valid: false, 
                message: i18n.t('passwordRequired') || '密码不能为空' 
            };
            if (password.length < 6) return { 
                valid: false, 
                message: i18n.t('passwordTooShort') || '密码至少6位' 
            };
            return { valid: true, message: '' };
        },
        
        isValidRoomCode(code) {
            return code && typeof code === 'string' && /^[A-Z0-9]{6}$/i.test(code);
        },
        
        isInRange(num, min, max) {
            return typeof num === 'number' && num >= min && num <= max;
        },
        
        isValidGameMode(mode) {
            return ['challenge', 'standard', 'practice'].includes(mode);
        },
        
        isValidDifficulty(difficulty) {
            return ['easy', 'medium', 'hard'].includes(difficulty);
        }
    };

    // ==================== 性能工具 ====================
    const Performance = {
        throttle(func, limit) {
            let inThrottle;
            let lastFunc;
            let lastRan;
            
            return function(...args) {
                const context = this;
                
                if (!inThrottle) {
                    func.apply(context, args);
                    lastRan = Date.now();
                    inThrottle = true;
                    
                    setTimeout(() => {
                        inThrottle = false;
                    }, limit);
                } else {
                    clearTimeout(lastFunc);
                    lastFunc = setTimeout(() => {
                        if (Date.now() - lastRan >= limit) {
                            func.apply(context, args);
                            lastRan = Date.now();
                        }
                    }, Math.max(limit - (Date.now() - lastRan), 0));
                }
            };
        },
        
        debounce(func, delay) {
            let timeout;
            return function(...args) {
                const context = this;
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(context, args), delay);
            };
        },
        
        memoize(func) {
            const cache = new Map();
            return function(...args) {
                const key = JSON.stringify(args);
                if (cache.has(key)) {
                    return cache.get(key);
                }
                const result = func.apply(this, args);
                cache.set(key, result);
                return result;
            };
        }
    };

    // ==================== 安全导出 ====================
    // 检查是否已经存在同名对象，避免覆盖
    if (!global.SoundManager) global.SoundManager = SoundManager;
    if (!global.I18n) global.I18n = I18n;
    if (!global.GAME_CONSTANTS) global.GAME_CONSTANTS = GAME_CONSTANTS;
    if (!global.ArrayUtils) global.ArrayUtils = ArrayUtils;
    if (!global.NumberGenerator) global.NumberGenerator = NumberGenerator;
    if (!global.Formatters) global.Formatters = Formatters;
    if (!global.Validators) global.Validators = Validators;
    if (!global.Performance) global.Performance = Performance;

})(typeof window !== 'undefined' ? window : global);
