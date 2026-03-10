/**
 * ==================== 糖果数学消消乐 - 用户认证 ====================
 * 包含：Supabase初始化、登录、注册、登出、会话管理、忘记密码
 * 依赖：utils.js (需要 I18n, Validators, GAME_CONSTANTS)
 * =============================================================
 */

class AuthManager {
    constructor(game) {
        this.game = game || {};
        this.game.state = this.game.state || {};
        this.supabase = null;
        this.authMode = 'login'; // 'login', 'register', 或 'forgot'
        this.eventHandlers = new Map(); // 用于存储事件处理器，便于移除
    }

    // ==================== Supabase 初始化 ====================

    /**
     * 初始化 Supabase 客户端
     */
    async initSupabase() {
        // 从 script 标签获取 Supabase 配置
        const configScript = document.getElementById('supabase-config');
        let SUPABASE_URL = '';
        let SUPABASE_ANON_KEY = '';
        
        if (configScript) {
            try {
                const config = JSON.parse(configScript.textContent);
                SUPABASE_URL = config.supabaseUrl;
                SUPABASE_ANON_KEY = config.supabaseKey;
            } catch (e) {
                console.error('解析 Supabase 配置失败:', e);
            }
        }

        try {
            if (!SUPABASE_URL || !SUPABASE_ANON_KEY || 
                SUPABASE_URL === 'SUPABASE_URL_PLACEHOLDER' || 
                SUPABASE_ANON_KEY === 'SUPABASE_ANON_KEY_PLACEHOLDER') {
                console.warn('Supabase 环境变量未配置，将使用本地模式');
                this.game.state.supabaseReady = false;
                return;
            }

            // 检查 window.supabase 是否存在
            if (!window.supabase || typeof window.supabase.createClient !== 'function') {
                console.error('Supabase SDK 未加载');
                this.game.state.supabaseReady = false;
                return;
            }

            this.supabase = window.supabase.createClient(
                SUPABASE_URL,
                SUPABASE_ANON_KEY,
                {
                    auth: {
                        autoRefreshToken: true,
                        persistSession: true
                    }
                }
            );

            const { error } = await this.supabase.auth.getSession();
            if (error) throw error;

            // 统一使用同一个 supabase 实例
            this.game.state.supabase = this.supabase;
            this.game.state.supabaseReady = true;
            console.log('Supabase 连接成功');
        } catch (error) {
            console.error('Supabase 初始化失败:', error);
            this.game.state.supabaseReady = false;
        }
    }

    // ==================== 认证模态框 ====================

