/**
 * ==================== 糖果数学消消乐 - 教师面板控制器 ====================
 * 版本: 3.2.0 (完整翻译版 - 所有文本均已支持 I18n)
 * 功能：从Supabase读取数据并显示在教师面板，支持教师和管理员不同视图
 * 修改记录：
 * 2024-04-14 - 完整国际化，所有硬编码文本均替换为 I18n.t()
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
            
            const { data: admin, error: adminError } = await this.supabase
                .from('admins')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
            
            if (!adminError && admin) {
                this.currentUserRole = 'admin';
                return { role: 'admin', schoolId: null, schoolName: null };
            }
            
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
     * 获取用户学校信息
     */
    async getUserSchoolInfo() {
        const userInfo = await this.getUserRoleAndSchool();
        if (userInfo.role !== 'teacher' || !userInfo.schoolId) {
            return null;
        }
        
        try {
            const { data: school, error } = await this.supabase
                .from('schools')
                .select('*')
                .eq('id', userInfo.schoolId)
                .maybeSingle();
            
            if (error || !school) {
                return null;
            }
            
            return school;
        } catch (error) {
            console.error('获取学校信息失败:', error);
            return null;
        }
    }

    /**
     * 清理文件名
     */
    sanitizeFilename(filename) {
        return filename.replace(/[\\/:*?"<>|]/g, '_').substring(0, 50);
    }

    /**
     * 生成唯一学号
     */
    async generateUniqueStudentId(schoolCode, className, retryCount = 0) {
        const year = new Date().getFullYear();
        const classShort = className ? className.replace(/[^0-9A-Z]/gi, '') : 'XXX';
        const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const studentId = `${schoolCode}_${year}_${classShort}_${randomNum}`;
        
        const { data: existing } = await this.supabase
            .from('students')
            .select('student_id')
            .eq('student_id', studentId)
            .maybeSingle();
        
        if (existing && retryCount < 5) {
            return this.generateUniqueStudentId(schoolCode, className, retryCount + 1);
        }
        
        return studentId;
    }

    /**
     * 生成唯一班级代码
     */
    async generateUniqueClassCode(schoolCode, stateCode, className, retryCount = 0) {
        const randomCode = Math.random().toString(36).substring(2, 10).toUpperCase();
        const classCode = `${stateCode}_${schoolCode}_${className.replace(/[^a-zA-Z0-9]/g, '')}_${randomCode}`;
        
        const { data: existing } = await this.supabase
            .from('classes')
            .select('class_code')
            .eq('class_code', classCode)
            .maybeSingle();
        
        if (existing && retryCount < 5) {
            return this.generateUniqueClassCode(schoolCode, stateCode, className, retryCount + 1);
        }
        
        return classCode;
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        const teacherBtn = document.getElementById('teacher-panel-btn');
        if (teacherBtn) {
            teacherBtn.addEventListener('click', (e) => this.openPanel(e));
        }

        const closeBtn = document.getElementById('close-teacher');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => this.closePanel(e));
        }

        document.querySelectorAll('[data-teacher-tab]').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.teacherTab));
        });

        const downloadTemplateBtn = document.getElementById('download-template-btn');
        if (downloadTemplateBtn) {
            downloadTemplateBtn.addEventListener('click', (e) => this.downloadCSVTemplate(e));
        }

        const importBtn = document.getElementById('import-students');
        if (importBtn) {
            importBtn.addEventListener('click', (e) => this.importStudents(e));
        }

        const exportStudentsBtn = document.getElementById('export-students-btn');
        if (exportStudentsBtn) {
            exportStudentsBtn.addEventListener('click', (e) => this.exportStudentsToExcel(e));
        }

        const createClassBtn = document.getElementById('create-class-btn');
        if (createClassBtn) {
            createClassBtn.addEventListener('click', (e) => this.showCreateClassModal(e));
        }

        const confirmCreateClass = document.getElementById('confirm-create-class');
        if (confirmCreateClass) {
            confirmCreateClass.addEventListener('click', (e) => this.createClass(e));
        }

        const closeCreateClass = document.getElementById('close-create-class');
        if (closeCreateClass) {
            closeCreateClass.addEventListener('click', (e) => this.closeCreateClassModal(e));
        }

        const cancelCreateClass = document.getElementById('cancel-create-class');
        if (cancelCreateClass) {
            cancelCreateClass.addEventListener('click', (e) => this.closeCreateClassModal(e));
        }

        const clearBtn = document.getElementById('clear-all-records');
        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => this.clearAllRecords(e));
        }

        const pdfBtn = document.getElementById('generate-pdf');
        if (pdfBtn) {
            pdfBtn.addEventListener('click', (e) => this.generateReport(e));
        }

        const excelBtn = document.getElementById('export-excel');
        if (excelBtn) {
            excelBtn.addEventListener('click', (e) => this.exportExcel(e));
        }

        const syncBtn = document.getElementById('sync-data-btn');
        if (syncBtn) {
            syncBtn.addEventListener('click', (e) => this.syncData(e));
        }

        const modal = document.getElementById('teacher-modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closePanel(e);
                }
            });
        }

        const createClassModal = document.getElementById('create-class-modal');
        if (createClassModal) {
            createClassModal.addEventListener('click', (e) => {
                if (e.target === createClassModal) {
                    this.closeCreateClassModal(e);
                }
            });
        }

        window.addEventListener('online', () => this.handleNetworkChange());
        window.addEventListener('offline', () => this.handleNetworkChange());
    }

    /**
     * 处理网络变化
     */
    handleNetworkChange() {
        const statusEl = document.getElementById('sync-status');
        if (statusEl) {
            statusEl.textContent = navigator.onLine 
                ? `🟢 ${this.t('online', '在线')}` 
                : `🔴 ${this.t('offline', '离线')}`;
            statusEl.style.color = navigator.onLine ? '#28a745' : '#dc3545';
        }
    }

    /**
     * 打开教师面板
     */
    async openPanel(e) {
        e?.preventDefault();
        
        if (!this.game.auth || !this.game.auth.isLoggedIn()) {
            alert(this.t('loginRequired', '请先登录'));
            if (this.game.auth) {
                this.game.auth.showAuthModal('login');
            }
            return;
        }

        const userInfo = await this.getUserRoleAndSchool();
        
        if (userInfo.role !== 'teacher' && userInfo.role !== 'admin') {
            alert(this.t('teacherOnly', '只有教师或管理员可以访问此面板'));
            return;
        }

        const modal = document.getElementById('teacher-modal');
        if (modal) {
            modal.style.display = 'flex';
            
            const adminTab = document.getElementById('admin-tab-btn');
            if (adminTab) {
                adminTab.style.display = userInfo.role === 'admin' ? 'inline-block' : 'none';
            }
            
            if (userInfo.role === 'teacher') {
                const schoolInfo = await this.getUserSchoolInfo();
                if (schoolInfo) {
                    this.currentUserSchoolName = schoolInfo.school_name;
                }
            }
            
            this.refreshData();
            this.handleNetworkChange();
            
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
        this.refreshClassList();
        if (this.currentUserRole === 'admin') {
            this.refreshAdminDashboard();
        }
    }

    // ==================== CSV模板下载 ====================

    /**
     * 下载CSV模板文件
     */
    async downloadCSVTemplate(e) {
        e?.preventDefault();
        
        try {
            const headers = [this.t('studentId', '学号'), this.t('name', '姓名'), this.t('class', '班级')];
            const exampleRows = [
                ['S001', this.t('exampleName1', '陈小明'), '5A'],
                ['', this.t('exampleName2', '李小花'), '5A'],
                ['S003', this.t('exampleName3', '张伟强'), '5B'],
                ['', this.t('exampleName4', '王丽丽'), '5B'],
                ['S005', this.t('exampleName5', '刘志明'), '5A']
            ];
            
            let csvContent = headers.join(',') + '\n';
            exampleRows.forEach(row => {
                csvContent += row.join(',') + '\n';
            });
            
            csvContent = '# ' + (this.t('csvFormatHint', '格式说明：学号,姓名,班级')) + '\n' + csvContent;
            csvContent += '# \n';
            csvContent += '# ' + (this.t('csvNote1', '注意事项：')) + '\n';
            csvContent += '# 1. ' + (this.t('csvNote2', '学号：可选，如果不填系统会自动生成（格式：学校代码_学年_班级_序号）')) + '\n';
            csvContent += '# 2. ' + (this.t('csvNote3', '姓名：必填')) + '\n';
            csvContent += '# 3. ' + (this.t('csvNote4', '班级：可选，如果不填则学生没有班级')) + '\n';
            csvContent += '# 4. ' + (this.t('csvNote5', '如果班级不存在，系统会自动创建')) + '\n';
            csvContent += '# 5. ' + (this.t('csvNote6', '学号不能重复，重复的学号会被跳过')) + '\n';
            csvContent += '# 6. ' + (this.t('csvNote7', '示例数据仅供参考，导入前请删除')) + '\n';
            
            const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            
            link.setAttribute('href', url);
            link.setAttribute('download', `${this.t('studentImportTemplate', '学生导入模板')}_${new Date().toISOString().slice(0,10)}.csv`);
            link.style.display = 'none';
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            alert(`✅ ${this.t('templateDownloaded', 'CSV模板已下载，学号可留空，系统会自动生成')}`);
        } catch (error) {
            console.error('下载模板失败:', error);
            alert(`❌ ${this.t('downloadFailed', '下载失败，请重试')}`);
        }
    }

    // ==================== 班级管理功能 ====================

    showCreateClassModal(e) {
        e?.preventDefault();
        
        const modal = document.getElementById('create-class-modal');
        if (modal) {
            const classNameInput = document.getElementById('new-class-name');
            if (classNameInput) classNameInput.value = '';
            const errorDiv = document.getElementById('create-class-error');
            if (errorDiv) errorDiv.textContent = '';
            modal.style.display = 'flex';
        }
    }

    closeCreateClassModal(e) {
        e?.preventDefault();
        
        const modal = document.getElementById('create-class-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    async createClass(e) {
        e?.preventDefault();
        
        const className = document.getElementById('new-class-name')?.value.trim();
        const errorDiv = document.getElementById('create-class-error');
        
        if (!className) {
            if (errorDiv) {
                errorDiv.textContent = `❌ ${this.t('classNameRequired', '请输入班级名称')}`;
                errorDiv.style.color = '#ff4444';
            }
            return;
        }
        
        if (errorDiv) {
            errorDiv.textContent = `⏳ ${this.t('creating', '创建中...')}`;
            errorDiv.style.color = '#666';
        }
        
        try {
            const userInfo = await this.getUserRoleAndSchool();
            
            if (userInfo.role !== 'teacher') {
                throw new Error(this.t('teacherOnlyCreate', '只有教师可以创建班级'));
            }
            
            if (!userInfo.schoolId) {
                throw new Error(this.t('schoolInfoMissing', '无法获取学校信息，请确保您的教师账号已关联学校'));
            }
            
            const schoolInfo = await this.getUserSchoolInfo();
            
            const schoolCode = (schoolInfo?.school_name || 'SCH').substring(0, 4).toUpperCase().replace(/[^A-Z]/g, '');
            const stateCode = (schoolInfo?.state || 'MY').substring(0, 2).toUpperCase();
            const classCode = await this.generateUniqueClassCode(schoolCode, stateCode, className);
            
            const academicYear = new Date().getFullYear();
            
            const { data: newClass, error } = await this.supabase
                .from('classes')
                .insert([{
                    class_name: className,
                    school_id: userInfo.schoolId,
                    teacher_id: this.game.state.currentUser.id,
                    class_code: classCode,
                    academic_year: academicYear
                }])
                .select()
                .single();
            
            if (error) throw error;
            
            if (errorDiv) {
                errorDiv.textContent = `✅ ${this.t('classCreated', '班级创建成功！')}`;
                errorDiv.style.color = '#4CAF50';
            }
            
            setTimeout(() => {
                this.closeCreateClassModal();
                this.refreshClassList();
                this.refreshClassStats();
            }, 1500);
            
        } catch (error) {
            console.error('创建班级失败:', error);
            if (errorDiv) {
                errorDiv.textContent = `❌ ${error.message || this.t('createFailed', '创建失败')}`;
                errorDiv.style.color = '#ff4444';
            }
        }
    }

    async refreshClassList() {
        const classListDiv = document.getElementById('class-list');
        if (!classListDiv) return;

        try {
            const userInfo = await this.getUserRoleAndSchool();
            
            let query = this.supabase
                .from('classes')
                .select(`
                    id,
                    class_name,
                    class_code,
                    school_id,
                    teacher_id,
                    academic_year
                `);
            
            if (userInfo.role === 'teacher' && userInfo.schoolId) {
                query = query.eq('school_id', userInfo.schoolId);
            }
            
            const { data: classes, error } = await query.order('created_at', { ascending: false });
            
            if (error) throw error;
            
            if (!classes || classes.length === 0) {
                classListDiv.innerHTML = `<div style="text-align: center; color: #b2869c; padding: 20px;">📭 ${this.t('noClasses', '暂无班级，点击"创建班级"开始')}</div>`;
                return;
            }
            
            let html = '';
            for (const cls of classes) {
                const { count: studentCount } = await this.supabase
                    .from('students')
                    .select('*', { count: 'exact', head: true })
                    .eq('class_id', cls.id);
                
                const studentNum = studentCount || 0;
                
                html += `
                    <div class="class-item" data-class-id="${cls.id}" data-class-name="${this.escapeHtml(cls.class_name)}" style="background: #f8f9fa; border-radius: 15px; padding: 15px; margin-bottom: 10px; border-left: 4px solid #d46b8d;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                            <div>
                                <h4 style="color: #d46b8d; margin-bottom: 5px;">${this.escapeHtml(cls.class_name)}</h4>
                                <div style="font-size: 0.85rem; color: #666;">
                                    ${this.t('classCode', '班级代码')}: <code style="background: #fff; padding: 2px 6px; border-radius: 10px;">${cls.class_code || this.t('notGenerated', '未生成')}</code><br>
                                    ${this.t('studentCount', '学生人数')}: ${studentNum} ${this.t('studentsUnit', '人')}<br>
                                    ${this.t('academicYear', '学年')}: ${cls.academic_year}
                                </div>
                            </div>
                            <div style="margin-top: 10px;">
                                <button class="candy-btn small view-class-students" data-class-id="${cls.id}">📋 ${this.t('viewStudents', '查看学生')}</button>
                                ${cls.class_code ? `<button class="candy-btn small secondary copy-class-code" data-class-code="${cls.class_code}">📋 ${this.t('copyCode', '复制代码')}</button>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            }
            
            classListDiv.innerHTML = html;
            
            classListDiv.querySelectorAll('.view-class-students').forEach(btn => {
                btn.removeEventListener('click', this.handleViewClassStudents);
                this.handleViewClassStudents = (e) => {
                    const classId = btn.dataset.classId;
                    const className = btn.closest('.class-item')?.dataset.className || '';
                    this.showClassStudents(classId, className);
                };
                btn.addEventListener('click', this.handleViewClassStudents);
            });
            
            classListDiv.querySelectorAll('.copy-class-code').forEach(btn => {
                btn.removeEventListener('click', this.handleCopyClassCode);
                this.handleCopyClassCode = (e) => {
                    const classCode = btn.dataset.classCode;
                    this.copyClassCode(classCode);
                };
                btn.addEventListener('click', this.handleCopyClassCode);
            });
            
        } catch (error) {
            console.error('刷新班级列表失败:', error);
            classListDiv.innerHTML = `<div style="text-align: center; color: #ff4444; padding: 20px;">❌ ${this.t('loadFailed', '加载失败')}</div>`;
        }
    }

    async showClassStudents(classId, className) {
        try {
            const { data: students, error } = await this.supabase
                .from('students')
                .select('student_id, name, class')
                .eq('class_id', classId)
                .order('name');
            
            if (error) throw error;
            
            const classNoStudentsText = this.t('classNoStudents', '班级 "');
            const noStudentsText = this.t('noStudents', '" 暂无学生');
            
            if (!students || students.length === 0) {
                alert(`${classNoStudentsText}${className}${noStudentsText}`);
                return;
            }
            
            const classStudentListText = this.t('classStudentList', '班级 "');
            const studentListSuffixText = this.t('studentListSuffix', '学生列表');
            const noText = this.t('no', '序号');
            const studentIdText = this.t('studentId', '学号');
            const nameText = this.t('name', '姓名');
            const unknownText = this.t('unknown', '未知');
            const totalStudentsText = this.t('totalStudents', '共');
            const studentsUnitText = this.t('studentsUnit', '名学生');
            
            let message = `📋 ${classStudentListText}${className}" ${studentListSuffixText}:\n\n`;
            message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            message += `${noText} │ ${studentIdText} │ ${nameText}\n`;
            message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            
            students.forEach((s, index) => {
                const num = (index + 1).toString().padStart(3);
                const id = (s.student_id || '-').padEnd(12);
                const name = s.name || unknownText;
                message += `${num} │ ${id} │ ${name}\n`;
            });
            
            message += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
            message += `${totalStudentsText} ${students.length} ${studentsUnitText}`;
            
            alert(message);
            
        } catch (error) {
            console.error('获取班级学生失败:', error);
            alert(this.t('loadStudentsFailed', '获取学生列表失败'));
        }
    }

    copyClassCode(code) {
        if (!code) {
            alert(this.t('noClassCode', '没有班级代码'));
            return;
        }
        
        navigator.clipboard.writeText(code).then(() => {
            alert(`✅ ${this.t('codeCopied', '班级代码已复制')}`);
        }).catch(() => {
            alert(`❌ ${this.t('copyFailed', '复制失败，请手动复制')}`);
        });
    }

    // ==================== 学生管理功能 ====================

    async refreshStudentList() {
        const list = document.getElementById('student-list');
        if (!list) return;

        try {
            list.innerHTML = `<div style="text-align: center; padding: 20px;">⏳ ${this.t('loading', '加载中...')}</div>`;

            const userInfo = await this.getUserRoleAndSchool();
            let students = [];

            if (this.supabase && navigator.onLine) {
                let query = this.supabase
                    .from('students')
                    .select('student_id, name, class, school');
                
                if (userInfo.role === 'teacher' && userInfo.schoolId) {
                    query = query.eq('school_id', userInfo.schoolId);
                }
                
                const { data, error } = await query.order('created_at', { ascending: false });
                
                if (!error && data) {
                    students = data;
                }
            }

            if (students.length === 0) {
                list.innerHTML = `<div style="text-align: center; color: #b2869c; padding: 20px;">📭 ${this.t('noStudentData', '暂无学生数据')}</div>`;
                return;
            }

            let html = '<div style="margin-bottom: 10px; display: flex; justify-content: space-between;">';
            html += `<span>👥 ${this.t('totalStudents', '共')} ${students.length} ${this.t('studentsUnit', '名学生')}</span>`;
            html += `<span id="sync-status" style="color: ${navigator.onLine ? '#28a745' : '#dc3545'};">${navigator.onLine ? '🟢 ' + this.t('online', '在线') : '🔴 ' + this.t('offline', '离线')}</span>`;
            html += '</div>';

            const unknownText = this.t('unknown', '未知');
            const studentIdText = this.t('studentId', '学号');
            const classText = this.t('class', '班级');
            const unassignedText = this.t('unassigned', '未分配');
            const schoolText = this.t('school', '学校');
            const clickForDetailText = this.t('clickForDetail', '点击查看详情');

            students.forEach(student => {
                html += `
                    <div class="student-list-item" data-student-id="${this.escapeHtml(student.student_id || '')}" style="cursor: pointer;">
                        <div class="student-info">
                            <h4>${this.escapeHtml(student.name || unknownText)}</h4>
                            <p>${studentIdText}: ${this.escapeHtml(student.student_id || '-')} · ${classText}: ${this.escapeHtml(student.class || unassignedText)}</p>
                            <p style="font-size: 0.8rem; color: #999;">${schoolText}: ${this.escapeHtml(student.school || '-')}</p>
                        </div>
                        <div class="student-stats">
                            <div class="student-accuracy">📚</div>
                            <div class="student-questions">${clickForDetailText}</div>
                        </div>
                    </div>
                `;
            });

            list.innerHTML = html;

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
            list.innerHTML = `<div style="text-align: center; color: #ff4444; padding: 20px;">❌ ${this.t('loadFailed', '加载失败')}</div>`;
        }
    }

    // ==================== 第 1 部分结束 ====================
    // ==================== 第 2 部分 / 共 2 部分 ====================

    /**
     * 导入学生 (CSV) - 支持自动生成学号
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
                        alert(this.t('teacherOnlyImport', '只有教师可以导入学生'));
                        return;
                    }
                    
                    if (!userInfo.schoolId) {
                        alert(this.t('schoolInfoMissing', '无法获取学校信息'));
                        return;
                    }
                    
                    const schoolInfo = await this.getUserSchoolInfo();
                    const schoolCode = (schoolInfo?.school_name || 'SCH').substring(0, 4).toUpperCase().replace(/[^A-Z]/g, '');
                    const stateCode = (schoolInfo?.state || 'MY').substring(0, 2).toUpperCase();
                    const year = new Date().getFullYear();
                    
                    const lines = e.target.result.split('\n');
                    let imported = 0;
                    let errors = 0;
                    let skipped = 0;
                    
                    const studentIdHeader = this.t('studentId', '学号');
                    
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed) continue;
                        
                        if (trimmed.startsWith('#')) continue;
                        if (trimmed.startsWith(studentIdHeader)) continue;
                        
                        const parts = trimmed.split(',').map(s => s.trim());
                        if (parts.length >= 2) {
                            let studentId = parts[0];
                            const studentName = parts[1];
                            const studentClass = parts[2] || null;
                            
                            if (!studentId || studentId === '') {
                                studentId = await this.generateUniqueStudentId(schoolCode, studentClass);
                            }
                            
                            const { data: existing } = await this.supabase
                                .from('students')
                                .select('student_id')
                                .eq('student_id', studentId)
                                .maybeSingle();
                            
                            if (existing) {
                                skipped++;
                                continue;
                            }
                            
                            let classId = null;
                            if (studentClass) {
                                const { data: existingClass } = await this.supabase
                                    .from('classes')
                                    .select('id')
                                    .eq('school_id', userInfo.schoolId)
                                    .eq('class_name', studentClass)
                                    .maybeSingle();
                                
                                if (existingClass) {
                                    classId = existingClass.id;
                                } else {
                                    const classCode = await this.generateUniqueClassCode(schoolCode, stateCode, studentClass);
                                    
                                    const { data: newClass, error: classError } = await this.supabase
                                        .from('classes')
                                        .insert([{
                                            class_name: studentClass,
                                            school_id: userInfo.schoolId,
                                            class_code: classCode,
                                            academic_year: year
                                        }])
                                        .select()
                                        .single();
                                    
                                    if (!classError && newClass) {
                                        classId = newClass.id;
                                    }
                                }
                            }
                            
                            const { error } = await this.supabase
                                .from('students')
                                .insert([{
                                    student_id: studentId,
                                    name: studentName,
                                    class: studentClass,
                                    school_id: userInfo.schoolId,
                                    school: userInfo.schoolName,
                                    class_id: classId
                                }]);
                            
                            if (!error) {
                                imported++;
                            } else {
                                errors++;
                                console.error('导入错误:', error);
                            }
                        }
                    }
                    
                    let message = `✅ ${this.t('importSuccess', '成功导入')} ${imported} ${this.t('studentsUnit', '名学生')}`;
                    if (skipped > 0) message += `，${skipped} ${this.t('duplicateSkipped', '条重复跳过')}`;
                    if (errors > 0) message += `，${errors} ${this.t('failedCount', '条失败')}`;
                    alert(message);
                    this.refreshData();
                    
                } catch (error) {
                    console.error('导入学生失败:', error);
                    alert(`❌ ${this.t('importFailed', '导入失败')}：${error.message}`);
                }
            };
            reader.readAsText(file);
        };

        input.click();
    }

    /**
     * 导出学生到Excel
     */
    async exportStudentsToExcel(e) {
        e?.preventDefault();
        
        if (!this.supabase || !navigator.onLine) {
            alert(this.t('networkRequired', '需要网络连接才能导出'));
            return;
        }
        
        try {
            const userInfo = await this.getUserRoleAndSchool();
            
            let query = this.supabase
                .from('students')
                .select('student_id, name, class, school, created_at');
            
            if (userInfo.role === 'teacher' && userInfo.schoolId) {
                query = query.eq('school_id', userInfo.schoolId);
            }
            
            const { data: students, error } = await query.order('created_at', { ascending: false });
            
            if (error) throw error;
            
            if (!students || students.length === 0) {
                alert(this.t('noDataToExport', '没有学生数据可导出'));
                return;
            }
            
            const wsData = [
                [this.t('studentId', '学号'), this.t('name', '姓名'), this.t('class', '班级'), this.t('school', '学校'), this.t('registerDate', '注册日期')]
            ];
            
            students.forEach(s => {
                wsData.push([
                    s.student_id || '-',
                    s.name || '-',
                    s.class || '-',
                    s.school || '-',
                    s.created_at ? new Date(s.created_at).toLocaleDateString() : '-'
                ]);
            });
            
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.aoa_to_sheet(wsData);
            
            ws['!cols'] = [{wch:15}, {wch:12}, {wch:10}, {wch:20}, {wch:12}];
            
            XLSX.utils.book_append_sheet(wb, ws, this.t('studentList', '学生列表'));
            
            const fileName = userInfo.role === 'admin' 
                ? `${this.t('allSchoolData', '全校学生数据')}_${new Date().toISOString().slice(0,10)}.xlsx`
                : `${this.sanitizeFilename(userInfo.schoolName || this.t('school', '学校'))}_${this.t('studentData', '学生数据')}_${new Date().toISOString().slice(0,10)}.xlsx`;
            
            XLSX.writeFile(wb, fileName);
            
            alert(`✅ ${this.t('exportSuccess', '成功导出')} ${students.length} ${this.t('studentsUnit', '名学生')}`);
            
        } catch (error) {
            console.error('导出学生失败:', error);
            alert(`❌ ${this.t('exportFailed', '导出失败')}: ${error.message}`);
        }
    }

    /**
     * 刷新班级统计
     */
    async refreshClassStats() {
        const statsDiv = document.getElementById('class-stats');
        if (!statsDiv) return;

        try {
            statsDiv.innerHTML = `<div style="text-align: center; padding: 20px;">⏳ ${this.t('loading', '加载中...')}</div>`;

            const userInfo = await this.getUserRoleAndSchool();
            
            let query = this.supabase
                .from('classes')
                .select('id, class_name, class_code');
            
            if (userInfo.role === 'teacher' && userInfo.schoolId) {
                query = query.eq('school_id', userInfo.schoolId);
            }
            
            const { data: classes, error } = await query;
            
            if (error) throw error;
            
            if (!classes || classes.length === 0) {
                statsDiv.innerHTML = `<div style="text-align: center; color: #b2869c; padding: 20px;">📭 ${this.t('noClassData', '暂无班级数据')}</div>`;
                return;
            }
            
            let html = `<div style="margin-bottom: 15px;">
                <h3 style="color: #d46b8d;">📚 ${this.t('classList', '班级列表')}</h3>
            </div>`;
            
            const classCodeText = this.t('classCode', '班级代码');
            const notGeneratedText = this.t('notGenerated', '未生成');
            const studentCountText = this.t('studentCount', '学生人数');
            const studentsUnitText = this.t('studentsUnit', '人');
            const viewStudentsText = this.t('viewStudents', '查看学生');
            
            for (const cls of classes) {
                const { count: studentCount } = await this.supabase
                    .from('students')
                    .select('*', { count: 'exact', head: true })
                    .eq('class_id', cls.id);
                
                const studentNum = studentCount || 0;
                
                html += `
                    <div class="class-stat-item" data-class-id="${cls.id}" data-class-name="${this.escapeHtml(cls.class_name)}" style="background: #f8f9fa; border-radius: 15px; padding: 15px; margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                            <div>
                                <h4 style="color: #d46b8d;">${this.escapeHtml(cls.class_name)}</h4>
                                <div style="font-size: 0.85rem; color: #666;">
                                    ${classCodeText}: ${cls.class_code || notGeneratedText}<br>
                                    ${studentCountText}: ${studentNum} ${studentsUnitText}
                                </div>
                            </div>
                            <div style="margin-top: 8px;">
                                <button class="candy-btn small view-class-students-stat" data-class-id="${cls.id}">📋 ${viewStudentsText}</button>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            statsDiv.innerHTML = html;
            
            statsDiv.querySelectorAll('.view-class-students-stat').forEach(btn => {
                btn.removeEventListener('click', this.handleViewClassStudentsStat);
                this.handleViewClassStudentsStat = (e) => {
                    const classId = btn.dataset.classId;
                    const className = btn.closest('.class-stat-item')?.dataset.className || '';
                    this.showClassStudents(classId, className);
                };
                btn.addEventListener('click', this.handleViewClassStudentsStat);
            });
            
        } catch (error) {
            console.error('刷新班级统计失败:', error);
            statsDiv.innerHTML = `<div style="text-align: center; color: #ff4444; padding: 20px;">❌ ${this.t('loadFailed', '加载失败')}</div>`;
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

            select.innerHTML = `<option value="all">📊 ${this.t('classReport', '全班报告')}</option>`;

            const unknownText = this.t('unknown', '未知');
            
            students.forEach(student => {
                const option = document.createElement('option');
                option.value = student.student_id;
                option.textContent = student.name || unknownText;
                select.appendChild(option);
            });

        } catch (error) {
            console.error('刷新报告选项失败:', error);
        }
    }

    /**
     * 刷新管理员仪表盘（全校数据）
     */
    async refreshAdminDashboard() {
        const adminTab = document.getElementById('admin-tab');
        if (!adminTab) return;

        try {
            adminTab.innerHTML = `<div style="text-align: center; padding: 20px;">⏳ ${this.t('loadingSchoolData', '加载全校数据...')}</div>`;

            const { data: schools, error: schoolsError } = await this.supabase
                .from('schools')
                .select('*')
                .order('school_name');
            
            if (schoolsError) throw schoolsError;
            
            if (!schools || schools.length === 0) {
                adminTab.innerHTML = `<div style="text-align: center; color: #b2869c; padding: 20px;">📭 ${this.t('noSchoolData', '暂无学校数据')}</div>`;
                return;
            }
            
            let totalStudents = 0;
            let totalTeachers = 0;
            let totalClasses = 0;
            const schoolStats = [];
            
            for (const school of schools) {
                const { count: studentCount } = await this.supabase
                    .from('students')
                    .select('*', { count: 'exact', head: true })
                    .eq('school_id', school.id);
                
                const { count: teacherCount } = await this.supabase
                    .from('teachers')
                    .select('*', { count: 'exact', head: true })
                    .eq('school_id', school.id);
                
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
            
            const nationalStatsText = this.t('nationalStats', '全国统计');
            const schoolCountText = this.t('schoolCount', '学校数量');
            const totalStudentsText = this.t('totalStudents', '学生总数');
            const totalTeachersText = this.t('totalTeachers', '教师总数');
            const totalClassesText = this.t('totalClasses', '班级总数');
            const schoolListText = this.t('schoolList', '学校列表');
            const stateText = this.t('state', '州属');
            const teachersText = this.t('teachers', '教师');
            const studentsText = this.t('students', '学生');
            const classesText = this.t('classes', '班级');
            const teachersUnitText = this.t('teachersUnit', '人');
            const classesUnitText = this.t('classesUnit', '个');
            
            let html = `
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 20px; padding: 20px; margin-bottom: 20px; color: white;">
                    <h3 style="margin-bottom: 15px;">📊 ${nationalStatsText}</h3>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; text-align: center;">
                        <div>
                            <div style="font-size: 2rem; font-weight: bold;">${schools.length}</div>
                            <div style="font-size: 0.9rem;">${schoolCountText}</div>
                        </div>
                        <div>
                            <div style="font-size: 2rem; font-weight: bold;">${totalStudents}</div>
                            <div style="font-size: 0.9rem;">${totalStudentsText}</div>
                        </div>
                        <div>
                            <div style="font-size: 2rem; font-weight: bold;">${totalTeachers}</div>
                            <div style="font-size: 0.9rem;">${totalTeachersText}</div>
                        </div>
                        <div>
                            <div style="font-size: 2rem; font-weight: bold;">${totalClasses}</div>
                            <div style="font-size: 0.9rem;">${totalClassesText}</div>
                        </div>
                    </div>
                </div>
            `;
            
            html += `<h3 style="color: #d46b8d; margin: 20px 0 15px;">🏫 ${schoolListText}</h3>`;
            
            for (const school of schoolStats) {
                html += `
                    <div style="background: #f8f9fa; border-radius: 15px; padding: 15px; margin-bottom: 10px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
                            <div>
                                <h4 style="color: #d46b8d;">${this.escapeHtml(school.school_name)}</h4>
                                <div style="font-size: 0.85rem; color: #666;">${stateText}: ${this.escapeHtml(school.state)}</div>
                                <div style="font-size: 0.8rem; color: #999; margin-top: 5px;">
                                    ${teachersText}: ${school.teacher_count}${teachersUnitText} · 
                                    ${studentsText}: ${school.student_count}${this.t('studentsUnit', '人')} · 
                                    ${classesText}: ${school.class_count}${classesUnitText}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            adminTab.innerHTML = html;
            
        } catch (error) {
            console.error('刷新管理员仪表盘失败:', error);
            adminTab.innerHTML = `<div style="text-align: center; color: #ff4444; padding: 20px;">❌ ${this.t('loadFailed', '加载失败')}</div>`;
        }
    }

    /**
     * 同步数据按钮
     */
    async syncData(e) {
        e?.preventDefault();

        if (!this.supabase || !navigator.onLine) {
            alert(this.t('offlineCannotSync', '网络离线，无法同步'));
            return;
        }

        const syncBtn = document.getElementById('sync-data-btn');
        const originalText = syncBtn.textContent;
        syncBtn.textContent = `⏳ ${this.t('syncing', '同步中...')}`;
        syncBtn.disabled = true;

        try {
            await this.studentRecord.processOfflineQueue();
            await this.refreshData();
            alert(`✅ ${this.t('syncSuccess', '数据同步完成')}`);
        } catch (error) {
            console.error('同步失败:', error);
            alert(`❌ ${this.t('syncFailed', '同步失败')}: ${error.message}`);
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
                alert(this.t('studentNotFound', '找不到该学生数据'));
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

            const unknownText = this.t('unknown', '未知');
            const studentIdText = this.t('studentId', '学号');
            const nameText = this.t('name', '姓名');
            const classText = this.t('class', '班级');
            const unassignedText = this.t('unassigned', '未分配');
            const schoolText = this.t('school', '学校');
            const registerTimeText = this.t('registerTime', '注册时间');
            const generateReportText = this.t('generateReport', '生成报告');
            const closeText = this.t('close', '关闭');
            const studentDetailText = this.t('studentDetail', '详情');

            const detailHtml = `
                <div style="background: white; border-radius: 40px; padding: 30px; max-width: 450px; width: 90%;">
                    <h3 style="color: #d46b8d; margin-bottom: 20px;">${this.escapeHtml(student.name || unknownText)} ${studentDetailText}</h3>
                    
                    <div style="margin-bottom: 20px;">
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                            <span style="color: #666;">${studentIdText}:</span>
                            <span style="font-weight: bold;">${this.escapeHtml(student.student_id || '-')}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                            <span style="color: #666;">${nameText}:</span>
                            <span style="font-weight: bold;">${this.escapeHtml(student.name || '-')}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                            <span style="color: #666;">${classText}:</span>
                            <span style="font-weight: bold;">${this.escapeHtml(student.class || unassignedText)}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
                            <span style="color: #666;">${schoolText}:</span>
                            <span style="font-weight: bold;">${this.escapeHtml(student.school || '-')}</span>
                        </div>
                        <div style="display: flex; justify-content: space-between; padding: 8px 0;">
                            <span style="color: #666;">${registerTimeText}:</span>
                            <span style="font-weight: bold;">${student.created_at ? new Date(student.created_at).toLocaleDateString() : '-'}</span>
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px; justify-content: center; margin-top: 20px;">
                        <button class="candy-btn primary" id="generate-student-pdf">📄 ${generateReportText}</button>
                        <button class="candy-btn home" id="close-detail">${closeText}</button>
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
            alert(`${this.t('loadFailed', '加载失败')}: ${error.message}`);
        }
    }

    /**
     * 导出单个学生Excel
     */
    async exportStudentExcel(studentId) {
        if (!this.supabase || !navigator.onLine) {
            alert(this.t('networkRequired', '需要网络连接才能导出'));
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
                alert(this.t('noDataToExport', '没有数据可导出'));
                return;
            }

            const wsData = [
                [this.t('studentId', '学生ID'), this.t('question', '题目'), this.t('num1', '数字1'), this.t('num2', '数字2'), this.t('isCorrect', '是否正确'), this.t('timeSeconds', '用时(秒)'), this.t('timestamp', '时间戳')]
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
            XLSX.utils.book_append_sheet(wb, ws, this.t('answerRecords', '答题记录'));
            XLSX.writeFile(wb, `student_${studentId}_data.xlsx`);

        } catch (error) {
            console.error('导出失败:', error);
            alert(`${this.t('exportFailed', '导出失败')}: ${error.message}`);
        }
    }

    /**
     * 清除所有记录
     */
    clearAllRecords(e) {
        e?.preventDefault();
        
        if (confirm(this.t('clearConfirm', '确定要清除所有学生记录吗？此操作不可恢复。'))) {
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

// ==================== 文件结束 ====================
