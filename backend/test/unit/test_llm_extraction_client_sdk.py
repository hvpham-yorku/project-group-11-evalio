from app.services.llm_extraction_client import LlmExtractionClient


class _FakeMessage:
    def __init__(self, content: str):
        self.content = content


class _FakeChoice:
    def __init__(self, content: str):
        self.message = _FakeMessage(content)


class _FakeChatCompletion:
    def __init__(self, content: str):
        self.choices = [_FakeChoice(content)]


class _FakeChatCompletions:
    def __init__(self):
        self.call_count = 0
        self.last_kwargs = None

    def create(self, *, model: str, messages: list[dict[str, str]], **kwargs):
        _ = model
        _ = messages
        self.last_kwargs = kwargs
        self.call_count += 1
        return _FakeChatCompletion('{"assessments":[],"deadlines":[]}')


class _FakeChat:
    def __init__(self):
        self.completions = _FakeChatCompletions()


class _FakeOpenAIWithoutResponses:
    def __init__(self):
        self.chat = _FakeChat()


def test_llm_client_adds_responses_compat_for_sdk_without_responses():
    raw_client = _FakeOpenAIWithoutResponses()
    llm_client = LlmExtractionClient(client=raw_client, timeout_seconds=20)

    client = llm_client._get_client()
    assert hasattr(client, "responses")
    assert hasattr(client.responses, "create")


def test_llm_client_responses_compat_smoke_extract():
    raw_client = _FakeOpenAIWithoutResponses()
    llm_client = LlmExtractionClient(client=raw_client, timeout_seconds=20)

    payload = llm_client.extract("Course outline text")
    assert payload == {"assessments": [], "deadlines": []}
    assert raw_client.chat.completions.call_count == 1
    assert raw_client.chat.completions.last_kwargs["temperature"] == 0
    assert raw_client.chat.completions.last_kwargs["max_completion_tokens"] == 1000
    response_format = raw_client.chat.completions.last_kwargs["response_format"]
    assert response_format["type"] == "json_schema"
    schema = response_format["json_schema"]["schema"]
    assessment_items = schema["properties"]["assessments"]["items"]
    assessment_props = assessment_items["properties"]
    assert "children" in assessment_props
    assert "total_count" in assessment_props
    assert "effective_count" in assessment_props
    assert "unit_weight" in assessment_props
    assert "rule_type" in assessment_props
    assert set(assessment_items["required"]) == set(assessment_props.keys())
