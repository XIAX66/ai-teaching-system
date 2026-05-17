package service

import (
	"ai-teaching-system/internal/ai/provider"
	"ai-teaching-system/internal/global"
	"ai-teaching-system/internal/model"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sort"
	"strconv"
	"strings"

	"github.com/neo4j/neo4j-go-driver/v5/neo4j"
)

type KnowledgePoint struct {
	Name          string   `json:"name"`
	Description   string   `json:"description"`
	SourceSnippet string   `json:"source_snippet"`
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

type mergedKnowledgePoint struct {
	Name           string
	Summaries      []string
	SourceSnippets []string
	Prerequisites  []string
	SortOrder      int
}

type extractionBudget struct {
	ChunkSize          int
	MaxChunks          int
	MinPointsPerChunk  int
	MaxPointsPerChunk  int
	MaxKnowledgePoints int
	RefineSummaryLimit int
}

func NewGraphService() *GraphService {
	return &GraphService{
		doubao: provider.NewDoubaoProvider(),
	}
}

func (s *GraphService) ExtractAndStoreKG(textbookID uint, textbookTitle string, text string) error {
	log.Printf("[GraphService] Starting KG extraction for textbook %d: %s", textbookID, textbookTitle)

	budget := buildExtractionBudget(text)
	chunks := selectChunksForBudget(chunkText(text, budget.ChunkSize), budget.MaxChunks)
	candidates := make([]KnowledgePoint, 0)
	for idx, chunk := range chunks {
		extracted, err := s.extractCandidatesFromChunk(textbookTitle, chunk, idx+1, len(chunks), budget)
		if err != nil {
			log.Printf("[GraphService] Chunk %d extraction failed: %v", idx+1, err)
			continue
		}
		candidates = append(candidates, extracted...)
	}

	if len(candidates) == 0 {
		candidates = fallbackKnowledgePoints(text)
	}

	merged := mergeKnowledgePoints(candidates)
	if len(merged) == 0 {
		return nil
	}
	if len(merged) > budget.MaxKnowledgePoints {
		merged = merged[:budget.MaxKnowledgePoints]
	}

	persisted, err := s.persistKnowledgePoints(textbookID, textbookTitle, merged, budget)
	if err != nil {
		return err
	}

	if err := s.persistToNeo4j(textbookID, textbookTitle, persisted); err != nil {
		return err
	}

	log.Printf("[GraphService] Successfully persisted KG for textbook %d", textbookID)
	return nil
}

func (s *GraphService) GetGraph(textbookID uint) (*GraphData, error) {
	if global.Neo4jDriver != nil {
		graph, err := s.getGraphFromNeo4j(textbookID)
		if err == nil && graph != nil && len(graph.Nodes) > 0 {
			return graph, nil
		}
		if err != nil {
			log.Printf("[GraphService] Neo4j graph fetch failed, falling back to MySQL: %v", err)
		}
	}
	return s.getGraphFromMySQL(textbookID)
}

func (s *GraphService) extractCandidatesFromChunk(textbookTitle string, chunk string, index int, total int, budget extractionBudget) ([]KnowledgePoint, error) {
	if strings.TrimSpace(chunk) == "" {
		return nil, nil
	}

	prompt := fmt.Sprintf(`你是一名教学知识图谱构建助手。请从下面这段教材内容中抽取 %d-%d 个核心知识点。

教材名称：%s
分块位置：第 %d/%d 段
教材内容：
%s

要求：
1. 只输出 JSON 数组，不能有任何额外说明。
2. 每个对象必须包含：
   - "name": 知识点名称
   - "description": 80-160 字左右的中文总结
   - "source_snippet": 1 段最能支撑该知识点的原文摘录
   - "prerequisites": 前置知识点名称数组，没有可为空数组
3. 优先保留主干知识点，不要过细切分。
4. 知识点名称尽量简洁，不要出现“知识点一”这类泛化名称。`, budget.MinPointsPerChunk, budget.MaxPointsPerChunk, textbookTitle, index, total, chunk)

	resp, err := s.doubao.Chat(prompt, "")
	if err != nil {
		return nil, err
	}

	points, err := parseKnowledgePointJSON(resp)
	if err != nil {
		return nil, err
	}

	filtered := make([]KnowledgePoint, 0, len(points))
	for _, point := range points {
		if strings.TrimSpace(point.Name) == "" {
			continue
		}
		filtered = append(filtered, point)
	}
	return filtered, nil
}

func (s *GraphService) persistKnowledgePoints(textbookID uint, textbookTitle string, merged []mergedKnowledgePoint, budget extractionBudget) ([]model.KnowledgePoint, error) {
	var existing []model.KnowledgePoint
	if err := global.DB.Where("textbook_id = ?", textbookID).Find(&existing).Error; err != nil {
		return nil, err
	}

	existingByName := make(map[string]model.KnowledgePoint, len(existing))
	for _, item := range existing {
		existingByName[normalizeKnowledgePointName(item.Name)] = item
	}

	tx := global.DB.Begin()
	if tx.Error != nil {
		return nil, tx.Error
	}

	seenIDs := make(map[uint]struct{})
	persisted := make([]model.KnowledgePoint, 0, len(merged))
	for idx, item := range merged {
		summary := s.refineSummary(textbookTitle, item, idx < budget.RefineSummaryLimit)
		sourceJSON := marshalStringArray(item.SourceSnippets)
		prerequisiteJSON := marshalStringArray(item.Prerequisites)
		key := normalizeKnowledgePointName(item.Name)

		record, ok := existingByName[key]
		if ok {
			record.Name = item.Name
			record.Summary = summary
			record.SourceSnippets = sourceJSON
			record.PrerequisiteNames = prerequisiteJSON
			record.SortOrder = idx
			if err := tx.Save(&record).Error; err != nil {
				tx.Rollback()
				return nil, err
			}
		} else {
			record = model.KnowledgePoint{
				TextbookID:        textbookID,
				Name:              item.Name,
				Summary:           summary,
				SourceSnippets:    sourceJSON,
				PrerequisiteNames: prerequisiteJSON,
				SortOrder:         idx,
			}
			if err := tx.Create(&record).Error; err != nil {
				tx.Rollback()
				return nil, err
			}
		}

		seenIDs[record.ID] = struct{}{}
		persisted = append(persisted, record)
	}

	staleIDs := make([]uint, 0)
	for _, item := range existing {
		if _, ok := seenIDs[item.ID]; !ok {
			staleIDs = append(staleIDs, item.ID)
		}
	}
	if len(staleIDs) > 0 {
		if err := tx.Model(&model.Resource{}).
			Where("knowledge_point_id IN ?", staleIDs).
			Updates(map[string]interface{}{"knowledge_point_id": nil}).Error; err != nil {
			tx.Rollback()
			return nil, err
		}
		if err := tx.Where("id IN ?", staleIDs).Delete(&model.KnowledgePoint{}).Error; err != nil {
			tx.Rollback()
			return nil, err
		}
	}

	if err := tx.Commit().Error; err != nil {
		return nil, err
	}
	return persisted, nil
}

func (s *GraphService) refineSummary(textbookTitle string, item mergedKnowledgePoint, shouldRefine bool) string {
	base := strings.Join(uniqueNonEmpty(append([]string{}, item.Summaries...)), "\n")
	snippet := strings.Join(uniqueNonEmpty(append([]string{}, item.SourceSnippets...)), "\n")
	fallback := strings.TrimSpace(strings.Join([]string{base, snippet}, "\n\n"))
	if fallback == "" {
		fallback = fmt.Sprintf("%s 是《%s》中的核心知识点。", item.Name, textbookTitle)
	}
	if s.doubao == nil || !shouldRefine {
		return fallback
	}

	prompt := fmt.Sprintf(`请根据以下教材知识点信息，整理出一段 120-220 字的中文学习总结。

教材：%s
知识点：%s
已有总结：
%s

来源片段：
%s

要求：
1. 只输出最终总结正文。
2. 语言适合学生阅读。
3. 保留关键定义、作用和学习提示。`, textbookTitle, item.Name, base, snippet)

	resp, err := s.doubao.Chat(prompt, "")
	if err != nil {
		return fallback
	}
	if summary := strings.TrimSpace(resp); summary != "" {
		return summary
	}
	return fallback
}

func (s *GraphService) persistToNeo4j(textbookID uint, title string, points []model.KnowledgePoint) error {
	if global.Neo4jDriver == nil {
		return nil
	}

	ctx := context.Background()
	session := global.Neo4jDriver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeWrite})
	defer session.Close(ctx)

	_, err := session.ExecuteWrite(ctx, func(tx neo4j.ManagedTransaction) (interface{}, error) {
		tid := int64(textbookID)
		_, _ = tx.Run(ctx, "MATCH (k:KnowledgePoint {textbookId: $tid}) DETACH DELETE k", map[string]interface{}{"tid": tid})

		_, err := tx.Run(ctx,
			"MERGE (t:Textbook {id: $id}) SET t.title = $title",
			map[string]interface{}{"id": tid, "title": title})
		if err != nil {
			return nil, err
		}

		for _, point := range points {
			_, err = tx.Run(ctx, `
				MERGE (k:KnowledgePoint {knowledgePointId: $knowledgePointId, textbookId: $textbookId})
				SET k.name = $name, k.summary = $summary
				WITH k
				MATCH (t:Textbook {id: $textbookId})
				MERGE (k)-[:BELONGS_TO]->(t)
			`, map[string]interface{}{
				"knowledgePointId": int64(point.ID),
				"textbookId":       tid,
				"name":             point.Name,
				"summary":          point.Summary,
			})
			if err != nil {
				return nil, err
			}
		}

		nameToID := make(map[string]int64, len(points))
		for _, point := range points {
			nameToID[normalizeKnowledgePointName(point.Name)] = int64(point.ID)
		}

		for _, point := range points {
			for _, prerequisite := range unmarshalStringArray(point.PrerequisiteNames) {
				preID, ok := nameToID[normalizeKnowledgePointName(prerequisite)]
				if !ok {
					continue
				}
				_, err = tx.Run(ctx, `
					MATCH (a:KnowledgePoint {knowledgePointId: $preId, textbookId: $textbookId})
					MATCH (b:KnowledgePoint {knowledgePointId: $pointId, textbookId: $textbookId})
					MERGE (a)-[:PREREQUISITE_OF]->(b)
				`, map[string]interface{}{
					"preId":      preID,
					"pointId":    int64(point.ID),
					"textbookId": tid,
				})
				if err != nil {
					return nil, err
				}
			}
		}
		return nil, nil
	})
	return err
}

