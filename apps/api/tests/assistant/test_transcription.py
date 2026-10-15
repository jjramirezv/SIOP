"""Offline transcription and provider-failure checks: never call Gemini."""
import io
import json
from types import SimpleNamespace
from unittest.mock import MagicMock
import wave

from fastapi.testclient import TestClient
from google.genai import errors
import httpx
from pydantic import SecretStr
import pytest

from app.main import app
from app.routes import assistant as routes
from app.services import assistant_service as provider
from app.services.audio_validation import audio_mime


@pytest.fixture
def recording():
    stream = io.BytesIO()
    with wave.open(stream, 'wb') as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(16000)
        writer.writeframes(b'\x00\x00' * 1600)
    return stream.getvalue()


@pytest.fixture(autouse=True)
def fake_gemini(monkeypatch):
    client = MagicMock()
    client.__enter__.return_value = client
    client.models.generate_content.return_value = SimpleNamespace(text=json.dumps({
        'text': 'Vendo 200 cuadernos al mes.', 'language': 'es',
    }))
    monkeypatch.setattr(provider.genai, 'Client', lambda **kwargs: client)
    monkeypatch.setattr(provider, 'get_settings', lambda: SimpleNamespace(
        gemini_api_key=SecretStr('test-only'), gemini_text_model='test-model',
    ))
    return client


def upload(data, filename='grabacion.wav', mime='audio/wav'):
    with TestClient(app) as client:
        return client.post('/api/v1/assistant/transcribe', files={
            'file': (filename, data, mime),
        })


def test_transcription_returns_editable_text(recording, fake_gemini):
    response = upload(recording)
    assert response.status_code == 200
    assert response.json() == {'text': 'Vendo 200 cuadernos al mes.', 'language': 'es'}
    kwargs = fake_gemini.models.generate_content.call_args.kwargs
    audio = kwargs['contents'][0].parts[-1].inline_data
    assert audio.mime_type == 'audio/wav'
    assert audio.data == recording
    assert 'transcripción literal' in kwargs['config'].system_instruction
    fake_gemini.__exit__.assert_called_once()


@pytest.mark.parametrize('mime', ['audio/webm;codecs=opus', 'audio/webm; codecs=opus', 'video/webm'])
def test_browser_webm_mime_parameters_are_accepted(mime, fake_gemini):
    # Container header sample: recognition is separate from provider decoding.
    data = b'\x1a\x45\xdf\xa3' + b'webm\x00A_OPUS\x00'
    response = upload(data, 'grabacion.webm', mime)
    assert response.status_code == 200
    part = fake_gemini.models.generate_content.call_args.kwargs['contents'][0].parts[-1]
    assert part.inline_data.mime_type == 'audio/webm'


@pytest.mark.parametrize('mime', ['audio/mp4', 'audio/x-m4a', 'audio/m4a', 'video/mp4'])
def test_m4a_aliases_are_normalized(mime):
    data = b'\x00\x00\x00\x18ftypM4A \x00\x00\x00\x00M4A mp42' + b'soun'
    assert audio_mime(data, mime) == 'audio/m4a'


def test_mp3_with_mpeg_layer_three_header_is_recognized():
    assert audio_mime(b'\xff\xfb\x90\x64' + b'\x00' * 500, 'audio/mpeg') == 'audio/mpeg'


@pytest.mark.parametrize('data,filename,mime,status', [
    (b'', 'empty.wav', 'audio/wav', 422),
    (b'not audio', 'fake.mp3', 'audio/mpeg', 415),
    (b'\x89PNG\r\n\x1a\n', 'fake.wav', 'audio/wav', 415),
    (b'RIFF\x00\x00\x00\x00WAVE', 'broken.wav', 'audio/wav', 422),
    (b'\x1a\x45\xdf\xa3webmvideo', 'video.webm', 'video/webm', 422),
    (b'\x00\x00\x00\x18ftypM4A \x00\x00\x00\x00M4A mp42', 'video.mp4', 'video/mp4', 422),
])
def test_invalid_uploads_do_not_reach_gemini(data, filename, mime, status, fake_gemini):
    response = upload(data, filename, mime)
    assert response.status_code == status
    assert response.json()['error']['details'][0]['field'] == 'file'
    fake_gemini.models.generate_content.assert_not_called()


def test_mismatched_mime_is_rejected(recording, fake_gemini):
    response = upload(recording, mime='audio/mpeg')
    assert response.status_code == 415
    fake_gemini.models.generate_content.assert_not_called()


def test_generic_binary_mime_is_detected_from_content(recording):
    assert upload(recording, mime='application/octet-stream').status_code == 200


