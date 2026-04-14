/**
 * ==================== 糖果数学消消乐 - 学习报告生成器 ====================
 * 版本: 2.0.0 (增强版 - 诊断分析 + 薄弱点 + 趋势 + 中英文双语)
 * 功能：生成 PDF/Excel 格式的学习报告，包含诊断分析和改进建议
 * 依赖：jsPDF, jspdf-autotable, XLSX
 * ====================================================================
 */

class ReportGenerator {
    constructor(game) {
        this.game = game;
        this.studentRecord = game.studentRecord;
    }

    /**
     * 获取翻译文本
     */
    t(key, defaultValue) {
        if (typeof I18n !== 'undefined' && I18n.t) {
            const translated = I18n.t(key);
            if (translated && translated !== key) return translated;
        }
        return defaultValue || key;
    }

    /**
     * 获取诊断评语（根据正确率）
     */
    getDiagnosisByAccuracy(accuracy) {
        if (accuracy >= 90) {
            return {
                level: this.t('excellent', '优秀'),
                comment: this.t('excellentComment', '表现非常出色！计算能力强，继续保持！'),
                color: '#2ecc71'
            };
        } else if (accuracy >= 75) {
            return {
                level: this.t('good', '良好'),
                comment: this.t('goodComment', '表现良好，有扎实的基础，继续努力会更上一层楼！'),
                color: '#3498db'
            };
        } else if (accuracy >= 60) {
            return {
                level: this.t('fair', '中等'),
                comment: this.t('fairComment', '处于中等水平，需要加强练习，特别是容易出错的题目。'),
                color: '#f39c12'
            };
        } else {
            return {
                level: this.t('needsImprovement', '需要加强'),
                comment: this.t('needsImprovementComment', '基础较弱，建议从简单难度开始，多练习基础加减法。'),
                color: '#e74c3c'
            };
        }
    }

    /**
     * 获取速度诊断评语
     */
    getSpeedDiagnosis(avgTime) {
        if (avgTime === 0) {
            return {
                level: '-',
                comment: this.t('noSpeedData', '暂无答题数据'),
                color: '#95a5a6'
            };
        } else if (avgTime < 5) {
            return {
                level: this.t('fast', '快速'),
                comment: this.t('fastComment', '计算速度很快，反应敏捷！'),
                color: '#2ecc71'
            };
        } else if (avgTime < 10) {
            return {
                level: this.t('normal', '正常'),
                comment: this.t('normalComment', '计算速度正常，继续练习可以提高速度。'),
                color: '#3498db'
            };
        } else {
            return {
                level: this.t('slow', '较慢'),
                comment: this.t('slowComment', '计算速度较慢，建议多练习基础口算。'),
                color: '#e74c3c'
            };
        }
    }

    /**
     * 获取综合建议
     */
    getRecommendations(stats) {
        const recommendations = [];
        
        if (stats.accuracy < 60) {
            recommendations.push(this.t('recBasicPractice', '• 建议从简单难度开始，每天练习10-15分钟基础加减法'));
        }
        if (stats.avgTime > 10) {
            recommendations.push(this.t('recSpeedDrill', '• 建议进行限时练习，提高计算速度'));
        }
        if (stats.difficultyStats?.hard?.accuracy < 50) {
            recommendations.push(this.t('recChallengeHard', '• 困难难度正确率较低，建议先巩固中等难度'));
        }
        if (stats.wrongQuestions > stats.correctQuestions) {
            recommendations.push(this.t('recReviewMistakes', '• 建议复习错题，找出薄弱点针对性练习'));
        }
        if (stats.totalQuestions < 20) {
            recommendations.push(this.t('recMorePractice', '• 答题数量较少，建议增加练习频率'));
        }
        
        if (recommendations.length === 0) {
            recommendations.push(this.t('recKeepUp', '• 表现优秀，继续保持！可以尝试挑战更高难度'));
        }
        
        return recommendations;
    }

    /**
     * 分析薄弱点（最常见的错误组合）
     */
    analyzeWeaknesses(errorStats, totalWrong) {
        if (!errorStats || totalWrong === 0) return [];
        
        const sorted = Object.entries(errorStats)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
        
        return sorted.map(([key, count]) => ({
            combination: key,
            count: count,
            percentage: Math.round((count / totalWrong) * 100)
        }));
    }

