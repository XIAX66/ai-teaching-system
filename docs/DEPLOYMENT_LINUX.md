# Linux 服务器部署说明

本文档用于将 AI 智能教学系统部署到老师的 Linux 服务器。系统采用 Docker Compose 统一启动前端、后端、MySQL、MongoDB、Qdrant 和 Neo4j。

## 1. 本地演示与服务器部署的区别

- 本地演示使用 `.env.local.example`，保留开发机已有数据卷的账号密码，适合在自己电脑上演示。
- 服务器部署使用 `.env.example`，必须替换所有 `change_me` 占位值，并填写 `DOUBAO_API_KEY`。
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

## 4. 配置生产环境变量

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
```

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

## 5. 一键部署

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
- Docker Compose 配置是否能正确解析。

部署完成后访问：

```text
http://服务器IP:3000
```

如果 `FRONTEND_PORT=80`，访问：

```text
http://服务器IP
```

## 6. 验证服务状态

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

## 7. 防火墙与端口

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

## 8. 更新部署

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

## 9. 常见问题

### 9.1 登录接口返回 502 Bad Gateway

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

### 9.2 AI 问答报 DOUBAO_API_KEY is not configured

说明后端容器没有读取到豆包 API Key。检查 `.env`：

```bash
grep DOUBAO_API_KEY .env
```

填写后需要重建或重启后端：

```bash
docker compose up -d --force-recreate backend
```

### 9.3 端口访问不通

检查端口映射：

```bash
docker compose ps
```

检查服务器防火墙或云安全组是否开放 `FRONTEND_PORT`。

### 9.4 Docker 权限不足

如果执行脚本时提示无法访问 Docker：

```bash
sudo docker info
```

如果 `sudo` 可用，说明是用户权限问题。可以让管理员把当前用户加入 docker 组，或用 `sudo ./scripts/deploy.sh`。

### 9.5 旧数据卷密码不一致

MySQL、MongoDB、Neo4j 首次初始化后，账号密码会写入 Docker volume。后续修改 `.env` 不会自动修改已有数据卷里的密码。

如果服务器是测试环境且可以清空数据，可执行：

```bash
docker compose down -v
./scripts/deploy.sh
```

注意：`down -v` 会删除数据库数据，正式环境不要随意执行。

### 9.6 镜像构建很慢

首次部署需要下载 Go、Node、Nginx、MySQL、MongoDB、Qdrant、Neo4j 等镜像，并安装前后端依赖，耗时较长是正常现象。后续部署会复用缓存。

## 10. 演示前检查清单

部署完成后建议按以下顺序检查：

1. 打开前端页面。
2. 注册或登录教师账号。
3. 上传一本 PDF 教材。
4. 等待解析和图谱构建完成。
5. 打开教材详情，检查 PDF、AI 解析文稿、知识图谱。
6. 提问教材问答，确认流式输出正常。
7. 上传视频或资料，确认 `/uploads` 资源可访问。
8. 配置教材权限，使用学生账号检查可见性。