func (s *GraphService) getGraphFromNeo4j(textbookID uint) (*GraphData, error) {
	ctx := context.Background()
	session := global.Neo4jDriver.NewSession(ctx, neo4j.SessionConfig{AccessMode: neo4j.AccessModeRead})
	defer session.Close(ctx)

	tid := int64(textbookID)
	result, err := session.ExecuteRead(ctx, func(tx neo4j.ManagedTransaction) (interface{}, error) {
		res, err := tx.Run(ctx, `
			MATCH (k:KnowledgePoint {textbookId: $tid})
			OPTIONAL MATCH (k)-[r:PREREQUISITE_OF]->(target:KnowledgePoint {textbookId: $tid})
			RETURN k, r, target
		`, map[string]interface{}{"tid": tid})
		if err != nil {
			return nil, err
		}

		nodesMap := make(map[string]GraphNode)
		elementToStableID := make(map[string]string)
		links := make([]GraphLink, 0)
		for res.Next(ctx) {
			record := res.Record()
			if nodeVal, ok := record.Get("k"); ok && nodeVal != nil {
				node := nodeVal.(neo4j.Node)
				kpID := neoIntToString(node.Props["knowledgePointId"])
				elementToStableID[node.ElementId] = kpID
				nodesMap[kpID] = GraphNode{
					ID:    kpID,
					Label: stringValue(node.Props["name"]),
					Props: map[string]interface{}{
						"knowledgePointId": kpID,
						"summary":          stringValue(node.Props["summary"]),
						"name":             stringValue(node.Props["name"]),
					},
				}
			}
			if targetVal, ok := record.Get("target"); ok && targetVal != nil {
				targetNode := targetVal.(neo4j.Node)
				targetID := neoIntToString(targetNode.Props["knowledgePointId"])
				elementToStableID[targetNode.ElementId] = targetID
				nodesMap[targetID] = GraphNode{
					ID:    targetID,
					Label: stringValue(targetNode.Props["name"]),
					Props: map[string]interface{}{
						"knowledgePointId": targetID,
						"summary":          stringValue(targetNode.Props["summary"]),
						"name":             stringValue(targetNode.Props["name"]),
					},
				}
			}
			if relVal, ok := record.Get("r"); ok && relVal != nil {
				rel := relVal.(neo4j.Relationship)
				startID := elementToStableID[rel.StartElementId]
				endID := elementToStableID[rel.EndElementId]
				if startID != "" && endID != "" {
					links = append(links, GraphLink{
						Source: startID,
						Target: endID,
						Type:   "PREREQUISITE_OF",
					})
				}
			}
		}
		if err := res.Err(); err != nil {
			return nil, err
		}

		nodes := make([]GraphNode, 0, len(nodesMap))
		for _, node := range nodesMap {
			nodes = append(nodes, node)
		}
		sort.Slice(nodes, func(i, j int) bool {
			return nodes[i].ID < nodes[j].ID
		})
		return &GraphData{Nodes: nodes, Links: links}, nil
	})
	if err != nil {
		return nil, err
	}
	return result.(*GraphData), nil
}

