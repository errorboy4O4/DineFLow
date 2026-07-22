import os
import json
import requests
import re
import time
import random


def _gemini_cfg():
    api_key = (os.environ.get('GOOGLE_GEMINI_API_KEY') or '').strip()
    # Default to Gemini 2.5 Flash unless overridden via GEMINI_MODEL.
    model = (os.environ.get('GEMINI_MODEL') or 'gemini-2.5-flash').strip()
    
    if not api_key or api_key == 'your-google-gemini-api-key-here':
        raise RuntimeError('GOOGLE_GEMINI_API_KEY not configured. Add your actual API key to the .env file.')
    
    return api_key, model


def _gemini_error_message(data: dict) -> str:
    msg = None
    if isinstance(data, dict):
        err = data.get("error")
        if isinstance(err, dict):
            msg = err.get("message")
        elif isinstance(err, str):
            msg = err
    return (msg or "").strip()


def _is_retryable_gemini_error(status_code: int, message: str) -> bool:
    try:
        sc = int(status_code or 0)
    except Exception:
        sc = 0
    m = (message or "").lower()
    if sc in (408, 425, 429, 500, 502, 503, 504):
        return True
    if "high demand" in m:
        return True
    if "resource" in m and "exhaust" in m:
        return True
    if "rate" in m and "limit" in m:
        return True
    if "overloaded" in m:
        return True
    return False


def _gemini_model_candidates(primary_model: str) -> list:
    """
    Primary model is tried first. If it fails with a retryable error, we retry with backoff
    and then fall back to other models.

    Env override: GEMINI_FALLBACK_MODELS="model-a,model-b"
    """
    primary = (primary_model or "").strip()
    env_raw = os.environ.get("GEMINI_FALLBACK_MODELS")
    # Respect "use this model" by default: no fallback unless explicitly configured.
    if env_raw is None:
        fallbacks = []
    else:
        env = (env_raw or "").strip()
        fallbacks = [m.strip() for m in env.split(",") if m and m.strip()] if env else []

    out = []
    for m in [primary] + (fallbacks or []):
        m = (m or "").strip()
        if not m:
            continue
        if m in out:
            continue
        out.append(m)
    return out


def _gemini_generate_content(req: dict, *, api_key: str, primary_model: str, timeout: int = 120) -> tuple[dict, str]:
    """
    Call Gemini generateContent with retries + model fallback.
    Returns: (response_json, used_model)
    """
    models = _gemini_model_candidates(primary_model)
    if not models:
        raise RuntimeError("No GEMINI_MODEL configured")

    per_model_attempts = 3
    base_sleep = 0.8
    last_err = None

    for model in models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        for attempt in range(per_model_attempts):
            try:
                r = requests.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json=req,
                    timeout=timeout,
                )
            except requests.RequestException as e:
                last_err = RuntimeError(str(e))
                sleep_s = min(6.0, base_sleep * (2 ** attempt)) + random.random() * 0.25
                time.sleep(sleep_s)
                continue

            try:
                data = r.json()
            except Exception:
                data = None

            if r.status_code < 400:
                return (data or {}), model

            msg = _gemini_error_message(data or {})
            retryable = _is_retryable_gemini_error(r.status_code, msg)
            last_err = RuntimeError(msg or f"AI request failed ({r.status_code})")

            if not retryable:
                raise last_err

            sleep_s = min(8.0, base_sleep * (2 ** attempt)) + random.random() * 0.35
            time.sleep(sleep_s)

        # exhausted retries: fall back to next model

    raise last_err or RuntimeError("AI request failed")


