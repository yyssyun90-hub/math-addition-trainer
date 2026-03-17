/**
 * ==================== 糖果数学消消乐 - 学生记录系统 ====================
 * 版本: 2.0.0 (Supabase集成版)
 * 功能：记录每个学生的学习数据，自动同步到Supabase
 * ==============================================================
 */

class StudentRecordSystem {
    constructor(game) {
        this.game = game;
        this.students = new Map(); // 本地缓存
        this.currentSession = {
            studentId: null,
            studentName: null,
            startTime: null,
            questions: [],
            currentQuestionStart: null
        };
        this.storage = game.storage;
        this.supabase = null;
        this.offlineQueue = []; // 离线队列，用于网络断开时暂存
        
        this.initSupabase();
        this.loadRecords();
        this.processOfflineQueue();
    }

    /**
     * 初始化Supabase连接
     */
    initSupabase() {
        try {
            if (window.supabaseClient) {
                this.supabase = window.supabaseClient;
                console.log('✅ StudentRecord: Supabase连接成功');
            } else {
                console.warn('⚠️ StudentRecord: Supabase未连接，使用本地模式');
            }
        } catch (error) {
            console.error('❌ StudentRecord: Supabase初始化失败', error);
        }
    }

    /**
     * 开始记录学生会话
     */
    startSession(studentId, studentName) {
        this.endSession(); // 先结束之前的会话
        
        this.currentSession = {
            studentId: studentId,
            studentName: studentName || `学生${studentId}`,
            startTime: new Date().toISOString(),
            questions: [],
            currentQuestionStart: Date.now()
        };

        console.log(`📝 开始记录会话: ${studentName} (${studentId})`);
    }

    /**
     * 记录一道题目
     */
    recordQuestion(data) {
        if (!this.currentSession.studentId) {
            console.warn('⚠️ 没有活跃会话，忽略记录');
            return;
        }

        const timeSpent = this.currentSession.currentQuestionStart ? 
            Math.round((Date.now() - this.currentSession.currentQuestionStart) / 1000) : 0;

        const questionData = {
            target: data.target,
            num1: data.num1,
            num2: data.num2,
            isCorrect: data.isCorrect,
            timeSpent: timeSpent,
            timestamp: new Date().toISOString(),
            mode: this.game?.state?.currentMode || 'challenge',
            difficulty: this.game?.state?.currentDifficulty || 'medium'
        };

        this.currentSession.questions.push(questionData);
        console.log(`📊 记录题目: ${data.num1}+${data.num2}=${data.target} ${data.isCorrect ? '✓' : '✗'} (${timeSpent}秒)`);

        // 每5道题自动保存一次
        if (this.currentSession.questions.length % 5 === 0) {
            this.saveCurrentSession();
        }

        // 重置题目开始时间
        this.currentSession.currentQuestionStart = Date.now();
    }

    /**
     * 结束当前会话并保存
     */
    endSession() {
        if (this.currentSession.studentId && this.currentSession.questions.length > 0) {
            this.saveCurrentSession();
        }
        this.currentSession = {
            studentId: null,
            studentName: null,
            startTime: null,
            questions: [],
            currentQuestionStart: null
        };
    }

    /**
     * 保存当前会话到本地存储和Supabase
     */
    async saveCurrentSession() {
        if (!this.currentSession.studentId || this.currentSession.questions.length === 0) {
            console.log('ℹ️ 没有数据需要保存');
            return;
        }

        const studentId = this.currentSession.studentId;
        const studentName = this.currentSession.studentName;

        // 1. 保存到本地缓存
        if (!this.students.has(studentId)) {
            this.students.set(studentId, {
                id: studentId,
                name: studentName,
                sessions: []
            });
        }

        const student = this.students.get(studentId);
        
        const sessionData = {
            startTime: this.currentSession.startTime,
            endTime: new Date().toISOString(),
            questions: [...this.currentSession.questions],
            questionCount: this.currentSession.questions.length,
            correctCount: this.currentSession.questions.filter(q => q.isCorrect).length,
            avgTime: this.calculateAverageTime(this.currentSession.questions)
        };

        student.sessions.push(sessionData);

        // 限制会话数量
        if (student.sessions.length > 50) {
            student.sessions = student.sessions.slice(-50);
        }

        // 2. 保存到localStorage
        this.storage.saveStudentRecords(this.serialize());

        // 3. 同步到Supabase（如果在线）
        if (this.supabase && navigator.onLine) {
            await this.syncToSupabase(studentId, studentName, sessionData);
        } else {
            // 离线时加入队列
            this.offlineQueue.push({
                studentId,
                studentName,
                sessionData,
                timestamp: Date.now()
            });
            this.saveOfflineQueue();
            console.log('📦 网络离线，数据已加入队列');
        }

        // 清空当前会话的问题
        this.currentSession.questions = [];
        this.currentSession.startTime = new Date().toISOString();
    }

