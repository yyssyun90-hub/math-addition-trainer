/**
 * ==================== 糖果数学消消乐 - 用户认证 ====================
 * 版本: 6.0.4 (仅限特定邮箱管理员版 - 修复版)
 * 功能：登录、注册（学生/教师）、密码重置、会话管理
 * 修改：管理员注册仅限 yyssyun90@gmail.com
 * 修复：getUserProfile 添加 Supabase 空值检查
 * =============================================================
 */

(function(global) {
    'use strict';

    class AuthManager {
        constructor(options = {}) {
            if (!options || typeof options !== 'object') {
                throw new Error('AuthManager 构造参数必须是对象');
            }

            this.dependencies = {
                supabase: options.supabase || (global.supabase || null),
                i18n: options.i18n || (global.I18n || null),
                game: options.game || {},
                storage: this.getStorage(options.storage)
            };
            
            this.game = this.dependencies.game;
            this._idCounter = 0;
            
            this.config = {
                maxRetries: this.validateNumber(options.maxRetries, 3, 1, 10),
                retryDelay: this.validateNumber(options.retryDelay, 1000, 500, 30000),
                sessionTimeout: this.validateNumber(options.sessionTimeout, 7 * 24 * 60 * 60 * 1000, 86400000, 2592000000),
                redirectUrl: this.validateString(options.redirectUrl, '/reset-password.html'),
                storageKey: this.validateString(options.storageKey, 'candy_math_auth'),
                userStorageKey: this.validateString(options.userStorageKey, 'candy_user'),
                enableLogging: this.validateBoolean(options.enableLogging, this.isDevelopment()),
                passwordMinLength: this.validateNumber(options.passwordMinLength, 6, 6, 128),
                sessionCheckInterval: this.validateNumber(options.sessionCheckInterval, 60000, 30000, 300000),
                maxConcurrentRequests: this.validateNumber(options.maxConcurrentRequests, 1, 1, 5),
                requestTimeout: this.validateNumber(options.requestTimeout, 15000, 5000, 60000),
                errorDisplayDuration: this.validateNumber(options.errorDisplayDuration, 5000, 3000, 10000),
                successDisplayDuration: this.validateNumber(options.successDisplayDuration, 3000, 2000, 5000)
            };
            
            this.ensureGameState();
            
            this.supabase = null;
            this.authMode = 'login';
            this.eventHandlers = new Map();
            this.authStateListener = null;
            this.isInitialized = false;
            this.timeouts = new Set();
            this.intervals = new Set();
            this.storageKeys = null;
            this.pendingAuth = new Map();
            this.elementCache = new Map();
            this.retryCount = 0;
            this.performanceMarks = new Map();
            this.storageListener = null;
            this.activeTabId = this.generateTabId();
            this.requestCounter = 0;
            this.passwordMemory = new WeakMap();
            this.autoFixTimer = null;
            this.metrics = {
                loginAttempts: 0,
                loginSuccess: 0,
                loginFailures: 0,
                registerAttempts: 0,
                registerSuccess: 0,
                registerFailures: 0,
                passwordResetRequests: 0,
                sessionRefreshes: 0,
                errors: []
            };
            
            this.autoFixSupabase();
            this.initStorageCheck();
            this.initNetworkMonitoring();
            this.initSessionCheck();
            this.setupGlobalAutoFix();
        }

        ensureGameState() {
            if (!this.game) {
                this.game = {};
            }
            if (!this.game.state) {
                this.game.state = {};
            }
        }

        autoFixSupabase() {
            try {
                if (!this.game || !this.game.state) {
                    return false;
                }
                
                if (this.game.state.supabase && !this.supabase) {
                    this.supabase = this.game.state.supabase;
                    this.isInitialized = true;
                    this.game.state.supabaseReady = true;
                    this.log('info', '自动修复 Supabase 连接成功');
                    return true;
                }
                return false;
            } catch (e) {
                this.log('warn', '自动修复 Supabase 连接失败', e);
                return false;
            }
        }

        setupGlobalAutoFix() {
            if (this.autoFixTimer) {
                clearTimeout(this.autoFixTimer);
            }
            
            this.autoFixTimer = setTimeout(() => {
                try {
                    if (!this.supabase && this.game?.state?.supabase) {
                        this.supabase = this.game.state.supabase;
                        this.isInitialized = true;
                        this.game.state.supabaseReady = true;
                        this.log('info', '全局自动修复 Supabase 连接成功');
                    }
                } catch (e) {
                    // 忽略错误
                } finally {
                    this.autoFixTimer = null;
                }
            }, 1000);
            
            this.timeouts.add(this.autoFixTimer);
        }

        // ==================== 工具方法 ====================

        isDevelopment() {
            try {
                return global.process && global.process.env && global.process.env.NODE_ENV === 'development';
            } catch (e) {
                return false;
            }
        }

        validateNumber(value, defaultValue, min, max) {
            if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
                return Math.max(min, Math.min(max, value));
            }
            return defaultValue;
        }

        validateString(value, defaultValue) {
            return typeof value === 'string' && value ? value : defaultValue;
        }

        validateBoolean(value, defaultValue) {
            return typeof value === 'boolean' ? value : defaultValue;
        }

        getStorage(storage) {
            if (storage) return storage;
            try {
                if (typeof localStorage !== 'undefined') {
                    localStorage.setItem('test', 'test');
                    localStorage.removeItem('test');
                    return localStorage;
                }
            } catch (e) {
                console.warn('localStorage 不可用，使用内存存储');
            }
            return this.createMemoryStorage();
        }

        createMemoryStorage() {
            const storage = new Map();
            return {
                getItem: (key) => storage.get(key) || null,
                setItem: (key, value) => storage.set(key, String(value)),
                removeItem: (key) => storage.delete(key),
                clear: () => storage.clear(),
                length: storage.size,
                key: (index) => Array.from(storage.keys())[index] || null
            };
        }

        generateTabId() {
            return 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '_' + performance.now();
        }

        generateUniqueId(prefix) {
            const timestamp = Date.now().toString(36);
            const random = Math.random().toString(36).substr(2, 6);
            const counter = (this._idCounter = (this._idCounter || 0) + 1);
            return `${prefix}${timestamp}${random}${counter}`;
        }

        log(level, message, data = null) {
            if (!this.config.enableLogging && level !== 'error') return;
            
            const sanitizedData = this.sanitizeLogData(data);
            const prefix = `[AuthManager][${level.toUpperCase()}]`;
            
            switch(level) {
                case 'error':
                    console.error(prefix, message, sanitizedData);
                    this.metrics.errors.push({
                        time: Date.now(),
                        message,
                        data: sanitizedData
                    });
                    if (this.metrics.errors.length > 100) {
                        this.metrics.errors.shift();
                    }
                    break;
                case 'warn':
                    console.warn(prefix, message, sanitizedData);
                    break;
                case 'info':
                    console.info(prefix, message, sanitizedData);
                    break;
                default:
                    console.log(prefix, message, sanitizedData);
            }
        }

        sanitizeLogData(data) {
            if (!data) return data;
            if (typeof data !== 'object') return data;
            
            const sensitiveKeys = ['password', 'token', 'access_token', 'refresh_token', 'secret', 'key', 'authorization'];
            const sanitized = Array.isArray(data) ? [] : {};
            
            for (const [key, value] of Object.entries(data)) {
                if (sensitiveKeys.some(k => key.toLowerCase().includes(k))) {
                    sanitized[key] = '[REDACTED]';
                } else if (value && typeof value === 'object') {
                    sanitized[key] = this.sanitizeLogData(value);
                } else {
                    sanitized[key] = value;
                }
            }
            
            return sanitized;
        }

        markStart(name) {
            if (!this.config.enableLogging) return;
            try {
                this.performanceMarks.set(name, performance.now());
            } catch (e) {}
        }

        markEnd(name) {
            if (!this.config.enableLogging) return;
            try {
                const start = this.performanceMarks.get(name);
                if (start) {
                    const duration = performance.now() - start;
                    this.log('info', `性能: ${name}`, { duration: `${duration.toFixed(2)}ms` });
                    this.performanceMarks.delete(name);
                }
            } catch (e) {}
        }

        initStorageCheck() {
            try {
                const testKey = '_test_' + Date.now();
                this.dependencies.storage.setItem(testKey, 'test');
                const value = this.dependencies.storage.getItem(testKey);
                if (value !== 'test') {
                    throw new Error('Storage read/write test failed');
                }
                this.dependencies.storage.removeItem(testKey);
                this.log('info', '存储系统正常');
            } catch (e) {
                this.log('error', '存储系统异常，使用内存存储', e);
                this.dependencies.storage = this.createMemoryStorage();
            }
        }

        initNetworkMonitoring() {
            if (typeof global.addEventListener === 'function') {
                const handleOnline = () => {
                    this.log('info', '网络已恢复');
                };
                
                const handleOffline = () => {
                    this.log('warn', '网络已断开');
                };
                
                global.addEventListener('online', handleOnline);
                global.addEventListener('offline', handleOffline);
                
                this.eventHandlers.set('network-online', { element: global, handler: handleOnline, type: 'online' });
                this.eventHandlers.set('network-offline', { element: global, handler: handleOffline, type: 'offline' });
            }
        }

        initSessionCheck() {
            const intervalId = setInterval(() => {
                this.checkSessionHealth();
            }, this.config.sessionCheckInterval);
            
            this.intervals.add(intervalId);
        }

        async checkSessionHealth() {
            if (!this.supabase || !this.game?.state?.supabaseReady) return;
            
            try {
                const session = await this.getSession();
                if (!session && this.getCurrentUser()) {
                    this.log('warn', '会话已过期，清除用户状态');
                    this.game.state.currentUser = null;
                    this.notifyUIUpdate();
                } else if (session) {
                    const expiresAt = session.expires_at * 1000;
                    const timeLeft = expiresAt - Date.now();
                    if (timeLeft < 5 * 60 * 1000) {
                        this.log('info', '会话即将过期，自动刷新');
                        await this.refreshSession();
                    }
                }
            } catch (e) {
                this.log('error', '会话健康检查失败', e);
            }
        }

        getStorageKeys() {
            if (!this.storageKeys) {
                this.storageKeys = (global.GAME_CONSTANTS && global.GAME_CONSTANTS.STORAGE_KEYS) 
                    ? global.GAME_CONSTANTS.STORAGE_KEYS 
                    : { USER: this.config.userStorageKey };
            }
            return this.storageKeys;
        }

        safeStorage(method, key, value = null) {
            if (!this.dependencies.storage) {
                return null;
            }

            try {
                if (method === 'get') {
                    return this.dependencies.storage.getItem(key);
                } else if (method === 'set') {
                    this.dependencies.storage.setItem(key, value);
                    return true;
                } else if (method === 'remove') {
                    this.dependencies.storage.removeItem(key);
                    return true;
                }
            } catch (e) {
                if (e.name === 'QuotaExceededError') {
                    this.log('warn', '存储配额不足，尝试清理');
                    this.cleanupOldStorage();
                } else {
                    this.log('warn', `存储 ${method} 操作失败`, e);
                }
                return null;
            }
        }

        cleanupOldStorage() {
            try {
                const keys = this.getStorageKeys();
                const currentUser = this.safeStorage('get', keys.USER);
                
                const allKeys = [];
                for (let i = 0; i < this.dependencies.storage.length; i++) {
                    const key = this.dependencies.storage.key(i);
                    if (key) allKeys.push(key);
                }
                
                const now = Date.now();
                let cleanedCount = 0;
                
                allKeys.forEach(key => {
                    if (key.startsWith('candy_')) {
                        try {
                            const value = this.dependencies.storage.getItem(key);
                            if (value) {
                                const data = JSON.parse(value);
                                if (data.expiry && data.expiry < now) {
                                    this.dependencies.storage.removeItem(key);
                                    cleanedCount++;
                                }
                            }
                        } catch (e) {}
                    }
                });
                
                this.log('info', '存储清理完成', { cleanedCount });
                
                if (currentUser) {
                    this.safeStorage('set', keys.USER, currentUser);
                }
            } catch (e) {
                this.log('error', '清理存储失败', e);
            }
        }

        setTimeout(callback, delay) {
            const timeoutId = setTimeout(() => {
                this.timeouts.delete(timeoutId);
                try {
                    callback();
                } catch (error) {
                    this.log('error', '定时器回调执行失败', error);
                }
            }, delay);
            this.timeouts.add(timeoutId);
            return timeoutId;
        }

        clearAllTimeouts() {
            this.timeouts.forEach(id => {
                try {
                    clearTimeout(id);
                } catch (e) {}
            });
            this.timeouts.clear();
        }

        clearAllIntervals() {
            this.intervals.forEach(id => {
                try {
                    clearInterval(id);
                } catch (e) {}
            });
            this.intervals.clear();
        }

        escapeHtml(text) {
            if (!text) return '';
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        getCachedElement(id) {
            if (!this.elementCache.has(id)) {
                const element = global.document?.getElementById(id);
                if (element) {
                    this.elementCache.set(id, element);
                }
                return element;
            }
            return this.elementCache.get(id);
        }

        clearElementCache() {
            this.elementCache.clear();
        }

        setModalAccessibility(modal, isOpen) {
            if (!modal) return;
            
            if (isOpen) {
                modal.setAttribute('role', 'dialog');
                modal.setAttribute('aria-modal', 'true');
                modal.setAttribute('aria-labelledby', 'auth-title');
                modal.setAttribute('aria-describedby', 'auth-error');
                
                const focusableElements = modal.querySelectorAll('button, input, [tabindex="0"]');
                if (focusableElements.length > 0) {
                    this.setTimeout(() => focusableElements[0].focus(), 100);
                }
                
                if (global.document?.body) {
                    global.document.body.style.overflow = 'hidden';
                }
            } else {
                modal.removeAttribute('role');
                modal.removeAttribute('aria-modal');
                if (global.document?.body) {
                    global.document.body.style.overflow = '';
                }
            }
        }

        canMakeRequest() {
            const activeRequests = Array.from(this.pendingAuth.values())
                .filter(v => v.active).length;
            return activeRequests < this.config.maxConcurrentRequests;
        }

        registerRequest(type) {
            const requestId = ++this.requestCounter;
            this.pendingAuth.set(requestId, { type, active: true, startTime: Date.now() });
            return requestId;
        }

        completeRequest(requestId) {
            this.pendingAuth.delete(requestId);
        }

        // ==================== Supabase 初始化 ====================

        async initSupabase(force = false) {
            this.markStart('initSupabase');
            
            if (!this.supabase) {
                this.autoFixSupabase();
            }
            
            if (!this.canMakeRequest()) {
                this.log('warn', '请求过多，稍后重试');
                this.markEnd('initSupabase');
                return false;
            }

            const requestId = this.registerRequest('init');

            try {
                if (!force && this.isInitialized && this.supabase) {
                    this.log('info', 'Supabase 已初始化，跳过');
                    this.markEnd('initSupabase');
                    this.completeRequest(requestId);
                    return true;
                }

                if (this.game?.state?.supabase) {
                    this.supabase = this.game.state.supabase;
                    this.game.state.supabaseReady = true;
                    this.isInitialized = true;
                    this.log('info', '从 game.state 获取 Supabase 成功');
                    
                    this.setupAuthListener();
                    
                    this.markEnd('initSupabase');
                    this.completeRequest(requestId);
                    return true;
                }

                const configScript = global.document?.getElementById('supabase-config');
                let SUPABASE_URL = '';
                let SUPABASE_ANON_KEY = '';
                
                if (configScript && configScript.textContent) {
                    try {
                        const config = JSON.parse(configScript.textContent);
                        SUPABASE_URL = this.sanitizeUrl(config.supabaseUrl);
                        SUPABASE_ANON_KEY = this.sanitizeString(config.supabaseKey);
                    } catch (e) {
                        this.log('error', '解析 Supabase 配置失败', e);
                        this.ensureGameState();
                        this.game.state.supabaseReady = false;
                        this.markEnd('initSupabase');
                        this.completeRequest(requestId);
                        return false;
                    }
                } else {
                    this.log('warn', '未找到 Supabase 配置脚本');
                    this.ensureGameState();
                    this.game.state.supabaseReady = false;
                    this.markEnd('initSupabase');
                    this.completeRequest(requestId);
                    return false;
                }

                if (!this.isValidSupabaseConfig(SUPABASE_URL, SUPABASE_ANON_KEY)) {
                    this.log('warn', 'Supabase 环境变量未配置');
                    this.ensureGameState();
                    this.game.state.supabaseReady = false;
                    this.markEnd('initSupabase');
                    this.completeRequest(requestId);
                    return false;
                }

                if (!this.dependencies.supabase || typeof this.dependencies.supabase.createClient !== 'function') {
                    this.log('error', 'Supabase SDK 未加载');
                    this.ensureGameState();
                    this.game.state.supabaseReady = false;
                    this.markEnd('initSupabase');
                    this.completeRequest(requestId);
                    return false;
                }

                this.supabase = this.dependencies.supabase.createClient(
                    SUPABASE_URL,
                    SUPABASE_ANON_KEY,
                    { 
                        auth: {
                            autoRefreshToken: true,
                            persistSession: true,
                            detectSessionInUrl: true
                        }
                    }
                );

                const { data: { session }, error } = await this.supabase.auth.getSession();
                if (error) throw error;

                if (session?.user) {
                    const profile = await this.getUserProfile(session.user.id);
                    this.updateCurrentUser(session.user, profile);
                }

                this.setupAuthListener();
                
                this.ensureGameState();
                this.game.state.supabase = this.supabase;
                this.game.state.supabaseReady = true;
                this.isInitialized = true;
                this.retryCount = 0;
                
                this.log('info', 'Supabase 连接成功');
                this.markEnd('initSupabase');
                this.completeRequest(requestId);
                return true;
            } catch (error) {
                this.log('error', 'Supabase 初始化失败', error);
                
                if (this.retryCount < this.config.maxRetries) {
                    this.retryCount++;
                    const delay = Math.min(
                        this.config.retryDelay * Math.pow(2, this.retryCount - 1),
                        30000
                    );
                    this.log('info', `重试初始化 (${this.retryCount}/${this.config.maxRetries})`, { delay });
                    
                    await this.sleep(delay);
                    
                    this.markEnd('initSupabase');
                    this.completeRequest(requestId);
                    return this.initSupabase(force);
                }
                
                this.ensureGameState();
                this.game.state.supabaseReady = false;
                this.supabase = null;
                this.isInitialized = false;
                this.markEnd('initSupabase');
                this.completeRequest(requestId);
                return false;
            }
        }

        async fetchWithTimeout(fn, options = { timeout: 15000 }) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), options.timeout);
            
            try {
                const result = await fn({ signal: controller.signal });
                clearTimeout(timeoutId);
                return result;
            } catch (error) {
                clearTimeout(timeoutId);
                if (error.name === 'AbortError') {
                    throw new Error('请求超时');
                }
                throw error;
            }
        }

        isValidSupabaseConfig(url, key) {
            if (!url || !key) return false;
            if (url === 'SUPABASE_URL_PLACEHOLDER' || key === 'SUPABASE_ANON_KEY_PLACEHOLDER') return false;
            if (!url.startsWith('https://')) return false;
            if (key.length < 20) return false;
            return true;
        }

        sanitizeUrl(url) {
            if (typeof url !== 'string') return '';
            if (url.startsWith('https://')) {
                return url.replace(/[<>"']/g, '');
            }
            return '';
        }

        sanitizeString(str) {
            if (typeof str !== 'string') return '';
            return str.replace(/[<>"']/g, '');
        }

        sleep(ms) {
            return new Promise(resolve => this.setTimeout(resolve, ms));
        }

        setupAuthListener() {
            if (!this.supabase) return;

            if (this.authStateListener) {
                try {
                    this.authStateListener.subscription?.unsubscribe();
                } catch (e) {
                    this.log('warn', '取消旧监听失败', e);
                }
                this.authStateListener = null;
            }

            try {
                const { data } = this.supabase.auth.onAuthStateChange(async (event, session) => {
                    try {
                        this.log('info', '认证状态变化', { event, userId: session?.user?.id });
                        
                        switch (event) {
                            case 'SIGNED_IN':
                                this.metrics.loginSuccess++;
                                if (session?.user) {
                                    const profile = await this.getUserProfile(session.user.id);
                                    this.updateCurrentUser(session.user, profile);
                                    this.notifyUIUpdate();
                                }
                                break;
                                
                            case 'TOKEN_REFRESHED':
                                this.metrics.sessionRefreshes++;
                                if (session?.user) {
                                    const profile = await this.getUserProfile(session.user.id);
                                    this.updateCurrentUser(session.user, profile);
                                }
                                break;
                                
                            case 'SIGNED_OUT':
                                this.ensureGameState();
                                this.game.state.currentUser = null;
                                this.clearUserFromStorage();
                                this.notifyUIUpdate();
                                break;
                                
                            case 'USER_UPDATED':
                                if (session?.user) {
                                    const profile = await this.getUserProfile(session.user.id);
                                    this.updateCurrentUser(session.user, profile);
                                }
                                break;
                        }
                    } catch (callbackError) {
                        this.log('error', '认证状态回调执行失败', callbackError);
                    }
                });

                this.authStateListener = data;
            } catch (error) {
                this.log('error', '设置认证监听失败', error);
            }
        }

        notifyUIUpdate() {
            if (this.game?.ui && typeof this.game.ui.updateUserUI === 'function') {
                try {
                    this.game.ui.updateUserUI();
                } catch (error) {
                    this.log('warn', '更新UI失败', error);
                }
            }
        }

        // ==================== 注册选择界面 ====================

        showRegisterChoice() {
            if (!this.supabase && !this.game?.state?.supabaseReady) {
                this.log('warn', 'Supabase未就绪，无法显示注册界面');
                this.showTemporaryMessage('系统初始化中，请稍后再试', '#ffa500');
                return;
            }
            
            const authModal = document.getElementById('auth-modal');
            if (authModal) {
                authModal.style.display = 'none';
            }
            
            const choiceModal = document.getElementById('register-choice-modal');
            if (choiceModal) {
                choiceModal.style.display = 'flex';
            } else {
                this.log('error', 'register-choice-modal 元素不存在');
            }
        }

        showStudentRegister() {
            const choiceModal = document.getElementById('register-choice-modal');
            if (choiceModal) {
                choiceModal.style.display = 'none';
            }
            
            const studentModal = document.getElementById('student-register-modal');
            if (studentModal) {
                studentModal.style.display = 'flex';
            } else {
                this.log('error', 'student-register-modal 元素不存在');
            }
        }

        showTeacherRegister() {
            const choiceModal = document.getElementById('register-choice-modal');
            if (choiceModal) {
                choiceModal.style.display = 'none';
            }
            
            const teacherModal = document.getElementById('teacher-register-modal');
            if (teacherModal) {
                teacherModal.style.display = 'flex';
            } else {
                this.log('error', 'teacher-register-modal 元素不存在');
            }
        }

        // ==================== 认证模态框 ====================

        showAuthModal(mode, prefillEmail = '') {
            if (!this.supabase) {
                this.autoFixSupabase();
            }
            
            if (!this.canMakeRequest()) {
                this.log('info', '已有认证操作进行中');
                this.showTemporaryMessage('操作进行中，请稍候...', '#ffa500');
                return;
            }

            this.clearAllTimeouts();

            const elements = this.getAuthModalElements();
            if (!this.validateModalElements(elements)) {
                this.log('error', '认证模态框元素缺失');
                return;
            }

            const { modal, title, submitBtn, switchDiv, emailInput, passwordInput, authError, forgotPasswordDiv } = elements;
            const passwordLabel = global.document?.querySelector('label[for="auth-password"]');
            
            const lang = this.getI18n();

            this.authMode = mode;

            this.clearAuthEventListeners();

            this.resetAuthForm(emailInput, passwordInput, authError, passwordLabel, forgotPasswordDiv);
            
            if (prefillEmail && emailInput) {
                emailInput.value = prefillEmail;
            }

            this.updateAuthModalUI(mode, {
                title,
                submitBtn,
                switchDiv,
                forgotPasswordDiv,
                passwordInput,
                passwordLabel,
                lang
            });

            this.setupSubmitButton(submitBtn, mode, authError, lang);
            
            this.addPasswordToggle(passwordInput);

            this.addKeyboardSupport(modal, submitBtn);

            modal.style.display = 'flex';
            modal.setAttribute('data-mode', mode);
            
            this.setModalAccessibility(modal, true);
        }

        showTemporaryMessage(message, color) {
            const authError = this.getCachedElement('auth-error');
            if (authError) {
                authError.style.color = color;
                authError.textContent = this.escapeHtml(message);
                
                this.setTimeout(() => {
                    if (authError) {
                        authError.textContent = '';
                    }
                }, this.config.errorDisplayDuration);
            }
        }

        addPasswordToggle(passwordInput) {
            if (!passwordInput) return;
            
            const container = passwordInput.parentNode;
            if (!container) return;
            
            if (container.querySelector('.password-toggle')) return;
            
            const toggle = global.document?.createElement('button');
            if (!toggle) return;
            
            toggle.type = 'button';
            toggle.className = 'password-toggle';
            toggle.innerHTML = '👁️';
            toggle.style.position = 'absolute';
            toggle.style.right = '20px';
            toggle.style.top = '50%';
            toggle.style.transform = 'translateY(-50%)';
            toggle.style.background = 'none';
            toggle.style.border = 'none';
            toggle.style.cursor = 'pointer';
            toggle.style.fontSize = '1.2rem';
            toggle.setAttribute('aria-label', this.getI18n().t('showPassword') || '显示密码');
            
            toggle.addEventListener('click', () => {
                const type = passwordInput.type === 'password' ? 'text' : 'password';
                passwordInput.type = type;
                toggle.innerHTML = type === 'password' ? '👁️' : '👁️‍🗨️';
                toggle.setAttribute('aria-label', 
                    type === 'password' 
                        ? (this.getI18n().t('showPassword') || '显示密码')
                        : (this.getI18n().t('hidePassword') || '隐藏密码')
                );
            });
            
            container.style.position = 'relative';
            container.appendChild(toggle);
        }

        addKeyboardSupport(modal, submitBtn) {
            const handleKeyDown = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    this.closeAuthModal();
                } else if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
                    e.preventDefault();
                    submitBtn.click();
                }
            };
            
            modal.addEventListener('keydown', handleKeyDown);
            this.eventHandlers.set('modal-keydown', { element: modal, handler: handleKeyDown, type: 'keydown' });
        }

        getI18n() {
            const i18n = this.dependencies.i18n || { t: (key) => key };
            
            if (i18n.direction === 'rtl') {
                this.applyRTLStyles();
            }
            
            return i18n;
        }

        applyRTLStyles() {
            const style = global.document?.createElement('style');
            if (style) {
                style.textContent = `
                    .auth-card { direction: rtl; }
                    .password-toggle { left: 20px; right: auto !important; }
                    .auth-switch span { float: right; }
                `;
                global.document?.head.appendChild(style);
            }
        }

        getAuthModalElements() {
            return {
                modal: this.getCachedElement('auth-modal'),
                title: this.getCachedElement('auth-title'),
                submitBtn: this.getCachedElement('auth-submit'),
                switchDiv: this.getCachedElement('auth-switch'),
                emailInput: this.getCachedElement('auth-email'),
                passwordInput: this.getCachedElement('auth-password'),
                authError: this.getCachedElement('auth-error'),
                forgotPasswordDiv: this.getCachedElement('forgot-password-link')
            };
        }

        validateModalElements(elements) {
            return !!(elements.modal && elements.title && elements.submitBtn && elements.switchDiv);
        }

        resetAuthForm(emailInput, passwordInput, authError, passwordLabel, forgotPasswordDiv) {
            if (emailInput) {
                emailInput.style.display = 'block';
                emailInput.disabled = false;
                emailInput.value = '';
            }
            
            if (passwordInput) {
                passwordInput.style.display = 'block';
                passwordInput.disabled = false;
                passwordInput.value = '';
                passwordInput.type = 'password';
            }
            
            if (passwordLabel) {
                passwordLabel.style.display = 'block';
            }
            
            if (authError) {
                authError.style.color = '#f44336';
                authError.textContent = '';
                if (authError && typeof authError.setAttribute === 'function') {
                    authError.setAttribute('aria-live', 'polite');
                }
            }

            if (forgotPasswordDiv) {
                forgotPasswordDiv.style.display = 'none';
                forgotPasswordDiv.innerHTML = '';
            }
            
            const toggle = global.document?.querySelector('.password-toggle');
            if (toggle) toggle.remove();
        }

        updateAuthModalUI(mode, elements) {
            const { title, submitBtn, switchDiv, forgotPasswordDiv, passwordInput, passwordLabel, lang } = elements;

            switchDiv.innerHTML = '';

            if (mode === 'login') {
                title.innerHTML = '🔐 ' + this.escapeHtml(lang.t('login') || '登录');
                submitBtn.innerHTML = this.escapeHtml(lang.t('login') || '登录');
                
                const registerSpan = global.document?.createElement('span');
                if (registerSpan) {
                    registerSpan.id = 'switch-to-register';
                    registerSpan.style.cursor = 'pointer';
                    registerSpan.style.color = '#667eea';
                    registerSpan.textContent = this.escapeHtml(lang.t('registerNow') || '立即注册');
                    
                    switchDiv.appendChild(global.document?.createTextNode(this.escapeHtml((lang.t('noAccount') || '没有账号') + ' ')));
                    switchDiv.appendChild(registerSpan);
                    
                    const registerHandler = () => this.showRegisterChoice();
                    registerSpan.addEventListener('click', registerHandler);
                    this.eventHandlers.set('switch-to-register', { element: registerSpan, handler: registerHandler, type: 'click' });
                }

                if (forgotPasswordDiv) {
                    forgotPasswordDiv.style.display = 'block';
                    forgotPasswordDiv.innerHTML = '';
                    
                    const forgotSpan = global.document?.createElement('span');
                    if (forgotSpan) {
                        forgotSpan.id = 'forgot-password';
                        forgotSpan.style.cursor = 'pointer';
                        forgotSpan.style.color = '#666';
                        forgotSpan.style.fontSize = '0.9em';
                        forgotSpan.style.textDecoration = 'underline';
                        forgotSpan.textContent = this.escapeHtml((lang.t('forgotPassword') || '忘记密码') + '?');
                        
                        const forgotHandler = (e) => {
                            e.preventDefault();
                            this.showForgotPasswordModal();
                        };
                        forgotSpan.addEventListener('click', forgotHandler);
                        
                        forgotPasswordDiv.appendChild(forgotSpan);
                        this.eventHandlers.set('forgot-password', { element: forgotSpan, handler: forgotHandler, type: 'click' });
                    }
                }
            } 
            else if (mode === 'register') {
                title.innerHTML = '📝 ' + this.escapeHtml(lang.t('register') || '注册');
                submitBtn.innerHTML = this.escapeHtml(lang.t('register') || '注册');
                
                const loginSpan = global.document?.createElement('span');
                if (loginSpan) {
                    loginSpan.id = 'switch-to-login';
                    loginSpan.style.cursor = 'pointer';
                    loginSpan.style.color = '#667eea';
                    loginSpan.textContent = this.escapeHtml(lang.t('loginNow') || '立即登录');
                    
                    switchDiv.appendChild(global.document?.createTextNode(this.escapeHtml((lang.t('hasAccount') || '已有账号') + ' ')));
                    switchDiv.appendChild(loginSpan);
                    
                    const loginHandler = () => this.showAuthModal('login');
                    loginSpan.addEventListener('click', loginHandler);
                    this.eventHandlers.set('switch-to-login', { element: loginSpan, handler: loginHandler, type: 'click' });
                }
                
                if (forgotPasswordDiv) {
                    forgotPasswordDiv.style.display = 'none';
                    forgotPasswordDiv.innerHTML = '';
                }
            } 
            else if (mode === 'forgot') {
                title.innerHTML = '🔑 ' + this.escapeHtml(lang.t('forgotPassword') || '忘记密码');
                submitBtn.innerHTML = this.escapeHtml(lang.t('sendResetLink') || '发送重置链接');
                
                const backSpan = global.document?.createElement('span');
                if (backSpan) {
                    backSpan.id = 'switch-to-login';
                    backSpan.style.cursor = 'pointer';
                    backSpan.style.color = '#667eea';
                    backSpan.textContent = this.escapeHtml(lang.t('backToLogin') || '返回登录');
                    
                    switchDiv.appendChild(backSpan);
                    
                    const backHandler = () => this.showAuthModal('login');
                    backSpan.addEventListener('click', backHandler);
                    this.eventHandlers.set('switch-to-login', { element: backSpan, handler: backHandler, type: 'click' });
                }
                
                if (passwordInput) {
                    passwordInput.style.display = 'none';
                    passwordInput.disabled = true;
                }
                
                if (passwordLabel) {
                    passwordLabel.style.display = 'none';
                }
                
                if (forgotPasswordDiv) {
                    forgotPasswordDiv.style.display = 'none';
                    forgotPasswordDiv.innerHTML = '';
                }
            }
        }

        setupSubmitButton(submitBtn, mode, authError, lang) {
            const oldSubmit = this.eventHandlers.get('auth-submit');
            if (oldSubmit) {
                oldSubmit.element.removeEventListener('click', oldSubmit.handler);
                this.eventHandlers.delete('auth-submit');
            }

            let submitHandler;
            if (mode === 'forgot') {
                submitHandler = (e) => {
                    e.preventDefault();
                    this.handleForgotPassword().catch(error => {
                        this.log('error', '忘记密码处理失败', error);
                        this.setAuthMessage(authError, '#f44336', 
                            lang.t('unexpectedError') || '发生未知错误，请重试');
                    });
                };
            } else {
                submitHandler = (e) => {
                    e.preventDefault();
                    
                    if (submitBtn.disabled) return;
                    
                    submitBtn.disabled = true;
                    
                    this.handleAuth().catch(error => {
                        this.log('error', '认证处理失败', error);
                        this.setAuthMessage(authError, '#f44336', 
                            lang.t('unexpectedError') || '发生未知错误，请重试');
                    }).finally(() => {
                        submitBtn.disabled = false;
                    });
                };
            }
            
            submitBtn.addEventListener('click', submitHandler);
            this.eventHandlers.set('auth-submit', { element: submitBtn, handler: submitHandler, type: 'click' });
        }

        showForgotPasswordModal() {
            const email = this.getCachedElement('auth-email')?.value || '';
            this.showAuthModal('forgot', email);
        }

        clearAuthEventListeners() {
            this.eventHandlers.forEach(({ element, handler, type }, key) => {
                if (element && typeof element.removeEventListener === 'function') {
                    try {
                        element.removeEventListener(type || 'click', handler);
                    } catch (e) {}
                }
            });
            this.eventHandlers.clear();
        }

        closeAuthModal() {
            this.clearAuthEventListeners();
            this.clearAllTimeouts();
            
            this.pendingAuth.clear();
            
            const modal = global.document?.getElementById('auth-modal');
            if (modal) {
                this.setModalAccessibility(modal, false);
                modal.style.display = 'none';
                
                const emailInput = global.document?.getElementById('auth-email');
                const passwordInput = global.document?.getElementById('auth-password');
                const authError = global.document?.getElementById('auth-error');
                const passwordLabel = global.document?.querySelector('label[for="auth-password"]');
                const forgotPasswordDiv = global.document?.getElementById('forgot-password-link');
                
                if (emailInput) {
                    emailInput.value = '';
                    emailInput.disabled = false;
                    emailInput.style.display = 'block';
                }
                if (passwordInput) {
                    passwordInput.value = '';
                    passwordInput.disabled = false;
                    passwordInput.style.display = 'block';
                    passwordInput.type = 'password';
                }
                if (authError) {
                    authError.textContent = '';
                }
                if (passwordLabel) {
                    passwordLabel.style.display = 'block';
                }
                if (forgotPasswordDiv) {
                    forgotPasswordDiv.style.display = 'none';
                    forgotPasswordDiv.innerHTML = '';
                }
                
                const toggle = global.document?.querySelector('.password-toggle');
                if (toggle) toggle.remove();
            }
        }

        // ==================== 认证处理 ====================

        validatePassword(password) {
            return typeof password === 'string' && password.length >= this.config.passwordMinLength;
        }

        validateEmail(email) {
            if (typeof email !== 'string') return false;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
        }

        async handleAuth() {
            if (!this.supabase) {
                this.autoFixSupabase();
            }
            
            if (!this.canMakeRequest()) {
                this.log('info', '已有认证操作进行中');
                this.showTemporaryMessage('操作进行中，请稍候...', '#ffa500');
                return;
            }

            this.markStart('handleAuth');

            const requestId = this.registerRequest('auth');

            const elements = this.getAuthModalElements();
            const email = elements.emailInput?.value?.trim() || '';
            const password = elements.passwordInput?.value || '';
            const authError = elements.authError;
            const submitBtn = elements.submitBtn;
            
            const lang = this.getI18n();

            if (!this.validateAuthInput(email, password, authError, lang)) {
                this.markEnd('handleAuth');
                this.completeRequest(requestId);
                return;
            }

            const isLogin = this.authMode === 'login';

            if (!this.checkSupabaseReady(authError, lang)) {
                this.markEnd('handleAuth');
                this.completeRequest(requestId);
                return;
            }

            if (isLogin) {
                this.metrics.loginAttempts++;
            } else {
                this.metrics.registerAttempts++;
            }

            const passwordPtr = {};
            this.passwordMemory.set(passwordPtr, password);

            try {
                this.setAuthMessage(authError, '#666', lang.t('processing') || '处理中...');

                const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
                if (!isOnline) {
                    throw new Error('network_offline');
                }

                const authPromise = isLogin 
                    ? this.login(email, password)
                    : this.register(email, password);
                    
                await this.fetchWithTimeout(() => authPromise, { timeout: this.config.requestTimeout });

                this.ensureGameState();
                this.game.state.isOnline = isOnline;
                
                if (elements.passwordInput) {
                    elements.passwordInput.value = '';
                }
                this.passwordMemory.delete(passwordPtr);
                
                if (isLogin) {
                    this.metrics.loginSuccess++;
                } else {
                    this.metrics.registerSuccess++;
                }
                
                await this.showAuthSuccess(isLogin, lang);
                
                this.closeAuthModal();
            } catch (error) {
                if (isLogin) {
                    this.metrics.loginFailures++;
                } else {
                    this.metrics.registerFailures++;
                }
                
                this.handleAuthError(error, authError, lang);
            } finally {
                this.passwordMemory.delete(passwordPtr);
                this.completeRequest(requestId);
                this.markEnd('handleAuth');
            }
        }

        setAuthMessage(authError, color, message) {
            if (!authError) {
                this.log('info', `[Auth Message] ${message}`);
                return;
            }
            
            try {
                if (typeof authError !== 'object') {
                    this.log('info', `[Auth Message] ${message}`);
                    return;
                }
                
                if (!authError.style) {
                    authError.style = {};
                }
                authError.style.color = color;
                authError.textContent = this.escapeHtml(message || '');
                if (authError && typeof authError.setAttribute === 'function') {
                    authError.setAttribute('aria-label', message || '');
                }
            } catch (e) {
                this.log('warn', '显示错误消息失败', e);
            }
        }

        validateAuthInput(email, password, authError, lang) {
            if (!email || !password) {
                this.setAuthMessage(authError, '#f44336', 
                    lang.t('emailAndPasswordRequired') || '邮箱和密码不能为空');
                return false;
            }

            if (!this.validateEmail(email)) {
                this.setAuthMessage(authError, '#f44336', 
                    lang.t('invalidEmail') || '请输入有效的邮箱地址');
                return false;
            }

            if (!this.validatePassword(password)) {
                this.setAuthMessage(authError, '#f44336', 
                    lang.t('passwordTooShort') || `密码至少${this.config.passwordMinLength}位`);
                return false;
            }

            return true;
        }

        checkSupabaseReady(authError, lang) {
            if (!this.supabase) {
                this.autoFixSupabase();
            }
            
            const isReady = !!(this.game?.state?.supabaseReady && this.supabase);
            
            if (!isReady) {
                if (this.game?.state?.supabase && !this.supabase) {
                    this.supabase = this.game.state.supabase;
                    this.isInitialized = true;
                    this.ensureGameState();
                    this.game.state.supabaseReady = true;
                    this.log('info', 'checkSupabaseReady 中自动修复成功');
                    return true;
                }
                
                const message = (lang?.t ? lang.t('supabaseNotConnected') : null) || 
                               'Supabase 未连接，请稍后重试';
                this.setAuthMessage(authError, '#f44336', message);
                return false;
            }
            
            return true;
        }

        async showAuthSuccess(isLogin, lang) {
            if (this.game?.ui && typeof this.game.ui.showFeedback === 'function') {
                try {
                    const message = isLogin ? 
                        (lang.t('loginSuccess') || '登录成功') : 
                        (lang.t('registerSuccess') || '注册成功');
                    this.game.ui.showFeedback(message, '#4CAF50');
                    this.notifyUIUpdate();
                } catch (error) {
                    this.log('warn', '显示成功反馈失败', error);
                }
            }
        }

        handleAuthError(error, authError, lang) {
            this.log('error', '认证失败', error);
            
            const errorMessage = this.getErrorMessage(error, lang, {
                'Invalid login credentials': 'invalidCredentials',
                'User already registered': 'userAlreadyExists',
                'Email rate limit exceeded': 'rateLimitExceeded',
                'Email not confirmed': 'emailNotConfirmed',
                'Invalid email': 'invalidEmail',
                'network_offline': 'networkOffline',
                '请求超时': 'requestTimeout',
                'timeout': 'requestTimeout',
                'NetworkError': 'networkError',
                'Failed to fetch': 'networkError'
            }, 'authFailed');
            
            this.setAuthMessage(authError, '#f44336', errorMessage);
        }

        getErrorMessage(error, lang, errorMap, defaultKey) {
            if (!error || !error.message) {
                return lang.t(defaultKey) || '认证失败，请稍后重试';
            }

            if (error.code && errorMap[error.code]) {
                return lang.t(errorMap[error.code]) || error.message;
            }

            for (const [key, value] of Object.entries(errorMap)) {
                if (error.message.includes(key)) {
                    return lang.t(value) || error.message;
                }
            }
            
            return lang.t('genericError') || '操作失败，请稍后重试';
        }

        async handleForgotPassword() {
            if (!this.supabase) {
                this.autoFixSupabase();
            }
            
            if (!this.canMakeRequest()) {
                this.log('info', '已有操作进行中');
                this.showTemporaryMessage('操作进行中，请稍候...', '#ffa500');
                return;
            }

            this.markStart('handleForgotPassword');

            const requestId = this.registerRequest('forgot');

            const elements = this.getAuthModalElements();
            const email = elements.emailInput?.value?.trim() || '';
            const authError = elements.authError;
            const submitBtn = elements.submitBtn;
            
            const lang = this.getI18n();

            if (!this.validateForgotPasswordInput(email, authError, lang)) {
                this.markEnd('handleForgotPassword');
                this.completeRequest(requestId);
                return;
            }

            if (!this.checkSupabaseReady(authError, lang)) {
                this.markEnd('handleForgotPassword');
                this.completeRequest(requestId);
                return;
            }

            this.metrics.passwordResetRequests++;

            try {
                this.setAuthMessage(authError, '#666', lang.t('sending') || '发送中...');

                const baseUrl = this.getBaseUrl();
                const redirectTo = baseUrl + this.config.redirectUrl;
                
                await this.fetchWithTimeout(
                    () => this.supabase.auth.resetPasswordForEmail(email, { redirectTo }),
                    { timeout: this.config.requestTimeout }
                );

                if (elements.emailInput) {
                    elements.emailInput.value = '';
                }

                this.showForgotPasswordSuccess(authError, lang);

                this.setTimeout(() => {
                    this.showAuthModal('login', email);
                }, this.config.successDisplayDuration);

            } catch (error) {
                this.handleForgotPasswordError(error, authError, lang);
            } finally {
                this.completeRequest(requestId);
                this.markEnd('handleForgotPassword');
            }
        }

        getBaseUrl() {
            if (typeof global === 'undefined') return '';
            return global.location?.origin || 
                   (global.location?.protocol + '//' + global.location?.host) || 
                   '';
        }

        validateForgotPasswordInput(email, authError, lang) {
            if (!email) {
                this.setAuthMessage(authError, '#f44336', 
                    lang.t('emailRequired') || '邮箱不能为空');
                return false;
            }

            if (!this.validateEmail(email)) {
                this.setAuthMessage(authError, '#f44336', 
                    lang.t('invalidEmail') || '请输入有效的邮箱地址');
                return false;
            }

            return true;
        }

        showForgotPasswordSuccess(authError, lang) {
            if (this.game?.ui && typeof this.game.ui.showFeedback === 'function') {
                try {
                    this.game.ui.showFeedback(
                        lang.t('passwordResetEmailSent') || '密码重置链接已发送', 
                        '#4CAF50'
                    );
                } catch (error) {
                    this.log('warn', '显示反馈失败', error);
                }
            }

            this.setAuthMessage(authError, '#4CAF50', 
                lang.t('resetEmailSent') || '密码重置链接已发送到您的邮箱，请查收');
        }

        handleForgotPasswordError(error, authError, lang) {
            this.log('error', '发送密码重置邮件失败', error);
            
            const errorMessage = this.getErrorMessage(error, lang, {
                'Email not found': 'emailNotFound',
                'rate limit': 'rateLimitExceeded',
                'Invalid email': 'invalidEmail',
                '请求超时': 'requestTimeout',
                'timeout': 'requestTimeout',
                'NetworkError': 'networkError',
                'Failed to fetch': 'networkError'
            }, 'sendFailed');
            
            this.setAuthMessage(authError, '#f44336', errorMessage);
        }

        // ==================== 登录 ====================

        async login(email, password) {
            if (!this.supabase) {
                throw new Error('Supabase 未初始化');
            }

            const { data, error } = await this.supabase.auth.signInWithPassword({
                email: email,
                password: password
            });

            if (error) throw error;

            if (!data || !data.user) {
                throw new Error('登录失败：未获取到用户信息');
            }

            const profile = await this.getUserProfile(data.user.id);
            this.updateCurrentUser(data.user, profile);
        }

        async register(email, password) {
            this.showRegisterChoice();
            return { user: null };
        }

        // ==================== 学生注册（自动生成学号版）====================

        /**
         * 获取或创建学校记录
         */
        async getOrCreateSchool(state, school) {
            if (!this.supabase) {
                this.log('warn', 'getOrCreateSchool: Supabase 未初始化');
                return null;
            }
            
            if (!state || !school) return null;
            
            // 查找现有学校
            const { data: existingSchool } = await this.supabase
                .from('schools')
                .select('id')
                .eq('school_name', school)
                .eq('state', state)
                .maybeSingle();

            if (existingSchool) {
                return existingSchool.id;
            }

            // 创建新学校
            const { data: newSchool, error: schoolError } = await this.supabase
                .from('schools')
                .insert([{ school_name: school, state: state }])
                .select()
                .single();

            if (schoolError) {
                this.log('warn', '创建学校失败:', schoolError);
                return null;
            }
            return newSchool.id;
        }

        /**
         * 获取或创建班级记录
         */
        async getOrCreateClass(schoolId, className) {
            if (!this.supabase) {
                this.log('warn', 'getOrCreateClass: Supabase 未初始化');
                return { classId: null, classCode: null };
            }
            
            if (!schoolId || !className) return { classId: null, classCode: null };

            // 查找现有班级
            const { data: existingClass } = await this.supabase
                .from('classes')
                .select('id, class_code')
                .eq('school_id', schoolId)
                .eq('class_name', className)
                .maybeSingle();

            if (existingClass) {
                return { classId: existingClass.id, classCode: existingClass.class_code };
            }

            // 生成班级代码
            const { data: schoolInfo } = await this.supabase
                .from('schools')
                .select('school_name, state')
                .eq('id', schoolId)
                .single();
            
            const schoolCode = (schoolInfo?.school_name || 'SCH').substring(0, 4).toUpperCase().replace(/[^A-Z]/g, '');
            const stateCode = (schoolInfo?.state || 'MY').substring(0, 2).toUpperCase();
            const randomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
            const classCode = `${stateCode}_${schoolCode}_${className}_${randomCode}`;
            const academicYear = new Date().getFullYear();

            // 创建新班级
            const { data: newClass, error: classError } = await this.supabase
                .from('classes')
                .insert([{
                    class_name: className,
                    school_id: schoolId,
                    class_code: classCode,
                    academic_year: academicYear
                }])
                .select()
                .single();

            if (classError) {
                this.log('warn', '创建班级失败:', classError);
                return { classId: null, classCode: null };
            }
            return { classId: newClass.id, classCode: newClass.class_code };
        }

        /**
         * 生成学生学号
         */
        async generateStudentId(state, school, studentClass) {
            if (!this.supabase) {
                this.log('warn', 'generateStudentId: Supabase 未初始化');
                return { studentId: `TEMP_${Date.now()}`, schoolId: null };
            }
            
            // 获取或创建学校
            const schoolId = await this.getOrCreateSchool(state, school);
            
            // 获取学校代码
            let schoolCode = school.substring(0, 4).toUpperCase().replace(/[^A-Z]/g, '');
            if (schoolCode.length < 3) {
                schoolCode = schoolCode.padEnd(3, 'X');
            }
            
            const year = new Date().getFullYear();
            const classShort = studentClass ? studentClass.replace(/[^0-9A-Z]/gi, '') : 'XXX';
            const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
            
            // 格式: 学校代码_学年_班级_随机码
            let studentId = `${schoolCode}_${year}_${classShort}_${randomNum}`;
            
            // 检查是否重复，如果重复则重新生成
            let attempts = 0;
            let isUnique = false;
            while (!isUnique && attempts < 5) {
                const { data: existing } = await this.supabase
                    .from('students')
                    .select('student_id')
                    .eq('student_id', studentId)
                    .maybeSingle();
                
                if (!existing) {
                    isUnique = true;
                } else {
                    const newRandom = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
                    studentId = `${schoolCode}_${year}_${classShort}_${newRandom}`;
                    attempts++;
                }
            }
            
            return { studentId, schoolId };
        }

        async registerStudent(email, password, state, school, name, studentClass) {
            this.markStart('registerStudent');
            const requestId = this.registerRequest('register');

            try {
                if (!email || !password || !state || !school || !name || !studentClass) {
                    throw new Error('所有字段都必须填写');
                }

                if (!this.validateEmail(email)) {
                    throw new Error('请输入有效的邮箱地址');
                }

                if (!this.validatePassword(password)) {
                    throw new Error(`密码至少需要${this.config.passwordMinLength}位`);
                }

                if (!this.supabase) {
                    throw new Error('Supabase 未初始化');
                }

                // 注册到 Supabase Auth
                const { data: authData, error: authError } = await this.supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            name: name,
                            role: 'student',
                            state: state,
                            school: school,
                            class: studentClass
                        }
                    }
                });

                if (authError) throw authError;
                if (!authData || !authData.user) throw new Error('注册失败：未获取到用户信息');

                // 生成学号
                const { studentId, schoolId } = await this.generateStudentId(state, school, studentClass);
                
                // 获取或创建班级
                let classId = null;
                let classCode = null;
                if (schoolId && studentClass) {
                    const classResult = await this.getOrCreateClass(schoolId, studentClass);
                    classId = classResult.classId;
                    classCode = classResult.classCode;
                }

                // 保存学生记录
                const studentData = {
                    student_id: studentId,
                    name: name,
                    class: studentClass,
                    role: 'student',
                    email: email,
                    state: state,
                    school: school,
                    user_id: authData.user.id,
                    school_id: schoolId,
                    class_id: classId
                };

                try {
                    const { error: studentError } = await this.supabase
                        .from('students')
                        .insert([studentData]);
                    
                    if (studentError) {
                        if (studentError.code === '42P01') {
                            this.log('warn', 'students表不存在，只使用auth metadata');
                        } else {
                            throw studentError;
                        }
                    }
                } catch (dbError) {
                    this.log('warn', '保存到students表失败', dbError);
                }

                this.updateCurrentUser(authData.user, {
                    role: 'student',
                    state: state,
                    school: school,
                    class: studentClass,
                    student_id: studentId,
                    name: name,
                    email: email
                });

                this.metrics.registerSuccess++;
                
                return { success: true, user: authData.user, studentId: studentId };

            } catch (error) {
                this.metrics.registerFailures++;
                console.error('学生注册失败:', error);
                return { success: false, error: error.message };
            } finally {
                this.completeRequest(requestId);
                this.markEnd('registerStudent');
            }
        }

        // ==================== 教师注册 ====================

        async registerTeacher(email, password, name, state, school) {
            this.markStart('registerTeacher');
            const requestId = this.registerRequest('register');

            try {
                if (!email || !password || !name || !state || !school) {
                    throw new Error('所有字段都必须填写');
                }

                if (!this.validateEmail(email)) {
                    throw new Error('请输入有效的邮箱地址');
                }

                if (!this.validatePassword(password)) {
                    throw new Error(`密码至少需要${this.config.passwordMinLength}位`);
                }

                if (!this.supabase) {
                    throw new Error('Supabase 未初始化');
                }

                const { data: authData, error: authError } = await this.supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            name: name,
                            role: 'teacher',
                            state: state,
                            school: school
                        }
                    }
                });

                if (authError) throw authError;
                if (!authData || !authData.user) throw new Error('注册失败：未获取到用户信息');

                // 获取或创建学校
                const schoolId = await this.getOrCreateSchool(state, school);
                const teacherId = this.generateUniqueId('T');

                const teacherData = {
                    teacher_id: teacherId,
                    name: name,
                    email: email,
                    state: state,
                    school: school,
                    role: 'teacher',
                    user_id: authData.user.id,
                    school_id: schoolId
                };

                try {
                    const { error: teacherError } = await this.supabase
                        .from('teachers')
                        .insert([teacherData]);
                    
                    if (teacherError) {
                        if (teacherError.code === '42P01') {
                            this.log('warn', 'teachers表不存在，只使用auth metadata');
                        } else {
                            throw teacherError;
                        }
                    }
                } catch (dbError) {
                    this.log('warn', '保存到teachers表失败', dbError);
                }

                this.updateCurrentUser(authData.user, {
                    role: 'teacher',
                    state: state,
                    school: school,
                    teacher_id: teacherId,
                    name: name,
                    email: email
                });

                this.metrics.registerSuccess++;
                
                return { success: true, user: authData.user };

            } catch (error) {
                this.metrics.registerFailures++;
                console.error('教师注册失败:', error);
                return { success: false, error: error.message };
            } finally {
                this.completeRequest(requestId);
                this.markEnd('registerTeacher');
            }
        }

        // ==================== 管理员注册（仅限特定邮箱）====================

        async registerAdmin(email, password, name) {
            // 只允许预设的管理员邮箱注册
            if (email !== 'yyssyun90@gmail.com') {
                console.warn('非授权用户尝试注册管理员:', email);
                return { 
                    success: false, 
                    error: '管理员账号仅限特定邮箱注册' 
                };
            }
            
            this.markStart('registerAdmin');
            const requestId = this.registerRequest('register');

            try {
                if (!email || !password || !name) {
                    throw new Error('所有字段都必须填写');
                }

                if (!this.validateEmail(email)) {
                    throw new Error('请输入有效的邮箱地址');
                }

                if (!this.validatePassword(password)) {
                    throw new Error(`密码至少需要${this.config.passwordMinLength}位`);
                }

                if (!this.supabase) {
                    throw new Error('Supabase 未初始化');
                }

                const { data: authData, error: authError } = await this.supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            name: name,
                            role: 'admin'
                        }
                    }
                });

                if (authError) throw authError;
                if (!authData || !authData.user) throw new Error('注册失败：未获取到用户信息');

                const adminData = {
                    user_id: authData.user.id,
                    email: email,
                    name: name,
                    role: 'admin',
                    permissions: ['view_all', 'manage_schools', 'manage_teachers']
                };

                try {
                    const { error: adminError } = await this.supabase
                        .from('admins')
                        .insert([adminData]);
                    
                    if (adminError) {
                        if (adminError.code === '42P01') {
                            this.log('warn', 'admins表不存在，只使用auth metadata');
                        } else {
                            throw adminError;
                        }
                    }
                } catch (dbError) {
                    this.log('warn', '保存到admins表失败', dbError);
                }

                this.updateCurrentUser(authData.user, {
                    role: 'admin',
                    name: name,
                    email: email,
                    permissions: adminData.permissions
                });

                this.metrics.registerSuccess++;
                
                return { success: true, user: authData.user };

            } catch (error) {
                this.metrics.registerFailures++;
                console.error('管理员注册失败:', error);
                return { success: false, error: error.message };
            } finally {
                this.completeRequest(requestId);
                this.markEnd('registerAdmin');
            }
        }

        // ==================== 用户资料 ====================

        /**
         * 获取用户资料 - 修复版：添加 Supabase 空值检查
         */
        async getUserProfile(userId) {
            // ✅ 添加参数验证
            if (!userId) {
                this.log('warn', 'getUserProfile: userId 为空');
                return null;
            }
            
            // ✅ 添加 Supabase 空值检查 - 这是修复的关键
            if (!this.supabase) {
                this.log('warn', 'getUserProfile: Supabase 未初始化，尝试自动修复');
                this.autoFixSupabase();
                if (!this.supabase) {
                    this.log('warn', 'getUserProfile: Supabase 仍未初始化，返回 null');
                    return null;
                }
            }
            
            try {
                // 先查 students 表（最常见）
                const { data: student, error: studentError } = await this.supabase
                    .from('students')
                    .select('*')
                    .eq('user_id', userId)
                    .maybeSingle();

                // 检查是否是表不存在的错误 (42P01)
                if (studentError && studentError.code === '42P01') {
                    this.log('warn', 'students 表不存在，跳过查询');
                } else if (!studentError && student) {
                    return { ...student, role: 'student' };
                }

                // 再查 teachers 表
                const { data: teacher, error: teacherError } = await this.supabase
                    .from('teachers')
                    .select('*')
                    .eq('user_id', userId)
                    .maybeSingle();

                if (teacherError && teacherError.code === '42P01') {
                    this.log('warn', 'teachers 表不存在，跳过查询');
                } else if (!teacherError && teacher) {
                    return { ...teacher, role: 'teacher' };
                }

                // 最后查 admins 表
                const { data: admin, error: adminError } = await this.supabase
                    .from('admins')
                    .select('*')
                    .eq('user_id', userId)
                    .maybeSingle();

                if (adminError && adminError.code === '42P01') {
                    this.log('warn', 'admins 表不存在，跳过查询');
                } else if (!adminError && admin) {
                    return { ...admin, role: 'admin' };
                }

                // 如果所有表都不存在或没有记录，返回 null（不是错误）
                return null;

            } catch (error) {
                // ✅ 捕获异常但返回 null，不抛出错误导致 UI 崩溃
                this.log('error', '获取用户资料失败', { 
                    userId: userId, 
                    errorMessage: error?.message,
                    errorCode: error?.code
                });
                return null;
            }
        }

        updateCurrentUser(user, profile = null) {
            if (!user) return;
            
            const email = user.email || '';
            const userMeta = user.user_metadata || {};
            
            let name = '用户';
            let role = 'student';
            let school = null;
            let state = null;
            let userClass = null;
            let studentId = null;
            let teacherId = null;
            let permissions = null;
            
            if (profile) {
                name = profile.name || userMeta.name || this.safeGetUsername(email);
                role = profile.role || 'student';
                school = profile.school || null;
                state = profile.state || null;
                userClass = profile.class || null;
                studentId = profile.student_id || null;
                teacherId = profile.teacher_id || null;
                permissions = profile.permissions || null;
            } else {
                name = userMeta.name || this.safeGetUsername(email);
                role = userMeta.role || 'student';
                school = userMeta.school || null;
                state = userMeta.state || null;
                userClass = userMeta.class || null;
            }
            
            this.ensureGameState();
            this.game.state.currentUser = {
                id: user.id,
                email: email,
                name: name,
                role: role,
                school: school,
                state: state,
                class: userClass,
                student_id: studentId,
                teacher_id: teacherId,
                permissions: permissions,
                metadata: { ...userMeta },
                lastUpdated: Date.now()
            };

            this.saveUserToStorage();
        }

        safeGetUsername(email) {
            if (!email || typeof email !== 'string') return '用户';
            const parts = email.split('@');
            return parts[0] || '用户';
        }

        // ==================== 登出 ====================

        async logout() {
            if (!this.canMakeRequest()) {
                return;
            }

            this.markStart('logout');
            const requestId = this.registerRequest('logout');

            try {
                if (this.game?.state?.supabaseReady && this.supabase) {
                    await this.fetchWithTimeout(
                        () => this.supabase.auth.signOut(),
                        { timeout: this.config.requestTimeout }
                    );
                }

                this.ensureGameState();
                this.game.state.currentUser = null;
                this.clearUserFromStorage();
                
                this.notifyUIUpdate();
                
                if (this.game?.ui && typeof this.game.ui.showFeedback === 'function') {
                    const lang = this.getI18n();
                    this.game.ui.showFeedback(lang.t('logoutSuccess') || '已退出登录', '#ffa500');
                }
            } catch (error) {
                this.log('error', '登出失败', error);
                
                this.ensureGameState();
                this.game.state.currentUser = null;
                this.clearUserFromStorage();
                this.notifyUIUpdate();
            } finally {
                this.completeRequest(requestId);
                this.markEnd('logout');
            }
        }

        // ==================== 本地存储 ====================

        saveUserToStorage() {
            if (!this.game?.state?.currentUser) return;
            
            const keys = this.getStorageKeys();
            
            const userToSave = {
                id: this.game.state.currentUser.id,
                email: this.game.state.currentUser.email,
                name: this.game.state.currentUser.name,
                role: this.game.state.currentUser.role,
                school: this.game.state.currentUser.school,
                state: this.game.state.currentUser.state,
                class: this.game.state.currentUser.class,
                student_id: this.game.state.currentUser.student_id,
                teacher_id: this.game.state.currentUser.teacher_id,
                permissions: this.game.state.currentUser.permissions,
                lastUpdated: this.game.state.currentUser.lastUpdated
            };
            
            const serialized = JSON.stringify(userToSave);
            
            try {
                const lastSaved = this.safeStorage('get', keys.USER);
                if (lastSaved === serialized) {
                    return;
                }
                this.safeStorage('set', keys.USER, serialized);
            } catch (e) {
                this.log('warn', '保存用户数据失败', e);
            }
        }

        clearUserFromStorage() {
            const keys = this.getStorageKeys();
            this.safeStorage('remove', keys.USER);
        }

        // ==================== 会话管理 ====================

        loadUserSession() {
            const keys = this.getStorageKeys();
            const savedUser = this.safeStorage('get', keys.USER);
            
            if (!savedUser) return;

            try {
                const user = JSON.parse(savedUser);
                if (this.validateUserData(user)) {
                    const now = Date.now();
                    const lastUpdated = user.lastUpdated || 0;
                    if (now - lastUpdated > this.config.sessionTimeout) {
                        this.log('info', '用户会话已过期，需要重新登录');
                        this.clearUserFromStorage();
                        return;
                    }
                    
                    this.ensureGameState();
                    this.game.state.currentUser = user;
                } else {
                    throw new Error('无效的用户数据格式');
                }
            } catch (e) {
                this.log('warn', '加载用户会话失败', e);
                this.clearUserFromStorage();
                if (this.game?.state) {
                    this.game.state.currentUser = null;
                }
            }
        }

        validateUserData(user) {
            return user && 
                   typeof user === 'object' && 
                   typeof user.id === 'string' && 
                   user.id.length > 0 &&
                   typeof user.email === 'string' &&
                   user.email.includes('@');
        }

        isLoggedIn() {
            return !!(this.game?.state && this.game.state.currentUser);
        }

        getCurrentUser() {
            return this.game?.state ? this.game.state.currentUser : null;
        }

        async refreshSession() {
            if (!this.supabase || !this.game?.state?.supabaseReady) return false;
            
            if (!this.canMakeRequest()) {
                return false;
            }

            this.markStart('refreshSession');
            const requestId = this.registerRequest('refresh');

            try {
                const { data, error } = await this.fetchWithTimeout(
                    () => this.supabase.auth.refreshSession(),
                    { timeout: this.config.requestTimeout }
                );
                
                if (error) throw error;
                
                if (data && data.session && data.user) {
                    const profile = await this.getUserProfile(data.user.id);
                    this.updateCurrentUser(data.user, profile);
                    return true;
                }
                return false;
            } catch (error) {
                this.log('error', '刷新会话失败', error);
                return false;
            } finally {
                this.completeRequest(requestId);
                this.markEnd('refreshSession');
            }
        }

        async handlePasswordReset(newPassword) {
            this.markStart('handlePasswordReset');
            const requestId = this.registerRequest('reset');
            
            if (!this.supabase || !this.game?.state?.supabaseReady) {
                throw new Error('Supabase 未连接');
            }

            if (typeof newPassword !== 'string' || !this.validatePassword(newPassword)) {
                throw new Error(`密码至少需要${this.config.passwordMinLength}位`);
            }

            try {
                const { error } = await this.fetchWithTimeout(
                    () => this.supabase.auth.updateUser({ password: newPassword }),
                    { timeout: this.config.requestTimeout }
                );

                if (error) throw error;
                
                this.clearUserFromStorage();
                
                if (this.game?.ui && typeof this.game.ui.showFeedback === 'function') {
                    const lang = this.getI18n();
                    this.game.ui.showFeedback(
                        lang.t('passwordResetSuccess') || '密码重置成功，请重新登录', 
                        '#4CAF50'
                    );
                }
                
                this.markEnd('handlePasswordReset');
                this.completeRequest(requestId);
                return true;
            } catch (error) {
                this.log('error', '密码重置失败', error);
                this.markEnd('handlePasswordReset');
                this.completeRequest(requestId);
                throw error;
            }
        }

        async getSession() {
            if (!this.supabase || !this.game?.state?.supabaseReady) {
                return null;
            }

            try {
                const { data, error } = await this.supabase.auth.getSession();
                if (error) throw error;
                return data.session;
            } catch (error) {
                this.log('error', '获取会话失败', error);
                return null;
            }
        }

        onAuthStateChange(callback) {
            if (!this.supabase) {
                this.log('warn', 'Supabase 未初始化，无法监听认证状态');
                return {
                    data: {
                        subscription: {
                            unsubscribe: () => {}
                        }
                    }
                };
            }

            return this.supabase.auth.onAuthStateChange((event, session) => {
                if (typeof callback === 'function') {
                    try {
                        callback(event, session);
                    } catch (error) {
                        this.log('error', '认证状态回调执行失败', error);
                    }
                }
            });
        }

        getMetrics() {
            return { ...this.metrics };
        }

        destroy() {
            this.log('info', '销毁 AuthManager 实例');
            
            this.clearAuthEventListeners();
            this.clearAllTimeouts();
            this.clearAllIntervals();
            this.clearElementCache();
            
            if (this.authStateListener) {
                try {
                    this.authStateListener.subscription?.unsubscribe();
                } catch (e) {}
                this.authStateListener = null;
            }
            
            if (this.autoFixTimer) {
                clearTimeout(this.autoFixTimer);
                this.autoFixTimer = null;
            }
            
            this.supabase = null;
            
            if (this.game?.state) {
                this.game.state.supabase = null;
                this.game.state.supabaseReady = false;
            }
            
            this.isInitialized = false;
            this.storageKeys = null;
            this.pendingAuth.clear();
            this.performanceMarks.clear();
            this.passwordMemory = new WeakMap();
            
            this.log('info', 'AuthManager 已销毁');
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AuthManager;
    } else if (typeof define === 'function' && define.amd) {
        define([], () => AuthManager);
    } else {
        global.AuthManager = AuthManager;
    }

})(typeof window !== 'undefined' ? window : global);
