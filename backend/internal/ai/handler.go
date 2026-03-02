package ai

import (
	"ai-teaching-system/internal/ai/service"
	"io"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

type AIHandler struct {
	agentService *service.AgentService
}

func NewAIHandler() *AIHandler {
	as, err := service.NewAgentService()
	if err != nil {
		log.Printf("ERROR: AI Agent Service initialization failed: %v", err)
		return &AIHandler{agentService: nil}
	}
	return &AIHandler{agentService: as}
}

type AskRequest struct {
	TextbookID  uint   `json:"textbook_id" binding:"required"`
	Question    string `json:"question" binding:"required"`
	ImageBase64 string `json:"image_base64"`
}

func (h *AIHandler) Ask(c *gin.Context) {
	if h.agentService == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "AI Agent service is not ready"})
		return
	}

	var req AskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 开启 SSE 流式响应
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Transfer-Encoding", "chunked")

	err := h.agentService.AskStream(req.TextbookID, req.Question, req.ImageBase64, func(chunk string) {
		// 写入 SSE 格式: data: <content>\n\n
		c.SSEvent("message", chunk)
		c.Writer.Flush()
	})

	if err != nil {
		log.Printf("AI Stream Error: %v", err)
		// 如果在流开始前报错，可以返回错误
		// 但如果流已经开始，SSE 错误处理通常由客户端断开决定
		c.SSEvent("error", err.Error())
	} else {
		c.SSEvent("done", "[DONE]")
	}
}
