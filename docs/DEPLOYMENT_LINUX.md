# Linux 服务器部署说明

本文档用于将 AI 智能教学系统部署到老师的 Linux 服务器。系统采用 Docker Compose 统一启动前端、后端、MySQL、MongoDB、Qdrant 和 Neo4j。

## 1. 本地演示与服务器部署的区别

- 本地演示使用 `.env.local.example`，保留开发机已有数据卷的账号密码，适合在自己电脑上演示。
- 服务器部署使用 `.env.example`，必须替换所有 `change_me` 占位值，并填写 `DOUBAO_API_KEY`。如果老师火山引擎账号里的方舟端点不同，还需要替换 `DOUBAO_MODEL_ID`。
- 不要把本机 `.env` 上传到服务器，也不要把服务器 `.env` 提交到 Git。

## 2. 服务器前置条件

服务器建议使用 Ubuntu 20.04/22.04 或同类 Linux 发行版，并确保可以访问互联网下载 Docker 镜像和依赖。

检查 Docker：

```bash
docker --version
docker compose version
docker info
```

如果提示没有权限访问 Docker，可以临时使用 `sudo`，或让管理员把当前用户加入 docker 组：

```bash
sudo usermod -aG docker $USER
```

执行后需要重新登录 SSH 会话。

## 3. 获取项目代码

推荐在服务器上直接拉取代码：

```bash
git clone https://github.com/XIAX66/ai-teaching-system.git
cd ai-teaching-system
```

如果代码还在功能分支上，可以切换到你准备部署的分支：

```bash
git checkout feat/knowledge-point-detail-acl-import
```

也可以把项目目录打包上传到服务器，但不要上传本地 `.env`、`frontend/node_modules`、`frontend/dist`、`backend/venv` 等缓存目录。

## 4. 火山引擎方舟开通检查

本系统的 AI 功能调用火山引擎方舟 Ark。注意：只有 `DOUBAO_API_KEY` 不一定够用，API Key 所属账号还必须开通并有权限调用项目使用的模型和端点。

部署前请在火山引擎控制台确认：

- 已开通火山方舟大模型服务，并创建可用的 API Key。
- 对话端点已发布，并且 `.env` 中的 `DOUBAO_MODEL_ID` 是该账号下可调用的端点或模型 ID。当前项目默认值是：

```env
DOUBAO_MODEL_ID=ep-20260314143559-m78rx
```

- 文本向量模型已开通，否则教材向量化、RAG 检索和教材问答会失败。当前项目默认使用：

```env
DOUBAO_EMBEDDING_MODEL=doubao-embedding-text-240715
```

- 如果需要演示图片/视觉问答，确认 `DOUBAO_MODEL_ID` 对应端点支持图片输入，也就是后端发送的 `input_image` 内容。只支持纯文本的端点可以正常文本问答，但图片输入会报错。

如果老师账号下的端点不是默认的 `ep-20260314143559-m78rx`，请在 `.env` 中改成老师账号里实际已发布、已授权的端点 ID。端点 ID 通常以 `ep-` 开头。

## 5. 配置生产环境变量

在项目根目录执行：

```bash
cp .env.example .env
```

然后编辑 `.env`：

```bash
nano .env
```

必须修改以下字段：

```env
MYSQL_ROOT_PASSWORD=替换为强密码
MYSQL_PASSWORD=替换为强密码
MONGO_ROOT_PASSWORD=替换为强密码
NEO4J_PASSWORD=替换为强密码
DOUBAO_API_KEY=替换为真实豆包APIKey
DOUBAO_MODEL_ID=替换为老师账号下可调用的方舟端点ID
DOUBAO_EMBEDDING_MODEL=doubao-embedding-text-240715
```

`DOUBAO_MODEL_ID` 和 `DOUBAO_EMBEDDING_MODEL` 可以先保留 `.env.example` 中的默认值，但必须确认 API Key 所属账号已经开通并有权限调用这些模型。否则后端容器可以启动，AI 问答或教材向量化仍会失败。

确认 `.env` 中不能再出现 `change_me`，也不要使用本地演示密码：

```env
root_password
password
neo4j_password
```

默认端口策略：

- `FRONTEND_PORT=3000` 对外提供页面访问。
- `BACKEND_PORT=127.0.0.1:8080` 仅本机访问，由前端 Nginx 通过 `/api` 和 `/uploads` 代理。
- MySQL、MongoDB、Qdrant、Neo4j 默认绑定到 `127.0.0.1`，避免直接暴露到公网。

如果老师服务器只开放 80 端口，可以把 `.env` 中的前端端口改成：

```env
FRONTEND_PORT=80
```

## 6. 一键部署

确保脚本可执行：

```bash
chmod +x scripts/deploy.sh
```

启动部署：

```bash
./scripts/deploy.sh
```

脚本会自动检查：

- Docker 是否可用。
- Docker Compose v2 是否可用。
- `.env` 是否存在。
- `.env` 是否仍包含 `change_me`。
- `.env` 是否误用了本地演示密码。
- `DOUBAO_API_KEY` 是否为空。如果为空，页面和数据库功能可以启动，但 AI 问答、教材向量化和 RAG 检索会失败。
- Docker Compose 配置是否能正确解析。

部署完成后访问：

```text
http://服务器IP:3000
```

如果 `FRONTEND_PORT=80`，访问：

```text
http://服务器IP
```

## 7. 验证服务状态

查看容器：

```bash
docker compose ps
```

