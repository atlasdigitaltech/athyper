"""Real fixture requests; Python standard library only. No health-only qualification.
Usage: python qualify-services.py http://internal-renderer:3000 http://internal-tika:9998
Run from a trusted network; no credentials or permanent document URLs are emitted.
"""
import json
import pathlib
import sys
import time
import urllib.request
import urllib.error
import uuid

fixtures = pathlib.Path(__file__).parent / "fixtures"
renderer, parser = sys.argv[1:3]

def render(file, media, rendition, expected=200):
    boundary = uuid.uuid4().hex
    fields = {"sourceContentType": media, "renditionCode": rendition, "specificationHash": "0" * 64}
    body = b""
    for name, value in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
    body += f'--{boundary}\r\nContent-Disposition: form-data; name="content"; filename="fixture"\r\nContent-Type: {media}\r\n\r\n'.encode() + file.read_bytes() + f'\r\n--{boundary}--\r\n'.encode()
    request = urllib.request.Request(renderer + "/render", data=body, headers={"Content-Type": "multipart/form-data; boundary=" + boundary})
    started = time.monotonic()
    try:
        response = urllib.request.urlopen(request, timeout=35)
    except urllib.error.HTTPError as error:
        response = error
    assert response.code == expected, (file.name, response.code)
    value = json.loads(response.read(15 * 1024**2))
    if expected == 200:
        import base64
        output = base64.b64decode(value["bytes"], validate=True)
        assert (value["contentType"] == "application/pdf" and output.startswith(b"%PDF-")) or (value["contentType"] == "image/webp" and output[:4] == b"RIFF" and output[8:12] == b"WEBP")
    else:
        assert value.get("skipped")
    print(json.dumps({"fixture": file.name, "rendition": rendition, "status": response.code, "ms": round((time.monotonic()-started)*1000)}))

for file, media in [("clean-text.pdf", "application/pdf"), ("clean-ocr.png", "image/png")]:
    for rendition in ["thumbnail_sm", "preview_default"]:
        render(fixtures / file, media, rendition)
for file in ["encrypted.pdf", "over-page-limit.pdf"]:
    render(fixtures / file, "application/pdf", "preview_default", 422)
render(fixtures / "clean-text.pdf", "application/msword", "preview_default", 422)
for file, media in [("clean-text.pdf", "application/pdf"), ("clean-ocr.png", "image/png"), ("over-page-limit.pdf", "application/pdf")]:
    started = time.monotonic()
    request = urllib.request.Request(parser + "/tika", method="PUT", data=(fixtures / file).read_bytes(), headers={"Content-Type": media, "Accept": "text/plain"})
    response = urllib.request.urlopen(request, timeout=40)
    value = response.read(800001).decode().replace("\\_", "_")
    assert len(value) < 800000
    if file != "clean-ocr.png":
        assert "CA09" in value
    if file == "over-page-limit.pdf":
        assert "PAGE_20_END" in value and "PAGE_21_END" not in value
    if file == "clean-ocr.png":
        # Tesseract may recognize the synthetic zero as the letter O. Check
        # the unambiguous phrase rather than treating OCR as exact transcription.
        assert "CLEAN OCR FIXTURE" in value
    print(json.dumps({"fixture":file,"extraction":"passed","ms":round((time.monotonic()-started)*1000)}))
