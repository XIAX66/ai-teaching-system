package service

import (
	"ai-teaching-system/internal/ai/provider"
	"bytes"
	"encoding/json"
	"fmt"
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
		// Default to localhost for non-docker host run, or qdrant for docker
		url = "http://localhost:6333"
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

	var result struct {
		Result []struct {
			Payload map[string]interface{} `json:"payload"`
		} `json:"result"`
	}
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