func (s *GraphService) getGraphFromMySQL(textbookID uint) (*GraphData, error) {
	var points []model.KnowledgePoint
	if err := global.DB.Where("textbook_id = ?", textbookID).Order("sort_order asc, id asc").Find(&points).Error; err != nil {
		return nil, err
	}

	nameToID := make(map[string]string, len(points))
	nodes := make([]GraphNode, 0, len(points))
	for _, point := range points {
		id := strconv.FormatUint(uint64(point.ID), 10)
		nameToID[normalizeKnowledgePointName(point.Name)] = id
		nodes = append(nodes, GraphNode{
			ID:    id,
			Label: point.Name,
			Props: map[string]interface{}{
				"knowledgePointId": id,
				"name":             point.Name,
				"summary":          point.Summary,
			},
		})
	}

	links := make([]GraphLink, 0)
	for _, point := range points {
		targetID := strconv.FormatUint(uint64(point.ID), 10)
		for _, prerequisite := range unmarshalStringArray(point.PrerequisiteNames) {
			sourceID, ok := nameToID[normalizeKnowledgePointName(prerequisite)]
			if !ok {
				continue
			}
			links = append(links, GraphLink{
				Source: sourceID,
				Target: targetID,
				Type:   "PREREQUISITE_OF",
			})
		}
	}
	return &GraphData{Nodes: nodes, Links: links}, nil
}