def _anthropic_cfg():
    api_key = (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
    # Default to a modern Sonnet model; can be overridden via CLAUDE_MODEL.
    model = (os.environ.get("CLAUDE_MODEL") or "claude-sonnet-4-6").strip()
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY not configured. Add it to the .env file.")
    return api_key, model


def _anthropic_error_message(data: dict) -> str:
    if not isinstance(data, dict):
        return ""
    err = data.get("error")
    if isinstance(err, dict):
        return str(err.get("message") or "").strip()
    return str(data.get("message") or "").strip()


def _is_retryable_anthropic_error(status_code: int, message: str) -> bool:
    try:
        sc = int(status_code or 0)
    except Exception:
        sc = 0
    m = (message or "").lower()
    if sc in (408, 425, 429, 500, 502, 503, 504, 529):
        return True
    if "overloaded" in m or "high demand" in m:
        return True
    if "rate" in m and "limit" in m:
        return True
    if "try again" in m and "later" in m:
        return True
    return False


def _extract_anthropic_text(resp_json: dict) -> str:
    """
    Extract text from Anthropic Messages API response.
    """
    if not isinstance(resp_json, dict):
        return ""
    blocks = resp_json.get("content")
    if not isinstance(blocks, list):
        return ""
    out = []
    for b in blocks:
        if not isinstance(b, dict):
            continue
        if b.get("type") == "text" and isinstance(b.get("text"), str):
            out.append(b.get("text"))
    return "".join(out).strip()


def _anthropic_model_candidates(primary_model: str) -> list:
    """
    Try configured CLAUDE_MODEL first, then optional fallbacks.
    Env override: CLAUDE_FALLBACK_MODELS="model-a,model-b"
    """
    primary = (primary_model or "").strip()
    env_raw = os.environ.get("CLAUDE_FALLBACK_MODELS")
    if env_raw is None:
        # Default fallback chain (Sonnet): helps when a specific Sonnet version isn't enabled on the key.
        # Users can override with CLAUDE_FALLBACK_MODELS in .env.
        fallbacks = [
            "claude-sonnet-4-5-20250929",
            "claude-sonnet-4-20250514",
            "claude-3-7-sonnet-20250219",
            "claude-3-sonnet-20240229",
        ]
    else:
        env = (env_raw or "").strip()
        fallbacks = [m.strip() for m in env.split(",") if m and m.strip()] if env else []

    out = []
    for m in [primary] + (fallbacks or []):
        m = (m or "").strip()
        if not m:
            continue
        if m in out:
            continue
        out.append(m)
    return out


def _anthropic_generate_text(
    prompt: str,
    *,
    api_key: str,
    model: str,
    temperature: float = 0.2,
    max_tokens: int = 1200,
    system: str | None = None,
    timeout: int = 120,
) -> tuple[str, str]:
    """
    Call Anthropic Messages API with retries.
    Returns: (text, used_model)
    """
    url = "https://api.anthropic.com/v1/messages"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }

    req = {
        "model": model,
        "max_tokens": int(max_tokens or 1200),
        "temperature": float(temperature or 0.2),
        "messages": [{"role": "user", "content": str(prompt or "")}],
    }
    if system:
        req["system"] = str(system)

    models = _anthropic_model_candidates(model)
    if not models:
        raise RuntimeError("No CLAUDE_MODEL configured")

    attempts = 4
    base_sleep = 0.8
    last_err = None

    for m in models:
        req["model"] = m
        for attempt in range(attempts):
            try:
                r = requests.post(url, headers=headers, json=req, timeout=timeout)
            except requests.RequestException as e:
                last_err = RuntimeError(str(e))
                sleep_s = min(8.0, base_sleep * (2 ** attempt)) + random.random() * 0.35
                time.sleep(sleep_s)
                continue

            try:
                data = r.json()
            except Exception:
                data = None

            if r.status_code < 400:
                return _extract_anthropic_text(data or {}), m

            msg = _anthropic_error_message(data or {})
            last_err = RuntimeError(msg or f"AI request failed ({r.status_code})")

            # If model is invalid/unsupported, don't retry it; try fallback model instead.
            mlow = (msg or "").lower()
            if int(r.status_code or 0) == 400 and ("model" in mlow or "not found" in mlow or "unknown" in mlow):
                break

            if not _is_retryable_anthropic_error(r.status_code, msg):
                raise last_err

            sleep_s = min(10.0, base_sleep * (2 ** attempt)) + random.random() * 0.45
            time.sleep(sleep_s)

        # exhausted retries or model invalid: fall back to next model

    raise last_err or RuntimeError("AI request failed")


def _ai_provider() -> str:
    p = (os.environ.get("AI_PROVIDER") or "").strip().lower()
    if p:
        return p
    if (os.environ.get("ANTHROPIC_API_KEY") or "").strip():
        return "anthropic"
    return "gemini"


def _extract_output_text(resp_json: dict) -> str:
    """Extract text from Google Gemini API response."""
    if isinstance(resp_json, dict):
        # Handle Gemini generateContent response
        candidates = resp_json.get('candidates')
        if isinstance(candidates, list) and len(candidates) > 0:
            candidate = candidates[0]
            if isinstance(candidate, dict):
                content = candidate.get('content')
                if isinstance(content, dict):
                    parts = content.get('parts')
                    if isinstance(parts, list) and len(parts) > 0:
                        texts = []
                        for part in parts:
                            if not isinstance(part, dict):
                                continue
                            text = part.get('text')
                            if isinstance(text, str) and text:
                                texts.append(text)
                        joined = "".join(texts).strip()
                        if joined:
                            return joined
    
    return ""