    /**
     * 同步到Supabase
     */
    async syncToSupabase(studentId, studentName, sessionData) {
        try {
            console.log('🔄 开始同步到Supabase...');

            // 1. 获取或创建学生记录
            let { data: student, error: selectError } = await this.supabase
                .from('students')
                .select('*')
                .eq('student_id', studentId)
                .maybeSingle();

            if (selectError) throw selectError;

            if (!student) {
                console.log('👤 创建新学生记录');
                const { data: newStudent, error: insertError } = await this.supabase
                    .from('students')
                    .insert([{
                        student_id: studentId,
                        name: studentName,
                        created_at: new Date().toISOString()
                    }])
                    .select()
                    .single();

                if (insertError) throw insertError;
                student = newStudent;
            }

            // 2. 创建游戏会话
            const { data: session, error: sessionError } = await this.supabase
                .from('game_sessions')
                .insert([{
                    student_id: studentId,
                    student_name: studentName,
                    session_date: new Date().toISOString().split('T')[0],
                    start_time: sessionData.startTime,
                    end_time: sessionData.endTime,
                    total_questions: sessionData.questionCount,
                    correct_answers: sessionData.correctCount,
                    avg_response_time: sessionData.avgTime,
                    difficulty_level: this.game?.state?.currentDifficulty || 'medium'
                }])
                .select()
                .single();

            if (sessionError) throw sessionError;
            console.log(`✅ 会话已创建: ID ${session.id}`);

            // 3. 保存每题记录
            const questions = sessionData.questions.map((q, index) => ({
                student_id: studentId,
                session_id: session.id,
                question_number: index + 1,
                target_number: q.target,
                num1: q.num1,
                num2: q.num2,
                is_correct: q.isCorrect,
                response_time: q.timeSpent,
                timestamp: q.timestamp
            }));

            const { error: questionsError } = await this.supabase
                .from('question_responses')
                .insert(questions);

            if (questionsError) throw questionsError;

            console.log(`✅ 成功同步 ${questions.length} 题到Supabase`);

        } catch (error) {
            console.error('❌ Supabase同步失败:', error);
            // 失败时加入队列，稍后重试
            this.offlineQueue.push({
                studentId,
                studentName,
                sessionData,
                timestamp: Date.now()
            });
            this.saveOfflineQueue();
        }
    }

    /**
     * 处理离线队列
     */
    async processOfflineQueue() {
        if (!this.supabase || !navigator.onLine) return;

        try {
            const queue = this.loadOfflineQueue();
            if (queue.length === 0) return;

            console.log(`🔄 处理离线队列: ${queue.length} 条记录`);

            for (const item of queue) {
                await this.syncToSupabase(item.studentId, item.studentName, item.sessionData);
            }

            // 清空队列
            this.offlineQueue = [];
            localStorage.removeItem('candy_math_offline_queue');
            console.log('✅ 离线队列处理完成');

        } catch (error) {
            console.error('❌ 处理离线队列失败:', error);
        }
    }

    /**
     * 保存离线队列
     */
    saveOfflineQueue() {
        try {
            localStorage.setItem('candy_math_offline_queue', JSON.stringify(this.offlineQueue));
        } catch (error) {
            console.error('保存离线队列失败:', error);
        }
    }

    /**
     * 加载离线队列
     */
    loadOfflineQueue() {
        try {
            const saved = localStorage.getItem('candy_math_offline_queue');
            return saved ? JSON.parse(saved) : [];
        } catch (error) {
            console.error('加载离线队列失败:', error);
            return [];
        }
    }

    /**
     * 计算平均答题时间
     */
    calculateAverageTime(questions) {
        if (questions.length === 0) return 0;
        const validTimes = questions.filter(q => q.timeSpent > 0);
        if (validTimes.length === 0) return 0;
        const totalTime = validTimes.reduce((sum, q) => sum + q.timeSpent, 0);
        return Math.round((totalTime / validTimes.length) * 10) / 10;
    }

    /**
     * 获取学生学习统计
     */
    async getStudentStats(studentId) {
        // 先从本地获取
        const localStats = this.getLocalStudentStats(studentId);
        
        // 如果在线，尝试从Supabase获取最新数据
        if (this.supabase && navigator.onLine) {
            try {
                const { data, error } = await this.supabase
                    .from('teacher_dashboard')
                    .select('*')
                    .eq('student_id', studentId)
                    .single();

                if (!error && data) {
                    return {
                        studentId: data.student_id,
                        studentName: data.name,
                        totalQuestions: data.total_questions,
                        avgTime: data.avg_time,
                        accuracy: data.accuracy,
                        lastActive: data.last_active
                    };
                }
            } catch (error) {
                console.warn('从Supabase获取失败，使用本地数据', error);
            }
        }

        return localStats;
    }

