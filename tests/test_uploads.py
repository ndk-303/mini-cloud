import io
import sys
from pathlib import Path

from botocore.exceptions import ClientError
from botocore.response import StreamingBody

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
import app as backend


class MemoryS3:
    def __init__(self):
        self.objects = {}

    def head_bucket(self, Bucket):
        return {}

    def upload_fileobj(self, fileobj, bucket, key, ExtraArgs):
        self.objects[(bucket, key)] = (fileobj.read(), ExtraArgs["ContentType"])

    def get_object(self, Bucket, Key):
        item = self.objects.get((Bucket, Key))
        if item is None:
            raise ClientError({"Error": {"Code": "NoSuchKey", "Message": "missing"}}, "GetObject")
        content, content_type = item
        return {
            "Body": StreamingBody(io.BytesIO(content), len(content)),
            "ContentType": content_type,
            "ContentLength": len(content),
        }


def test_uploaded_image_is_readable_from_same_origin(monkeypatch):
    s3 = MemoryS3()
    monkeypatch.setattr(backend, "get_s3", lambda: s3)
    monkeypatch.setattr(backend, "_decode_token", lambda: ({"preferred_username": "SV001"}, None))
    client = backend.app.test_client()

    uploaded = client.post(
        "/upload",
        data={"file": (io.BytesIO(b"demo-image"), "demo image.png", "image/png")},
        headers={"Authorization": "Bearer demo"},
    )

    assert uploaded.status_code == 200
    url = uploaded.get_json()["url"]
    assert url.startswith("/api/uploads/blog/")
    image = client.get(url.removeprefix("/api"))
    assert image.status_code == 200
    assert image.data == b"demo-image"
    assert image.content_type == "image/png"


def test_missing_uploaded_image_returns_404(monkeypatch):
    monkeypatch.setattr(backend, "get_s3", MemoryS3)
    response = backend.app.test_client().get("/uploads/blog/does-not-exist.png")
    assert response.status_code == 404