func parseKnowledgePointJSON(raw string) ([]KnowledgePoint, error) {
	start := strings.Index(raw, "[")
	end := strings.LastIndex(raw, "]")
	if start == -1 || end == -1 || end < start {
		return nil, fmt.Errorf("no json array found")
	}

	var points []KnowledgePoint
	if err := json.Unmarshal([]byte(raw[start:end+1]), &points); err != nil {
		return nil, err
	}
	return points, nil
}

func chunkText(text string, maxRunes int) []string {
	paragraphs := strings.FieldsFunc(text, func(r rune) bool {
		return r == '\n' || r == '\r'
	})

	chunks := make([]string, 0)
	current := make([]string, 0)
	currentLen := 0

	flush := func() {
		if len(current) == 0 {
			return
		}
		chunks = append(chunks, strings.TrimSpace(strings.Join(current, "\n")))
		current = nil
		currentLen = 0
	}

	for _, paragraph := range paragraphs {
		paragraph = strings.TrimSpace(paragraph)
		if paragraph == "" {
			continue
		}

		runeLen := len([]rune(paragraph))
		if runeLen > maxRunes {
			flush()
			runes := []rune(paragraph)
			for start := 0; start < len(runes); start += maxRunes {
				end := start + maxRunes
				if end > len(runes) {
					end = len(runes)
				}
				chunks = append(chunks, string(runes[start:end]))
			}
			continue
		}

		if currentLen+runeLen > maxRunes {
			flush()
		}
		current = append(current, paragraph)
		currentLen += runeLen
	}
	flush()

	if len(chunks) == 0 && strings.TrimSpace(text) != "" {
		chunks = append(chunks, strings.TrimSpace(text))
	}
	return chunks
}

