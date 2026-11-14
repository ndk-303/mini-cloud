import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
import app as backend


class BlogCursor:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        pass

    def execute(self, query, params):
        # PyMySQL formats placeholders with Python's percent operator.
        query % params

    def fetchone(self):
        return {"id": 1, "title": "Demo", "updated_at": "2026-11-14T00:00:00Z"}


class BlogConnection:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        pass

    def cursor(self):
        return BlogCursor()


def test_blog_detail_accepts_parameterized_date_format_query(monkeypatch):
    monkeypatch.setattr(backend, "get_db", BlogConnection)
    response = backend.app.test_client().get("/blogs/1")
    assert response.status_code == 200
    assert response.get_json()["id"] == 1
