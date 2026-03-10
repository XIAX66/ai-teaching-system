package service

import (
	"ai-teaching-system/internal/ai/provider"
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
)

type VectorService struct {
	baseURL  string
	provider *provider.DoubaoProvider
}

func NewVectorService() (*VectorService, error) {
	url := os.Getenv("QDRANT_URL")
	if url == "" {
		// 关键修复：在 Docker 环境中默认应使用容器名
		url = "http://qdrant:6333"
	}
	return &VectorService{
		baseURL:  url,
		provider: provider.NewDoubaoProvider(),
	}, nil
}

func (s *VectorService) IndexTextbook(textbookID uint, text string) error {
	collectionName := "textbooks"
	s.createCollection(collectionName)

	runes := []rune(text)
	var chunks []string
	size, overlap := 1000, 200
	for i := 0; i < len(runes); i += (size - overlap) {
		end := i + size
		if end > len(runes) { end = len(runes) }
		chunks = append(chunks, string(runes[i:end]))
		if end == len(runes) { break }
	}

	for i, chunk := range chunks {
		vector, err := s.provider.GetEmbedding(chunk, "")
		if err != nil {
			log.Printf("[VectorService] GetEmbedding error for chunk %d: %v", i, err)
			continue
		}

		point := map[string]interface{}{
			"id":      uint64(textbookID*10000 + uint(i)),
			"vector":  vector,
			"payload": map[string]interface{}{
				"textbook_id": textbookID,
				"content":     chunk,
			},
		}

		body, _ := json.Marshal(map[string]interface{}{"points": []interface{}{point}})
		resp, err := http.Post(fmt.Sprintf("%s/collections/%s/points?wait=true", s.baseURL, collectionName), "application/json", bytes.NewBuffer(body))
		if err != nil || resp.StatusCode != http.StatusOK {
			log.Printf("[VectorService] Error indexing point %d: %v", i, err)
		}
	}
	return nil
}

func (s *VectorService) Search(textbookID uint, queryText string, imageBase64 string, limit uint64) ([]string, error) {
	vector, err := s.provider.GetEmbedding(queryText, imageBase64)
	if err != nil {
		log.Printf("[VectorService] Search Embedding error: %v", err)
		return nil, err
	}

	query := map[string]interface{}{
		"vector": vector,
		"filter": map[string]interface{}{
			"must": []interface{}{
				map[string]interface{}{
					"key": "textbook_id",
					"match": map[string]interface{}{"value": textbookID},
				},
			},
		},
		"limit":        limit,
		"with_payload": true,
	}

	body, _ := json.Marshal(query)
	resp, err := http.Post(fmt.Sprintf("%s/collections/textbooks/points/search", s.baseURL), "application/json", bytes.NewBuffer(body))
	if err != nil {
		log.Printf("[VectorService] Qdrant Search network error: %v", err)
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("[VectorService] Qdrant Search returned status: %d", resp.StatusCode)
		return nil, fmt.Errorf("qdrant search error: %d", resp.StatusCode)
	}

	var result struct {
		Result []struct {
			Payload map[string]interface{} `json:"payload"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}

	var contexts []string
	for _, item := range result.Result {
		if content, ok := item.Payload["content"].(string); ok {
			contexts = append(contexts, content)
		}
	}
	return contexts, nil
}

func (s *VectorService) createCollection(name string) {
	// 检查集合是否存在，如果不存在则创建
	checkResp, _ := http.Get(fmt.Sprintf("%s/collections/%s", s.baseURL, name))
	if checkResp != nil && checkResp.StatusCode == http.StatusOK {
		return
	}

	body, _ := json.Marshal(map[string]interface{}{
		"vectors": map[string]interface{}{
			"size":     1024,
			"distance": "Cosine",
		},
	})
	req, _ := http.NewRequest("PUT", fmt.Sprintf("%s/collections/%s", s.baseURL, name), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		log.Printf("[VectorService] Failed to create collection: %v", err)
	}
}
