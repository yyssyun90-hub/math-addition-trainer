/**
 * ==================== 糖果数学消消乐 - 教师面板控制器 ====================
 * 版本: 2.0.1 (Supabase集成版 - 修复版)
 * 功能：从Supabase读取数据并显示在教师面板
 * ====================================================================
 */

class TeacherPanel {
    constructor(game) {
        this.game = game;
        this.studentRecord = game.studentRecord;
        this.reportGenerator = game.reportGenerator;
        this.currentTab = 'students';
        this.supabase = null;
        this.handlers = {};
        this.autoRefreshTimer = null;
        
        this.initSupabase();
        this.init();
    }

    /**
     * 初始化Supabase
     */
    initSupabase() {
        try {
            if (window.supabaseClient) {
                this.supabase = window.supabaseClient;
                console.log('✅ TeacherPanel: Supabase连接成功');
            } else {
                console.warn('⚠️ TeacherPanel: Supabase未连接，使用本地模式');
            }
        } catch (error) {
            console.error('❌ TeacherPanel: Supabase初始化失败', error);
        }
    }

    /**
     * 初始化教师面板
     */
    init() {
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

        // 同步数据按钮
        const syncBtn = document.getElementById('sync-data-btn');
        if (syncBtn) {
            syncBtn.addEventListener('click', (e) => this.syncData(e));
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

        // 监听网络状态变化
        window.addEventListener('online', () => this.handleNetworkChange());
        window.addEventListener('offline', () => this.handleNetworkChange());
    }

    /**
     * 处理网络变化
     */
    handleNetworkChange() {
        const statusEl = document.getElementById('sync-status');
        if (statusEl) {
            statusEl.textContent = navigator.onLine ? '🟢 在线' : '🔴 离线';
            statusEl.style.color = navigator.onLine ? '#28a745' : '#dc3545';
        }
    }

    /**
     * 打开教师面板
     */
    openPanel(e) {
        e?.preventDefault();
        
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
            this.handleNetworkChange();
            
            // 设置自动刷新（每30秒）
            if (this.autoRefreshTimer) {
                clearInterval(this.autoRefreshTimer);
            }
            this.autoRefreshTimer = setInterval(() => {
                if (modal.style.display === 'flex') {
                    this.refreshData();
                }
            }, 30000);
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
            if (this.autoRefreshTimer) {
                clearInterval(this.autoRefreshTimer);
            }
        }
    }

