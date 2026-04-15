/**
 * ==================== 糖果数学消消乐 - 学习报告生成器 ====================
 * 版本: 2.2.0 (趋势分析版 + 完整诊断 + 中英文双语)
 * 功能：生成 PDF/Excel 格式的学习报告，包含趋势分析和诊断建议
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
                level: 'Excellent',
                comment: 'Outstanding performance! Strong calculation skills, keep it up!',
                color: '#2ecc71'
            };
        } else if (accuracy >= 75) {
            return {
                level: 'Good',
                comment: 'Good performance with solid foundation. Keep working hard!',
                color: '#3498db'
            };
        } else if (accuracy >= 60) {
            return {
                level: 'Fair',
                comment: 'At an average level. Need more practice, especially on difficult problems.',
                color: '#f39c12'
            };
        } else {
            return {
                level: 'Needs Improvement',
                comment: 'Foundation is weak. Start with easy difficulty and practice basic addition/subtraction.',
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
                comment: 'No answer data',
                color: '#95a5a6'
            };
        } else if (avgTime < 5) {
            return {
                level: 'Fast',
                comment: 'Very quick calculation speed!',
                color: '#2ecc71'
            };
        } else if (avgTime < 10) {
            return {
                level: 'Normal',
                comment: 'Normal calculation speed. Practice can improve speed.',
                color: '#3498db'
            };
        } else {
            return {
                level: 'Slow',
                comment: 'Calculation speed is slow. Practice basic mental math more.',
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
            recommendations.push('• Start with easy difficulty, practice 10-15 minutes daily');
        }
        if (stats.avgTime > 10) {
            recommendations.push('• Do timed practice to improve calculation speed');
        }
        if (stats.difficultyStats?.hard?.accuracy < 50) {
            recommendations.push('• Low accuracy on hard difficulty, focus on medium first');
        }
        if (stats.wrongQuestions > stats.correctQuestions) {
            recommendations.push('• Review wrong answers to identify weaknesses');
        }
        if (stats.totalQuestions < 20) {
            recommendations.push('• Low question count, increase practice frequency');
        }
        
        if (recommendations.length === 0) {
            recommendations.push('• Excellent performance! Try challenging harder difficulties');
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
     * 获取班级综合诊断
     */
    getClassDiagnosis(classStats) {
        const avgAccuracy = classStats.classAccuracy || 0;
        
        if (avgAccuracy >= 85) {
            return {
                level: 'Excellent',
                comment: 'Class performance is excellent, calculation skills are solid!',
                color: '#2ecc71'
            };
        } else if (avgAccuracy >= 70) {
            return {
                level: 'Good',
                comment: 'Class performance is good. Pay attention to students with lower accuracy.',
                color: '#3498db'
            };
        } else if (avgAccuracy >= 55) {
            return {
                level: 'Fair',
                comment: 'Class is at an average level. Strengthen basic practice and review mistakes.',
                color: '#f39c12'
            };
        } else {
            return {
                level: 'Needs Improvement',
                comment: 'Class foundation is weak. Start with easy difficulty and gradually improve.',
                color: '#e74c3c'
            };
        }
    }

    /**
     * 获取难度分析评语
     */
    getDifficultyAnalysis(difficulty, accuracy) {
        if (accuracy === 0 && difficulty === 'hard') return 'No data yet';
        if (accuracy >= 80) return 'Excellent performance!';
        if (accuracy >= 65) return 'Good, keep practicing.';
        if (accuracy >= 50) return 'Needs improvement.';
        return 'Significant weakness, focus here.';
    }

    /**
     * 获取学生个人建议
     */
    getStudentSuggestion(student) {
        const accuracy = student.accuracy || 0;
        const avgTime = student.avgTime || 0;
        
        if (accuracy < 50) {
            return 'Start with easy difficulty, practice basic facts.';
        } else if (accuracy < 70) {
            return 'Review mistakes and practice daily.';
        } else if (avgTime > 10) {
            return 'Good accuracy! Work on speed.';
        } else {
            return 'Try challenging harder difficulties.';
        }
    }

    /**
     * 生成学生个人报告 (PDF) - 英文版 + 趋势分析
     */
    async generateStudentReport(studentId) {
        try {
            const stats = this.studentRecord.getStudentStats(studentId);
            if (!stats) {
                alert('No student data found');
                return;
            }

            // 获取趋势数据
            const trend = await this.studentRecord.getStudentTrend(studentId);
            const trendMessage = this.studentRecord.getTrendMessage(trend);

            if (typeof window.jspdf === 'undefined') {
                alert('PDF library not loaded, please refresh');
                return;
            }

            // 保存当前语言，临时切换到英文
            const currentLang = I18n?.getLang?.() || 'zh';
            if (I18n?.setLang) {
                I18n.setLang('en');
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            let y = 20;

            // 标题
            doc.setFontSize(24);
            doc.setTextColor(212, 107, 141);
            doc.text('Student Learning Report', 105, y, { align: 'center' });
            
            y += 12;
            
            // 副标题
            doc.setFontSize(12);
            doc.setTextColor(150, 150, 150);
            doc.text('Generated by Candy Math Match', 105, y, { align: 'center' });
            
            y += 10;

            // 装饰线
            doc.setDrawColor(255, 182, 193);
            doc.setLineWidth(0.5);
            doc.line(20, y, 190, y);
            
            y += 12;

            // 学生信息
            doc.setFontSize(14);
            doc.setTextColor(0, 0, 0);
            doc.text(`Student Name: ${stats.studentName || '-'}`, 20, y);
            doc.text(`Student ID: ${stats.studentId}`, 120, y);
            
            y += 8;
            doc.text(`Report Generated: ${new Date().toLocaleString('en-US')}`, 20, y);
            doc.text(`Last Active: ${stats.lastActive ? new Date(stats.lastActive).toLocaleString('en-US') : 'None'}`, 120, y);

            y += 15;

            // ========== 趋势分析 ==========
            if (trend && trend.recent_questions > 0) {
                doc.setFillColor(255, 248, 220);
                doc.roundedRect(15, y, 180, 40, 5, 5, 'F');
                
                doc.setFontSize(12);
                doc.setTextColor(212, 107, 141);
                doc.text('📈 Progress Trend (Recent 7 Days vs Previous 3 Weeks)', 20, y + 10);
                
                doc.setFontSize(10);
                doc.setTextColor(80, 80, 80);
                
                // 正确率对比
                const recentAcc = Math.round(trend.recent_accuracy || 0);
                const previousAcc = Math.round(trend.previous_accuracy || 0);
                const change = Math.round(trend.accuracy_change || 0);
                const changeSymbol = change >= 0 ? '+' : '';
                
                doc.text(`Recent 7 Days: ${recentAcc}% (${trend.recent_questions} questions)`, 25, y + 22);
                doc.text(`Previous 3 Weeks: ${previousAcc}% (${trend.previous_questions} questions)`, 25, y + 32);
                doc.text(`Change: ${changeSymbol}${change}%`, 140, y + 27);
                
                y += 48;
            } else {
                y += 10;
            }

            // 趋势评语
            doc.setFillColor(240, 248, 255);
            doc.roundedRect(15, y, 180, 20, 5, 5, 'F');
            
            doc.setFontSize(11);
            doc.setTextColor(trendMessage.color);
            doc.text(`${trendMessage.icon} ${trendMessage.message}`, 20, y + 13);
            
            y += 28;

            // 诊断评语
            const diagnosis = this.getDiagnosisByAccuracy(stats.accuracy || 0);
            const speedDiagnosis = this.getSpeedDiagnosis(stats.avgTime || 0);
            
            doc.setFillColor(240, 248, 255);
            doc.roundedRect(15, y, 180, 35, 5, 5, 'F');
            
            doc.setFontSize(13);
            doc.setTextColor(diagnosis.color);
            doc.text(`Overall Rating: ${diagnosis.level}`, 20, y + 10);
            
            doc.setFontSize(11);
            doc.setTextColor(80, 80, 80);
            doc.text(diagnosis.comment, 20, y + 22);
            doc.text(`Speed Rating: ${speedDiagnosis.level} | ${speedDiagnosis.comment}`, 20, y + 30);

            y += 45;

            // 学习统计标题
            doc.setFontSize(16);
            doc.setTextColor(212, 107, 141);
            doc.text('📊 Learning Statistics', 20, y);
            
            y += 10;

            // 统计卡片 - 第一行
            const cardWidth = 52;
            const cardHeight = 38;
            const cardSpacing = 8;
            
            this.drawStatCard(doc, 20, y, cardWidth, cardHeight, 
                'Total Questions', stats.totalQuestions || 0, '#e74c3c');
            this.drawStatCard(doc, 20 + cardWidth + cardSpacing, y, cardWidth, cardHeight, 
                'Correct', stats.correctQuestions || 0, '#2ecc71');
            this.drawStatCard(doc, 20 + (cardWidth + cardSpacing) * 2, y, cardWidth, cardHeight, 
                'Accuracy', (stats.accuracy || 0) + '%', '#3498db');
            
            y += cardHeight + 8;

            // 统计卡片 - 第二行
            this.drawStatCard(doc, 20, y, cardWidth, cardHeight, 
                'Sessions', stats.totalSessions || 0, '#f39c12');
            this.drawStatCard(doc, 20 + cardWidth + cardSpacing, y, cardWidth, cardHeight, 
                'Avg Time', (stats.avgTime || 0) + 's', '#9b59b6');
            this.drawStatCard(doc, 20 + (cardWidth + cardSpacing) * 2, y, cardWidth, cardHeight, 
                'Wrong', stats.wrongQuestions || 0, '#e67e22');

            y += cardHeight + 15;

            // 各难度正确率
            doc.setFontSize(16);
            doc.setTextColor(212, 107, 141);
            doc.text('🎯 Accuracy by Difficulty', 20, y);
            
            y += 10;

            const difficultyData = [
                ['Difficulty', 'Questions', 'Correct', 'Accuracy'],
                [
                    'Easy', 
                    stats.difficultyStats?.easy?.total || 0, 
                    stats.difficultyStats?.easy?.correct || 0, 
                    (stats.difficultyStats?.easy?.accuracy || 0) + '%'
                ],
                [
                    'Medium', 
                    stats.difficultyStats?.medium?.total || 0, 
                    stats.difficultyStats?.medium?.correct || 0, 
                    (stats.difficultyStats?.medium?.accuracy || 0) + '%'
                ],
                [
                    'Hard', 
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

            // 薄弱点分析
            const weaknesses = this.analyzeWeaknesses(stats.errorStats, stats.wrongQuestions || 0);
            
            doc.setFontSize(16);
            doc.setTextColor(212, 107, 141);
            doc.text('❌ Weakness Analysis', 20, y);
            
            y += 10;

            if (weaknesses.length > 0) {
                const weaknessData = [
                    ['Rank', 'Combination', 'Errors', 'Percentage'],
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
                doc.text('No error records, great job!', 30, y);
                y += 15;
            }

            // 检查是否需要新页
            if (y > 250) {
                doc.addPage();
                y = 20;
            }

            // 改进建议
            doc.setFontSize(16);
            doc.setTextColor(212, 107, 141);
            doc.text('💡 Recommendations', 20, y);
            
            y += 12;
            
            const recommendations = this.getRecommendations(stats);
            
            doc.setFontSize(11);
            doc.setTextColor(60, 60, 60);
            recommendations.forEach(rec => {
                doc.text(rec, 25, y);
                y += 8;
            });

            // 恢复语言
            if (I18n?.setLang) {
                I18n.setLang(currentLang);
            }

            // 保存PDF
            const fileName = `${stats.studentName || 'student'}_Learning_Report_${new Date().toISOString().slice(0,10)}.pdf`;
            doc.save(fileName);
            
        } catch (error) {
            console.error('Failed to generate PDF report:', error);
            alert('Failed to generate report: ' + error.message);
        }
    }

    /**
     * 绘制统计卡片
     */
    drawStatCard(doc, x, y, width, height, label, value, color) {
        try {
            doc.setFillColor(250, 250, 252);
            doc.setDrawColor(230, 230, 235);
            doc.setLineWidth(0.3);
            doc.roundedRect(x, y, width, height, 4, 4, 'FD');

            doc.setFontSize(9);
            doc.setTextColor(120, 120, 130);
            doc.text(label, x + width/2, y + 10, { align: 'center' });

            doc.setFontSize(14);
            doc.setTextColor(color);
            doc.text(String(value), x + width/2, y + 26, { align: 'center' });
        } catch (error) {
            console.error('Failed to draw stat card:', error);
        }
    }

    // ==================== 第 1 部分结束 ====================
    // ==================== 第 2 部分 / 共 2 部分 ====================

    /**
     * 生成全班报告 (PDF) - 英文版 + 完整分析 + 趋势汇总
     */
    async generateClassReport() {
        try {
            const classStats = this.studentRecord.getClassStats();
            
            if (classStats.totalStudents === 0) {
                alert('No student data');
                return;
            }

            if (typeof window.jspdf === 'undefined') {
                alert('PDF library not loaded, please refresh');
                return;
            }

            // 保存当前语言，临时切换到英文
            const currentLang = I18n?.getLang?.() || 'zh';
            if (I18n?.setLang) {
                I18n.setLang('en');
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            let y = 20;

            // 标题
            doc.setFontSize(24);
            doc.setTextColor(212, 107, 141);
            doc.text('Class Learning Report', 105, y, { align: 'center' });
            
            y += 12;
            
            doc.setFontSize(12);
            doc.setTextColor(150, 150, 150);
            doc.text('Generated by Candy Math Match', 105, y, { align: 'center' });
            
            y += 10;

            // 装饰线
            doc.setDrawColor(255, 182, 193);
            doc.setLineWidth(0.5);
            doc.line(20, y, 190, y);
            
            y += 12;

            // 班级概况
            doc.setFontSize(14);
            doc.setTextColor(0, 0, 0);
            doc.text(`Report Generated: ${new Date().toLocaleString('en-US')}`, 20, y);
            
            y += 8;
            doc.text(`Total Students: ${classStats.totalStudents}`, 20, y);
            doc.text(`Total Questions: ${classStats.totalQuestions}`, 120, y);
            
            y += 8;
            doc.text(`Total Sessions: ${classStats.totalSessions || 0}`, 20, y);
            doc.text(`Class Avg Accuracy: ${Math.round(classStats.classAccuracy || 0)}%`, 120, y);
            
            y += 8;
            doc.text(`Class Avg Time: ${Math.round(classStats.avgClassTime || 0)}s`, 20, y);
            doc.text(`Total Correct: ${classStats.totalCorrect || 0}`, 120, y);

            y += 15;

            // ========== 班级诊断 ==========
            const diagnosis = this.getClassDiagnosis(classStats);
            
            doc.setFillColor(240, 248, 255);
            doc.roundedRect(15, y, 180, 28, 5, 5, 'F');
            
            doc.setFontSize(13);
            doc.setTextColor(diagnosis.color);
            doc.text(`Class Overall Rating: ${diagnosis.level}`, 20, y + 10);
            
            doc.setFontSize(11);
            doc.setTextColor(80, 80, 80);
            doc.text(diagnosis.comment, 20, y + 22);

            y += 40;

            // ========== 各难度班级正确率（带分析） ==========
            doc.setFontSize(16);
            doc.setTextColor(212, 107, 141);
            doc.text('📊 Class Accuracy by Difficulty', 20, y);
            
            y += 10;

            const difficultyData = [
                ['Difficulty', 'Questions', 'Correct', 'Accuracy', 'Analysis'],
                [
                    'Easy',
                    classStats.difficultyStats?.easy?.total || 0,
                    classStats.difficultyStats?.easy?.correct || 0,
                    Math.round(classStats.difficultyStats?.easy?.accuracy || 0) + '%',
                    this.getDifficultyAnalysis('easy', classStats.difficultyStats?.easy?.accuracy || 0)
                ],
                [
                    'Medium',
                    classStats.difficultyStats?.medium?.total || 0,
                    classStats.difficultyStats?.medium?.correct || 0,
                    Math.round(classStats.difficultyStats?.medium?.accuracy || 0) + '%',
                    this.getDifficultyAnalysis('medium', classStats.difficultyStats?.medium?.accuracy || 0)
                ],
                [
                    'Hard',
                    classStats.difficultyStats?.hard?.total || 0,
                    classStats.difficultyStats?.hard?.correct || 0,
                    Math.round(classStats.difficultyStats?.hard?.accuracy || 0) + '%',
                    this.getDifficultyAnalysis('hard', classStats.difficultyStats?.hard?.accuracy || 0)
                ]
            ];

            doc.autoTable({
                startY: y,
                head: [difficultyData[0]],
                body: difficultyData.slice(1),
                theme: 'striped',
                headStyles: { fillColor: [212, 107, 141] },
                styles: { fontSize: 9 },
                columnStyles: {
                    4: { cellWidth: 45 }
                }
            });

            y = doc.lastAutoTable.finalY + 12;

            // ========== 优秀学生（前5名，带评级） ==========
            if (y > 230) {
                doc.addPage();
                y = 20;
            }

            doc.setFontSize(16);
            doc.setTextColor(212, 107, 141);
            doc.text('🏆 Top Students (Top 5)', 20, y);
            
            y += 10;

            if (classStats.topStudents && classStats.topStudents.length > 0) {
                const topData = [
                    ['Rank', 'Student Name', 'Questions', 'Accuracy', 'Rating'],
                    ...classStats.topStudents.slice(0, 5).map((s, i) => {
                        const rating = this.getDiagnosisByAccuracy(s.accuracy || 0).level;
                        return [i + 1, s.name, s.totalQuestions, Math.round(s.accuracy || 0) + '%', rating];
                    })
                ];

                doc.autoTable({
                    startY: y,
                    head: [topData[0]],
                    body: topData.slice(1),
                    theme: 'striped',
                    headStyles: { fillColor: [241, 196, 15] },
                    styles: { fontSize: 9 }
                });

                y = doc.lastAutoTable.finalY + 12;
            }

            // ========== 需要关注的学生（带建议） ==========
            if (y > 230) {
                doc.addPage();
                y = 20;
            }

            const lowPerformingStudents = classStats.students?.filter(s => (s.accuracy || 0) < 60) || [];
            
            if (lowPerformingStudents.length > 0) {
                doc.setFontSize(16);
                doc.setTextColor(231, 76, 60);
                doc.text('⚠️ Students Needing Attention (Accuracy < 60%)', 20, y);
                
                y += 10;

                const lowData = [
                    ['Student Name', 'Questions', 'Accuracy', 'Avg Time', 'Suggestion'],
                    ...lowPerformingStudents.slice(0, 10).map(s => [
                        s.name, 
                        s.totalQuestions, 
                        Math.round(s.accuracy || 0) + '%', 
                        Math.round(s.avgTime || 0) + 's',
                        this.getStudentSuggestion(s)
                    ])
                ];

                doc.autoTable({
                    startY: y,
                    head: [lowData[0]],
                    body: lowData.slice(1),
                    theme: 'striped',
                    headStyles: { fillColor: [231, 76, 60] },
                    styles: { fontSize: 8 },
                    columnStyles: {
                        4: { cellWidth: 45 }
                    }
                });

                y = doc.lastAutoTable.finalY + 12;
            }

            // ========== 班级常见薄弱点 ==========
            if (y > 230) {
                doc.addPage();
                y = 20;
            }

            const weaknesses = this.analyzeWeaknesses(classStats.commonMistakes, classStats.totalWrong || 0);
            
            if (weaknesses.length > 0) {
                doc.setFontSize(16);
                doc.setTextColor(212, 107, 141);
                doc.text('📉 Class Common Weaknesses', 20, y);
                
                y += 10;

                const weaknessData = [
                    ['Rank', 'Combination', 'Errors', 'Percentage'],
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
            }

            // 恢复语言
            if (I18n?.setLang) {
                I18n.setLang(currentLang);
            }

            // 保存PDF
            const fileName = `Class_Learning_Report_${new Date().toISOString().slice(0,10)}.pdf`;
            doc.save(fileName);
            
        } catch (error) {
            console.error('Failed to generate class report:', error);
            alert('Failed to generate report: ' + error.message);
        }
    }

    /**
     * 导出为 Excel (用于教师进一步分析) - 修复版 + 趋势数据
     */
    exportToExcel() {
        try {
            const classStats = this.studentRecord.getClassStats();
            
            if (!classStats || classStats.totalStudents === 0) {
                alert(this.t('noStudentData', '暂无学生数据'));
                return;
            }

            if (typeof XLSX === 'undefined') {
                alert(this.t('excelNotLoaded', 'Excel库未加载，请刷新页面重试'));
                return;
            }

            const wb = XLSX.utils.book_new();

            // 1. 学生学习数据表（安全处理，防止 undefined）
            const studentData = (classStats.students || []).map(s => {
                // 安全获取嵌套属性
                const easyAccuracy = Math.round(s.difficultyStats?.easy?.accuracy || 0);
                const mediumAccuracy = Math.round(s.difficultyStats?.medium?.accuracy || 0);
                const hardAccuracy = Math.round(s.difficultyStats?.hard?.accuracy || 0);
                
                // 获取诊断评级
                const diagnosis = this.getDiagnosisByAccuracy(s.accuracy || 0);
                const speedDiagnosis = this.getSpeedDiagnosis(s.avgTime || 0);
                
                return {
                    [this.t('studentName', '学生姓名')]: s.studentName || s.name || '-',
                    [this.t('studentId', '学生ID')]: s.studentId || '-',
                    [this.t('totalSessions', '练习次数')]: s.totalSessions || 0,
                    [this.t('totalQuestions', '总答题数')]: s.totalQuestions || 0,
                    [this.t('correctAnswers', '正确题数')]: s.correctQuestions || 0,
                    [this.t('wrongAnswers', '错误题数')]: s.wrongQuestions || 0,
                    [this.t('accuracy', '正确率')]: Math.round(s.accuracy || 0) + '%',
                    [this.t('avgTime', '平均用时')]: Math.round(s.avgTime || 0) + this.t('seconds', '秒'),
                    [this.t('easyAccuracy', '简单正确率')]: easyAccuracy + '%',
                    [this.t('mediumAccuracy', '中等正确率')]: mediumAccuracy + '%',
                    [this.t('hardAccuracy', '困难正确率')]: hardAccuracy + '%',
                    [this.t('overallRating', '综合评级')]: diagnosis.level,
                    [this.t('speedRating', '速度评级')]: speedDiagnosis.level,
                    [this.t('lastActive', '最后活动')]: s.lastActive ? new Date(s.lastActive).toLocaleString('zh-CN') : this.t('none', '无')
                };
            });

            if (studentData.length > 0) {
                const ws1 = XLSX.utils.json_to_sheet(studentData);
                XLSX.utils.book_append_sheet(wb, ws1, this.t('studentData', '学生学习数据'));
            }

            // 2. 班级统计摘要
            const summaryData = [{
                [this.t('statItem', '统计项目')]: this.t('totalStudents', '学生人数'),
                [this.t('value', '数值')]: classStats.totalStudents || 0
            }, {
                [this.t('statItem', '统计项目')]: this.t('totalSessions', '总练习次数'),
                [this.t('value', '数值')]: classStats.totalSessions || 0
            }, {
                [this.t('statItem', '统计项目')]: this.t('totalQuestions', '总答题数'),
                [this.t('value', '数值')]: classStats.totalQuestions || 0
            }, {
                [this.t('statItem', '统计项目')]: this.t('correctAnswers', '总正确题数'),
                [this.t('value', '数值')]: classStats.totalCorrect || 0
            }, {
                [this.t('statItem', '统计项目')]: this.t('classAvgAccuracy', '班级平均正确率'),
                [this.t('value', '数值')]: Math.round(classStats.classAccuracy || 0) + '%'
            }, {
                [this.t('statItem', '统计项目')]: this.t('classAvgTime', '班级平均用时'),
                [this.t('value', '数值')]: Math.round(classStats.avgClassTime || 0) + this.t('seconds', '秒')
            }];

            const ws2 = XLSX.utils.json_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, ws2, this.t('classSummary', '班级统计'));

            // 3. 各难度统计
            const difficultySummary = [{
                [this.t('difficulty', '难度')]: this.t('easy', '简单'),
                [this.t('totalQuestions', '答题数')]: classStats.difficultyStats?.easy?.total || 0,
                [this.t('correctAnswers', '正确数')]: classStats.difficultyStats?.easy?.correct || 0,
                [this.t('accuracy', '正确率')]: Math.round(classStats.difficultyStats?.easy?.accuracy || 0) + '%'
            }, {
                [this.t('difficulty', '难度')]: this.t('medium', '中等'),
                [this.t('totalQuestions', '答题数')]: classStats.difficultyStats?.medium?.total || 0,
                [this.t('correctAnswers', '正确数')]: classStats.difficultyStats?.medium?.correct || 0,
                [this.t('accuracy', '正确率')]: Math.round(classStats.difficultyStats?.medium?.accuracy || 0) + '%'
            }, {
                [this.t('difficulty', '难度')]: this.t('hard', '困难'),
                [this.t('totalQuestions', '答题数')]: classStats.difficultyStats?.hard?.total || 0,
                [this.t('correctAnswers', '正确数')]: classStats.difficultyStats?.hard?.correct || 0,
                [this.t('accuracy', '正确率')]: Math.round(classStats.difficultyStats?.hard?.accuracy || 0) + '%'
            }];

            const ws3 = XLSX.utils.json_to_sheet(difficultySummary);
            XLSX.utils.book_append_sheet(wb, ws3, this.t('difficultyStats', '难度统计'));

            // 保存Excel
            const fileName = `${this.t('studentLearningData', '学生学习数据')}_${new Date().toISOString().slice(0,10)}.xlsx`;
            XLSX.writeFile(wb, fileName);
            
        } catch (error) {
            console.error('导出Excel失败:', error);
            alert(this.t('exportFailed', '导出Excel失败') + '：' + error.message);
        }
    }

    /**
     * 生成比赛用报告 - 英文版
     */
    generateCompetitionReport() {
        try {
            const classStats = this.studentRecord.getClassStats();
            
            if (classStats.totalStudents === 0) {
                alert('No student data');
                return;
            }

            if (typeof window.jspdf === 'undefined') {
                alert('PDF library not loaded, please refresh');
                return;
            }

            // 保存当前语言，临时切换到英文
            const currentLang = I18n?.getLang?.() || 'zh';
            if (I18n?.setLang) {
                I18n.setLang('en');
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            let y = 20;

            // 封面
            doc.setFontSize(28);
            doc.setTextColor(212, 107, 141);
            doc.text('Candy Math Match', 105, 60, { align: 'center' });
            
            doc.setFontSize(20);
            doc.text('Teaching Effectiveness Report', 105, 80, { align: 'center' });
            
            doc.setFontSize(14);
            doc.setTextColor(100, 100, 100);
            doc.text('Pertandingan Inovasi Digital dalam PdP Guru', 105, 100, { align: 'center' });
            doc.text('Simposium Duta Guru 2026', 105, 110, { align: 'center' });
            
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            doc.text(`Report Date: ${new Date().toLocaleDateString('en-US')}`, 105, 140, { align: 'center' });
            doc.text(`Teacher Name: ${this.game.state.currentUser?.name || '______'}`, 105, 150, { align: 'center' });
            doc.text(`School Name: ____________________`, 105, 160, { align: 'center' });

            doc.addPage();
            y = 20;

            // 1. Innovation
            doc.setFontSize(18);
            doc.setTextColor(212, 107, 141);
            doc.text('1. Innovation', 20, y);
            
            y += 15;
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            const innovations = [
                '• Real-time multiplayer matching system for online battles',
                '• AI adaptive difficulty adjustment based on student performance',
                '• Complete student learning record system tracking individual progress',
                '• Automatic diagnostic learning reports with weakness and trend analysis',
                '• Soft and colorful candy-themed interface to increase engagement',
                '• Bilingual support (Chinese/English) for multilingual environments'
            ];
            innovations.forEach(text => {
                doc.text(text, 25, y);
                y += 8;
            });

            y += 10;

            // 2. Teaching Effectiveness
            doc.setFontSize(18);
            doc.setTextColor(212, 107, 141);
            doc.text('2. Teaching Effectiveness', 20, y);
            
            y += 15;
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            doc.text(`Participating Students: ${classStats.totalStudents}`, 25, y);
            doc.text(`Total Practice Sessions: ${classStats.totalSessions || 0}`, 25, y + 8);
            doc.text(`Total Questions Answered: ${classStats.totalQuestions}`, 25, y + 16);
            doc.text(`Class Average Accuracy: ${Math.round(classStats.classAccuracy || 0)}%`, 25, y + 24);
            doc.text(`Average Response Time: ${Math.round(classStats.avgClassTime || 0)} sec/question`, 25, y + 32);

            y += 45;

            const difficultyData = [
                ['Difficulty', 'Questions', 'Correct', 'Accuracy'],
                ['Easy', classStats.difficultyStats?.easy?.total || 0, classStats.difficultyStats?.easy?.correct || 0, Math.round(classStats.difficultyStats?.easy?.accuracy || 0) + '%'],
                ['Medium', classStats.difficultyStats?.medium?.total || 0, classStats.difficultyStats?.medium?.correct || 0, Math.round(classStats.difficultyStats?.medium?.accuracy || 0) + '%'],
                ['Hard', classStats.difficultyStats?.hard?.total || 0, classStats.difficultyStats?.hard?.correct || 0, Math.round(classStats.difficultyStats?.hard?.accuracy || 0) + '%']
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

            // 3. Time Saving
            doc.addPage();
            y = 20;
            
            doc.setFontSize(18);
            doc.setTextColor(212, 107, 141);
            doc.text('3. Time Saving Analysis', 20, y);
            
            y += 15;
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            const timeSavings = [
                '• Auto-generate exercises: saves ~5 minutes per lesson',
                '• Auto-grading: saves ~2 minutes per assignment',
                '• Auto-generate reports: saves ~10 minutes per report',
                '• Data analysis: saves ~15 minutes per session',
                '',
                'Estimated Monthly Time Savings:',
                '  - Based on 2 classes/day: approx. 200 minutes/month',
                '  - Based on 5 assignments/week: approx. 40 minutes/month',
                '  - Based on 4 reports/month: approx. 40 minutes/month',
                '  - Total: approx. 280 minutes/month (approx. 5 hours)'
            ];
            timeSavings.forEach(text => {
                doc.text(text, 25, y);
                y += 8;
            });

            y += 10;

            // 4. Dissemination Potential
            doc.setFontSize(18);
            doc.setTextColor(212, 107, 141);
            doc.text('4. Dissemination Potential', 20, y);
            
            y += 15;
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            const potentials = [
                '• Web-based, no installation required, works in browser',
                '• Supports multiple languages (Chinese/English)',
                '• Can be deployed on school servers or free hosting platforms',
                '• Supports multiple simultaneous users for classroom teaching',
                '• Export learning data for further analysis',
                '• Open source, customizable by other teachers'
            ];
            potentials.forEach(text => {
                doc.text(text, 25, y);
                y += 8;
            });

            y += 10;

            // 5. Cost Analysis
            doc.setFontSize(18);
            doc.setTextColor(212, 107, 141);
            doc.text('5. Cost Analysis', 20, y);
            
            y += 15;
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            const costs = [
                'Development Cost:',
                '  • Development Time: approx. 40 hours (estimated)',
                '  • Development Tools: Free (VS Code, Git)',
                '',
                'Operational Cost:',
                '  • Server: Free (Supabase free tier)',
                '  • Hosting: Free (GitHub Pages)',
                '  • Database: Free (Supabase 500MB)',
                '',
                'Comparison with Traditional Methods:',
                '  • Traditional workbooks: approx. RM 10-20 per book, updated yearly',
                '  • This system: One-time development, permanent use, zero maintenance',
                '',
                'Total Cost: RM 0 (Completely Free)'
            ];
            costs.forEach(text => {
                doc.text(text, 25, y);
                y += 8;
            });

            // 恢复语言
            if (I18n?.setLang) {
                I18n.setLang(currentLang);
            }

            // 保存PDF
            const fileName = `Teaching_Effectiveness_Report_${new Date().toISOString().slice(0,10)}.pdf`;
            doc.save(fileName);
            
        } catch (error) {
            console.error('Failed to generate competition report:', error);
            alert('Failed to generate report: ' + error.message);
        }
    }
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.ReportGenerator = ReportGenerator;
}

// ==================== 文件结束 ====================
