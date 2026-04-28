/**
 * ==================== 糖果数学消消乐 - 学习报告生成器 ====================
 * 版本: 2.3.0 (完整修复版)
 * 功能：生成 PDF/Excel 格式的学习报告，包含趋势分析和诊断建议
 * 依赖：jsPDF, jspdf-autotable, XLSX
 * 修改记录：
 * 2024-04-28 - 修复数据获取问题，直接从数据库读取，不依赖 teacher_dashboard 视图
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
     * 从数据库直接获取班级统计数据
     */
    async getClassStatsFromDB() {
        const supabase = window.supabaseClient;
        if (!supabase) return null;
        
        try {
            // 1. 获取所有学生
            const { data: students, error: studentsError } = await supabase
                .from('students')
                .select('student_id, name, class, school');
            
            if (studentsError) throw studentsError;
            
            if (!students || students.length === 0) {
                console.log('没有学生数据');
                return null;
            }
            
            // 2. 获取所有答题记录
            const { data: responses, error: responsesError } = await supabase
                .from('question_responses')
                .select('student_id, is_correct, response_time, difficulty');
            
            if (responsesError) throw responsesError;
            
            // 3. 构建学生统计数据
            const studentStats = [];
            let totalQuestions = 0;
            let totalCorrect = 0;
            let totalResponseTime = 0;
            
            const difficultyStats = {
                easy: { total: 0, correct: 0 },
                medium: { total: 0, correct: 0 },
                hard: { total: 0, correct: 0 }
            };
            
            for (const student of students) {
                const studentResponses = (responses || []).filter(r => r.student_id === student.student_id);
                const questionCount = studentResponses.length;
                const correctCount = studentResponses.filter(r => r.is_correct).length;
                const avgTime = questionCount > 0 ? 
                    studentResponses.reduce((sum, r) => sum + (r.response_time || 0), 0) / questionCount : 0;
                const accuracy = questionCount > 0 ? (correctCount / questionCount) * 100 : 0;
                
                // 按难度统计
                for (const diff of ['easy', 'medium', 'hard']) {
                    const diffResponses = studentResponses.filter(r => r.difficulty === diff);
                    difficultyStats[diff].total += diffResponses.length;
                    difficultyStats[diff].correct += diffResponses.filter(r => r.is_correct).length;
                }
                
                studentStats.push({
                    studentId: student.student_id,
                    studentName: student.name,
                    name: student.name,
                    class: student.class,
                    school: student.school,
                    totalQuestions: questionCount,
                    correctQuestions: correctCount,
                    wrongQuestions: questionCount - correctCount,
                    accuracy: accuracy,
                    avgTime: avgTime,
                    totalSessions: 1
                });
                
                totalQuestions += questionCount;
                totalCorrect += correctCount;
                totalResponseTime += studentResponses.reduce((sum, r) => sum + (r.response_time || 0), 0);
            }
            
            // 计算班级平均值
            const studentsWithData = studentStats.filter(s => s.totalQuestions > 0);
            const avgClassTime = totalQuestions > 0 ? totalResponseTime / totalQuestions : 0;
            const classAccuracy = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;
            
            // 计算各难度正确率
            const easyAccuracy = difficultyStats.easy.total > 0 ? 
                (difficultyStats.easy.correct / difficultyStats.easy.total) * 100 : 0;
            const mediumAccuracy = difficultyStats.medium.total > 0 ? 
                (difficultyStats.medium.correct / difficultyStats.medium.total) * 100 : 0;
            const hardAccuracy = difficultyStats.hard.total > 0 ? 
                (difficultyStats.hard.correct / difficultyStats.hard.total) * 100 : 0;
            
            // 获取前5名学生（至少有10道题）
            const topStudents = [...studentStats]
                .filter(s => s.totalQuestions >= 10)
                .sort((a, b) => b.accuracy - a.accuracy)
                .slice(0, 5);
            
            return {
                totalStudents: students.length,
                studentsWithData: studentsWithData.length,
                students: studentStats,
                totalQuestions: totalQuestions,
                totalCorrect: totalCorrect,
                totalWrong: totalQuestions - totalCorrect,
                totalSessions: studentsWithData.length,
                avgClassTime: avgClassTime,
                classAccuracy: classAccuracy,
                difficultyStats: {
                    easy: {
                        total: difficultyStats.easy.total,
                        correct: difficultyStats.easy.correct,
                        accuracy: easyAccuracy
                    },
                    medium: {
                        total: difficultyStats.medium.total,
                        correct: difficultyStats.medium.correct,
                        accuracy: mediumAccuracy
                    },
                    hard: {
                        total: difficultyStats.hard.total,
                        correct: difficultyStats.hard.correct,
                        accuracy: hardAccuracy
                    }
                },
                topStudents: topStudents,
                commonMistakes: {}
            };
            
        } catch (error) {
            console.error('获取班级统计数据失败:', error);
            return null;
        }
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

    /**
     * 生成学生个人报告 (PDF)
     */
    async generateStudentReport(studentId) {
        try {
            const supabase = window.supabaseClient;
            if (!supabase) {
                alert('Database not connected');
                return;
            }
            
            // 获取学生信息
            const { data: student, error: studentError } = await supabase
                .from('students')
                .select('*')
                .eq('student_id', studentId)
                .maybeSingle();
            
            if (studentError || !student) {
                alert('Student not found');
                return;
            }
            
            // 获取答题记录
            const { data: responses, error: responsesError } = await supabase
                .from('question_responses')
                .select('*')
                .eq('student_id', studentId);
            
            if (responsesError) throw responsesError;
            
            const questionCount = responses?.length || 0;
            const correctCount = responses?.filter(r => r.is_correct).length || 0;
            const accuracy = questionCount > 0 ? (correctCount / questionCount) * 100 : 0;
            const avgTime = questionCount > 0 ? 
                responses.reduce((sum, r) => sum + (r.response_time || 0), 0) / questionCount : 0;
            
            // 按难度统计
            const easyResponses = responses?.filter(r => r.difficulty === 'easy') || [];
            const mediumResponses = responses?.filter(r => r.difficulty === 'medium') || [];
            const hardResponses = responses?.filter(r => r.difficulty === 'hard') || [];
            
            const stats = {
                studentId: student.student_id,
                studentName: student.name,
                totalQuestions: questionCount,
                correctQuestions: correctCount,
                wrongQuestions: questionCount - correctCount,
                accuracy: accuracy,
                avgTime: avgTime,
                totalSessions: 1,
                lastActive: responses?.[responses.length - 1]?.timestamp,
                difficultyStats: {
                    easy: {
                        total: easyResponses.length,
                        correct: easyResponses.filter(r => r.is_correct).length,
                        accuracy: easyResponses.length > 0 ? (easyResponses.filter(r => r.is_correct).length / easyResponses.length) * 100 : 0
                    },
                    medium: {
                        total: mediumResponses.length,
                        correct: mediumResponses.filter(r => r.is_correct).length,
                        accuracy: mediumResponses.length > 0 ? (mediumResponses.filter(r => r.is_correct).length / mediumResponses.length) * 100 : 0
                    },
                    hard: {
                        total: hardResponses.length,
                        correct: hardResponses.filter(r => r.is_correct).length,
                        accuracy: hardResponses.length > 0 ? (hardResponses.filter(r => r.is_correct).length / hardResponses.length) * 100 : 0
                    }
                }
            };
            
            if (questionCount === 0) {
                alert('No data available for this student');
                return;
            }

            if (typeof window.jspdf === 'undefined') {
                alert('PDF library not loaded, please refresh');
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            let y = 20;

            // 标题
            doc.setFontSize(24);
            doc.setTextColor(212, 107, 141);
            doc.text('Student Learning Report', 105, y, { align: 'center' });
            
            y += 12;
            
            doc.setFontSize(12);
            doc.setTextColor(150, 150, 150);
            doc.text('Generated by Candy Math Match', 105, y, { align: 'center' });
            
            y += 10;
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

            y += 15;

            // 诊断评语
            const diagnosis = this.getDiagnosisByAccuracy(stats.accuracy);
            const speedDiagnosis = this.getSpeedDiagnosis(stats.avgTime);
            
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
            doc.text('Learning Statistics', 20, y);
            
            y += 10;

            // 统计卡片
            const cardWidth = 52;
            const cardHeight = 38;
            const cardSpacing = 8;
            
            this.drawStatCard(doc, 20, y, cardWidth, cardHeight, 
                'Total Questions', stats.totalQuestions, '#e74c3c');
            this.drawStatCard(doc, 20 + cardWidth + cardSpacing, y, cardWidth, cardHeight, 
                'Correct', stats.correctQuestions, '#2ecc71');
            this.drawStatCard(doc, 20 + (cardWidth + cardSpacing) * 2, y, cardWidth, cardHeight, 
                'Accuracy', Math.round(stats.accuracy) + '%', '#3498db');
            
            y += cardHeight + 8;

            this.drawStatCard(doc, 20, y, cardWidth, cardHeight, 
                'Sessions', stats.totalSessions, '#f39c12');
            this.drawStatCard(doc, 20 + cardWidth + cardSpacing, y, cardWidth, cardHeight, 
                'Avg Time', Math.round(stats.avgTime) + 's', '#9b59b6');
            this.drawStatCard(doc, 20 + (cardWidth + cardSpacing) * 2, y, cardWidth, cardHeight, 
                'Wrong', stats.wrongQuestions, '#e67e22');

            y += cardHeight + 15;

            // 各难度正确率
            doc.setFontSize(16);
            doc.setTextColor(212, 107, 141);
            doc.text('Accuracy by Difficulty', 20, y);
            
            y += 10;

            const difficultyData = [
                ['Difficulty', 'Questions', 'Correct', 'Accuracy'],
                [
                    'Easy', 
                    stats.difficultyStats.easy.total, 
                    stats.difficultyStats.easy.correct, 
                    Math.round(stats.difficultyStats.easy.accuracy) + '%'
                ],
                [
                    'Medium', 
                    stats.difficultyStats.medium.total, 
                    stats.difficultyStats.medium.correct, 
                    Math.round(stats.difficultyStats.medium.accuracy) + '%'
                ],
                [
                    'Hard', 
                    stats.difficultyStats.hard.total, 
                    stats.difficultyStats.hard.correct, 
                    Math.round(stats.difficultyStats.hard.accuracy) + '%'
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

            // 薄弱点分析
            const errorStats = {};
            if (responses) {
                responses.forEach(r => {
                    if (!r.is_correct) {
                        const key = `${r.num1}+${r.num2}=${r.target_number}`;
                        errorStats[key] = (errorStats[key] || 0) + 1;
                    }
                });
            }
            
            const weaknesses = Object.entries(errorStats)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([key, count]) => ({
                    combination: key,
                    count: count,
                    percentage: Math.round((count / stats.wrongQuestions) * 100)
                }));
            
            if (weaknesses.length > 0) {
                if (y > 230) {
                    doc.addPage();
                    y = 20;
                }
                
                doc.setFontSize(16);
                doc.setTextColor(212, 107, 141);
                doc.text('Weakness Analysis', 20, y);
                
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

                y = doc.lastAutoTable.finalY + 12;
            }

            // 改进建议
            if (y > 250) {
                doc.addPage();
                y = 20;
            }

            doc.setFontSize(16);
            doc.setTextColor(212, 107, 141);
            doc.text('Recommendations', 20, y);
            
            y += 12;
            
            const recommendations = this.getRecommendations(stats);
            
            doc.setFontSize(11);
            doc.setTextColor(60, 60, 60);
            recommendations.forEach(rec => {
                doc.text(rec, 25, y);
                y += 8;
            });

            // 保存PDF
            const fileName = `${stats.studentName || 'student'}_Learning_Report_${new Date().toISOString().slice(0,10)}.pdf`;
            doc.save(fileName);
            
        } catch (error) {
            console.error('Failed to generate PDF report:', error);
            alert('Failed to generate report: ' + error.message);
        }
    }

    /**
     * 生成全班报告 (PDF)
     */
    async generateClassReport() {
        try {
            const classStats = await this.getClassStatsFromDB();
            
            if (!classStats || classStats.totalStudents === 0) {
                alert(this.t('noStudentData', 'No student data available'));
                return;
            }
            
            if (classStats.totalQuestions === 0) {
                alert('No practice data available yet. Students need to complete some questions first.');
                return;
            }

            if (typeof window.jspdf === 'undefined') {
                alert('PDF library not loaded, please refresh');
                return;
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
            doc.text(`Students with Activity: ${classStats.studentsWithData}`, 20, y);
            doc.text(`Class Avg Accuracy: ${Math.round(classStats.classAccuracy)}%`, 120, y);
            
            y += 8;
            doc.text(`Class Avg Time: ${Math.round(classStats.avgClassTime)}s`, 20, y);
            doc.text(`Total Correct: ${classStats.totalCorrect}`, 120, y);

            y += 15;

            // 班级诊断
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

            // 各难度班级正确率
            doc.setFontSize(16);
            doc.setTextColor(212, 107, 141);
            doc.text('Class Accuracy by Difficulty', 20, y);
            
            y += 10;

            const difficultyData = [
                ['Difficulty', 'Questions', 'Correct', 'Accuracy', 'Analysis'],
                [
                    'Easy',
                    classStats.difficultyStats.easy.total,
                    classStats.difficultyStats.easy.correct,
                    Math.round(classStats.difficultyStats.easy.accuracy) + '%',
                    this.getDifficultyAnalysis('easy', classStats.difficultyStats.easy.accuracy)
                ],
                [
                    'Medium',
                    classStats.difficultyStats.medium.total,
                    classStats.difficultyStats.medium.correct,
                    Math.round(classStats.difficultyStats.medium.accuracy) + '%',
                    this.getDifficultyAnalysis('medium', classStats.difficultyStats.medium.accuracy)
                ],
                [
                    'Hard',
                    classStats.difficultyStats.hard.total,
                    classStats.difficultyStats.hard.correct,
                    Math.round(classStats.difficultyStats.hard.accuracy) + '%',
                    this.getDifficultyAnalysis('hard', classStats.difficultyStats.hard.accuracy)
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

            // 优秀学生
            if (classStats.topStudents && classStats.topStudents.length > 0 && y < 230) {
                doc.setFontSize(16);
                doc.setTextColor(212, 107, 141);
                doc.text('Top Students', 20, y);
                
                y += 10;

                const topData = [
                    ['Rank', 'Student Name', 'Questions', 'Accuracy', 'Rating'],
                    ...classStats.topStudents.slice(0, 5).map((s, i) => {
                        const rating = this.getDiagnosisByAccuracy(s.accuracy).level;
                        return [i + 1, s.name, s.totalQuestions, Math.round(s.accuracy) + '%', rating];
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

            // 需要关注的学生
            const lowPerformingStudents = classStats.students?.filter(s => s.accuracy < 60 && s.totalQuestions > 0) || [];
            
            if (lowPerformingStudents.length > 0) {
                if (y > 230) {
                    doc.addPage();
                    y = 20;
                }
                
                doc.setFontSize(16);
                doc.setTextColor(231, 76, 60);
                doc.text('Students Needing Attention (Accuracy < 60%)', 20, y);
                
                y += 10;

                const lowData = [
                    ['Student Name', 'Questions', 'Accuracy', 'Avg Time', 'Suggestion'],
                    ...lowPerformingStudents.slice(0, 10).map(s => [
                        s.name, 
                        s.totalQuestions, 
                        Math.round(s.accuracy) + '%', 
                        Math.round(s.avgTime) + 's',
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
     * 导出为 Excel
     */
    async exportToExcel() {
        try {
            const classStats = await this.getClassStatsFromDB();
            
            if (!classStats || classStats.totalStudents === 0) {
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
                const easyAccuracy = Math.round(s.difficultyStats?.easy?.accuracy || 0);
                const mediumAccuracy = Math.round(s.difficultyStats?.medium?.accuracy || 0);
                const hardAccuracy = Math.round(s.difficultyStats?.hard?.accuracy || 0);
                const diagnosis = this.getDiagnosisByAccuracy(s.accuracy);
                const speedDiagnosis = this.getSpeedDiagnosis(s.avgTime);
                
                return {
                    [this.t('studentName', '学生姓名')]: s.name || '-',
                    [this.t('studentId', '学生ID')]: s.studentId || '-',
                    [this.t('class', '班级')]: s.class || '-',
                    [this.t('totalQuestions', '总答题数')]: s.totalQuestions || 0,
                    [this.t('correctAnswers', '正确题数')]: s.correctQuestions || 0,
                    [this.t('wrongAnswers', '错误题数')]: s.wrongQuestions || 0,
                    [this.t('accuracy', '正确率')]: Math.round(s.accuracy) + '%',
                    [this.t('avgTime', '平均用时')]: Math.round(s.avgTime) + this.t('seconds', '秒'),
                    [this.t('easyAccuracy', '简单正确率')]: easyAccuracy + '%',
                    [this.t('mediumAccuracy', '中等正确率')]: mediumAccuracy + '%',
                    [this.t('hardAccuracy', '困难正确率')]: hardAccuracy + '%',
                    [this.t('overallRating', '综合评级')]: diagnosis.level,
                    [this.t('speedRating', '速度评级')]: speedDiagnosis.level
                };
            });

            const ws1 = XLSX.utils.json_to_sheet(studentData);
            XLSX.utils.book_append_sheet(wb, ws1, this.t('studentData', '学生学习数据'));

            // 2. 班级统计摘要
            const summaryData = [
                { [this.t('statItem', '统计项目')]: this.t('totalStudents', '学生人数'), [this.t('value', '数值')]: classStats.totalStudents },
                { [this.t('statItem', '统计项目')]: this.t('studentsWithActivity', '有练习学生'), [this.t('value', '数值')]: classStats.studentsWithData },
                { [this.t('statItem', '统计项目')]: this.t('totalQuestions', '总答题数'), [this.t('value', '数值')]: classStats.totalQuestions },
                { [this.t('statItem', '统计项目')]: this.t('correctAnswers', '总正确题数'), [this.t('value', '数值')]: classStats.totalCorrect },
                { [this.t('statItem', '统计项目')]: this.t('classAvgAccuracy', '班级平均正确率'), [this.t('value', '数值')]: Math.round(classStats.classAccuracy) + '%' },
                { [this.t('statItem', '统计项目')]: this.t('classAvgTime', '班级平均用时'), [this.t('value', '数值')]: Math.round(classStats.avgClassTime) + this.t('seconds', '秒') }
            ];

            const ws2 = XLSX.utils.json_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, ws2, this.t('classSummary', '班级统计'));

            // 3. 各难度统计
            const difficultySummary = [
                { [this.t('difficulty', '难度')]: this.t('easy', '简单'), [this.t('totalQuestions', '答题数')]: classStats.difficultyStats.easy.total, [this.t('correctAnswers', '正确数')]: classStats.difficultyStats.easy.correct, [this.t('accuracy', '正确率')]: Math.round(classStats.difficultyStats.easy.accuracy) + '%' },
                { [this.t('difficulty', '难度')]: this.t('medium', '中等'), [this.t('totalQuestions', '答题数')]: classStats.difficultyStats.medium.total, [this.t('correctAnswers', '正确数')]: classStats.difficultyStats.medium.correct, [this.t('accuracy', '正确率')]: Math.round(classStats.difficultyStats.medium.accuracy) + '%' },
                { [this.t('difficulty', '难度')]: this.t('hard', '困难'), [this.t('totalQuestions', '答题数')]: classStats.difficultyStats.hard.total, [this.t('correctAnswers', '正确数')]: classStats.difficultyStats.hard.correct, [this.t('accuracy', '正确率')]: Math.round(classStats.difficultyStats.hard.accuracy) + '%' }
            ];

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
     * 生成比赛用报告
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
