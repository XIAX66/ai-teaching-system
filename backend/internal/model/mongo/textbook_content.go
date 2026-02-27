package mongo

// TextbookContent represents the structured content of a textbook in MongoDB
type TextbookContent struct {
	TextbookID uint      `bson:"textbook_id" json:"textbook_id"`
	Chapters   []Chapter `bson:"chapters" json:"chapters"`
}

type Chapter struct {
	ChapterID string    `bson:"chapter_id" json:"chapter_id"`
	Title     string    `bson:"title" json:"title"`
	Sections  []Section `bson:"sections" json:"sections"`
}

type Section struct {
	SectionID string      `bson:"section_id" json:"section_id"`
	Title     string      `bson:"title" json:"title"`
	Content   string      `bson:"content" json:"content"` // Full text content
	Blocks    []TextBlock `bson:"blocks" json:"blocks"`
}

type TextBlock struct {
	BlockID string `bson:"block_id" json:"block_id"`
	Text    string `bson:"text" json:"text"`
	Order   int    `bson:"order" json:"order"`
}
