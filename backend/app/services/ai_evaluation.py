import httpx
import json
import base64
import re
import io
import os
from typing import Tuple, Optional
from PIL import Image
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
    If a handwritten image is provided, we first attempt local Tesseract OCR,
    then use Gemini (acting as Google Vision OCR fallback and grader) to evaluate.
    
    Returns:
        Tuple[float, str, Optional[str]]: (score, justification, extracted_text)
    """
    api_key = settings.GEMINI_API_KEY
    
    # 1. OCR Pre-processing for handwritten images
    pytesseract_text = None
    if handwritten_image_b64:
        try:
            import pytesseract
            image_bytes = base64.b64decode(clean_base64(handwritten_image_b64))
            img = Image.open(io.BytesIO(image_bytes))
            pytesseract_text = pytesseract.image_to_string(img).strip()
            if not pytesseract_text:
                pytesseract_text = None
        except Exception as ocr_err:
            print(f"pytesseract OCR preprocessing skipped or failed: {ocr_err}")

    # 2. Fallback heuristic if no API key is provided
    if not api_key:
        return mock_evaluate(
            question_text=question_text,
            model_answer=model_answer,
            student_answer=student_answer or pytesseract_text,
            points=points,
            handwritten_image_b64=handwritten_image_b64,
            pre_extracted_text=pytesseract_text
        )
        
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    
    try:
        if handwritten_image_b64:
            clean_b64 = clean_base64(handwritten_image_b64)
            ocr_hint = f"\nTesseract pre-processed text suggestion: {pytesseract_text}" if pytesseract_text else ""
            
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
                                f"You are an AI exam evaluation assistant. First, perform OCR to extract the handwritten text from the image.{ocr_hint}\n"
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
                    "justification": {"type": "STRING"},
                    "key_points_matched": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"}
                    },
                    "key_points_missed": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"}
                    }
                },
                "required": ["extracted_text", "score", "justification", "key_points_matched", "key_points_missed"]
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
                    "justification": {"type": "STRING"},
                    "key_points_matched": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"}
                    },
                    "key_points_missed": {
                        "type": "ARRAY",
                        "items": {"type": "STRING"}
                    }
                },
                "required": ["score", "justification", "key_points_matched", "key_points_missed"]
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
                justification_base = parsed.get("justification", "No justification provided by AI.")
                matched = parsed.get("key_points_matched", [])
                missed = parsed.get("key_points_missed", [])
                extracted = parsed.get("extracted_text", pytesseract_text)
                
                # Format structured justification
                justification = justification_base
                if matched:
                    justification += "\n\nKey Points Matched:\n" + "\n".join(f"- {item}" for item in matched)
                if missed:
                    justification += "\n\nKey Points Missed:\n" + "\n".join(f"- {item}" for item in missed)
                
                return score, justification, extracted
            else:
                return mock_evaluate(question_text, model_answer, student_answer, points, handwritten_image_b64, pytesseract_text)
                
    except Exception as e:
        print(f"Gemini API subjective grading error: {e}")
        return mock_evaluate(question_text, model_answer, student_answer, points, handwritten_image_b64, pytesseract_text)

def mock_evaluate(
    question_text: str,
    model_answer: str,
    student_answer: Optional[str],
    points: float,
    handwritten_image_b64: Optional[str] = None,
    pre_extracted_text: Optional[str] = None
) -> Tuple[float, str, Optional[str]]:
    """Heuristic mock grader when Gemini API key is missing or calls fail."""
    extracted_text = pre_extracted_text
    
    if handwritten_image_b64 and not extracted_text:
        extracted_text = (
            f"Handwritten transcript (Simulated OCR): The student answers that this topic requires strict verification. "
            f"We must follow key guidelines including: {model_answer[:60]}... and other parameters."
        )
        answer_to_grade = extracted_text
    else:
        answer_to_grade = student_answer or extracted_text or ""
        
    if not answer_to_grade.strip():
        return 0.0, "AI (Simulated): No answer was provided by the student.", extracted_text
        
    model_words = set(re.findall(r'\w+', model_answer.lower()))
    student_words = set(re.findall(r'\w+', answer_to_grade.lower()))
    
    # Calculate matching keywords proportion
    matches = model_words.intersection(student_words)
    match_ratio = len(matches) / max(len(model_words), 1)
    
    score_factor = min((match_ratio * 1.5) + (len(answer_to_grade) / max(len(model_answer), 1) * 0.3), 1.0)
    score = round(score_factor * points, 1)
    
    justification_base = (
        f"AI Grading (Simulated Heuristics): The response contained {len(matches)} key terms "
        f"matching the model rubric (overlap ratio: {match_ratio:.2f})."
    )
    
    # Extract mock key points
    matched_pts = list(matches)[:3]
    missed_pts = list(model_words - student_words)[:3]
    
    justification = justification_base
    if matched_pts:
        justification += "\n\nKey Points Matched:\n" + "\n".join(f"- Matched term: '{item}'" for item in matched_pts)
    if missed_pts:
        justification += "\n\nKey Points Missed:\n" + "\n".join(f"- Missed term: '{item}'" for item in missed_pts)
        
    return score, justification, extracted_text
