# test_api.py
# FastAPI unit testing suite for the Computzone menu lookup endpoints

import sys
import os
from fastapi.testclient import TestClient

# Add project root to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from server import app

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_find_menu_rule_match_parts():
    # "부품" should trigger the "컴퓨터 부품" menu mapping
    response = client.post("/api/find-menu", json={"utterance": "컴퓨터 부품 사고 싶어요"})
    assert response.status_code == 200
    data = response.json()
    assert data["matched"] is True
    assert len(data["menus"]) >= 1
    assert any(m["name"] == "컴퓨터 부품" for m in data["menus"])

def test_find_menu_rule_match_software():
    # "윈도우" should trigger the "소프트웨어" menu mapping
    response = client.post("/api/find-menu", json={"utterance": "윈도우 정품 라이선스 가격"})
    assert response.status_code == 200
    data = response.json()
    assert data["matched"] is True
    assert any(m["name"] == "소프트웨어" for m in data["menus"])

def test_find_menu_fallback():
    # An unrecognized input should fall back gracefully
    response = client.post("/api/find-menu", json={"utterance": "xyz123abcqwe"})
    assert response.status_code == 200
    data = response.json()
    if data["matched"] is False:
        assert "action" in data
        assert data["action"] == "route_to_consult"

if __name__ == "__main__":
    print("Running FastAPI API endpoint test suite...")
    test_health_check()
    print("✓ test_health_check passed!")
    test_find_menu_rule_match_parts()
    print("✓ test_find_menu_rule_match_parts passed!")
    test_find_menu_rule_match_software()
    print("✓ test_find_menu_rule_match_software passed!")
    test_find_menu_fallback()
    print("✓ test_find_menu_fallback passed!")
    print("All unit tests passed successfully!")
