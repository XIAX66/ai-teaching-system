package provider

import (
	"bufio"
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strings"
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
		ModelID: "doubao-seed-2-0-mini-260215",
		BaseURL: "https://ark.cn-beijing.volces.com/api/v3/responses",
		Client:  &http.Client{},
	}
}

func (p *DoubaoProvider) ChatStream(text string, imageBase64 string, onChunk func(string)) error {
	var contents []DoubaoMessageContent
	if imageBase64 != "" {
		contents = append(contents, DoubaoMessageContent{Type: "input_image", ImageURL: imageBase64})
	}
	contents = append(contents, DoubaoMessageContent{Type: "input_text", Text: text})

	reqBody := struct {
		Model  string          `json:"model"`
		Input  []DoubaoMessage `json:"input"`
		Stream bool            `json:"stream"`
	}{
		Model:  p.ModelID,
		Input:  []DoubaoMessage{{Role: "user", Content: contents}},
		Stream: true,
	}
	
	jsonData, _ := json.Marshal(reqBody)
	req, err := http.NewRequest("POST", p.BaseURL, bytes.NewBuffer(jsonData))
	if err != nil { return err }
	
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.APIKey)
	req.Header.Set("Accept", "text/event-stream")

	resp, err := p.Client.Do(req)
	if err != nil { return err }
	defer resp.Body.Close()

	reader := bufio.NewReader(resp.Body)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF { break }
			return err
		}

		// SSE 协议处理
		if !strings.HasPrefix(line, "data:") { continue }
		dataPart := strings.TrimPrefix(line, "data:")
		dataPart = strings.TrimSpace(dataPart)
		
		if dataPart == "[DONE]" || dataPart == "DONE" { break }

		var chunk struct {
			Type  string `json:"type"`
			Delta string `json:"delta"`
		}

		if err := json.Unmarshal([]byte(dataPart), &chunk); err != nil {
			continue
		}

		// 只有 delta 内容包才转发
		if chunk.Type == "response.output_text.delta" {
			// 发送原始 delta，不进行任何 trim
			onChunk(chunk.Delta)
		}
	}
	return nil
}

// 补全必要的结构体
type DoubaoMessage struct {
	Role    string                 `json:"role"`
	Content []DoubaoMessageContent `json:"content"`
}
type DoubaoMessageContent struct {
	Type     string `json:"type"`
	Text     string `json:"text,omitempty"`
	ImageURL string `json:"image_url,omitempty"`
}
func (p *DoubaoProvider) Chat(t string, i string) (string, error) { return "", nil }
func (p *DoubaoProvider) GetEmbedding(t string, i string) ([]float32, error) { return nil, nil }
type DoubaoEmbeddingRequest struct { Model string; Input []struct{ Type string; Text string; ImageURL *struct{ URL string } } }
type DoubaoEmbeddingResponse struct { Data struct { Embedding []float32 } }
