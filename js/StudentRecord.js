/**
 * ==================== 糖果数学消消乐 - 学生记录系统 ====================
 * 版本: 3.0.0 (立即保存版)
 * 功能：记录每个学生的学习数据，每道题立即同步到Supabase
 * 修复：确保答题记录实时保存，解决数据丢失问题
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
            currentQuestionStart: null,
            currentSessionId: null  // 新增：保存当前会话ID
        };
        this.storage = game?.storage || null;
        this.supabase = null;
        this.offlineQueue = [];
        
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
    async startSession(studentId, studentName) {
        await this.endSession(); // 先结束之前的会话
        
        this.currentSession = {
            studentId: studentId,
            studentName: studentName || `学生${studentId}`,
            startTime: new Date().toISOString(),
            questions: [],
            currentQuestionStart: Date.now(),
            currentSessionId: null
        };

        // 立即创建数据库会话记录
        await this.createDatabaseSession();

        console.log(`📝 开始记录会话: ${studentName} (${studentId})`);
    }

    /**
     * 创建数据库会话记录
     */
    async createDatabaseSession() {
        if (!this.supabase || !navigator.onLine) return;
        if (!this.currentSession.studentId) return;

        try {
            const today = new Date().toISOString().split('T')[0];
            
            // 检查今天是否已有会话
            const { data: existingSession, error: checkError } = await this.supabase
                .from('game_sessions')
                .select('id')
                .eq('student_id', this.currentSession.studentId)
                .eq('session_date', today)
                .maybeSingle();

            if (checkError) throw checkError;

            if (existingSession) {
                // 使用现有会话
                this.currentSession.currentSessionId = existingSession.id;
                console.log(`📌 使用现有会话: ${existingSession.id}`);
            } else {
                // 创建新会话
                const { data: newSession, error: createError } = await this.supabase
                    .from('game_sessions')
                    .insert([{
                        student_id: this.currentSession.studentId,
                        session_date: today,
                        start_time: this.currentSession.startTime,
                        end_time: this.currentSession.startTime,
                        total_questions: 0,
                        correct_answers: 0,
                        difficulty_level: this.game?.state?.currentDifficulty || 'medium'
                    }])
                    .select()
                    .single();

                if (createError) throw createError;
                
                this.currentSession.currentSessionId = newSession.id;
                console.log(`✅ 创建新会话: ${newSession.id}`);
            }
        } catch (error) {
            console.error('创建数据库会话失败:', error);
        }
    }

    /**
     * 记录一道题目 - 立即保存到数据库
     */
    async recordQuestion(data) {
        if (!this.currentSession.studentId) {
            // 如果没有活跃会话，尝试自动创建
            const currentUser = this.game?.state?.currentUser;
            if (currentUser && currentUser.role === 'student') {
                await this.startSession(currentUser.id, currentUser.name);
            } else {
                console.warn('⚠️ 没有活跃会话，忽略记录');
                return;
            }
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

        // ✅ 关键修复：每道题立即保存到数据库
        await this.saveQuestionToDatabase(questionData);
        
        // 重置题目开始时间
        this.currentSession.currentQuestionStart = Date.now();
    }

    /**
     * 立即保存单题到数据库
     */
    async saveQuestionToDatabase(questionData) {
        if (!this.currentSession.studentId) return;
        
        const studentId = this.currentSession.studentId;
        const studentName = this.currentSession.studentName;
        
        try {
            // 1. 确保学生记录存在
            let { data: student, error: selectError } = await this.supabase
                .from('students')
                .select('student_id, name')
                .eq('student_id', studentId)
                .maybeSingle();
            
            if (selectError) throw selectError;
            
            if (!student) {
                console.log(`👤 创建新学生记录: ${studentName}`);
                const { error: insertError } = await this.supabase
                    .from('students')
                    .insert([{
                        student_id: studentId,
                        name: studentName,
                        created_at: new Date().toISOString()
                    }]);
                
                if (insertError) throw insertError;
            } else if (student.name !== studentName && studentName) {
                // 更新学生姓名
                await this.supabase
                    .from('students')
                    .update({ name: studentName })
                    .eq('student_id', studentId);
            }
            
            // 2. 确保有活跃的会话ID
            if (!this.currentSession.currentSessionId) {
                await this.createDatabaseSession();
            }
            
            if (!this.currentSession.currentSessionId) {
                console.error('无法创建会话ID');
                return;
            }
            
            // 3. 获取当前会话的问题数量（用于 question_number）
            const { count: questionCount, error: countError } = await this.supabase
                .from('question_responses')
                .select('*', { count: 'exact', head: true })
                .eq('session_id', this.currentSession.currentSessionId);
            
            if (countError) throw countError;
            
            const questionNumber = (questionCount || 0) + 1;
            
            // 4. 插入答题记录
            const { error: questionError } = await this.supabase
                .from('question_responses')
                .insert([{
                    student_id: studentId,
                    session_id: this.currentSession.currentSessionId,
                    question_number: questionNumber,
                    target_number: questionData.target,
                    num1: questionData.num1,
                    num2: questionData.num2,
                    is_correct: questionData.isCorrect,
                    response_time: questionData.timeSpent,
                    timestamp: questionData.timestamp,
                    difficulty: questionData.difficulty
                }]);
            
            if (questionError) {
                console.error('保存题目失败:', questionError);
                // 离线时加入队列
                this.offlineQueue.push({
                    studentId,
                    studentName,
                    questionData,
                    sessionId: this.currentSession.currentSessionId,
                    timestamp: Date.now()
                });
                this.saveOfflineQueue();
                return;
            }
            
            console.log(`✅ 题目已保存到数据库 (${studentName}) - 第${questionNumber}题`);
            
            // 5. 更新会话统计
            await this.updateSessionStats();
            
            // 6. 同时保存到本地缓存
            this.saveToLocalCache(questionData);
            
        } catch (error) {
            console.error('保存题目失败:', error);
            // 离线时加入队列
            this.offlineQueue.push({
                studentId,
                studentName,
                questionData,
                sessionId: this.currentSession.currentSessionId,
                timestamp: Date.now()
            });
            this.saveOfflineQueue();
        }
    }

    /**
     * 更新会话统计
     */
    async updateSessionStats() {
        if (!this.currentSession.currentSessionId) return;
        
        try {
            // 获取会话的所有答题记录
            const { data: questions, error: queryError } = await this.supabase
                .from('question_responses')
                .select('response_time, is_correct')
                .eq('session_id', this.currentSession.currentSessionId);
            
            if (queryError) throw queryError;
            
            if (!questions || questions.length === 0) return;
            
            const totalQuestions = questions.length;
            const correctAnswers = questions.filter(q => q.is_correct).length;
            const avgResponseTime = questions.reduce((sum, q) => sum + (q.response_time || 0), 0) / totalQuestions;
            
            // 更新会话
            const { error: updateError } = await this.supabase
                .from('game_sessions')
                .update({
                    total_questions: totalQuestions,
                    correct_answers: correctAnswers,
                    avg_response_time: Math.round(avgResponseTime * 10) / 10,
                    end_time: new Date().toISOString()
                })
                .eq('id', this.currentSession.currentSessionId);
            
            if (updateError) throw updateError;
            
            console.log(`📊 会话统计已更新: ${totalQuestions}题, ${correctAnswers}正确, 平均${Math.round(avgResponseTime * 10) / 10}秒`);
            
        } catch (error) {
            console.error('更新会话统计失败:', error);
        }
    }

    /**
     * 保存到本地缓存
     */
    saveToLocalCache(questionData) {
        const studentId = this.currentSession.studentId;
        const studentName = this.currentSession.studentName;
        
        if (!this.students.has(studentId)) {
            this.students.set(studentId, {
                id: studentId,
                name: studentName,
                sessions: []
            });
        }
        
        const student = this.students.get(studentId);
        
        // 查找或创建当天的会话
        const today = new Date().toISOString().split('T')[0];
        let todaySession = student.sessions.find(s => s.startTime?.split('T')[0] === today);
        
        if (!todaySession) {
            todaySession = {
                startTime: this.currentSession.startTime,
                endTime: new Date().toISOString(),
                questions: [],
                questionCount: 0,
                correctCount: 0,
                avgTime: 0
            };
            student.sessions.push(todaySession);
        }
        
        todaySession.questions.push(questionData);
        todaySession.questionCount = todaySession.questions.length;
        todaySession.correctCount = todaySession.questions.filter(q => q.isCorrect).length;
        todaySession.avgTime = this.calculateAverageTime(todaySession.questions);
        todaySession.endTime = new Date().toISOString();
        
        // 保存到localStorage
        if (this.storage) {
            this.storage.saveStudentRecords(this.serialize());
        }
    }

    /**
     * 结束当前会话并保存
     */
    async endSession() {
        if (this.currentSession.studentId && this.currentSession.questions.length > 0) {
            await this.updateSessionStats();
        }
        
        this.currentSession = {
            studentId: null,
            studentName: null,
            startTime: null,
            questions: [],
            currentQuestionStart: null,
            currentSessionId: null
        };
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
     * 同步到Supabase（用于离线队列重试）
     */
    async syncToSupabase(studentId, studentName, questionData, sessionId) {
        try {
            // 确保学生存在
            let { data: student, error: selectError } = await this.supabase
                .from('students')
                .select('student_id')
                .eq('student_id', studentId)
                .maybeSingle();
            
            if (selectError) throw selectError;
            
            if (!student) {
                await this.supabase
                    .from('students')
                    .insert([{
                        student_id: studentId,
                        name: studentName
                    }]);
            }
            
            // 插入答题记录
            const { error: questionError } = await this.supabase
                .from('question_responses')
                .insert([{
                    student_id: studentId,
                    session_id: sessionId,
                    question_number: questionData.questionNumber || 1,
                    target_number: questionData.target,
                    num1: questionData.num1,
                    num2: questionData.num2,
                    is_correct: questionData.isCorrect,
                    response_time: questionData.timeSpent,
                    timestamp: questionData.timestamp,
                    difficulty: questionData.difficulty
                }]);
            
            if (questionError) throw questionError;
            
            console.log(`✅ 离线数据同步成功: ${studentName}`);
            
        } catch (error) {
            console.error('离线数据同步失败:', error);
            throw error;
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
                await this.syncToSupabase(
                    item.studentId, 
                    item.studentName, 
                    item.questionData,
                    item.sessionId
                );
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
     * 获取学生学习统计
     */
    async getStudentStats(studentId) {
        // 如果在线，从Supabase获取最新数据
        if (this.supabase && navigator.onLine) {
            try {
                const { data, error } = await this.supabase
                    .from('question_responses')
                    .select(`
                        *,
                        game_sessions!inner(*)
                    `)
                    .eq('student_id', studentId);
                
                if (!error && data && data.length > 0) {
                    return this.processStudentStatsFromData(data);
                }
            } catch (error) {
                console.warn('从Supabase获取失败，使用本地数据', error);
            }
        }

        // 回退到本地统计
        return this.getLocalStudentStats(studentId);
    }

    /**
     * 从数据库数据处理学生统计
     */
    processStudentStatsFromData(data) {
        if (!data || data.length === 0) return null;
        
        const totalQuestions = data.length;
        const correctQuestions = data.filter(q => q.is_correct).length;
        const avgTime = data.reduce((sum, q) => sum + (q.response_time || 0), 0) / totalQuestions;
        
        // 按难度统计
        const easyQuestions = data.filter(q => q.difficulty === 'easy');
        const mediumQuestions = data.filter(q => q.difficulty === 'medium');
        const hardQuestions = data.filter(q => q.difficulty === 'hard');
        
        return {
            studentId: data[0].student_id,
            studentName: data[0].game_sessions?.student_name || '未知',
            totalSessions: new Set(data.map(q => q.session_id)).size,
            totalQuestions: totalQuestions,
            accuracy: Math.round((correctQuestions / totalQuestions) * 100),
            correctQuestions: correctQuestions,
            wrongQuestions: totalQuestions - correctQuestions,
            avgTime: Math.round(avgTime * 10) / 10,
            lastActive: data[data.length - 1]?.timestamp,
            difficultyStats: {
                easy: {
                    total: easyQuestions.length,
                    correct: easyQuestions.filter(q => q.is_correct).length,
                    accuracy: easyQuestions.length ? Math.round((easyQuestions.filter(q => q.is_correct).length / easyQuestions.length) * 100) : 0
                },
                medium: {
                    total: mediumQuestions.length,
                    correct: mediumQuestions.filter(q => q.is_correct).length,
                    accuracy: mediumQuestions.length ? Math.round((mediumQuestions.filter(q => q.is_correct).length / mediumQuestions.length) * 100) : 0
                },
                hard: {
                    total: hardQuestions.length,
                    correct: hardQuestions.filter(q => q.is_correct).length,
                    accuracy: hardQuestions.length ? Math.round((hardQuestions.filter(q => q.is_correct).length / hardQuestions.length) * 100) : 0
                }
            }
        };
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
        
        const easyQuestions = allQuestions.filter(q => q.difficulty === 'easy');
        const mediumQuestions = allQuestions.filter(q => q.difficulty === 'medium');
        const hardQuestions = allQuestions.filter(q => q.difficulty === 'hard');

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
                student.sessions[student.sessions.length - 1].endTime : null,
            difficultyStats: {
                easy: {
                    total: easyQuestions.length,
                    correct: easyQuestions.filter(q => q.isCorrect).length,
                    accuracy: easyQuestions.length ? Math.round((easyQuestions.filter(q => q.isCorrect).length / easyQuestions.length) * 100) : 0
                },
                medium: {
                    total: mediumQuestions.length,
                    correct: mediumQuestions.filter(q => q.isCorrect).length,
                    accuracy: mediumQuestions.length ? Math.round((mediumQuestions.filter(q => q.isCorrect).length / mediumQuestions.length) * 100) : 0
                },
                hard: {
                    total: hardQuestions.length,
                    correct: hardQuestions.filter(q => q.isCorrect).length,
                    accuracy: hardQuestions.length ? Math.round((hardQuestions.filter(q => q.isCorrect).length / hardQuestions.length) * 100) : 0
                }
            }
        };
    }

    /**
     * 获取全班统计
     */
    async getClassStats() {
        if (this.supabase && navigator.onLine) {
            try {
                const { data, error } = await this.supabase
                    .from('students')
                    .select(`
                        student_id,
                        name,
                        class,
                        school,
                        question_responses(
                            id,
                            is_correct,
                            response_time,
                            difficulty
                        )
                    `);
                
                if (!error && data) {
                    return this.processClassStatsFromData(data);
                }
            } catch (error) {
                console.warn('从Supabase获取全班统计失败', error);
            }
        }

        // 回退到本地统计
        return this.getLocalClassStats();
    }

    /**
     * 从数据库数据处理全班统计
     */
    processClassStatsFromData(studentsData) {
        const students = [];
        let totalQuestions = 0;
        let totalCorrect = 0;
        let totalSessions = 0;
        
        const difficultyStats = {
            easy: { total: 0, correct: 0, accuracy: 0 },
            medium: { total: 0, correct: 0, accuracy: 0 },
            hard: { total: 0, correct: 0, accuracy: 0 }
        };
        
        for (const student of studentsData) {
            const responses = student.question_responses || [];
            if (responses.length === 0) continue;
            
            const correctCount = responses.filter(r => r.is_correct).length;
            const accuracy = (correctCount / responses.length) * 100;
            const avgTime = responses.reduce((sum, r) => sum + (r.response_time || 0), 0) / responses.length;
            
            students.push({
                studentId: student.student_id,
                studentName: student.name,
                name: student.name,
                totalQuestions: responses.length,
                correctQuestions: correctCount,
                wrongQuestions: responses.length - correctCount,
                accuracy: accuracy,
                avgTime: avgTime,
                class: student.class,
                school: student.school
            });
            
            totalQuestions += responses.length;
            totalCorrect += correctCount;
            
            // 统计难度（需要从responses获取difficulty，但这里可能需要额外查询）
        }
        
        return {
            totalStudents: students.length,
            students: students,
            totalQuestions: totalQuestions,
            totalCorrect: totalCorrect,
            totalWrong: totalQuestions - totalCorrect,
            totalSessions: totalSessions,
            avgClassTime: students.length > 0 ? students.reduce((sum, s) => sum + s.avgTime, 0) / students.length : 0,
            classAccuracy: students.length > 0 ? students.reduce((sum, s) => sum + s.accuracy, 0) / students.length : 0,
            difficultyStats: difficultyStats,
            topStudents: students
                .filter(s => s.totalQuestions >= 10)
                .sort((a, b) => b.accuracy - a.accuracy)
                .slice(0, 5),
            commonMistakes: {}
        };
    }

    /**
     * 获取本地全班统计
     */
    getLocalClassStats() {
        const classStats = {
            totalStudents: this.students.size,
            students: [],
            totalQuestions: 0,
            totalCorrect: 0,
            totalWrong: 0,
            totalSessions: 0,
            avgClassTime: 0,
            classAccuracy: 0,
            difficultyStats: {
                easy: { total: 0, correct: 0, accuracy: 0 },
                medium: { total: 0, correct: 0, accuracy: 0 },
                hard: { total: 0, correct: 0, accuracy: 0 }
            },
            topStudents: [],
            commonMistakes: {}
        };

        this.students.forEach((student, studentId) => {
            const stats = this.getLocalStudentStats(studentId);
            if (stats && stats.totalQuestions > 0) {
                classStats.students.push(stats);
                classStats.totalQuestions += stats.totalQuestions;
                classStats.totalCorrect += stats.correctQuestions;
                classStats.totalWrong += stats.wrongQuestions;
                classStats.totalSessions += stats.totalSessions;
            }
        });

        if (classStats.students.length > 0) {
            classStats.avgClassTime = classStats.students.reduce((sum, s) => sum + s.avgTime, 0) / classStats.students.length;
            classStats.classAccuracy = classStats.students.reduce((sum, s) => sum + s.accuracy, 0) / classStats.students.length;
            classStats.topStudents = classStats.students
                .filter(s => s.totalQuestions >= 10)
                .sort((a, b) => b.accuracy - a.accuracy)
                .slice(0, 5);
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

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                
                const parts = trimmed.split(',').map(s => s.trim());
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
            }

            if (imported > 0 && this.storage) {
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
        if (!this.storage) {
            console.warn('⚠️ storage未初始化，跳过加载');
            return;
        }
        
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
            if (this.storage) {
                this.storage.clearStudentRecords();
            }
            localStorage.removeItem('candy_math_offline_queue');
            return true;
        }
        return false;
    }

    /**
     * 获取学生趋势数据
     */
    async getStudentTrend(studentId) {
        if (!this.supabase || !navigator.onLine) {
            return null;
        }
        
        try {
            // 获取最近7天的数据
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            const { data: recentData, error: recentError } = await this.supabase
                .from('question_responses')
                .select('is_correct')
                .eq('student_id', studentId)
                .gte('timestamp', sevenDaysAgo.toISOString());
            
            if (recentError) throw recentError;
            
            // 获取更早的数据（前3周）
            const fourWeeksAgo = new Date();
            fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
            const threeWeeksAgo = new Date();
            threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
            
            const { data: previousData, error: previousError } = await this.supabase
                .from('question_responses')
                .select('is_correct')
                .eq('student_id', studentId)
                .gte('timestamp', fourWeeksAgo.toISOString())
                .lt('timestamp', threeWeeksAgo.toISOString());
            
            if (previousError) throw previousError;
            
            const recentCorrect = recentData?.filter(r => r.is_correct).length || 0;
            const recentTotal = recentData?.length || 0;
            const recentAccuracy = recentTotal > 0 ? (recentCorrect / recentTotal) * 100 : 0;
            
            const previousCorrect = previousData?.filter(r => r.is_correct).length || 0;
            const previousTotal = previousData?.length || 0;
            const previousAccuracy = previousTotal > 0 ? (previousCorrect / previousTotal) * 100 : 0;
            
            return {
                recent_questions: recentTotal,
                recent_accuracy: recentAccuracy,
                previous_questions: previousTotal,
                previous_accuracy: previousAccuracy,
                accuracy_change: recentAccuracy - previousAccuracy
            };
        } catch (error) {
            console.warn('获取趋势数据失败:', error);
            return null;
        }
    }
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.StudentRecordSystem = StudentRecordSystem;
}
