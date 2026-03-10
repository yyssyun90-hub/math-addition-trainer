/**
 * ==================== 糖果数学消消乐 - 用户认证 ====================
 * 版本: 4.0.2 (终极修复版)
 * 最后更新: 2024-01-20
 * 修复内容:
 * - 优化自动修复逻辑，避免重复调用
 * - 完善边界条件检查
 * - 修复内存泄漏问题
 * - 增强代码健壮性
 * =============================================================
 */

(function(global) {
    'use strict';

    class AuthManager {
        constructor(options = {}) {
            // 参数验证
            if (!options || typeof options !== 'object') {
                throw new Error('AuthManager 构造参数必须是对象');
            }

            // 依赖注入
            this.dependencies = {
                supabase: options.supabase || (global.supabase || null),
                i18n: options.i18n || (global.I18n || null),
                game: options.game || {},
                storage: this.getStorage(options.storage)
            };
            
            // 配置管理
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
            
            // 确保game对象存在
            this.game = this.dependencies.game;
            this.ensureGameState();
            
            // 状态管理
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
            this.autoFixTimer = null; // 用于清理自动修复定时器
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
            
            // 自动修复 Supabase 连接
            this.autoFixSupabase();
            
            // 初始化检查
            this.initStorageCheck();
            this.initNetworkMonitoring();
            this.initSessionCheck();
            this.setupGlobalAutoFix();
        }

        /**
         * 确保 game.state 存在
         */
        ensureGameState() {
            if (!this.game) {
                this.game = {};
            }
            if (!this.game.state) {
                this.game.state = {};
            }
        }

        /**
         * 自动修复 Supabase 连接
         */
        autoFixSupabase() {
            try {
                // 安全检查
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

        /**
         * 设置全局自动修复（只在需要时执行）
         */
        setupGlobalAutoFix() {
            // 清理旧的定时器
            if (this.autoFixTimer) {
                clearTimeout(this.autoFixTimer);
            }
            
            // 设置新的定时器
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
            
            // 将定时器加入管理集合
            this.timeouts.add(this.autoFixTimer);
        }

        // ==================== 工具方法 ====================

        /**
         * 判断是否为开发环境
         */
        isDevelopment() {
            try {
                return global.process && global.process.env && global.process.env.NODE_ENV === 'development';
            } catch (e) {
                return false;
            }
        }

        /**
         * 验证数字参数
         */
        validateNumber(value, defaultValue, min, max) {
            if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
                return Math.max(min, Math.min(max, value));
            }
            return defaultValue;
        }

        /**
         * 验证字符串参数
         */
        validateString(value, defaultValue) {
            return typeof value === 'string' && value ? value : defaultValue;
        }

        /**
         * 验证布尔参数
         */
        validateBoolean(value, defaultValue) {
            return typeof value === 'boolean' ? value : defaultValue;
        }

        /**
         * 安全获取存储对象
         */
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

        /**
         * 创建内存存储
         */
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

        /**
         * 生成唯一的标签页ID
         */
        generateTabId() {
            return 'tab_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '_' + performance.now();
        }

        /**
         * 日志记录
         */
        log(level, message, data = null) {
            if (!this.config.enableLogging && level !== 'error') return;
            
            const sanitizedData = this.sanitizeLogData(data);
            
            const logEntry = {
                timestamp: new Date().toISOString(),
                level,
                message,
                data: sanitizedData,
                tabId: this.activeTabId,
                userId: this.getCurrentUser()?.id,
                url: global.location?.href,
                userAgent: global.navigator?.userAgent
            };
            
            if (this.performanceMarks.size > 0) {
                logEntry.performance = Object.fromEntries(this.performanceMarks);
            }
            
            logEntry.metrics = { ...this.metrics };
            
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

        /**
         * 清理日志数据
         */
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

        /**
         * 性能标记开始
         */
        markStart(name) {
            if (!this.config.enableLogging) return;
            try {
                this.performanceMarks.set(name, performance.now());
            } catch (e) {
                // 忽略
            }
        }

        /**
         * 性能标记结束
         */
        markEnd(name) {
            if (!this.config.enableLogging) return;
            try {
                const start = this.performanceMarks.get(name);
                if (start) {
                    const duration = performance.now() - start;
                    this.log('info', `性能: ${name}`, { duration: `${duration.toFixed(2)}ms` });
                    this.performanceMarks.delete(name);
                }
            } catch (e) {
                // 忽略
            }
        }

        /**
         * 初始化存储检查
         */
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

        /**
         * 初始化网络监控
         */
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
                
                // 保存事件处理器以便清理
                this.eventHandlers.set('network-online', { element: global, handler: handleOnline, type: 'online' });
                this.eventHandlers.set('network-offline', { element: global, handler: handleOffline, type: 'offline' });
            }
        }

        /**
         * 初始化会话检查
         */
        initSessionCheck() {
            const intervalId = setInterval(() => {
                this.checkSessionHealth();
            }, this.config.sessionCheckInterval);
            
            this.intervals.add(intervalId);
        }

        /**
         * 检查会话健康状态
         */
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

        /**
         * 获取存储键名
         */
        getStorageKeys() {
            if (!this.storageKeys) {
                this.storageKeys = (global.GAME_CONSTANTS && global.GAME_CONSTANTS.STORAGE_KEYS) 
                    ? global.GAME_CONSTANTS.STORAGE_KEYS 
                    : { USER: this.config.userStorageKey };
            }
            return this.storageKeys;
        }

        /**
         * 安全地访问存储
         */
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

        /**
         * 清理旧的存储数据
         */
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
                        } catch (e) {
                            // 忽略错误
                        }
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

        /**
         * 安全地设置超时
         */
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

        /**
         * 清除所有超时
         */
        clearAllTimeouts() {
            this.timeouts.forEach(id => {
                try {
                    clearTimeout(id);
                } catch (e) {
                    // 忽略错误
                }
            });
            this.timeouts.clear();
        }

        /**
         * 清除所有定时器
         */
        clearAllIntervals() {
            this.intervals.forEach(id => {
                try {
                    clearInterval(id);
                } catch (e) {
                    // 忽略错误
                }
            });
            this.intervals.clear();
        }

        /**
         * 安全的HTML转义
         */
        escapeHtml(text) {
            if (!text) return '';
            return String(text)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#039;');
        }

        /**
         * 获取缓存的DOM元素
         */
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

        /**
         * 清除元素缓存
         */
        clearElementCache() {
            this.elementCache.clear();
        }

        /**
         * 设置模态框可访问性
         */
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

        /**
         * 检查并发请求限制
         */
        canMakeRequest() {
            const activeRequests = Array.from(this.pendingAuth.values())
                .filter(v => v.active).length;
            return activeRequests < this.config.maxConcurrentRequests;
        }

        /**
         * 注册请求
         */
        registerRequest(type) {
            const requestId = ++this.requestCounter;
            this.pendingAuth.set(requestId, { type, active: true, startTime: Date.now() });
            return requestId;
        }

        /**
         * 完成请求
         */
        completeRequest(requestId) {
            this.pendingAuth.delete(requestId);
        }

        // ==================== Supabase 初始化 ====================

        /**
         * 初始化 Supabase 客户端
         */
        async initSupabase(force = false) {
            this.markStart('initSupabase');
            
            // 尝试自动修复（但不过度调用）
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

                // 从 game.state 获取 Supabase
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

                // 从 script 标签获取 Supabase 配置
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

                // 创建客户端
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

                // 测试连接
                const { data: { session }, error } = await this.supabase.auth.getSession();
                if (error) throw error;

                if (session?.user) {
                    this.updateCurrentUser(session.user);
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

        /**
         * 带超时的fetch
         */
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

        /**
         * 验证Supabase配置
         */
        isValidSupabaseConfig(url, key) {
            if (!url || !key) return false;
            if (url === 'SUPABASE_URL_PLACEHOLDER' || key === 'SUPABASE_ANON_KEY_PLACEHOLDER') return false;
            if (!url.startsWith('https://')) return false;
            if (key.length < 20) return false;
            return true;
        }

        /**
         * 清理URL
         */
        sanitizeUrl(url) {
            if (typeof url !== 'string') return '';
            if (url.startsWith('https://')) {
                return url.replace(/[<>"']/g, '');
            }
            return '';
        }

        /**
         * 清理字符串
         */
        sanitizeString(str) {
            if (typeof str !== 'string') return '';
            return str.replace(/[<>"']/g, '');
        }

        /**
         * 睡眠函数
         */
        sleep(ms) {
            return new Promise(resolve => this.setTimeout(resolve, ms));
        }

        /**
         * 设置认证状态监听
         */
        setupAuthListener() {
            if (!this.supabase) return;

            if (this.authStateListener) {
                this.authStateListener.subscription?.unsubscribe();
            }

            try {
                const { data } = this.supabase.auth.onAuthStateChange((event, session) => {
                    try {
                        this.log('info', '认证状态变化', { event, userId: session?.user?.id });
                        
                        switch (event) {
                            case 'SIGNED_IN':
                                this.metrics.loginSuccess++;
                                if (session?.user) {
                                    this.updateCurrentUser(session.user);
                                    this.notifyUIUpdate();
                                }
                                break;
                                
                            case 'TOKEN_REFRESHED':
                                this.metrics.sessionRefreshes++;
                                if (session?.user) {
                                    this.updateCurrentUser(session.user);
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
                                    this.updateCurrentUser(session.user);
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

        /**
         * 通知UI更新
         */
        notifyUIUpdate() {
            if (this.game.ui && typeof this.game.ui.updateUserUI === 'function') {
                try {
                    this.game.ui.updateUserUI();
                } catch (error) {
                    this.log('warn', '更新UI失败', error);
                }
            }
        }

        // ==================== 认证模态框 ====================

        /**
         * 显示认证模态框
         */
        showAuthModal(mode, prefillEmail = '') {
            // 尝试自动修复（但不过度调用）
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

        /**
         * 显示临时消息
         */
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

        /**
         * 添加密码可见性切换
         */
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

        /**
         * 添加键盘支持
         */
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

        /**
         * 获取I18n对象
         */
        getI18n() {
            const i18n = this.dependencies.i18n || { t: (key) => key };
            
            if (i18n.direction === 'rtl') {
                this.applyRTLStyles();
            }
            
            return i18n;
        }

        /**
         * 应用RTL样式
         */
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

        /**
         * 获取认证模态框DOM元素
         */
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

        /**
         * 验证模态框元素
         */
        validateModalElements(elements) {
            return !!(elements.modal && elements.title && elements.submitBtn && elements.switchDiv);
        }

        /**
         * 重置认证表单
         */
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

        /**
         * 更新认证模态框UI
         */
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
                    
                    const registerHandler = () => this.showAuthModal('register');
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

        /**
         * 设置提交按钮事件
         */
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

        /**
         * 显示忘记密码模态框
         */
        showForgotPasswordModal() {
            const email = this.getCachedElement('auth-email')?.value || '';
            this.showAuthModal('forgot', email);
        }

        /**
         * 清除认证相关的所有事件监听器
         */
        clearAuthEventListeners() {
            this.eventHandlers.forEach(({ element, handler, type }, key) => {
                if (element && typeof element.removeEventListener === 'function') {
                    try {
                        element.removeEventListener(type || 'click', handler);
                    } catch (e) {
                        // 忽略错误
                    }
                }
            });
            this.eventHandlers.clear();
        }

        /**
         * 关闭认证模态框
         */
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

        /**
         * 验证密码强度
         */
        validatePassword(password) {
            return typeof password === 'string' && password.length >= this.config.passwordMinLength;
        }

        /**
         * 验证邮箱格式
         */
        validateEmail(email) {
            if (typeof email !== 'string') return false;
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return emailRegex.test(email);
        }

        /**
         * 处理登录/注册
         */
        async handleAuth() {
            // 尝试自动修复（但不过度调用）
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

        /**
         * 设置认证消息（修复版）
         */
        setAuthMessage(authError, color, message) {
            // 安全检查
            if (!authError) {
                this.log('info', `[Auth Message] ${message}`);
                return;
            }
            
            try {
                // 确保 authError 是对象
                if (typeof authError !== 'object') {
                    this.log('info', `[Auth Message] ${message}`);
                    return;
                }
                
                // 确保 style 对象存在
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

        /**
         * 验证认证输入
         */
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

        /**
         * 检查Supabase是否就绪（修复版）
         */
        checkSupabaseReady(authError, lang) {
            // 尝试自动修复
            if (!this.supabase) {
                this.autoFixSupabase();
            }
            
            const isReady = !!(this.game?.state?.supabaseReady && this.supabase);
            
            if (!isReady) {
                // 再次尝试修复
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

        /**
         * 显示认证成功反馈
         */
        async showAuthSuccess(isLogin, lang) {
            if (this.game.ui && typeof this.game.ui.showFeedback === 'function') {
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

        /**
         * 处理认证错误
         */
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

        /**
         * 获取错误消息
         */
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

        /**
         * 处理忘记密码
         */
        async handleForgotPassword() {
            // 尝试自动修复
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

        /**
         * 获取基础URL
         */
        getBaseUrl() {
            if (typeof global === 'undefined') return '';
            return global.location?.origin || 
                   (global.location?.protocol + '//' + global.location?.host) || 
                   '';
        }

        /**
         * 验证忘记密码输入
         */
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

        /**
         * 显示忘记密码成功消息
         */
        showForgotPasswordSuccess(authError, lang) {
            if (this.game.ui && typeof this.game.ui.showFeedback === 'function') {
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

        /**
         * 处理忘记密码错误
         */
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

        /**
         * 登录
         */
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

            this.updateCurrentUser(data.user);
        }

        /**
         * 注册
         */
        async register(email, password) {
            if (!this.supabase) {
                throw new Error('Supabase 未初始化');
            }

            const { data, error } = await this.supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        username: this.safeGetUsername(email),
                        created_at: new Date().toISOString()
                    }
                }
            });

            if (error) throw error;

            if (!data || !data.user) {
                throw new Error('注册失败：未获取到用户信息');
            }

            if (data.user) {
                this.updateCurrentUser(data.user);
                
                if (data.user.identities?.length === 0) {
                    const lang = this.getI18n();
                    if (this.game.ui && typeof this.game.ui.showFeedback === 'function') {
                        this.game.ui.showFeedback(
                            lang.t('emailVerificationRequired') || '请查收邮件验证邮箱',
                            '#ffa500'
                        );
                    }
                }
            }
        }

        /**
         * 安全地获取用户名
         */
        safeGetUsername(email) {
            if (!email || typeof email !== 'string') return '用户';
            const parts = email.split('@');
            return parts[0] || '用户';
        }

        /**
         * 更新当前用户信息
         */
        updateCurrentUser(user) {
            if (!user) return;
            
            const email = user.email || '';
            const username = user.user_metadata?.username || this.safeGetUsername(email);
            
            this.ensureGameState();
            this.game.state.currentUser = {
                id: user.id,
                email: email,
                name: username,
                metadata: { ...(user.user_metadata || {}) },
                lastUpdated: Date.now()
            };

            this.saveUserToStorage();
        }

        /**
         * 登出
         */
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
                
                if (this.game.ui && typeof this.game.ui.showFeedback === 'function') {
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

        /**
         * 保存用户信息到本地存储
         */
        saveUserToStorage() {
            if (!this.game?.state?.currentUser) return;
            
            const keys = this.getStorageKeys();
            
            const userToSave = {
                id: this.game.state.currentUser.id,
                email: this.game.state.currentUser.email,
                name: this.game.state.currentUser.name,
                lastUpdated: this.game.state.currentUser.lastUpdated
            };
            
            const serialized = JSON.stringify(userToSave);
            
            const lastSaved = this.safeStorage('get', keys.USER);
            if (lastSaved === serialized) {
                return;
            }
            
            this.safeStorage('set', keys.USER, serialized);
        }

        /**
         * 从本地存储清除用户信息
         */
        clearUserFromStorage() {
            const keys = this.getStorageKeys();
            this.safeStorage('remove', keys.USER);
        }

        // ==================== 会话管理 ====================

        /**
         * 加载用户会话
         */
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

        /**
         * 验证用户数据完整性
         */
        validateUserData(user) {
            return user && 
                   typeof user === 'object' && 
                   typeof user.id === 'string' && 
                   user.id.length > 0 &&
                   typeof user.email === 'string' &&
                   user.email.includes('@');
        }

        /**
         * 检查是否已登录
         */
        isLoggedIn() {
            return !!(this.game?.state && this.game.state.currentUser);
        }

        /**
         * 获取当前用户
         */
        getCurrentUser() {
            return this.game?.state ? this.game.state.currentUser : null;
        }

        /**
         * 刷新 Supabase 会话
         */
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
                    this.updateCurrentUser(data.user);
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

        /**
         * 处理密码重置回调
         */
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
                
                if (this.game.ui && typeof this.game.ui.showFeedback === 'function') {
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

        /**
         * 获取当前会话
         */
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

        /**
         * 监听认证状态变化
         */
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

        /**
         * 获取性能指标
         */
        getMetrics() {
            return { ...this.metrics };
        }

        /**
         * 销毁实例，清理资源
         */
        destroy() {
            this.log('info', '销毁 AuthManager 实例');
            
            this.clearAuthEventListeners();
            this.clearAllTimeouts();
            this.clearAllIntervals();
            this.clearElementCache();
            
            if (this.authStateListener) {
                this.authStateListener.subscription?.unsubscribe();
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

    // 导出到全局
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = AuthManager;
    } else if (typeof define === 'function' && define.amd) {
        define([], () => AuthManager);
    } else {
        global.AuthManager = AuthManager;
    }

    // 注意：不再添加全局自动修复，避免污染全局
    // 修复逻辑已在类内部实现

})(typeof window !== 'undefined' ? window : global);
