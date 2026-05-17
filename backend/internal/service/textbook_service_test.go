package service

import (
	"reflect"
	"testing"
)

func TestParseAllowedStudentIDs(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		raw      string
		explicit []string
		want     []string
	}{
		{
			name:     "extracts ids from mixed separators and text",
			raw:      "一班学生：12, 7\n张三(42)；李四：10086",
			explicit: nil,
			want:     []string{"7", "12", "42", "10086"},
		},
		{
			name:     "deduplicates and normalizes leading zeros",
			raw:      "001, 1, 0002",
			explicit: []string{"2", "学生编号 0002", "3"},
			want:     []string{"1", "2", "3"},
		},
		{
			name:     "ignores empty and non numeric input",
			raw:      "张三、李四、王五",
			explicit: []string{"", "abc"},
			want:     []string{},
		},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			got := ParseAllowedStudentIDs(tt.raw, tt.explicit)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("ParseAllowedStudentIDs() = %v, want %v", got, tt.want)
			}
		})
	}
}
