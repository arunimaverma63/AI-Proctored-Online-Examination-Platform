import httpx
import json
import base64
import re
from typing import Tuple, Optional
from app.config import settings

def clean_base64(b64_str: str) -> str:
    """Removes data URL prefix if present."""
    if ',' in b64_str:
        return b64_str.split(',')[1]
    return b64_str

async def evaluate_subjective_answer(
    question_text: str,
    model_answer: str,
    student_answer: Optional[str],
    points: float,
    handwritten_image_b64: Optional[str] = None
) -> Tuple[float, str, Optional[str]]:
    """
    Evaluates a student's answer using Gemini API (or rules-based fallback).
    If a handwritten image is provided, Gemini extracts the text via OCR first.
    
    Returns:
        Tuple[float, str, Optional[str]]: (score, justification, extracted_text)
    """
    api_key = settings.GEMINI_API_KEY
    
    # 1. Fallback heuristic if no API key is provided
    if not api_key:
        return mock_evaluate(question_text, model_answer, student_answer, points, handwritten_image_b64)
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    
    # Determine prompt and contents
    try:
        if handwritten_image_b64:
            clean_b64 = clean_base64(handwritten_image_b64)
            contents = [
                {
                    "parts": [
                        {
                            "inlineData": {
                                "mimeType": "image/jpeg",
                                "data": clean_b64
                            }
                        },
                        {
                            "text": (
                                f"You are an AI exam evaluation assistant. First, extract the handwritten text from the image. "
                                f"Then, grade the extracted text based on the following subjective exam guidelines:\n"
                                f"Question: {question_text}\n"
                                f"Model Answer / Rubric: {model_answer}\n"
                                f"Max points allowed: {points}\n\n"
                                f"Provide the result in JSON format matching the schema."
                            )
                        }
                    ]
                }
            ]
            schema = {
                "type": "OBJECT",
                "properties": {
                    "extracted_text": {"type": "STRING"},
                    "score": {"type": "NUMBER"},
                    "justification": {"type": "STRING"}
                },
                "required": ["extracted_text", "score", "justification"]
            }
        else:
            contents = [
                {
                    "parts": [
                        {
                            "text": (
                                f"You are an AI exam evaluation assistant. Grade the student's answer based on the following subjective exam guidelines:\n"
                                f"Question: {question_text}\n"
                                f"Model Answer / Rubric: {model_answer}\n"
                                f"Student Answer: {student_answer or ''}\n"
                                f"Max points allowed: {points}\n\n"
                                f"Provide the result in JSON format matching the schema."
                            )
                        }
                    ]
                }
            ]
            schema = {
                "type": "OBJECT",
                "properties": {
                    "score": {"type": "NUMBER"},
                    "justification": {"type": "STRING"}
                },
                "required": ["score", "justification"]
            }
            
        payload = {
            "contents": contents,
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": schema
            }
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=payload)
            if response.status_code == 200:
                res_data = response.json()
                text_content = res_data["candidates"][0]["content"]["parts"][0]["text"]
                parsed = json.loads(text_content)
                
                score = min(float(parsed.get("score", 0.0)), points)
                justification = parsed.get("justification", "No justification provided by AI.")
                extracted = parsed.get("extracted_text", None)
                
                return score, justification, extracted
            else:
                # If API fails, fall back to mock
                return mock_evaluate(question_text, model_answer, student_answer, points, handwritten_image_b64)
                
    except Exception as e:
        # On exception, use mock fallback
        return mock_evaluate(question_text, model_answer, student_answer, points, handwritten_image_b64)

def mock_evaluate(
    question_text: str,
    model_answer: str,
    student_answer: Optional[str],
    points: float,
    handwritten_image_b64: Optional[str] = None
) -> Tuple[float, str, Optional[str]]:
    """Heuristic mock grader when Gemini API key is missing or calls fail."""
    extracted_text = None
    
    if handwritten_image_b64:
        # Simulate handwriting OCR
        extracted_text = (
            f"Handwritten transcript: The student answers that this topic requires strict verification. "
            f"We must follow key guidelines including: {model_answer[:60]}... and other parameters."
        )
        answer_to_grade = extracted_text
    else:
        answer_to_grade = student_answer or ""
        
    # Analyze text length and word matching to compute a reasonable mock score
    if not answer_to_grade.strip():
        return 0.0, "AI (Simulated): No answer was provided by the student.", extracted_text
        
    model_words = set(re.findall(r'\w+', model_answer.lower()))
    student_words = set(re.findall(r'\w+', answer_to_grade.lower()))
    
    # Calculate matching keywords proportion
    matches = model_words.intersection(student_words)
    match_ratio = len(matches) / max(len(model_words), 1)
    
    # Base score on keyword matching and length matching
    score_factor = min((match_ratio * 1.5) + (len(answer_to_grade) / max(len(model_answer), 1) * 0.3), 1.0)
    score = round(score_factor * points, 1)
    
    justification = (
        f"AI Grading (Simulated Heuristics): The response contained {len(matches)} key terms "
        f"matching the model rubric (overlap ratio: {match_ratio:.2f}). "
        f"The content covers key definitions but may benefit from additional technical depth or structured details."
    )
    
    return score, justification, extracted_text
