"""
AI-powered syllabus parsing using Google Gemini API.
Falls back to regex-based parsing if API key is missing or request fails.
"""

import os
import json
import re
from typing import List, Dict, Optional

# Lazy import to avoid crash if package not installed
_genai = None

def _get_genai():
    global _genai
    if _genai is None:
        try:
            import google.generativeai as genai
            _genai = genai
        except ImportError:
            return None
    return _genai


def get_gemini_api_key() -> Optional[str]:
    """Get Gemini API key from environment"""
    return os.getenv("GEMINI_API_KEY")


async def parse_syllabus_with_ai(text: str) -> Optional[List[Dict]]:
    """
    Use Google Gemini to extract assessment components from syllabus text.
    
    Returns list of {"name": str, "weight": float} or None if AI parsing fails.
    Weight is expressed as a decimal (e.g., 0.25 for 25%).
    """
    api_key = get_gemini_api_key()
    if not api_key:
        return None
    
    genai = _get_genai()
    if genai is None:
        return None
    
    try:
        genai.configure(api_key=api_key)
        
        model = genai.GenerativeModel("gemini-2.0-flash")
        
        prompt = f"""You are an expert at reading university course syllabi. 
Extract ALL graded assessment components and their percentage weights from the following syllabus text.

RULES:
1. Return ONLY a valid JSON array. No markdown, no code fences, no explanation.
2. Each entry must have exactly two fields: "name" (string) and "weight" (number as decimal, e.g. 25% = 0.25).
3. Include every graded component you can find (exams, assignments, quizzes, projects, participation, labs, etc.)
4. The weights should ideally sum to approximately 1.0 (100%).
5. If a component has sub-parts (e.g., "5 assignments worth 4% each"), combine them into one entry with the total weight.
6. Clean up assessment names: capitalize properly, remove numbering artifacts.
7. If you absolutely cannot find any grading information, return an empty array [].

SYLLABUS TEXT:
---
{text[:4000]}
---

Return the JSON array now:"""

        response = model.generate_content(prompt)
        
        # Extract JSON from response
        response_text = response.text.strip()
        
        # Try to find JSON array in response (handle markdown code fences)
        json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
        if not json_match:
            return None
        
        parsed = json.loads(json_match.group())
        
        if not isinstance(parsed, list):
            return None
        
        # Validate and clean each entry
        assessments = []
        for item in parsed:
            if not isinstance(item, dict):
                continue
            
            name = str(item.get("name", "")).strip()
            weight = item.get("weight", 0)
            
            # Handle weight as percentage (>1) or decimal
            if isinstance(weight, (int, float)):
                if weight > 1:
                    weight = weight / 100.0
                weight = round(float(weight), 4)
            else:
                continue
            
            if not name or weight <= 0 or weight > 1:
                continue
            
            assessments.append({
                "name": name,
                "weight": weight
            })
        
        # Only return if we got meaningful results
        if len(assessments) >= 1:
            # Sort by weight descending
            assessments.sort(key=lambda x: x["weight"], reverse=True)
            return assessments
        
        return None
    
    except Exception as e:
        print(f"[AI Parser] Gemini API error: {e}")
        return None