    /**
     * 显示认证模态框
     */
    showAuthModal(mode) {
        const modal = document.getElementById('auth-modal');
        const title = document.getElementById('auth-title');
        const submitBtn = document.getElementById('auth-submit');
        const switchDiv = document.getElementById('auth-switch');
        const emailInput = document.getElementById('auth-email');
        const passwordInput = document.getElementById('auth-password');
        const authError = document.getElementById('auth-error');
        const forgotPasswordDiv = document.getElementById('forgot-password-link');
        
        // 获取密码标签
        const passwordLabel = document.querySelector('label[for="auth-password"]');
        
        // 获取全局 I18n 对象
        const lang = window.I18n || { t: (key) => key };

        if (!modal || !title || !submitBtn || !switchDiv) return;

        this.authMode = mode;

        // 清除之前的事件监听器
        this.clearAuthEventListeners();

        // 重置输入框显示状态
        if (emailInput) {
            emailInput.style.display = 'block';
            emailInput.disabled = false;
        }
        
        if (passwordInput) {
            passwordInput.style.display = 'block';
            passwordInput.disabled = false;
        }
        
        if (passwordLabel) passwordLabel.style.display = 'block';
        
        // 重置错误信息样式和内容
        if (authError) {
            authError.style.color = '#f44336';
            authError.textContent = '';
        }

        if (mode === 'login') {
            title.innerHTML = '🔐 ' + lang.t('login');
            submitBtn.innerHTML = lang.t('login');
            switchDiv.innerHTML = lang.t('noAccount') + ' <span id="switch-to-register" style="cursor:pointer; color:#667eea;">' + lang.t('registerNow') + '</span>';
            
            // 添加注册切换事件
            const switchToRegister = document.getElementById('switch-to-register');
            if (switchToRegister) {
                const handler = () => this.showAuthModal('register');
                switchToRegister.addEventListener('click', handler);
                this.eventHandlers.set('switch-to-register', handler);
            }

            // 添加忘记密码链接
            if (forgotPasswordDiv) {
                forgotPasswordDiv.style.display = 'block';
                forgotPasswordDiv.innerHTML = '<span id="forgot-password" style="cursor:pointer; color:#666; font-size:0.9em; text-decoration:underline;">' + lang.t('forgotPassword') + '?</span>';
                
                const forgotPassword = document.getElementById('forgot-password');
                if (forgotPassword) {
                    const handler = (e) => {
                        e.preventDefault();
                        this.showForgotPasswordModal();
                    };
                    forgotPassword.addEventListener('click', handler);
                    this.eventHandlers.set('forgot-password', handler);
                }
            }
        } else if (mode === 'register') {
            title.innerHTML = '📝 ' + lang.t('register');
            submitBtn.innerHTML = lang.t('register');
            switchDiv.innerHTML = lang.t('hasAccount') + ' <span id="switch-to-login" style="cursor:pointer; color:#667eea;">' + lang.t('loginNow') + '</span>';
            
            // 隐藏忘记密码链接
            if (forgotPasswordDiv) {
                forgotPasswordDiv.style.display = 'none';
                forgotPasswordDiv.innerHTML = '';
            }
            
            // 添加登录切换事件
            const switchToLogin = document.getElementById('switch-to-login');
            if (switchToLogin) {
                const handler = () => this.showAuthModal('login');
                switchToLogin.addEventListener('click', handler);
                this.eventHandlers.set('switch-to-login', handler);
            }
        } else if (mode === 'forgot') {
            title.innerHTML = '🔑 ' + lang.t('forgotPassword');
            submitBtn.innerHTML = lang.t('sendResetLink');
            switchDiv.innerHTML = '<span id="switch-to-login" style="cursor:pointer; color:#667eea;">' + lang.t('backToLogin') + '</span>';
            
            // 隐藏密码输入框和忘记密码链接
            if (passwordInput) {
                passwordInput.style.display = 'none';
                passwordInput.disabled = true;
            }
            
            if (passwordLabel) passwordLabel.style.display = 'none';
            
            if (forgotPasswordDiv) {
                forgotPasswordDiv.style.display = 'none';
                forgotPasswordDiv.innerHTML = '';
            }
            
            // 添加返回登录事件
            const switchToLogin = document.getElementById('switch-to-login');
            if (switchToLogin) {
                const handler = () => this.showAuthModal('login');
                switchToLogin.addEventListener('click', handler);
                this.eventHandlers.set('switch-to-login', handler);
            }
        }

        // 移除旧的提交按钮事件监听器
        const oldSubmitHandler = this.eventHandlers.get('auth-submit');
        if (oldSubmitHandler) {
            submitBtn.removeEventListener('click', oldSubmitHandler);
        }

        // 设置新的提交按钮事件监听器
        let submitHandler;
        if (mode === 'forgot') {
            submitHandler = (e) => {
                e.preventDefault();
                this.handleForgotPassword();
            };
        } else {
            submitHandler = (e) => {
                e.preventDefault();
                this.handleAuth();
            };
        }
        
        submitBtn.addEventListener('click', submitHandler);
        this.eventHandlers.set('auth-submit', submitHandler);

        // 清空输入框
        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';

        modal.style.display = 'flex';
    }

    /**
     * 显示忘记密码模态框
     */
    showForgotPasswordModal() {
        this.showAuthModal('forgot');
    }

    /**
     * 清除认证相关的所有事件监听器
     */
    clearAuthEventListeners() {
        this.eventHandlers.forEach((handler, id) => {
            const element = document.getElementById(id);
            if (element) {
                element.removeEventListener('click', handler);
            }
        });
        this.eventHandlers.clear();
    }

    /**
     * 关闭认证模态框
     */
    closeAuthModal() {
        this.clearAuthEventListeners();
        if (this.game.ui && typeof this.game.ui.closeModal === 'function') {
            this.game.ui.closeModal('auth-modal');
        } else {
            const modal = document.getElementById('auth-modal');
            if (modal) modal.style.display = 'none';
        }
    }

    // ==================== 认证处理 ====================

    /**
     * 验证密码强度
     */
    validatePassword(password) {
        if (!password || password.length < 6) {
            return false;
        }
        return true;
    }

