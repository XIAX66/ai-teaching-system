# 产品需求文档 (PRD) - 阶段四：教材知识图谱模块

## 1. 模块概述
本模块旨在将教材的“线性文本”转化为“结构化知识网络”。通过知识图谱（Knowledge Graph）技术，系统能够自动识别教材中的核心知识点及其逻辑依赖关系，为学生提供直观的知识脉络展示，并为 AI 助理提供更高层级的语义支持。

---

## 2. 总体设计架构

### 2.1 构建流程
1.  **数据输入**：读取 MongoDB 中已解析的教材文本（TextbookContent）。
2.  **知识抽取**：利用豆包 Ark V3 模型（JSON 模式）从文本块中提取关键概念及其描述。
3.  **关系识别**：
    *   **层级关系**：自动建立 `知识点 -> 属于 -> 章节` 的父子关联。
    *   **语义关系**：利用 LLM 分析知识点间的 `前置依赖` (Prerequisite)。
4.  **数据存储**：将节点与关系持久化至 Neo4j 图数据库。
5.  **前端展现**：通过力导向图（Force-Directed Graph）实现交互式可视化。

---

## 3. 数据模型设计 (Neo4j)

### 3.1 节点定义 (Nodes)
| 标签 (Label) | 属性 (Properties) | 说明 |
| :--- | :--- | :--- |
| **Textbook** | {id, title, author} | 教材根节点 |
| **Chapter** | {id, title, order} | 教材章节 |
| **KnowledgePoint** | {name, description, textbookId} | 核心知识点 |
| **Video** | {id, title, file_path} | 关联教学视频 |

### 3.2 关系定义 (Relationships)
| 关系类型 | 起点 -> 终点 | 含义 |
| :--- | :--- | :--- |
| **BELONGS_TO** | KnowledgePoint -> Chapter | 知识点归属关系 |
| **PART_OF** | Chapter -> Textbook | 章节归属关系 |
| **PREREQUISITE_OF** | KnowledgePoint A -> KnowledgePoint B | A 是学习 B 的前置知识 |
| **EXPLAINS** | Video -> KnowledgePoint | 视频对知识点的详细解释 |

---

## 4. 核心技术实现

### 4.1 知识抽取 Pipeline (LLM Extraction)
*   **策略**：分段抽取。由于教材篇幅长，后端将按 Section 分块发送给豆包 API。
*   **Prompt 模板**：
    ```text
    请作为一名教育专家，从以下教材片段中提取出 3-5 个核心知识点。
    输出格式必须为 JSON 数组：[{"name": "...", "description": "..."}]
    ```

### 4.2 关系自动构建
*   **自动逻辑**：根据 MongoDB 的树状结构自动创建 `PART_OF` 和 `BELONGS_TO`。
*   **AI 逻辑**：将同一章节下的知识点两两组合，询问模型：“知识点 A 是否为知识点 B 的基础条件？”。

### 4.3 存储引擎 (Neo4j)
*   **容器化部署**：新增 `neo4j:5.x` 容器。
*   **驱动选型**：使用 `neo4j-go-driver` 实现 Bolt 协议通信。

---

## 5. 应用场景与 UI 展示

### 5.1 知识图谱可视化 (React)
*   在 `ResourceDetailPage` 增加“知识图谱”标签页。
*   使用 `react-force-graph` 渲染。支持缩放、拖拽。
*   **交互**：点击节点，侧边栏 AI 助理立即显示该知识点的定义和相关视频推荐。

### 5.2 学习路径推荐
*   基于 `PREREQUISITE_OF` 关系，为学生生成线性学习序列（例如：函数 -> 极限 -> 连续性 -> 导数）。

### 5.3 GraphRAG (增强检索)
*   AI 问答时，不仅根据相似度搜索向量，还根据搜索到的知识点在图中找到“邻居节点”，补充更完整的背景信息。

---

## 6. 开发 CheckList
- [ ] Docker 增加 Neo4j 节点并配置访问权限。
- [ ] 后端增加 `internal/service/graph_service.go`。
- [ ] 实现 LLM 知识点去重算法。
- [ ] 前端集成 D3.js 或相关图表库。

---
**版本**: v1.0 (Phase 4)
**负责人**: Gemini CLI & User
