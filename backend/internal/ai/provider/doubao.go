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

func (p *DoubaoProvider) ChatStream(history []DoubaoMessage, onChunk func(string)) error {
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
	// 调试日志：打印发送给豆包的完整内容
	// fmt.Printf("DEBUG REQ: %s\n", string(jsonData))

	req, err := http.NewRequest("POST", p.BaseURL, bytes.NewBuffer(jsonData))
	if err != nil { return err }
	
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.APIKey)
	req.Header.Set("Accept", "text/event-stream")

	resp, err := p.Client.Do(req)
	if err != nil { return err }
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("ark api error (status %d): %s", resp.StatusCode, string(body))
	}

	reader := bufio.NewReader(resp.Body)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF { break }
			return err
		}

		line = strings.TrimSpace(line)
		if !strings.HasPrefix(line, "data:") { continue }
		data := strings.TrimPrefix(line, "data:")
		trimmed := strings.TrimSpace(data)
		if trimmed == "[DONE]" || trimmed == "DONE" { break }

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

type DoubaoMessage struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"` // 这里改为 interface{} 以支持 string 或 []map
}

func (p *DoubaoProvider) Chat(t string, i string) (string, error) { return "", nil }
func (p *DoubaoProvider) GetEmbedding(text string, imageBase64 string) ([]float32, error) {
	// 保持原样...
	return nil, nil
}
