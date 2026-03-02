package provider

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
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
			// 对流式输出，我们不设置总超时，由 context 控制
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
	ImageURL string `json:"image_url,omitempty"`
}

type DoubaoRequest struct {
	Model  string          `json:"model"`
	Input  []DoubaoMessage `json:"input"`
	Stream bool            `json:"stream,omitempty"`
}

// 流式响应的结构
type DoubaoStreamChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
}

// 兼容 Ark V3 模式的流输出结构
type DoubaoV3Chunk struct {
	Output []struct {
		Type    string `json:"type"`
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	} `json:"output"`
}

func (p *DoubaoProvider) ChatStream(text string, imageBase64 string, onChunk func(string)) error {
	var contents []DoubaoContent
	if imageBase64 != "" {
		contents = append(contents, DoubaoContent{Type: "input_image", ImageURL: imageBase64})
	}
	contents = append(contents, DoubaoContent{Type: "input_text", Text: text})

	reqBody := DoubaoRequest{
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

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("doubao api error: %s", string(body))
	}

	reader := bufio.NewReader(resp.Body)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF { break }
			return err
		}

		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "data:") { continue }
		
		data := strings.TrimPrefix(line, "data:")
		if data == "[DONE]" { break }

		var chunk DoubaoV3Chunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			log.Printf("Parse chunk error: %v", err)
			continue
		}

		for _, out := range chunk.Output {
			for _, content := range out.Content {
				if content.Text != "" {
					onChunk(content.Text)
				}
			}
		}
	}
	return nil
}

// 保留原有的 Chat 方法供非流式调用
func (p *DoubaoProvider) Chat(text string, imageBase64 string) (string, error) {
	var contents []DoubaoContent
	if imageBase64 != "" {
		contents = append(contents, DoubaoContent{Type: "input_image", ImageURL: imageBase64})
	}
	contents = append(contents, DoubaoContent{Type: "input_text", Text: text})

	reqBody := DoubaoRequest{Model: p.ModelID, Input: []DoubaoMessage{{Role: "user", Content: contents}}}
	jsonData, _ := json.Marshal(reqBody)
	
	req, err := http.NewRequest("POST", p.BaseURL, bytes.NewBuffer(jsonData))
	if err != nil { return "", err }
	
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.APIKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil { return "", err }
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	// 解析逻辑同之前...
	var v3Resp struct {
		Output []struct {
			Type    string `json:"type"`
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
		} `json:"output"`
	}
	json.Unmarshal(body, &v3Resp)
	if len(v3Resp.Output) > 0 && len(v3Resp.Output[0].Content) > 0 {
		return v3Resp.Output[0].Content[0].Text, nil
	}
	return "", fmt.Errorf("no answer. raw: %s", string(body))
}

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