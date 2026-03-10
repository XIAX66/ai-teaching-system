package ai

import (
	"ai-teaching-system/internal/ai/service"
	"fmt"
	"log"
	"net/http"
	"strconv"

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

	// 关键修复：使用正确的 context 键名 "userID"
	userIDVal, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized: User info missing"})
		return
	}
	
	// 在 JWT 中间件中 claims.UserID 通常直接是 uint 类型或通过类型断言确定
	var userID uint
	switch v := userIDVal.(type) {
	case uint:
		userID = v
	case float64:
		userID = uint(v)
	default:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Invalid user ID type in context"})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Transfer-Encoding", "chunked")
	c.Header("X-Accel-Buffering", "no")

	err := h.agentService.AskStream(userID, req.TextbookID, req.Question, req.ImageBase64, func(chunk string) {
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

func (h *AIHandler) GetHistory(c *gin.Context) {
	textbookIDStr := c.Param("id")
	tid, _ := strconv.ParseUint(textbookIDStr, 10, 32)

	// 关键修复：使用正确的 context 键名 "userID"
	userIDVal, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var userID uint
	switch v := userIDVal.(type) {
	case uint:
		userID = v
	case float64:
		userID = uint(v)
	}

	history, err := h.agentService.GetChatHistory(userID, uint(tid))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": history})
}