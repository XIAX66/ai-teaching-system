package mongo

// VideoTranscript represents the parsed text from a video
type VideoTranscript struct {
	VideoID  uint           `bson:"video_id" json:"video_id"`
	Segments []VideoSegment `bson:"segments" json:"segments"`
}

type VideoSegment struct {
	SegmentID string  `bson:"segment_id" json:"segment_id"`
	StartTime float64 `bson:"start_time" json:"start_time"` // In seconds
	EndTime   float64 `bson:"end_time" json:"end_time"`     // In seconds
	Text      string  `bson:"text" json:"text"`
}