    /**
     * 获取本地学生统计
     */
    getLocalStudentStats(studentId) {
        const student = this.students.get(studentId);
        if (!student) return null;

        const allQuestions = student.sessions.flatMap(s => s.questions);
        const totalQuestions = allQuestions.length;
        const correctQuestions = allQuestions.filter(q => q.isCorrect).length;

        return {
            studentId,
            studentName: student.name,
            totalSessions: student.sessions.length,
            totalQuestions,
            accuracy: totalQuestions ? Math.round((correctQuestions / totalQuestions) * 100) : 0,
            correctQuestions,
            wrongQuestions: totalQuestions - correctQuestions,
            avgTime: this.calculateAverageTime(allQuestions),
            lastActive: student.sessions.length > 0 ? 
                student.sessions[student.sessions.length - 1].endTime : null
        };
    }

    /**
     * 获取全班统计
     */
    async getClassStats() {
        // 如果在线，从Supabase获取
        if (this.supabase && navigator.onLine) {
            try {
                const { data, error } = await this.supabase
                    .from('teacher_dashboard')
                    .select('*')
                    .order('last_active', { ascending: false });

                if (!error && data) {
                    return {
                        totalStudents: data.length,
                        students: data,
                        totalQuestions: data.reduce((sum, s) => sum + (s.total_questions || 0), 0),
                        avgClassTime: data.reduce((sum, s) => sum + (s.avg_time || 0), 0) / data.length,
                        avgClassAccuracy: data.reduce((sum, s) => sum + (s.accuracy || 0), 0) / data.length
                    };
                }
            } catch (error) {
                console.warn('从Supabase获取全班统计失败', error);
            }
        }

        // 回退到本地统计
        const classStats = {
            totalStudents: this.students.size,
            students: [],
            totalQuestions: 0,
            avgClassTime: 0,
            avgClassAccuracy: 0
        };

        this.students.forEach((student, studentId) => {
            const stats = this.getLocalStudentStats(studentId);
            if (stats) {
                classStats.students.push(stats);
                classStats.totalQuestions += stats.totalQuestions;
            }
        });

        if (classStats.students.length > 0) {
            classStats.avgClassTime = classStats.students.reduce((sum, s) => sum + s.avgTime, 0) / classStats.students.length;
            classStats.avgClassAccuracy = classStats.students.reduce((sum, s) => sum + s.accuracy, 0) / classStats.students.length;
        }

        return classStats;
    }

    /**
     * 导入学生名单
     */
    importStudents(csvData) {
        try {
            const lines = csvData.split('\n');
            let imported = 0;

            lines.forEach(line => {
                line = line.trim();
                if (!line) return;
                
                const parts = line.split(',').map(s => s.trim());
                if (parts.length >= 2) {
                    const studentId = parts[0];
                    const studentName = parts[1];
                    
                    if (studentId && studentName && !this.students.has(studentId)) {
                        this.students.set(studentId, {
                            id: studentId,
                            name: studentName,
                            sessions: []
                        });
                        imported++;
                    }
                }
            });

            if (imported > 0) {
                this.storage.saveStudentRecords(this.serialize());
            }

            return imported;
        } catch (error) {
            console.error('导入学生失败:', error);
            return 0;
        }
    }

    /**
     * 序列化数据用于存储
     */
    serialize() {
        const data = {};
        this.students.forEach((value, key) => {
            data[key] = value;
        });
        return data;
    }

    /**
     * 从存储加载数据
     */
    loadRecords() {
        try {
            const saved = this.storage.loadStudentRecords();
            if (saved) {
                Object.entries(saved).forEach(([key, value]) => {
                    this.students.set(key, value);
                });
                console.log(`📚 已加载 ${this.students.size} 名学生记录`);
            }
        } catch (error) {
            console.error('加载学生记录失败:', error);
        }
    }

    /**
     * 清除所有记录
     */
    clearAllRecords() {
        if (confirm('确定要清除所有学生记录吗？此操作不可恢复。')) {
            this.students.clear();
            this.storage.clearStudentRecords();
            localStorage.removeItem('candy_math_offline_queue');
            return true;
        }
        return false;
    }

    /**
     * 获取学生速度趋势数据（用于图表）
     */
    async getSpeedTrend(studentId, days = 30) {
        if (this.supabase && navigator.onLine) {
            try {
                const since = new Date();
                since.setDate(since.getDate() - days);

                const { data, error } = await this.supabase
                    .from('question_responses')
                    .select('timestamp, response_time')
                    .eq('student_id', studentId)
                    .gte('timestamp', since.toISOString())
                    .order('timestamp');

                if (!error && data) {
                    // 按天聚合
                    const daily = {};
                    data.forEach(item => {
                        const date = item.timestamp.split('T')[0];
                        if (!daily[date]) {
                            daily[date] = { total: 0, count: 0 };
                        }
                        daily[date].total += item.response_time;
                        daily[date].count++;
                    });

                    return Object.entries(daily).map(([date, stats]) => ({
                        date,
                        avgTime: Math.round((stats.total / stats.count) * 10) / 10
                    }));
                }
            } catch (error) {
                console.warn('获取速度趋势失败', error);
            }
        }
        return [];
    }
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.StudentRecordSystem = StudentRecordSystem;
}
