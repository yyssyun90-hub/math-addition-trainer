/**
 * ==================== 糖果数学消消乐 - 学生记录系统 ====================
 * 版本: 1.0.1
 * 功能：记录每个学生的学习数据，用于生成教学效果报告
 * ==============================================================
 */

class StudentRecordSystem {
    constructor(game) {
        this.game = game;
        this.students = new Map(); // studentId -> student data
        this.currentSession = {
            studentId: null,
            studentName: null,
            startTime: null,
            questions: [],
            currentQuestionStart: null
        };
        this.storage = game.storage;
        this.loadRecords();
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
    }

    /**
     * 开始新题目（用于计算答题时间）
     */
    startQuestion() {
        if (this.currentSession.studentId) {
            this.currentSession.currentQuestionStart = Date.now();
        }
    }

    /**
     * 记录一道题目
     */
    recordQuestion(data) {
        if (!this.currentSession.studentId) return;

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
     * 保存当前会话到本地存储
     */
    saveCurrentSession() {
        if (!this.currentSession.studentId || this.currentSession.questions.length === 0) return;

        const studentId = this.currentSession.studentId;
        if (!this.students.has(studentId)) {
            this.students.set(studentId, {
                id: studentId,
                name: this.currentSession.studentName || `学生${studentId}`,
                sessions: []
            });
        }

        const student = this.students.get(studentId);
        
        // 创建新会话记录
        const sessionData = {
            startTime: this.currentSession.startTime,
            endTime: new Date().toISOString(),
            questions: [...this.currentSession.questions],
            questionCount: this.currentSession.questions.length,
            correctCount: this.currentSession.questions.filter(q => q.isCorrect).length
        };

        student.sessions.push(sessionData);

        // 限制会话数量，保留最近50次
        if (student.sessions.length > 50) {
            student.sessions = student.sessions.slice(-50);
        }

        // 保存到 storage
        this.storage.saveStudentRecords(this.serialize());
        
        // 清空当前会话的问题（保留学生ID和名称）
        this.currentSession.questions = [];
        this.currentSession.startTime = new Date().toISOString(); // 重新开始计时
    }

    /**
     * 获取学生学习统计
     */
    getStudentStats(studentId) {
        const student = this.students.get(studentId);
        if (!student) return null;

        const allQuestions = student.sessions.flatMap(s => s.questions);
        const totalQuestions = allQuestions.length;
        const correctQuestions = allQuestions.filter(q => q.isCorrect).length;
        
        // 按题目类型统计错误率
        const errorStats = {};
        const difficultyStats = {
            easy: { total: 0, correct: 0 },
            medium: { total: 0, correct: 0 },
            hard: { total: 0, correct: 0 }
        };

        allQuestions.forEach(q => {
            if (!q.isCorrect) {
                const key = `${q.num1}+${q.num2}`;
                errorStats[key] = (errorStats[key] || 0) + 1;
            }

            // 统计各难度正确率
            if (q.difficulty && difficultyStats[q.difficulty]) {
                difficultyStats[q.difficulty].total++;
                if (q.isCorrect) difficultyStats[q.difficulty].correct++;
            }
        });

        // 计算各难度正确率
        Object.keys(difficultyStats).forEach(diff => {
            const stats = difficultyStats[diff];
            stats.accuracy = stats.total > 0 ? 
                Math.round((stats.correct / stats.total) * 100) : 0;
        });

        // 按日期统计学习趋势
        const dailyStats = {};
        allQuestions.forEach(q => {
            const date = q.timestamp.split('T')[0];
            if (!dailyStats[date]) {
                dailyStats[date] = { total: 0, correct: 0 };
            }
            dailyStats[date].total++;
            if (q.isCorrect) dailyStats[date].correct++;
        });

        const trend = Object.entries(dailyStats).map(([date, stats]) => ({
            date,
            accuracy: Math.round((stats.correct / stats.total) * 100)
        })).sort((a, b) => a.date.localeCompare(b.date));

        return {
            studentId,
            studentName: student.name,
            totalSessions: student.sessions.length,
            totalQuestions,
            accuracy: totalQuestions ? Math.round((correctQuestions / totalQuestions) * 100) : 0,
            correctQuestions,
            wrongQuestions: totalQuestions - correctQuestions,
            errorStats: Object.fromEntries(
                Object.entries(errorStats)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 10)
            ),
            averageTimePerQuestion: this.calculateAverageTime(allQuestions),
            difficultyStats,
            trend,
            lastActive: student.sessions.length > 0 ? 
                student.sessions[student.sessions.length - 1].endTime : null
        };
    }

