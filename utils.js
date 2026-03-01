/**
 * ==================== 糖果数学消消乐 - 工具函数库 ====================
 * 包含：音效管理、国际化、常量定义、数组工具、数字生成、格式化等
 * 作者：AI 程序员 和 TYUN
 * 日期：2024
 * =================================================================
 */

// ==================== 音效管理器 ====================
const SoundManager = (function() {
    let instance = null;
    
    class SoundManagerClass {
        constructor() {
            if (instance) return instance;
            instance = this;
            
            this.audioContext = null;
            this.muted = localStorage.getItem('candyMathGame_v4_sound_muted') === 'true';
            this.volume = parseInt(localStorage.getItem('candyMathGame_v4_sound_volume') || '70') / 100;
            this.init();
        }
        
        init() {
            document.addEventListener('click', () => {
                if (!this.audioContext) {
                    try {
                        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    } catch (e) {
                        console.warn('Web Audio API 不支持');
                    }
                }
            }, { once: true });
            
            // 更新UI图标，确保DOM已加载
            this.updateIcon();
        }
        
        play(type) {
            if (this.muted || !this.audioContext) return;
            
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
            localStorage.setItem('candyMathGame_v4_sound_muted', this.muted);
            this.updateIcon();
            return this.muted;
        }
        
        setVolume(value) {
            this.volume = value / 100;
            localStorage.setItem('candyMathGame_v4_sound_volume', value);
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
        rematch: '再战一局'
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
        rematch: 'Rematch'
    }
};

const I18n = {
    currentLang: localStorage.getItem('candyMathGame_v4_lang') || 'zh',
    
    t(key) {
        return TRANSLATIONS[this.currentLang]?.[key] || key;
    },
    
    setLang(lang) {
        if (TRANSLATIONS[lang]) {
            this.currentLang = lang;
            localStorage.setItem('candyMathGame_v4_lang', lang);
        }
        return this.currentLang;
    },
    
    getLang() {
        return this.currentLang;
    },
    
    getAllTranslations() {
        return TRANSLATIONS;
    }
};

// ==================== 常量定义 ====================
const GAME_CONSTANTS = {
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
            numberRange: { min: 0, max: 14 },
            targetRange: { min: 6, max: 16 },
            timeBonus: 1,
            scoreMultiplier: 1.5
        },
        hard: {
            numberRange: { min: 5, max: 18 },
            targetRange: { min: 8, max: 20 },
            timeBonus: 0.8,
            scoreMultiplier: 2
        }
    },
    
    MODE_CONFIG: {
        challenge: { timeLimit: 90, targetCount: null },
        standard: { timeLimit: null, targetCount: 30 },
        practice: { timeLimit: null, targetCount: null }
    }
};

// ==================== 数组工具 ====================
const ArrayUtils = {
    shuffle(arr) {
        const array = [...arr];
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    },
    
    unique(arr) {
        return [...new Set(arr)];
    },
    
    randomItem(arr) {
        if (!arr || arr.length === 0) return null;
        return arr[Math.floor(Math.random() * arr.length)];
    },
    
    hasPairSum(nums, target) {
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
        const map = new Map();
        for (let i = 0; i < nums.length; i++) {
            const complement = target - nums[i];
            if (map.has(complement)) {
                return [map.get(complement), i];
            }
            map.set(nums[i], i);
        }
        return null;
    }
};

// ==================== 数字生成工具 ====================
const NumberGenerator = {
    random(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    
    generateGridNumbers(range, target, size = 10) {
        const { min, max } = range;
        const numbers = [];
        
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
            return null;
        }
        
        while (numbers.length < size) {
            numbers.push(this.random(min, max));
        }
        
        return ArrayUtils.shuffle(numbers);
    },
    
    generateTarget(range, minSum, maxSum) {
        const actualMin = Math.max(range.min, minSum);
        const actualMax = Math.min(range.max, maxSum);
        return this.random(actualMin, actualMax);
    }
};

// ==================== 格式化工具 ====================
const Formatters = {
    formatTime(seconds) {
        if (seconds < 0) seconds = 0;
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    },
    
    calculateAccuracy(correct, total) {
        if (total === 0) return 100;
        return Math.round((correct / total) * 100);
    },
    
    formatDate(date, format = 'YYYY-MM-DD') {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '无效日期';
        
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
    },
    
    formatNumber(num) {
        if (num === undefined || num === null) return '0';
        return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }
};

// ==================== 验证工具 ====================
const Validators = {
    isEmail(email) {
        if (!email) return false;
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },
    
    isStrongPassword(password) {
        return password && password.length >= 6;
    },
    
    isValidRoomCode(code) {
        return code && /^[A-Z0-9]{6}$/i.test(code);
    }
};

// ==================== 性能工具 ====================
const Performance = {
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },
    
    debounce(func, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }
};

// ==================== 导出到全局 ====================
window.SoundManager = SoundManager;
window.I18n = I18n;
window.GAME_CONSTANTS = GAME_CONSTANTS;
window.ArrayUtils = ArrayUtils;
window.NumberGenerator = NumberGenerator;
window.Formatters = Formatters;
window.Validators = Validators;
window.Performance = Performance;