def _strip_code_fences(s: str) -> str:
    s = (s or "").strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    return s.strip()


def _normalize_quotes(s: str) -> str:
    # Normalize smart quotes to plain quotes to improve JSON parsing.
    return (
        (s or "")
        .replace("“", '"')
        .replace("”", '"')
        .replace("„", '"')
        .replace("‟", '"')
        .replace("’", "'")
        .replace("‘", "'")
    )


def _close_open_string_and_escape_newlines(s: str) -> str:
    """
    Best-effort repair: if the model output is truncated inside a JSON string,
    close the string and escape raw newlines inside strings.
    """
    out = []
    in_str = False
    esc = False

    for ch in (s or ""):
        if in_str:
            if esc:
                out.append(ch)
                esc = False
                continue
            if ch == "\\":
                out.append(ch)
                esc = True
                continue
            if ch == "\n":
                out.append("\\n")
                continue
            if ch == "\r":
                # drop CR
                continue
            if ch == '"':
                in_str = False
                out.append(ch)
                continue
            out.append(ch)
            continue

        # not in string
        if ch == '"':
            in_str = True
            out.append(ch)
            continue
        out.append(ch)

    if in_str:
        out.append('"')

    return "".join(out)


def _repair_jsonish(s: str) -> str:
    s = _normalize_quotes(_strip_code_fences(s))

    if not s.startswith("{"):
        start = s.find("{")
        if start != -1:
            s = s[start:]
    if not s.endswith("}"):
        end = s.rfind("}")
        if end != -1:
            s = s[: end + 1]

    # Replace invalid placeholder ellipsis like: "ingredient_id": ...
    s = re.sub(r":\s*\.\.\.\s*([,\}\]])", r": null\1", s)
    s = re.sub(r"\.\.\.", "null", s)

    # Escape newlines inside strings and close open strings if truncated.
    s = _close_open_string_and_escape_newlines(s)

    # Remove trailing commas
    s = re.sub(r",\s*([}\]])", r"\1", s)
    return s.strip()


def _loads_json_best_effort(text: str) -> dict:
    text = (text or "").strip()
    if not text:
        raise RuntimeError("AI returned an empty response")

    cleaned = _repair_jsonish(text)
    try:
        obj = json.loads(cleaned)
        if not isinstance(obj, dict):
            raise RuntimeError("AI JSON was not an object")
        return obj
    except json.JSONDecodeError:
        t = cleaned
        if t.count("{") > t.count("}"):
            t = t + ("}" * (t.count("{") - t.count("}")))
        if t.count("[") > t.count("]"):
            t = t + ("]" * (t.count("[") - t.count("]")))
        # If still inside a JSON string after balancing braces, close it.
        t = _close_open_string_and_escape_newlines(t)
        t = re.sub(r",\s*([}\]])", r"\1", t)
        obj = json.loads(t)
        if not isinstance(obj, dict):
            raise RuntimeError("AI JSON was not an object")
        return obj


def _extract_recipe_fallback(text: str, default_category: str = "") -> dict:
    """
    If the model returns invalid JSON, try to salvage the key fields from the text
    so the API can still proceed using server-side ingredient fallbacks.
    """
    raw = (text or "").strip()

    def _grab_str(key: str) -> str:
        # Match "key": "value" (very forgiving; works even if JSON is broken elsewhere)
        m = re.search(rf'"{re.escape(key)}"\s*:\s*"([^"]+)"', raw, flags=re.IGNORECASE)
        if m:
            return m.group(1).strip()
        return ""

    name = _grab_str("name") or "Custom Dish"
    category = _grab_str("category") or (default_category or "")
    description = _grab_str("description") or ""

    # Ingredients are optional here; caller will map/fallback if empty.
    ingredients = []

    return {
        "name": name,
        "category": category,
        "description": description,
        "ingredients": ingredients,
        "ai_parse_fallback": True,
    }


def get_available_ingredients():
    """Get list of available ingredients from database."""
    try:
        from models import Ingredient
        try:
            ingredients = Ingredient.query.filter_by(is_active=True).all()
        except Exception:
            # Backward-compatible with older DBs that may not have ingredients.is_active
            ingredients = Ingredient.query.all()
        out = []
        for ing in (ingredients or []):
            if not ing or not getattr(ing, "name", None):
                continue
            out.append({"id": ing.id, "name": ing.name, "unit": getattr(ing, "unit", "")})
        return out
    except Exception:
        return []


