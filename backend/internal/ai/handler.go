package ai

import (
	"ai-teaching-system/internal/ai/service"
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

	answer, err := h.agentService.Ask(req.TextbookID, req.Question, req.ImageBase64)
	if err != nil {
		log.Printf("AI Ask Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"answer": answer})
}