    /**
     * 处理登录/注册
     */
    async handleAuth() {
        const email = document.getElementById('auth-email')?.value;
        const password = document.getElementById('auth-password')?.value;
        const authError = document.getElementById('auth-error');
        
        // 获取全局 I18n 对象
        const lang = window.I18n || { t: (key) => key };

        if (!email || !password) {
            if (authError) {
                authError.textContent = lang.t('email') + '和' + lang.t('password') + '不能为空';
            }
            return;
        }

        // 验证邮箱
        const isValidEmail = window.Validators && typeof window.Validators.isEmail === 'function' 
            ? window.Validators.isEmail(email) 
            : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            
        if (!isValidEmail) {
            if (authError) authError.textContent = '请输入有效的邮箱地址';
            return;
        }

        // 验证密码
        if (!this.validatePassword(password)) {
            if (authError) authError.textContent = '密码至少6位';
            return;
        }

        const isLogin = this.authMode === 'login';

        if (!this.game.state.supabaseReady || !this.supabase) {
            if (authError) authError.textContent = 'Supabase 未连接，请稍后重试';
            return;
        }

        try {
            if (isLogin) {
                await this.login(email, password);
            } else {
                await this.register(email, password);
            }

            this.game.state.isOnline = navigator.onLine;
            
            if (this.game.ui && typeof this.game.ui.showFeedback === 'function') {
                this.game.ui.showFeedback(isLogin ? 'loginSuccess' : 'registerSuccess', '#4CAF50');
                this.game.ui.updateUserUI();  // UI模块会处理用户界面的更新
            }
            
            // 保存用户信息到本地
            if (this.game.storage && typeof this.game.storage.saveLocalData === 'function') {
                this.game.storage.saveLocalData();
                if (typeof this.game.storage.syncFromCloud === 'function') {
                    await this.game.storage.syncFromCloud();
                }
            }

            this.closeAuthModal();
        } catch (error) {
            console.error('认证失败:', error);
            if (authError) {
                authError.style.color = '#f44336';
                if (error.message && error.message.includes('Invalid login credentials')) {
                    authError.textContent = '邮箱或密码错误';
                } else if (error.message && error.message.includes('User already registered')) {
                    authError.textContent = '该邮箱已被注册';
                } else if (error.message && error.message.includes('Email rate limit exceeded')) {
                    authError.textContent = '操作过于频繁，请稍后再试';
                } else {
                    authError.textContent = error.message || '认证失败，请稍后重试';
                }
            }
        }
    }

    /**
     * 处理忘记密码
     */
    async handleForgotPassword() {
        const email = document.getElementById('auth-email')?.value;
        const authError = document.getElementById('auth-error');
        
        // 获取全局 I18n 对象
        const lang = window.I18n || { t: (key) => key };

        if (!email) {
            if (authError) {
                authError.style.color = '#f44336';
                authError.textContent = lang.t('email') + '不能为空';
            }
            return;
        }

        // 验证邮箱
        const isValidEmail = window.Validators && typeof window.Validators.isEmail === 'function' 
            ? window.Validators.isEmail(email) 
            : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            
        if (!isValidEmail) {
            if (authError) {
                authError.style.color = '#f44336';
                authError.textContent = '请输入有效的邮箱地址';
            }
            return;
        }

        if (!this.game.state.supabaseReady || !this.supabase) {
            if (authError) {
                authError.style.color = '#f44336';
                authError.textContent = 'Supabase 未连接，请稍后重试';
            }
            return;
        }

        try {
            // 获取当前网站的URL作为重定向地址
            const baseUrl = window.location.origin || window.location.protocol + '//' + window.location.host;
            const redirectTo = baseUrl + '/reset-password.html';
            
            const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
                redirectTo: redirectTo,
            });

            if (error) throw error;

            if (this.game.ui && typeof this.game.ui.showFeedback === 'function') {
                this.game.ui.showFeedback('passwordResetEmailSent', '#4CAF50');
            }

            // 显示成功消息
            if (authError) {
                authError.style.color = '#4CAF50';
                authError.textContent = '密码重置链接已发送到您的邮箱，请查收';
            }