def generate_custom_dish_recipe(payload: dict) -> dict:
    """Generate a custom dish recipe using Google Gemini API with available ingredients."""
    provider = _ai_provider()

    category = (payload or {}).get('category') or ''
    user_prompt = (payload or {}).get('prompt') or ''

    # Get available ingredients
    available_ingredients = get_available_ingredients()
    ingredient_list = '\n'.join([f"- {ing['id']}: {ing['name']} ({ing['unit']})" for ing in available_ingredients[:60]])
    
    if not ingredient_list:
        ingredient_list = "- Rice\n- Oil\n- Salt\n- Spices"

    prompt = (
        'You are a professional chef. Create a custom dish.\n\n'
        f'Category: {category}\n'
        f'Request: {user_prompt}\n\n'
        'If the request is NOT about food/drink/recipes, return ONLY this JSON and nothing else:\n'
        '{ "error": "I don\\u0027t have any knowledge in this field. Ask me anything you want to eat." }\n\n'
        'Servings: 1 person only.\n'
        'Use ONLY these ingredients.\n'
        'IMPORTANT: Use ingredient names EXACTLY as written in the list (no synonyms, no spelling changes).\n'
        'IMPORTANT: Use the unit EXACTLY as written in the list for each ingredient.\n'
        'IMPORTANT: Include "ingredient_id" for every ingredient (numeric id from the list).\n'
        'IMPORTANT: Never use "..." or placeholders. Output valid JSON only.\n'
        'Keep ingredients 6-12 items.\n'
        f'{ingredient_list}\n\n'
        'Return ONLY this JSON:\n'
        '{\n'
        '  "name": "Dish Name",\n'
        '  "category": "'+ category +'",\n'
        '  "description": "Short vivid appetizing description (max 160 chars)",\n'
        '  "ingredients": [{"ingredient_id": ID, "name": "X", "qty": N, "unit": "unit"}]\n'
        '}'
    )

    text = ""
    if provider == "anthropic":
        api_key, model = _anthropic_cfg()
        text, _used_model = _anthropic_generate_text(
            prompt,
            api_key=api_key,
            model=model,
            temperature=0.35,
            max_tokens=1400,
            timeout=120,
        )
    else:
        api_key, model = _gemini_cfg()
        req = {
            'contents': [
                {
                    'parts': [
                        {'text': prompt}
                    ]
                }
            ],
            'generationConfig': {
                'temperature': 0.4,
                'maxOutputTokens': 1400,
                # Ask API for JSON response when supported (safe no-op otherwise).
                'responseMimeType': 'application/json',
            }
        }
        data, _used_model = _gemini_generate_content(req, api_key=api_key, primary_model=model, timeout=120)
        text = _extract_output_text(data or {})

    try:
        return _loads_json_best_effort(text)
    except Exception as e:
        # Retry once with stricter prompt; this often fixes invalid JSON (e.g., "ingredient_id": ...).
        retry_prompt = (
            'Return ONLY valid JSON for a dish. No extra text.\n'
            f'Category: {category}\n'
            f'Request: {user_prompt}\n'
            'If the request is NOT about food/drink/recipes, return ONLY:\n'
            '{ "error": "I don\\u0027t have any knowledge in this field. Ask me anything you want to eat." }\n'
            'Rules:\n'
            '- Servings: 1 person only.\n'
            '- Use only ingredients from the list.\n'
            '- Every ingredient MUST have ingredient_id (numeric).\n'
            '- Use the unit EXACTLY as written in the list.\n'
            '- Never use "..." or placeholders.\n'
            '- Ingredients 6-10 items.\n\n'
            f'{ingredient_list}\n\n'
            'JSON schema:\n'
            '{ "name": "...", "category": "' + category + '", "description": "...",'
            ' "ingredients":[{"ingredient_id":1,"name":"...","qty":1,"unit":"..."}] }'
        )

        retry_req = {
            'contents': [{'parts': [{'text': retry_prompt}]}],
            'generationConfig': {
                'temperature': 0.2,
                'maxOutputTokens': 1200,
                'responseMimeType': 'application/json',
            }
        }

        retry_text = ""
        if provider == "anthropic":
            try:
                retry_text, _retry_model = _anthropic_generate_text(
                    retry_prompt,
                    api_key=api_key,
                    model=model,
                    temperature=0.2,
                    max_tokens=1200,
                    timeout=120,
                )
            except Exception:
                raise RuntimeError(str(e))
        else:
            try:
                retry_data, _retry_model = _gemini_generate_content(retry_req, api_key=api_key, primary_model=model, timeout=120)
            except Exception:
                raise RuntimeError(str(e))
            retry_text = _extract_output_text(retry_data or {})
        try:
            return _loads_json_best_effort(retry_text)
        except Exception:
            # Don't hard-fail the customer flow on occasional invalid JSON.
            # We salvage name/category/description and let the API layer fall back
            # to deterministic inventory ingredients.
            return _extract_recipe_fallback(retry_text or text or "", default_category=str(category or ""))


