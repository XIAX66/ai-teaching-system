# AI 智能教学系统 (AI-Teaching-System)

基于大模型、知识图谱与多模态资源管理的现代化在线教学系统。

## 🚀 快速启动

本项目采用 Docker 全栈容器化方案，确保环境一致性。

### 前置要求
- 已安装 **Docker Desktop** (包含 Docker Compose)
- 网络环境正常（用于构建镜像时下载依赖）

### 一键启动 (推荐)
在项目根目录下执行启动脚本：

**Mac/Linux:**
```bash
./scripts/start.sh
```

**Windows:**
直接双击运行 `scripts/start.bat`。

启动成功后：
- **前端页面**: [http://localhost:3000](http://localhost:3000)
- **后端接口**: [http://localhost:8080](http://localhost:8080)
- **MySQL 端口**: `3307` (用户名: `user`, 密码: `password`)

---

## 🛠 技术栈

| 层级 | 技术选型 | 备注 |
| :--- | :--- | :--- |
| **前端** | React 19 + Webpack 5 + Tailwind CSS v4 | 极简专业 Dashboard 风格 |
| **后端** | Go 1.24 (Gin) + Python 3 (pdfplumber) | Python 专门处理复杂 PDF 解析 |
| **数据库** | MySQL 8.0 + MongoDB 6.0 | 结构化数据与非结构化内容分离 |
| **AI 引擎** | Qdrant (向量库) + DeepSeek/OpenAI | 阶段三核心：RAG 教材问答 |
| **知识图谱** | Neo4j 5.11 | 阶段四核心：知识点关系可视化 |

---

## 📂 项目结构

```text
├── backend/            # Go 后端源码
│   ├── cmd/            # 程序入口
│   ├── internal/       # 核心业务逻辑 (Clean Architecture)
│   ├── scripts/        # Python 解析脚本
│   └── Dockerfile      # 后端容器化配置
├── frontend/           # React 前端源码
│   ├── src/            # 页面与组件
│   └── Dockerfile      # 前端 Nginx 部署配置
├── scripts/            # 一键启动脚本 (SH/BAT)
└── docker-compose.yml  # 全栈编排定义
```

---

## 👥 团队协作规范

1. **分支命名**:
   - 特性开发: `feat/xxx`
   - 缺陷修复: `fix/xxx`
   - 环境优化: `chore/xxx`
2. **提交信息**:
   - `feat: 实现教材模糊搜索`
   - `fix: 修复 PDF 中文解析乱码`
3. **资源管理**: 
   - 不要将测试用的大体积 PDF/视频文件提交到 Git。
   - `backend/uploads` 目录已被 Git 忽略。

---

## 📝 阶段性成果 (已完成)
- [x] **用户系统**: 注册、登录、JWT 鉴权、角色权限隔离。
- [x] **教材中心**: PDF 上传、基于 Python 的高质量中文文本提取。
- [x] **多模态管理**: 教材关联视频、附属资料下载。
- [x] **预览引擎**: PDF 在线阅读器、HTML5 视频播放器。
- [x] **工程化**: 环境全 Docker 容器化，支持一键部署。