def test_oversized_recording_is_rejected_before_provider(monkeypatch, fake_gemini):
    monkeypatch.setattr(routes, 'MAX_AUDIO_BYTES', 16)
    assert upload(b'0' * 17).status_code == 413
    fake_gemini.models.generate_content.assert_not_called()


def test_missing_file_is_a_controlled_validation_error(fake_gemini):
    with TestClient(app) as client:
        response = client.post('/api/v1/assistant/transcribe')
    assert response.status_code == 422
    assert response.json()['error']['code'] == 'VALIDATION_ERROR'
    fake_gemini.models.generate_content.assert_not_called()


@pytest.mark.parametrize('text', ['', '   ', '[inaudible]', '[silencio]', '[ruido]'])
def test_unintelligible_recording_is_reported_for_retry(text, recording, fake_gemini):
    fake_gemini.models.generate_content.return_value.text = json.dumps({'text': text, 'language': None})
    response = upload(recording)
    assert response.status_code == 422
    assert 'voz comprensible' in response.json()['error']['message']


def test_long_transcript_cannot_overflow_message_input(recording, fake_gemini):
    fake_gemini.models.generate_content.return_value.text = json.dumps({'text': 'a' * 4001, 'language': 'es'})
    assert upload(recording).status_code == 422


@pytest.mark.parametrize('raw', ['not json', '{}', '{"text": 42}', '{"text": "hola", "extra": 1}'])
def test_invalid_provider_output_does_not_escape_contract(raw, recording, fake_gemini):
    fake_gemini.models.generate_content.return_value.text = raw
    response = upload(recording)
    assert response.status_code == 502
    assert response.json()['error']['code'] == 'UPSTREAM_ERROR'


def test_empty_provider_response_is_controlled(recording, fake_gemini):
    fake_gemini.models.generate_content.return_value.text = None
    assert upload(recording).status_code == 502


@pytest.mark.parametrize('provider_status,http_status,code', [
    (400, 502, 'UPSTREAM_ERROR'),
    (401, 503, 'ASSISTANT_UNAVAILABLE'),
    (403, 503, 'ASSISTANT_UNAVAILABLE'),
    (404, 502, 'UPSTREAM_ERROR'),
    (429, 503, 'ASSISTANT_UNAVAILABLE'),
    (500, 502, 'UPSTREAM_ERROR'),
    (408, 504, 'UPSTREAM_TIMEOUT'),
    (504, 504, 'UPSTREAM_TIMEOUT'),
])
def test_provider_errors_are_controlled(provider_status, http_status, code, recording, fake_gemini, caplog):
    fake_gemini.models.generate_content.side_effect = errors.APIError(
        provider_status, {'error': {'message': 'Rejected key test-only', 'status': 'TEST'}},
    )
    response = upload(recording)
    assert response.status_code == http_status
    assert response.json()['error']['code'] == code
    assert 'test-only' not in response.text
    assert 'test-only' not in caplog.text


@pytest.mark.parametrize('failure,status,code', [
    (httpx.ReadTimeout('test timeout'), 504, 'UPSTREAM_TIMEOUT'),
    (httpx.ConnectError('test network'), 502, 'UPSTREAM_ERROR'),
])
def test_transport_failures_are_controlled(failure, status, code, recording, fake_gemini):
    fake_gemini.models.generate_content.side_effect = failure
    response = upload(recording)
    assert response.status_code == status
    assert response.json()['error']['code'] == code


def test_transcription_needs_provider_configuration(recording, fake_gemini, monkeypatch):
    monkeypatch.setattr(provider, 'get_settings', lambda: SimpleNamespace(
        gemini_api_key=None, gemini_text_model='',
    ))
    assert upload(recording).status_code == 503
    fake_gemini.models.generate_content.assert_not_called()


def test_reviewed_transcript_can_continue_to_existing_assistant(recording, fake_gemini):
    transcript = upload(recording).json()['text']
    fake_gemini.models.generate_content.return_value.text = json.dumps({
        'contract_version': '1.0.0', 'data_source': 'assistant',
        'message': 'Indica el costo por pedido y los tramos de precios.',
        'action': 'clarify', 'proposed_input': {
            'demand': {'value': 200, 'period': 'month'},
        },
        'missing_fields': [{'field': 'order_cost', 'message': 'Indica el costo por pedido.'}],
        'review_fields': [], 'requires_confirmation': True,
    })
    with TestClient(app) as client:
        response = client.post('/api/v1/assistant/messages', json={'message': transcript})
    assert response.status_code == 200
    assert response.json()['proposed_input']['demand'] == {'value': 200.0, 'period': 'month'}
    assert response.json()['requires_confirmation'] is True