func buildExtractionBudget(text string) extractionBudget {
	runeCount := len([]rune(text))
	switch {
	case runeCount <= 20_000:
		return extractionBudget{
			ChunkSize:          2600,
			MaxChunks:          10,
			MinPointsPerChunk:  3,
			MaxPointsPerChunk:  5,
			MaxKnowledgePoints: 20,
			RefineSummaryLimit: 10,
		}
	case runeCount <= 80_000:
		return extractionBudget{
			ChunkSize:          3600,
			MaxChunks:          8,
			MinPointsPerChunk:  2,
			MaxPointsPerChunk:  4,
			MaxKnowledgePoints: 14,
			RefineSummaryLimit: 6,
		}
	default:
		return extractionBudget{
			ChunkSize:          5200,
			MaxChunks:          6,
			MinPointsPerChunk:  1,
			MaxPointsPerChunk:  3,
			MaxKnowledgePoints: 10,
			RefineSummaryLimit: 0,
		}
	}
}

func selectChunksForBudget(chunks []string, maxChunks int) []string {
	if len(chunks) <= maxChunks || maxChunks <= 0 {
		return chunks
	}

	selected := make([]string, 0, maxChunks)
	lastIndex := -1
	for i := 0; i < maxChunks; i++ {
		idx := int(float64(i) * float64(len(chunks)-1) / float64(maxChunks-1))
		if idx == lastIndex {
			continue
		}
		selected = append(selected, chunks[idx])
		lastIndex = idx
	}
	return selected
}

func mergeKnowledgePoints(points []KnowledgePoint) []mergedKnowledgePoint {
	mergedMap := make(map[string]*mergedKnowledgePoint)
	for idx, point := range points {
		name := strings.TrimSpace(point.Name)
		if name == "" {
			continue
		}

		key := normalizeKnowledgePointName(name)
		item, ok := mergedMap[key]
		if !ok {
			item = &mergedKnowledgePoint{
				Name:      name,
				SortOrder: idx,
			}
			mergedMap[key] = item
		}

		item.Summaries = append(item.Summaries, strings.TrimSpace(point.Description))
		item.SourceSnippets = append(item.SourceSnippets, strings.TrimSpace(point.SourceSnippet))
		item.Prerequisites = append(item.Prerequisites, uniqueNonEmpty(point.Prerequisites)...)
		if idx < item.SortOrder {
			item.SortOrder = idx
		}
	}

	merged := make([]mergedKnowledgePoint, 0, len(mergedMap))
	for _, item := range mergedMap {
		item.Summaries = uniqueNonEmpty(item.Summaries)
		item.SourceSnippets = uniqueNonEmpty(item.SourceSnippets)
		item.Prerequisites = uniqueNonEmpty(item.Prerequisites)
		merged = append(merged, *item)
	}

	sort.Slice(merged, func(i, j int) bool {
		if merged[i].SortOrder == merged[j].SortOrder {
			return merged[i].Name < merged[j].Name
		}
		return merged[i].SortOrder < merged[j].SortOrder
	})
	return merged
}

func fallbackKnowledgePoints(text string) []KnowledgePoint {
	lines := strings.FieldsFunc(text, func(r rune) bool {
		return r == '\n' || r == '\r'
	})

	points := make([]KnowledgePoint, 0, 5)
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if len([]rune(line)) < 4 {
			continue
		}

		name := line
		runes := []rune(name)
		if len(runes) > 20 {
			name = string(runes[:20])
		}

		points = append(points, KnowledgePoint{
			Name:          name,
			Description:   line,
			SourceSnippet: line,
			Prerequisites: []string{},
		})
		if len(points) >= 5 {
			break
		}
	}
	return points
}

func marshalStringArray(items []string) string {
	data, _ := json.Marshal(uniqueNonEmpty(items))
	return string(data)
}

func uniqueNonEmpty(items []string) []string {
	seen := make(map[string]struct{})
	result := make([]string, 0, len(items))
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		key := normalizeKnowledgePointName(trimmed)
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, trimmed)
	}
	return result
}

func stringValue(value interface{}) string {
	if s, ok := value.(string); ok {
		return s
	}
	return ""
}

func neoIntToString(value interface{}) string {
	switch v := value.(type) {
	case int64:
		return strconv.FormatInt(v, 10)
	case int:
		return strconv.Itoa(v)
	case string:
		return v
	default:
		return ""
	}
}
