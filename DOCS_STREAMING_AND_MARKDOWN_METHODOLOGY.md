# AI 流式输出与 Markdown 视觉渲染技术方案 (方法论)

## 1. 概述
本方案旨在解决 AI 智能教学系统中，基于 **SSE (Server-Sent Events)** 的流式对话交互。核心目标是实现**打字机般的平滑输出**，并将原始 Markdown 文本实时转化为**具备专业排版质感的视觉效果**（如大标题、代码块背景、表格等）。

---

## 2. 核心架构：无损传输链路
流式交互的稳定性取决于从模型到浏览器的每一个环节都保持数据的“原始性”。

### 2.1 后端转发 (Go/Gin)
*   **角色定位**：透明转发器。
*   **关键配置**：
    *   **禁用缓存**：必须发送 `X-Accel-Buffering: no` 响应头，防止 Nginx 拦截。
    *   **及时冲刷**：每发送一个 `data: <chunk>

` 后，必须调用 `c.Writer.Flush()`。
    *   **零干扰**：严禁对模型返回的 `delta` 字符串执行 `strings.TrimSpace`。AI 的 Token 极其细碎，每一个前缀空格都是连接单词或标识 Markdown 语法的关键。

### 2.2 代理层优化 (Nginx)
*   **踩坑记录**：数据积压几秒后突然跳出一大堆文字。
*   **解决方案**：
    ```nginx
    proxy_buffering off; # 关闭代理缓存
    proxy_cache off;
    chunked_transfer_encoding on;
    ```

---

## 3. 前端解析：字节级精准重构
这是最容易出现“格式混乱”的环节。

### 3.1 换行符消失之谜 (The Newline Pit)
*   **错误做法**：使用 `buffer.split('
')`。这会把作为数据本身的换行符当成分隔符“吃掉”。
*   **错误做法**：执行 `content.trim()`。这会删掉 AI 发出的纯换行符包（`data: 
`）和标题前缀空格（`## `）。
*   **正确算法**：
    1.  **正则匹配**：使用 `const pattern = /data:(.*)
/g;` 精准提取 `data:` 之后到行尾的所有内容。
    2.  **空包补偿**：当探测到 `data:` 后内容为空（`length === 0`）时，说明这是一个被剥离的换行符，必须手动补回 `
`。
    3.  **转义恢复**：执行 `.replace(/
/g, '
')`。防止字面量字符串 `
` 被当做普通文本。

### 3.2 缓冲区机制 (Buffering)
*   必须使用 `buffer` 暂存未读完的分片，配合 `lines.pop()` 处理被网络 TCP 分包截断的 JSON 字符串。

---

## 4. 视觉渲染：CSS 优先级策略
即使生成了 HTML 标签，如果不配置样式，它们在页面上看起来依然是普通文字。

### 4.1 样式压制问题
*   **踩坑记录**：`<h1>` 已经生成，但在页面上和普通文字一样大。
*   **根源**：全局 CSS (如 Tailwind Preflight) 设置了 `h1, h2 { font-size: inherit; }`。
*   **终极方案**：**原生 CSS 强力覆盖**。
    在 `index.css` 中直接针对渲染容器定义带 `!important` 的规则：
    ```css
    .markdown-body h1 { font-size: 1.75rem !important; font-weight: 900 !important; }
    .markdown-body code { background: #f1f5f9 !important; color: #0066FF !important; }
    ```

### 4.2 Markdown 配置
*   **插件支持**：集成 `remark-gfm` 以支持标准 GitHub 表格和任务列表。
*   **物理换行**：在容器上应用 `whitespace-pre-wrap`，作为 Markdown 引擎解析前的“视觉兜底”。

---

## 5. 工业级 CheckList (开发者必读)

### 后端 (Go)
- [ ] 响应头包含 `Content-Type: text/event-stream`
- [ ] 响应头包含 `X-Accel-Buffering: no`
- [ ] 发送后显式 `Flush()`
- [ ] **严禁 TrimSpace** 原始 Token

### 代理 (Nginx)
- [ ] `proxy_buffering off`
- [ ] 确保 `proxy_pass` 后的路径不带多余斜杠（防止 404）

### 前端 (React)
- [ ] 采用 `fetch` + `getReader()` 异步流模式
- [ ] 解析逻辑中**严禁使用任何形式的 `.trim()`**
- [ ] 手动处理长度为 0 的 `data:` 行补回 `
`
- [ ] 使用 `ReactMarkdown` + `remark-gfm`
- [ ] 在全局 CSS 中强制设定标题字号与代码块颜色

---
**结论**：流式 Markdown 渲染的核心不在于高深的代码，而在于对**每一个空格、每一个换行符**的绝对尊重。
