package ai

import (
	"ai-teaching-system/internal/ai/service"
	"fmt"
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

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Transfer-Encoding", "chunked")
	c.Header("X-Accel-Buffering", "no") // 关键：禁止 Nginx 缓存

	err := h.agentService.AskStream(req.TextbookID, req.Question, req.ImageBase64, func(chunk string) {
		// 发送每个 chunk 后立即 Flush
		fmt.Fprintf(c.Writer, "data: %s\n\n", chunk)
		c.Writer.Flush()
	})

	if err != nil {
		log.Printf("AI Stream Error: %v", err)
		fmt.Fprintf(c.Writer, "data: [ERROR]: %v\n\n", err)
		c.Writer.Flush()
	} else {
		fmt.Fprintf(c.Writer, "data: [DONE]\n\n")
		c.Writer.Flush()
	}
}