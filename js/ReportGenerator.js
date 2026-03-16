/**
 * ==================== 糖果数学消消乐 - 学习报告生成器 ====================
 * 版本: 1.0.1
 * 功能：生成 PDF/Excel 格式的学习报告，用于比赛提交
 * 依赖：jsPDF, jspdf-autotable, XLSX
 * ====================================================================
 */

class ReportGenerator {
    constructor(game) {
        this.game = game;
        this.studentRecord = game.studentRecord;
    }

    /**
     * 生成学生个人报告 (PDF)
     */
    async generateStudentReport(studentId) {
        try {
            const stats = this.studentRecord.getStudentStats(studentId);
            if (!stats) {
                alert('没有找到该学生的数据');
                return;
            }

            if (typeof window.jspdf === 'undefined') {
                alert('PDF库未加载，请刷新页面重试');
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            let y = 20;

            // 标题
            doc.setFontSize(24);
            doc.setTextColor(255, 105, 180); // 糖果粉
            doc.text('学生学习报告', 105, y, { align: 'center' });
            
            y += 15;

            // 装饰线
            doc.setDrawColor(255, 182, 193);
            doc.setLineWidth(0.5);
            doc.line(20, y, 190, y);
            
            y += 10;

            // 学生信息
            doc.setFontSize(14);
            doc.setTextColor(0, 0, 0);
            doc.text(`学生姓名: ${stats.studentName}`, 20, y);
            doc.text(`学生ID: ${stats.studentId}`, 20, y + 8);
            doc.text(`报告生成时间: ${new Date().toLocaleString('zh-CN')}`, 20, y + 16);
            doc.text(`最后活动: ${stats.lastActive ? new Date(stats.lastActive).toLocaleString('zh-CN') : '无'}`, 20, y + 24);

            y += 35;

            // 学习统计标题
            doc.setFontSize(16);
            doc.setTextColor(255, 105, 180);
            doc.text('📊 学习统计', 20, y);
            
            y += 10;

            // 统计卡片
            const cardWidth = 80;
            const cardHeight = 40;
            const cardSpacing = 10;

            // 第一行卡片
            this.drawStatCard(doc, 20, y, cardWidth, cardHeight, '总练习次数', stats.totalSessions);
            this.drawStatCard(doc, 20 + cardWidth + cardSpacing, y, cardWidth, cardHeight, '总答题数', stats.totalQuestions);
            
            y += cardHeight + 10;

            // 第二行卡片
            this.drawStatCard(doc, 20, y, cardWidth, cardHeight, '正确题数', stats.correctQuestions);
            this.drawStatCard(doc, 20 + cardWidth + cardSpacing, y, cardWidth, cardHeight, '错误题数', stats.wrongQuestions);
            
            y += cardHeight + 10;

            // 第三行卡片
            this.drawStatCard(doc, 20, y, cardWidth, cardHeight, '正确率', `${stats.accuracy}%`);
            this.drawStatCard(doc, 20 + cardWidth + cardSpacing, y, cardWidth, cardHeight, '平均答题时间', `${stats.averageTimePerQuestion}秒`);

            y += cardHeight + 15;

            // 各难度正确率
            doc.setFontSize(16);
            doc.setTextColor(255, 105, 180);
            doc.text('🎯 各难度正确率', 20, y);
            
            y += 10;

            const difficultyData = [
                ['难度', '答题数', '正确数', '正确率'],
                ['简单', stats.difficultyStats.easy.total, stats.difficultyStats.easy.correct, `${stats.difficultyStats.easy.accuracy}%`],
                ['中等', stats.difficultyStats.medium.total, stats.difficultyStats.medium.correct, `${stats.difficultyStats.medium.accuracy}%`],
                ['困难', stats.difficultyStats.hard.total, stats.difficultyStats.hard.correct, `${stats.difficultyStats.hard.accuracy}%`]
            ];

            doc.autoTable({
                startY: y,
                head: [difficultyData[0]],
                body: difficultyData.slice(1),
                theme: 'striped',
                headStyles: { fillColor: [255, 105, 180] },
                styles: { fontSize: 10 }
            });

            y = doc.lastAutoTable.finalY + 15;

            // 检查是否需要新页
            if (y > 250) {
                doc.addPage();
                y = 20;
            }

            // 常见错误分析
            doc.setFontSize(16);
            doc.setTextColor(255, 105, 180);
            doc.text('❌ 常见错误分析', 20, y);
            
            y += 10;

            const mistakeData = Object.entries(stats.errorStats)
                .map(([key, count]) => [
                    key, 
                    count, 
                    `${Math.round((count / stats.wrongQuestions) * 100)}%`
                ]);

            if (mistakeData.length > 0) {
                doc.autoTable({
                    startY: y,
                    head: [['题目组合', '错误次数', '占比']],
                    body: mistakeData,
                    theme: 'striped',
                    headStyles: { fillColor: [255, 105, 180] },
                    styles: { fontSize: 10 }
                });
            } else {
                doc.setFontSize(12);
                doc.text('暂无错误记录', 30, y);
            }

            // 保存PDF
            doc.save(`${stats.studentName}_学习报告_${new Date().toISOString().slice(0,10)}.pdf`);
        } catch (error) {
            console.error('生成PDF报告失败:', error);
            alert('生成报告失败：' + error.message);
        }
    }

    /**
     * 绘制统计卡片
     */
    drawStatCard(doc, x, y, width, height, label, value) {
        try {
            // 卡片背景
            doc.setFillColor(255, 240, 245);
            doc.setDrawColor(255, 182, 193);
            doc.setLineWidth(0.5);
            doc.roundedRect(x, y, width, height, 5, 5, 'FD');

            // 标签
            doc.setFontSize(10);
            doc.setTextColor(180, 100, 120);
            doc.text(label, x + width/2, y + 12, { align: 'center' });

            // 数值
            doc.setFontSize(16);
            doc.setTextColor(255, 105, 180);
            doc.text(String(value), x + width/2, y + 28, { align: 'center' });
        } catch (error) {
            console.error('绘制统计卡片失败:', error);
        }
    }

    /**
     * 生成全班报告 (PDF)
     */
    async generateClassReport() {
        try {
            const classStats = this.studentRecord.getClassStats();
            
            if (classStats.totalStudents === 0) {
                alert('暂无学生数据');
                return;
            }

            if (typeof window.jspdf === 'undefined') {
                alert('PDF库未加载，请刷新页面重试');
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            let y = 20;

            // 标题
            doc.setFontSize(24);
            doc.setTextColor(255, 105, 180);
            doc.text('全班学习报告', 105, y, { align: 'center' });
            
            y += 15;

            // 装饰线
            doc.setDrawColor(255, 182, 193);
            doc.setLineWidth(0.5);
            doc.line(20, y, 190, y);
            
            y += 10;

            // 班级概况
            doc.setFontSize(14);
            doc.setTextColor(0, 0, 0);
            doc.text(`报告生成时间: ${new Date().toLocaleString('zh-CN')}`, 20, y);
            doc.text(`学生人数: ${classStats.totalStudents} 人`, 20, y + 8);
            doc.text(`总练习次数: ${classStats.totalSessions || 0} 次`, 20, y + 16);
            doc.text(`总答题数: ${classStats.totalQuestions} 题`, 20, y + 24);
            doc.text(`总正确题数: ${classStats.totalCorrect} 题`, 20, y + 32);
            doc.text(`班级平均正确率: ${classStats.classAccuracy}%`, 20, y + 40);
            doc.text(`平均答题时间: ${classStats.averageTime} 秒`, 20, y + 48);

            y += 60;

            // 各难度班级正确率
            doc.setFontSize(16);
            doc.setTextColor(255, 105, 180);
            doc.text('📊 各难度班级正确率', 20, y);
            
            y += 10;

            const difficultyData = [
                ['难度', '全班答题数', '全班正确数', '班级正确率'],
                ['简单', classStats.difficultyStats.easy.total, classStats.difficultyStats.easy.correct, `${classStats.difficultyStats.easy.accuracy}%`],
                ['中等', classStats.difficultyStats.medium.total, classStats.difficultyStats.medium.correct, `${classStats.difficultyStats.medium.accuracy}%`],
                ['困难', classStats.difficultyStats.hard.total, classStats.difficultyStats.hard.correct, `${classStats.difficultyStats.hard.accuracy}%`]
            ];

            doc.autoTable({
                startY: y,
                head: [difficultyData[0]],
                body: difficultyData.slice(1),
                theme: 'striped',
                headStyles: { fillColor: [255, 105, 180] },
                styles: { fontSize: 10 }
            });

            y = doc.lastAutoTable.finalY + 15;

            // 优秀学生
            doc.setFontSize(16);
            doc.setTextColor(255, 105, 180);
            doc.text('🏆 优秀学生（前5名）', 20, y);
            
            y += 10;

            if (classStats.topStudents.length > 0) {
                const topData = classStats.topStudents.map((s, i) => [
                    i + 1,
                    s.name,
                    s.totalQuestions,
                    `${s.accuracy}%`
                ]);

                doc.autoTable({
                    startY: y,
                    head: [['排名', '学生姓名', '答题数', '正确率']],
                    body: topData,
                    theme: 'striped',
                    headStyles: { fillColor: [255, 105, 180] },
                    styles: { fontSize: 10 }
                });

                y = doc.lastAutoTable.finalY + 15;
            }

            // 检查是否需要新页
            if (y > 250) {
                doc.addPage();
                y = 20;
            }

            // 常见错误（全班）
            doc.setFontSize(16);
            doc.setTextColor(255, 105, 180);
            doc.text('❌ 全班常见错误', 20, y);
            
            y += 10;

            const mistakeData = Object.entries(classStats.commonMistakes)
                .map(([key, count]) => [
                    key, 
                    count, 
                    `${Math.round((count / classStats.totalQuestions) * 100)}%`
                ]);

            if (mistakeData.length > 0) {
                doc.autoTable({
                    startY: y,
                    head: [['题目组合', '错误次数', '错误率']],
                    body: mistakeData,
                    theme: 'striped',
                    headStyles: { fillColor: [255, 105, 180] },
                    styles: { fontSize: 10 }
                });
            } else {
                doc.setFontSize(12);
                doc.text('暂无错误记录', 30, y);
            }

            // 保存PDF
            doc.save(`全班学习报告_${new Date().toISOString().slice(0,10)}.pdf`);
        } catch (error) {
            console.error('生成全班报告失败:', error);
            alert('生成报告失败：' + error.message);
        }
    }

    /**
     * 导出为 Excel (用于教师进一步分析)
     */
    exportToExcel() {
        try {
            const classStats = this.studentRecord.getClassStats();
            
            if (classStats.totalStudents === 0) {
                alert('暂无学生数据');
                return;
            }

            if (typeof XLSX === 'undefined') {
                alert('Excel库未加载，请刷新页面重试');
                return;
            }

            // 创建工作簿
            const wb = XLSX.utils.book_new();

            // 1. 学生学习数据表
            const studentData = classStats.students.map(s => ({
                '学生姓名': s.studentName,
                '学生ID': s.studentId,
                '练习次数': s.totalSessions,
                '总答题数': s.totalQuestions,
                '正确题数': s.correctQuestions,
                '错误题数': s.wrongQuestions,
                '正确率': `${s.accuracy}%`,
                '平均答题时间': `${s.averageTimePerQuestion}秒`,
                '简单题正确率': `${s.difficultyStats.easy.accuracy}%`,
                '中等题正确率': `${s.difficultyStats.medium.accuracy}%`,
                '困难题正确率': `${s.difficultyStats.hard.accuracy}%`,
                '最后活动': s.lastActive ? new Date(s.lastActive).toLocaleString('zh-CN') : '无'
            }));

            const ws1 = XLSX.utils.json_to_sheet(studentData);
            XLSX.utils.book_append_sheet(wb, ws1, '学生学习数据');

            // 2. 常见错误表
            const mistakeData = Object.entries(classStats.commonMistakes)
                .map(([key, count]) => ({
                    '题目组合': key,
                    '错误次数': count,
                    '错误率': `${Math.round((count / classStats.totalQuestions) * 100)}%`
                }));

            if (mistakeData.length > 0) {
                const ws2 = XLSX.utils.json_to_sheet(mistakeData);
                XLSX.utils.book_append_sheet(wb, ws2, '常见错误');
            }

            // 3. 班级统计摘要
            const summaryData = [{
                '统计项目': '学生人数',
                '数值': classStats.totalStudents
            }, {
                '统计项目': '总练习次数',
                '数值': classStats.totalSessions || 0
            }, {
                '统计项目': '总答题数',
                '数值': classStats.totalQuestions
            }, {
                '统计项目': '总正确题数',
                '数值': classStats.totalCorrect
            }, {
                '统计项目': '班级平均正确率',
                '数值': `${classStats.classAccuracy}%`
            }, {
                '统计项目': '平均答题时间',
                '数值': `${classStats.averageTime}秒`
            }, {
                '统计项目': '简单题正确率',
                '数值': `${classStats.difficultyStats.easy.accuracy}%`
            }, {
                '统计项目': '中等题正确率',
                '数值': `${classStats.difficultyStats.medium.accuracy}%`
            }, {
                '统计项目': '困难题正确率',
                '数值': `${classStats.difficultyStats.hard.accuracy}%`
            }];

            const ws3 = XLSX.utils.json_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, ws3, '班级统计');

            // 保存Excel
            XLSX.writeFile(wb, `学生学习数据_${new Date().toISOString().slice(0,10)}.xlsx`);
        } catch (error) {
            console.error('导出Excel失败:', error);
            alert('导出Excel失败：' + error.message);
        }
    }

    /**
     * 生成比赛用报告（包含所有比赛要求的信息）
     */
    generateCompetitionReport() {
        try {
            const classStats = this.studentRecord.getClassStats();
            
            if (classStats.totalStudents === 0) {
                alert('暂无学生数据');
                return;
            }

            if (typeof window.jspdf === 'undefined') {
                alert('PDF库未加载，请刷新页面重试');
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            
            let y = 20;

            // 封面
            doc.setFontSize(28);
            doc.setTextColor(255, 105, 180);
            doc.text('糖果数学消消乐', 105, 60, { align: 'center' });
            
            doc.setFontSize(20);
            doc.text('教学效果评估报告', 105, 80, { align: 'center' });
            
            doc.setFontSize(14);
            doc.setTextColor(100, 100, 100);
            doc.text('Pertandingan Inovasi Digital dalam PdP Guru', 105, 100, { align: 'center' });
            doc.text('Simposium Duta Guru 2026', 105, 110, { align: 'center' });
            
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            doc.text(`报告生成日期: ${new Date().toLocaleDateString('zh-CN')}`, 105, 140, { align: 'center' });
            doc.text(`教师姓名: ${this.game.state.currentUser?.name || '______'}`, 105, 150, { align: 'center' });
            doc.text(`学校名称: ____________________`, 105, 160, { align: 'center' });

            doc.addPage();
            y = 20;

            // 1. 创新点说明
            doc.setFontSize(18);
            doc.setTextColor(255, 105, 180);
            doc.text('1. 创新点说明 (Kreatif & Inovatif)', 20, y);
            
            y += 15;
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            const innovations = [
                '• 实时多人对战匹配系统，支持在线对战',
                '• AI自适应难度调节，根据学生水平自动调整',
                '• 完整的学生学习记录系统，追踪每个学生的学习进度',
                '• 自动生成学习报告，提供教学效果证据',
                '• 柔和多彩的糖果主题界面，提高学生学习兴趣',
                '• 双语支持（中文/英文），适用于多语言环境'
            ];
            innovations.forEach(text => {
                doc.text(text, 25, y);
                y += 8;
            });

            y += 10;

            // 2. 教学效果
            doc.setFontSize(18);
            doc.setTextColor(255, 105, 180);
            doc.text('2. 教学效果 (Keberkesanan Pedagogi)', 20, y);
            
            y += 15;
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            doc.text(`参与学生人数: ${classStats.totalStudents} 人`, 25, y);
            doc.text(`总练习次数: ${classStats.totalSessions || 0} 次`, 25, y + 8);
            doc.text(`总答题数: ${classStats.totalQuestions} 题`, 25, y + 16);
            doc.text(`班级平均正确率: ${classStats.classAccuracy}%`, 25, y + 24);
            doc.text(`平均答题时间: ${classStats.averageTime} 秒/题`, 25, y + 32);

            y += 45;

            // 各难度正确率表格
            const difficultyData = [
                ['难度', '答题数', '正确数', '正确率'],
                ['简单', classStats.difficultyStats.easy.total, classStats.difficultyStats.easy.correct, `${classStats.difficultyStats.easy.accuracy}%`],
                ['中等', classStats.difficultyStats.medium.total, classStats.difficultyStats.medium.correct, `${classStats.difficultyStats.medium.accuracy}%`],
                ['困难', classStats.difficultyStats.hard.total, classStats.difficultyStats.hard.correct, `${classStats.difficultyStats.hard.accuracy}%`]
            ];

            doc.autoTable({
                startY: y,
                head: [difficultyData[0]],
                body: difficultyData.slice(1),
                theme: 'striped',
                headStyles: { fillColor: [255, 105, 180] },
                styles: { fontSize: 10 }
            });

            y = doc.lastAutoTable.finalY + 15;

            // 3. 节省时间分析
            doc.addPage();
            y = 20;
            
            doc.setFontSize(18);
            doc.setTextColor(255, 105, 180);
            doc.text('3. 节省时间分析 (Menjimatkan Masa Guru)', 20, y);
            
            y += 15;
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            const timeSavings = [
                '• 自动生成练习题: 每节课节省约5分钟',
                '• 自动批改: 每份作业节省约2分钟',
                '• 自动生成学习报告: 每份报告节省约10分钟',
                '• 数据统计分析: 每次节省约15分钟',
                '',
                '估算每月节省时间:',
                `  - 按每天2节课计算: 约 ${2 * 5 * 20} 分钟/月`,
                `  - 按每周5次作业计算: 约 ${5 * 2 * 4} 分钟/月`,
                `  - 按每月4次报告计算: 约 ${4 * 10} 分钟/月`,
                `  - 总计: 约 ${(2*5*20) + (5*2*4) + (4*10)} 分钟/月 (约 ${Math.round(((2*5*20) + (5*2*4) + (4*10))/60)} 小时)`
            ];
            timeSavings.forEach(text => {
                doc.text(text, 25, y);
                y += 8;
            });

            y += 10;

            // 4. 推广潜力
            doc.setFontSize(18);
            doc.setTextColor(255, 105, 180);
            doc.text('4. 推广潜力 (Potensi Disebar Luas)', 20, y);
            
            y += 15;
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            const potentials = [
                '• 完全基于Web技术，无需安装，打开浏览器即可使用',
                '• 支持多种语言（中文/英文），适用于多语言环境',
                '• 可以部署在学校服务器或免费托管平台（如GitHub Pages）',
                '• 支持多人同时在线使用，适合班级教学',
                '• 可导出学习数据，方便教师进一步分析',
                '• 源代码开放，其他教师可以根据需要修改和定制'
            ];
            potentials.forEach(text => {
                doc.text(text, 25, y);
                y += 8;
            });

            y += 10;

            // 5. 成本分析
            doc.setFontSize(18);
            doc.setTextColor(255, 105, 180);
            doc.text('5. 成本分析 (Kos Berpatutan)', 20, y);
            
            y += 15;
            doc.setFontSize(12);
            doc.setTextColor(0, 0, 0);
            const costs = [
                '开发成本:',
                '  • 开发时间: 约 40 小时 (估算)',
                '  • 开发工具: 免费 (VS Code, Git)',
                '',
                '运行成本:',
                '  • 服务器: 免费 (Supabase 免费层)',
                '  • 托管: 免费 (GitHub Pages)',
                '  • 数据库: 免费 (Supabase 500MB)',
                '',
                '与传统方法对比:',
                '  • 传统练习册: 每本约 RM 10-20，每年需更新',
                '  • 本系统: 一次性开发，永久使用，零维护成本',
                '',
                '总成本: RM 0 (完全免费)'
            ];
            costs.forEach(text => {
                doc.text(text, 25, y);
                y += 8;
            });

            // 保存PDF
            doc.save(`教学效果评估报告_${new Date().toISOString().slice(0,10)}.pdf`);
        } catch (error) {
            console.error('生成比赛报告失败:', error);
            alert('生成报告失败：' + error.message);
        }
    }
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.ReportGenerator = ReportGenerator;
}
