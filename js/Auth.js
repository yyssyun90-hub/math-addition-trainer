/**
 * ==================== 糖果数学消消乐 - 用户认证 ====================
 * 版本: 4.0.0
 * 最后更新: 2024-01-20
 * 包含：Supabase初始化、登录、注册、登出、会话管理、忘记密码
 * 依赖：utils.js (需要 I18n, Validators, GAME_CONSTANTS)
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
            
            // 配置管理 - 将所有魔法数字提取为常量
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
            if (!this.game.state) {
                this.game.state = {};
            }
            
            // 状态管理
            this.supabase = null;
            this.authMode = 'login';
            this.eventHandlers = new Map();
            this.authStateListener = null;
            this.isInitialized = false;
            this.timeouts = new Set();
            this.intervals = new Set();
            this.storageKeys = null;
            this.pendingAuth = new Map(); // 支持多个并发请求的计数
            this.elementCache = new Map();
            this.retryCount = 0;
            this.performanceMarks = new Map();
            this.storageListener = null;
            this.activeTabId = this.generateTabId();
            this.requestCounter = 0;
            this.passwordMemory = new WeakMap(); // 用于安全地临时存储密码
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
            
            // 初始化检查
            this.initStorageCheck();
            this.initNetworkMonitoring();
            this.initSessionCheck();
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
                    // 测试localStorage是否可用
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
         * 创建内存存储（localStorage降级方案）
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
         * 日志记录（生产环境可关闭，敏感信息过滤）
         */
        log(level, message, data = null) {
            if (!this.config.enableLogging && level !== 'error') return;
            
            // 过滤敏感信息
            const sanitizedData = this.sanitizeLogData(data);
            
            const logEntry = {
                timestamp: new Date().toISOString(),
                level,
                message,
                data: sanitizedData,
                tabId: this.activeTabId,
                userId: this.game.state?.currentUser?.id,
                url: global.location?.href,
                userAgent: global.navigator?.userAgent
            };
            
            // 添加性能指标
            if (this.performanceMarks.size > 0) {
                logEntry.performance = Object.fromEntries(this.performanceMarks);
            }
            
            // 添加计数器
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
                    // 限制错误记录数量
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
            
            // 发送到服务器（采样率10%）
            if (level === 'error' && this.supabase && Math.random() < 0.1) {
                this.sendLogToServer(logEntry).catch(() => {});
            }
        }

        /**
         * 清理日志数据（移除敏感信息）
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
         * 发送日志到服务器
         */
        async sendLogToServer(logEntry) {
            if (!this.supabase || !this.game.state?.supabaseReady) return;
            
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                
                await this.supabase
                    .from('auth_logs')
                    .insert([logEntry])
                    .abortSignal(controller.signal);
                    
                clearTimeout(timeoutId);
            } catch (e) {
                // 静默失败
            }
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
                    this.retryFailedOperations();
                };
                
                const handleOffline = () => {
                    this.log('warn', '网络已断开');
                };
                
                global.addEventListener('online', handleOnline);
                global.addEventListener('offline', handleOffline);
                
                this.eventHandlers.set('network-online', { element: global, handler: handleOnline });
                this.eventHandlers.set('network-offline', { element: global, handler: handleOffline });
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
            if (!this.supabase || !this.game.state.supabaseReady) return;
            
            try {
                const session = await this.getSession();
                if (!session && this.game.state.currentUser) {
                    this.log('warn', '会话已过期，清除用户状态');
                    this.game.state.currentUser = null;
                    this.notifyUIUpdate();
                } else if (session) {
                    // 检查是否需要刷新
                    const expiresAt = session.expires_at * 1000;
                    const timeLeft = expiresAt - Date.now();
                    if (timeLeft < 5 * 60 * 1000) { // 少于5分钟
                        this.log('info', '会话即将过期，自动刷新');
                        await this.refreshSession();
                    }
                }
            } catch (e) {
                this.log('error', '会话健康检查失败', e);
            }
        }

        /**
         * 重试失败的操作
         */
        retryFailedOperations() {
            // 实现重试逻辑
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
                    this.broadcastStorageChange(key, value);
                    return true;
                } else if (method === 'remove') {
                    this.dependencies.storage.removeItem(key);
                    this.broadcastStorageChange(key, null);
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
         * 广播存储变化（跨标签页同步）
         */
        broadcastStorageChange(key, value) {
            try {
                if (typeof global.StorageEvent === 'function') {
                    const event = new StorageEvent('storage', {
                        key: key,
                        newValue: value,
                        oldValue: null,
                        storageArea: this.dependencies.storage,
                        url: global.location?.href || ''
                    });
                    global.dispatchEvent(event);
                }
            } catch (e) {
                // 忽略广播错误
            }
        }

        /**
         * 设置跨标签页同步
         */
        setupStorageSync() {
            if (this.storageListener) return;
            
            this.storageListener = (event) => {
                const keys = this.getStorageKeys();
                if (event.key === keys.USER) {
                    this.log('info', '检测到其他标签页的用户数据变化');
                    
                    if (!event.newValue) {
                        if (this.game.state.currentUser) {
                            this.game.state.currentUser = null;
                            this.notifyUIUpdate();
                        }
                    } else {
                        try {
                            const user = JSON.parse(event.newValue);
                            if (user && user.id) {
                                // 验证数据完整性
                                if (this.validateUserData(user)) {
                                    this.game.state.currentUser = user;
                                    this.notifyUIUpdate();
                                }
                            }
                        } catch (e) {
                            this.log('warn', '解析存储数据失败', e);
                        }
                    }
                }
            };
            
            global.addEventListener('storage', this.storageListener);
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
            this.timeouts.forEach(id => clearTimeout(id));
            this.timeouts.clear();
        }

        /**
         * 清除所有定时器
         */
        clearAllIntervals() {
            this.intervals.forEach(id => clearInterval(id));
            this.intervals.clear();
        }

        /**
         * 安全的HTML转义（防止XSS）
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
            
            if (!this.canMakeRequest()) {
                this.log('warn', '请求过多，稍后重试');
                this.markEnd('initSupabase');
                return false;
            }

            const requestId = this.registerRequest('init');

            try {
                // 防止重复初始化
                if (!force && this.isInitialized && this.supabase) {
                    this.log('info', 'Supabase 已初始化，跳过');
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
                        // 安全解析JSON，防止XSS
                        const config = JSON.parse(configScript.textContent);
                        SUPABASE_URL = this.sanitizeUrl(config.supabaseUrl);
                        SUPABASE_ANON_KEY = this.sanitizeString(config.supabaseKey);
                    } catch (e) {
                        this.log('error', '解析 Supabase 配置失败', e);
                        this.game.state.supabaseReady = false;
                        this.markEnd('initSupabase');
                        this.completeRequest(requestId);
                        return false;
                    }
                } else {
                    this.log('warn', '未找到 Supabase 配置脚本');
                    this.game.state.supabaseReady = false;
                    this.markEnd('initSupabase');
                    this.completeRequest(requestId);
                    return false;
                }

                // 检查配置是否有效
                if (!this.isValidSupabaseConfig(SUPABASE_URL, SUPABASE_ANON_KEY)) {
                    this.log('warn', 'Supabase 环境变量未配置，使用本地模式');
                    this.game.state.supabaseReady = false;
                    this.markEnd('initSupabase');
                    this.completeRequest(requestId);
                    return false;
                }

                // 检查依赖注入的supabase
                if (!this.dependencies.supabase || typeof this.dependencies.supabase.createClient !== 'function') {
                    this.log('error', 'Supabase SDK 未加载');
                    this.game.state.supabaseReady = false;
                    this.markEnd('initSupabase');
                    this.completeRequest(requestId);
                    return false;
                }

                // 基础配置
                const authConfig = {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: true
                };
                
                // 安全地添加 storageKey
                try {
                    const testClient = this.dependencies.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                        auth: { storageKey: 'test' }
                    });
                    if (testClient) {
                        authConfig.storageKey = this.config.storageKey;
                    }
                } catch (e) {
                    this.log('info', 'storageKey 选项不受支持，使用默认值');
                }

                // 创建客户端
                this.supabase = this.dependencies.supabase.createClient(
                    SUPABASE_URL,
                    SUPABASE_ANON_KEY,
                    { 
                        auth: authConfig,
                        global: {
                            fetch: (...args) => {
                                return this.fetchWithTimeout(...args);
                            }
                        }
                    }
                );

                // 测试连接并获取会话
                const sessionResult = await this.fetchWithTimeout(
                    () => this.supabase.auth.getSession(),
                    { timeout: this.config.requestTimeout }
                );
                
                const { data: { session }, error } = sessionResult;
                if (error) throw error;

                // 如果有会话，更新用户信息
                if (session?.user) {
                    this.updateCurrentUser(session.user);
                }

                // 设置认证状态监听
                this.setupAuthListener();
                
                // 设置跨标签页同步
                this.setupStorageSync();

                // 统一使用同一个 supabase 实例
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
                
                // 重试机制（指数退避）
                if (this.retryCount < this.config.maxRetries) {
                    this.retryCount++;
                    const delay = Math.min(
                        this.config.retryDelay * Math.pow(2, this.retryCount - 1),
                        30000 // 最大30秒
                    );
                    this.log('info', `重试初始化 (${this.retryCount}/${this.config.maxRetries})`, { delay });
                    
                    await this.sleep(delay);
                    
                    this.markEnd('initSupabase');
                    this.completeRequest(requestId);
                    return this.initSupabase(force);
                }
                
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

            // 清除旧的监听器
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
            // 防止同时显示多个
            if (!this.canMakeRequest()) {
                this.log('info', '已有认证操作进行中');
                this.showTemporaryMessage('操作进行中，请稍候...', '#ffa500');
                return;
            }

            // 清除之前的超时
            this.clearAllTimeouts();

            // 获取DOM元素
            const elements = this.getAuthModalElements();
            if (!this.validateModalElements(elements)) {
                this.log('error', '认证模态框元素缺失');
                return;
            }

            const { modal, title, submitBtn, switchDiv, emailInput, passwordInput, authError, forgotPasswordDiv } = elements;
            const passwordLabel = global.document?.querySelector('label[for="auth-password"]');
            
            // 获取全局 I18n 对象
            const lang = this.getI18n();

            this.authMode = mode;

            // 清除之前的事件监听器
            this.clearAuthEventListeners();

            // 重置表单
            this.resetAuthForm(emailInput, passwordInput, authError, passwordLabel, forgotPasswordDiv);
            
            // 预填邮箱（如从忘记密码返回）
            if (prefillEmail && emailInput) {
                emailInput.value = prefillEmail;
            }

            // 根据模式更新UI
            this.updateAuthModalUI(mode, {
                title,
                submitBtn,
                switchDiv,
                forgotPasswordDiv,
                passwordInput,
                passwordLabel,
                lang
            });

            // 设置提交按钮事件
            this.setupSubmitButton(submitBtn, mode, authError, lang);
            
            // 添加密码可见性切换
            this.addPasswordToggle(passwordInput);

            // 添加键盘支持
            this.addKeyboardSupport(modal, submitBtn);

            // 显示模态框
            modal.style.display = 'flex';
            modal.setAttribute('data-mode', mode);
            
            // 设置可访问性
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
            
            // 检查是否已存在切换按钮
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
            this.eventHandlers.set('modal-keydown', { element: modal, handler: handleKeyDown });
        }

        /**
         * 获取I18n对象
         */
        getI18n() {
            const i18n = this.dependencies.i18n || { t: (key) => key };
            
            // 添加RTL支持
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
                authError.setAttribute('aria-live', 'polite');
            }

            if (forgotPasswordDiv) {
                forgotPasswordDiv.style.display = 'none';
                forgotPasswordDiv.innerHTML = '';
            }
            
            // 移除密码切换按钮
            const toggle = global.document?.querySelector('.password-toggle');
            if (toggle) toggle.remove();
        }

        /**
         * 更新认证模态框UI
         */
        updateAuthModalUI(mode, elements) {
            const { title, submitBtn, switchDiv, forgotPasswordDiv, passwordInput, passwordLabel, lang } = elements;

            // 清空switchDiv内容
            switchDiv.innerHTML = '';

            if (mode === 'login') {
                title.innerHTML = '🔐 ' + this.escapeHtml(lang.t('login') || '登录');
                submitBtn.innerHTML = this.escapeHtml(lang.t('login') || '登录');
                
                // 创建注册链接
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
                    this.eventHandlers.set('switch-to-register', { element: registerSpan, handler: registerHandler });
                }

                // 添加忘记密码链接
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
                        this.eventHandlers.set('forgot-password', { element: forgotSpan, handler: forgotHandler });
                    }
                }
            } 
            else if (mode === 'register') {
                title.innerHTML = '📝 ' + this.escapeHtml(lang.t('register') || '注册');
                submitBtn.innerHTML = this.escapeHtml(lang.t('register') || '注册');
                
                // 创建登录链接
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
                    this.eventHandlers.set('switch-to-login', { element: loginSpan, handler: loginHandler });
                }
                
                // 隐藏忘记密码链接
                if (forgotPasswordDiv) {
                    forgotPasswordDiv.style.display = 'none';
                    forgotPasswordDiv.innerHTML = '';
                }
            } 
            else if (mode === 'forgot') {
                title.innerHTML = '🔑 ' + this.escapeHtml(lang.t('forgotPassword') || '忘记密码');
                submitBtn.innerHTML = this.escapeHtml(lang.t('sendResetLink') || '发送重置链接');
                
                // 创建返回登录链接
                const backSpan = global.document?.createElement('span');
                if (backSpan) {
                    backSpan.id = 'switch-to-login';
                    backSpan.style.cursor = 'pointer';
                    backSpan.style.color = '#667eea';
                    backSpan.textContent = this.escapeHtml(lang.t('backToLogin') || '返回登录');
                    
                    switchDiv.appendChild(backSpan);
                    
                    const backHandler = () => this.showAuthModal('login');
                    backSpan.addEventListener('click', backHandler);
                    this.eventHandlers.set('switch-to-login', { element: backSpan, handler: backHandler });
                }
                
                // 隐藏密码输入框和忘记密码链接
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
            // 移除旧的提交按钮事件监听器
            const oldSubmit = this.eventHandlers.get('auth-submit');
            if (oldSubmit) {
                oldSubmit.element.removeEventListener('click', oldSubmit.handler);
            }

            // 设置新的提交按钮事件监听器
            let submitHandler;
            if (mode === 'forgot') {
                submitHandler = (e) => {
                    e.preventDefault();
                    this.handleForgotPassword().catch(error => {
                        this.log('error', '忘记密码处理失败', error);
                        if (authError) {
                            authError.style.color = '#f44336';
                            authError.textContent = this.escapeHtml(
                                lang.t('unexpectedError') || '发生未知错误，请重试'
                            );
                            
                            // 自动清除错误消息
                            this.setTimeout(() => {
                                if (authError) {
                                    authError.textContent = '';
                                }
                            }, this.config.errorDisplayDuration);
                        }
                    });
                };
            } else {
                submitHandler = (e) => {
                    e.preventDefault();
                    
                    // 防止快速点击
                    if (submitBtn.disabled) return;
                    
                    submitBtn.disabled = true;
                    
                    this.handleAuth().catch(error => {
                        this.log('error', '认证处理失败', error);
                        if (authError) {
                            authError.style.color = '#f44336';
                            authError.textContent = this.escapeHtml(
                                lang.t('unexpectedError') || '发生未知错误，请重试'
                            );
                            
                            // 自动清除错误消息
                            this.setTimeout(() => {
                                if (authError) {
                                    authError.textContent = '';
                                }
                            }, this.config.errorDisplayDuration);
                        }
                    }).finally(() => {
                        submitBtn.disabled = false;
                    });
                };
            }
            
            submitBtn.addEventListener('click', submitHandler);
            this.eventHandlers.set('auth-submit', { element: submitBtn, handler: submitHandler });
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
            this.eventHandlers.forEach(({ element, handler }) => {
                if (element && typeof element.removeEventListener === 'function') {
                    element.removeEventListener('click', handler);
                    element.removeEventListener('keydown', handler);
                }
            });
            this.eventHandlers.clear();
        }

        /**
         * 关闭认证模态框
         */
        closeAuthModal() {
            // 清理所有相关资源
            this.clearAuthEventListeners();
            this.clearAllTimeouts();
            
            // 清理所有待处理的认证请求
            this.pendingAuth.clear();
            
            const modal = global.document?.getElementById('auth-modal');
            if (modal) {
                this.setModalAccessibility(modal, false);
                modal.style.display = 'none';
                
                // 重置表单
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
                
                // 移除密码切换按钮
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
            // 防止并发认证
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

            // 验证输入
            if (!this.validateAuthInput(email, password, authError, lang)) {
                this.markEnd('handleAuth');
                this.completeRequest(requestId);
                return;
            }

            const isLogin = this.authMode === 'login';

            // 检查Supabase状态
            if (!this.checkSupabaseReady(authError, lang)) {
                this.markEnd('handleAuth');
                this.completeRequest(requestId);
                return;
            }

            // 更新计数器
            if (isLogin) {
                this.metrics.loginAttempts++;
            } else {
                this.metrics.registerAttempts++;
            }

            // 安全存储密码（临时）
            const passwordPtr = {};
            this.passwordMemory.set(passwordPtr, password);

            try {
                // 显示处理中状态
                this.setAuthMessage(authError, '#666', lang.t('processing') || '处理中...');

                // 检查网络状态
                const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
                if (!isOnline) {
                    throw new Error('network_offline');
                }

                // 添加超时控制
                const authPromise = isLogin 
                    ? this.login(email, password)
                    : this.register(email, password);
                    
                await this.fetchWithTimeout(() => authPromise, { timeout: this.config.requestTimeout });

                this.game.state.isOnline = isOnline;
                
                // 清空密码输入和内存中的密码
                if (elements.passwordInput) {
                    elements.passwordInput.value = '';
                }
                this.passwordMemory.delete(passwordPtr);
                
                // 更新成功计数器
                if (isLogin) {
                    this.metrics.loginSuccess++;
                } else {
                    this.metrics.registerSuccess++;
                }
                
                // 显示成功反馈
                await this.showAuthSuccess(isLogin, lang);
                
                this.closeAuthModal();
            } catch (error) {
                // 更新失败计数器
                if (isLogin) {
                    this.metrics.loginFailures++;
                } else {
                    this.metrics.registerFailures++;
                }
                
                this.handleAuthError(error, authError, lang);
            } finally {
                // 清理密码内存
                this.passwordMemory.delete(passwordPtr);
                this.completeRequest(requestId);
                this.markEnd('handleAuth');
            }
        }

        /**
         * 设置认证消息
         */
        setAuthMessage(authError, color, message) {
            if (authError) {
                authError.style.color = color;
                authError.textContent = this.escapeHtml(message);
                authError.setAttribute('aria-label', message);
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
         * 检查Supabase是否就绪
         */
        checkSupabaseReady(authError, lang) {
            if (!this.game.state.supabaseReady || !this.supabase) {
                this.setAuthMessage(authError, '#f44336', 
                    lang.t('supabaseNotConnected') || 'Supabase 未连接，请稍后重试');
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
            
            if (!authError) return;
            
            authError.style.color = '#f44336';
            
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
            
            authError.textContent = this.escapeHtml(errorMessage);
            
            // 自动清除错误消息
            this.setTimeout(() => {
                if (authError) {
                    authError.textContent = '';
                }
            }, this.config.errorDisplayDuration);
        }

        /**
         * 获取错误消息
         */
        getErrorMessage(error, lang, errorMap, defaultKey) {
            if (!error || !error.message) {
                return lang.t(defaultKey) || '认证失败，请稍后重试';
            }

            // 检查特定错误代码
            if (error.code && errorMap[error.code]) {
                return lang.t(errorMap[error.code]) || error.message;
            }

            // 检查错误消息
            for (const [key, value] of Object.entries(errorMap)) {
                if (error.message.includes(key)) {
                    return lang.t(value) || error.message;
                }
            }
            
            // 返回通用错误消息（不泄露敏感信息）
            return lang.t('genericError') || '操作失败，请稍后重试';
        }

        /**
         * 处理忘记密码
         */
        async handleForgotPassword() {
            // 防止并发操作
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

            // 验证邮箱
            if (!this.validateForgotPasswordInput(email, authError, lang)) {
                this.markEnd('handleForgotPassword');
                this.completeRequest(requestId);
                return;
            }

            // 检查Supabase状态
            if (!this.checkSupabaseReady(authError, lang)) {
                this.markEnd('handleForgotPassword');
                this.completeRequest(requestId);
                return;
            }

            this.metrics.passwordResetRequests++;

            try {
                // 显示发送中状态
                this.setAuthMessage(authError, '#666', lang.t('sending') || '发送中...');

                // 获取当前网站的URL作为重定向地址
                const baseUrl = this.getBaseUrl();
                const redirectTo = baseUrl + this.config.redirectUrl;
                
                await this.fetchWithTimeout(
                    () => this.supabase.auth.resetPasswordForEmail(email, { redirectTo }),
                    { timeout: this.config.requestTimeout }
                );

                // 清空邮箱输入
                if (elements.emailInput) {
                    elements.emailInput.value = '';
                }

                // 显示成功消息
                this.showForgotPasswordSuccess(authError, lang);

                // 3秒后返回登录界面
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
            
            if (!authError) return;
            
            authError.style.color = '#f44336';
            
            const errorMessage = this.getErrorMessage(error, lang, {
                'Email not found': 'emailNotFound',
                'rate limit': 'rateLimitExceeded',
                'Invalid email': 'invalidEmail',
                '请求超时': 'requestTimeout',
                'timeout': 'requestTimeout',
                'NetworkError': 'networkError',
                'Failed to fetch': 'networkError'
            }, 'sendFailed');
            
            authError.textContent = this.escapeHtml(errorMessage);
            
            // 自动清除错误消息
            this.setTimeout(() => {
                if (authError) {
                    authError.textContent = '';
                }
            }, this.config.errorDisplayDuration);
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

            // 注意：有些邮箱需要验证，此时 user 可能为 null
            if (data.user) {
                this.updateCurrentUser(data.user);
                
                // 如果需要验证邮箱，显示提示
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
            // 防止重复登出
            if (!this.canMakeRequest()) {
                return;
            }

            this.markStart('logout');
            const requestId = this.registerRequest('logout');

            try {
                if (this.game.state.supabaseReady && this.supabase) {
                    await this.fetchWithTimeout(
                        () => this.supabase.auth.signOut(),
                        { timeout: this.config.requestTimeout }
                    );
                }

                this.game.state.currentUser = null;
                this.clearUserFromStorage();
                
                this.notifyUIUpdate();
                
                if (this.game.ui && typeof this.game.ui.showFeedback === 'function') {
                    const lang = this.getI18n();
                    this.game.ui.showFeedback(lang.t('logoutSuccess') || '已退出登录', '#ffa500');
                }
            } catch (error) {
                this.log('error', '登出失败', error);
                
                // 即使登出失败，也清除本地状态
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
            if (!this.game.state.currentUser) return;
            
            const keys = this.getStorageKeys();
            
            // 只保存必要字段，避免保存敏感信息
            const userToSave = {
                id: this.game.state.currentUser.id,
                email: this.game.state.currentUser.email,
                name: this.game.state.currentUser.name,
                lastUpdated: this.game.state.currentUser.lastUpdated
            };
            
            const serialized = JSON.stringify(userToSave);
            
            // 避免重复写入相同数据
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
                // 验证用户对象格式
                if (this.validateUserData(user)) {
                    // 检查数据是否过期
                    const now = Date.now();
                    const lastUpdated = user.lastUpdated || 0;
                    if (now - lastUpdated > this.config.sessionTimeout) {
                        this.log('info', '用户会话已过期，需要重新登录');
                        this.clearUserFromStorage();
                        return;
                    }
                    
                    this.game.state.currentUser = user;
                } else {
                    throw new Error('无效的用户数据格式');
                }
            } catch (e) {
                this.log('warn', '加载用户会话失败', e);
                this.clearUserFromStorage();
                this.game.state.currentUser = null;
            }
        }

        /**
         * 检查是否已登录
         */
        isLoggedIn() {
            return !!(this.game.state && this.game.state.currentUser);
        }

        /**
         * 获取当前用户
         */
        getCurrentUser() {
            return this.game.state ? this.game.state.currentUser : null;
        }

        /**
         * 刷新 Supabase 会话
         */
        async refreshSession() {
            if (!this.supabase || !this.game.state.supabaseReady) return false;
            
            // 防止频繁刷新
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
            
            if (!this.supabase || !this.game.state.supabaseReady) {
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
                
                // 更新成功后清除本地存储的旧信息
                this.clearUserFromStorage();
                
                // 显示成功消息
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
            if (!this.supabase || !this.game.state.supabaseReady) {
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
            
            if (this.storageListener) {
                global.removeEventListener('storage', this.storageListener);
                this.storageListener = null;
            }
            
            this.supabase = null;
            
            if (this.game.state) {
                this.game.state.supabase = null;
                this.game.state.supabaseReady = false;
                // 不清空 currentUser，让UI可以显示最后状态
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

})(typeof window !== 'undefined' ? window : global);
