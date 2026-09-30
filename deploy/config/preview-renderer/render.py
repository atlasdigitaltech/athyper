"""One bounded process per untrusted render; no URL or filesystem source inputs."""
import base64
import io
import json
import resource
import sys
import warnings
from importlib.metadata import version
from PIL import Image, ImageOps
import pypdfium2 as pdfium

resource.setrlimit(resource.RLIMIT_CPU, (20, 20))
resource.setrlimit(resource.RLIMIT_AS, (768 * 1024**2, 768 * 1024**2))
Image.MAX_IMAGE_PIXELS = 20_000_000
warnings.simplefilter("error", Image.DecompressionBombWarning)
MAX_PAGES = 20


def render(request):
    data = base64.b64decode(request["bytes"], validate=True)
    if not 0 < len(data) <= 20 * 1024**2:
        raise ValueError("input_limit")
    code = request["renditionCode"]
    edge = {"thumbnail_sm": 256, "thumbnail_md": 768, "page_preview": 1440, "preview_default": 1440}.get(code)
    if not edge:
        raise ValueError("unsupported_rendition")
    media = request["sourceContentType"]
    pages = []
    if media == "application/pdf":
        with pdfium.PdfDocument(data) as doc:
            if pdfium.raw.FPDF_GetSecurityHandlerRevision(doc.raw) >= 0:
                raise ValueError("encrypted_pdf_unsupported")
            if not 0 < len(doc) <= MAX_PAGES:
                raise ValueError("page_limit")
            for i in range(len(doc) if code == "preview_default" else 1):
                page = doc[i]
                try:
                    width, height = page.get_size()
                    if min(width, height) <= 0:
                        raise ValueError("invalid_page")
                    bitmap = page.render(scale=min(edge / max(width, height), 2), draw_annots=False)
                    try:
                        pages.append(bitmap.to_pil().convert("RGB"))
                    finally:
                        bitmap.close()
                finally:
                    page.close()
    elif media in ("image/png", "image/jpeg", "image/webp"):
        with Image.open(io.BytesIO(data), formats=["PNG", "JPEG", "WEBP"]) as source:
            if Image.MIME.get(source.format) != media:
                raise ValueError("media_mismatch")
            image = ImageOps.exif_transpose(source).convert("RGB")
            image.thumbnail((edge, edge))
            pages.append(image)
    else:
        raise ValueError("unsupported_media_type")
    output = io.BytesIO()
    if code == "preview_default":
        # Raster-only PDF contains no source scripts, links, forms or embedded files.
        pages[0].save(output, "PDF", save_all=True, append_images=pages[1:])
        content_type = "application/pdf"
    else:
        pages[0].save(output, "WEBP", quality=85)
        content_type = "image/webp"
    if output.tell() > 10 * 1024**2:
        raise ValueError("output_limit")
    return dict(bytes=base64.b64encode(output.getvalue()).decode(), contentType=content_type,
                width=pages[0].width, height=pages[0].height, pageNumber=1,
                provider="athyper-pdfium-pillow", providerVersion=f"1/pdfium-{version('pypdfium2')}/pillow-{version('Pillow')}", durationMs=0)

if __name__ == "__main__":
    try:
        print(json.dumps(render(json.load(sys.stdin))))
    except Exception:
        # Do not echo untrusted document data or parser internals.
        print(json.dumps({"skipped": True, "code": "UNSUPPORTED_OR_INVALID_DOCUMENT"}))
        sys.exit(2)
