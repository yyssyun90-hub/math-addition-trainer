/**
 * ==================== 糖果数学消消乐 - 教师面板控制器 ====================
 * 版本: 1.0.1
 * 功能：控制教师面板的UI交互和数据展示
 * ====================================================================
 */

class TeacherPanel {
    constructor(game) {
        this.game = game;
        this.studentRecord = game.studentRecord;
        this.reportGenerator = game.reportGenerator;
        this.currentTab = 'students';
        this.handlers = {};
        
        this.init();
    }

    /**
     * 初始化教师面板
     */
    init() {
        // 等待DOM加载完成后再绑定事件
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.bindEvents());
        } else {
            this.bindEvents();
        }
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 教师面板按钮
        const teacherBtn = document.getElementById('teacher-panel-btn');
        if (teacherBtn) {
            teacherBtn.addEventListener('click', (e) => this.openPanel(e));
        }

        // 关闭按钮
        const closeBtn = document.getElementById('close-teacher');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => this.closePanel(e));
        }

        // 标签页切换
        document.querySelectorAll('[data-teacher-tab]').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.teacherTab));
        });

        // 导入学生
        const importBtn = document.getElementById('import-students');
        if (importBtn) {
            importBtn.addEventListener('click', (e) => this.importStudents(e));
        }

        // 清除所有记录
        const clearBtn = document.getElementById('clear-all-records');
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => this.clearAllRecords(e));
        }

        // 生成PDF报告
        const pdfBtn = document.getElementById('generate-pdf');
        if (pdfBtn) {
            pdfBtn.addEventListener('click', (e) => this.generateReport(e));
        }

        // 导出Excel
        const excelBtn = document.getElementById('export-excel');
        if (excelBtn) {
            excelBtn.addEventListener('click', (e) => this.exportExcel(e));
        }

        // 点击背景关闭
        const modal = document.getElementById('teacher-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closePanel(e);
                }
            });
        }
    }

    /**
     * 打开教师面板
     */
    openPanel(e) {
        e?.preventDefault();
        
        // 检查是否登录
        if (!this.game.auth || !this.game.auth.isLoggedIn()) {
            alert('请先登录');
            if (this.game.auth) {
                this.game.auth.showAuthModal('login');
            }
            return;
        }

        const modal = document.getElementById('teacher-modal');
        if (modal) {
            modal.style.display = 'flex';
            this.refreshData();
        }
    }

    /**
     * 关闭教师面板
     */
    closePanel(e) {
        e?.preventDefault();
        
        const modal = document.getElementById('teacher-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * 切换标签页
     */
    switchTab(tabId) {
        if (!tabId) return;
        
        this.currentTab = tabId;

        // 更新标签按钮状态
        document.querySelectorAll('[data-teacher-tab]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.teacherTab === tabId);
        });

        // 更新标签页内容显示
        document.querySelectorAll('.teacher-tab-content').forEach(content => {
            content.style.display = 'none';
        });

        const tabContent = document.getElementById(`${tabId}-tab`);
        if (tabContent) {
            tabContent.style.display = 'block';
        }

        // 刷新对应数据
        switch (tabId) {
            case 'students':
                this.refreshStudentList();
                break;
            case 'stats':
                this.refreshClassStats();
                break;
            case 'reports':
                this.refreshReportOptions();
                break;
        }
    }

    /**
     * 刷新所有数据
     */
    refreshData() {
        this.refreshStudentList();
        this.refreshReportOptions();
        this.refreshClassStats();
    }

    /**
     * 刷新学生列表
     */
    refreshStudentList() {
        const list = document.getElementById('student-list');
        if (!list) return;

        try {
            const classStats = this.studentRecord.getClassStats();
            
            if (classStats.totalStudents === 0) {
                list.innerHTML = '<div style="text-align: center; color: #b2869c; padding: 20px;">暂无学生数据</div>';
                return;
            }

            let html = '';
            classStats.students.sort((a, b) => b.accuracy - a.accuracy).forEach(student => {
                html += `
                    <div class="student-list-item" data-student-id="${this.escapeHtml(student.studentId)}" style="cursor: pointer;">
                        <div class="student-info">
                            <h4>${this.escapeHtml(student.studentName)}</h4>
                            <p>ID: ${this.escapeHtml(student.studentId)} · 答题: ${student.totalQuestions}题</p>
                        </div>
                        <div class="student-stats">
                            <div class="student-accuracy">${student.accuracy}%</div>
                            <div class="student-questions">正确: ${student.correctQuestions}/${student.totalQuestions}</div>
                        </div>
                    </div>
                `;
            });

            list.innerHTML = html;

            // 添加点击事件查看学生详情
            list.querySelectorAll('.student-list-item').forEach(item => {
                item.addEventListener('click', () => {
                    const studentId = item.dataset.studentId;
                    if (studentId) {
                        this.showStudentDetail(studentId);
                    }
                });
            });
        } catch (error) {
            console.error('刷新学生列表失败:', error);
            list.innerHTML = '<div style="text-align: center; color: #ff4444; padding: 20px;">加载失败</div>';
        }
    }

    /**
     * 刷新报告选项
     */
    refreshReportOptions() {
        const select = document.getElementById('report-student-select');
        if (!select) return;

        try {
            const classStats = this.studentRecord.getClassStats();
            
            // 清空并添加默认选项
            select.innerHTML = '<option value="all">全班报告</option>';

            // 添加学生选项
            classStats.students.forEach(student => {
                const option = document.createElement('option');
                option.value = student.studentId;
                option.textContent = `${student.studentName} (${student.accuracy}%)`;
                select.appendChild(option);
            });
        } catch (error) {
            console.error('刷新报告选项失败:', error);
        }
    }

    /**
     * 刷新班级统计
     */
    refreshClassStats() {
        const statsDiv = document.getElementById('class-stats');
        if (!statsDiv) return;

        try {
            const classStats = this.studentRecord.getClassStats();
            
            if (classStats.totalStudents === 0) {
                statsDiv.innerHTML = '<div style="text-align: center; color: #b2869c; padding: 20px;">暂无统计数据</div>';
                return;
            }

            let html = `
                <div style="background: rgba(255, 240, 245, 0.7); border-radius: 30px; padding: 20px; margin-bottom: 15px;">
                    <h3 style="color: #d46b8d; margin-bottom: 15px;">班级概况</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div>
                            <div style="font-size: 0.9rem; color: #b2869c;">学生人数</div>
                            <div style="font-size: 2rem; font-weight: bold; color: #d46b8d;">${classStats.totalStudents}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.9rem; color: #b2869c;">总练习次数</div>
                            <div style="font-size: 2rem; font-weight: bold; color: #d46b8d;">${classStats.totalSessions || 0}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.9rem; color: #b2869c;">总答题数</div>
                            <div style="font-size: 2rem; font-weight: bold; color: #d46b8d;">${classStats.totalQuestions}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.9rem; color: #b2869c;">班级正确率</div>
                            <div style="font-size: 2rem; font-weight: bold; color: #d46b8d;">${classStats.classAccuracy}%</div>
                        </div>
                        <div>
                            <div style="font-size: 0.9rem; color: #b2869c;">平均答题时间</div>
                            <div style="font-size: 2rem; font-weight: bold; color: #d46b8d;">${classStats.averageTime}s</div>
                        </div>
                    </div>
                </div>
            `;

            // 各难度正确率
            html += `
                <div style="background: rgba(255, 240, 245, 0.7); border-radius: 30px; padding: 20px; margin-bottom: 15px;">
                    <h3 style="color: #d46b8d; margin-bottom: 15px;">各难度正确率</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                        <div style="text-align: center;">
                            <div style="font-size: 0.9rem; color: #b2869c;">简单</div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #4CAF50;">${classStats.difficultyStats.easy.accuracy}%</div>
                            <div style="font-size: 0.8rem; color: #b2869c;">(${classStats.difficultyStats.easy.correct}/${classStats.difficultyStats.easy.total})</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 0.9rem; color: #b2869c;">中等</div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #FF9800;">${classStats.difficultyStats.medium.accuracy}%</div>
                            <div style="font-size: 0.8rem; color: #b2869c;">(${classStats.difficultyStats.medium.correct}/${classStats.difficultyStats.medium.total})</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 0.9rem; color: #b2869c;">困难</div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #f44336;">${classStats.difficultyStats.hard.accuracy}%</div>
                            <div style="font-size: 0.8rem; color: #b2869c;">(${classStats.difficultyStats.hard.correct}/${classStats.difficultyStats.hard.total})</div>
                        </div>
                    </div>
                </div>
            `;

            // 优秀学生
            if (classStats.topStudents.length > 0) {
                html += `
                    <div style="background: rgba(255, 240, 245, 0.7); border-radius: 30px; padding: 20px;">
                        <h3 style="color: #d46b8d; margin-bottom: 15px;">🏆 优秀学生</h3>
                `;

                classStats.topStudents.forEach((student, index) => {
                    html += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid rgba(255, 200, 220, 0.6);">
                            <span>${index + 1}. ${this.escapeHtml(student.name)}</span>
                            <span style="font-weight: bold; color: #d46b8d;">${student.accuracy}% (${student.totalQuestions}题)</span>
                        </div>
                    `;
                });

                html += '</div>';
            }

            statsDiv.innerHTML = html;
        } catch (error) {
            console.error('刷新班级统计失败:', error);
            statsDiv.innerHTML = '<div style="text-align: center; color: #ff4444; padding: 20px;">加载失败</div>';
        }
    }

    /**
     * 显示学生详情
     */
    showStudentDetail(studentId) {
        try {
            const stats = this.studentRecord.getStudentStats(studentId);
            if (!stats) return;

            // 创建详情模态框
            const detailDiv = document.createElement('div');
            detailDiv.id = 'student-detail-modal';
            detailDiv.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0,0,0,0.5);
                backdrop-filter: blur(5px);
                z-index: 6000;
                display: flex;
                justify-content: center;
                align-items: center;
            `;

            const detailHtml = `
                <div style="background: white; border-radius: 40px; padding: 30px; max-width: 400px; width: 90%;">
                    <h3 style="color: #d46b8d; margin-bottom: 20px;">${this.escapeHtml(stats.studentName)} 详情</h3>
                    <div style="margin-bottom: 15px;">
                        <div style="color: #b2869c; margin-bottom: 5px;">正确率: <span style="color: #d46b8d; font-weight: bold;">${stats.accuracy}%</span></div>
                        <div style="color: #b2869c; margin-bottom: 5px;">练习次数: ${stats.totalSessions} 次</div>
                        <div style="color: #b2869c; margin-bottom: 5px;">答题总数: ${stats.totalQuestions} 题</div>
                        <div style="color: #b2869c; margin-bottom: 5px;">正确: ${stats.correctQuestions} 题</div>
                        <div style="color: #b2869c; margin-bottom: 5px;">错误: ${stats.wrongQuestions} 题</div>
                        <div style="color: #b2869c; margin-bottom: 5px;">平均时间: ${stats.averageTimePerQuestion} 秒/题</div>
                    </div>
                    <div style="display: flex; gap: 10px; justify-content: center;">
                        <button class="candy-btn primary" id="generate-student-pdf">生成报告</button>
                        <button class="candy-btn home" id="close-detail">关闭</button>
                    </div>
                </div>
            `;

            detailDiv.innerHTML = detailHtml;
            document.body.appendChild(detailDiv);

            // 绑定事件
            document.getElementById('generate-student-pdf')?.addEventListener('click', () => {
                this.reportGenerator.generateStudentReport(studentId);
                detailDiv.remove();
            });

            document.getElementById('close-detail')?.addEventListener('click', () => {
                detailDiv.remove();
            });

            // 点击背景关闭
            detailDiv.addEventListener('click', (e) => {
                if (e.target === detailDiv) {
                    detailDiv.remove();
                }
            });
        } catch (error) {
            console.error('显示学生详情失败:', error);
        }
    }

    /**
     * 导入学生
     */
    importStudents(e) {
        e?.preventDefault();
        
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.txt';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const imported = this.studentRecord.importStudents(e.target.result);
                    if (imported > 0) {
                        alert(`成功导入 ${imported} 名学生`);
                        this.refreshData();
                    } else {
                        alert('导入失败，请检查文件格式（CSV格式：学号,姓名）');
                    }
                } catch (error) {
                    console.error('导入学生失败:', error);
                    alert('导入失败：' + error.message);
                }
            };
            reader.readAsText(file);
        };

        input.click();
    }

    /**
     * 清除所有记录
     */
    clearAllRecords(e) {
        e?.preventDefault();
        
        if (this.studentRecord.clearAllRecords()) {
            this.refreshData();
        }
    }

    /**
     * 生成报告
     */
    generateReport(e) {
        e?.preventDefault();
        
        const select = document.getElementById('report-student-select');
        if (!select) return;

        const studentId = select.value;

        if (studentId === 'all') {
            this.reportGenerator.generateClassReport();
        } else {
            this.reportGenerator.generateStudentReport(studentId);
        }
    }

    /**
     * 导出Excel
     */
    exportExcel(e) {
        e?.preventDefault();
        this.reportGenerator.exportToExcel();
    }

    /**
     * 转义HTML特殊字符
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.TeacherPanel = TeacherPanel;
}
