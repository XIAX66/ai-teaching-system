# AI 智能教学系统 - 开发上下文备份 (2026-03-10)

## 1. 当前开发分支
- **分支**: `feature/teacher-mgmt-and-chat-edit`
- **基准**: `main` (已合并流式输出修复与记忆系统基础版)

## 2. 核心技术架构变更记录

### 2.1 SSE 流式输出与 Markdown 渲染 (已闭环)
- **后端修复**: 采用 "透明转发"，响应头包含 `X-Accel-Buffering: no`，发送后显式 `Flush()`。
- **前端修复**: 无损解析（正则匹配），换行补偿（探测 length 0 补回 `\n`），视觉强制（index.css 定义带 `!important` 样式）。

### 2.2 记忆系统 (Memory System) (已实现)
- **存储**: MongoDB `chat_sessions`。
- **协议兼容**: 严格适配豆包 Ark V3 `v3/responses` 的全量数组格式 `content: [{"type": "input_text", "text": "..."}]`。

### 2.3 RAG 检索 (向量库)
- **存储**: Qdrant 共享 Collection `textbooks`。
- **隔离性**: Payload Filtering 指定 `textbook_id` 实现多教材隔离。

## 3. 环境配置
- **模型**: `doubao-seed-2-0-mini-260215`。
- **数据库**: MySQL 8.0 (MySQL 容器) + MongoDB + Qdrant。
- **限制**: Nginx/Gin 上传限制调高至 50MB。

## 4. 阶段四前置优化任务 (当前焦点)
1. **教师端管理**: 教材/视频/文件的物理删除与多库联动清理（MySQL+Mongo+Qdrant+Disk）。
2. **对话回溯编辑**: 修改第 $m$ 条提问，物理删除 $m$ 之后的所有消息序列并重新生成。
3. **ACL 权限控制**: 实现教材对特定学生的阅读权限白名单。

## 5. 未来规划：阶段四
- **核心目标**: 利用 Neo4j 构建教材知识图谱，实现知识点之间的语义关联与可视化展示。

---
**备份状态**: 架构与路线图已更正
