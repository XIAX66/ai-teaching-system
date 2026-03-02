package service

import (
	"ai-teaching-system/internal/ai/provider"
	"ai-teaching-system/internal/global"
	"ai-teaching-system/internal/model/mongo"
	"context"
	"fmt"
	"log"
	"strings"
	"time"
)

type AgentService struct {
	vectorService *VectorService
	doubao        *provider.DoubaoProvider
}

func NewAgentService() (*AgentService, error) {
	vs, err := NewVectorService()
	if err != nil {
		return nil, err
	}
	return &AgentService{
		vectorService: vs,
		doubao:        provider.NewDoubaoProvider(),
	}, nil
}

func (s *AgentService) Ask(textbookID uint, question string, imageBase64 string) (string, error) {
	var contextStr string
	
	// 1. Try RAG retrieval
	log.Printf("Attempting RAG retrieval for Textbook %d", textbookID)
	contexts, err := s.vectorService.Search(textbookID, question, imageBase64, 3)
	
	if err != nil || len(contexts) == 0 {
		log.Printf("RAG retrieval failed or empty (%v). Falling back to direct MongoDB content.", err)
		// Fallback: Get first few sections from MongoDB
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		
		collection := global.MongoDatabase.Collection("textbook_contents")
		var result mongo.TextbookContent
		filter := map[string]interface{}{"textbook_id": textbookID}
		errMongo := collection.FindOne(ctx, filter).Decode(&result)
		
		if errMongo == nil && len(result.Chapters) > 0 {
			// Take first chapter's first section as context
			contextStr = result.Chapters[0].Sections[0].Content
			if len(contextStr) > 3000 {
				contextStr = contextStr[:3000] // Cap to avoid prompt overflow
			}
		}
	} else {
		contextStr = strings.Join(contexts, "\n---\n")
	}

	// 2. Build Prompt
	prompt := fmt.Sprintf(`你是一名专业的教学助手。请根据提供的教材背景内容回答学生的问题。
如果问题涉及视频截图，请结合画面内容与教材知识点进行深入分析。
要求：
1. 回答必须专业、准确，符合教材语境。
2. 请使用 Markdown 格式。

教材背景：
%s

学生提问：
%s`, contextStr, question)

	// 3. Call Doubao LLM
	return s.doubao.Chat(prompt, imageBase64)
}
