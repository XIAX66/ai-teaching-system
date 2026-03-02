package provider

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"
)

type DoubaoProvider struct {
	APIKey  string
	ModelID string
	BaseURL string
	Client  *http.Client
}

func NewDoubaoProvider() *DoubaoProvider {
	apiKey := os.Getenv("DOUBAO_API_KEY")
	if apiKey == "" {
		apiKey = "b7d8b1e7-f83a-4250-ab18-932678d3277a"
	}

	return &DoubaoProvider{
		APIKey:  apiKey,
		ModelID: "doubao-seed-2-0-pro-260215",
		BaseURL: "https://ark.cn-beijing.volces.com/api/v3/responses",
		Client: &http.Client{
			Timeout: 180 * time.Second,
		},
	}
}

type DoubaoMessage struct {
	Role    string          `json:"role"`
	Content []DoubaoContent `json:"content"`
}

type DoubaoContent struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	// 关键修复：在 v3/responses API 中，image_url 直接是字符串类型
	ImageURL string `json:"image_url,omitempty"` 
}

type DoubaoRequest struct {
	Model string          `json:"model"`
	Input []DoubaoMessage `json:"input"`
}

type DoubaoResponseV3 struct {
	Output []struct {
		Type    string `json:"type"`
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	} `json:"output"`
}

func (p *DoubaoProvider) Chat(text string, imageBase64 string) (string, error) {
	var contents []DoubaoContent
	
	if imageBase64 != "" {
		contents = append(contents, DoubaoContent{
			Type:     "input_image",
			ImageURL: imageBase64, // 直接传递 base64 字符串
		})
	}
	
	contents = append(contents, DoubaoContent{
		Type: "input_text",
		Text: text,
	})

	reqBody := DoubaoRequest{
		Model: p.ModelID,
		Input: []DoubaoMessage{{Role: "user", Content: contents}},
	}
	
	jsonData, _ := json.Marshal(reqBody)
	
	req, err := http.NewRequest("POST", p.BaseURL, bytes.NewBuffer(jsonData))
	if err != nil { return "", err }
	
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.APIKey)

	log.Printf("[AI] Sending multimodal request (string format), size: %d", len(jsonData))
	resp, err := p.Client.Do(req)
	if err != nil { return "", err }
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var v3Resp DoubaoResponseV3
	if err := json.Unmarshal(body, &v3Resp); err != nil {
		return "", fmt.Errorf("ark v3 unmarshal error: %v, raw: %s", err, string(body))
	}

	// 检查输出
	for _, out := range v3Resp.Output {
		if out.Type == "message" {
			for _, content := range out.Content {
				if content.Text != "" {
					return content.Text, nil
				}
			}
		}
	}
	
	return "", fmt.Errorf("AI 响应异常。原始返回: %s", string(body))
}

// GetEmbedding 保持不变，因为 Embedding API 的结构可能不同
func (p *DoubaoProvider) GetEmbedding(text string, imageBase64 string) ([]float32, error) {
	var inputs []DoubaoEmbeddingInput
	if text != "" { inputs = append(inputs, DoubaoEmbeddingInput{Type: "text", Text: text}) }
	if imageBase64 != "" { inputs = append(inputs, DoubaoEmbeddingInput{Type: "image_url", ImageURL: &DoubaoImageURL{URL: imageBase64}}) }

	reqBody := DoubaoEmbeddingRequest{
		Model: "doubao-embedding-vision-250615",
		Input: inputs,
	}

	jsonData, _ := json.Marshal(reqBody)
	url := "https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal"
	
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil { return nil, err }
	
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.APIKey)

	resp, err := p.Client.Do(req)
	if err != nil { return nil, err }
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var embedResp DoubaoEmbeddingResponse
	if err := json.Unmarshal(body, &embedResp); err != nil {
		return nil, err
	}
	return embedResp.Data.Embedding, nil
}

type DoubaoEmbeddingRequest struct {
	Model string                 `json:"model"`
	Input []DoubaoEmbeddingInput `json:"input"`
}

type DoubaoEmbeddingInput struct {
	Type     string            `json:"type"`
	Text     string            `json:"text,omitempty"`
	ImageURL *DoubaoImageURL   `json:"image_url,omitempty"`
}

type DoubaoImageURL struct {
	URL string `json:"url"`
}

type DoubaoEmbeddingResponse struct {
	Data DoubaoEmbeddingData `json:"data"`
}

type DoubaoEmbeddingData struct {
	Embedding []float32 `json:"embedding"`
}
