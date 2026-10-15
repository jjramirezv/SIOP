import base64
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

from fastapi.testclient import TestClient
from pydantic import SecretStr
import pytest

from app.main import app
from app.schemas.assistant import AssistantResponse
from app.services import assistant_service as service


ROOT = Path(__file__).resolve().parents[4]


@pytest.fixture
def fake_provider(monkeypatch):
    example = json.loads(
        (
            ROOT / "contracts/examples/assistant-response.json"
        ).read_text(encoding="utf-8")
    )

    client = MagicMock()
    client.__enter__.return_value = client

    client.models.generate_content.return_value = SimpleNamespace(
        text=json.dumps(example)
    )

    monkeypatch.setattr(
        service.genai,
        "Client",
        lambda **kwargs: client,
    )

    monkeypatch.setattr(
        service,
        "get_settings",
        lambda: SimpleNamespace(
            gemini_api_key=SecretStr("test-only"),
            gemini_text_model="test-only",
        ),
    )

    return client


def test_text_route_uses_structured_response(fake_provider):
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/assistant/messages",
            json={"message": "Vendo 200 cuadernos al mes."},
        )

    assert response.status_code == 200
    assert response.json()["data_source"] == "assistant"
    assert response.json()["requires_confirmation"] is True

    fake_provider.models.generate_content.assert_called_once()


def test_photo_is_sent_as_image(fake_provider):
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC"
        "AAAAC0lEQVR42mP8/x8AAwMCAO+jA1cAAAAASUVORK5CYII="
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/assistant/extract-image",
            files={"file": ("test.png", png, "image/png")},
        )

    assert response.status_code == 200
    contents = (
        fake_provider.models.generate_content
        .call_args.kwargs["contents"]
    )
    image_part = contents[-1].parts[-1]

    assert image_part.inline_data.mime_type == "image/png"
    assert image_part.inline_data.data == png


def test_photo_context_and_draft_are_forwarded(fake_provider):
    png = b"\x89PNG\r\n\x1a\n" + b"test-image"
    context = "Revisa el precio de cuadernos y su periodo mensual."
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/assistant/extract-image",
            files={"file": ("quote.png", png, "image/png")},
            data={"context": context, "draft": json.dumps({"order_cost": 40})},
        )
    assert response.status_code == 200
    contents = fake_provider.models.generate_content.call_args.kwargs["contents"]
    rendered = str(contents)
    assert context in rendered
    assert "order_cost" in rendered and "40" in rendered


def test_photo_accepts_maximum_context_without_internal_validation_error(fake_provider):
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/assistant/extract-image",
            files={"file": ("quote.png", b"\x89PNG\r\n\x1a\nimage", "image/png")},
            data={"context": "a" * 4000},
        )
    assert response.status_code == 200


def test_fake_image_does_not_call_provider(fake_provider):
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/assistant/extract-image",
            files={
                "file": (
                    "fake.png",
                    b"not an image",
                    "image/png",
                )
            },
        )

    assert response.status_code == 415
    fake_provider.models.generate_content.assert_not_called()


def test_missing_configuration_returns_503(monkeypatch):
    monkeypatch.setattr(
        service,
        "get_settings",
        lambda: SimpleNamespace(
            gemini_api_key=None,
            gemini_text_model="",
        ),
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/assistant/messages",
            json={"message": "Hola"},
        )

    assert response.status_code == 503
    assert (
        response.json()["error"]["code"]
        == "ASSISTANT_UNAVAILABLE"
    )


def test_explanation_receives_verified_calculation(fake_provider):
    analysis_input = json.loads(
        (
            ROOT / "contracts/examples/analysis-request.json"
        ).read_text(encoding="utf-8")
    )

    with TestClient(app) as client:
        response = client.post(
            "/api/v1/assistant/messages",
            json={
                "message": "Explica mi resultado.",
                "analysis_input": analysis_input,
            },
        )

    assert response.status_code == 200

    contents = (
        fake_provider.models.generate_content
        .call_args.kwargs["contents"]
    )

    context = json.loads(contents[-1].parts[0].text)
    verified = context["verified_analysis"]

    assert verified["data_source"] == "calculated"
    assert verified["recommended"]["quantity"] == 500
    assert (
        verified["recommended"]["annual_costs"]["total"]
        == 47522
    )

@pytest.mark.parametrize("draft", [None, "", "   ", "{}"])
def test_photo_accepts_absent_or_empty_draft(fake_provider, draft):
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwC"
        "AAAAC0lEQVR42mP8/x8AAwMCAO+jA1cAAAAASUVORK5CYII="
    )
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/assistant/extract-image",
            files={"file": ("test.png", png, "image/png")},
            data={} if draft is None else {"draft": draft},
        )
    assert response.status_code == 200


def test_photo_rejects_invalid_draft_before_provider(fake_provider):
    png = b"\x89PNG\r\n\x1a\n" + b"test"
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/assistant/extract-image",
            files={"file": ("test.png", png, "image/png")},
            data={"draft": "string"},
        )
    assert response.status_code == 422
    fake_provider.models.generate_content.assert_not_called()
