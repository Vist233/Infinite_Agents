import os
from agno.agent import Agent
from agno.models.deepseek import DeepSeek
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.tools.pubmed import PubmedTools
from config import API_KEY

API = os.environ.get('DEEPSEEK_API_KEY') or API_KEY

# PaperAI Agent Definition
paperai_agent = Agent(
    model=DeepSeek(api_key=API),
    tools=[ PubmedTools(), DuckDuckGoTools()],
    instructions=[
        "You are an expert research assistant.",
        "Given a topic, your goal is to find relevant academic papers and articles using the available tools (PubMed, DuckDuckGo Search).",
        "First, use the tools to search for information on the topic. Prioritize PubMed for academic content.",
        "Synthesize the findings from the search results.",
        "Provide a concise summary of the most relevant information and papers found.",
        "Include links (URLs) to the papers or articles in your summary.",
        "Format your response in clear markdown.",
        "If no relevant information is found after searching, state that clearly.",
    ],
    markdown=True,
    add_history_to_messages=False,
    description="PaperAI: Searches Arxiv, PubMed, and DuckDuckGo for academic papers and summarizes them.",
)

# Chater Agent Definition
chater_agent = Agent(
    model=DeepSeek(api_key=API, id="deepseek-reasoner"),
    markdown=True,
    description="Chater: A general conversational AI assistant.",
    add_history_to_messages=True,
)