    /**
     * 切换标签页
     */
    switchTab(tabId) {
        if (!tabId) return;
        
        this.currentTab = tabId;

        document.querySelectorAll('[data-teacher-tab]').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.teacherTab === tabId);
        });

        document.querySelectorAll('.teacher-tab-content').forEach(content => {
            content.style.display = 'none';
        });

        const tabContent = document.getElementById(`${tabId}-tab`);
        if (tabContent) {
            tabContent.style.display = 'block';
        }

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
    async refreshStudentList() {
        const list = document.getElementById('student-list');
        if (!list) return;

        try {
            list.innerHTML = '<div style="text-align: center; padding: 20px;">⏳ 加载中...</div>';

            let students = [];

            // 优先从Supabase获取
            if (this.supabase && navigator.onLine) {
                const { data, error } = await this.supabase
                    .from('teacher_dashboard')
                    .select('*')
                    .order('last_active', { ascending: false });

                if (!error && data) {
                    students = data;
                }
            }

            // 如果Supabase没数据，从本地获取
            if (students.length === 0) {
                const classStats = await this.studentRecord.getClassStats();
                students = classStats.students || [];
            }

            if (students.length === 0) {
                list.innerHTML = '<div style="text-align: center; color: #b2869c; padding: 20px;">📭 暂无学生数据</div>';
                return;
            }

            let html = '<div style="margin-bottom: 10px; display: flex; justify-content: space-between;">';
            html += `<span>👥 共 ${students.length} 名学生</span>`;
            html += `<span id="sync-status" style="color: ${navigator.onLine ? '#28a745' : '#dc3545'};">${navigator.onLine ? '🟢 在线' : '🔴 离线'}</span>`;
            html += '</div>';

            // 按速度排序（快的在前面）
            students.sort((a, b) => {
                const timeA = a.avg_time || a.avgTime || 999;
                const timeB = b.avg_time || b.avgTime || 999;
                return timeA - timeB;
            }).forEach(student => {
                // 统一字段名
                const displayStudent = {
                    id: student.student_id || student.studentId || '',
                    name: student.name || student.studentName || '未知',
                    avgTime: student.avg_time || student.avgTime || 0,
                    accuracy: student.accuracy || 0,
                    totalQ: student.total_questions || student.totalQuestions || 0
                };
                
                html += `
                    <div class="student-list-item" data-student-id="${this.escapeHtml(displayStudent.id)}" style="cursor: pointer;">
                        <div class="student-info">
                            <h4>${this.escapeHtml(displayStudent.name)}</h4>
                            <p>ID: ${this.escapeHtml(displayStudent.id)} · 答题: ${displayStudent.totalQ}题</p>
                        </div>
                        <div class="student-stats">
                            <div class="student-accuracy" style="color: ${this.getSpeedColor(displayStudent.avgTime)}">${displayStudent.avgTime.toFixed(1)}s</div>
                            <div class="student-questions">正确率: ${displayStudent.accuracy.toFixed(1)}%</div>
                        </div>
                    </div>
                `;
            });

            list.innerHTML = html;

            // 添加点击事件
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
            list.innerHTML = '<div style="text-align: center; color: #ff4444; padding: 20px;">❌ 加载失败</div>';
        }
    }

    /**
     * 根据速度显示颜色
     */
    getSpeedColor(time) {
        if (time < 10) return '#28a745'; // 快 - 绿色
        if (time < 20) return '#ffc107'; // 中等 - 黄色
        return '#dc3545'; // 慢 - 红色
    }

    /**
     * 刷新报告选项
     */
    async refreshReportOptions() {
        const select = document.getElementById('report-student-select');
        if (!select) return;

        try {
            let students = [];

            if (this.supabase && navigator.onLine) {
                const { data, error } = await this.supabase
                    .from('teacher_dashboard')
                    .select('student_id, name, avg_time, accuracy')
                    .order('name');

                if (!error && data) {
                    students = data;
                }
            }

            if (students.length === 0) {
                const classStats = await this.studentRecord.getClassStats();
                students = classStats.students || [];
            }

            select.innerHTML = '<option value="all">📊 全班报告</option>';

            students.forEach(student => {
                const displayStudent = {
                    id: student.student_id || student.studentId,
                    name: student.name || student.studentName,
                    avgTime: student.avg_time || student.avgTime || 0,
                    accuracy: student.accuracy || 0
                };
                
                const option = document.createElement('option');
                option.value = displayStudent.id;
                option.textContent = `${displayStudent.name} (${displayStudent.avgTime.toFixed(1)}s, ${displayStudent.accuracy.toFixed(1)}%)`;
                select.appendChild(option);
            });

        } catch (error) {
            console.error('刷新报告选项失败:', error);
        }
    }

    /**
     * 刷新班级统计
     */
    async refreshClassStats() {
        const statsDiv = document.getElementById('class-stats');
        if (!statsDiv) return;

        try {
            statsDiv.innerHTML = '<div style="text-align: center; padding: 20px;">⏳ 加载中...</div>';

            let classStats = await this.studentRecord.getClassStats();

            if (!classStats || classStats.totalStudents === 0) {
                statsDiv.innerHTML = '<div style="text-align: center; color: #b2869c; padding: 20px;">📭 暂无统计数据</div>';
                return;
            }

            // 计算各速度段的学生人数
            const speedGroups = {
                fast: 0,   // <10秒
                medium: 0, // 10-20秒
                slow: 0    // >20秒
            };

            (classStats.students || []).forEach(s => {
                const time = s.avg_time || s.avgTime || 999;
                if (time < 10) speedGroups.fast++;
                else if (time < 20) speedGroups.medium++;
                else speedGroups.slow++;
            });

            let html = `
                <div style="background: #f8f9fa; border-radius: 15px; padding: 20px; margin-bottom: 15px;">
                    <h3 style="color: #d46b8d; margin-bottom: 15px;">📈 班级概况</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                        <div>
                            <div style="font-size: 0.9rem; color: #666;">学生人数</div>
                            <div style="font-size: 2rem; font-weight: bold; color: #d46b8d;">${classStats.totalStudents}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.9rem; color: #666;">总答题数</div>
                            <div style="font-size: 2rem; font-weight: bold; color: #d46b8d;">${classStats.totalQuestions || 0}</div>
                        </div>
                        <div>
                            <div style="font-size: 0.9rem; color: #666;">平均速度</div>
                            <div style="font-size: 2rem; font-weight: bold; color: #d46b8d;">${(classStats.avgClassTime || 0).toFixed(1)}s</div>
                        </div>
                        <div>
                            <div style="font-size: 0.9rem; color: #666;">平均正确率</div>
                            <div style="font-size: 2rem; font-weight: bold; color: #d46b8d;">${(classStats.avgClassAccuracy || 0).toFixed(1)}%</div>
                        </div>
                    </div>
                </div>

                <div style="background: #f8f9fa; border-radius: 15px; padding: 20px; margin-bottom: 15px;">
                    <h3 style="color: #d46b8d; margin-bottom: 15px;">⏱️ 速度分布</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; text-align: center;">
                        <div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #28a745;">${speedGroups.fast}</div>
                            <div style="font-size: 0.9rem; color: #666;">快 (&lt;10s)</div>
                        </div>
                        <div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #ffc107;">${speedGroups.medium}</div>
                            <div style="font-size: 0.9rem; color: #666;">中 (10-20s)</div>
                        </div>
                        <div>
                            <div style="font-size: 1.5rem; font-weight: bold; color: #dc3545;">${speedGroups.slow}</div>
                            <div style="font-size: 0.9rem; color: #666;">慢 (&gt;20s)</div>
                        </div>
                    </div>
                </div>
            `;

            // 速度最快的5个学生
            const topFast = [...(classStats.students || [])]
                .map(s => ({
                    name: s.name || s.studentName,
                    avgTime: s.avg_time || s.avgTime || 999
                }))
                .filter(s => s.avgTime > 0)
                .sort((a, b) => a.avgTime - b.avgTime)
                .slice(0, 5);

            if (topFast.length > 0) {
                html += `
                    <div style="background: #f8f9fa; border-radius: 15px; padding: 20px;">
                        <h3 style="color: #d46b8d; margin-bottom: 15px;">⚡ 速度最快 (Top 5)</h3>
                `;

                topFast.forEach((student, index) => {
                    html += `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee;">
                            <span>${index + 1}. ${this.escapeHtml(student.name || '未知')}</span>
                            <span style="font-weight: bold; color: #28a745;">${student.avgTime.toFixed(1)}s</span>
                        </div>
                    `;
                });

                html += '</div>';
            }

            statsDiv.innerHTML = html;

        } catch (error) {
            console.error('刷新班级统计失败:', error);
            statsDiv.innerHTML = '<div style="text-align: center; color: #ff4444; padding: 20px;">❌ 加载失败</div>';
        }
    }

    /**
     * 同步数据按钮
     */
    async syncData(e) {
        e?.preventDefault();

        if (!this.supabase || !navigator.onLine) {
            alert('网络离线，无法同步');
            return;
        }

        const syncBtn = document.getElementById('sync-data-btn');
        const originalText = syncBtn.textContent;
        syncBtn.textContent = '⏳ 同步中...';
        syncBtn.disabled = true;

        try {
            await this.studentRecord.processOfflineQueue();
            await this.refreshData();
            alert('✅ 数据同步完成');
        } catch (error) {
            console.error('同步失败:', error);
            alert('❌ 同步失败: ' + error.message);
        } finally {
            syncBtn.textContent = originalText;
            syncBtn.disabled = false;
        }
    }

    /**
     * 显示学生详情
     */
    async showStudentDetail(studentId) {
        try {
            const stats = await this.studentRecord.getStudentStats(studentId);
            if (!stats) {
                alert('找不到该学生数据');
                return;
            }

            // 获取速度趋势
            const trend = await this.studentRecord.getSpeedTrend(studentId);

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

            let trendHtml = '';
            if (trend.length > 0) {
                trendHtml = '<div style="margin: 15px 0;"><strong>速度趋势:</strong><br>';
                trend.slice(-7).forEach(day => {
                    trendHtml += `📅 ${day.date}: ${day.avgTime}s<br>`;
                });
                trendHtml += '</div>';
            }

            const detailHtml = `
                <div style="background: white; border-radius: 40px; padding: 30px; max-width: 450px; width: 90%;">
                    <h3 style="color: #d46b8d; margin-bottom: 20px;">${this.escapeHtml(stats.studentName || stats.name)} 详情</h3>
                    
                    <div style="margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                            <span style="color: #666;">学生ID:</span>
                            <span style="font-weight: bold;">${this.escapeHtml(studentId)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                            <span style="color: #666;">平均速度:</span>
                            <span style="font-weight: bold; color: ${this.getSpeedColor(stats.avgTime || 0)};">${(stats.avgTime || 0).toFixed(1)}秒/题</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                            <span style="color: #666;">正确率:</span>
                            <span style="font-weight: bold; color: #d46b8d;">${(stats.accuracy || 0).toFixed(1)}%</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                            <span style="color: #666;">总答题数:</span>
                            <span style="font-weight: bold;">${stats.totalQuestions || 0}题</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                            <span style="color: #666;">练习次数:</span>
                            <span style="font-weight: bold;">${stats.totalSessions || 0}次</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                            <span style="color: #666;">最后活动:</span>
                            <span style="font-weight: bold;">${stats.lastActive ? new Date(stats.lastActive).toLocaleString() : '无'}</span>
                        </div>
                    </div>

                    ${trendHtml}

                    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px; flex-wrap: wrap;">
                        <button class="candy-btn primary" id="generate-student-pdf">📄 生成报告</button>
                        <button class="candy-btn secondary" id="export-student-excel">📊 导出Excel</button>
                        <button class="candy-btn home" id="close-detail">关闭</button>
                    </div>
                </div>
            `;

            detailDiv.innerHTML = detailHtml;
            document.body.appendChild(detailDiv);

            document.getElementById('generate-student-pdf')?.addEventListener('click', () => {
                this.reportGenerator.generateStudentReport(studentId);
                detailDiv.remove();
            });

            document.getElementById('export-student-excel')?.addEventListener('click', () => {
                this.exportStudentExcel(studentId);
                detailDiv.remove();
            });

            document.getElementById('close-detail')?.addEventListener('click', () => {
                detailDiv.remove();
            });

            detailDiv.addEventListener('click', (e) => {
                if (e.target === detailDiv) {
                    detailDiv.remove();
                }
            });

        } catch (error) {
            console.error('显示学生详情失败:', error);
            alert('加载失败: ' + error.message);
        }
    }

    /**
     * 导出单个学生Excel
     */
    async exportStudentExcel(studentId) {
        if (!this.supabase || !navigator.onLine) {
            alert('需要网络连接才能导出');
            return;
        }

        try {
            const { data, error } = await this.supabase
                .from('question_responses')
                .select('*')
                .eq('student_id', studentId)
                .order('timestamp');

            if (error) throw error;

            if (!data || data.length === 0) {
                alert('没有数据可导出');
                return;
            }

            const wsData = [
                ['学生ID', '题目', '数字1', '数字2', '是否正确', '用时(秒)', '时间戳']
            ];

            data.forEach(q => {
                wsData.push([
                    q.student_id,
                    `${q.num1}+${q.num2}=${q.target_number}`,
                    q.num1,
                    q.num2,
                    q.is_correct ? '✓' : '✗',
                    q.response_time,
                    new Date(q.timestamp).toLocaleString()
                ]);
            });

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            XLSX.utils.book_append_sheet(wb, ws, '答题记录');
            XLSX.writeFile(wb, `student_${studentId}_data.xlsx`);

        } catch (error) {
            console.error('导出失败:', error);
            alert('导出失败: ' + error.message);
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
                        alert(`✅ 成功导入 ${imported} 名学生`);
                        this.refreshData();
                    } else {
                        alert('❌ 导入失败，请检查文件格式（CSV格式：学号,姓名）');
                    }
                } catch (error) {
                    console.error('导入学生失败:', error);
                    alert('❌ 导入失败：' + error.message);
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
