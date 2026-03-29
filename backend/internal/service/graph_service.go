package service

import (
	"ai-teaching-system/internal/ai/provider"
	"ai-teaching-system/internal/global"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type KnowledgePoint struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Prerequisites []string `json:"prerequisites"` 
}

type GraphNode struct {
	ID    string                 `json:"id"`
	Label string                 `json:"label"`
	Props map[string]interface{} `json:"props"`
}

type GraphLink struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Type   string `json:"type"`
}

type GraphData struct {
	Nodes []GraphNode `json:"nodes"`
	Links []GraphLink `json:"links"`
}

type GraphService struct {
	doubao *provider.DoubaoProvider
}

func NewGraphService() *GraphService {
	return &GraphService{
		doubao: provider.NewDoubaoProvider(),
	}
}

func (s *GraphService) ExtractAndStoreKG(textbookID uint, textbookTitle string, text string) error {
	log.Printf("[GraphService] Starting KG extraction for textbook %d: %s", textbookID, textbookTitle)

	runes := []rune(text)
	if len(runes) > 10000 { runes = runes[:10000] }
	
	prompt := fmt.Sprintf(`作为教育专家，请从以下教材内容中提取 5-8 个核心知识点。
教材名称：%s
内容片段：%s

要求：
1. 输出格式必须是纯 JSON 数组，严禁任何解释性文字。
2. 每个知识点对象包含: "name" (知识点名称), "description" (简要描述), "prerequisites" (前置知识点名称数组)。`, textbookTitle, string(runes))

	resp, err := s.doubao.Chat(prompt, "")
	if err != nil { return err }

	jsonStart := strings.Index(resp, "[")
	jsonEnd := strings.LastIndex(resp, "]")
	if jsonStart == -1 || jsonEnd == -1 { return fmt.Errorf("no json array found") }
	cleanJSON := resp[jsonStart : jsonEnd+1]

	var kps []KnowledgePoint
	if err := json.Unmarshal([]byte(cleanJSON), &kps); err != nil { return err }

	return s.persistToNeo4j(textbookID, textbookTitle, kps)
}

func (s *GraphService) persistToNeo4j(textbookID uint, title string, kps []KnowledgePoint) error {
	if global.Neo4jDriver == nil { return fmt.Errorf("neo4j not ready") }

	ctx := context.Background()
	session := global.Neo4jDriver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (interface{}, error) {
		// 强制转换为 int64 以确保 Neo4j 存储类型一致
		tid := int64(textbookID)

		// 清理旧数据
		_, _ = tx.Run(ctx, "MATCH (k:KnowledgePoint {textbookId: $tid}) DETACH DELETE k", map[string]interface{}{"tid": tid})

		// 1. 教材节点
		_, err := tx.Run(ctx, 
			"MERGE (t:Textbook {id: $id}) SET t.title = $title", 
			map[string]interface{}{"id": tid, "title": title})
		if err != nil { return nil, err }

		// 2. 知识点节点
		for _, kp := range kps {
			_, err = tx.Run(ctx, 
				"MERGE (k:KnowledgePoint {name: $name, textbookId: $tid}) SET k.description = $desc",
				map[string]interface{}{"name": kp.Name, "tid": tid, "desc": kp.Description})
			if err != nil { return nil, err }

			_, err = tx.Run(ctx,
				"MATCH (t:Textbook {id: $tid}), (k:KnowledgePoint {name: $name, textbookId: $tid}) MERGE (k)-[:BELONGS_TO]->(t)",
				map[string]interface{}{"tid": tid, "name": kp.Name})
			if err != nil { return nil, err }
		}

		// 3. 关系
		for _, kp := range kps {
			for _, pre := range kp.Prerequisites {
				_, err = tx.Run(ctx,
					"MATCH (a:KnowledgePoint {name: $pre, textbookId: $tid}), (b:KnowledgePoint {name: $name, textbookId: $tid}) MERGE (a)-[:PREREQUISITE_OF]->(b)",
					map[string]interface{}{"tid": tid, "pre": pre, "name": kp.Name})
				if err != nil { return nil, err }
			}
		}
		return nil, nil
	})

	if err == nil {
		log.Printf("[GraphService] Successfully persisted KG for ID %d", textbookID)
	}
	return err
}

func (s *GraphService) GetGraph(textbookID uint) (*GraphData, error) {
	if global.Neo4jDriver == nil { return nil, fmt.Errorf("neo4j not ready") }
	ctx := context.Background()
	session := global.Neo4jDriver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	tid := int64(textbookID)
	log.Printf("[GraphService] Fetching graph for textbookId: %d", tid)

	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (interface{}, error) {
		cypher := `
			MATCH (k:KnowledgePoint {textbookId: $tid})
			OPTIONAL MATCH (k)-[r:PREREQUISITE_OF]->(target:KnowledgePoint {textbookId: $tid})
			RETURN k, r, target
		`
		res, err := tx.Run(ctx, cypher, map[string]interface{}{"tid": tid})
		if err != nil { return nil, err }

		nodesMap := make(map[string]GraphNode)
		var links []GraphLink

		count := 0
		for res.Next(ctx) {
			count++
			record := res.Record()
			if nodeVal, ok := record.Get("k"); ok && nodeVal != nil {
				knode := nodeVal.(neo4j.Node)
				id := knode.ElementId
				nodesMap[id] = GraphNode{
					ID: id, Label: knode.Props["name"].(string), Props: knode.Props,
				}
			}
			if relVal, ok := record.Get("r"); ok && relVal != nil {
				krel := relVal.(neo4j.Relationship)
				links = append(links, GraphLink{
					Source: krel.StartElementId, Target: krel.EndElementId, Type: "PREREQUISITE_OF",
				})
			}
		}
		
		log.Printf("[GraphService] Query found %d records, resulting in %d nodes", count, len(nodesMap))

		var nodes []GraphNode
		for _, n := range nodesMap { nodes = append(nodes, n) }
		return &GraphData{Nodes: nodes, Links: links}, nil
	})
	if err != nil { return nil, err }
	return result.(*GraphData), nil
}
