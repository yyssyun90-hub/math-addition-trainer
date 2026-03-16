/**
 * ==================== 糖果数学消消乐 - 存储管理 ====================
 * 包含：本地存储、云端同步、数据导出导入
 * 依赖：utils.js (需要 GAME_CONSTANTS, I18n, Formatters)
 * =================================================================
 */

class StorageManager {
    constructor(game) {
        this.game = game;
        this.keys = GAME_CONSTANTS.STORAGE_KEYS;
        
        // 新增：学生记录存储键
        this.STUDENT_RECORDS_KEY = 'candy_math_student_records_v1';
    }

    // ==================== 本地存储 ====================

    /**
     * 加载本地数据
     */
    loadLocalData() {
        try {
            const saved = localStorage.getItem(this.keys.GAME_DATA);
            if (saved) {
                const data = JSON.parse(saved);
                if (data.version === '4.0') {
                    this.game.state.history = data.history || [];
                    this.game.state.wrongQuestions = data.wrong || [];
                }
            }

            const savedLang = localStorage.getItem(this.keys.LANG);
            if (savedLang) {
                this.game.state.currentLang = savedLang;
                I18n.setLang(savedLang);
            }
        } catch (e) {
            console.warn('加载本地数据失败:', e);
            this.game.state.history = [];
            this.game.state.wrongQuestions = [];
        }
    }

    /**
     * 保存本地数据（注意：这个方法会被节流包装）
     */
    saveLocalData() {
        try {
            // 保存游戏数据
            const data = {
                history: this.game.state.history.slice(-50),
                wrong: this.game.state.wrongQuestions.slice(-100),
                version: '4.0'
            };
            localStorage.setItem(this.keys.GAME_DATA, JSON.stringify(data));

            // 保存游戏统计
            if (this.game.state.attempts > 0) {
                this.saveGameStats();
            }

            // 保存用户信息
            if (this.game.state.currentUser) {
                localStorage.setItem(this.keys.USER, JSON.stringify(this.game.state.currentUser));
            }
        } catch (e) {
            console.warn('保存失败:', e);
        }
    }

    /**
     * 保存游戏统计
     */
    saveGameStats() {
        try {
            const accuracy = Formatters.calculateAccuracy(
                this.game.state.correct, 
                this.game.state.attempts
            );
            
            const gameStats = {
                score: this.game.state.score,
                completed: this.game.state.completed,
                accuracy: accuracy,
                mode: this.game.state.currentMode,
                difficulty: this.game.state.currentDifficulty,
                timestamp: new Date().toISOString()
            };

            let savedStats = [];
            const existing = localStorage.getItem(this.keys.STATS);
            if (existing) {
                savedStats = JSON.parse(existing);
            }

            savedStats.unshift(gameStats);
            if (savedStats.length > 50) {
                savedStats.pop();
            }
            localStorage.setItem(this.keys.STATS, JSON.stringify(savedStats));
        } catch (e) {
            console.warn('保存游戏统计失败:', e);
        }
    }

    /**
     * 保存游客游戏记录
     */
    saveGuestGame() {
        try {
            const guestGames = JSON.parse(localStorage.getItem(this.keys.GUEST_GAMES) || '[]');
            const accuracy = Formatters.calculateAccuracy(
                this.game.state.correct, 
                this.game.state.attempts
            );
            
            guestGames.unshift({
                score: this.game.state.score,
                completed: this.game.state.completed,
                accuracy: accuracy,
                mode: this.game.state.currentMode,
                difficulty: this.game.state.currentDifficulty,
                timestamp: new Date().toISOString()
            });

            if (guestGames.length > 20) {
                guestGames.pop();
            }

            localStorage.setItem(this.keys.GUEST_GAMES, JSON.stringify(guestGames));
        } catch (e) {
            console.warn('保存游客记录失败:', e);
        }
    }

    /**
     * 加载用户会话
     */
    loadUserSession() {
        try {
            const savedUser = localStorage.getItem(this.keys.USER);
            if (savedUser) {
                this.game.state.currentUser = JSON.parse(savedUser);
            }
        } catch (e) {
            localStorage.removeItem(this.keys.USER);
        }
    }

    // ==================== 云端同步 ====================

    /**
     * 同步到云端
     */
    async syncToCloud() {
        if (!this.game.state.supabaseReady || !this.game.state.currentUser || !this.game.state.isOnline) {
            return false;
        }

        try {
            const accuracy = Formatters.calculateAccuracy(
                this.game.state.correct, 
                this.game.state.attempts
            );

            const { error: gameError } = await this.game.state.supabase
                .from('candy_math_game_records')
                .insert([{
                    user_id: this.game.state.currentUser.id,
                    score: this.game.state.score,
                    completed: this.game.state.completed,
                    accuracy: accuracy,
                    mode: this.game.state.currentMode,
                    difficulty: this.game.state.currentDifficulty,
                    created_at: new Date().toISOString()
                }]);

            if (gameError) throw gameError;

            if (this.game.state.wrongQuestions.length > 0) {
                await this.syncWrongQuestions();
            }

            if (this.game.ui) {
                this.game.ui.showFeedback('syncSuccess', '#4CAF50');
            }
            return true;
        } catch (error) {
            console.error('同步失败:', error);
            if (this.game.ui) {
                this.game.ui.showFeedback('syncFailed', '#ff4444');
            }
            return false;
        }
    }

