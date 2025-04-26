package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync" // 用于 API Key 的惰性加载
)

// DeepSeek API 请求结构体
type DeepSeekRequest struct {
	Model    string          `json:"model"`
	Messages []Message       `json:"messages"`
	Stream   bool            `json:"stream"` // 明确设置为 false
	// 可以添加其他 DeepSeek 支持的参数，例如 temperature, max_tokens 等
}

// DeepSeek API 响应结构体 (非流式)
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
	Role    string `json:"role"` // "user" or "assistant"
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
	Agent     string `json:"agent"` // "paperai" or "chater"
	// 可以添加历史消息 history []Message
}

// 发送给前端的聊天响应结构体
type ChatResponse struct {
	Reply string `json:"reply"`
}

// --- 全局变量 ---
var (
	templates *template.Template
	apiKey    string
	apiKeyOnce sync.Once
)

// --- 初始化 ---
func init() {
	// 解析模板文件
	// 注意：路径相对于项目根目录或运行 `go run` 的目录
	// 确保 app 目录包含 HTML 文件
	templateFiles, err := filepath.Glob("app/*.html") // 修改路径以匹配 app/*.html
	if err != nil || len(templateFiles) == 0 {
		// 如果 Glob 成功但未找到文件，err 为 nil，但 len(templateFiles) 为 0
		if err == nil && len(templateFiles) == 0 {
			log.Fatalf("Error: No template files found matching 'app/*.html'")
		} else {
			log.Fatalf("Error finding templates: %v", err)
		}
	}
	log.Printf("Found templates: %v", templateFiles) // 添加日志记录找到的模板
	templates = template.Must(template.ParseFiles(templateFiles...))

	// 惰性加载 API Key
	apiKeyOnce.Do(func() {
		apiKey = "sk-742ea2cb892f40e0aca39b579143400a"
		if apiKey == "" {
			log.Println("Warning: DEEPSEEK_API_KEY environment variable not set.")
			// 在这里可以设置一个默认的测试 key，但不推荐用于生产
			// apiKey = "your_default_key_here"
		}
	})
}

// --- HTTP 处理函数 ---

// 处理根路径，渲染主 HTML 页面
func handleIndex(w http.ResponseWriter, r *http.Request) {
	// 可以在这里传递初始数据给模板，如果需要的话
	data := map[string]interface{}{
		// "messages": []Message{}, // 初始消息（如果需要）
	}
	// 使用基本文件名作为模板名称执行
	err := templates.ExecuteTemplate(w, "main.html", data) // 确保模板名称正确
	if err != nil {
		log.Printf("Error executing template 'main.html': %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}
}

// 处理静态文件（CSS, JS, Images）
func handleStaticFiles(w http.ResponseWriter, r *http.Request) {
	// 移除 /static/ 前缀获取文件路径
	// 注意：路径相对于项目根目录或运行 `go run` 的目录
	// 确保 static 目录在正确的位置
	staticFilePath := filepath.Join("app", r.URL.Path) // 假设静态文件在 app/static/ 下
	// 检查文件是否存在
	if _, err := os.Stat(staticFilePath); os.IsNotExist(err) {
		log.Printf("Static file not found: %s", staticFilePath)
		http.NotFound(w, r)
		return
	}
	http.ServeFile(w, r, staticFilePath)
}

// 处理聊天 API 请求
func handleChat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	if apiKey == "" {
		http.Error(w, "Server configuration error: API key not set", http.StatusInternalServerError)
		return
	}

	var req ChatRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("Error decoding chat request: %v", err)
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if req.UserInput == "" {
		http.Error(w, "Bad Request: userInput cannot be empty", http.StatusBadRequest)
		return
	}

	// --- 调用 DeepSeek API ---
	modelID := "deepseek-chat" // 默认模型
	if req.Agent == "paperai" {
		// 如果需要，可以为 paperai 选择不同的模型或添加特定指令
		// modelID = "specific-paperai-model" // 示例
		// 这里可以添加 paperai 的特定系统提示
	} else if req.Agent == "chater" {
		modelID = "deepseek-chat" // 或者 "deepseek-coder" 等
	} else {
        log.Printf("Warning: Unknown agent type '%s', using default.", req.Agent)
    }


	// 构建发送给 DeepSeek 的消息列表
	messages := []Message{
		// 可以添加系统提示
		// {Role: "system", Content: "You are a helpful assistant."},
		{Role: "user", Content: req.UserInput},
		// 如果需要传递历史记录，在这里添加
	}

	deepSeekReqPayload := DeepSeekRequest{
		Model:    modelID,
		Messages: messages,
		Stream:   false, // 明确指定非流式
	}

	payloadBytes, err := json.Marshal(deepSeekReqPayload)
	if err != nil {
		log.Printf("Error marshalling DeepSeek request: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// 发送请求到 DeepSeek API
	apiURL := "https://api.deepseek.com/chat/completions"
	httpRequest, err := http.NewRequest("POST", apiURL, bytes.NewBuffer(payloadBytes))
	if err != nil {
		log.Printf("Error creating DeepSeek HTTP request: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{}
	httpResponse, err := client.Do(httpRequest)
	if err != nil {
		log.Printf("Error sending request to DeepSeek: %v", err)
		http.Error(w, "Error communicating with AI service", http.StatusServiceUnavailable)
		return
	}
	defer httpResponse.Body.Close()

	// 读取并解析 DeepSeek 的响应
	responseBody, err := io.ReadAll(httpResponse.Body)
	if err != nil {
		log.Printf("Error reading DeepSeek response body: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	if httpResponse.StatusCode != http.StatusOK {
		log.Printf("DeepSeek API Error: Status %d, Body: %s", httpResponse.StatusCode, string(responseBody))
		http.Error(w, fmt.Sprintf("AI service error (Status: %d)", httpResponse.StatusCode), http.StatusBadGateway)
		return
	}

	var deepSeekResp DeepSeekResponse
	if err := json.Unmarshal(responseBody, &deepSeekResp); err != nil {
		log.Printf("Error unmarshalling DeepSeek response: %v. Body: %s", err, string(responseBody))
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// 提取 AI 的回复
	aiReply := "Sorry, I couldn't get a response." // 默认回复
	if len(deepSeekResp.Choices) > 0 {
		aiReply = deepSeekResp.Choices[0].Message.Content
	}

	// --- 返回响应给前端 ---
	chatResp := ChatResponse{Reply: aiReply}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(chatResp); err != nil {
		log.Printf("Error encoding chat response: %v", err)
		// 此时可能已经写入了部分 header，所以不一定能再发送 http.Error
	}
}

// --- 主函数 ---
func main() {
	mux := http.NewServeMux()

	// 路由
	mux.HandleFunc("/", handleIndex)
	// 静态文件服务 (注意路径匹配)
	mux.HandleFunc("/static/", func(w http.ResponseWriter, r *http.Request) {
		// 确保只服务 /static/ 路径下的文件
		if strings.HasPrefix(r.URL.Path, "/static/") {
			handleStaticFiles(w, r)
		} else {
			http.NotFound(w, r)
		}
	})
	mux.HandleFunc("/api/chat", handleChat) // 新的聊天 API 端点

	// 启动服务器
	port := "8080"
	log.Printf("Starting Go server on http://0.0.0.0:%s", port)
	err := http.ListenAndServe(":"+port, mux)
	if err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}


