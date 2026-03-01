/**
 * ==================== 糖果数学消消乐 - 用户认证 ====================
 * 包含：Supabase初始化、登录、注册、登出、会话管理
 * 依赖：utils.js (需要 I18n, Validators, GAME_CONSTANTS)
 * =============================================================
 */

class AuthManager {
    constructor(game) {
        this.game = game;
        this.supabase = null;
        this.authMode = 'login'; // 'login' 或 'register'
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
        const lang = I18n;

        if (!modal || !title || !submitBtn || !switchDiv) return;

        this.authMode = mode;

        // 清除之前的事件监听器
        this.clearAuthEventListeners();

        if (mode === 'login') {
            title.innerHTML = '🔐 ' + lang.t('login');
            submitBtn.innerHTML = lang.t('login');
            switchDiv.innerHTML = lang.t('noAccount') + ' <span id="switch-to-register" style="cursor:pointer;">' + lang.t('registerNow') + '</span>';
            
            // 添加新的事件监听器
            const switchToRegister = document.getElementById('switch-to-register');
            if (switchToRegister) {
                const handler = () => this.showAuthModal('register');
                switchToRegister.addEventListener('click', handler);
                this.eventHandlers.set('switch-to-register', handler);
            }
        } else {
            title.innerHTML = '📝 ' + lang.t('register');
            submitBtn.innerHTML = lang.t('register');
            switchDiv.innerHTML = lang.t('hasAccount') + ' <span id="switch-to-login" style="cursor:pointer;">' + lang.t('loginNow') + '</span>';
            
            // 添加新的事件监听器
            const switchToLogin = document.getElementById('switch-to-login');
            if (switchToLogin) {
                const handler = () => this.showAuthModal('login');
                switchToLogin.addEventListener('click', handler);
                this.eventHandlers.set('switch-to-login', handler);
            }
        }

        // 设置提交按钮的事件监听器
        const submitHandler = () => this.handleAuth();
        submitBtn.addEventListener('click', submitHandler);
        this.eventHandlers.set('auth-submit', submitHandler);

        // 清空输入框和错误信息
        const emailInput = document.getElementById('auth-email');
        const passwordInput = document.getElementById('auth-password');
        const authError = document.getElementById('auth-error');
        
        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';
        if (authError) authError.textContent = '';

        modal.style.display = 'flex';
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
        if (this.game.ui) {
            this.game.ui.closeModal('auth-modal');
        } else {
            const modal = document.getElementById('auth-modal');
            if (modal) modal.style.display = 'none';
        }
    }

    // ==================== 认证处理 ====================

    /**
     * 处理登录/注册
     */
    async handleAuth() {
        const email = document.getElementById('auth-email')?.value;
        const password = document.getElementById('auth-password')?.value;
        const authError = document.getElementById('auth-error');
        const lang = I18n;

        if (!email || !password) {
            if (authError) authError.textContent = lang.t('email') + '和' + lang.t('password') + '不能为空';
            return;
        }

        if (!Validators.isEmail(email)) {
            if (authError) authError.textContent = '请输入有效的邮箱地址';
            return;
        }

        if (!Validators.isStrongPassword(password)) {
            if (authError) authError.textContent = '密码至少6位';
            return;
        }

        const isLogin = this.authMode === 'login';

        if (!this.game.state.supabaseReady) {
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
            
            if (this.game.ui) {
                this.game.ui.showFeedback(isLogin ? 'loginSuccess' : 'registerSuccess', '#4CAF50');
                this.game.ui.updateUserUI();  // UI模块会处理用户界面的更新
            }
            
            // 保存用户信息到本地
            if (this.game.storage) {
                this.game.storage.saveLocalData();
                await this.game.storage.syncFromCloud();
            }

            this.closeAuthModal();
        } catch (error) {
            console.error('认证失败:', error);
            if (authError) {
                if (error.message.includes('Invalid login credentials')) {
                    authError.textContent = '邮箱或密码错误';
                } else if (error.message.includes('User already registered')) {
                    authError.textContent = '该邮箱已被注册';
                } else {
                    authError.textContent = error.message;
                }
            }
        }
    }

    /**
     * 登录
     */
    async login(email, password) {
        const { data, error } = await this.supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) throw error;

        this.game.state.currentUser = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.email.split('@')[0]
        };
    }

    /**
     * 注册
     */
    async register(email, password) {
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

        this.game.state.currentUser = {
            id: data.user.id,
            email: data.user.email,
            name: data.user.email.split('@')[0]
        };
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
        localStorage.removeItem(GAME_CONSTANTS.STORAGE_KEYS.USER);
        
        if (this.game.ui) {
            this.game.ui.updateUserUI();
            this.game.ui.showFeedback('logout', '#ffa500');
        }
    }

    // ==================== 会话管理 ====================

    /**
     * 加载用户会话
     */
    loadUserSession() {
        try {
            const savedUser = localStorage.getItem(GAME_CONSTANTS.STORAGE_KEYS.USER);
            if (savedUser) {
                this.game.state.currentUser = JSON.parse(savedUser);
            }
        } catch (e) {
            localStorage.removeItem(GAME_CONSTANTS.STORAGE_KEYS.USER);
        }
    }

    /**
     * 检查是否已登录
     */
    isLoggedIn() {
        return !!this.game.state.currentUser;
    }

    /**
     * 获取当前用户
     */
    getCurrentUser() {
        return this.game.state.currentUser;
    }

    /**
     * 刷新 Supabase 会话
     */
    async refreshSession() {
        if (!this.supabase || !this.game.state.supabaseReady) return false;
        
        try {
            const { data, error } = await this.supabase.auth.refreshSession();
            if (error) throw error;
            return !!data.session;
        } catch (error) {
            console.error('刷新会话失败:', error);
            return false;
        }
    }
}

// 导出到全局
window.AuthManager = AuthManager;
