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
		url = "http://qdrant:6333"
	}
	return &VectorService{
		baseURL:  url,
		provider: provider.NewDoubaoProvider(),
	}, nil
}

// IndexTextbook ... (保持不变)

// DeleteTextbookPoints 从 Qdrant 中物理删除属于该教材的所有向量
func (s *VectorService) DeleteTextbookPoints(textbookID uint) error {
	collectionName := "textbooks"
	
	// Qdrant 批量删除 API 格式
	deleteQuery := map[string]interface{}{
		"filter": map[string]interface{}{
			"must": []interface{}{
				map[string]interface{}{
					"key": "textbook_id",
					"match": map[string]interface{}{"value": textbookID},
				},
			},
		},
	}

	body, _ := json.Marshal(deleteQuery)
	url := fmt.Sprintf("%s/collections/%s/points/delete?wait=true", s.baseURL, collectionName)
	
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(body))
	if err != nil { return err }
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil { return err }
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("qdrant delete failed: status %d", resp.StatusCode)
	}

	log.Printf("[VectorService] Successfully deleted all points for textbook_id: %d", textbookID)
	return nil
}

// Search ... (保持不变)
// createCollection ... (保持不变)
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
		if err != nil { continue }
		point := map[string]interface{}{
			"id":      uint64(textbookID*10000 + uint(i)),
			"vector":  vector,
			"payload": map[string]interface{}{
				"textbook_id": textbookID,
				"content":     chunk,
			},
		}
		body, _ := json.Marshal(map[string]interface{}{"points": []interface{}{point}})
		http.Post(fmt.Sprintf("%s/collections/%s/points?wait=true", s.baseURL, collectionName), "application/json", bytes.NewBuffer(body))
	}
	return nil
}

func (s *VectorService) Search(textbookID uint, queryText string, imageBase64 string, limit uint64) ([]string, error) {
	vector, err := s.provider.GetEmbedding(queryText, imageBase64)
	if err != nil { return nil, err }
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
	if err != nil { return nil, err }
	defer resp.Body.Close()
	var result struct { Result []struct { Payload map[string]interface{} `json:"payload"` } `json:"result"` }
	json.NewDecoder(resp.Body).Decode(&result)
	var contexts []string
	for _, item := range result.Result {
		if content, ok := item.Payload["content"].(string); ok {
			contexts = append(contexts, content)
		}
	}
	return contexts, nil
}

func (s *VectorService) createCollection(name string) {
	body, _ := json.Marshal(map[string]interface{}{
		"vectors": map[string]interface{}{
			"size":     1024,
			"distance": "Cosine",
		},
	})
	req, _ := http.NewRequest("PUT", fmt.Sprintf("%s/collections/%s", s.baseURL, name), bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	http.DefaultClient.Do(req)
}