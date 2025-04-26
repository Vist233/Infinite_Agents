package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
)

// DeepSeek API 请求结构体
type DeepSeekRequest struct {
	Model    string          `json:"model"`
	Messages []Message       `json:"messages"`
	Stream   bool            `json:"stream"`
}

type DeepSeekResponse struct {
	ID      string   `json:"id"`
	Object  string   `json:"object"`
	Created int64    `json:"created"`
	Model   string   `json:"model"`
	Choices []Choice `json:"choices"`
	Usage   Usage    `json:"usage"`
}

type Choice struct {
	Index        int     `json:"index"`
	Message      Message `json:"message"`
	FinishReason string  `json:"finish_reason"`
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type Usage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

// 前端发送的聊天请求结构体
type ChatRequest struct {
	UserInput string `json:"userInput"`
	Agent     string `json:"agent"`
}

type ChatResponse struct {
	Reply string `json:"reply"`
}

// --- 全局变量 ---
var (
	apiKey    string
	apiKeyOnce sync.Once
)

// --- 初始化 ---
func init() {
	apiKeyOnce.Do(func() {
		apiKey = "sk-742ea2cb892f40e0aca39b579143400a"
		if apiKey == "" {
			log.Println("Warning: DEEPSEEK_API_KEY environment variable not set or key is empty.")
		}
	})
}

// --- Gin 处理函数 ---

// 处理根路径，渲染主 HTML 页面
func handleIndex(c *gin.Context) {
	data := gin.H{}
	c.HTML(http.StatusOK, "main.html", data)
}

// 处理聊天 API 请求
func handleChat(c *gin.Context) {
	if apiKey == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Server configuration error: API key not set"})
		return
	}

	var req ChatRequest
	if err := c.BindJSON(&req); err != nil {
		log.Printf("Error binding chat request: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Bad Request: " + err.Error()})
		return
	}

	if req.UserInput == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Bad Request: userInput cannot be empty"})
		return
	}

	modelID := "deepseek-chat"
	if req.Agent == "paperai" {
	} else if req.Agent == "chater" {
		modelID = "deepseek-chat"
	} else {
		log.Printf("Warning: Unknown agent type '%s', using default.", req.Agent)
	}

	messages := []Message{
		{Role: "user", Content: req.UserInput},
	}

	deepSeekReqPayload := DeepSeekRequest{
		Model:    modelID,
		Messages: messages,
		Stream:   false,
	}

	payloadBytes, err := json.Marshal(deepSeekReqPayload)
	if err != nil {
		log.Printf("Error marshalling DeepSeek request: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal Server Error"})
		return
	}

	apiURL := "https://api.deepseek.com/chat/completions"
	httpRequest, err := http.NewRequest("POST", apiURL, bytes.NewBuffer(payloadBytes))
	if err != nil {
		log.Printf("Error creating DeepSeek HTTP request: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal Server Error"})
		return
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{}
	httpResponse, err := client.Do(httpRequest)
	if err != nil {
		log.Printf("Error sending request to DeepSeek: %v", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Error communicating with AI service"})
		return
	}
	defer httpResponse.Body.Close()

	responseBody, err := io.ReadAll(httpResponse.Body)
	if err != nil {
		log.Printf("Error reading DeepSeek response body: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal Server Error"})
		return
	}

	if httpResponse.StatusCode != http.StatusOK {
		log.Printf("DeepSeek API Error: Status %d, Body: %s", httpResponse.StatusCode, string(responseBody))
		errorMsg := fmt.Sprintf("AI service error (Status: %d)", httpResponse.StatusCode)
		var deepSeekError map[string]interface{}
		if json.Unmarshal(responseBody, &deepSeekError) == nil {
			if msg, ok := deepSeekError["message"].(string); ok {
				errorMsg = fmt.Sprintf("AI service error: %s", msg)
			}
		}
		c.JSON(http.StatusBadGateway, gin.H{"reply": errorMsg})
		return
	}

	var deepSeekResp DeepSeekResponse
	if err := json.Unmarshal(responseBody, &deepSeekResp); err != nil {
		log.Printf("Error unmarshalling DeepSeek response: %v. Body: %s", err, string(responseBody))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Internal Server Error"})
		return
	}

	aiReply := "Sorry, I couldn't get a response."
	if len(deepSeekResp.Choices) > 0 && deepSeekResp.Choices[0].Message.Content != "" {
		aiReply = deepSeekResp.Choices[0].Message.Content
	}

	c.JSON(http.StatusOK, ChatResponse{Reply: aiReply})
}

// --- 主函数 ---
func main() {
	router := gin.Default()

	router.LoadHTMLGlob("app/*.html")
	router.Static("/static", "./app/static")

	router.GET("/", handleIndex)
	router.POST("/api/chat", handleChat)

	port := "8080"
	log.Printf("Starting Gin server on http://0.0.0.0:%s", port)
	err := router.Run(":" + port)
	if err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}


