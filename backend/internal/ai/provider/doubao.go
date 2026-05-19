package provider

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
)

type DoubaoProvider struct {
	APIKey         string
	ModelID        string
	EmbeddingModel string
	BaseURL        string
	Client         *http.Client
}

func NewDoubaoProvider() *DoubaoProvider {
	return &DoubaoProvider{
		APIKey:         os.Getenv("DOUBAO_API_KEY"),
		ModelID:        envOrDefault("DOUBAO_MODEL_ID", "ep-20260314143559-m78rx"),
		EmbeddingModel: envOrDefault("DOUBAO_EMBEDDING_MODEL", "doubao-embedding-text-240715"),
		BaseURL:        "https://ark.cn-beijing.volces.com/api/v3/responses",
		Client:         &http.Client{},
	}
}

func envOrDefault(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func (p *DoubaoProvider) ChatStream(history []DoubaoMessage, onChunk func(string)) error {
	if p.APIKey == "" {
		return fmt.Errorf("DOUBAO_API_KEY is not configured")
	}

	reqBody := struct {
		Model  string          `json:"model"`
		Input  []DoubaoMessage `json:"input"`
		Stream bool            `json:"stream"`
	}{
		Model:  p.ModelID,
		Input:  history,
		Stream: true,
	}

	jsonData, _ := json.Marshal(reqBody)
	req, err := http.NewRequest("POST", p.BaseURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.APIKey)
	req.Header.Set("Accept", "text/event-stream")

	resp, err := p.Client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("ark api error (status %d): %s", resp.StatusCode, string(body))
	}

	reader := bufio.NewReader(resp.Body)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				break
			}
			return err
		}

		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimPrefix(line, "data:")
		trimmed := strings.TrimSpace(data)
		if trimmed == "[DONE]" || trimmed == "DONE" {
			break
		}

		var chunk struct {
			Type  string `json:"type"`
			Delta string `json:"delta"`
		}
		if err := json.Unmarshal([]byte(trimmed), &chunk); err == nil && chunk.Type == "response.output_text.delta" {
			onChunk(chunk.Delta)
		}
	}
	return nil
}

func (p *DoubaoProvider) Chat(prompt string, imageBase64 string) (string, error) {
	if p.APIKey == "" {
		return "", fmt.Errorf("DOUBAO_API_KEY is not configured")
	}

	var contents []map[string]interface{}
	if imageBase64 != "" {
		contents = append(contents, map[string]interface{}{"type": "input_image", "image_url": imageBase64})
	}
	contents = append(contents, map[string]interface{}{"type": "input_text", "text": prompt})

	reqBody := struct {
		Model  string          `json:"model"`
		Input  []DoubaoMessage `json:"input"`
		Stream bool            `json:"stream"`
	}{
		Model:  p.ModelID,
		Input:  []DoubaoMessage{{Role: "user", Content: contents}},
		Stream: false,
	}

	jsonData, _ := json.Marshal(reqBody)
	req, err := http.NewRequest("POST", p.BaseURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return "", err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.APIKey)

	resp, err := p.Client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("ark api error (status %d): %s", resp.StatusCode, string(body))
	}

	var result interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", fmt.Errorf("json parse error: %v", err)
	}

	return findLongestTextWithJSON(result), nil
}

func findLongestTextWithJSON(data interface{}) string {
	var best string
	var search func(interface{}, string)
	search = func(n interface{}, parentKey string) {
		if parentKey == "summary" || parentKey == "reasoning" {
			return
		}
		switch v := n.(type) {
		case map[string]interface{}:
			for k, val := range v {
				if k == "text" {
					if s, ok := val.(string); ok && strings.Contains(s, "[") && len(s) > len(best) {
						best = s
					}
				}
				search(val, k)
			}
		case []interface{}:
			for _, val := range v {
				search(val, "")
			}
		}
	}
	search(data, "")
	return best
}

// GetEmbedding 升级为最新的文本向量化模型接口
func (p *DoubaoProvider) GetEmbedding(text string, imageBase64 string) ([]float32, error) {
	if p.APIKey == "" {
		return nil, fmt.Errorf("DOUBAO_API_KEY is not configured")
	}

	// 关键改动：豆包纯文本向量化请求格式
	reqBody := struct {
		Model          string   `json:"model"`
		Input          []string `json:"input"`
		EncodingFormat string   `json:"encoding_format"`
	}{
		Model:          p.EmbeddingModel,
		Input:          []string{text},
		EncodingFormat: "float",
	}

	jsonData, _ := json.Marshal(reqBody)
	// 关键改动：接口地址变更
	embeddingURL := "https://ark.cn-beijing.volces.com/api/v3/embeddings"

	req, err := http.NewRequest("POST", embeddingURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.APIKey)

	resp, err := p.Client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("embedding api error (status %d): %s", resp.StatusCode, string(body))
	}

	var res struct {
		Data []struct {
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}

	if err := json.Unmarshal(body, &res); err != nil {
		return nil, fmt.Errorf("failed to parse embedding response: %v", err)
	}

	if len(res.Data) > 0 {
		return res.Data[0].Embedding, nil
	}

	return nil, fmt.Errorf("empty embedding returned")
}

type DoubaoMessage struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"`
}

type DoubaoEmbeddingInput struct {
	Type     string          `json:"type"`
	Text     string          `json:"text,omitempty"`
	ImageURL *DoubaoImageURL `json:"image_url,omitempty"`
}
type DoubaoImageURL struct {
	URL string `json:"url"`
}