    /**
     * 生成学生个人报告 (PDF) - 增强版
     */
    async generateStudentReport(studentId) {
        try {
            const stats = this.studentRecord.getStudentStats(studentId);
            if (!stats) {
                alert(this.t('noStudentData', '没有找到该学生的数据'));
                return;
            }

            if (typeof window.jspdf === 'undefined') {
                alert(this.t('pdfNotLoaded', 'PDF库未加载，请刷新页面重试'));
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            let y = 20;

            // 标题
            doc.setFontSize(24);
            doc.setTextColor(212, 107, 141); // #d46b8d
            doc.text(this.t('studentLearningReport', '学生学习报告'), 105, y, { align: 'center' });
            
            y += 12;
            
            // 副标题
            doc.setFontSize(12);
            doc.setTextColor(150, 150, 150);
            doc.text(this.t('generatedBy', '由糖果数学消消乐自动生成'), 105, y, { align: 'center' });
            
            y += 10;

            // 装饰线
            doc.setDrawColor(255, 182, 193);
            doc.setLineWidth(0.5);
            doc.line(20, y, 190, y);
            
            y += 12;

            // 学生信息
            doc.setFontSize(14);
            doc.setTextColor(0, 0, 0);
            doc.text(`${this.t('studentName', '学生姓名')}: ${stats.studentName || '-'}`, 20, y);
            doc.text(`${this.t('studentId', '学生ID')}: ${stats.studentId}`, 120, y);
            
            y += 8;
            doc.text(`${this.t('reportTime', '报告生成时间')}: ${new Date().toLocaleString('zh-CN')}`, 20, y);
            doc.text(`${this.t('lastActive', '最后活动')}: ${stats.lastActive ? new Date(stats.lastActive).toLocaleString('zh-CN') : this.t('none', '无')}`, 120, y);

            y += 15;

            // ========== 诊断评语 ==========
            const diagnosis = this.getDiagnosisByAccuracy(stats.accuracy || 0);
            const speedDiagnosis = this.getSpeedDiagnosis(stats.avgTime || 0);
            
            doc.setFillColor(240, 248, 255);
            doc.roundedRect(15, y, 180, 35, 5, 5, 'F');
            
            doc.setFontSize(13);
            doc.setTextColor(diagnosis.color);
            doc.text(`${this.t('overallRating', '综合评级')}: ${diagnosis.level}`, 20, y + 10);
            
            doc.setFontSize(11);
            doc.setTextColor(80, 80, 80);
            doc.text(diagnosis.comment, 20, y + 22);
            doc.text(`${this.t('speedRating', '速度评级')}: ${speedDiagnosis.level} | ${speedDiagnosis.comment}`, 20, y + 30);

            y += 45;

            // 学习统计标题
            doc.setFontSize(16);
            doc.setTextColor(212, 107, 141);
            doc.text('📊 ' + this.t('learningStats', '学习统计'), 20, y);
            
            y += 10;

            // 统计卡片 - 第一行
            const cardWidth = 52;
            const cardHeight = 38;
            const cardSpacing = 8;
            
            this.drawStatCard(doc, 20, y, cardWidth, cardHeight, 
                this.t('totalQuestions', '总答题数'), stats.totalQuestions || 0, '#e74c3c');
            this.drawStatCard(doc, 20 + cardWidth + cardSpacing, y, cardWidth, cardHeight, 
                this.t('correctAnswers', '正确题数'), stats.correctQuestions || 0, '#2ecc71');
            this.drawStatCard(doc, 20 + (cardWidth + cardSpacing) * 2, y, cardWidth, cardHeight, 
                this.t('accuracy', '正确率'), (stats.accuracy || 0) + '%', '#3498db');
            
            y += cardHeight + 8;

            // 统计卡片 - 第二行
            this.drawStatCard(doc, 20, y, cardWidth, cardHeight, 
                this.t('totalSessions', '练习次数'), stats.totalSessions || 0, '#f39c12');
            this.drawStatCard(doc, 20 + cardWidth + cardSpacing, y, cardWidth, cardHeight, 
                this.t('avgTime', '平均用时'), (stats.avgTime || 0) + this.t('seconds', '秒'), '#9b59b6');
            this.drawStatCard(doc, 20 + (cardWidth + cardSpacing) * 2, y, cardWidth, cardHeight, 
                this.t('wrongAnswers', '错误题数'), stats.wrongQuestions || 0, '#e67e22');

            y += cardHeight + 15;

            // 各难度正确率
            doc.setFontSize(16);
            doc.setTextColor(212, 107, 141);
            doc.text('🎯 ' + this.t('difficultyAccuracy', '各难度正确率'), 20, y);
            
            y += 10;

            const difficultyData = [
                [this.t('difficulty', '难度'), this.t('questions', '答题数'), this.t('correct', '正确'), this.t('accuracy', '正确率')],
                [
                    this.t('easy', '简单'), 
                    stats.difficultyStats?.easy?.total || 0, 
                    stats.difficultyStats?.easy?.correct || 0, 
                    (stats.difficultyStats?.easy?.accuracy || 0) + '%'
                ],
                [
                    this.t('medium', '中等'), 
                    stats.difficultyStats?.medium?.total || 0, 
                    stats.difficultyStats?.medium?.correct || 0, 
                    (stats.difficultyStats?.medium?.accuracy || 0) + '%'
                ],
                [
                    this.t('hard', '困难'), 
                    stats.difficultyStats?.hard?.total || 0, 
                    stats.difficultyStats?.hard?.correct || 0, 
                    (stats.difficultyStats?.hard?.accuracy || 0) + '%'
                ]
            ];

            doc.autoTable({
                startY: y,
                head: [difficultyData[0]],
                body: difficultyData.slice(1),
                theme: 'striped',
                headStyles: { fillColor: [212, 107, 141] },
                styles: { fontSize: 10 }
            });

            y = doc.lastAutoTable.finalY + 12;

            // 检查是否需要新页
            if (y > 240) {
                doc.addPage();
                y = 20;
            }

            // ========== 薄弱点分析 ==========
            const weaknesses = this.analyzeWeaknesses(stats.errorStats, stats.wrongQuestions || 0);
            
            doc.setFontSize(16);
            doc.setTextColor(212, 107, 141);
            doc.text('❌ ' + this.t('weaknessAnalysis', '薄弱点分析'), 20, y);
            
            y += 10;

            if (weaknesses.length > 0) {
                const weaknessData = [
                    [this.t('rank', '排名'), this.t('combination', '题目组合'), this.t('errorCount', '错误次数'), this.t('percentage', '占比')],
                    ...weaknesses.map((w, i) => [i + 1, w.combination, w.count, w.percentage + '%'])
                ];

                doc.autoTable({
                    startY: y,
                    head: [weaknessData[0]],
                    body: weaknessData.slice(1),
                    theme: 'striped',
                    headStyles: { fillColor: [231, 76, 60] },
                    styles: { fontSize: 10 }
                });

                y = doc.lastAutoTable.finalY + 12;
            } else {
                doc.setFontSize(11);
                doc.setTextColor(100, 100, 100);
                doc.text(this.t('noWeaknessData', '暂无错误记录，表现很好！'), 30, y);
                y += 15;
            }

            // 检查是否需要新页
            if (y > 250) {
                doc.addPage();
                y = 20;
            }

            // ========== 改进建议 ==========
            doc.setFontSize(16);
            doc.setTextColor(212, 107, 141);
            doc.text('💡 ' + this.t('recommendations', '改进建议'), 20, y);
            
            y += 12;
            
            const recommendations = this.getRecommendations(stats);
            
            doc.setFontSize(11);
            doc.setTextColor(60, 60, 60);
            recommendations.forEach(rec => {
                doc.text(rec, 25, y);
                y += 8;
            });

            // 保存PDF
            const fileName = `${stats.studentName || 'student'}_${this.t('learningReport', '学习报告')}_${new Date().toISOString().slice(0,10)}.pdf`;
            doc.save(fileName);
            
        } catch (error) {
            console.error('生成PDF报告失败:', error);
            alert(this.t('generateReportFailed', '生成报告失败') + '：' + error.message);
        }
    }

    /**
     * 绘制统计卡片
     */
    drawStatCard(doc, x, y, width, height, label, value, color) {
        try {
            // 卡片背景
            doc.setFillColor(250, 250, 252);
            doc.setDrawColor(230, 230, 235);
            doc.setLineWidth(0.3);
            doc.roundedRect(x, y, width, height, 4, 4, 'FD');

            // 标签
            doc.setFontSize(9);
            doc.setTextColor(120, 120, 130);
            doc.text(label, x + width/2, y + 10, { align: 'center' });

            // 数值
            doc.setFontSize(14);
            doc.setTextColor(color);
            doc.text(String(value), x + width/2, y + 26, { align: 'center' });
        } catch (error) {
            console.error('绘制统计卡片失败:', error);
        }
    }

    // ==================== 第 1 部分结束 ====================
    // ==================== 第 2 部分 / 共 2 部分 ====================

    /**
     * 获取班级综合诊断
     */
    getClassDiagnosis(classStats) {
        const avgAccuracy = classStats.classAccuracy || 0;
        
        if (avgAccuracy >= 85) {
            return {
                level: this.t('excellent', '优秀'),
                comment: this.t('classExcellentComment', '班级整体表现优秀，计算能力扎实，继续保持！'),
                color: '#2ecc71'
            };
        } else if (avgAccuracy >= 70) {
            return {
                level: this.t('good', '良好'),
                comment: this.t('classGoodComment', '班级整体表现良好，建议关注正确率较低的学生。'),
                color: '#3498db'
            };
        } else if (avgAccuracy >= 55) {
            return {
                level: this.t('fair', '中等'),
                comment: this.t('classFairComment', '班级处于中等水平，建议加强基础练习和错题复习。'),
                color: '#f39c12'
            };
        } else {
            return {
                level: this.t('needsImprovement', '需要加强'),
                comment: this.t('classNeedsImprovementComment', '班级整体基础较弱，建议从简单难度开始，逐步提升。'),
                color: '#e74c3c'
            };
        }
    }

    /**
     * 生成全班报告 (PDF) - 增强版
     */
    async generateClassReport() {
        try {
            const classStats = this.studentRecord.getClassStats();
            
            if (classStats.totalStudents === 0) {
                alert(this.t('noStudentData', '暂无学生数据'));
                return;
            }

            if (typeof window.jspdf === 'undefined') {
                alert(this.t('pdfNotLoaded', 'PDF库未加载，请刷新页面重试'));
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            let y = 20;

            // 标题
            doc.setFontSize(24);
            doc.setTextColor(212, 107, 141);
            doc.text(this.t('classLearningReport', '全班学习报告'), 105, y, { align: 'center' });
            
            y += 12;
            
            doc.setFontSize(12);
            doc.setTextColor(150, 150, 150);
            doc.text(this.t('generatedBy', '由糖果数学消消乐自动生成'), 105, y, { align: 'center' });
            
            y += 10;

            // 装饰线
            doc.setDrawColor(255, 182, 193);
            doc.setLineWidth(0.5);
            doc.line(20, y, 190, y);
            
            y += 12;

            // 班级概况
            doc.setFontSize(14);
            doc.setTextColor(0, 0, 0);
            doc.text(`${this.t('reportTime', '报告生成时间')}: ${new Date().toLocaleString('zh-CN')}`, 20, y);
            
            y += 8;
            doc.text(`${this.t('totalStudents', '学生人数')}: ${classStats.totalStudents} ${this.t('studentsUnit', '人')}`, 20, y);
            doc.text(`${this.t('totalQuestions', '总答题数')}: ${classStats.totalQuestions} ${this.t('questionsUnit', '题')}`, 120, y);
            
            y += 8;
            doc.text(`${this.t('totalSessions', '总练习次数')}: ${classStats.totalSessions || 0} ${this.t('sessionsUnit', '次')}`, 20, y);
            doc.text(`${this.t('classAvgAccuracy', '班级平均正确率')}: ${classStats.classAccuracy || 0}%`, 120, y);
            
            y += 8;
            doc.text(`${this.t('classAvgTime', '班级平均用时')}: ${classStats.avgClassTime || 0} ${this.t('seconds', '秒')}`, 20, y);

            y += 15;

            // 班级诊断
            const diagnosis = this.getClassDiagnosis(classStats);
            
            doc.setFillColor(240, 248, 255);
            doc.roundedRect(15, y, 180, 28, 5, 5, 'F');
            
            doc.setFontSize(13);
            doc.setTextColor(diagnosis.color);
            doc.text(`${this.t('classOverallRating', '班级综合评级')}: ${diagnosis.level}`, 20, y + 10);
            
            doc.setFontSize(11);
            doc.setTextColor(80, 80, 80);
            doc.text(diagnosis.comment, 20, y + 22);

            y += 40;

            // 各难度班级正确率
            doc.setFontSize(16);
            doc.setTextColor(212, 107, 141);
            doc.text('📊 ' + this.t('difficultyClassAccuracy', '各难度班级正确率'), 20, y);
            
            y += 10;

            const difficultyData = [
                [this.t('difficulty', '难度'), this.t('totalQuestions', '答题数'), this.t('correctAnswers', '正确数'), this.t('accuracy', '正确率')],
                [
                    this.t('easy', '简单'),
                    classStats.difficultyStats?.easy?.total || 0,
                    classStats.difficultyStats?.easy?.correct || 0,
                    (classStats.difficultyStats?.easy?.accuracy || 0) + '%'
                ],
                [
                    this.t('medium', '中等'),
                    classStats.difficultyStats?.medium?.total || 0,
                    classStats.difficultyStats?.medium?.correct || 0,
                    (classStats.difficultyStats?.medium?.accuracy || 0) + '%'
                ],
                [
                    this.t('hard', '困难'),
                    classStats.difficultyStats?.hard?.total || 0,
                    classStats.difficultyStats?.hard?.correct || 0,
                    (classStats.difficultyStats?.hard?.accuracy || 0) + '%'
                ]
            ];

            doc.autoTable({
                startY: y,
                head: [difficultyData[0]],
                body: difficultyData.slice(1),
                theme: 'striped',
                headStyles: { fillColor: [212, 107, 141] },
                styles: { fontSize: 10 }
            });

            y = doc.lastAutoTable.finalY + 12;

            // 优秀学生（前5名）
            if (y > 230) {
                doc.addPage();
                y = 20;
            }

            doc.setFontSize(16);
            doc.setTextColor(212, 107, 141);
            doc.text('🏆 ' + this.t('topStudents', '优秀学生（前5名）'), 20, y);
            
            y += 10;

            if (classStats.topStudents && classStats.topStudents.length > 0) {
                const topData = [
                    [this.t('rank', '排名'), this.t('studentName', '学生姓名'), this.t('questions', '答题数'), this.t('accuracy', '正确率')],
                    ...classStats.topStudents.slice(0, 5).map((s, i) => [i + 1, s.name, s.totalQuestions, (s.accuracy || 0) + '%'])
                ];

                doc.autoTable({
                    startY: y,
                    head: [topData[0]],
                    body: topData.slice(1),
                    theme: 'striped',
                    headStyles: { fillColor: [241, 196, 15] },
                    styles: { fontSize: 10 }
                });

                y = doc.lastAutoTable.finalY + 12;
            }

            // 需要关注的学生（正确率低于60%）
            if (y > 230) {
                doc.addPage();
                y = 20;
            }

            const lowPerformingStudents = classStats.students?.filter(s => (s.accuracy || 0) < 60) || [];
            
            if (lowPerformingStudents.length > 0) {
                doc.setFontSize(16);
                doc.setTextColor(231, 76, 60);
                doc.text('⚠️ ' + this.t('needsAttention', '需要关注的学生（正确率低于60%）'), 20, y);
                
                y += 10;

                const lowData = [
                    [this.t('studentName', '学生姓名'), this.t('questions', '答题数'), this.t('accuracy', '正确率'), this.t('avgTime', '平均用时')],
                    ...lowPerformingStudents.slice(0, 10).map(s => [
                        s.name, 
                        s.totalQuestions, 
                        (s.accuracy || 0) + '%', 
                        (s.avgTime || 0) + this.t('seconds', '秒')
                    ])
                ];

                doc.autoTable({
                    startY: y,
                    head: [lowData[0]],
                    body: lowData.slice(1),
                    theme: 'striped',
                    headStyles: { fillColor: [231, 76, 60] },
                    styles: { fontSize: 10 }
                });
            }

            // 保存PDF
            const fileName = `${this.t('classReport', '全班学习报告')}_${new Date().toISOString().slice(0,10)}.pdf`;
            doc.save(fileName);
            
        } catch (error) {
            console.error('生成全班报告失败:', error);
            alert(this.t('generateReportFailed', '生成报告失败') + '：' + error.message);
        }
    }

    /**
     * 导出为 Excel (用于教师进一步分析) - 增强版
     */
    exportToExcel() {
        try {
            const classStats = this.studentRecord.getClassStats();
            
            if (classStats.totalStudents === 0) {
                alert(this.t('noStudentData', '暂无学生数据'));
                return;
            }

            if (typeof XLSX === 'undefined') {
                alert(this.t('excelNotLoaded', 'Excel库未加载，请刷新页面重试'));
                return;
            }

            const wb = XLSX.utils.book_new();

            // 1. 学生学习数据表
            const studentData = classStats.students.map(s => {
                const diagnosis = this.getDiagnosisByAccuracy(s.accuracy || 0);
                const speedDiagnosis = this.getSpeedDiagnosis(s.avgTime || 0);
                
                return {
                    [this.t('studentName', '学生姓名')]: s.studentName,
                    [this.t('studentId', '学生ID')]: s.studentId,
                    [this.t('totalSessions', '练习次数')]: s.totalSessions || 0,
                    [this.t('totalQuestions', '总答题数')]: s.totalQuestions || 0,
                    [this.t('correctAnswers', '正确题数')]: s.correctQuestions || 0,
                    [this.t('wrongAnswers', '错误题数')]: s.wrongQuestions || 0,
                    [this.t('accuracy', '正确率')]: (s.accuracy || 0) + '%',
                    [this.t('avgTime', '平均用时')]: (s.avgTime || 0) + this.t('seconds', '秒'),
                    [this.t('easyAccuracy', '简单正确率')]: (s.difficultyStats?.easy?.accuracy || 0) + '%',
                    [this.t('mediumAccuracy', '中等正确率')]: (s.difficultyStats?.medium?.accuracy || 0) + '%',
                    [this.t('hardAccuracy', '困难正确率')]: (s.difficultyStats?.hard?.accuracy || 0) + '%',
                    [this.t('overallRating', '综合评级')]: diagnosis.level,
                    [this.t('speedRating', '速度评级')]: speedDiagnosis.level,
                    [this.t('lastActive', '最后活动')]: s.lastActive ? new Date(s.lastActive).toLocaleString('zh-CN') : this.t('none', '无')
                };
            });

            const ws1 = XLSX.utils.json_to_sheet(studentData);
            XLSX.utils.book_append_sheet(wb, ws1, this.t('studentData', '学生学习数据'));

            // 2. 薄弱点分析表
            const weaknesses = this.analyzeWeaknesses(classStats.commonMistakes, classStats.totalQuestions || 0);
            
            if (weaknesses.length > 0) {
                const weaknessData = weaknesses.map((w, i) => ({
                    [this.t('rank', '排名')]: i + 1,
                    [this.t('combination', '题目组合')]: w.combination,
                    [this.t('errorCount', '错误次数')]: w.count,
                    [this.t('percentage', '占比')]: w.percentage + '%'
                }));

                const ws2 = XLSX.utils.json_to_sheet(weaknessData);
                XLSX.utils.book_append_sheet(wb, ws2, this.t('weaknessAnalysis', '薄弱点分析'));
            }

            // 3. 班级统计摘要
            const summaryData = [{
                [this.t('statItem', '统计项目')]: this.t('totalStudents', '学生人数'),
                [this.t('value', '数值')]: classStats.totalStudents
            }, {
                [this.t('statItem', '统计项目')]: this.t('totalSessions', '总练习次数'),
                [this.t('value', '数值')]: classStats.totalSessions || 0
            }, {
                [this.t('statItem', '统计项目')]: this.t('totalQuestions', '总答题数'),
                [this.t('value', '数值')]: classStats.totalQuestions
            }, {
                [this.t('statItem', '统计项目')]: this.t('correctAnswers', '总正确题数'),
                [this.t('value', '数值')]: classStats.totalCorrect || 0
            }, {
                [this.t('statItem', '统计项目')]: this.t('classAvgAccuracy', '班级平均正确率'),
                [this.t('value', '数值')]: (classStats.classAccuracy || 0) + '%'
            }, {
                [this.t('statItem', '统计项目')]: this.t('classAvgTime', '班级平均用时'),
                [this.t('value', '数值')]: (classStats.avgClassTime || 0) + this.t('seconds', '秒')
            }, {
                [this.t('statItem', '统计项目')]: this.t('easyAccuracy', '简单题正确率'),
                [this.t('value', '数值')]: (classStats.difficultyStats?.easy?.accuracy || 0) + '%'
            }, {
                [this.t('statItem', '统计项目')]: this.t('mediumAccuracy', '中等题正确率'),
                [this.t('value', '数值')]: (classStats.difficultyStats?.medium?.accuracy || 0) + '%'
            }, {
                [this.t('statItem', '统计项目')]: this.t('hardAccuracy', '困难题正确率'),
                [this.t('value', '数值')]: (classStats.difficultyStats?.hard?.accuracy || 0) + '%'
            }];

            const ws3 = XLSX.utils.json_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, ws3, this.t('classSummary', '班级统计'));

            // 4. 需要关注的学生
            const lowPerformingStudents = classStats.students?.filter(s => (s.accuracy || 0) < 60) || [];
            
            if (lowPerformingStudents.length > 0) {
                const lowData = lowPerformingStudents.map(s => ({
                    [this.t('studentName', '学生姓名')]: s.studentName,
                    [this.t('studentId', '学生ID')]: s.studentId,
                    [this.t('totalQuestions', '答题数')]: s.totalQuestions || 0,
                    [this.t('accuracy', '正确率')]: (s.accuracy || 0) + '%',
                    [this.t('avgTime', '平均用时')]: (s.avgTime || 0) + this.t('seconds', '秒')
                }));

                const ws4 = XLSX.utils.json_to_sheet(lowData);
                XLSX.utils.book_append_sheet(wb, ws4, this.t('needsAttention', '需要关注'));
            }

            // 保存Excel
            const fileName = `${this.t('studentLearningData', '学生学习数据')}_${new Date().toISOString().slice(0,10)}.xlsx`;
            XLSX.writeFile(wb, fileName);
            
        } catch (error) {
            console.error('导出Excel失败:', error);
            alert(this.t('exportFailed', '导出Excel失败') + '：' + error.message);
        }
    }

    /**
     * 生成比赛用报告（包含所有比赛要求的信息）
     */
    generateCompetitionReport() {
        try {
            const classStats = this.studentRecord.getClassStats();
            
            if (classStats.totalStudents === 0) {
                alert(this.t('noStudentData', '暂无学生数据'));
                return;
            }

            if (typeof window.jspdf === 'undefined') {
                alert(this.t('pdfNotLoaded', 'PDF库未加载，请刷新页面重试'));
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            let y = 20;

            // 封面
            doc.setFontSize(28);
            doc.setTextColor(212, 107, 141);
            doc.text(this.t('candyMathMatch', '糖果数学消消乐'), 105, 60, { align: 'center' });
            
            doc.setFontSize(20);
            doc.text(this.t('teachingEffectivenessReport', '教学效果评估报告'), 105, 80, { align: 'center' });
            
            doc.setFontSize(14);
            doc.setTextColor(100, 100, 100);
            doc.text(this.t('competitionTitle', 'Pertandingan Inovasi Digital dalam PdP Guru'), 105, 100, { align: 'center' });
            doc.text(this.t('symposiumTitle', 'Simposium Duta Guru 2026'), 105, 110, { align: 'center' });
            
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            doc.text(`${this.t('reportDate', '报告生成日期')}: ${new Date().toLocaleDateString('zh-CN')}`, 105, 140, { align: 'center' });
            doc.text(`${this.t('teacherName', '教师姓名')}: ${this.game.state.currentUser?.name || '______'}`, 105, 150, { align: 'center' });
            doc.text(`${this.t('schoolName', '学校名称')}: ____________________`, 105, 160, { align: 'center' });

            doc.addPage();
            y = 20;

            // 1. 创新点说明
            doc.setFontSize(18);
            doc.setTextColor(212, 107, 141);
            doc.text('1. ' + this.t('innovation', '创新点说明'), 20, y);
            
            y += 15;
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            const innovations = [
                this.t('innovation1', '• 实时多人对战匹配系统，支持在线对战'),
                this.t('innovation2', '• AI自适应难度调节，根据学生水平自动调整'),
                this.t('innovation3', '• 完整的学生学习记录系统，追踪每个学生的学习进度'),
                this.t('innovation4', '• 自动生成诊断性学习报告，提供薄弱点分析和改进建议'),
                this.t('innovation5', '• 柔和多彩的糖果主题界面，提高学生学习兴趣'),
                this.t('innovation6', '• 双语支持（中文/英文），适用于多语言环境')
            ];
            innovations.forEach(text => {
                doc.text(text, 25, y);
                y += 8;
            });

            y += 10;

            // 2. 教学效果
            doc.setFontSize(18);
            doc.setTextColor(212, 107, 141);
            doc.text('2. ' + this.t('teachingEffectiveness', '教学效果'), 20, y);
            
            y += 15;
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            doc.text(`${this.t('participatingStudents', '参与学生人数')}: ${classStats.totalStudents} ${this.t('studentsUnit', '人')}`, 25, y);
            doc.text(`${this.t('totalPracticeSessions', '总练习次数')}: ${classStats.totalSessions || 0} ${this.t('sessionsUnit', '次')}`, 25, y + 8);
            doc.text(`${this.t('totalQuestionsAnswered', '总答题数')}: ${classStats.totalQuestions} ${this.t('questionsUnit', '题')}`, 25, y + 16);
            doc.text(`${this.t('classAverageAccuracy', '班级平均正确率')}: ${classStats.classAccuracy || 0}%`, 25, y + 24);
            doc.text(`${this.t('averageResponseTime', '平均答题时间')}: ${classStats.avgClassTime || 0} ${this.t('secondsPerQuestion', '秒/题')}`, 25, y + 32);

            y += 45;

            const difficultyData = [
                [this.t('difficulty', '难度'), this.t('questions', '答题数'), this.t('correct', '正确数'), this.t('accuracy', '正确率')],
                [this.t('easy', '简单'), classStats.difficultyStats?.easy?.total || 0, classStats.difficultyStats?.easy?.correct || 0, (classStats.difficultyStats?.easy?.accuracy || 0) + '%'],
                [this.t('medium', '中等'), classStats.difficultyStats?.medium?.total || 0, classStats.difficultyStats?.medium?.correct || 0, (classStats.difficultyStats?.medium?.accuracy || 0) + '%'],
                [this.t('hard', '困难'), classStats.difficultyStats?.hard?.total || 0, classStats.difficultyStats?.hard?.correct || 0, (classStats.difficultyStats?.hard?.accuracy || 0) + '%']
            ];

            doc.autoTable({
                startY: y,
                head: [difficultyData[0]],
                body: difficultyData.slice(1),
                theme: 'striped',
                headStyles: { fillColor: [212, 107, 141] },
                styles: { fontSize: 10 }
            });

            y = doc.lastAutoTable.finalY + 15;

            // 3. 节省时间分析
            doc.addPage();
            y = 20;
            
            doc.setFontSize(18);
            doc.setTextColor(212, 107, 141);
            doc.text('3. ' + this.t('timeSaving', '节省时间分析'), 20, y);
            
            y += 15;
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            const timeSavings = [
                this.t('timeSaving1', '• 自动生成练习题: 每节课节省约5分钟'),
                this.t('timeSaving2', '• 自动批改: 每份作业节省约2分钟'),
                this.t('timeSaving3', '• 自动生成学习报告: 每份报告节省约10分钟'),
                this.t('timeSaving4', '• 数据统计分析: 每次节省约15分钟'),
                '',
                this.t('estimatedMonthlySaving', '估算每月节省时间:'),
                `  - ${this.t('dailyClasses', '按每天2节课计算')}: ${this.t('approx', '约')} ${2 * 5 * 20} ${this.t('minutesPerMonth', '分钟/月')}`,
                `  - ${this.t('weeklyHomework', '按每周5次作业计算')}: ${this.t('approx', '约')} ${5 * 2 * 4} ${this.t('minutesPerMonth', '分钟/月')}`,
                `  - ${this.t('monthlyReports', '按每月4次报告计算')}: ${this.t('approx', '约')} ${4 * 10} ${this.t('minutesPerMonth', '分钟/月')}`,
                `  - ${this.t('total', '总计')}: ${this.t('approx', '约')} ${(2*5*20) + (5*2*4) + (4*10)} ${this.t('minutesPerMonth', '分钟/月')} (${this.t('approx', '约')} ${Math.round(((2*5*20) + (5*2*4) + (4*10))/60)} ${this.t('hours', '小时')})`
            ];
            timeSavings.forEach(text => {
                doc.text(text, 25, y);
                y += 8;
            });

            y += 10;

            // 4. 推广潜力
            doc.setFontSize(18);
            doc.setTextColor(212, 107, 141);
            doc.text('4. ' + this.t('disseminationPotential', '推广潜力'), 20, y);
            
            y += 15;
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            const potentials = [
                this.t('potential1', '• 完全基于Web技术，无需安装，打开浏览器即可使用'),
                this.t('potential2', '• 支持多种语言（中文/英文），适用于多语言环境'),
                this.t('potential3', '• 可以部署在学校服务器或免费托管平台'),
                this.t('potential4', '• 支持多人同时在线使用，适合班级教学'),
                this.t('potential5', '• 可导出学习数据，方便教师进一步分析'),
                this.t('potential6', '• 源代码开放，其他教师可以根据需要修改和定制')
            ];
            potentials.forEach(text => {
                doc.text(text, 25, y);
                y += 8;
            });

            y += 10;

            // 5. 成本分析
            doc.setFontSize(18);
            doc.setTextColor(212, 107, 141);
            doc.text('5. ' + this.t('costAnalysis', '成本分析'), 20, y);
            
            y += 15;
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            const costs = [
                this.t('developmentCost', '开发成本:'),
                `  • ${this.t('developmentTime', '开发时间')}: ${this.t('approx', '约')} 40 ${this.t('hours', '小时')} (${this.t('estimated', '估算')})`,
                `  • ${this.t('developmentTools', '开发工具')}: ${this.t('free', '免费')} (VS Code, Git)`,
                '',
                this.t('operationalCost', '运行成本:'),
                `  • ${this.t('server', '服务器')}: ${this.t('free', '免费')} (Supabase ${this.t('freeTier', '免费层')})`,
                `  • ${this.t('hosting', '托管')}: ${this.t('free', '免费')} (GitHub Pages)`,
                `  • ${this.t('database', '数据库')}: ${this.t('free', '免费')} (Supabase 500MB)`,
                '',
                this.t('comparisonWithTraditional', '与传统方法对比:'),
                `  • ${this.t('traditionalWorkbook', '传统练习册')}: ${this.t('perBook', '每本约')} RM 10-20，${this.t('yearlyUpdate', '每年需更新')}`,
                `  • ${this.t('thisSystem', '本系统')}: ${this.t('oneTimeDevelopment', '一次性开发，永久使用，零维护成本')}`,
                '',
                `${this.t('totalCost', '总成本')}: RM 0 (${this.t('completelyFree', '完全免费')})`
            ];
            costs.forEach(text => {
                doc.text(text, 25, y);
                y += 8;
            });

            // 保存PDF
            const fileName = `${this.t('teachingEffectivenessReport', '教学效果评估报告')}_${new Date().toISOString().slice(0,10)}.pdf`;
            doc.save(fileName);
            
        } catch (error) {
            console.error('生成比赛报告失败:', error);
            alert(this.t('generateReportFailed', '生成报告失败') + '：' + error.message);
        }
    }
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.ReportGenerator = ReportGenerator;
}

// ==================== 文件结束 ====================
