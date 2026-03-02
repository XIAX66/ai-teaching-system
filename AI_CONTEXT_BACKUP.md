# AI 教学系统开发上下文备份 (State Snapshot)
*生成时间: 2026-02-27*

## 1. 核心目标
开发并完善基于豆包多模态大模型的 AI 智能教学系统，实现教材 RAG 问答、视频截帧提问及全栈容器化部署。

## 2. 技术架构与约束
- **前端**: React 19 + Webpack 5 + Tailwind CSS v4。使用 Axios 进行 API 交互。
- **后端**: Go 1.24 (Gin) + Python 3.13 (pdfplumber) 混合架构。
- **AI 供应**: 豆包 Ark V3 (Model: `doubao-seed-2-0-pro-260215`)。
- **向量库**: Qdrant (REST API 模式)。
- **部署**: Nginx 代理，配置 `client_max_body_size 100M` 和 `proxy_read_timeout 300s`。

## 3. 已解决的关键知识点 (重要)
- **豆包多模态接口对齐**: 
    - 接口: `https://ark.cn-beijing.volces.com/api/v3/responses`
    - 输入标签必须为: `input_text` 和 `input_image`。
    - `image_url` 结构修复: 必须直接传入 Base64 字符串，而非对象。
    - 格式示例: `{"type": "input_image", "image_url": "data:image/jpeg;base64,..."}`
- **前端优化**:
    - 视频截帧强制转为 `image/jpeg` 格式，质量设为 `0.5`，解决 Base64 过长导致的 500 错误。
    - 前端 Axios 超时时间设置为 `180000ms` (3分钟)。

## 4. 关键修改记录 (Artifact Trail)
- `backend/internal/ai/provider/doubao.go`: 修正了 Ark V3 的 JSON 嵌套结构和类型标识。
- `frontend/nginx.conf`: 解决了 Nginx 默认 60s 超时导致的 AI 响应中断。
- `frontend/src/pages/ResourceDetailPage.tsx`: 优化截帧性能并延长请求超时。

## 5. 状态快照 (恢复用 XML)
直接将以下内容发送给新的 Gemini CLI 实例即可恢复：

```xml
<state_snapshot>
    <overall_goal>
        完善 AI 智能教学系统，打通视频多模态截帧问答流程。
    </overall_goal>
    <active_constraints>
        Webpack 5, React 19, Go 1.24, 豆包 Ark V3 Responses API (Non-Standard JSON).
    </active_constraints>
    <key_knowledge>
        - 豆包接口多模态输入: Type="input_image", image_url=string(Base64).
        - 前端截帧压缩: JPEG 0.5.
        - 超时设置: Nginx 300s, Go/Axios 180s.
    </key_knowledge>
    <task_state>
        - [DONE] 全栈容器化与超时调优。
        - [DONE] 豆包多模态协议适配。
        - [DONE] 视频截帧体积优化。
        - [IN_PROGRESS] 验证视频截图后的 AI 对话质量。
        - [TODO] 前端对话 Markdown 渲染。
    </task_state>
</state_snapshot>
```