    /**
     * 同步错题到云端
     */
    async syncWrongQuestions() {
        const wrongRecords = this.game.state.wrongQuestions.map(w => ({
            user_id: this.game.state.currentUser.id,
            target: w.target,
            num1: w.num1,
            num2: w.num2,
            created_at: w.timestamp || new Date().toISOString()
        }));

        const { error: wrongError } = await this.game.state.supabase
            .from('candy_math_wrong_questions')
            .insert(wrongRecords);

        if (wrongError) throw wrongError;
    }

    /**
     * 从云端同步
     */
    async syncFromCloud() {
        if (!this.game.state.supabaseReady || !this.game.state.currentUser || !this.game.state.isOnline) {
            return false;
        }

        try {
            const { data: wrong, error: wrongError } = await this.game.state.supabase
                .from('candy_math_wrong_questions')
                .select('*')
                .eq('user_id', this.game.state.currentUser.id)
                .order('created_at', { ascending: false })
                .limit(200);

            if (wrongError) throw wrongError;

            if (wrong && wrong.length > 0) {
                this.game.state.wrongQuestions = wrong.map(w => ({
                    target: w.target,
                    num1: w.num1,
                    num2: w.num2,
                    timestamp: w.created_at
                }));
            }

            if (this.game.ui) {
                this.game.ui.showFeedback('syncSuccess', '#4CAF50');
            }
            return true;
        } catch (error) {
            console.error('拉取失败:', error);
            if (this.game.ui) {
                this.game.ui.showFeedback('syncFailed', '#ff4444');
            }
            return false;
        }
    }

    // ==================== 数据导出导入 ====================

    /**
     * 导出数据
     */
    exportData() {
        try {
            const data = {
                history: this.game.state.history,
                wrong: this.game.state.wrongQuestions,
                stats: JSON.parse(localStorage.getItem(this.keys.STATS) || '[]'),
                guestGames: JSON.parse(localStorage.getItem(this.keys.GUEST_GAMES) || '[]'),
                exportDate: new Date().toISOString(),
                version: '4.0'
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `candy-math-backup-${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            URL.revokeObjectURL(url);

            if (this.game.ui) {
                this.game.ui.showFeedback('exportSuccess', '#4CAF50');
            }
        } catch (e) {
            console.error('导出失败:', e);
            if (this.game.ui) {
                this.game.ui.showFeedback('exportFailed', '#ff4444');
            }
        }
    }

    /**
     * 导入数据
     */
    importData(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            if (data.version === '4.0') {
                if (data.history) this.game.state.history = data.history;
                if (data.wrong) this.game.state.wrongQuestions = data.wrong;
                if (data.stats) localStorage.setItem(this.keys.STATS, JSON.stringify(data.stats));
                if (data.guestGames) localStorage.setItem(this.keys.GUEST_GAMES, JSON.stringify(data.guestGames));
                
                this.saveLocalData();
                if (this.game.ui) {
                    this.game.ui.showFeedback('导入成功', '#4CAF50');
                }
            } else {
                throw new Error('不兼容的数据版本');
            }
        } catch (e) {
            console.error('导入失败:', e);
            if (this.game.ui) {
                this.game.ui.showFeedback('导入失败', '#ff4444');
            }
        }
    }

    /**
     * 清除所有数据
     */
    clearAllData() {
        if (confirm('确定要清除所有本地数据吗？此操作不可恢复。')) {
            localStorage.removeItem(this.keys.GAME_DATA);
            localStorage.removeItem(this.keys.STATS);
            localStorage.removeItem(this.keys.GUEST_GAMES);
            localStorage.removeItem(this.keys.USER);
            
            this.game.state.history = [];
            this.game.state.wrongQuestions = [];
            this.game.state.currentUser = null;
            
            if (this.game.ui) {
                this.game.ui.showFeedback('数据已清除', '#4CAF50');
                this.game.ui.updateUserUI();
            }
        }
    }

    // ==================== 新增：学生记录存储方法 ====================

    /**
     * 保存学生记录
     */
    saveStudentRecords(data) {
        try {
            localStorage.setItem(this.STUDENT_RECORDS_KEY, JSON.stringify(data));
            return true;
        } catch (e) {
            console.warn('保存学生记录失败:', e);
            return false;
        }
    }

    /**
     * 加载学生记录
     */
    loadStudentRecords() {
        try {
            const saved = localStorage.getItem(this.STUDENT_RECORDS_KEY);
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            console.warn('加载学生记录失败:', e);
            return null;
        }
    }

    /**
     * 清除学生记录
     */
    clearStudentRecords() {
        try {
            localStorage.removeItem(this.STUDENT_RECORDS_KEY);
            return true;
        } catch (e) {
            console.warn('清除学生记录失败:', e);
            return false;
        }
    }

    /**
     * 导出所有学生数据（用于备份）
     */
    exportStudentRecords() {
        try {
            const records = this.loadStudentRecords();
            if (!records) {
                alert('没有学生记录可导出');
                return false;
            }

            const data = {
                version: '1.0',
                exportDate: new Date().toISOString(),
                records: records
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `student-records-backup-${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            URL.revokeObjectURL(url);

            return true;
        } catch (e) {
            console.error('导出学生记录失败:', e);
            alert('导出失败：' + e.message);
            return false;
        }
    }

    /**
     * 导入学生数据备份
     */
    importStudentRecords(jsonData) {
        try {
            const data = JSON.parse(jsonData);
            if (data.version === '1.0' && data.records) {
                localStorage.setItem(this.STUDENT_RECORDS_KEY, JSON.stringify(data.records));
                return true;
            }
            return false;
        } catch (e) {
            console.warn('导入学生记录失败:', e);
            return false;
        }
    }
}

// 导出到全局
window.StorageManager = StorageManager;
