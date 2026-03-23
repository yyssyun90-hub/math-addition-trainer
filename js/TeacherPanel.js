/**
 * ==================== 糖果数学消消乐 - 教师面板控制器 ====================
 * 版本: 3.0.4 (匹配现有HTML元素)
 * 功能：从Supabase读取数据并显示在教师面板，支持教师和管理员不同视图
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
        this.currentUserRole = null;
        this.currentUserSchoolId = null;
        this.currentUserSchoolName = null;
        
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
     * 获取当前用户角色和学校
     */
    async getUserRoleAndSchool() {
        if (!this.game.auth || !this.game.state.currentUser) {
            return { role: 'student', schoolId: null, schoolName: null };
        }

        try {
            const userId = this.game.state.currentUser.id;
            
            // 先查 admins 表
            const { data: admin, error: adminError } = await this.supabase
                .from('admins')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
            
            if (!adminError && admin) {
                this.currentUserRole = 'admin';
                return { role: 'admin', schoolId: null, schoolName: null };
            }
            
            // 再查 teachers 表
            const { data: teacher, error: teacherError } = await this.supabase
                .from('teachers')
                .select('school_id, school')
                .eq('user_id', userId)
                .maybeSingle();
            
            if (!teacherError && teacher) {
                this.currentUserRole = 'teacher';
                this.currentUserSchoolId = teacher.school_id;
                this.currentUserSchoolName = teacher.school;
                return { 
                    role: 'teacher', 
                    schoolId: teacher.school_id, 
                    schoolName: teacher.school 
                };
            }
            
            this.currentUserRole = 'student';
            return { role: 'student', schoolId: null, schoolName: null };
            
        } catch (error) {
            console.error('获取用户角色失败:', error);
            return { role: 'student', schoolId: null, schoolName: null };
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

        // 点击背景关闭教师面板
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
    async openPanel(e) {
        e?.preventDefault();
        
        if (!this.game.auth || !this.game.auth.isLoggedIn()) {
            alert('请先登录');
            if (this.game.auth) {
                this.game.auth.showAuthModal('login');
            }
            return;
        }

        // 获取用户角色
        const userInfo = await this.getUserRoleAndSchool();
        
        // 检查权限：只有教师或管理员可以访问
        if (userInfo.role !== 'teacher' && userInfo.role !== 'admin') {
            alert('只有教师或管理员可以访问此面板');
            return;
        }

        const modal = document.getElementById('teacher-modal');
        if (modal) {
            modal.style.display = 'flex';
            
            // 根据角色显示/隐藏管理员标签页
            const adminTab = document.getElementById('admin-tab-btn');
            if (adminTab) {
                adminTab.style.display = userInfo.role === 'admin' ? 'inline-block' : 'none';
            }
            
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
            case 'admin':
                this.refreshAdminDashboard();
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
        if (this.currentUserRole === 'admin') {
            this.refreshAdminDashboard();
        }
    }

    /**
     * 刷新学生列表
     */
    async refreshStudentList() {
        const list = document.getElementById('student-list');
        if (!list) return;

        try {
            list.innerHTML = '<div style="text-align: center; padding: 20px;">⏳ 加载中...</div>';

            const userInfo = await this.getUserRoleAndSchool();
            let students = [];

            if (this.supabase && navigator.onLine) {
                let query = this.supabase
                    .from('students')
                    .select('student_id, name, class, school');
                
                // 教师只能看到自己学校的学生
                if (userInfo.role === 'teacher' && userInfo.schoolId) {
                    query = query.eq('school_id', userInfo.schoolId);
                }
                
                const { data, error } = await query.order('created_at', { ascending: false });
                
                if (!error && data) {
                    students = data;
                }
            }

            if (students.length === 0) {
                list.innerHTML = '<div style="text-align: center; color: #b2869c; padding: 20px;">📭 暂无学生数据</div>';
                return;
            }

            let html = '<div style="margin-bottom: 10px; display: flex; justify-content: space-between;">';
            html += `<span>👥 共 ${students.length} 名学生</span>`;
            html += `<span id="sync-status" style="color: ${navigator.onLine ? '#28a745' : '#dc3545'};">${navigator.onLine ? '🟢 在线' : '🔴 离线'}</span>`;
            html += '</div>';

            students.forEach(student => {
                html += `
                    <div class="student-list-item" data-student-id="${this.escapeHtml(student.student_id || '')}" style="cursor: pointer;">
                        <div class="student-info">
                            <h4>${this.escapeHtml(student.name || '未知')}</h4>
                            <p>学号: ${this.escapeHtml(student.student_id || '-')} · 班级: ${this.escapeHtml(student.class || '未分配')}</p>
                            <p style="font-size: 0.8rem; color: #999;">学校: ${this.escapeHtml(student.school || '-')}</p>
                        </div>
                        <div class="student-stats">
                            <div class="student-accuracy">📚</div>
                            <div class="student-questions">点击查看详情</div>
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
     * 刷新管理员仪表盘（全校数据）
     */
    async refreshAdminDashboard() {
        const adminTab = document.getElementById('admin-tab');
        if (!adminTab) return;

        try {
            adminTab.innerHTML = '<div style="text-align: center; padding: 20px;">⏳ 加载全校数据...</div>';

            // 获取所有学校
            const { data: schools, error: schoolsError } = await this.supabase
                .from('schools')
                .select('*')
                .order('school_name');
            
            if (schoolsError) throw schoolsError;
            
            if (!schools || schools.length === 0) {
                adminTab.innerHTML = '<div style="text-align: center; color: #b2869c; padding: 20px;">📭 暂无学校数据</div>';
                return;
            }
            
            // 获取每个学校的统计数据
            let totalStudents = 0;
            let totalTeachers = 0;
            let totalClasses = 0;
            const schoolStats = [];
            
            for (const school of schools) {
                // 获取学生数量
                const { count: studentCount } = await this.supabase
                    .from('students')
                    .select('*', { count: 'exact', head: true })
                    .eq('school_id', school.id);
                
                // 获取教师数量
                const { count: teacherCount } = await this.supabase
                    .from('teachers')
                    .select('*', { count: 'exact', head: true })
                    .eq('school_id', school.id);
                
                // 获取班级数量
                const { count: classCount } = await this.supabase
                    .from('classes')
                    .select('*', { count: 'exact', head: true })
                    .eq('school_id', school.id);
                
                const sCount = studentCount || 0;
                const tCount = teacherCount || 0;
                const cCount = classCount || 0;
                
                totalStudents += sCount;
                totalTeachers += tCount;
                totalClasses += cCount;
                
                schoolStats.push({
                    ...school,
                    student_count: sCount,
                    teacher_count: tCount,
                    class_count: cCount
                });
            }
            
            let html = `
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 20px; padding: 20px; margin-bottom: 20px; color: white;">
                    <h3 style="margin-bottom: 15px;">📊 全国统计</h3>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; text-align: center;">
                        <div>
                            <div style="font-size: 2rem; font-weight: bold;">${schools.length}</div>
                            <div style="font-size: 0.9rem;">学校数量</div>
                        </div>
                        <div>
                            <div style="font-size: 2rem; font-weight: bold;">${totalStudents}</div>
                            <div style="font-size: 0.9rem;">学生总数</div>
                        </div>
                        <div>
                            <div style="font-size: 2rem; font-weight: bold;">${totalTeachers}</div>
                            <div style="font-size: 0.9rem;">教师总数</div>
                        </div>
                        <div>
                            <div style="font-size: 2rem; font-weight: bold;">${totalClasses}</div>
                            <div style="font-size: 0.9rem;">班级总数</div>
                        </div>
                    </div>
                </div>
            `;
            
            // 学校列表
            html += `<h3 style="color: #d46b8d; margin: 20px 0 15px;">🏫 学校列表</h3>`;
            
            for (const school of schoolStats) {
                html += `
                    <div style="background: #f8f9fa; border-radius: 15px; padding: 15px; margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                            <div>
                                <h4 style="color: #d46b8d;">${this.escapeHtml(school.school_name)}</h4>
                                <div style="font-size: 0.85rem; color: #666;">州属: ${this.escapeHtml(school.state)}</div>
                                <div style="font-size: 0.8rem; color: #999; margin-top: 5px;">
                                    教师: ${school.teacher_count}人 · 学生: ${school.student_count}人 · 班级: ${school.class_count}个
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            adminTab.innerHTML = html;
            
        } catch (error) {
            console.error('刷新管理员仪表盘失败:', error);
            adminTab.innerHTML = '<div style="text-align: center; color: #ff4444; padding: 20px;">❌ 加载失败</div>';
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

            const userInfo = await this.getUserRoleAndSchool();
            
            // 获取班级列表
            let query = this.supabase
                .from('classes')
                .select('id, class_name, class_code');
            
            if (userInfo.role === 'teacher' && userInfo.schoolId) {
                query = query.eq('school_id', userInfo.schoolId);
            }
            
            const { data: classes, error } = await query;
            
            if (error) throw error;
            
            if (!classes || classes.length === 0) {
                statsDiv.innerHTML = '<div style="text-align: center; color: #b2869c; padding: 20px;">📭 暂无班级数据</div>';
                return;
            }
            
            let html = `<div style="margin-bottom: 15px;">
                <h3 style="color: #d46b8d;">📚 班级列表</h3>
            </div>`;
            
            for (const cls of classes) {
                // 获取班级学生数量
                const { count: studentCount, error: countError } = await this.supabase
                    .from('students')
                    .select('*', { count: 'exact', head: true })
                    .eq('class_id', cls.id);
                
                const studentNum = (countError || !studentCount) ? 0 : studentCount;
                
                html += `
                    <div style="background: #f8f9fa; border-radius: 15px; padding: 15px; margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                            <div>
                                <h4 style="color: #d46b8d;">${this.escapeHtml(cls.class_name)}</h4>
                                <div style="font-size: 0.85rem; color: #666;">
                                    班级代码: ${cls.class_code || '未生成'}<br>
                                    学生人数: ${studentNum} 人
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            statsDiv.innerHTML = html;
            
        } catch (error) {
            console.error('刷新班级统计失败:', error);
            statsDiv.innerHTML = '<div style="text-align: center; color: #ff4444; padding: 20px;">❌ 加载失败</div>';
        }
    }

    /**
     * 刷新报告选项
     */
    async refreshReportOptions() {
        const select = document.getElementById('report-student-select');
        if (!select) return;

        try {
            const userInfo = await this.getUserRoleAndSchool();
            let students = [];

            if (this.supabase && navigator.onLine) {
                let query = this.supabase
                    .from('students')
                    .select('student_id, name');
                
                if (userInfo.role === 'teacher' && userInfo.schoolId) {
                    query = query.eq('school_id', userInfo.schoolId);
                }
                
                const { data, error } = await query.order('name');
                
                if (!error && data) {
                    students = data;
                }
            }

            select.innerHTML = '<option value="all">📊 全班报告</option>';

            students.forEach(student => {
                const option = document.createElement('option');
                option.value = student.student_id;
                option.textContent = student.name || '未知';
                select.appendChild(option);
            });

        } catch (error) {
            console.error('刷新报告选项失败:', error);
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
            const { data: student, error } = await this.supabase
                .from('students')
                .select('*')
                .eq('student_id', studentId)
                .maybeSingle();
            
            if (error || !student) {
                alert('找不到该学生数据');
                return;
            }
            
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
                <div style="background: white; border-radius: 40px; padding: 30px; max-width: 450px; width: 90%;">
                    <h3 style="color: #d46b8d; margin-bottom: 20px;">${this.escapeHtml(student.name || '未知')} 详情</h3>
                    
                    <div style="margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                            <span style="color: #666;">学号:</span>
                            <span style="font-weight: bold;">${this.escapeHtml(student.student_id || '-')}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                            <span style="color: #666;">姓名:</span>
                            <span style="font-weight: bold;">${this.escapeHtml(student.name || '-')}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                            <span style="color: #666;">班级:</span>
                            <span style="font-weight: bold;">${this.escapeHtml(student.class || '未分配')}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                            <span style="color: #666;">学校:</span>
                            <span style="font-weight: bold;">${this.escapeHtml(student.school || '-')}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                            <span style="color: #666;">注册时间:</span>
                            <span style="font-weight: bold;">${student.created_at ? new Date(student.created_at).toLocaleDateString() : '-'}</span>
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
                        <button class="candy-btn primary" id="generate-student-pdf">📄 生成报告</button>
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
    async importStudents(e) {
        e?.preventDefault();
        
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,.txt';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const userInfo = await this.getUserRoleAndSchool();
                    if (userInfo.role !== 'teacher') {
                        alert('只有教师可以导入学生');
                        return;
                    }
                    
                    if (!userInfo.schoolId) {
                        alert('无法获取学校信息');
                        return;
                    }
                    
                    const lines = e.target.result.split('\n');
                    let imported = 0;
                    let errors = 0;
                    
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;
                        
                        const parts = trimmed.split(',').map(s => s.trim());
                        if (parts.length >= 2) {
                            const studentId = parts[0];
                            const studentName = parts[1];
                            const studentClass = parts[2] || null;
                            
                            // 检查是否已存在
                            const { data: existing } = await this.supabase
                                .from('students')
                                .select('student_id')
                                .eq('student_id', studentId)
                                .maybeSingle();
                            
                            if (existing) {
                                errors++;
                                continue;
                            }
                            
                            // 插入学生记录
                            const { error } = await this.supabase
                                .from('students')
                                .insert([{
                                    student_id: studentId,
                                    name: studentName,
                                    class: studentClass,
                                    school_id: userInfo.schoolId,
                                    school: userInfo.schoolName
                                }]);
                            
                            if (!error) {
                                imported++;
                            } else {
                                errors++;
                            }
                        }
                    }
                    
                    if (imported > 0) {
                        alert(`✅ 成功导入 ${imported} 名学生${errors > 0 ? `，${errors} 条失败` : ''}`);
                        this.refreshData();
                    } else {
                        alert('❌ 导入失败，请检查文件格式（CSV格式：学号,姓名,班级）');
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
        
        if (confirm('确定要清除所有学生记录吗？此操作不可恢复。')) {
            if (this.studentRecord.clearAllRecords()) {
                this.refreshData();
            }
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