正常情况下应看到：

```text
ats_frontend
ats_backend
ats_mysql
ats_mongo
ats_qdrant
ats_neo4j
```

查看日志：

```bash
docker compose logs -f backend frontend
```

后端正常启动时应能看到类似信息：

```text
Connected to MySQL successfully.
Connected to MongoDB successfully.
Connected to Neo4j successfully.
Server starting on :8080
```

## 8. 防火墙与端口

如果浏览器无法访问页面，检查云服务器安全组或防火墙是否开放前端端口。

Ubuntu UFW 示例：

```bash
sudo ufw allow 3000/tcp
sudo ufw status
```

如果使用 80 端口：

```bash
sudo ufw allow 80/tcp
```

不建议把数据库端口直接开放到公网。

## 9. 更新部署

代码更新后，在服务器项目目录执行：

```bash
git pull
./scripts/deploy.sh
```

如果只是重启服务：

```bash
docker compose restart
```

如果要查看实时日志：

```bash
docker compose logs -f
```

## 10. 常见问题

### 10.1 登录接口返回 502 Bad Gateway

通常是前端 Nginx 无法连接后端。先检查后端是否启动：

```bash
docker compose ps
docker compose logs --tail=120 backend
```

常见原因：

- MySQL 密码和已有数据卷不一致。
- `.env` 中仍是占位密码。
- 后端镜像构建失败或启动失败。

如果是全新服务器，建议确认 `.env` 后重新部署：

```bash
./scripts/deploy.sh
```

### 10.2 AI 问答报 DOUBAO_API_KEY is not configured

说明后端容器没有读取到豆包 API Key。检查 `.env`：

```bash
grep DOUBAO_API_KEY .env
```

填写后需要重建或重启后端：

```bash
docker compose up -d --force-recreate backend
```

这个错误只表示后端没有读到 API Key。如果 API Key 已填写但模型未开通，通常会看到 `ark api error` 或 `embedding api error`，需要按下面两节继续排查。

### 10.3 AI 问答报 ark api error 403/404/ModelNotFound/EndpointNotFound

这通常不是 Docker 或 Nginx 的问题，而是火山方舟账号、端点或模型权限问题。重点检查：

- `.env` 中的 `DOUBAO_MODEL_ID` 是否是老师账号下已发布、可调用的端点。
- `DOUBAO_API_KEY` 是否属于同一个火山引擎账号或同一个有权限的项目。
- 方舟端点是否已发布，是否被停用，是否支持当前请求格式。
- 如果是图片/视觉问答失败，确认该端点支持图片输入 `input_image`。

查看后端完整错误：

```bash
docker compose logs --tail=200 backend
```

修改 `.env` 后重启后端：

```bash
docker compose up -d --force-recreate backend
```

### 10.4 教材解析或问答报 embedding api error

这通常说明文本向量模型没有开通，或 API Key 没有调用权限。当前项目默认使用：

```env
DOUBAO_EMBEDDING_MODEL=doubao-embedding-text-240715
```

请在火山方舟控制台确认该模型可调用。如果老师账号使用的是其他文本向量模型，把 `.env` 中的 `DOUBAO_EMBEDDING_MODEL` 改成实际可用的模型名，然后重启后端。

### 10.5 端口访问不通

检查端口映射：

```bash
docker compose ps
```

检查服务器防火墙或云安全组是否开放 `FRONTEND_PORT`。

### 10.6 Docker 权限不足

如果执行脚本时提示无法访问 Docker：

```bash
sudo docker info
```

如果 `sudo` 可用，说明是用户权限问题。可以让管理员把当前用户加入 docker 组，或用 `sudo ./scripts/deploy.sh`。

### 10.7 旧数据卷密码不一致

MySQL、MongoDB、Neo4j 首次初始化后，账号密码会写入 Docker volume。后续修改 `.env` 不会自动修改已有数据卷里的密码。

如果服务器是测试环境且可以清空数据，可执行：

```bash
docker compose down -v
./scripts/deploy.sh
```

注意：`down -v` 会删除数据库数据，正式环境不要随意执行。

### 10.8 镜像构建很慢

首次部署需要下载 Go、Node、Nginx、MySQL、MongoDB、Qdrant、Neo4j 等镜像，并安装前后端依赖，耗时较长是正常现象。后续部署会复用缓存。

## 11. SSH 远程部署注意事项

可以先在本机终端连接老师服务器：

```bash
ssh 用户名@服务器IP
```

连接成功后，再在这个 SSH 会话中执行本文档里的命令。注意：

- 服务器密码、短信验证码、`DOUBAO_API_KEY` 等敏感信息不要粘贴到聊天窗口里，建议在终端或服务器编辑器中手动输入。
- 安装 Docker、开放防火墙端口、删除 Docker volume、重启服务器等操作会影响服务器环境，执行前先确认影响范围。
- 如果当前用户没有 Docker 权限，需要老师提供 sudo 权限，或提前把当前用户加入 docker 组。

## 12. 演示前检查清单

部署完成后建议按以下顺序检查：

1. 打开前端页面。
2. 注册或登录教师账号。
3. 上传一本 PDF 教材。
4. 等待解析和图谱构建完成。
5. 打开教材详情，检查 PDF、AI 解析文稿、知识图谱。
6. 提问教材问答，确认流式输出正常。
7. 上传视频或资料，确认 `/uploads` 资源可访问。
8. 配置教材权限，使用学生账号检查可见性。