def generate_custom_dish_steps(payload: dict, normalized_ingredients: list) -> dict:
    """
    Generate chef-ready steps for a custom dish using the configured AI provider.
    This is intentionally separated from generate_custom_dish_recipe so we can
    generate steps after server-side normalization to 1-serving quantities.

    Returns: { "steps": [...], "notes": "..." }
    """
    provider = _ai_provider()
    if provider == "anthropic":
        api_key, model = _anthropic_cfg()
    else:
        api_key, model = _gemini_cfg()

    name = str((payload or {}).get("name") or "Custom Dish").strip()
    category = str((payload or {}).get("category") or "").strip()
    user_prompt = str((payload or {}).get("prompt") or (payload or {}).get("description") or "").strip()

    # Format ingredients exactly as the kitchen should use them.
    lines = []
    for r in (normalized_ingredients or []):
        if not isinstance(r, dict):
            continue
        n = str(r.get("name") or "").strip()
        u = str(r.get("unit") or "").strip()
        q = r.get("qty")
        try:
            q = float(q)
        except Exception:
            continue
        if not n or q <= 0:
            continue
        # Keep qty readable (avoid long floats).
        q_s = f"{q:.3f}".rstrip("0").rstrip(".")
        lines.append(f"- {n}: {q_s} {u}".strip())

    if not lines:
        raise RuntimeError("No ingredients available to generate steps")

    ingredient_block = "\n".join(lines[:20])

    prompt = (
        "You are a professional chef.\n"
        "Write a detailed, step-by-step cooking method for 1 person.\n"
        f"Dish name: {name}\n"
        f"Category: {category}\n"
        f"Customer request: {user_prompt}\n\n"
        "Use ONLY these ingredients and amounts (do not add anything else):\n"
        f"{ingredient_block}\n\n"
        "Rules:\n"
        "- Steps must clearly say WHEN to add each ingredient.\n"
        "- Mention every ingredient name EXACTLY as written at least once.\n"
        "- Steps: 7 to 10.\n"
        "- Keep each step to 1 short sentence (max 120 characters).\n"
        "- Do NOT use double quotes inside step text.\n"
        "- Output ONLY valid JSON.\n\n"
        "Return ONLY this JSON:\n"
        '{ "steps": ["..."], "notes": "..." }'
    )

    text = ""
    if provider == "anthropic":
        text, _used_model = _anthropic_generate_text(
            prompt,
            api_key=api_key,
            model=model,
            temperature=0.25,
            max_tokens=1200,
            timeout=120,
        )
    else:
        req = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.25,
                "maxOutputTokens": 1200,
                "responseMimeType": "application/json",
            },
        }
        data, _used_model = _gemini_generate_content(req, api_key=api_key, primary_model=model, timeout=120)
        text = _extract_output_text(data or {})

    def _steps_from_loose_text(t: str):
        t = _normalize_quotes(_strip_code_fences(t or ""))
        lines = [ln.strip() for ln in t.splitlines() if ln.strip()]

        out = []
        for ln in lines:
            m = re.match(r"^(?:step\\s*)?(\\d{1,2})[\\).:\\-]\\s*(.+)$", ln, flags=re.IGNORECASE)
            if m:
                out.append(m.group(2).strip())
        if len(out) >= 4:
            return out[:12]

        out = []
        for ln in lines:
            m = re.match(r"^[-•*]\\s+(.+)$", ln)
            if m:
                out.append(m.group(1).strip())
        if len(out) >= 4:
            return out[:12]

        # As a last resort, try to pull quoted strings (common when JSON is almost correct).
        quoted = re.findall(r"\"([^\"]{6,})\"", t)
        quoted = [q.strip() for q in quoted if q and q.strip()]
        # Filter obvious keys/schema fragments
        quoted = [q for q in quoted if q.lower() not in ("steps", "notes")]
        # Keep sentences that look like instructions.
        quoted = [q for q in quoted if re.search(r"\\b(add|mix|cook|heat|stir|boil|fry|serve|simmer|whisk|knead)\\b", q, flags=re.IGNORECASE)]
        if quoted:
            return quoted[:12]
        return []

    obj = None
    try:
        obj = _loads_json_best_effort(text)
    except Exception:
        obj = None

    steps = obj.get("steps") if isinstance(obj, dict) else None
    steps_list = [s.strip() for s in steps if isinstance(s, str) and s.strip()] if isinstance(steps, list) else []
    notes = obj.get("notes") if isinstance(obj, dict) else ""
    if not isinstance(notes, str):
        notes = ""

    # Retry with stricter instructions if parse failed or steps look incomplete.
    if len(steps_list) < 4:
        retry_prompt = (
            "Return ONLY valid JSON. No extra text.\n"
            f"Dish name: {name}\n"
            f"Category: {category}\n"
            f"Customer request: {user_prompt}\n\n"
            "Use ONLY these ingredients and amounts (do not add anything else):\n"
            f"{ingredient_block}\n\n"
            "Rules:\n"
            "- 1 person serving.\n"
            "- Steps: 7 to 10.\n"
            "- Keep each step to 1 short sentence (max 120 characters).\n"
            "- Mention every ingredient name EXACTLY as written at least once.\n"
            "- Do NOT use double quotes inside step text.\n"
            "- Output must be STRICT JSON with double quotes for keys/strings.\n\n"
            'JSON schema: { "steps": ["..."], "notes": "..." }'
        )

        retry_req = {
            "contents": [{"parts": [{"text": retry_prompt}]}],
            "generationConfig": {
                "temperature": 0.15,
                "maxOutputTokens": 1100,
                "responseMimeType": "application/json",
            },
        }

        try:
            if provider == "anthropic":
                retry_text, _retry_model = _anthropic_generate_text(
                    retry_prompt,
                    api_key=api_key,
                    model=model,
                    temperature=0.15,
                    max_tokens=1100,
                    timeout=120,
                )
            else:
                retry_data, _retry_model = _gemini_generate_content(retry_req, api_key=api_key, primary_model=model, timeout=120)
                retry_text = _extract_output_text(retry_data or {})
            try:
                obj2 = _loads_json_best_effort(retry_text)
                s2 = obj2.get("steps") if isinstance(obj2, dict) else None
                steps_list = [s.strip() for s in s2 if isinstance(s, str) and s.strip()] if isinstance(s2, list) else []
                n2 = obj2.get("notes") if isinstance(obj2, dict) else ""
                if isinstance(n2, str) and n2.strip():
                    notes = n2.strip()
            except Exception:
                # Try to salvage steps from whatever the model returned.
                steps_list = _steps_from_loose_text(retry_text or "")
        except Exception:
            # Even if the API rejected the call, salvage from the first response if possible.
            steps_list = steps_list or _steps_from_loose_text(text or "")

    # Final fallback: ask for plain-text numbered steps and parse them.
    if len(steps_list) < 4:
        text_prompt = (
            "Write cooking steps for 1 person.\n"
            f"Dish name: {name}\n"
            f"Category: {category}\n"
            f"Customer request: {user_prompt}\n\n"
            "Use ONLY these ingredients and amounts:\n"
            f"{ingredient_block}\n\n"
            "Output format:\n"
            "1. ...\n2. ...\n3. ...\n"
            "Rules:\n"
            "- 7 to 10 lines.\n"
            "- Mention every ingredient name EXACTLY as written at least once.\n"
            "- Keep each line short.\n"
            "- No JSON, no quotes, no extra text."
        )

        text_req = {
            "contents": [{"parts": [{"text": text_prompt}]}],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 900},
        }

        try:
            if provider == "anthropic":
                ttext, _td_model = _anthropic_generate_text(
                    text_prompt,
                    api_key=api_key,
                    model=model,
                    temperature=0.2,
                    max_tokens=900,
                    timeout=120,
                )
            else:
                td, _td_model = _gemini_generate_content(text_req, api_key=api_key, primary_model=model, timeout=120)
                ttext = _extract_output_text(td or {})
            steps_list = _steps_from_loose_text(ttext or "") or steps_list
        except Exception:
            pass

    # Never hard-fail the customer flow; return whatever we could extract.
    return {
        "steps": [s for s in (steps_list or []) if isinstance(s, str) and s.strip()][:12],
        "notes": (notes or "").strip(),
    }