    /**
     * 获取全班统计
     */
    getClassStats() {
        const classStats = {
            totalStudents: this.students.size,
            totalQuestions: 0,
            totalCorrect: 0,
            totalSessions: 0,
            students: [],
            commonMistakes: {},
            difficultyStats: {
                easy: { total: 0, correct: 0 },
                medium: { total: 0, correct: 0 },
                hard: { total: 0, correct: 0 }
            },
            averageTime: 0,
            topStudents: []
        };

        let totalTime = 0;
        let timeCount = 0;

        this.students.forEach((student, studentId) => {
            const stats = this.getStudentStats(studentId);
            if (stats) {
                classStats.totalQuestions += stats.totalQuestions;
                classStats.totalCorrect += stats.correctQuestions;
                classStats.totalSessions += stats.totalSessions;
                classStats.students.push(stats);

                // 汇总错误统计
                Object.entries(stats.errorStats).forEach(([key, count]) => {
                    classStats.commonMistakes[key] = (classStats.commonMistakes[key] || 0) + count;
                });

                // 汇总难度统计
                Object.keys(stats.difficultyStats).forEach(diff => {
                    classStats.difficultyStats[diff].total += stats.difficultyStats[diff].total;
                    classStats.difficultyStats[diff].correct += stats.difficultyStats[diff].correct;
                });

                // 计算平均时间
                if (stats.averageTimePerQuestion > 0) {
                    totalTime += stats.averageTimePerQuestion;
                    timeCount++;
                }
            }
        });

        classStats.classAccuracy = classStats.totalQuestions ?
            Math.round((classStats.totalCorrect / classStats.totalQuestions) * 100) : 0;

        // 计算各难度班级正确率
        Object.keys(classStats.difficultyStats).forEach(diff => {
            const stats = classStats.difficultyStats[diff];
            stats.accuracy = stats.total > 0 ? 
                Math.round((stats.correct / stats.total) * 100) : 0;
        });

        classStats.averageTime = timeCount > 0 ? 
            Math.round(totalTime / timeCount) : 0;

        // 排序常见错误
        classStats.commonMistakes = Object.fromEntries(
            Object.entries(classStats.commonMistakes)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
        );

        // 获取优秀学生（前5名）
        classStats.topStudents = classStats.students
            .filter(s => s.totalQuestions >= 10) // 至少10道题
            .sort((a, b) => b.accuracy - a.accuracy)
            .slice(0, 5)
            .map(s => ({
                name: s.studentName,
                accuracy: s.accuracy,
                totalQuestions: s.totalQuestions
            }));

        return classStats;
    }

    /**
     * 计算平均答题时间
     */
    calculateAverageTime(questions) {
        if (questions.length === 0) return 0;
        const validTimes = questions.filter(q => q.timeSpent > 0);
        if (validTimes.length === 0) return 0;
        const totalTime = validTimes.reduce((sum, q) => sum + q.timeSpent, 0);
        return Math.round(totalTime / validTimes.length);
    }

    /**
     * 导入学生名单（CSV格式）
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
            return true;
        }
        return false;
    }
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.StudentRecordSystem = StudentRecordSystem;
}