            // 3秒后返回登录界面
            setTimeout(() => {
                this.showAuthModal('login');
            }, 3000);

        } catch (error) {
            console.error('发送密码重置邮件失败:', error);
            if (authError) {
                authError.style.color = '#f44336';
                if (error.message && error.message.includes('Email not found')) {
                    authError.textContent = '该邮箱未注册';
                } else if (error.message && error.message.includes('rate limit')) {
                    authError.textContent = '发送过于频繁，请稍后再试';
                } else {
                    authError.textContent = error.message || '发送失败，请稍后重试';
                }
            }
        }
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

        this.game.state.currentUser = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.email ? data.user.email.split('@')[0] : '用户'
        };

        // 保存到 localStorage
        try {
            const constants = window.GAME_CONSTANTS || { STORAGE_KEYS: { USER: 'candy_user' } };
            localStorage.setItem(constants.STORAGE_KEYS.USER, JSON.stringify(this.game.state.currentUser));
        } catch (e) {
            console.warn('保存用户信息到本地失败:', e);
        }
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
                    username: email.split('@')[0]
                }
            }
        });

        if (error) throw error;

        if (!data || !data.user) {
            throw new Error('注册失败：未获取到用户信息');
        }

        this.game.state.currentUser = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.email ? data.user.email.split('@')[0] : '用户'
        };

        // 保存到 localStorage
        try {
            const constants = window.GAME_CONSTANTS || { STORAGE_KEYS: { USER: 'candy_user' } };
            localStorage.setItem(constants.STORAGE_KEYS.USER, JSON.stringify(this.game.state.currentUser));
        } catch (e) {
            console.warn('保存用户信息到本地失败:', e);
        }
    }

    /**
     * 登出
     */
    async logout() {
        if (this.game.state.supabaseReady && this.supabase) {
            try {
                await this.supabase.auth.signOut();
            } catch (error) {
                console.error('登出失败:', error);
            }
        }

        this.game.state.currentUser = null;
        
        try {
            const constants = window.GAME_CONSTANTS || { STORAGE_KEYS: { USER: 'candy_user' } };
            localStorage.removeItem(constants.STORAGE_KEYS.USER);
        } catch (e) {
            console.warn('清除本地用户信息失败:', e);
        }
        
        if (this.game.ui && typeof this.game.ui.updateUserUI === 'function') {
            this.game.ui.updateUserUI();
            if (typeof this.game.ui.showFeedback === 'function') {
                this.game.ui.showFeedback('logout', '#ffa500');
            }
        }
    }

    // ==================== 会话管理 ====================

    /**
     * 加载用户会话
     */
    loadUserSession() {
        try {
            const constants = window.GAME_CONSTANTS || { STORAGE_KEYS: { USER: 'candy_user' } };
            const savedUser = localStorage.getItem(constants.STORAGE_KEYS.USER);
            if (savedUser) {
                this.game.state.currentUser = JSON.parse(savedUser);
            }
        } catch (e) {
            console.warn('加载用户会话失败:', e);
            try {
                const constants = window.GAME_CONSTANTS || { STORAGE_KEYS: { USER: 'candy_user' } };
                localStorage.removeItem(constants.STORAGE_KEYS.USER);
            } catch (removeError) {
                console.warn('清除损坏的用户数据失败:', removeError);
            }
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
        
        try {
            const { data, error } = await this.supabase.auth.refreshSession();
            if (error) throw error;
            
            if (data && data.session) {
                return true;
            }
            return false;
        } catch (error) {
            console.error('刷新会话失败:', error);
            return false;
        }
    }

    /**
     * 处理密码重置回调
     * 这个方法应该在密码重置页面调用
     */
    async handlePasswordReset(newPassword) {
        if (!this.supabase || !this.game.state.supabaseReady) {
            throw new Error('Supabase 未连接');
        }

        if (!this.validatePassword(newPassword)) {
            throw new Error('密码至少需要6位');
        }

        const { error } = await this.supabase.auth.updateUser({
            password: newPassword
        });

        if (error) throw error;
        return true;
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
            console.error('获取会话失败:', error);
            return null;
        }
    }

    /**
     * 监听认证状态变化
     */
    onAuthStateChange(callback) {
        if (!this.supabase) {
            console.warn('Supabase 未初始化，无法监听认证状态');
            return null;
        }

        const { data } = this.supabase.auth.onAuthStateChange((event, session) => {
            if (typeof callback === 'function') {
                callback(event, session);
            }
        });

        return data;
    }
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.AuthManager = AuthManager;
}
