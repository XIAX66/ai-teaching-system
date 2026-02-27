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
	// Connect to Docker MySQL on port 3307 (mapped from 3306)
	dsn := "user:password@tcp(127.0.0.1:3307)/ai_teaching_db?charset=utf8mb4&parseTime=True&loc=Local"
	if envDSN := os.Getenv("MYSQL_DSN"); envDSN != "" {
		dsn = envDSN
	}

	var err error
	log.Println("Connecting to MySQL on port 3307...")
	DB, err = gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to MySQL: ", err)
	}

	log.Println("Connected to MySQL successfully.")

	// Auto Migrate
	err = DB.AutoMigrate(&model.User{}, &model.Textbook{}, &model.Video{}, &model.Resource{})
	if err != nil {
		log.Fatal("Failed to migrate database: ", err)
	}

	fmt.Println("Database migration completed.")
}

func initMongoDB() {
	uri := "mongodb://root:root_password@localhost:27017"
	if envURI := os.Getenv("MONGO_URI"); envURI != "" {
		uri = envURI
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var err error
	log.Println("Connecting to MongoDB on port 27017...")
	MongoClient, err = mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		log.Fatal("Failed to connect to MongoDB: ", err)
	}

	// Check connection
	err = MongoClient.Ping(ctx, nil)
	if err != nil {
		log.Fatal("Failed to ping MongoDB: ", err)
	}

	MongoDatabase = MongoClient.Database("ai_teaching_db")
	log.Println("Connected to MongoDB successfully.")
}