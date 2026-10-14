from unittest.mock import patch
from fastapi.testclient import TestClient
from desktop.runtime import create_app

def test_readiness_does_not_contact_ollama_and_is_still_authenticated(tmp_path):
    web=tmp_path/'web';web.mkdir();(web/'index.html').write_text('test')
    token='a'*64
    with patch('desktop.runtime.OllamaClient') as ollama:
        app=create_app(tmp_path/'data',web,token)
        with TestClient(app,base_url='http://127.0.0.1:8766') as client:
            assert client.get('/api/ready').status_code==403
            assert client.get('/api/ready',headers={'X-Lecture-Token':token}).json()=={'ready':True}
            assert client.get('/api/ready',headers={'X-Lecture-Token':token,'Origin':'https://example.com'}).status_code==403
        ollama.return_value.is_ready.assert_not_called()
        ollama.return_value.list_models.assert_not_called()
