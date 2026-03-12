package global

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"ai-teaching-system/internal/model"

	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
)

var DB *gorm.DB
var MongoClient *mongo.Client
var MongoDatabase *mongo.Database

func InitDB() {
	initMySQL()
	initMongoDB()
}

func initMySQL() {
	// 关键修复：在 Docker 内部应连接到 mysql 容器名，端口为 3306
	dsn := "user:password@tcp(mysql:3306)/ai_teaching_db?charset=utf8mb4&parseTime=True&loc=Local"
	if envDSN := os.Getenv("MYSQL_DSN"); envDSN != "" {
		dsn = envDSN
	}

	var err error
	log.Printf("Connecting to MySQL using DSN: %s", dsn)
	
	// 增加重试机制，防止数据库启动慢导致后端崩溃
	for i := 0; i < 10; i++ {
		DB, err = gorm.Open(mysql.Open(dsn), &gorm.Config{})
		if err == nil {
			break
		}
		log.Printf("MySQL not ready, retrying in 2s... (%d/10)", i+1)
		time.Sleep(2 * time.Second)
	}

	if err != nil {
		log.Fatal("Failed to connect to MySQL after retries: ", err)
	}

	log.Println("Connected to MySQL successfully.")

	// Auto Migrate
	_ = DB.AutoMigrate(&model.User{}, &model.Textbook{}, &model.Video{}, &model.Resource{})
	fmt.Println("Database migration completed.")
}

func initMongoDB() {
	// 关键修复：Docker 内部连接到 mongo 容器名
	uri := "mongodb://root:root_password@mongo:27017"
	if envURI := os.Getenv("MONGO_URI"); envURI != "" {
		uri = envURI
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var err error
	log.Printf("Connecting to MongoDB using URI: %s", uri)
	
	MongoClient, err = mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		log.Fatal("Failed to connect to MongoDB: ", err)
	}

	err = MongoClient.Ping(ctx, nil)
	if err != nil {
		log.Fatal("Failed to ping MongoDB: ", err)
	}

	MongoDatabase = MongoClient.Database("ai_teaching_db")
	log.Println("Connected to MongoDB successfully.")
}
